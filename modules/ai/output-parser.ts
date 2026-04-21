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
}

// Hardcoded fallback referral — shown if model returns empty doctorReferral
const DEFAULT_REFERRAL =
  'Please visit your nearest Primary Health Centre (PHC) for a proper examination.';

const CONFIDENCE_THRESHOLD = 0.55;
const VALID_SEVERITIES = new Set(['mild', 'moderate', 'severe']);

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
  const conditionName =
    typeof raw.conditionName === 'string' && raw.conditionName.trim().length > 0
      ? raw.conditionName.trim().slice(0, 200)
      : null;
  if (!conditionName) {
    return lowConfidenceFallback('Model returned empty conditionName.');
  }

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
  const keySigns: string[] = Array.isArray(raw.keySigns)
    ? (raw.keySigns as unknown[])
        .filter((s) => typeof s === 'string')
        .map((s) => (s as string).slice(0, 200))
        .slice(0, 6)
    : [];

  // otcSuggestion — string or null only
  const otcSuggestion =
    typeof raw.otcSuggestion === 'string' && raw.otcSuggestion.trim().length > 0
      ? raw.otcSuggestion.trim().slice(0, 500)
      : null;

  // doctorReferral — always must be populated; use fallback if empty
  const rawReferral =
    typeof raw.doctorReferral === 'string' ? raw.doctorReferral.trim() : '';
  const doctorReferral =
    rawReferral.length > 0 ? rawReferral.slice(0, 500) : DEFAULT_REFERRAL;

  // needsUrgentReferral — override to true if severity === 'severe' (build spec rule)
  const needsUrgentReferral = severity === 'severe' ? true : raw.needsUrgentReferral === true;

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
  };
}
