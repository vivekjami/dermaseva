/**
 * litert.ts — Production on-device LLM inference via expo-llm-mediapipe
 * Uses Google MediaPipe LLM Inference API running Gemma 3 1B (1.2 GB)
 * Fully offline after first model download. No data leaves the device.
 */

import ExpoLlmMediapipe from 'expo-llm-mediapipe';
import type {
  DownloadProgressEvent,
  DownloadOptions,
} from 'expo-llm-mediapipe';
import { verifyModelIntegrity } from '@/modules/security/model-verifier';

// ─── Constants ────────────────────────────────────────────────────────────────

export const MODEL_NAME = 'gemma3-1b-it-cpu-int4.task';
export const MODEL_DOWNLOAD_URL =
  'https://huggingface.co/t-ghosh/gemma-tflite/resolve/main/gemma3-1b-it-cpu-int4.task';
export const MODEL_SIZE_BYTES = 1_200_000_000; // ~1.2 GB

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InferenceInput {
  imagePath: string;
  prompt: string;
}

export interface InferenceOutput {
  rawText: string;
  inferenceTimeMs: number;
}

export interface DownloadProgress {
  bytesDownloaded: number;
  totalBytes: number;
  percentage: number;
}

// ─── Model file management ────────────────────────────────────────────────────

export async function isModelDownloaded(): Promise<boolean> {
  return ExpoLlmMediapipe.isModelDownloaded(MODEL_NAME);
}

/**
 * Downloads Gemma 3 1B via expo-llm-mediapipe's native downloader.
 * Handles resume, progress events, and SHA verification internally.
 */
export async function downloadModel(
  onProgress: (progress: DownloadProgress) => void
): Promise<boolean> {
  // Subscribe to native download progress events
  const sub = ExpoLlmMediapipe.addListener(
    'downloadProgress',
    (event: DownloadProgressEvent) => {
      if (event.modelName !== MODEL_NAME) return;
      if (
        event.bytesDownloaded !== undefined &&
        event.totalBytes !== undefined
      ) {
        onProgress({
          bytesDownloaded: event.bytesDownloaded,
          totalBytes: event.totalBytes,
          percentage: Math.round(
            (event.bytesDownloaded / event.totalBytes) * 100
          ),
        });
      }
    }
  );

  try {
    const options: DownloadOptions = { overwrite: false };
    const success = await ExpoLlmMediapipe.downloadModel(
      MODEL_DOWNLOAD_URL,
      MODEL_NAME,
      options
    );
    return success;
  } finally {
    sub.remove();
  }
}

// ─── Engine ───────────────────────────────────────────────────────────────────

let _modelHandle: number | null = null;
let _requestId = 0;

/**
 * Loads the model into memory using its stored name.
 * Returns true on success, false if model missing or integrity check fails.
 */
export async function loadModel(): Promise<boolean> {
  if (_modelHandle !== null) return true;

  const downloaded = await isModelDownloaded();
  if (!downloaded) return false;

  // SHA-256 integrity check via model-verifier
  const verification = await verifyModelIntegrity();
  if (!verification.valid) {
    console.error('[LiteRT] Integrity check failed:', verification.reason);
    return false;
  }

  try {
    _modelHandle = await ExpoLlmMediapipe.createModelFromDownloaded(
      MODEL_NAME,
      512,   // maxTokens
      40,    // topK
      0.1,   // temperature — low for deterministic medical outputs
      42     // randomSeed
    );
    return true;
  } catch (e: unknown) {
    console.error('[LiteRT] loadModel failed:', (e as Error).message);
    _modelHandle = null;
    return false;
  }
}

/**
 * Runs inference. Throws if engine not loaded — caller must check loadModel().
 */
export async function runInference(
  input: InferenceInput
): Promise<InferenceOutput> {
  if (_modelHandle === null) {
    throw new Error('[LiteRT] Engine not ready. Call loadModel() first.');
  }

  const reqId = ++_requestId;
  const start = Date.now();

  const rawText = await ExpoLlmMediapipe.generateResponse(
    _modelHandle,
    reqId,
    input.prompt
  );

  return { rawText, inferenceTimeMs: Date.now() - start };
}

/**
 * Releases the model from RAM. Call on screen unmount to free memory.
 */
export async function unloadModel(): Promise<void> {
  if (_modelHandle !== null) {
    try {
      await ExpoLlmMediapipe.releaseModel(_modelHandle);
    } catch (_) {}
    _modelHandle = null;
  }
}

// ─── Mock fallback — DEV ONLY ─────────────────────────────────────────────────

const MOCKS = [
  {
    condition: 'Ringworm (Tinea corporis)',
    confidence: 0.82,
    severity: 'mild',
    otc: 'Apply Clotrimazole 1% cream twice daily for 2–4 weeks.',
  },
  { condition: 'Contact Dermatitis', confidence: 0.74, severity: 'moderate', otc: null },
  {
    condition: 'Scabies',
    confidence: 0.79,
    severity: 'mild',
    otc: 'Apply Permethrin 5% cream overnight. Treat all household contacts.',
  },
];

export function runMockInference(_ignored: InferenceInput): InferenceOutput {
  const m = MOCKS[Math.floor(Math.random() * MOCKS.length)];
  const severity = m.severity as 'mild' | 'moderate' | 'severe';
  return {
    rawText: JSON.stringify({
      conditionName: m.condition,
      confidence: m.confidence,
      severity,
      keySigns: ['Circular lesion', 'Scaling at edges', 'Itching reported'],
      otcSuggestion: severity === 'mild' ? m.otc : null,
      doctorReferral:
        severity === 'mild'
          ? 'Monitor 2 weeks. Visit PHC if no improvement.'
          : 'Visit your nearest PHC within 24 hours.',
      needsUrgentReferral: severity === 'severe',
    }),
    inferenceTimeMs: 320 + Math.floor(Math.random() * 200),
  };
}
