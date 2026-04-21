import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

// ── Constants ─────────────────────────────────────────────────────────────────
export const MODEL_DIR = FileSystem.documentDirectory + 'models/';
export const MODEL_FILENAME = 'gemma4-e4b.tflite';
export const MODEL_PATH = MODEL_DIR + MODEL_FILENAME;

// Replace with your actual CDN URL and computed SHA-256 before production
export const MODEL_CDN_URL = 'https://your-cdn.example.com/models/gemma4-e4b.tflite';
export const MODEL_SHA256 = 'REPLACE_WITH_ACTUAL_SHA256_HASH_BEFORE_PRODUCTION';

export type ModelStatus =
  | 'not_downloaded'
  | 'downloading'
  | 'verifying'
  | 'ready'
  | 'error';

export interface DownloadProgress {
  status: ModelStatus;
  progress: number;       // 0–100
  errorMessage?: string;
}

// ── Model presence check ──────────────────────────────────────────────────────
export async function isModelDownloaded(): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(MODEL_PATH);
    return info.exists;
  } catch {
    return false;
  }
}

// ── SHA-256 checksum verification ─────────────────────────────────────────────
// Reads the file as base64, computes SHA-256 using Web Crypto API (available in
// React Native Hermes via the global crypto object).
export async function verifyModelChecksum(): Promise<boolean> {
  if (MODEL_SHA256 === 'REPLACE_WITH_ACTUAL_SHA256_HASH_BEFORE_PRODUCTION') {
    // Skip verification in dev mode — hash not yet set
    console.warn('[LiteRT] SHA-256 hash not configured — skipping checksum verify');
    return true;
  }
  try {
    const base64 = await FileSystem.readAsStringAsync(MODEL_PATH, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const binary = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const hashBuffer = await crypto.subtle.digest('SHA-256', binary);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    return hashHex === (MODEL_SHA256 as string).toLowerCase();
  } catch (e) {
    console.error('[LiteRT] Checksum verification failed:', e);
    return false;
  }
}

// ── Model downloader ──────────────────────────────────────────────────────────
export async function downloadModel(
  onProgress: (p: DownloadProgress) => void
): Promise<boolean> {
  try {
    onProgress({ status: 'downloading', progress: 0 });

    // Ensure models directory exists
    await FileSystem.makeDirectoryAsync(MODEL_DIR, { intermediates: true });

    const downloadResumable = FileSystem.createDownloadResumable(
      MODEL_CDN_URL,
      MODEL_PATH,
      {},
      (downloadProgress) => {
        const pct = Math.round(
          (downloadProgress.totalBytesWritten /
            downloadProgress.totalBytesExpectedToWrite) *
            100
        );
        onProgress({ status: 'downloading', progress: pct });
      }
    );

    const result = await downloadResumable.downloadAsync();
    if (!result?.uri) {
      onProgress({ status: 'error', progress: 0, errorMessage: 'Download failed — no URI returned' });
      return false;
    }

    // Verify checksum after download
    onProgress({ status: 'verifying', progress: 100 });
    const valid = await verifyModelChecksum();
    if (!valid) {
      // Delete tampered/corrupted file
      await FileSystem.deleteAsync(MODEL_PATH, { idempotent: true });
      onProgress({
        status: 'error',
        progress: 0,
        errorMessage: 'Model file failed integrity check. Please try again.',
      });
      return false;
    }

    onProgress({ status: 'ready', progress: 100 });
    return true;
  } catch (e: any) {
    onProgress({
      status: 'error',
      progress: 0,
      errorMessage: e?.message ?? 'Unknown download error',
    });
    return false;
  }
}

// ── Inference runner (mock for Phase 4 — real LiteRT binding wired in Phase 4.5) ──
// When the actual @mediapipe/tasks-genai or react-native-litert package is
// available and installed, replace this mock with the real inference call.
export interface InferenceInput {
  imagePath: string;
  prompt: string;
}

export interface InferenceOutput {
  rawText: string;
  inferenceTimeMs: number;
}

let _modelLoaded = false;

export async function loadModel(): Promise<boolean> {
  if (_modelLoaded) return true;

  // DEV MODE: skip model file check so mock inference works without downloading
  // the 3.5GB model. Remove this flag when wiring real LiteRT in production.
  const DEV_MOCK_MODE = true;
  if (!DEV_MOCK_MODE) {
    const exists = await isModelDownloaded();
    if (!exists) return false;
  }

  _modelLoaded = true;
  console.log('[LiteRT] Model loaded (mock mode)');
  return true;
}

export async function runInference(input: InferenceInput): Promise<InferenceOutput> {
  const start = Date.now();

  // ── MOCK RESPONSE ─────────────────────────────────────────────────────────
  // Replace the block below with the real interpreter.runAsync() call.
  // The mock simulates a 2-second inference delay and returns valid JSON.
  await new Promise((r) => setTimeout(r, 2000));

  const mockRaw = JSON.stringify({
    conditionName: 'Tinea corporis (Ringworm)',
    confidence: 0.82,
    severity: 'mild',
    keySigns: ['circular red rash', 'raised scaly border', 'central clearing'],
    otcSuggestion: 'Apply Clotrimazole 1% cream twice daily for 2–4 weeks. Keep area clean and dry.',
    doctorReferral: 'If no improvement in 2 weeks or rash spreads, visit the nearest PHC.',
    needsUrgentReferral: false,
  });
  // ─────────────────────────────────────────────────────────────────────────

  return {
    rawText: mockRaw,
    inferenceTimeMs: Date.now() - start,
  };
}
