// RAG Validator: cross-checks Gemma's output against retrieved guideline chunks.
// If the condition is not found in the indexed documents, escalate urgency.

import { type RetrievedChunk } from './retriever';
import { type ParsedResult } from '../ai/output-parser';
import { type CandidateMatch } from '../ai/knowledge-base';

export interface ValidationResult {
  conditionFoundInGuidelines: boolean;
  ragConfidenceBoost: number;        // +/- adjustment to AI confidence
  forceUrgentReferral: boolean;
  validationNote: string;
}

export function validateAgainstRag(
  parsed: ParsedResult,
  chunks: RetrievedChunk[],
  candidates: CandidateMatch[] = []
): ValidationResult {
  const conditionLower = parsed.conditionName.toLowerCase();

  // 1. Check if the condition matches any of the knowledge base candidates
  const inCandidates = candidates.some((c) =>
    c.condition.name.toLowerCase() === conditionLower ||
    conditionLower.includes(c.condition.name.toLowerCase()) ||
    c.condition.name.toLowerCase().includes(conditionLower)
  );

  // 2. Check if the condition is mentioned in the RAG chunks
  const inChunks = chunks.length > 0 && chunks.some(
    (chunk) =>
      chunk.conditionTags.some((tag) => conditionLower.includes(tag) || tag.includes(conditionLower.split(' ')[0])) ||
      chunk.chunkText.toLowerCase().includes(conditionLower.split(' ')[0])
  );

  const conditionFound = inCandidates || inChunks;

  if (!conditionFound) {
    return {
      conditionFoundInGuidelines: false,
      ragConfidenceBoost: chunks.length === 0 ? -0.15 : -0.10,
      forceUrgentReferral: true,
      validationNote: chunks.length === 0
        ? 'Condition not found in indexed health guidelines. Confidence reduced.'
        : 'AI identified a condition not confirmed in ASHA/WHO guidelines. Referring to doctor.',
    };
  }

  // Check if Gemma's OTC suggestion aligns with guidelines (basic keyword match)
  let otcAligned = true;
  if (parsed.otcSuggestion) {
    const otcLower = parsed.otcSuggestion.toLowerCase();
    // If OTC suggestion contains a drug name not mentioned in guidelines, flag it
    const suspectDrugs = ['steroid', 'cortisone', 'antibiotic', 'amoxicillin', 'dexamethasone'];
    otcAligned = !suspectDrugs.some((drug) => otcLower.includes(drug));
  }

  if (!otcAligned) {
    return {
      conditionFoundInGuidelines: true,
      ragConfidenceBoost: 0,
      forceUrgentReferral: false,
      validationNote:
        'OTC suggestion contains medication outside ASHA scope. Suggestion suppressed.',
    };
  }

  return {
    conditionFoundInGuidelines: true,
    ragConfidenceBoost: 0.05,        // slight boost when RAG confirms the condition
    forceUrgentReferral: false,
    validationNote: 'Condition confirmed in health guidelines.',
  };
}
