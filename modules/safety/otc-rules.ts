// OTC allowlist — the ONLY conditions where ASHA/Anganwadi workers may
// suggest over-the-counter remedies. All other conditions show referral only.
// Source: NHM ASHA Worker Handbook, Section 2.

export type WorkerType = 'asha' | 'anganwadi' | 'general';

export interface OtcRule {
  conditionKeywords: string[];   // matched against conditionName (lowercase)
  remedy: string;
  instructions: string;
  followUpDays: number;          // recommend PHC visit if no improvement by X days
}

// Only ASHA and Anganwadi workers are NHM-trained and permitted to advise OTC.
// General workers see NO OTC suggestions — per build spec Step 6.1.
export const OTC_ELIGIBLE_WORKER_TYPES: WorkerType[] = ['asha', 'anganwadi'];

export const OTC_ALLOWLIST: OtcRule[] = [
  {
    conditionKeywords: ['ringworm', 'tinea corporis', 'tinea cruris', 'dermatophyt'],
    remedy: 'Clotrimazole 1% cream',
    instructions: 'Apply twice daily to the affected area for 2–4 weeks. Keep area clean and dry.',
    followUpDays: 14,
  },
  {
    conditionKeywords: ['tinea versicolor', 'pityriasis versicolor'],
    remedy: 'Ketoconazole 2% shampoo (applied topically)',
    instructions: 'Apply to affected skin for 5–10 minutes daily for 2 weeks. Rinse thoroughly.',
    followUpDays: 14,
  },
  {
    conditionKeywords: ['scabies'],
    remedy: 'Permethrin 5% cream',
    instructions:
      'Apply to entire body from neck down overnight (8–14 hours). Rinse off. ' +
      'Treat ALL household contacts simultaneously. Wash clothing and bedding at 60°C.',
    followUpDays: 7,
  },
  {
    conditionKeywords: ['contact dermatitis', 'irritant dermatitis'],
    remedy: 'Calamine lotion',
    instructions:
      'Apply calamine lotion to affected area for relief. Identify and avoid the irritant ' +
      '(soap, plant, detergent). Do not apply to broken skin.',
    followUpDays: 7,
  },
  {
    conditionKeywords: ['heat rash', 'miliaria', 'prickly heat'],
    remedy: 'Talc-free powder + hygiene measures',
    instructions:
      'Keep area clean and dry. Use talc-free powder. Wear loose, breathable cotton clothing. ' +
      'Avoid heavy creams in affected area.',
    followUpDays: 7,
  },
  {
    conditionKeywords: ['mild eczema', 'atopic dermatitis', 'mild atopic'],
    remedy: 'Fragrance-free moisturizing cream',
    instructions:
      'Apply fragrance-free moisturizer twice daily. Avoid harsh soaps, hot water, and known triggers.',
    followUpDays: 14,
  },
];

// ── OTC eligibility check ─────────────────────────────────────────────────────
export interface OtcCheckResult {
  eligible: boolean;
  rule: OtcRule | null;
  reason: string;
}

export function checkOtcEligibility(
  conditionName: string,
  severity: 'mild' | 'moderate' | 'severe',
  workerType: WorkerType,
  ragConfirmed: boolean      // must be confirmed in RAG guidelines
): OtcCheckResult {

  // Rule 1: worker type must be ASHA or Anganwadi
  if (!OTC_ELIGIBLE_WORKER_TYPES.includes(workerType)) {
    return {
      eligible: false,
      rule: null,
      reason: 'OTC suggestions are only available for ASHA and Anganwadi workers.',
    };
  }

  // Rule 2: severity must be mild
  if (severity !== 'mild') {
    return {
      eligible: false,
      rule: null,
      reason: `Severity is ${severity} — OTC remedies are only for mild conditions.`,
    };
  }

  // Rule 3: condition must be confirmed in RAG guidelines
  if (!ragConfirmed) {
    return {
      eligible: false,
      rule: null,
      reason: 'Condition not confirmed in NHM/WHO guidelines — OTC not advised.',
    };
  }

  // Rule 4: condition must be on the hardcoded allowlist
  const conditionLower = conditionName.toLowerCase();
  const matchedRule = OTC_ALLOWLIST.find((rule) =>
    rule.conditionKeywords.some((kw) => conditionLower.includes(kw))
  );

  if (!matchedRule) {
    return {
      eligible: false,
      rule: null,
      reason: 'This condition is not on the ASHA OTC allowlist. Doctor consultation required.',
    };
  }

  return {
    eligible: true,
    rule: matchedRule,
    reason: 'Condition is within ASHA OTC scope.',
  };
}
