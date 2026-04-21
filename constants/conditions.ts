// Master list of conditions DermaSeva can screen for.
// Used for display, analytics, and RAG tag matching.

export const SUPPORTED_CONDITIONS = [
  'Ringworm (Tinea corporis)',
  'Tinea versicolor (Pityriasis versicolor)',
  'Scabies',
  'Contact Dermatitis',
  'Heat Rash (Miliaria)',
  'Mild Eczema (Atopic Dermatitis)',
] as const;

export const REFERRAL_ONLY_CONDITIONS = [
  'Leprosy',
  'Psoriasis',
  'Cellulitis',
  'Skin Ulcer',
  'Suspected Melanoma',
  'Skin Cancer',
  'Severe Eczema',
  'Drug Reaction',
] as const;

export type SupportedCondition = (typeof SUPPORTED_CONDITIONS)[number];
