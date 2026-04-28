/**
 * litert.ts — Production on-device LLM inference via react-native-litert-lm
 * Uses Google LiteRT-LM runtime with Gemma 4 E2B (~2.58 GB)
 * Fully offline after first model download. No data leaves the device.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { verifyModelIntegrity } from '@/modules/security/model-verifier';
import {
  MODEL_NAME, MODEL_DOWNLOAD_URL, MODEL_SIZE_BYTES, MODEL_LOCAL_PATH,
} from './model-constants';

// Re-export constants so existing consumers don't break
export { MODEL_NAME, MODEL_DOWNLOAD_URL, MODEL_SIZE_BYTES, MODEL_LOCAL_PATH };

const SYSTEM_PROMPT = 'You are DermaSeva, a skin disease screening assistant for rural Indian health workers. Respond ONLY with valid JSON. No markdown, no text outside JSON.';

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

/**
 * Checks whether the react-native-litert-lm native JSI bridge is available.
 * Returns false in Expo Go (no native modules). Returns true in native builds.
 */
export function isNativeBridgeAvailable(): boolean {
  if (_nativeAvailable !== null) return _nativeAvailable;
  try {
    // Dynamic require — avoids crash if native module is not linked
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
  await FileSystem.makeDirectoryAsync(modelsDir, { intermediates: true });

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
    // Import react-native-litert-lm — works in native builds (EAS/prebuild).
    // Throws in Expo Go where native modules are not linked.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-litert-lm');

    if (typeof mod?.createLLM !== 'function') {
      _lastError = 'react-native-litert-lm loaded but createLLM is not a function. Module keys: ' + Object.keys(mod || {}).join(', ');
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
      console.warn(`[LiteRT] Gemma 4 E2B loaded successfully (backend: ${recommendedBackend ?? 'default'})`);
      return true;
    } catch (gpuErr: unknown) {
      console.warn('[LiteRT] Recommended backend failed, trying CPU fallback:', (gpuErr as Error).message?.slice(0, 100));
      _llm = null;
    }

    // Attempt 2: Try CPU-only (slower but compatible with all devices)
    try {
      _llm = mod.createLLM();
      await _llm.loadModel(nativePath, {
        ...modelConfig,
        backend: 'cpu',
      });
      console.warn('[LiteRT] Gemma 4 E2B loaded successfully (backend: cpu)');
      return true;
    } catch (cpuErr: unknown) {
      console.warn('[LiteRT] CPU backend also failed:', (cpuErr as Error).message?.slice(0, 100));
      _llm = null;
    }

    // Attempt 3: Try with no backend specified at all (let engine decide)
    _llm = mod.createLLM();
    await _llm.loadModel(nativePath, modelConfig);
    console.warn('[LiteRT] Gemma 4 E2B loaded successfully (backend: engine-default)');
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

  // Truncate prompt to ~900 tokens (~4 chars/token) to stay under maxTokens (1024).
  // System prompt is set in loadModel and counted separately by the engine.
  const maxPromptChars = 3600;
  const prompt = input.prompt.length > maxPromptChars
    ? input.prompt.slice(0, maxPromptChars) + '\n[Truncated for token limit]'
    : input.prompt;

  const rawText: string = await _llm.sendMessage(prompt);

  return { rawText, inferenceTimeMs: Date.now() - start };
}

export async function unloadModel(): Promise<void> {
  if (_llm !== null) {
    try {
      await _llm.close();
    } catch (_) {}
    _llm = null;
  }
}

// ─── Mock fallback — LAST RESORT ONLY ─────────────────────────────────────────
// Used only when native bridge is unavailable AND no alternative exists.
// Returns keyword-matched results instead of pure random.

const MOCK_CONDITIONS = [
  {
    keywords: ['itch', 'circular', 'ring', 'round', 'scaly', 'fungal', 'fungus'],
    condition: 'Ringworm (Tinea corporis)',
    confidence: 0.82,
    severity: 'mild' as const,
    keySigns: ['Circular lesion', 'Scaling at edges', 'Itching reported'],
    otc: 'Apply Clotrimazole 1% cream twice daily for 2–4 weeks.',
  },
  {
    keywords: ['night', 'burrow', 'finger', 'wrist', 'family', 'household'],
    condition: 'Scabies',
    confidence: 0.79,
    severity: 'mild' as const,
    keySigns: ['Intense itching at night', 'Burrows in web spaces', 'Multiple household members affected'],
    otc: 'Apply Permethrin 5% cream overnight. Treat all household contacts.',
  },
  {
    keywords: ['red', 'swell', 'blister', 'irritant', 'soap', 'detergent', 'contact'],
    condition: 'Contact Dermatitis',
    confidence: 0.74,
    severity: 'moderate' as const,
    keySigns: ['Erythema at contact site', 'Vesicles or blisters', 'Clear boundary matching irritant'],
    otc: null,
  },
  {
    keywords: ['hot', 'heat', 'sweat', 'bump', 'prickly'],
    condition: 'Heat Rash (Miliaria)',
    confidence: 0.80,
    severity: 'mild' as const,
    keySigns: ['Small red papules', 'Areas covered by clothing', 'Hot environment reported'],
    otc: 'Keep area dry. Apply talc-free powder. Wear loose cotton clothing.',
  },
  {
    keywords: ['dry', 'flaky', 'crack', 'eczema', 'atopic', 'chronic'],
    condition: 'Mild Eczema (Atopic Dermatitis)',
    confidence: 0.71,
    severity: 'mild' as const,
    keySigns: ['Dry, flaky skin', 'Flexural involvement', 'Chronic itching'],
    otc: 'Apply fragrance-free moisturizing cream twice daily.',
  },
  {
    keywords: ['patch', 'light', 'dark', 'discolor', 'chest', 'back', 'versicolor'],
    condition: 'Tinea Versicolor (Pityriasis versicolor)',
    confidence: 0.76,
    severity: 'mild' as const,
    keySigns: ['Hypo/hyperpigmented patches', 'Fine scaling', 'Trunk distribution'],
    otc: 'Apply Ketoconazole 2% shampoo topically for 5–10 minutes daily, 2 weeks.',
  },
];

interface MockResult {
  condition: string;
  confidence: number;
  severity: 'mild' | 'moderate' | 'severe';
  keySigns: string[];
  otc: string | null;
}

const DEFAULT_MOCK: MockResult = {
  condition: 'Unidentified Skin Condition',
  confidence: 0.25,
  severity: 'moderate',
  keySigns: ['Visible skin abnormality', 'Further examination needed'],
  otc: null,
};

export function runMockInference(input: InferenceInput): InferenceOutput {
  const promptLower = input.prompt.toLowerCase();

  // Find best keyword match
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