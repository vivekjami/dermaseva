// All SQLite read/write operations for case history.
// Uses expo-sqlite v14 (async API).

import * as SQLite from 'expo-sqlite';
import { CREATE_CASES_TABLE, HISTORY_LIMIT, PURGE_COUNT } from './schema';
import { sanitiseSymptomsForStorage } from '@/modules/security/privacy-check';

export interface CaseRecord {
  id: string;
  created_at: number;
  worker_type: string;
  condition_name: string | null;
  confidence: number | null;
  severity: string | null;
  otc_suggestion: string | null;
  doctor_referral: string | null;
  needs_urgent_referral: boolean;
  thumbnail_base64: string | null;
  raw_symptoms: string | null;
  language_used: string | null;
  inference_source: string | null;
}

let _db: SQLite.SQLiteDatabase | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!_db) {
    _db = await SQLite.openDatabaseAsync('dermaseva.db');
    await _db.execAsync(CREATE_CASES_TABLE);
    // Migration: add inference_source column if missing (existing DBs)
    try {
      await _db.execAsync(
        `ALTER TABLE cases ADD COLUMN inference_source TEXT DEFAULT 'unknown'`
      );
    } catch {
      // Column already exists — ignore
    }
  }
  return _db;
}

// ── Write ──────────────────────────────────────────────────────────────────────

export async function saveCase(record: Omit<CaseRecord, 'id' | 'created_at'>): Promise<string> {
  const db = await getDb();
  const id = `case-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const created_at = Date.now();

  // PII sanitisation — strip phone numbers, Aadhaar, email from symptoms
  const sanitisedSymptoms = sanitiseSymptomsForStorage(record.raw_symptoms ?? null);

  await db.runAsync(
    `INSERT INTO cases
      (id, created_at, worker_type, condition_name, confidence, severity,
       otc_suggestion, doctor_referral, needs_urgent_referral,
       thumbnail_base64, raw_symptoms, language_used, inference_source)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id,
      created_at,
      record.worker_type,
      record.condition_name ?? null,
      record.confidence ?? null,
      record.severity ?? null,
      record.otc_suggestion ?? null,
      record.doctor_referral ?? null,
      record.needs_urgent_referral ? 1 : 0,
      record.thumbnail_base64 ?? null,
      sanitisedSymptoms,
      record.language_used ?? null,
      record.inference_source ?? 'unknown',
    ]
  );

  const purged = await enforceSoftLimit(db);
  if (purged) {
    // Caller can check return value to show a toast
    console.warn('[CaseStore] Storage limit reached — oldest 50 cases removed.');
  }
  return id;
}

// ── Read ───────────────────────────────────────────────────────────────────────

export async function getAllCases(): Promise<CaseRecord[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<CaseRecord>(
    'SELECT * FROM cases ORDER BY created_at DESC'
  );
  return rows.map(normalise);
}

export async function getCaseById(id: string): Promise<CaseRecord | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<CaseRecord>('SELECT * FROM cases WHERE id = ?', [id]);
  return row ? normalise(row) : null;
}

// ── Delete ─────────────────────────────────────────────────────────────────────

export async function deleteCaseById(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM cases WHERE id = ?', [id]);
}

export async function clearAllCases(): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM cases');
}

// ── Storage limit enforcement ──────────────────────────────────────────────────

async function enforceSoftLimit(db: SQLite.SQLiteDatabase): Promise<boolean> {
  const result = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM cases'
  );
  const count = result?.count ?? 0;

  if (count > HISTORY_LIMIT) {
    // Delete the oldest PURGE_COUNT records
    await db.runAsync(
      `DELETE FROM cases WHERE id IN (
         SELECT id FROM cases ORDER BY created_at ASC LIMIT ?
       )`,
      [PURGE_COUNT]
    );
    return true; // caller can show a toast if needed
  }
  return false;
}

// ── Normalise raw SQLite row ───────────────────────────────────────────────────

function normalise(row: CaseRecord): CaseRecord {
  return {
    ...row,
    needs_urgent_referral: Boolean(row.needs_urgent_referral),
  };
}
