/**
 * litert.ts — On-device LLM inference via react-native-litert-lm
 * Uses Gemma 4 E2B (~2.58 GB) with CPU backend for maximum compatibility.
 * Fully offline after first model download.
 *
 * API reference: https://www.npmjs.com/package/react-native-litert-lm
 */

import { createLLM } from 'react-native-litert-lm';
import * as FileSystem from 'expo-file-system/legacy';
import { verifyModelIntegrity } from '@/modules/security/model-verifier';
import {
  MODEL_NAME, MODEL_DOWNLOAD_URL, MODEL_SIZE_BYTES, MODEL_LOCAL_PATH,
} from '@/modules/ai/model-constants';

// Re-export constants so existing consumers don't break
export { MODEL_NAME, MODEL_DOWNLOAD_URL, MODEL_SIZE_BYTES, MODEL_LOCAL_PATH };

// System prompt — passed to applyGemmaTemplate for proper chat formatting
const SYSTEM_PROMPT = `You are DermaSeva, a skin disease screening assistant for ASHA workers in rural India.
Analyze the symptom description and respond ONLY with this JSON:
{"conditionName":string,"confidence":0.0-1.0,"severity":"mild"|"moderate"|"severe","keySigns":[string],"otcSuggestion":string|null,"doctorReferral":string,"needsUrgentReferral":boolean}
Rules: Always include doctorReferral. Only suggest OTC for fungal infections, scabies, mild eczema, contact dermatitis, heat rash. If unsure set confidence below 0.3. No text outside JSON.`;

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

/** Returns the reason loadModel() last returned false */
export function getLastModelError(): string {
  return _lastError;
}

export async function loadModel(): Promise<boolean> {
  if (_llm !== null) return true;
  _lastError = '';

  const downloaded = await isModelDownloaded();
  if (!downloaded) {
    _lastError = 'Model file not found or incomplete.';
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
    // Native LiteRT engine expects a plain filesystem path (no file:// prefix)
    const nativePath = MODEL_LOCAL_PATH.replace(/^file:\/\//, '');

    _llm = createLLM();
    await _llm.loadModel(nativePath, {
      backend: 'cpu',            // CPU via XNNPack — most compatible across all devices
      maxTokens: 1024,           // Maximum generation (output) length
      temperature: 0.1,          // Low for deterministic medical outputs
      topK: 40,
      systemPrompt: SYSTEM_PROMPT, // Library handles Gemma template formatting internally
    });
    console.warn('[LiteRT] Gemma 4 E2B loaded (backend: cpu)');
    return true;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack?.slice(0, 500) : '';
    _lastError = `loadModel failed: ${msg}${stack ? '\n' + stack : ''}`;
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

  // sendMessage takes the raw user message.
  // systemPrompt was set in loadModel — library handles template formatting internally.
  const rawText: string = await _llm.sendMessage(input.prompt);

  return { rawText, inferenceTimeMs: Date.now() - start };
}

export async function unloadModel(): Promise<void> {
  if (_llm !== null) {
    try {
      _llm.close();
    } catch (_) { /* ignore */ }
    _llm = null;
  }
}

// ─── Utility ──────────────────────────────────────────────────────────────────

export function isNativeBridgeAvailable(): boolean {
  return true; // Always true in native builds (not Expo Go)
}

// ─── Mock fallback ────────────────────────────────────────────────────────────

interface MockEntry {
  keywords: string[];
  condition: string;
  confidence: number;
  severity: 'mild' | 'moderate' | 'severe';
  keySigns: string[];
  otc: string | null;
}

const MOCK_CONDITIONS: MockEntry[] = [
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
];

const DEFAULT_MOCK: MockEntry = {
  keywords: [],
  condition: 'Unidentified Skin Condition',
  confidence: 0.25,
  severity: 'moderate',
  keySigns: ['Visible skin abnormality', 'Further examination needed'],
  otc: null,
};

export function runMockInference(input: InferenceInput): InferenceOutput {
  const promptLower = input.prompt.toLowerCase();
  let best: MockEntry = DEFAULT_MOCK;
  let bestScore = 0;

  for (const m of MOCK_CONDITIONS) {
    const score = m.keywords.filter((kw) => promptLower.includes(kw)).length;
    if (score > bestScore) { bestScore = score; best = m; }
  }

  return {
    rawText: JSON.stringify({
      conditionName: best.condition,
      confidence: best.confidence,
      severity: best.severity,
      keySigns: best.keySigns,
      otcSuggestion: best.severity === 'mild' ? best.otc : null,
      doctorReferral:
        best.severity === 'mild' ? 'Monitor for 2 weeks. Visit PHC if no improvement.'
        : best.severity === 'moderate' ? 'Visit your nearest PHC within 24 hours.'
        : 'Refer to district hospital immediately.',
      needsUrgentReferral: best.severity === 'severe',
    }),
    inferenceTimeMs: 320 + Math.floor(Math.random() * 200),
  };
}