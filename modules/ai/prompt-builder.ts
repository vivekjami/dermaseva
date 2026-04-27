// Builds the constrained, defensive prompt for Gemma 4 E4B.
// Per build spec: never trust free-form model output — constrain it at the
// prompt level AND validate it in output-parser.ts.

export interface PromptInput {
  symptomDescription: string;
  workerType: 'asha' | 'anganwadi' | 'general';
  languageCode: string;           // e.g. 'en', 'hi', 'te'
}

const SYSTEM_PROMPT = `You are a clinical screening assistant for ASHA healthcare workers in rural India.
You analyze a photo of skin and the worker's symptom description together.

STRICT RULES you must never violate:
1. Always include a doctor referral recommendation, regardless of severity.
2. Never diagnose skin cancer, melanoma, or leprosy definitively. For these, always output severity "severe" and refer immediately.
3. Only suggest OTC remedies for: fungal infections, scabies, mild eczema, contact dermatitis, and heat rash. For all other conditions, recommend consultation only.
4. Output ONLY valid JSON. No markdown. No explanations outside the JSON.
5. Respond in language: {LANGUAGE_CODE}
6. Base your analysis on BOTH the visual evidence from the attached photograph AND the symptom description provided.
7. If the image is unclear, blurry, or you cannot confidently identify the condition, set confidence below 0.3 and recommend doctor referral.
8. Never invent symptoms not visible in the photo or described by the worker.

Output format — strict JSON, no extra keys:
{
  "conditionName": "string",
  "confidence": 0.0–1.0,
  "severity": "mild" | "moderate" | "severe",
  "keySigns": ["string", "string"],
  "otcSuggestion": "string or null",
  "doctorReferral": "string — always populated",
  "needsUrgentReferral": true | false
}`;

export function buildPrompt(input: PromptInput): string {
  const systemPrompt = SYSTEM_PROMPT.replace('{LANGUAGE_CODE}', input.languageCode);

  const workerContext =
    input.workerType === 'asha'
      ? 'I am an ASHA worker (trained in NHM community health protocols).'
      : input.workerType === 'anganwadi'
      ? 'I am an Anganwadi worker (trained in basic health and nutrition).'
      : 'I am a general health worker.';

  const userTurn = `${workerContext}

Symptom description: ${sanitiseInput(input.symptomDescription)}

Analyze the attached skin photograph together with the symptom description above.
Identify the most likely skin condition based on visual signs in the photo and reported symptoms.
Return ONLY the JSON object described in the system prompt. No other text.`;

  return `${systemPrompt}\n\n${userTurn}`;
}

// Strip any characters that could cause prompt injection
function sanitiseInput(text: string): string {
  return text
    .replace(/[<>{}[\]\\]/g, '')   // remove special chars
    .replace(/\n{3,}/g, '\n\n')    // collapse excessive newlines
    .slice(0, 500);                 // hard cap at 500 chars
}
