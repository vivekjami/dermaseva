// PII guard for SQLite writes — catches phone, email, Aadhaar in symptom text.

const PHONE_PATTERN   = /\b[6-9]\d{9}\b/;
const EMAIL_PATTERN   = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const AADHAAR_PATTERN = /\b\d{4}\s?\d{4}\s?\d{4}\b/;

export interface PIICheckResult {
  hasPII: boolean;
  flags: string[];
}

export function checkForPII(text: string | null | undefined): PIICheckResult {
  if (!text) return { hasPII: false, flags: [] };
  const flags: string[] = [];
  if (PHONE_PATTERN.test(text))   flags.push('phone_number');
  if (EMAIL_PATTERN.test(text))   flags.push('email_address');
  if (AADHAAR_PATTERN.test(text)) flags.push('aadhaar_number');
  return { hasPII: flags.length > 0, flags };
}

export function sanitiseSymptomsForStorage(text: string | null): string | null {
  if (!text) return null;
  return text
    .replace(/\b[6-9]\d{9}\b/g, '[phone redacted]')
    .replace(/\b\d{4}\s?\d{4}\s?\d{4}\b/g, '[id redacted]')
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[email redacted]')
    .slice(0, 500);
}
