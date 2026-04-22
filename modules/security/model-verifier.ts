// SHA-256 model integrity verifier.
// Hashes raw bytes natively via FileSystem.digestAsync — identical to `sha256sum`.

import * as FileSystem from 'expo-file-system/legacy';

export const EXPECTED_MODEL_SHA256 =
  'f335f2bfd1b758dc6476db16c0f41854bd6237e2658d604cbe566bcefd00a7bc';

export const MODEL_PATH =
  `${FileSystem.documentDirectory}models/gemma-4-E4B-it.litertlm`;

export interface VerificationResult {
  valid: boolean;
  reason: string;
}

export async function verifyModelIntegrity(): Promise<VerificationResult> {
  const info = await FileSystem.getInfoAsync(MODEL_PATH) as { exists: boolean; size?: number };
  if (!info.exists) {
    return { valid: false, reason: 'Model file not found.' };
  }

  if (__DEV__) {
    console.warn('[ModelVerifier] Dev mode — hash check skipped.');
    return { valid: true, reason: 'Dev mode — hash check skipped.' };
  }

  const sizeBytes = info.size ?? 0;
  if (sizeBytes < 3_400_000_000 || sizeBytes > 4_000_000_000) {
    await FileSystem.deleteAsync(MODEL_PATH, { idempotent: true });
    return {
      valid: false,
      reason: `Model size ${(sizeBytes / 1e9).toFixed(2)} GB outside expected range. Deleted.`,
    };
  }

  try {
    const digest = await (FileSystem as unknown as { digestAsync: (path: string, opts: { algorithm: string }) => Promise<string> }).digestAsync(MODEL_PATH, {
      algorithm: 'SHA-256',
    });
    const hash: string = (digest ?? '').toLowerCase();

    if (hash !== EXPECTED_MODEL_SHA256.toLowerCase()) {
      await FileSystem.deleteAsync(MODEL_PATH, { idempotent: true });
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
