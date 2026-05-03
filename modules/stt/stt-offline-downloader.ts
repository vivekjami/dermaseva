/**
 * stt-offline-downloader.ts — Silently triggers offline STT model downloads
 * for all supported Indian languages.
 *
 * Uses expo-speech-recognition's androidTriggerOfflineModelDownload which calls
 * Android's SpeechRecognizer.triggerModelDownload() API (Android 13+).
 * On supported devices this downloads silently with no UI overlay.
 *
 * This should be called ONCE during app setup/startup — not on language change.
 */

import { Platform } from 'react-native';

// All languages the app supports
const STT_LOCALES = ['en-US', 'hi-IN', 'te-IN', 'ta-IN', 'kn-IN', 'mr-IN'];

let hasTriggered = false;

/**
 * Trigger offline STT model download for all 6 languages.
 * Safe to call multiple times — only runs once per app session.
 * Runs silently in the background, no UI.
 */
export async function downloadAllOfflineSTTModels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  if (hasTriggered) return;
  hasTriggered = true;

  // Dynamic import to avoid crash on iOS
  let ExpoSpeechRecognitionModule: any;
  try {
    const mod = await import('expo-speech-recognition');
    ExpoSpeechRecognitionModule = mod.ExpoSpeechRecognitionModule;
  } catch {
    console.warn('[STT-Offline] expo-speech-recognition not available');
    return;
  }

  // Check if on-device recognition is supported
  try {
    const supported = ExpoSpeechRecognitionModule.supportsOnDeviceRecognition?.();
    if (!supported) {
      console.warn('[STT-Offline] On-device recognition not supported on this device');
      return;
    }
  } catch {
    // supportsOnDeviceRecognition may not exist on older versions
  }

  console.warn('[STT-Offline] Triggering offline model downloads for all languages...');

  // Download each language sequentially — each call is non-blocking
  for (const locale of STT_LOCALES) {
    try {
      await ExpoSpeechRecognitionModule.androidTriggerOfflineModelDownload({ locale });
      console.warn(`[STT-Offline] Download triggered: ${locale}`);
    } catch (e: unknown) {
      // Some locales may not be supported on this device — that's OK
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[STT-Offline] Skipped ${locale}: ${msg}`);
    }
    // Small delay between requests to avoid overwhelming the system
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.warn('[STT-Offline] All offline STT download triggers complete');
}
