// Stub for react-native-litert-lm
// Real LiteRT inference is not yet available as a stable RN package.
// The app uses DEV_MOCK_MODE=true which bypasses this entirely.
// Replace with the real package when a stable native build is available.

export interface LLMSession {
  loadModel(path: string, opts: { backend: string; systemPrompt: string }): Promise<void>;
  sendMessage(prompt: string): Promise<string>;
  close(): void;
}

export function createLLM(): LLMSession {
  return {
    loadModel: async () => { throw new Error('LiteRT not available — use mock mode'); },
    sendMessage: async () => { throw new Error('LiteRT not available — use mock mode'); },
    close: () => {},
  };
}
