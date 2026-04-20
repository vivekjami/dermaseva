import { create } from 'zustand';

type WorkerType = 'asha' | 'anganwadi' | 'general';

interface AppState {
  language: string;
  workerType: WorkerType | null;
  setLanguage: (lang: string) => void;
  setWorkerType: (type: WorkerType) => void;
}

export const useAppStore = create<AppState>((set) => ({
  language: 'en',
  workerType: null,
  setLanguage: (language) => set({ language }),
  setWorkerType: (workerType) => set({ workerType }),
}));
