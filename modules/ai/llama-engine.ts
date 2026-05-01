/**
 * llama-engine.ts — On-device LLM inference via llama.rn (llama.cpp binding)
 * Uses Gemma 4 E2B Q4_K_M GGUF with CPU backend for maximum compatibility.
 * Fully offline after first model download. Memory-mapped loading.
 */

import { initLlama, type LlamaContext } from 'llama.rn';
import * as FileSystem from 'expo-file-system/legacy';
import { verifyModelIntegrity } from '@/modules/security/model-verifier';
import {
  MODEL_NAME, MODEL_DOWNLOAD_URL, MODEL_SIZE_BYTES, MODEL_LOCAL_PATH,
} from '@/modules/ai/model-constants';
import { findCandidateConditions } from '@/modules/ai/knowledge-base';

export { MODEL_NAME, MODEL_DOWNLOAD_URL, MODEL_SIZE_BYTES, MODEL_LOCAL_PATH };

// System prompt for Gemma 4 E2B — structured for JSON output
const SYSTEM_PROMPT = `You are DermaSeva, an expert health assistant for ASHA and Anganwadi workers in rural India.
You will receive: 1) Candidate conditions from WHO/NHM/IMNCI guidelines 2) The worker's symptom description.
Your job: Judge which candidate condition best matches. If none fit well, set confidence below 0.3.
Respond ONLY with valid JSON — no text before or after the JSON object:
{"conditionName":"string","confidence":0.0-1.0,"severity":"mild|moderate|severe","keySigns":["string"],"actionSteps":["string"],"otcSuggestion":"string or null","doctorReferral":"string","needsUrgentReferral":false,"guidelineSource":"string or null","followUpPlan":"string or null"}
IMPORTANT RULES:
- Output ONLY the JSON object. No markdown, no explanation, no code fences.
- The "conditionName" field must always be in English.
- The "actionSteps", "doctorReferral", "followUpPlan", and "keySigns" fields MUST be in the language requested by the worker (Hindi, Telugu, Tamil, Kannada, Marathi, or English).
- If unsure, set confidence below 0.3.`;

// Stop tokens for Gemma 4
const STOP_WORDS = ['</s>', '<end_of_turn>', '<|end|>', '<|eot_id|>', '<|im_end|>'];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InferenceInput {
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
  return info.exists && (info.size ?? 0) > MODEL_SIZE_BYTES * 0.90;
}

export async function downloadModel(
  onProgress: (progress: DownloadProgress) => void
): Promise<boolean> {
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

// ─── Engine (singleton) ───────────────────────────────────────────────────────

let _context: LlamaContext | null = null;
let _isLoading = false;
let _loadPromise: Promise<boolean> | null = null;
let _lastError = '';

export function getLastModelError(): string {
  return _lastError;
}

export function isModelLoaded(): boolean {
  return _context !== null;
}

export function isModelLoading(): boolean {
  return _isLoading;
}

export async function loadModel(): Promise<boolean> {
  if (_context !== null) return true;
  if (_loadPromise !== null) return _loadPromise;

  _isLoading = true;
  _lastError = '';

  _loadPromise = (async () => {
    const downloaded = await isModelDownloaded();
  if (!downloaded) {
      _lastError = 'Model file not found or incomplete.';
      console.error('[LlamaEngine]', _lastError);
      _isLoading = false;
      _loadPromise = null;
      return false;
    }

    const verification = await verifyModelIntegrity();
    if (!verification.valid) {
      _lastError = 'Integrity check failed: ' + verification.reason;
      console.error('[LlamaEngine]', _lastError);
      _isLoading = false;
      _loadPromise = null;
      return false;
    }

  try {
    // Strip file:// prefix for llama.rn (expects raw path)
    const nativePath = MODEL_LOCAL_PATH.replace(/^file:\/\//, '');

    console.warn('[LlamaEngine] Loading Gemma 4 E2B Q4_K_M GGUF...');

    // Race against a timeout to prevent the app from hanging/crashing
    const loadPromise = initLlama({
      model: nativePath,
      n_ctx: 8192,        // Unrestricted — let the model use full memory
      n_gpu_layers: 0,    // CPU-only for max compatibility
      use_mlock: false,   // Do NOT lock in RAM — let OS manage memory
    });

    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), 60_000) // 60s timeout
    );

    const ctx = await Promise.race([loadPromise, timeoutPromise]);
    if (!ctx) {
      _lastError = 'Model loading timed out (60s). Device may not have enough memory.';
      console.error('[LlamaEngine]', _lastError);
      _isLoading = false;
      _loadPromise = null;
      return false;
    }

    _context = ctx;
    console.warn('[LlamaEngine] Model loaded successfully');
    _isLoading = false;
    _loadPromise = null;
    return true;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    _lastError = `loadModel failed: ${msg}`;
    console.error('[LlamaEngine]', _lastError);
    _context = null;
    _isLoading = false;
    _loadPromise = null;
    return false;
  }
  })();

  return _loadPromise;
}

export async function runInference(input: InferenceInput): Promise<InferenceOutput> {
  if (_context === null) {
    throw new Error('[LlamaEngine] Not loaded. Call loadModel() first.');
  }

  const start = Date.now();
  console.warn(`[LlamaEngine] Sending prompt (${input.prompt.length} chars)`);

  try {
    const result = await _context.completion({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: input.prompt },
      ],
      n_predict: 512,
      temperature: 0.1,     // Low temperature for strict JSON output
      top_k: 40,            // More deterministic
      top_p: 0.95,
      stop: STOP_WORDS,
    });

    return {
      rawText: result.text,
      inferenceTimeMs: Date.now() - start,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`[LlamaEngine] Inference failed: ${msg}`);
  }
}

export async function unloadModel(): Promise<void> {
  if (_context !== null) {
    try {
      await _context.release();
    } catch (_) { /* ignore */ }
    _context = null;
  }
}

export function isNativeBridgeAvailable(): boolean {
  return true;
}

// ─── Mock fallback — powered by knowledge base (25+ conditions) ───────────────

export function runMockInference(input: InferenceInput): InferenceOutput {
  const candidates = findCandidateConditions(input.prompt);

  if (candidates.length === 0) {
    // No match at all — generic PHC referral
    return {
      rawText: JSON.stringify({
        conditionName: 'General Health Concern',
        confidence: 0.30,
        severity: 'moderate',
        keySigns: ['Symptoms described do not match a specific known condition'],
        actionSteps: ['Document symptoms observed', 'Refer to nearest PHC for examination', 'Follow up within 48 hours'],
        otcSuggestion: null,
        doctorReferral: 'Visit your nearest Primary Health Centre for proper examination.',
        needsUrgentReferral: false,
        guidelineSource: 'NHM General Protocol',
        followUpPlan: 'Within 48 hours at PHC',
      }),
      inferenceTimeMs: 150 + Math.floor(Math.random() * 100),
    };
  }

  const best = candidates[0].condition;
  return {
    rawText: JSON.stringify({
      conditionName: best.name,
      confidence: Math.min(0.85, 0.60 + candidates[0].score * 0.03),
      severity: best.severity,
      keySigns: best.keySigns,
      actionSteps: best.actionSteps,
      otcSuggestion: best.severity === 'mild' ? best.otc : null,
      doctorReferral: best.referral,
      needsUrgentReferral: best.severity === 'severe',
      guidelineSource: best.source,
      followUpPlan: best.followUp,
    }),
    inferenceTimeMs: 200 + Math.floor(Math.random() * 150),
  };
}

