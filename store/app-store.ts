import { create } from 'zustand';

export type WorkerType = 'asha' | 'anganwadi' | 'general';
export type Category = 'skin' | 'child_health' | 'malnutrition';

export interface ConversationMessage {
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
  category?: Category;
}

// Maps app language code → BCP-47 voice recognition locale
const VOICE_LOCALE_MAP: Record<string, string> = {
  en: 'en-US',
  hi: 'hi-IN',
  te: 'te-IN',
  ta: 'ta-IN',
  kn: 'kn-IN',
  mr: 'mr-IN',
};

interface AppState {
  language: string;
  workerType: WorkerType | null;
  category: Category;
  onboardingComplete: boolean;
  conversationHistory: ConversationMessage[];
  setLanguage: (lang: string) => void;
  setWorkerType: (type: WorkerType) => void;
  setCategory: (cat: Category) => void;
  setOnboardingComplete: (val: boolean) => void;
  addMessage: (msg: ConversationMessage) => void;
  clearConversation: () => void;
  /** BCP-47 locale for Android speech recognition, derived from app language */
  getVoiceLocale: () => string;
}

export const useAppStore = create<AppState>((set, get) => ({
  language: 'en',
  workerType: null,
  category: 'skin',
  onboardingComplete: false,
  conversationHistory: [],
  setLanguage: (language) => set({ language }),
  setWorkerType: (workerType) => set({ workerType }),
  setCategory: (category) => set({ category }),
  setOnboardingComplete: (onboardingComplete) => set({ onboardingComplete }),
  addMessage: (msg) => set((state) => ({
    conversationHistory: [...state.conversationHistory.slice(-20), msg], // Keep last 20 messages
  })),
  clearConversation: () => set({ conversationHistory: [] }),
  getVoiceLocale: () => VOICE_LOCALE_MAP[get().language] ?? 'en-US',
}));
