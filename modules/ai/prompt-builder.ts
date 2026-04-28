// Builds the USER message for sendMessage().
// System instructions are passed via applyGemmaTemplate in litert.ts.
// This only contains: worker type + symptoms — kept concise.

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

  return `${workerLabel} reporting. Language: ${input.languageCode}.
Symptoms: ${symptoms}
Analyze and return the JSON.`;
}

// Strip characters that could cause prompt injection
function sanitiseInput(text: string): string {
  return text
    .replace(/[<>{}[\]\\]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .slice(0, 400);
}
