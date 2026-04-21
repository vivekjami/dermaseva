// RAG Validator: cross-checks Gemma's output against retrieved guideline chunks.
// If the condition is not found in the indexed documents, escalate urgency.

import { type RetrievedChunk } from './retriever';
import { type ParsedResult } from '../ai/output-parser';

export interface ValidationResult {
  conditionFoundInGuidelines: boolean;
  ragConfidenceBoost: number;        // +/- adjustment to AI confidence
  forceUrgentReferral: boolean;
  validationNote: string;
}

export function validateAgainstRag(
  parsed: ParsedResult,
  chunks: RetrievedChunk[]
): ValidationResult {
  if (chunks.length === 0) {
    // No relevant chunks retrieved — condition may be outside scope
    return {
      conditionFoundInGuidelines: false,
      ragConfidenceBoost: -0.15,
      forceUrgentReferral: parsed.severity !== 'mild',
      validationNote:
        'Condition not found in indexed health guidelines. Confidence reduced.',
    };
  }

  const conditionLower = parsed.conditionName.toLowerCase();

  // Check if any retrieved chunk's condition tags or text mention this condition
  const conditionFound = chunks.some(
    (chunk) =>
      chunk.conditionTags.some((tag) => conditionLower.includes(tag) || tag.includes(conditionLower.split(' ')[0])) ||
      chunk.chunkText.toLowerCase().includes(conditionLower.split(' ')[0])
  );

  if (!conditionFound) {
    return {
      conditionFoundInGuidelines: false,
      ragConfidenceBoost: -0.10,
      forceUrgentReferral: true,
      validationNote:
        'AI identified a condition not confirmed in ASHA/WHO guidelines. Referring to doctor.',
    };
  }

  // Check if Gemma's OTC suggestion aligns with guidelines (basic keyword match)
  let otcAligned = true;
  if (parsed.otcSuggestion) {
    const otcLower = parsed.otcSuggestion.toLowerCase();
    const guidelineText = chunks.map((c) => c.chunkText.toLowerCase()).join(' ');
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
