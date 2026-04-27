/**
 * litert.ts — Production on-device LLM inference via react-native-litert-lm
 * Uses Google LiteRT-LM runtime with Gemma 4 E4B (~3.65 GB)
 * Fully offline after first model download. No data leaves the device.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { verifyModelIntegrity } from '@/modules/security/model-verifier';
import {
  MODEL_NAME, MODEL_DOWNLOAD_URL, MODEL_SIZE_BYTES, MODEL_LOCAL_PATH,
} from './model-constants';

// Re-export constants so existing consumers don't break
export { MODEL_NAME, MODEL_DOWNLOAD_URL, MODEL_SIZE_BYTES, MODEL_LOCAL_PATH };

const SYSTEM_PROMPT = `You are DermaSeva, a clinical decision support tool for ASHA workers in rural India.
Analyze the described skin condition and the attached skin photograph.
Respond ONLY with valid JSON in this exact schema:
{
  "conditionName": string,
  "confidence": number (0.0–1.0),
  "severity": "mild" | "moderate" | "severe",
  "keySigns": string[],
  "otcSuggestion": string | null,
  "doctorReferral": string,
  "needsUrgentReferral": boolean
}
Do not include any text outside the JSON object.
If you cannot identify the condition from the image, set confidence below 0.3.`;

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

export async function loadModel(): Promise<boolean> {
  if (_llm !== null) return true;

  if (!isNativeBridgeAvailable()) {
    console.warn('[LiteRT] Native bridge not available (Expo Go?). Use native build: npx expo run:android');
    return false;
  }

  const downloaded = await isModelDownloaded();
  if (!downloaded) return false;

  const verification = await verifyModelIntegrity();
  if (!verification.valid) {
    console.error('[LiteRT] Integrity check failed:', verification.reason);
    return false;
  }

  try {
    // Dynamic import to avoid crash when native module is not linked
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createLLM, getRecommendedBackend } = require('react-native-litert-lm');
    _llm = createLLM();
    await _llm.loadModel(MODEL_LOCAL_PATH, {
      backend: getRecommendedBackend(), // auto-selects GPU/NPU or CPU
      maxTokens: 512,
      topK: 40,
      temperature: 0.1,  // low for deterministic medical outputs
    });
    console.log('[LiteRT] Gemma 4 E4B loaded successfully');
    return true;
  } catch (e: unknown) {
    console.error('[LiteRT] loadModel failed:', (e as Error).message);
    _llm = null;
    return false;
  }
}

export async function runInference(input: InferenceInput): Promise<InferenceOutput> {
  if (_llm === null) {
    throw new Error('[LiteRT] Engine not ready. Call loadModel() first.');
  }

  const start = Date.now();

  // Apply Gemma chat template with system prompt
  const formattedPrompt = _llm.applyGemmaTemplate(
    [{ role: 'user', content: input.prompt }],
    SYSTEM_PROMPT
  );

  const rawText: string = await _llm.sendMessage(formattedPrompt);

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