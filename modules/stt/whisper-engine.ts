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

let realtimeSession: { stop: () => Promise<void>, promise: Promise<{ text: string }> } | null = null;

export async function startWhisperRecording(locale: string): Promise<void> {
  if (!ctx) throw new Error('Whisper not loaded');
  if (realtimeSession) throw new Error('Whisper recording already in progress');

  const lang = WHISPER_LANG_MAP[locale] ?? locale.split('-')[0] ?? 'en';
  console.warn(`[Whisper] Starting native realtime recording: lang=${lang}`);

  let resolveFinal: (res: { text: string }) => void;
  const promise = new Promise<{ text: string }>((res) => {
    resolveFinal = res;
  });

  const { stop, subscribe } = await ctx.transcribeRealtime({
    language: lang,
    tokenTimestamps: false,
    beamSize: 1,        // Greedy decoding for speed
    bestOf: 1,          // Only keep 1 candidate
    temperature: 0.0,   // Deterministic
    temperatureInc: 0.0, // Disable temp fallback
  });

  subscribe((evt) => {
    if (!evt.isCapturing) {
      console.warn(`[Whisper] Realtime ended: "${evt.data?.result}", aborted=${evt.isStoppedByAction}`);
      let text = (evt.data?.result ?? '').trim();
      
      const lowerText = text.toLowerCase().replace(/[^a-z]/g, '');
      const hallucinations = ['skull', 'silence', 'blank', 'thankyou', 'thanksforwatching', 'subsby', 'subtitlesby'];
      if (hallucinations.includes(lowerText)) {
        console.warn(`[Whisper] Filtered hallucination: "${text}"`);
        text = '';
      }
      
      resolveFinal({ text });
    }
  });

  realtimeSession = { stop, promise };
}

export async function stopWhisperRecording(): Promise<{ text: string }> {
  if (!realtimeSession) throw new Error('No whisper recording in progress');
  console.warn('[Whisper] Stopping realtime recording...');
  
  await realtimeSession.stop();
  const result = await realtimeSession.promise;
  realtimeSession = null;
  
  return result;
}
