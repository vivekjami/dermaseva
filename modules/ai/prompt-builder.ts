// Builds the constrained prompt for Gemma 4 E2B.
// All instructions are included here since systemPrompt option
// is not supported by react-native-litert-lm's loadModel.

export interface PromptInput {
  symptomDescription: string;
  workerType: 'asha' | 'anganwadi' | 'general';
  languageCode: string;
}

export function buildPrompt(input: PromptInput): string {
  const workerLabel =
    input.workerType === 'asha' ? 'ASHA worker'
    : input.workerType === 'anganwadi' ? 'Anganwadi worker'
    : 'Health worker';

  const symptoms = sanitiseInput(input.symptomDescription);

  // Keep prompt concise but complete — must stay under ~900 tokens
  return `You are a skin disease screening assistant for rural Indian health workers.
Analyze the symptoms and respond ONLY with valid JSON, no other text.

JSON schema:
{"conditionName":string,"confidence":0.0-1.0,"severity":"mild"|"moderate"|"severe","keySigns":[string],"otcSuggestion":string|null,"doctorReferral":string,"needsUrgentReferral":boolean}

Rules: Always include doctorReferral. Only suggest OTC for fungal infections, scabies, mild eczema, contact dermatitis, heat rash. If unsure, confidence below 0.3.

${workerLabel} reporting. Language: ${input.languageCode}.
Symptoms: ${symptoms}

Return ONLY the JSON object.`;
}

// Strip characters that could cause prompt injection
function sanitiseInput(text: string): string {
  return text
    .replace(/[<>{}[\]\\]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .slice(0, 400);
}
