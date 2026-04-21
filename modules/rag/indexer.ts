import * as FileSystem from 'expo-file-system/legacy';
import * as SQLite from 'expo-sqlite';
import { Asset } from 'expo-asset';
import { NHM_ASHA_ASSET, WHO_SKIN_ASSET } from '@/docs/index';

export const RAG_INDEX_VERSION = 5;
const DB_NAME = 'dermaseva-rag.db';
const CHUNK_MAX_WORDS = 80;
const CHUNK_OVERLAP_WORDS = 15;
export const EMBEDDING_DIM = 384;

// ── DB singleton ──────────────────────────────────────────────────────────────
let _db: SQLite.SQLiteDatabase | null = null;
export async function getRagDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync(DB_NAME);
  return _db;
}

// ── Schema ────────────────────────────────────────────────────────────────────
export async function initRagSchema(): Promise<void> {
  const db = await getRagDb();
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS rag_meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chunks (
      id             TEXT PRIMARY KEY,
      source         TEXT NOT NULL,
      chunk_text     TEXT NOT NULL,
      embedding      BLOB NOT NULL,
      condition_tags TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chunks_source ON chunks(source);
  `);
}

// ── Index version check ───────────────────────────────────────────────────────
export async function isIndexUpToDate(): Promise<boolean> {
  try {
    const db = await getRagDb();
    const row = await db.getFirstAsync<{ value: string }>(
      'SELECT value FROM rag_meta WHERE key = ?',
      ['index_version']
    );
    return row?.value === String(RAG_INDEX_VERSION);
  } catch {
    return false;
  }
}

// ── Document sources ──────────────────────────────────────────────────────────
// require() calls must be static — no dynamic paths
interface DocSource {
  id: string;
  module: number;           // result of require()
  conditionTags: string[];
}

const DOC_SOURCES: DocSource[] = [
  {
    id: 'nhm-asha',
    module: NHM_ASHA_ASSET,
    conditionTags: [
      'ringworm', 'tinea', 'tinea versicolor', 'scabies',
      'contact dermatitis', 'heat rash', 'miliaria', 'eczema',
      'leprosy', 'referral',
    ],
  },
  {
    id: 'who-skin',
    module: WHO_SKIN_ASSET,
    conditionTags: [
      'dermatophytosis', 'tinea', 'pityriasis versicolor', 'scabies',
      'eczema', 'atopic dermatitis', 'contact dermatitis', 'miliaria',
      'leprosy', 'cellulitis', 'melanoma', 'skin cancer',
    ],
  },
];

// ── Asset reader ──────────────────────────────────────────────────────────────
async function readBundledAsset(module: number): Promise<string> {
  const asset = Asset.fromModule(module);
  await asset.downloadAsync();

  // Strategy 1: try reading the localUri cache file first
  if (asset.localUri) {
    try {
      const content = await FileSystem.readAsStringAsync(asset.localUri);
      // Reject if it's an HTML redirect (ngrok / Metro dev server redirect)
      if (content.length > 500 && !content.trimStart().startsWith('<')) {
        return content;
      }
      console.log('[RAG] localUri returned HTML/redirect, falling back to fetch');
    } catch (e) {
      console.log('[RAG] localUri read failed, falling back to fetch:', e);
    }
  }

  // Strategy 2: fetch directly from the Metro/ngrok asset URI
  if (asset.uri) {
    const res = await fetch(asset.uri);
    if (!res.ok) throw new Error(`Asset fetch failed: ${res.status} ${asset.uri}`);
    const text = await res.text();
    console.log('[RAG] fetched via URI, length:', text.length);
    return text;
  }

  throw new Error('No valid URI available for asset');
}

// ── Chunker ───────────────────────────────────────────────────────────────────
function chunkText(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  let i = 0;
  while (i < words.length) {
    const slice = words.slice(i, i + CHUNK_MAX_WORDS);
    if (slice.length > 10) chunks.push(slice.join(' '));
    i += CHUNK_MAX_WORDS - CHUNK_OVERLAP_WORDS;
  }
  return chunks;
}

// ── Embedding ─────────────────────────────────────────────────────────────────
// Deterministic character-hash mock — replace with BAAI/bge-small-en-v1.5
// when the real embedding model is wired in.
export function computeEmbedding(text: string): Float32Array {
  const vec = new Float32Array(EMBEDDING_DIM);
  const lower = text.toLowerCase();
  for (let i = 0; i < lower.length; i++) {
    const code = lower.charCodeAt(i);
    const idx = (code * 31 + i * 7) % EMBEDDING_DIM;
    vec[idx] += 1;
  }
  let norm = 0;
  for (let i = 0; i < EMBEDDING_DIM; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < EMBEDDING_DIM; i++) vec[i] /= norm;
  return vec;
}

function float32ToBlob(arr: Float32Array): Uint8Array {
  return new Uint8Array(arr.buffer);
}

// ── Main indexer ──────────────────────────────────────────────────────────────
export async function buildIndex(
  onProgress?: (msg: string) => void
): Promise<void> {
  await initRagSchema();
  const db = await getRagDb();
  await db.execAsync('DELETE FROM chunks; DELETE FROM rag_meta;');

  let totalChunks = 0;

  for (const source of DOC_SOURCES) {
    onProgress?.(`Indexing ${source.id}…`);
    let text = '';
    try {
      text = await readBundledAsset(source.module);
    } catch (e) {
      console.warn(`[RAG] Could not read asset for ${source.id}:`, e);
      continue;
    }

    const chunks = chunkText(text);
    onProgress?.(`  ${source.id}: ${chunks.length} chunks`);

    for (let i = 0; i < chunks.length; i++) {
      const embedding = computeEmbedding(chunks[i]);
      await db.runAsync(
        `INSERT OR REPLACE INTO chunks
           (id, source, chunk_text, embedding, condition_tags)
         VALUES (?, ?, ?, ?, ?)`,
        [
          `${source.id}-${i}`,
          source.id,
          chunks[i],
          float32ToBlob(embedding) as unknown as string,
          source.conditionTags.join(','),
        ]
      );
      totalChunks++;
    }
  }

  await db.runAsync(
    `INSERT OR REPLACE INTO rag_meta (key, value) VALUES ('index_version', ?)`,
    [String(RAG_INDEX_VERSION)]
  );
  await db.runAsync(
    `INSERT OR REPLACE INTO rag_meta (key, value) VALUES ('total_chunks', ?)`,
    [String(totalChunks)]
  );
  onProgress?.(`Index complete: ${totalChunks} chunks across ${DOC_SOURCES.length} documents.`);
}
