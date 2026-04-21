// SQLite schema for case history.
// PRIVACY RULES (build spec Step 7.1):
// - No patient name, phone number, or any PII ever stored.
// - Only thumbnail (100x100 JPEG base64), symptoms, condition, severity stored.
// - All data stays on-device. No server upload.

export const CREATE_CASES_TABLE = `
  CREATE TABLE IF NOT EXISTS cases (
    id               TEXT    PRIMARY KEY,
    created_at       INTEGER NOT NULL,
    worker_type      TEXT    NOT NULL,
    condition_name   TEXT,
    confidence       REAL,
    severity         TEXT,
    otc_suggestion   TEXT,
    doctor_referral  TEXT,
    needs_urgent_referral INTEGER DEFAULT 0,
    thumbnail_base64 TEXT,
    raw_symptoms     TEXT,
    language_used    TEXT
  );
`;

export const HISTORY_LIMIT = 200;    // soft cap — oldest 50 purged when exceeded
export const PURGE_COUNT  = 50;
