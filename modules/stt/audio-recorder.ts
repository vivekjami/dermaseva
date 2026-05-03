/**
 * audio-recorder.ts — Records microphone audio via expo-av.
 *
 * Android: outputs 16kHz mono M4A (AAC) — whisper.rn decodes it natively.
 * iOS: outputs 16kHz mono WAV (PCM) — the format Whisper expects directly.
 * Used only as part of the Whisper fallback path.
 */

import { Audio } from 'expo-av';

let recording: Audio.Recording | null = null;

/**
 * Start recording from the microphone.
 * Configured for 16kHz mono (optimal for Whisper).
 */
export async function startRecording(): Promise<void> {
  // Request permission
  const { status } = await Audio.requestPermissionsAsync();
  if (status !== 'granted') throw new Error('Microphone permission denied');

  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
  });

  recording = new Audio.Recording();
  await recording.prepareToRecordAsync({
    isMeteringEnabled: false,
    android: {
      // Android DEFAULT encoder produces AMR, not WAV PCM.
      // whisper.rn can decode common formats (wav, mp4/aac, etc.)
      // via its native layer, so we use MPEG_4 + AAC which is
      // universally supported on Android and decodable by whisper.rn.
      extension: '.m4a',
      outputFormat: Audio.AndroidOutputFormat.MPEG_4,
      audioEncoder: Audio.AndroidAudioEncoder.AAC,
      sampleRate: 16000,
      numberOfChannels: 1,
      bitRate: 128000,
    },
    ios: {
      extension: '.wav',
      outputFormat: Audio.IOSOutputFormat.LINEARPCM,
      audioQuality: Audio.IOSAudioQuality.HIGH,
      sampleRate: 16000,
      numberOfChannels: 1,
      bitRate: 256000,
      linearPCMBitDepth: 16,
      linearPCMIsBigEndian: false,
      linearPCMIsFloat: false,
    },
    web: {},
  });

  await recording.startAsync();
  console.warn('[AudioRecorder] Recording started');
}

/**
 * Stop recording and return the file path.
 * Returns null if no recording was in progress.
 */
export async function stopRecording(): Promise<string | null> {
  if (!recording) return null;
  try {
    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    return uri;
  } finally {
    recording = null;
  }
}
