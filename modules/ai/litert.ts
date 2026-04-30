/**
 * litert.ts — On-device LLM inference via react-native-litert-lm
 * Uses Gemma 4 E2B (~2.58 GB) with CPU backend for maximum compatibility.
 * Fully offline after first model download.
 *
 * Covers: Skin Care, Child Health (IMNCI), Malnutrition (NHM/WHO)
 */

import { createLLM } from 'react-native-litert-lm';
import * as FileSystem from 'expo-file-system/legacy';
import { verifyModelIntegrity } from '@/modules/security/model-verifier';
import {
  MODEL_NAME, MODEL_DOWNLOAD_URL, MODEL_SIZE_BYTES, MODEL_LOCAL_PATH,
} from '@/modules/ai/model-constants';

export { MODEL_NAME, MODEL_DOWNLOAD_URL, MODEL_SIZE_BYTES, MODEL_LOCAL_PATH };

// System prompt — covers all 3 categories
const SYSTEM_PROMPT = `You are DermaSeva, a health assistant for ASHA and Anganwadi workers in rural India.
You handle: 1) Skin diseases 2) Child health (IMNCI) 3) Malnutrition (NHM/WHO).
Respond ONLY with this JSON, no other text:
{"conditionName":string,"confidence":0.0-1.0,"severity":"mild"|"moderate"|"severe","keySigns":[string],"actionSteps":[string],"otcSuggestion":string|null,"doctorReferral":string,"needsUrgentReferral":boolean,"guidelineSource":string|null,"followUpPlan":string|null}
Rules:
- Respond in the language requested by the worker.
- Always include actionSteps with specific steps the health worker should take.
- Always include doctorReferral.
- guidelineSource: cite "IMNCI", "NHM", "WHO", or "IAP" as appropriate.
- followUpPlan: when to check on the patient next.
- For follow-up questions, provide updated advice based on the new information.
- If unsure set confidence below 0.3. No text outside JSON.`;

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
  return info.exists && (info.size ?? 0) > MODEL_SIZE_BYTES * 0.95;
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

// ─── Engine ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _llm: any = null;
let _lastError: string = '';

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
    const nativePath = MODEL_LOCAL_PATH.replace(/^file:\/\//, '');

    _llm = createLLM();
    await _llm.loadModel(nativePath, {
      backend: 'cpu',
      maxTokens: 1024,
      temperature: 0.1,
      topK: 40,
      systemPrompt: SYSTEM_PROMPT,
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

  try {
    const mem = _llm.getMemoryUsage?.();
    if (mem) {
      console.warn(`[LiteRT] Memory: RSS=${(mem.residentBytes / 1024 / 1024).toFixed(0)}MB, available=${(mem.availableMemoryBytes / 1024 / 1024).toFixed(0)}MB`);
    }
  } catch (_) { /* getMemoryUsage may not exist */ }

  console.warn(`[LiteRT] Sending prompt (${input.prompt.length} chars)`);

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

export function isNativeBridgeAvailable(): boolean {
  return true;
}

// ─── Mock fallback ────────────────────────────────────────────────────────────

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
  // ── Skin conditions ─────────────────────────────────────────────────────
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
  // ── Child health ────────────────────────────────────────────────────────
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
    keywords: ['vaccine', 'immuniz', 'injection', 'polio', 'bcg', 'measles', 'pentavalent'],
    condition: 'Immunization Counseling',
    confidence: 0.90, severity: 'mild',
    keySigns: ['Due for vaccination as per UIP schedule'],
    actionSteps: ['Check immunization card for due vaccines', 'Counsel mother on importance of timely vaccination', 'Ensure cold chain maintained', 'Record in Mother-Child Protection Card', 'Schedule next visit as per UIP'],
    otc: null,
    guidelineSource: 'NHM Universal Immunization Programme', followUp: 'As per next due vaccine',
  },
  // ── Malnutrition ────────────────────────────────────────────────────────
  {
    keywords: ['thin', 'wasting', 'muac', 'red', 'weight', 'not eating', 'underweight', 'malnourish'],
    condition: 'Severe Acute Malnutrition (SAM)',
    confidence: 0.75, severity: 'severe',
    keySigns: ['MUAC below 11.5 cm', 'Visible severe wasting', 'Possible edema of both feet'],
    actionSteps: ['Measure MUAC — if below 11.5cm confirm SAM', 'Check for medical complications', 'If complications: refer immediately to NRC', 'If no complications: start CMAM with RUTF', 'Provide 175 kcal/kg/day', 'Weekly follow-up at Anganwadi'],
    otc: null,
    guidelineSource: 'NHM SAM Management Protocol', followUp: 'Weekly until MUAC > 12.5cm',
  },
  {
    keywords: ['growth', 'falter', 'slow', 'not growing', 'short', 'stunted', 'height'],
    condition: 'Growth Faltering / Stunting',
    confidence: 0.72, severity: 'moderate',
    keySigns: ['Height-for-age below -2 SD', 'Weight plateau or decline', 'Possible inadequate diet'],
    actionSteps: ['Plot on WHO growth chart', 'Assess feeding practices', 'Counsel on energy-dense foods with oil/ghee', 'Ensure 5-6 feeds per day', 'Give iron-folic acid supplementation', 'Refer to Anganwadi for supplementary nutrition'],
    otc: null,
    guidelineSource: 'WHO Growth Standards / Poshan Abhiyaan', followUp: 'Monthly growth monitoring',
  },
  {
    keywords: ['pale', 'anemia', 'anaemia', 'iron', 'weak', 'tired', 'nails'],
    condition: 'Iron Deficiency Anemia',
    confidence: 0.74, severity: 'moderate',
    keySigns: ['Pallor of palms and nails', 'Fatigue and weakness', 'Possible poor appetite'],
    actionSteps: ['Check for pallor in palms, nails, conjunctivae', 'If severe pallor: refer immediately for Hb check', 'Start iron syrup 3mg/kg/day for 3 months', 'Give folic acid', 'Counsel on iron-rich foods (jaggery, green leafy vegetables, eggs)', 'Deworming with Albendazole if over 1 year'],
    otc: 'Iron syrup as per weight + folic acid',
    guidelineSource: 'NHM WIFS Guidelines', followUp: '1 month for Hb recheck',
  },
  {
    keywords: ['breastfeed', 'milk', 'feeding', 'latch', 'formula', 'bottle', 'breast'],
    condition: 'Breastfeeding Counseling',
    confidence: 0.88, severity: 'mild',
    keySigns: ['Infant feeding assessment needed'],
    actionSteps: ['Assess current breastfeeding position and attachment', 'Counsel exclusive breastfeeding until 6 months', 'Ensure at least 8-12 feeds in 24 hours', 'No water or other foods before 6 months', 'If infant > 6 months: introduce complementary feeding', 'Mother to eat balanced diet for adequate milk production'],
    otc: null,
    guidelineSource: 'WHO IYCF Guidelines / NHM', followUp: 'Weekly for first month, then monthly',
  },
  // ── Follow-up / general wellness ────────────────────────────────────────
  {
    keywords: ['better', 'improve', 'fine', 'recover', 'well', 'good', 'plan', 'forward', 'next'],
    condition: 'Recovery Follow-up',
    confidence: 0.85, severity: 'mild',
    keySigns: ['Child showing improvement', 'Previous condition resolving'],
    actionSteps: ['Continue current treatment plan', 'Ensure balanced nutrition with diverse foods', 'Continue growth monitoring monthly', 'Complete any pending vaccinations', 'Watch for any returning danger signs', 'Schedule next Anganwadi visit'],
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