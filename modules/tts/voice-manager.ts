/**
 * voice-manager.ts — Ensures TTS voice data is available for all languages.
 *
 * Google TTS supports te-IN, ta-IN, kn-IN, mr-IN, hi-IN natively.
 * Voice data is downloaded automatically when you first speak in that language.
 * This module triggers that download by speaking a real phrase on language select.
 * It checks if the voice is already available first to avoid unnecessary work.
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

// Real warmup phrases that force Google TTS to initialize the language engine
const WARMUP_PHRASES: Record<string, string> = {
  en: 'System ready.',
  hi: 'सिस्टम तैयार है।',
  te: 'వ్యవస్థ సిద్ధంగా ఉంది.',
  ta: 'அமைப்பு தயாராக உள்ளது.',
  kn: 'ವ್ಯವಸ್ಥೆ ಸಿದ್ಧವಾಗಿದೆ.',
  mr: 'प्रणाली तयार आहे.',
};

/**
 * Trigger TTS voice data download for a language — only if not already available.
 * Does nothing if voice is already installed. No UI, no intents, no settings pages.
 * Just a silent warmup speak that triggers Google TTS auto-download.
 */
export async function ensureTTSVoiceForLanguage(langCode: string): Promise<void> {
  if (Platform.OS !== 'android') return;

  const baseLang = langCode.split('-')[0].toLowerCase();
  const locale = LANG_TO_LOCALE[baseLang] ?? 'en-IN';

  // Check if voice is already available — if so, do nothing
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    const hasVoice = voices.some(v => v.language.toLowerCase().startsWith(baseLang));
    if (hasVoice) {
      console.warn(`[VoiceManager] TTS voice for ${baseLang} already available, skipping.`);
      return;
    }
  } catch {
    // Can't check — proceed with warmup anyway
  }

  console.warn(`[VoiceManager] TTS voice for ${baseLang} not found, triggering warmup download...`);

  // Speak a real phrase in the target language at near-silent volume.
  // Google TTS will initialize the language engine and download voice data in background.
  const phrase = WARMUP_PHRASES[baseLang] ?? WARMUP_PHRASES.en;
  try {
    Speech.speak(phrase, {
      language: locale,
      rate: 1.0,
      pitch: 1.0,
      volume: 0.01,
    });
  } catch {
    // Best-effort — Google TTS will download on first real use anyway
  }
}
