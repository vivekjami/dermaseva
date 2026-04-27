// Shared constants for the AI model — used by both litert.ts and model-verifier.ts.
// Extracted to avoid circular dependency.

import * as FileSystem from 'expo-file-system/legacy';

export const MODEL_NAME = 'gemma-4-E4B-it.litertlm';
export const MODEL_DOWNLOAD_URL =
  'https://huggingface.co/litert-community/gemma-4-E4B-it-litert-lm/resolve/main/gemma-4-E4B-it.litertlm';
export const MODEL_SIZE_BYTES = 3_650_000_000; // ~3.65 GB (Gemma 4 E4B LiteRT-LM)

export const MODEL_LOCAL_PATH = `${FileSystem.documentDirectory}models/${MODEL_NAME}`;
