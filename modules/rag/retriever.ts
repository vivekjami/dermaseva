// RAG Retriever: cosine similarity search over the SQLite vector store.

import { getRagDb } from './indexer';
import { computeEmbedding } from './indexer';

const TOP_K = 3;
const SIMILARITY_THRESHOLD = 0.10;

export interface RetrievedChunk {
  id: string;
  source: string;
  chunkText: string;
  similarity: number;
  conditionTags: string[];
}

// ── Cosine similarity ─────────────────────────────────────────────────────────
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

function blobToFloat32(blob: ArrayBuffer | Uint8Array): Float32Array {
  const buf = blob instanceof Uint8Array ? blob.buffer : blob;
  return new Float32Array(buf);
}

// ── Main retrieval function ───────────────────────────────────────────────────
export async function retrieveRelevantChunks(
  queryText: string
): Promise<RetrievedChunk[]> {
  const db = await getRagDb();
  const queryEmbedding = computeEmbedding(queryText);

  // Load all chunks from SQLite (dataset is small enough — ~50-100 chunks)
  const rows = await db.getAllAsync<{
    id: string;
    source: string;
    chunk_text: string;
    embedding: Uint8Array;
    condition_tags: string;
  }>('SELECT id, source, chunk_text, embedding, condition_tags FROM chunks');

  const scored: RetrievedChunk[] = [];

  for (const row of rows) {
    const chunkEmbedding = blobToFloat32(row.embedding);
    const similarity = cosineSimilarity(queryEmbedding, chunkEmbedding);

    if (similarity >= SIMILARITY_THRESHOLD) {
      scored.push({
        id: row.id,
        source: row.source,
        chunkText: row.chunk_text,
        similarity,
        conditionTags: row.condition_tags.split(',').map((t) => t.trim()),
      });
    }
  }

  // Sort descending, take top K
  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, TOP_K);
}

// ── Context builder for prompt injection ─────────────────────────────────────
export function buildRagContext(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return '';
  const parts = chunks.map(
    (c, i) =>
      `[Guideline ${i + 1} — Source: ${c.source}]\n${c.chunkText}`
  );
  return `RELEVANT HEALTH GUIDELINES (ground your response in these):\n\n${parts.join('\n\n---\n\n')}`;
}
