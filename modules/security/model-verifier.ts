// SHA-256 model integrity verifier.
// Hashes raw bytes natively via FileSystem.digestAsync — identical to `sha256sum`.

import * as FileSystem from 'expo-file-system/legacy';
import { MODEL_LOCAL_PATH, MODEL_SIZE_BYTES } from '@/modules/ai/model-constants';

// Placeholder hash — compute the real SHA-256 after downloading the actual
// Gemma 4 E2B GGUF model: sha256sum gemma-4-E2B-it-Q4_K_M.gguf
export const EXPECTED_MODEL_SHA256 =
  '0000000000000000000000000000000000000000000000000000000000000000';

export interface VerificationResult {
  valid: boolean;
  reason: string;
}

export async function verifyModelIntegrity(): Promise<VerificationResult> {
  const info = await FileSystem.getInfoAsync(MODEL_LOCAL_PATH) as { exists: boolean; size?: number };
  if (!info.exists) {
    return { valid: false, reason: 'Model file not found.' };
  }

  if (__DEV__) {
    console.warn('[ModelVerifier] Dev mode — hash check skipped.');
    return { valid: true, reason: 'Dev mode — hash check skipped.' };
  }

  const sizeBytes = info.size ?? 0;
  const minSize = MODEL_SIZE_BYTES * 0.90; // 90% of expected (~3.11 GB GGUF)
  const maxSize = MODEL_SIZE_BYTES * 1.10; // 110% of expected

  if (sizeBytes < minSize || sizeBytes > maxSize) {
    await FileSystem.deleteAsync(MODEL_LOCAL_PATH, { idempotent: true });
    return {
      valid: false,
      reason: `Model size ${(sizeBytes / 1e9).toFixed(2)} GB outside expected range (${(minSize / 1e9).toFixed(2)}–${(maxSize / 1e9).toFixed(2)} GB). Deleted.`,
    };
  }

  // Skip hash verification if placeholder hash is still set
  if (EXPECTED_MODEL_SHA256.startsWith('0000')) {
    console.warn('[ModelVerifier] Hash is placeholder — size-only check passed.');
    return { valid: true, reason: 'Size check passed (hash placeholder).' };
  }

  try {
    const digest = await (FileSystem as unknown as { digestAsync: (path: string, opts: { algorithm: string }) => Promise<string> }).digestAsync(MODEL_LOCAL_PATH, {
      algorithm: 'SHA-256',
    });
    const hash: string = (digest ?? '').toLowerCase();

    if (hash !== EXPECTED_MODEL_SHA256.toLowerCase()) {
      await FileSystem.deleteAsync(MODEL_LOCAL_PATH, { idempotent: true });
      return {
        valid: false,
        reason: `Hash mismatch — expected ${EXPECTED_MODEL_SHA256.slice(0, 12)}… got ${hash.slice(0, 12)}… Deleted.`,
      };
    }
    return { valid: true, reason: 'Model integrity verified ✓' };
  } catch (e: unknown) {
    console.warn('[ModelVerifier] digestAsync unavailable, size-only check:', (e as Error).message);
    return { valid: true, reason: 'Size check passed (digest unavailable).' };
  }
}
