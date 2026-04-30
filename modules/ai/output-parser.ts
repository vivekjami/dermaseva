// Validates and sanitises raw model output.
// Handles all categories: skin, child health, malnutrition.
// Never trust the model — every field is explicitly checked.

export interface ParsedResult {
  conditionName: string;
  confidence: number;
  severity: 'mild' | 'moderate' | 'severe';
  keySigns: string[];
  actionSteps: string[];          // What the health worker should do
  otcSuggestion: string | null;
  doctorReferral: string;
  needsUrgentReferral: boolean;
  guidelineSource: string | null; // e.g. "IMNCI", "WHO", "NHM"
  followUpPlan: string | null;    // Follow-up schedule
  isLowConfidence: boolean;
  parseError: string | null;
  inferenceSource: 'llama' | 'mock';
}

const DEFAULT_REFERRAL =
  'Please visit your nearest Primary Health Centre (PHC) for a proper examination.';

const CONFIDENCE_THRESHOLD = 0.55;
const VALID_SEVERITIES = new Set(['mild', 'moderate', 'severe']);

// ── Condition name normalization ──────────────────────────────────────────────
const CONDITION_ALIASES: Record<string, string> = {
  // Skin conditions
  'tinea corporis': 'Ringworm (Tinea corporis)',
  'ringworm': 'Ringworm (Tinea corporis)',
  'pityriasis versicolor': 'Tinea Versicolor',
  'tinea versicolor': 'Tinea Versicolor',
  'scabies': 'Scabies',
  'contact dermatitis': 'Contact Dermatitis',
  'heat rash': 'Heat Rash (Miliaria)',
  'miliaria': 'Heat Rash (Miliaria)',
  'eczema': 'Eczema (Atopic Dermatitis)',
  'atopic dermatitis': 'Eczema (Atopic Dermatitis)',
  'leprosy': 'Leprosy (Hansen\'s disease)',
  'cellulitis': 'Cellulitis',
  'impetigo': 'Impetigo',
  // Child health
  'pneumonia': 'Pneumonia (ARI)',
  'diarrhea': 'Diarrhea',
  'diarrhoea': 'Diarrhea',
  'dehydration': 'Dehydration',
  'malaria': 'Malaria',
  'measles': 'Measles',
  'meningitis': 'Suspected Meningitis',
  // Malnutrition
  'sam': 'Severe Acute Malnutrition (SAM)',
  'severe acute malnutrition': 'Severe Acute Malnutrition (SAM)',
  'mam': 'Moderate Acute Malnutrition (MAM)',
  'moderate acute malnutrition': 'Moderate Acute Malnutrition (MAM)',
  'stunting': 'Stunting (Chronic Malnutrition)',
  'anemia': 'Iron Deficiency Anemia',
  'anaemia': 'Iron Deficiency Anemia',
  'vitamin a deficiency': 'Vitamin A Deficiency',
  'kwashiorkor': 'Kwashiorkor (Edematous Malnutrition)',
  'marasmus': 'Marasmus (Severe Wasting)',
};

function normalizeConditionName(raw: string): string {
  const lower = raw.toLowerCase().trim();
  if (CONDITION_ALIASES[lower]) return CONDITION_ALIASES[lower];
  for (const [alias, canonical] of Object.entries(CONDITION_ALIASES)) {
    if (lower.includes(alias)) return canonical;
  }
  return raw.trim();
}

