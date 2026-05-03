/**
 * voice-manager.ts — Manages TTS voice availability and automatic download.
 *
 * When a language is selected, this module:
 * 1. Checks if a TTS voice for that language is already installed
 * 2. If not, triggers the Android TTS data install intent (downloads in background)
 * 3. Warms up the TTS engine by speaking a silent/short string to prime the cache
 *
 * Android will automatically download the voice data when the TTS install intent fires.
 * On devices where the intent is not supported, falls back to a warmup speak.
 */

import { Platform } from 'react-native';
import * as Speech from 'expo-speech';

// Map app language codes to TTS locale codes
const LANG_TO_LOCALE: Record<string, string> = {
  en: 'en-IN',
  hi: 'hi-IN',
  te: 'te-IN',
  ta: 'ta-IN',
  kn: 'kn-IN',
  mr: 'mr-IN',
};

// Warmup phrases per language (very short, spoken silently to prime the engine)
const WARMUP_PHRASES: Record<string, string> = {
  en: ' ',
  hi: ' ',
  te: ' ',
  ta: ' ',
  kn: ' ',
  mr: ' ',
};

/**
 * Check if a TTS voice is available for the given language code.
 */
export async function isTTSVoiceAvailable(langCode: string): Promise<boolean> {
  try {
    const baseLang = langCode.split('-')[0].toLowerCase();
    const voices = await Speech.getAvailableVoicesAsync();
    return voices.some(v => v.language.toLowerCase().startsWith(baseLang));
  } catch {
    return false;
  }
}

/**
 * Trigger automatic TTS voice data download for a language.
 * This fires the Android system intent to install TTS data.
 * On iOS or if the intent fails, falls back to a warmup speak.
 */
export async function ensureTTSVoiceForLanguage(langCode: string): Promise<void> {
  const baseLang = langCode.split('-')[0].toLowerCase();
  const locale = LANG_TO_LOCALE[baseLang] ?? 'en-IN';

  // Check if voice is already available
  const available = await isTTSVoiceAvailable(baseLang);
  if (available) {
    console.warn(`[VoiceManager] TTS voice for ${baseLang} already available.`);
    return;
  }

  console.warn(`[VoiceManager] TTS voice for ${baseLang} not found. Triggering download...`);

  if (Platform.OS === 'android') {
    try {
      // Dynamically import to avoid crash on iOS
      const IntentLauncher = await import('expo-intent-launcher');
      // Fire the TTS install data intent — Android opens the TTS engine's data manager
      // and automatically begins downloading the requested language data
      await IntentLauncher.startActivityAsync(
        'android.speech.tts.engine.INSTALL_TTS_DATA'
      );
      console.warn(`[VoiceManager] TTS install intent fired for ${locale}`);
    } catch (e) {
      console.warn('[VoiceManager] Intent failed, using warmup fallback:', e);
      // Fallback: speak a tiny warmup phrase — this nudges Android to
      // download the voice data in background via Google TTS engine
      warmupTTS(baseLang, locale);
    }
  }

  // Also do a warmup speak — on many devices this alone triggers the download
  warmupTTS(baseLang, locale);
}

/**
 * Warm up the TTS engine by speaking a near-silent string in the target language.
 * This causes Android's Google TTS to initialize for that language,
 * which often triggers an automatic background download of voice data.
 */
function warmupTTS(baseLang: string, locale: string) {
  const phrase = WARMUP_PHRASES[baseLang] ?? ' ';
  try {
    Speech.speak(phrase, {
      language: locale,
      rate: 1.0,
      pitch: 1.0,
      volume: 0.01, // Near-silent
    });
  } catch {
    // Ignore — warmup is best-effort
  }
}
