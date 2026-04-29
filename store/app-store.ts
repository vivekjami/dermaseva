import { create } from 'zustand';

type WorkerType = 'asha' | 'anganwadi' | 'general';

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
  setLanguage: (lang: string) => void;
  setWorkerType: (type: WorkerType) => void;
  /** BCP-47 locale for Android speech recognition, derived from app language */
  getVoiceLocale: () => string;
}

export const useAppStore = create<AppState>((set, get) => ({
  language: 'en',
  workerType: null,
  setLanguage: (language) => set({ language }),
  setWorkerType: (workerType) => set({ workerType }),
  getVoiceLocale: () => VOICE_LOCALE_MAP[get().language] ?? 'en-US',
}));
