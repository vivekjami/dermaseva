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

export { MODEL_NAME, MODEL_DOWNLOAD_URL, MODEL_SIZE_BYTES, MODEL_LOCAL_PATH };

// System prompt for health assistant
const SYSTEM_PROMPT = `You are DermaSeva, a health assistant for ASHA and Anganwadi workers in rural India.
You handle: 1) Skin diseases 2) Child health (IMNCI) 3) Malnutrition (NHM/WHO).
Respond ONLY with valid JSON, no other text:
{"conditionName":string,"confidence":0.0-1.0,"severity":"mild"|"moderate"|"severe","keySigns":[string],"actionSteps":[string],"otcSuggestion":string|null,"doctorReferral":string,"needsUrgentReferral":boolean,"guidelineSource":string|null,"followUpPlan":string|null}
Rules:
- Respond in the language requested by the worker.
- actionSteps: specific steps for the health worker to take.
- guidelineSource: cite IMNCI, NHM, WHO, or IAP.
- followUpPlan: when to follow up.
- For follow-up questions, provide updated advice based on new information.
- If unsure set confidence below 0.3. No text outside JSON.`;

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
let _lastError = '';

export function getLastModelError(): string {
  return _lastError;
}

export function isModelLoaded(): boolean {
  return _context !== null;
}

