/**
 * voice-manager.ts — Ensures TTS voice data is available for all languages.
 *
 * Google TTS supports te-IN, ta-IN, kn-IN, mr-IN, hi-IN natively.
 * Voice data is downloaded automatically when you first speak in that language.
 * This module triggers that download by speaking a real phrase on language select.
 */

import { Platform } from 'react-native';
import * as Speech from 'expo-speech';

// Map app language codes to Android TTS locale codes
const LANG_TO_LOCALE: Record<string, string> = {
  en: 'en-IN',
  hi: 'hi-IN',
  te: 'te-IN',
  ta: 'ta-IN',
  kn: 'kn-IN',
  mr: 'mr-IN',
};

// Real warmup phrases — actual sentences that force Google TTS to initialize
// the language engine and trigger voice data download in background
const WARMUP_PHRASES: Record<string, string> = {
  en: 'System ready.',
  hi: 'सिस्टम तैयार है।',
  te: 'వ్యవస్థ సిద్ధంగా ఉంది.',
  ta: 'அமைப்பு தயாராக உள்ளது.',
  kn: 'ವ್ಯವಸ್ಥೆ ಸಿದ್ಧವಾಗಿದೆ.',
  mr: 'प्रणाली तयार आहे.',
};

/**
 * Trigger TTS voice data download for a language.
 * Google TTS auto-downloads voice data when it first encounters a language.
 * We trigger this by speaking a real sentence at near-zero volume.
 */
export async function ensureTTSVoiceForLanguage(langCode: string): Promise<void> {
  if (Platform.OS !== 'android') return;

  const baseLang = langCode.split('-')[0].toLowerCase();
  const locale = LANG_TO_LOCALE[baseLang] ?? 'en-IN';

  console.warn(`[VoiceManager] Triggering TTS voice download for ${locale}...`);

  // Speak a real phrase in the target language.
  // Google TTS engine will:
  //   1. Initialize the language engine for this locale
  //   2. Start downloading voice data in the background if not present
  //   3. Use network synthesis or a basic voice for the first speak
  //   4. Subsequent speaks will use the downloaded offline voice
  const phrase = WARMUP_PHRASES[baseLang] ?? WARMUP_PHRASES.en;

  try {
    Speech.speak(phrase, {
      language: locale,
      rate: 1.0,
      pitch: 1.0,
      volume: 0.01,  // Near-silent — user won't hear this
    });
    console.warn(`[VoiceManager] Warmup speak sent for ${locale}`);
  } catch (e) {
    console.warn(`[VoiceManager] Warmup failed for ${locale}:`, e);
  }

  // Also fire the install data intent as a secondary trigger
  try {
    const IntentLauncher = await import('expo-intent-launcher');
    await IntentLauncher.startActivityAsync(
      'android.speech.tts.engine.INSTALL_TTS_DATA'
    );
  } catch {
    // Not supported on all devices — warmup speak is the primary trigger
  }
}
