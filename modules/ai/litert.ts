/**
 * litert.ts — Production on-device LLM inference via react-native-litert-lm
 * Uses Google LiteRT-LM runtime with Gemma 4 E2B (~2.58 GB)
 * Fully offline after first model download. No data leaves the device.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { verifyModelIntegrity } from '@/modules/security/model-verifier';
import {
  MODEL_NAME, MODEL_DOWNLOAD_URL, MODEL_SIZE_BYTES, MODEL_LOCAL_PATH,
} from '@/modules/ai/model-constants';

// Re-export constants so existing consumers don't break
export { MODEL_NAME, MODEL_DOWNLOAD_URL, MODEL_SIZE_BYTES, MODEL_LOCAL_PATH };

// Short system prompt — keeps token budget for the user message
const SYSTEM_PROMPT =
  'You are DermaSeva, a skin disease screening assistant for rural Indian health workers. Respond ONLY with valid JSON. No markdown, no text outside JSON.';

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

// ─── Native bridge detection ──────────────────────────────────────────────────

let _nativeAvailable: boolean | null = null;

export function isNativeBridgeAvailable(): boolean {
  if (_nativeAvailable !== null) return _nativeAvailable;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-litert-lm');
    _nativeAvailable = typeof mod?.createLLM === 'function';
  } catch {
    _nativeAvailable = false;
  }
  return _nativeAvailable;
}

// ─── Model file management ────────────────────────────────────────────────────

export async function isModelDownloaded(): Promise<boolean> {
  const info = await FileSystem.getInfoAsync(MODEL_LOCAL_PATH);
  return info.exists && (info.size ?? 0) > MODEL_SIZE_BYTES * 0.95;
}

export async function downloadModel(
  onProgress: (progress: DownloadProgress) => void
): Promise<boolean> {
  // Ensure the models/ directory exists
  const modelsDir = `${FileSystem.documentDirectory}models/`;
  const dirInfo = await FileSystem.getInfoAsync(modelsDir);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(modelsDir, { intermediates: true });
  }

  const callback = FileSystem.createDownloadResumable(
    MODEL_DOWNLOAD_URL,
    MODEL_LOCAL_PATH,
    {},
    (downloadProgress) => {
      const { totalBytesWritten, totalBytesExpectedToWrite } = downloadProgress;
      onProgress({
        bytesDownloaded: totalBytesWritten,
        totalBytes: totalBytesExpectedToWrite,
        percentage: Math.round((totalBytesWritten / totalBytesExpectedToWrite) * 100),
      });
    }
  );

  const result = await callback.downloadAsync();
  return result?.status === 200;
}

// ─── Engine ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _llm: any = null;
let _lastError: string = '';

/** Returns the reason loadModel() last returned false — shown on-screen for debugging */
export function getLastModelError(): string {
  return _lastError;
}