export async function loadModel(): Promise<boolean> {
  if (_context !== null) return true;
  if (_isLoading) return false; // Prevent concurrent loads
  _isLoading = true;
  _lastError = '';

  const downloaded = await isModelDownloaded();
  if (!downloaded) {
    _lastError = 'Model file not found or incomplete.';
    console.error('[LlamaEngine]', _lastError);
    _isLoading = false;
    return false;
  }

  const verification = await verifyModelIntegrity();
  if (!verification.valid) {
    _lastError = 'Integrity check failed: ' + verification.reason;
    console.error('[LlamaEngine]', _lastError);
    _isLoading = false;
    return false;
  }

  try {
    // Strip file:// prefix for llama.rn (expects raw path)
    const nativePath = MODEL_LOCAL_PATH.replace(/^file:\/\//, '');

    console.warn('[LlamaEngine] Loading Gemma 4 E2B Q4_K_M GGUF...');
    _context = await initLlama({
      model: nativePath,
      n_ctx: 2048,       // Context window
      n_gpu_layers: 0,   // CPU-only for max compatibility
      use_mlock: true,    // Lock model in memory
    });
    console.warn('[LlamaEngine] Model loaded successfully');
    _isLoading = false;
    return true;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    _lastError = `loadModel failed: ${msg}`;
    console.error('[LlamaEngine]', _lastError);
    _context = null;
    _isLoading = false;
    return false;
  }
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
      temperature: 0.1,
      top_k: 40,
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

// ─── Mock fallback (unchanged from litert.ts) ─────────────────────────────────

interface MockEntry {
  keywords: string[];
  condition: string;
  confidence: number;
  severity: 'mild' | 'moderate' | 'severe';
  keySigns: string[];
  actionSteps: string[];
  otc: string | null;
  guidelineSource: string;
  followUp: string;
}

const MOCK_CONDITIONS: MockEntry[] = [
  {
    keywords: ['ring', 'circular', 'round', 'fungal', 'itching', 'tinea'],
    condition: 'Ringworm (Tinea corporis)',
    confidence: 0.87, severity: 'mild',
    keySigns: ['Circular lesion', 'Scaling at edges', 'Itching reported'],
    actionSteps: ['Apply Clotrimazole 1% cream twice daily for 2-4 weeks', 'Keep area clean and dry', 'Follow up in 2 weeks'],
    otc: 'Apply Clotrimazole 1% cream twice daily for 2–4 weeks.',
    guidelineSource: 'NHM ASHA Guidelines', followUp: '2 weeks',
  },
  {
    keywords: ['scab', 'itch', 'burrow', 'night', 'family', 'scabies'],
    condition: 'Scabies',
    confidence: 0.81, severity: 'moderate',
    keySigns: ['Intense itching at night', 'Burrow marks', 'Family contacts affected'],
    actionSteps: ['Apply Permethrin 5% cream from neck to toes overnight', 'Treat all household contacts', 'Wash all clothing and bedding in hot water', 'Refer if secondary infection'],
    otc: null,
    guidelineSource: 'WHO Skin Guidelines', followUp: '1 week',
  },
  {
    keywords: ['cough', 'breathing', 'fast', 'pneumonia', 'chest', 'wheeze', 'ari'],
    condition: 'Pneumonia (ARI)',
    confidence: 0.78, severity: 'moderate',
    keySigns: ['Fast breathing', 'Cough for more than 3 days', 'Possible chest indrawing'],
    actionSteps: ['Count respiratory rate for 1 full minute', 'Give first dose of Amoxicillin', 'Refer to PHC within 24 hours', 'Advise mother on danger signs'],
    otc: null,
    guidelineSource: 'IMNCI Protocol', followUp: 'Day 3 after antibiotic started',
  },
  {
    keywords: ['loose', 'stool', 'diarrhea', 'diarrhoea', 'watery', 'vomit', 'dehydration'],
    condition: 'Diarrhea with Dehydration',
    confidence: 0.82, severity: 'moderate',
    keySigns: ['Multiple loose stools', 'Sunken eyes', 'Drinks eagerly', 'Restless/irritable'],
    actionSteps: ['Start ORS immediately — 50-100ml after each stool (under 2 years)', 'Give Zinc 20mg daily for 14 days', 'Continue breastfeeding', 'Refer if vomiting everything or lethargic'],
    otc: 'ORS packets and Zinc 20mg tablets',
    guidelineSource: 'IMNCI Protocol', followUp: 'Day 3 or when episode ends',
  },
  {
    keywords: ['fever', 'hot', 'temperature', 'malaria', 'chills', 'shiver'],
    condition: 'Fever — Evaluate for Malaria',
    confidence: 0.70, severity: 'moderate',
    keySigns: ['High temperature', 'Possible chills/rigors', 'Duration of fever'],
    actionSteps: ['Perform RDT for malaria if in endemic area', 'Give paracetamol for fever', 'Check for stiff neck and danger signs', 'Refer if fever > 3 days or danger signs present'],
    otc: 'Paracetamol as per weight',
    guidelineSource: 'IMNCI Protocol', followUp: '48 hours',
  },
  {
    keywords: ['thin', 'wasting', 'muac', 'red', 'weight', 'not eating', 'underweight', 'malnourish'],
    condition: 'Severe Acute Malnutrition (SAM)',
    confidence: 0.75, severity: 'severe',
    keySigns: ['MUAC below 11.5 cm', 'Visible severe wasting', 'Possible edema of both feet'],
    actionSteps: ['Measure MUAC — if below 11.5cm confirm SAM', 'Check for medical complications', 'If complications: refer immediately to NRC', 'If no complications: start CMAM with RUTF', 'Weekly follow-up at Anganwadi'],
    otc: null,
    guidelineSource: 'NHM SAM Management Protocol', followUp: 'Weekly until MUAC > 12.5cm',
  },
  {
    keywords: ['pale', 'anemia', 'anaemia', 'iron', 'weak', 'tired', 'nails'],
    condition: 'Iron Deficiency Anemia',
    confidence: 0.74, severity: 'moderate',
    keySigns: ['Pallor of palms and nails', 'Fatigue and weakness', 'Possible poor appetite'],
    actionSteps: ['Check for pallor in palms, nails, conjunctivae', 'If severe pallor: refer immediately for Hb check', 'Start iron syrup 3mg/kg/day for 3 months', 'Give folic acid', 'Counsel on iron-rich foods', 'Deworming with Albendazole if over 1 year'],
    otc: 'Iron syrup as per weight + folic acid',
    guidelineSource: 'NHM WIFS Guidelines', followUp: '1 month for Hb recheck',
  },
  {
    keywords: ['better', 'improve', 'fine', 'recover', 'well', 'good', 'plan', 'forward', 'next'],
    condition: 'Recovery Follow-up',
    confidence: 0.85, severity: 'mild',
    keySigns: ['Child showing improvement', 'Previous condition resolving'],
    actionSteps: ['Continue current treatment plan', 'Ensure balanced nutrition with diverse foods', 'Continue growth monitoring monthly', 'Complete any pending vaccinations', 'Watch for any returning danger signs'],
    otc: null,
    guidelineSource: 'NHM Follow-up Protocol', followUp: 'Next monthly growth monitoring day',
  },
];

const DEFAULT_MOCK: MockEntry = {
  keywords: [],
  condition: 'Unidentified Condition',
  confidence: 0.25, severity: 'moderate',
  keySigns: ['Further examination needed'],
  actionSteps: ['Refer to nearest PHC for proper examination', 'Document symptoms observed', 'Ensure follow-up within 48 hours'],
  otc: null,
  guidelineSource: 'NHM General Protocol',
  followUp: 'Within 48 hours at PHC',
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
      actionSteps: best.actionSteps,
      otcSuggestion: best.severity === 'mild' ? best.otc : null,
      doctorReferral:
        best.severity === 'mild' ? 'Monitor for 2 weeks. Visit PHC if no improvement.'
        : best.severity === 'moderate' ? 'Visit your nearest PHC within 24 hours.'
        : 'Refer to district hospital / NRC immediately.',
      needsUrgentReferral: best.severity === 'severe',
      guidelineSource: best.guidelineSource,
      followUpPlan: best.followUp,
    }),
    inferenceTimeMs: 320 + Math.floor(Math.random() * 200),
  };
}
