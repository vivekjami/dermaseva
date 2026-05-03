// Builds the USER message for sendMessage().
// Handles all 3 categories: skin, child_health, malnutrition.
// Supports follow-up questions with conversation history context.
// Now injects candidate conditions from the knowledge base for Gemma to judge.

import type { ConversationMessage, Category } from '@/store/app-store';

export interface PromptInput {
  symptomDescription: string;
  workerType: 'asha' | 'anganwadi' | 'general';
  languageCode: string;
  inputMode?: 'voice' | 'text';
  category: Category;
  isFollowUp?: boolean;
  conversationHistory?: ConversationMessage[];
  candidateContext?: string; // Pre-formatted candidate conditions from knowledge base
}

// Language display names for the AI prompt
const LANGUAGE_NAMES: Record<string, string> = {
  'en-US': 'English', 'en': 'English',
  'hi-IN': 'Hindi', 'hi': 'Hindi',
  'te-IN': 'Telugu', 'te': 'Telugu',
  'ta-IN': 'Tamil', 'ta': 'Tamil',
  'kn-IN': 'Kannada', 'kn': 'Kannada',
  'mr-IN': 'Marathi', 'mr': 'Marathi',
};

const CATEGORY_LABELS: Record<Category, string> = {
  skin: 'Skin Care / Dermatology',
  child_health: 'Child Health (IMNCI)',
  malnutrition: 'Nutrition / Malnutrition',
};

export function buildPrompt(input: PromptInput): string {
  const workerLabel =
    input.workerType === 'asha' ? 'ASHA worker'
    : input.workerType === 'anganwadi' ? 'Anganwadi worker'
    : 'Health worker';

  const modeNote = input.inputMode === 'text'
    ? ' (typed description)'
    : ' (spoken description — may be informal)';

  const langName = LANGUAGE_NAMES[input.languageCode] || 'English';
  const categoryLabel = CATEGORY_LABELS[input.category];
  const description = sanitiseInput(input.symptomDescription);

  let prompt = `${workerLabel} reporting${modeNote}.\nCategory: ${categoryLabel}\nResponse language: ${langName}\n`;

  // Add conversation context for follow-up questions
  if (input.isFollowUp && input.conversationHistory && input.conversationHistory.length > 0) {
    prompt += `\n--- Previous conversation ---\n`;
    const recentMessages = input.conversationHistory.slice(-6); // Last 6 messages
    for (const msg of recentMessages) {
      prompt += `${msg.role === 'user' ? 'Worker' : 'AI'}: ${msg.text.slice(0, 300)}\n`;
    }
    prompt += `--- End of previous conversation ---\n\n`;
    prompt += `Follow-up question: ${description}\n`;
  } else {
    prompt += `\nSymptoms: ${description}\n`;
  }

  // Inject candidate conditions from knowledge base (top 2 only — keeps prompt short)
  if (input.candidateContext) {
    prompt += `\n${input.candidateContext.slice(0, 800)}\n`;
  }

  prompt += `\nMatch the best condition above. Respond in ${langName}. Return ONLY valid JSON.`;

  return prompt;
}

// Strip characters that could cause prompt injection
function sanitiseInput(text: string): string {
  return text
    .replace(/[<>{}[\]\\]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .slice(0, 1200);
}
