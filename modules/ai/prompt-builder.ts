// Builds the user-facing prompt for sendMessage().
// System instructions (JSON schema, rules) are set in loadModel's systemPrompt.
// This only contains: worker type + symptoms — kept short for 6GB device support.

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
    .slice(0, 400);  // hard cap at 400 chars
}
