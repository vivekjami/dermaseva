/**
 * voice-manager.ts — Manages TTS voice availability and download.
 *
 * Strategy:
 * 1. When a language is selected, check if a TTS voice exists for it
 * 2. If it exists → do nothing (already good)
 * 3. If missing → do a warmup speak with a real phrase in that language.
 *    Google TTS auto-downloads voice data when it first encounters a language.
 * 4. If the user wants to manually download → open Android TTS settings directly
 *
 * Note: There is NO silent background download API on Android for TTS voices.
 * Google TTS handles downloads automatically when a language is first used.
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

// Real warmup phrases per language — must be actual text, not just spaces.
// Google TTS will attempt to synthesize these, triggering voice data download.
const WARMUP_PHRASES: Record<string, string> = {
  en: 'Ready.',
  hi: 'तैयार।',
  te: 'సిద్ధం.',
  ta: 'தயார்.',
  kn: 'ಸಿದ್ಧ.',
  mr: 'तयार.',
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
 * Ensure TTS voice is available for a language.
 * Triggers Google TTS to download voice data by speaking a short phrase.
 */
export async function ensureTTSVoiceForLanguage(langCode: string): Promise<void> {
  const baseLang = langCode.split('-')[0].toLowerCase();
  const locale = LANG_TO_LOCALE[baseLang] ?? 'en-IN';

  const available = await isTTSVoiceAvailable(baseLang);
  if (available) {
    console.warn(`[VoiceManager] TTS voice for ${baseLang} already available.`);
    return;
  }

  console.warn(`[VoiceManager] TTS voice for ${baseLang} not found. Triggering warmup...`);

  // Speak a real phrase in the target language.
  // Google TTS engine will:
  //   1. Use a basic/fallback voice immediately
  //   2. Start downloading the high-quality voice data in background
  // This is the most reliable way to trigger voice downloads on Android.
  warmupTTS(baseLang, locale);

  // Also try the TTS install intent as a secondary trigger
  if (Platform.OS === 'android') {
    try {
      const IntentLauncher = await import('expo-intent-launcher');
      await IntentLauncher.startActivityAsync(
        'android.speech.tts.engine.INSTALL_TTS_DATA'
      );
    } catch {
      // Intent not supported on this device — warmup alone should work
    }
  }
}

/**
 * Open Android TTS settings so the user can download voice data.
 * Call this from a "Download Voice" button in the UI.
 */
export async function openTTSSettings(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    const IntentLauncher = await import('expo-intent-launcher');
    await IntentLauncher.startActivityAsync('com.android.settings.TTS_SETTINGS');
  } catch {
    // Fallback to generic settings
    try {
      const { Linking } = await import('react-native');
      await Linking.openSettings();
    } catch { /* ignore */ }
  }
}

/**
 * Warm up TTS engine by speaking a real phrase in the target language.
 * Google TTS auto-downloads voice data when encountering a new language.
 */
function warmupTTS(baseLang: string, locale: string) {
  const phrase = WARMUP_PHRASES[baseLang] ?? 'Ready.';
  try {
    Speech.speak(phrase, {
      language: locale,
      rate: 1.0,
      pitch: 1.0,
      volume: 0.01, // Near-silent so user doesn't hear the warmup
    });
    console.warn(`[VoiceManager] Warmup speak sent for ${locale}`);
  } catch {
    // Ignore — best-effort
  }
}
