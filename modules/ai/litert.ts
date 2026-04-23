/**
 * litert.ts — Production on-device LLM inference via react-native-litert-lm
 * Uses Google LiteRT-LM runtime with Gemma 4 E2B (~2.58 GB)
 * Fully offline after first model download. No data leaves the device.
 */

import { createLLM, applyGemmaTemplate, getRecommendedBackend } from 'react-native-litert-lm';
import * as FileSystem from 'expo-file-system/legacy';
import { verifyModelIntegrity } from '@/modules/security/model-verifier';

// ─── Constants ────────────────────────────────────────────────────────────────

export const MODEL_NAME = 'gemma-4-E2B-it.litertlm';
export const MODEL_DOWNLOAD_URL =
  'https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it.litertlm';
export const MODEL_SIZE_BYTES = 2_580_000_000; // ~2.58 GB (Gemma 4 E2B LiteRT-LM)

const MODEL_LOCAL_PATH = `${FileSystem.documentDirectory}${MODEL_NAME}`;

const SYSTEM_PROMPT = `You are DermaSeva, a clinical decision support tool for ASHA workers in rural India.
Analyze the described skin condition and respond ONLY with valid JSON in this exact schema:
{
  "conditionName": string,
  "confidence": number (0.0–1.0),
  "severity": "mild" | "moderate" | "severe",
  "keySigns": string[],
  "otcSuggestion": string | null,
  "doctorReferral": string,
  "needsUrgentReferral": boolean
}
Do not include any text outside the JSON object.`;

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

let _llm: ReturnType<typeof createLLM> | null = null;

export async function loadModel(): Promise<boolean> {
  if (_llm !== null) return true;

  const downloaded = await isModelDownloaded();
  if (!downloaded) return false;

  const verification = await verifyModelIntegrity();
  if (!verification.valid) {
    console.error('[LiteRT] Integrity check failed:', verification.reason);
    return false;
  }

  try {
    _llm = createLLM();
    await _llm.loadModel(MODEL_LOCAL_PATH, {
      backend: getRecommendedBackend(), // auto-selects GPU/NPU or CPU
      maxTokens: 512,
      topK: 40,
      temperature: 0.1,  // low for deterministic medical outputs
    });
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

  const prompt = applyGemmaTemplate(
    [{ role: 'user', content: input.prompt }],
    SYSTEM_PROMPT
  );

  const rawText = await _llm.sendMessage(prompt);

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