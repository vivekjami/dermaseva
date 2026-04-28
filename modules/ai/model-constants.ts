// Shared constants for the AI model — used by both litert.ts and model-verifier.ts.
// Extracted to avoid circular dependency.
//
// Switched from E4B (3.65 GB) → E2B (2.58 GB):
//   - E2B runs on Raspberry Pi 5 (CPU-only) — so it works on mid-range phones
//   - Uses ~1.5 GB RAM vs ~3 GB for E4B
//   - Still multimodal (text + vision + audio)
//   - Vision and audio models loaded on demand (not at init)

import * as FileSystem from 'expo-file-system/legacy';

export const MODEL_NAME = 'gemma-4-E2B-it.litertlm';
export const MODEL_DOWNLOAD_URL =
  'https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it.litertlm';
export const MODEL_SIZE_BYTES = 2_580_000_000; // ~2.58 GB (Gemma 4 E2B LiteRT-LM)

export const MODEL_LOCAL_PATH = `${FileSystem.documentDirectory}models/${MODEL_NAME}`;
