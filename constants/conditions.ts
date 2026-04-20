export const SUPPORTED_CONDITIONS = [
  'ringworm',
  'tinea_versicolor',
  'scabies',
  'eczema',
  'contact_dermatitis',
  'heat_rash',
  'leprosy',
  'psoriasis',
] as const;

export type SupportedCondition = typeof SUPPORTED_CONDITIONS[number];
