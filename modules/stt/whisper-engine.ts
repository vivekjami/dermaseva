/**
 * whisper-engine.ts — Offline STT fallback using whisper.rn (whisper.cpp).
 *
 * Used ONLY when:
 * 1. Device is offline (airplane mode), AND
 * 2. Google doesn't have an offline model for the selected language
 *    (e.g., Telugu, Tamil, Kannada, Marathi)
 *
 * The multilingual ggml-base model (~142MB) supports ALL languages
 * with a single file.
 */

// @ts-expect-error - whisper.rn types don't resolve with our tsconfig
import { initWhisper, type WhisperContext } from 'whisper.rn';
import * as FileSystem from 'expo-file-system/legacy';

const MODEL_FILENAME = 'ggml-base.bin';
const MODEL_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin';

function getModelDir(): string {
  return `${FileSystem.documentDirectory}whisper/`;
}

function getModelPath(): string {
  return `${getModelDir()}${MODEL_FILENAME}`;
}

// ─── Singleton context ─────────────────────────────────────────────────────
let ctx: WhisperContext | null = null;

export function isWhisperLoaded(): boolean {
  return ctx !== null;
}

export async function isWhisperDownloaded(): Promise<boolean> {
  const info = await FileSystem.getInfoAsync(getModelPath());
  return info.exists;
}

// Language code mapping: BCP-47 → Whisper language code
const WHISPER_LANG_MAP: Record<string, string> = {
  'en-US': 'en', 'en-IN': 'en',
  'hi-IN': 'hi',
  'te-IN': 'te',
  'ta-IN': 'ta',
  'kn-IN': 'kn',
  'mr-IN': 'mr',
};

export async function downloadWhisperModel(
  onProgress?: (pct: number) => void,
): Promise<void> {
  const dir = getModelDir();
  const dirInfo = await FileSystem.getInfoAsync(dir);
  if (!dirInfo.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });

  const dest = getModelPath();
  const download = FileSystem.createDownloadResumable(
    MODEL_URL,
    dest,
    {},
    (progress) => {
      if (onProgress && progress.totalBytesExpectedToWrite > 0) {
        const pct = Math.round(
          (progress.totalBytesWritten / progress.totalBytesExpectedToWrite) * 100,
        );
        onProgress(pct);
      }
    },
  );
  const result = await download.downloadAsync();
  if (!result || result.status !== 200) {
    throw new Error(`Download failed with status ${result?.status}`);
  }
}

export async function loadWhisperModel(): Promise<void> {
  if (ctx) return; // Already loaded
  const modelPath = getModelPath();
  const exists = await isWhisperDownloaded();
  if (!exists) throw new Error('Whisper model not downloaded');

  ctx = await initWhisper({ filePath: modelPath });
}

export async function releaseWhisperModel(): Promise<void> {
  if (ctx) {
    await ctx.release();
    ctx = null;
  }
}

export async function transcribeAudio(
  audioPath: string,
  locale: string,
): Promise<{ text: string }> {
  if (!ctx) throw new Error('Whisper not loaded');

  const lang = WHISPER_LANG_MAP[locale] ?? locale.split('-')[0] ?? 'en';

  const result = await ctx.transcribe(audioPath, {
    language: lang,
    maxLen: 1,
    tokenTimestamps: false,
  });

  return { text: (result.result ?? '').trim() };
}
