// Validates and sanitises raw model output.
// Never trust the model — every field is explicitly checked.

export interface ParsedResult {
  conditionName: string;
  confidence: number;
  severity: 'mild' | 'moderate' | 'severe';
  keySigns: string[];
  otcSuggestion: string | null;
  doctorReferral: string;
  needsUrgentReferral: boolean;
  isLowConfidence: boolean;        // true if confidence < 0.55
  parseError: string | null;       // non-null if model output was invalid
  inferenceSource: 'litert' | 'mock'; // which engine produced this result
}

// Hardcoded fallback referral — shown if model returns empty doctorReferral
const DEFAULT_REFERRAL =
  'Please visit your nearest Primary Health Centre (PHC) for a proper examination.';

const CONFIDENCE_THRESHOLD = 0.55;
const VALID_SEVERITIES = new Set(['mild', 'moderate', 'severe']);

// ── Condition name normalization ──────────────────────────────────────────────
// Maps common variations to canonical display names used in the app.
const CONDITION_ALIASES: Record<string, string> = {
  'tinea corporis': 'Ringworm (Tinea corporis)',
  'ringworm': 'Ringworm (Tinea corporis)',
  'dermatophytosis': 'Ringworm (Tinea corporis)',
  'tinea cruris': 'Ringworm (Tinea cruris)',
  'jock itch': 'Ringworm (Tinea cruris)',
  'pityriasis versicolor': 'Tinea Versicolor (Pityriasis versicolor)',
  'tinea versicolor': 'Tinea Versicolor (Pityriasis versicolor)',
  'scabies': 'Scabies',
  'sarcoptes scabiei': 'Scabies',
  'contact dermatitis': 'Contact Dermatitis',
  'irritant dermatitis': 'Contact Dermatitis',
  'allergic contact dermatitis': 'Contact Dermatitis',
  'heat rash': 'Heat Rash (Miliaria)',
  'miliaria': 'Heat Rash (Miliaria)',
  'miliaria rubra': 'Heat Rash (Miliaria)',
  'prickly heat': 'Heat Rash (Miliaria)',
  'atopic dermatitis': 'Mild Eczema (Atopic Dermatitis)',
  'eczema': 'Mild Eczema (Atopic Dermatitis)',
  'mild eczema': 'Mild Eczema (Atopic Dermatitis)',
  'leprosy': 'Leprosy (Hansen\'s disease)',
  'hansen disease': 'Leprosy (Hansen\'s disease)',
  'hansens disease': 'Leprosy (Hansen\'s disease)',
  'cellulitis': 'Cellulitis',
  'impetigo': 'Impetigo',
  'psoriasis': 'Psoriasis',
  'melanoma': 'Suspected Melanoma',
  'skin cancer': 'Suspected Skin Cancer',
};

function normalizeConditionName(raw: string): string {
  const lower = raw.toLowerCase().trim();
  // Check direct match first
  if (CONDITION_ALIASES[lower]) return CONDITION_ALIASES[lower];
  // Check if any alias key is contained within the raw name
  for (const [alias, canonical] of Object.entries(CONDITION_ALIASES)) {
    if (lower.includes(alias)) return canonical;
  }
  // No match — return as-is with title case
  return raw.trim();
}

export function parseModelOutput(rawText: string): ParsedResult {
  // ── Step 1: Strip markdown code fences if model ignores rule 4 ────────────
  const cleaned = rawText
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

  // ── Step 2: Extract JSON substring (model may add preamble text) ──────────
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return lowConfidenceFallback('Model did not return valid JSON.');
  }

  // ── Step 3: Parse ─────────────────────────────────────────────────────────
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(jsonMatch[0]);
  } catch {
    return lowConfidenceFallback('JSON parse error in model output.');
  }

  // ── Step 4: Validate every field ─────────────────────────────────────────

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

  // confidence — must be 0.0–1.0
  const rawConf = Number(raw.confidence);
  const confidence =
    isFinite(rawConf) && rawConf >= 0 && rawConf <= 1 ? rawConf : null;
  if (confidence === null) {
    return lowConfidenceFallback('Model returned invalid confidence value.');
  }

  // severity — must be exactly one of the three allowed values
  const severity = VALID_SEVERITIES.has(raw.severity as string)
    ? (raw.severity as 'mild' | 'moderate' | 'severe')
    : null;
  if (!severity) {
    return lowConfidenceFallback(`Model returned invalid severity: "${raw.severity}"`);
  }

  // keySigns — must be an array of strings
  const keySignsRaw = raw.keySigns ?? raw.key_signs;
  const keySigns: string[] = Array.isArray(keySignsRaw)
    ? (keySignsRaw as unknown[])
        .filter((s) => typeof s === 'string')
        .map((s) => (s as string).slice(0, 200))
        .slice(0, 6)
    : [];

  // otcSuggestion — string or null only
  const otcRaw = raw.otcSuggestion ?? raw.otc_suggestion;
  const otcSuggestion =
    typeof otcRaw === 'string' && (otcRaw as string).trim().length > 0
      ? (otcRaw as string).trim().slice(0, 500)
      : null;

  // doctorReferral — always must be populated; use fallback if empty
  const referralRaw = raw.doctorReferral ?? raw.doctor_referral;
  const rawReferral =
    typeof referralRaw === 'string' ? (referralRaw as string).trim() : '';
  const doctorReferral =
    rawReferral.length > 0 ? rawReferral.slice(0, 500) : DEFAULT_REFERRAL;

  // needsUrgentReferral — override to true if severity === 'severe' (build spec rule)
  const urgentRaw = raw.needsUrgentReferral ?? raw.needs_urgent_referral;
  const needsUrgentReferral = severity === 'severe' ? true : urgentRaw === true;

  const isLowConfidence = confidence < CONFIDENCE_THRESHOLD;

  return {
    conditionName,
    confidence,
    severity,
    keySigns,
    otcSuggestion,
    doctorReferral,
    needsUrgentReferral,
    isLowConfidence,
    parseError: null,
    inferenceSource: 'litert', // default — caller overrides if mock
  };
}

// ── Low-confidence fallback result ────────────────────────────────────────────
function lowConfidenceFallback(reason: string): ParsedResult {
  return {
    conditionName: 'Unable to identify',
    confidence: 0,
    severity: 'moderate',
    keySigns: [],
    otcSuggestion: null,
    doctorReferral: DEFAULT_REFERRAL,
    needsUrgentReferral: false,
    isLowConfidence: true,
    parseError: reason,
    inferenceSource: 'litert',
  };
}
