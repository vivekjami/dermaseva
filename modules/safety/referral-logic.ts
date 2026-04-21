// Referral logic — determines urgency language and CTA text based on severity,
// confidence, and RAG validation. The referral CTA is ALWAYS shown.

export type Severity = 'mild' | 'moderate' | 'severe';

export interface ReferralDecision {
  urgencyLevel: 'routine' | 'soon' | 'immediate';
  ctaText: string;
  ctaSubtext: string;
  buttonLabel: string;
  buttonColor: string;
}

const REFERRAL_MAP: Record<Severity, ReferralDecision> = {
  mild: {
    urgencyLevel: 'routine',
    ctaText: 'Consider visiting a PHC or community health worker.',
    ctaSubtext: 'If there is no improvement after treatment, visit within the next few days.',
    buttonLabel: 'Find Nearest PHC',
    buttonColor: '#437a22',
  },
  moderate: {
    urgencyLevel: 'soon',
    ctaText: 'Please visit your nearest Primary Health Centre (PHC) within 24 hours.',
    ctaSubtext: 'This condition needs a doctor\'s examination for proper treatment.',
    buttonLabel: 'See a Doctor Soon',
    buttonColor: '#da7101',
  },
  severe: {
    urgencyLevel: 'immediate',
    ctaText: 'Refer this patient to a hospital immediately.',
    ctaSubtext: 'This condition cannot be treated without a doctor. Do not delay.',
    buttonLabel: '⚠️ Refer Immediately',
    buttonColor: '#a12c7b',
  },
};

// Low-confidence override — shown when AI confidence < 0.55
const LOW_CONFIDENCE_REFERRAL: ReferralDecision = {
  urgencyLevel: 'soon',
  ctaText: 'The AI could not identify this condition with confidence.',
  ctaSubtext:
    'Please retake the photo in better lighting and try again, or visit the nearest PHC for examination.',
  buttonLabel: 'Visit PHC',
  buttonColor: '#da7101',
};

export function getReferralDecision(
  severity: Severity,
  isLowConfidence: boolean,
  forceUrgent: boolean
): ReferralDecision {
  if (isLowConfidence) return LOW_CONFIDENCE_REFERRAL;

  if (forceUrgent && severity !== 'severe') {
    // Escalate to moderate urgency if RAG forced urgent but severity was mild
    return REFERRAL_MAP['moderate'];
  }

  return REFERRAL_MAP[severity];
}