export function parseModelOutput(rawText: string): ParsedResult {
  // Step 1: Strip markdown code fences
  const cleaned = rawText
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

  // Step 2: Extract JSON
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return lowConfidenceFallback('Model did not return valid JSON.');
  }

  // Step 3: Parse
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(jsonMatch[0]);
  } catch {
    return lowConfidenceFallback('JSON parse error in model output.');
  }

  // Step 4: Validate every field

  // conditionName
  const rawCondition =
    typeof raw.conditionName === 'string' && raw.conditionName.trim().length > 0
      ? raw.conditionName.trim().slice(0, 200)
      : typeof raw.condition_name === 'string' && (raw.condition_name as string).trim().length > 0
      ? (raw.condition_name as string).trim().slice(0, 200)
      : null;
  if (!rawCondition) {
    return lowConfidenceFallback('Model returned empty conditionName.');
  }
  const conditionName = normalizeConditionName(rawCondition);

  // confidence
  const rawConf = Number(raw.confidence);
  const confidence =
    isFinite(rawConf) && rawConf >= 0 && rawConf <= 1 ? rawConf : null;
  if (confidence === null) {
    return lowConfidenceFallback('Model returned invalid confidence value.');
  }

  // severity
  const severity = VALID_SEVERITIES.has(raw.severity as string)
    ? (raw.severity as 'mild' | 'moderate' | 'severe')
    : null;
  if (!severity) {
    return lowConfidenceFallback(`Model returned invalid severity: "${raw.severity}"`);
  }

  // keySigns
  const keySignsRaw = raw.keySigns ?? raw.key_signs;
  const keySigns: string[] = Array.isArray(keySignsRaw)
    ? (keySignsRaw as unknown[])
        .filter((s) => typeof s === 'string')
        .map((s) => (s as string).slice(0, 200))
        .slice(0, 6)
    : [];

  // actionSteps (new)
  const actionStepsRaw = raw.actionSteps ?? raw.action_steps;
  const actionSteps: string[] = Array.isArray(actionStepsRaw)
    ? (actionStepsRaw as unknown[])
        .filter((s) => typeof s === 'string')
        .map((s) => (s as string).slice(0, 300))
        .slice(0, 8)
    : [];

  // otcSuggestion
  const otcRaw = raw.otcSuggestion ?? raw.otc_suggestion;
  const otcSuggestion =
    typeof otcRaw === 'string' && (otcRaw as string).trim().length > 0
      ? (otcRaw as string).trim().slice(0, 500)
      : null;

  // doctorReferral
  const referralRaw = raw.doctorReferral ?? raw.doctor_referral;
  const rawReferral =
    typeof referralRaw === 'string' ? (referralRaw as string).trim() : '';
  const doctorReferral =
    rawReferral.length > 0 ? rawReferral.slice(0, 500) : DEFAULT_REFERRAL;

  // needsUrgentReferral
  const urgentRaw = raw.needsUrgentReferral ?? raw.needs_urgent_referral;
  const needsUrgentReferral = severity === 'severe' ? true : urgentRaw === true;

  // guidelineSource (new)
  const guidelineRaw = raw.guidelineSource ?? raw.guideline_source;
  const guidelineSource =
    typeof guidelineRaw === 'string' ? (guidelineRaw as string).trim().slice(0, 100) : null;

  // followUpPlan (new)
  const followUpRaw = raw.followUpPlan ?? raw.follow_up_plan ?? raw.followUp;
  const followUpPlan =
    typeof followUpRaw === 'string' ? (followUpRaw as string).trim().slice(0, 300) : null;

  const isLowConfidence = confidence < CONFIDENCE_THRESHOLD;

  return {
    conditionName,
    confidence,
    severity,
    keySigns,
    actionSteps,
    otcSuggestion,
    doctorReferral,
    needsUrgentReferral,
    guidelineSource,
    followUpPlan,
    isLowConfidence,
    parseError: null,
    inferenceSource: 'llama',
  };
}

function lowConfidenceFallback(reason: string): ParsedResult {
  return {
    conditionName: 'Unable to identify',
    confidence: 0,
    severity: 'moderate',
    keySigns: [],
    actionSteps: [],
    otcSuggestion: null,
    doctorReferral: DEFAULT_REFERRAL,
    needsUrgentReferral: false,
    guidelineSource: null,
    followUpPlan: null,
    isLowConfidence: true,
    parseError: reason,
    inferenceSource: 'llama',
  };
}
