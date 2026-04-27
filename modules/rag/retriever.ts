// RAG Retriever: cosine similarity search over the SQLite vector store.
// Enhanced with keyword boosting and deduplication.

import { getRagDb } from './indexer';
import { computeEmbedding } from './indexer';

const TOP_K = 3;
const SIMILARITY_THRESHOLD = 0.05; // TF-IDF scores are naturally lower than dense embeddings
const KEYWORD_BOOST = 0.15;        // boost when query contains a condition tag

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
  const queryLower = queryText.toLowerCase();

  // Load all chunks from SQLite (dataset is small enough — ~50-100 chunks)
  const rows = await db.getAllAsync<{
    id: string;
    source: string;
    chunk_text: string;
    embedding: Uint8Array;
    condition_tags: string;
  }>('SELECT id, source, chunk_text, embedding, condition_tags FROM chunks');

  const scored: RetrievedChunk[] = [];
  const seenTexts = new Set<string>(); // for deduplication

  for (const row of rows) {
    // Deduplication: skip if we already have a chunk with the same text
    const textKey = row.chunk_text.slice(0, 100).toLowerCase();
    if (seenTexts.has(textKey)) continue;

    const chunkEmbedding = blobToFloat32(row.embedding);
    let similarity = cosineSimilarity(queryEmbedding, chunkEmbedding);

    // Keyword boosting: if query mentions a condition from this chunk's tags,
    // boost the similarity score. This helps when TF-IDF misses semantic connections.
    const tags = row.condition_tags.split(',').map((t) => t.trim().toLowerCase());
    const hasKeywordMatch = tags.some((tag) =>
      queryLower.includes(tag) || tag.split(' ').some((word) => word.length > 3 && queryLower.includes(word))
    );
    if (hasKeywordMatch) {
      similarity += KEYWORD_BOOST;
    }

    if (similarity >= SIMILARITY_THRESHOLD) {
      seenTexts.add(textKey);
      scored.push({
        id: row.id,
        source: row.source,
        chunkText: row.chunk_text,
        similarity,
        conditionTags: tags,
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
