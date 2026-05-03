/**
 * audio-recorder.ts — Records microphone audio via expo-av.
 *
 * Outputs 16kHz mono WAV — the format Whisper expects.
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
      extension: '.wav',
      outputFormat: Audio.AndroidOutputFormat.DEFAULT,
      audioEncoder: Audio.AndroidAudioEncoder.DEFAULT,
      sampleRate: 16000,
      numberOfChannels: 1,
      bitRate: 256000,
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