export async function loadModel(): Promise<boolean> {
  if (_llm !== null) return true;
  _lastError = '';

  const downloaded = await isModelDownloaded();
  if (!downloaded) {
    _lastError = 'Model file not found or incomplete at: ' + MODEL_LOCAL_PATH;
    console.error('[LiteRT]', _lastError);
    return false;
  }

  const verification = await verifyModelIntegrity();
  if (!verification.valid) {
    _lastError = 'Integrity check failed: ' + verification.reason;
    console.error('[LiteRT]', _lastError);
    return false;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-litert-lm');

    if (typeof mod?.createLLM !== 'function') {
      _lastError = 'react-native-litert-lm loaded but createLLM is not a function. Keys: ' + Object.keys(mod || {}).join(', ');
      console.error('[LiteRT]', _lastError);
      return false;
    }

    // Native LiteRT engine expects a plain filesystem path (no file:// prefix)
    const nativePath = MODEL_LOCAL_PATH.replace(/^file:\/\//, '');

    const modelConfig = {
      maxTokens: 1024,
      topK: 40,
      temperature: 0.1,
      systemPrompt: SYSTEM_PROMPT,
    };

    // Attempt 1: Try with recommended backend (GPU/NPU — faster)
    const recommendedBackend = typeof mod.getRecommendedBackend === 'function'
      ? mod.getRecommendedBackend()
      : undefined;

    try {
      _llm = mod.createLLM();
      await _llm.loadModel(nativePath, {
        ...modelConfig,
        ...(recommendedBackend ? { backend: recommendedBackend } : {}),
      });
      console.warn(`[LiteRT] Gemma 4 E2B loaded (backend: ${recommendedBackend ?? 'default'})`);
      return true;
    } catch (gpuErr: unknown) {
      console.warn('[LiteRT] Recommended backend failed, trying CPU:', (gpuErr as Error).message?.slice(0, 100));
      _llm = null;
    }

    // Attempt 2: CPU-only (slower but compatible with all devices)
    try {
      _llm = mod.createLLM();
      await _llm.loadModel(nativePath, { ...modelConfig, backend: 'cpu' });
      console.warn('[LiteRT] Gemma 4 E2B loaded (backend: cpu)');
      return true;
    } catch (cpuErr: unknown) {
      console.warn('[LiteRT] CPU backend also failed:', (cpuErr as Error).message?.slice(0, 100));
      _llm = null;
    }

    // Attempt 3: No backend specified (let engine decide)
    _llm = mod.createLLM();
    await _llm.loadModel(nativePath, modelConfig);
    console.warn('[LiteRT] Gemma 4 E2B loaded (backend: engine-default)');
    return true;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack?.slice(0, 500) : '';
    _lastError = `All backends failed. Last error: ${msg}${stack ? '\n' + stack : ''}`;
    console.error('[LiteRT]', _lastError);
    _llm = null;
    return false;
  }
}

export async function runInference(input: InferenceInput): Promise<InferenceOutput> {
  if (_llm === null) {
    throw new Error('[LiteRT] Engine not ready. Call loadModel() first.');
  }

  const start = Date.now();

  // Hard-truncate prompt to stay safely under maxTokens (1024).
  // ~4 chars per token → 3200 chars ≈ 800 tokens, leaving room for response.
  const maxChars = 3200;
  const prompt = input.prompt.length > maxChars
    ? input.prompt.slice(0, maxChars) + '\n[Truncated]'
    : input.prompt;

  const rawText: string = await _llm.sendMessage(prompt);

  return { rawText, inferenceTimeMs: Date.now() - start };
}

export async function unloadModel(): Promise<void> {
  if (_llm !== null) {
    try {
      await _llm.close();
    } catch (_) { /* ignore */ }
    _llm = null;
  }
}

// ─── Mock fallback ────────────────────────────────────────────────────────────

interface MockResult {
  condition: string;
  confidence: number;
  severity: 'mild' | 'moderate' | 'severe';
  keySigns: string[];
  otc: string | null;
}

const MOCK_CONDITIONS: (MockResult & { keywords: string[] })[] = [
  {
    keywords: ['ring', 'circular', 'round', 'fungal', 'itching'],
    condition: 'Ringworm (Tinea corporis)',
    confidence: 0.87,
    severity: 'mild',
    keySigns: ['Circular lesion', 'Scaling at edges', 'Itching reported'],
    otc: 'Apply Clotrimazole 1% cream twice daily for 2–4 weeks.',
  },
  {
    keywords: ['scab', 'itch', 'burrow', 'night', 'family'],
    condition: 'Scabies',
    confidence: 0.81,
    severity: 'moderate',
    keySigns: ['Intense itching at night', 'Burrow marks', 'Family contacts affected'],
    otc: null,
  },
  {
    keywords: ['rash', 'red', 'contact', 'chemical', 'irritation'],
    condition: 'Contact Dermatitis',
    confidence: 0.74,
    severity: 'mild',
    keySigns: ['Erythematous patches', 'Localized to contact area', 'Itching/burning'],
    otc: 'Apply Calamine lotion, avoid the irritant. OTC hydrocortisone 1% if needed.',
  },
  {
    keywords: ['white', 'patch', 'pigment', 'versicolor'],
    condition: 'Tinea Versicolor (Pityriasis versicolor)',
    confidence: 0.76,
    severity: 'mild',
    keySigns: ['Hypo/hyperpigmented patches', 'Fine scaling', 'Trunk distribution'],
    otc: 'Apply Ketoconazole 2% shampoo topically for 5–10 minutes daily, 2 weeks.',
  },
];

const DEFAULT_MOCK: MockResult = {
  condition: 'Unidentified Skin Condition',
  confidence: 0.25,
  severity: 'moderate',
  keySigns: ['Visible skin abnormality', 'Further examination needed'],
  otc: null,
};

export function runMockInference(input: InferenceInput): InferenceOutput {
  const promptLower = input.prompt.toLowerCase();

  let bestMatch: MockResult = DEFAULT_MOCK;
  let bestScore = 0;

  for (const mock of MOCK_CONDITIONS) {
    const score = mock.keywords.filter((kw) => promptLower.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      bestMatch = mock;
    }
  }

  const severity: 'mild' | 'moderate' | 'severe' = bestMatch.severity;
  return {
    rawText: JSON.stringify({
      conditionName: bestMatch.condition,
      confidence: bestMatch.confidence,
      severity,
      keySigns: bestMatch.keySigns,
      otcSuggestion: severity === 'mild' ? bestMatch.otc : null,
      doctorReferral:
        severity === 'mild'
          ? 'Monitor for 2 weeks. Visit PHC if no improvement.'
          : severity === 'moderate'
          ? 'Visit your nearest PHC within 24 hours.'
          : 'Refer to district hospital immediately.',
      needsUrgentReferral: severity === 'severe',
    }),
    inferenceTimeMs: 320 + Math.floor(Math.random() * 200),
  };
}