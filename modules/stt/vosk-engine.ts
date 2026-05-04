/**
 * vosk-engine.ts — Offline STT engine using react-native-vosk
 * 
 * Used specifically for Telugu offline support.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { unzip } from 'react-native-zip-archive';
import { loadModel, start, stop, unload, onResult, onPartialResult, onFinalResult } from 'react-native-vosk';

const MODEL_FILENAME = 'vosk-model-small-te-0.42.zip';
const MODEL_FOLDER_NAME = 'vosk-model-small-te-0.42';
const MODEL_URL = 'https://alphacephei.com/vosk/models/vosk-model-small-te-0.42.zip';

function getModelDir(): string {
  return `${FileSystem.documentDirectory}vosk/`;
}

function getZipPath(): string {
  return `${getModelDir()}${MODEL_FILENAME}`;
}

function getExtractedPath(): string {
  return `${getModelDir()}${MODEL_FOLDER_NAME}`;
}

let isLoaded = false;
let resultSubscription: any = null;
let finalResultSubscription: any = null;

export function isVoskLoaded(): boolean {
  return isLoaded;
}

export async function isVoskDownloaded(): Promise<boolean> {
  const info = await FileSystem.getInfoAsync(getExtractedPath());
  return info.exists;
}

export async function downloadVoskModel(
  onProgress?: (pct: number) => void,
): Promise<void> {
  const dir = getModelDir();
  const dirInfo = await FileSystem.getInfoAsync(dir);
  if (!dirInfo.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });

  const zipPath = getZipPath();
  const extractedPath = getExtractedPath();

  // 1. Download ZIP
  const download = FileSystem.createDownloadResumable(
    MODEL_URL,
    zipPath,
    {},
    (progress) => {
      if (onProgress && progress.totalBytesExpectedToWrite > 0) {
        // Zip download is ~80% of the overall process time
        const pct = Math.round(
          (progress.totalBytesWritten / progress.totalBytesExpectedToWrite) * 80,
        );
        onProgress(pct);
      }
    },
  );
  
  const result = await download.downloadAsync();
  if (!result || result.status !== 200) {
    throw new Error(`Download failed with status ${result?.status}`);
  }

  // 2. Unzip
  if (onProgress) onProgress(90); // Inform UI that unzipping started
  await unzip(zipPath, dir);
  
  // 3. Cleanup zip
  await FileSystem.deleteAsync(zipPath, { idempotent: true });
  
  if (onProgress) onProgress(100);
}

export async function loadVoskModel(): Promise<void> {
  if (isLoaded) return;
  const extractedPath = getExtractedPath();
  const exists = await isVoskDownloaded();
  if (!exists) throw new Error('Vosk Telugu model not downloaded');

  // react-native-vosk expects the path to the model directory
  // We need to strip the file:// prefix on Android
  const safePath = extractedPath.replace('file://', '');
  
  await loadModel(safePath);
  isLoaded = true;
}

export async function releaseVoskModel(): Promise<void> {
  if (isLoaded) {
    await unload();
    isLoaded = false;
  }
}

let resolveRecording: ((text: string) => void) | null = null;
let rejectRecording: ((err: any) => void) | null = null;

export async function startVoskRecording(): Promise<void> {
  if (!isLoaded) throw new Error('Vosk not loaded');
  if (resolveRecording) throw new Error('Vosk recording already in progress');

  return new Promise<void>((resolve, reject) => {
    start()
      .then(() => {
        resolve();
      })
      .catch((err) => reject(err));
  });
}

/**
 * Returns a promise that will resolve with the final text when the recording stops.
 */
export function listenForVoskResult(): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    resolveRecording = resolve;
    rejectRecording = reject;

    // Listen to final result
    finalResultSubscription = onFinalResult((e: string) => {
      // e is usually a JSON string like '{"text": "something"}'
      try {
        const parsed = JSON.parse(e);
        if (resolveRecording) {
          resolveRecording(parsed.text ?? '');
        }
      } catch {
        if (resolveRecording) resolveRecording(e);
      }
      cleanupSubscriptions();
    });

    // Alternatively, if it fails
    // Vosk doesn't have an error listener that we can trivially bind here without risking memory leaks if not handled
    // We will just let the user call stop()
  });
}

export function stopVoskRecording(): void {
  if (!resolveRecording) return;
  stop();
  // `stop()` triggers `onFinalResult` which calls `resolveRecording`
}

function cleanupSubscriptions() {
  resolveRecording = null;
  rejectRecording = null;
  if (resultSubscription) {
    resultSubscription.remove();
    resultSubscription = null;
  }
  if (finalResultSubscription) {
    finalResultSubscription.remove();
    finalResultSubscription = null;
  }
}
