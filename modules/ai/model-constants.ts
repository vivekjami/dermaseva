// Shared constants for the AI model — used by both litert.ts and model-verifier.ts.
// Extracted to avoid circular dependency.
//
// Gemma 4 E2B (2.58 GB) — runs on Raspberry Pi 5 CPU-only,
// compatible with mid-range Android phones (4GB+ RAM).

import * as FileSystem from 'expo-file-system/legacy';

export const MODEL_NAME = 'gemma-4-E2B-it.litertlm';
export const MODEL_DOWNLOAD_URL =
  'https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it.litertlm';
export const MODEL_SIZE_BYTES = 2_580_000_000; // ~2.58 GB (Gemma 4 E2B LiteRT-LM)

export const MODEL_LOCAL_PATH = `${FileSystem.documentDirectory}models/${MODEL_NAME}`;
