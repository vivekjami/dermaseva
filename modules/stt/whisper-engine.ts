/**
 * whisper-engine.ts — Fully offline speech-to-text using whisper.rn (whisper.cpp)
 *
 * Uses OpenAI Whisper 'base' model (~142MB) which supports ALL languages natively.
 * Single model file handles English, Hindi, Telugu, Tamil, Kannada, Marathi.
 * Downloads model on first use, stores alongside the LLM model.
 */

// @ts-expect-error - whisper.rn package doesn't resolve types correctly with our tsconfig
import { initWhisper, type WhisperContext } from 'whisper.rn';
import * as FileSystem from 'expo-file-system/legacy';

// ── Model Constants ──────────────────────────────────────────────────────────

export const WHISPER_MODEL_NAME = 'ggml-base.bin';
export const WHISPER_MODEL_URL =
  'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin';
export const WHISPER_MODEL_SIZE_BYTES = 142_000_000; // ~142MB

const MODELS_DIR = `${FileSystem.documentDirectory}models/`;
export const WHISPER_MODEL_PATH = `${MODELS_DIR}${WHISPER_MODEL_NAME}`;

// ── State ────────────────────────────────────────────────────────────────────

let whisperCtx: WhisperContext | null = null;
let loadPromise: Promise<void> | null = null;

// ── Download ─────────────────────────────────────────────────────────────────

export async function isWhisperDownloaded(): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(WHISPER_MODEL_PATH);
    return info.exists && info.size > 100_000_000; // > 100MB to ensure not corrupt
  } catch {
    return false;
  }
}

export async function downloadWhisperModel(
  onProgress?: (pct: number) => void
): Promise<void> {
  // Ensure models directory exists
  const dirInfo = await FileSystem.getInfoAsync(MODELS_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(MODELS_DIR, { intermediates: true });
  }

  const downloadResumable = FileSystem.createDownloadResumable(
    WHISPER_MODEL_URL,
    WHISPER_MODEL_PATH,
    {},
    (progress) => {
      if (onProgress) {
        const pct = (progress.totalBytesWritten / progress.totalBytesExpectedToWrite) * 100;
        onProgress(Math.round(pct));
      }
    }
  );

  const result = await downloadResumable.downloadAsync();
  if (!result?.uri) throw new Error('Whisper model download failed');
  console.warn('[WhisperEngine] Model downloaded to:', result.uri);
}

// ── Load ─────────────────────────────────────────────────────────────────────

export function isWhisperLoaded(): boolean {
  return whisperCtx !== null;
}

export async function loadWhisperModel(): Promise<void> {
  if (whisperCtx) return;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      const downloaded = await isWhisperDownloaded();
      if (!downloaded) {
        throw new Error('Whisper model not downloaded');
      }

      console.warn('[WhisperEngine] Loading model...');
      whisperCtx = await initWhisper({
        filePath: WHISPER_MODEL_PATH,
      });
      console.warn('[WhisperEngine] Model loaded successfully');
    } catch (e) {
      loadPromise = null;
      throw e;
    }
  })();

  return loadPromise;
}

// ── Transcribe ───────────────────────────────────────────────────────────────

// Map app language codes to Whisper language codes
const LANG_MAP: Record<string, string> = {
  en: 'en',
  hi: 'hi',
  te: 'te',
  ta: 'ta',
  kn: 'kn',
  mr: 'mr',
};

export interface TranscribeResult {
  text: string;
  segments: Array<{ text: string; t0: number; t1: number }>;
}

/**
 * Transcribe an audio file (WAV format, 16kHz mono).
 * Returns the transcription text.
 */
export async function transcribeAudio(
  audioFilePath: string,
  langCode: string
): Promise<TranscribeResult> {
  if (!whisperCtx) {
    throw new Error('Whisper model not loaded. Call loadWhisperModel() first.');
  }

  const baseLang = langCode.split('-')[0].toLowerCase();
  const whisperLang = LANG_MAP[baseLang] ?? 'en';

  console.warn(`[WhisperEngine] Transcribing in language: ${whisperLang}`);

  const { promise } = whisperCtx.transcribe(audioFilePath, {
    language: whisperLang,
    maxLen: 0,        // No max length constraint
    translate: false,  // Don't translate, keep original language
  });

  const { result, segments } = await promise;
  console.warn(`[WhisperEngine] Transcription result: ${result}`);

  return {
    text: result.trim(),
    segments: segments ?? [],
  };
}

/**
 * Release the Whisper context to free memory.
 */
export async function releaseWhisper(): Promise<void> {
  if (whisperCtx) {
    await whisperCtx.release();
    whisperCtx = null;
    loadPromise = null;
    console.warn('[WhisperEngine] Context released');
  }
}
