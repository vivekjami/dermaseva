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

  // Symptom-driven mock — maps keywords in the prompt to realistic responses.
  // Replace this entire block with the real LiteRT interpreter call in production.
  const promptLower = input.prompt.toLowerCase();

  let mockRaw: string;

  if (promptLower.includes('scabies') || promptLower.includes('itching') || promptLower.includes('burrow') || promptLower.includes('mite')) {
    mockRaw = JSON.stringify({
      conditionName: 'Scabies',
      confidence: 0.79,
      severity: 'mild',
      keySigns: ['intense nocturnal itching', 'linear burrow tracks', 'papules between fingers and wrists'],
      otcSuggestion: 'Apply Permethrin 5% cream to entire body from neck down overnight. Treat all household contacts simultaneously. Wash clothing and bedding at 60°C.',
      doctorReferral: 'If itching persists after treatment or spreads to new household members, visit PHC.',
      needsUrgentReferral: false,
    });
  } else if (promptLower.includes('fungal') || promptLower.includes('ring') || promptLower.includes('tinea') || promptLower.includes('circular')) {
    mockRaw = JSON.stringify({
      conditionName: 'Tinea corporis (Ringworm)',
      confidence: 0.84,
      severity: 'mild',
      keySigns: ['circular red rash with central clearing', 'raised scaly border', 'spreads outward'],
      otcSuggestion: 'Apply Clotrimazole 1% cream twice daily for 2–4 weeks. Keep area clean and dry.',
      doctorReferral: 'If no improvement after 2 weeks or rash spreads significantly, visit the nearest PHC.',
      needsUrgentReferral: false,
    });
  } else if (promptLower.includes('eczema') || promptLower.includes('dry') || promptLower.includes('atopic')) {
    mockRaw = JSON.stringify({
      conditionName: 'Mild Atopic Dermatitis (Eczema)',
      confidence: 0.71,
      severity: 'mild',
      keySigns: ['dry itchy skin patches', 'skin inflammation', 'scratching marks'],
      otcSuggestion: 'Apply fragrance-free moisturizing cream twice daily. Avoid harsh soaps and detergents.',
      doctorReferral: 'If eczema worsens, covers large areas, or shows signs of infection (pus, fever), visit PHC.',
      needsUrgentReferral: false,
    });
  } else if (promptLower.includes('leprosy') || promptLower.includes('numb') || promptLower.includes('sensation')) {
    mockRaw = JSON.stringify({
      conditionName: 'Suspected Leprosy — Refer Immediately',
      confidence: 0.65,
      severity: 'severe',
      keySigns: ['hypopigmented patches', 'loss of skin sensation', 'possible nerve thickening'],
      otcSuggestion: null,
      doctorReferral: 'Refer to PHC immediately for NLEP evaluation. Do NOT attempt any OTC treatment. Leprosy requires multidrug therapy (MDT) under medical supervision.',
      needsUrgentReferral: true,
    });
  } else if (promptLower.includes('heat') || promptLower.includes('prickly') || promptLower.includes('miliaria') || promptLower.includes('sweat')) {
    mockRaw = JSON.stringify({
      conditionName: 'Miliaria (Heat Rash)',
      confidence: 0.88,
      severity: 'mild',
      keySigns: ['small red bumps under clothing areas', 'worse in hot humid weather', 'no burrow tracks'],
      otcSuggestion: 'Keep affected area clean and dry. Use talc-free powder. Wear loose cotton clothing.',
      doctorReferral: 'If rash does not clear within a week or develops blisters, visit PHC.',
      needsUrgentReferral: false,
    });
  } else if (promptLower.includes('contact') || promptLower.includes('dermatitis') || promptLower.includes('irritant') || promptLower.includes('soap')) {
    mockRaw = JSON.stringify({
      conditionName: 'Contact Dermatitis (Mild)',
      confidence: 0.76,
      severity: 'mild',
      keySigns: ['localized redness at contact site', 'itching and skin irritation', 'no spreading beyond contact area'],
      otcSuggestion: 'Apply Calamine lotion for symptom relief. Identify and avoid the irritant (soap, plant, detergent).',
      doctorReferral: 'If blistering develops or rash spreads beyond contact site, visit PHC within 24 hours.',
      needsUrgentReferral: false,
    });
  } else {
    // Default: unknown condition, low confidence, escalate
    mockRaw = JSON.stringify({
      conditionName: 'Unidentified Skin Condition',
      confidence: 0.42,
      severity: 'moderate',
      keySigns: ['abnormal skin appearance', 'requires clinical examination'],
      otcSuggestion: null,
      doctorReferral: 'This condition could not be identified with confidence. Please visit the nearest PHC for a proper examination.',
      needsUrgentReferral: false,
    });
  }
  // ─────────────────────────────────────────────────────────────────────────

  return {
    rawText: mockRaw,
    inferenceTimeMs: Date.now() - start,
  };
}
