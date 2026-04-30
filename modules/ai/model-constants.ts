// Shared constants for the AI model — used by llama-engine.ts and model-verifier.ts.
//
// Gemma 4 E2B (Q4_K_M GGUF) — quantized via llama.cpp for mobile deployment.
// Memory-mapped loading, no full RAM required. ~3.11 GB on disk.

import * as FileSystem from 'expo-file-system/legacy';

export const MODEL_NAME = 'gemma-4-E2B-it-Q4_K_M.gguf';
export const MODEL_DOWNLOAD_URL =
  'https://huggingface.co/unsloth/gemma-4-E2B-it-GGUF/resolve/main/gemma-4-E2B-it-Q4_K_M.gguf';
export const MODEL_SIZE_BYTES = 3_110_000_000; // ~3.11 GB (Q4_K_M GGUF)

export const MODEL_LOCAL_PATH = `${FileSystem.documentDirectory}models/${MODEL_NAME}`;
