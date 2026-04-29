import * as SQLite from 'expo-sqlite';

export interface PatientHistoryRecord {
  id: number;
  patient_id: string;
  timestamp: string;
  symptoms_transcript: string;
  diagnosis_json: string;
}

// Open the database synchronously
const db = SQLite.openDatabaseSync('dermaseva_history.db');

export function initHistoryDB() {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS patient_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      symptoms_transcript TEXT NOT NULL,
      diagnosis_json TEXT NOT NULL
    );
  `);
}

export function saveHistory(patientId: string, symptoms: string, diagnosisJson: string) {
  const statement = db.prepareSync(
    'INSERT INTO patient_history (patient_id, timestamp, symptoms_transcript, diagnosis_json) VALUES (?, datetime("now"), ?, ?)'
  );
  try {
    statement.executeSync([patientId, symptoms, diagnosisJson]);
  } finally {
    statement.finalizeSync();
  }
}

export function getHistory(patientId: string, limit: number = 3): PatientHistoryRecord[] {
  const statement = db.prepareSync(
    'SELECT * FROM patient_history WHERE patient_id = ? ORDER BY timestamp DESC LIMIT ?'
  );
  try {
    const result = statement.executeSync<PatientHistoryRecord>([patientId, limit]);
    return result.getAllSync();
  } finally {
    statement.finalizeSync();
  }
}

export function buildHistoryContext(records: PatientHistoryRecord[]): string {
  if (records.length === 0) return '';
  
  // Reverse to chronological order (oldest to newest)
  const chronological = [...records].reverse();
  
  return chronological.map((r, index) => {
    return `Visit ${index + 1} (${r.timestamp}):
Symptoms: ${r.symptoms_transcript}
Diagnosis: ${r.diagnosis_json}`;
  }).join('\n\n');
}
