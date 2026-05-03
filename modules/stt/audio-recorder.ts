/**
 * audio-recorder.ts — Records audio from the microphone and saves as WAV.
 * Uses expo-av for recording. Output is 16kHz mono WAV (required by Whisper).
 */

import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';

const RECORDING_DIR = `${FileSystem.cacheDirectory}recordings/`;
let currentRecording: Audio.Recording | null = null;

/**
 * Start recording from the microphone.
 * Returns a promise that resolves when recording starts.
 */
export async function startRecording(): Promise<void> {
  // Ensure recording directory exists
  const dirInfo = await FileSystem.getInfoAsync(RECORDING_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(RECORDING_DIR, { intermediates: true });
  }

  // Request permissions
  const { granted } = await Audio.requestPermissionsAsync();
  if (!granted) throw new Error('Microphone permission not granted');

  // Configure audio session for recording
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
  });

  // Create recording with settings optimized for Whisper
  // Whisper requires: 16kHz, mono, 16-bit PCM (WAV)
  const recording = new Audio.Recording();
  await recording.prepareToRecordAsync({
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
    web: {
      mimeType: 'audio/wav',
      bitsPerSecond: 256000,
    },
  });

  await recording.startAsync();
  currentRecording = recording;
  console.warn('[AudioRecorder] Recording started');
}

/**
 * Stop recording and return the file path to the recorded WAV file.
 */
export async function stopRecording(): Promise<string | null> {
  if (!currentRecording) return null;

  try {
    await currentRecording.stopAndUnloadAsync();
    const uri = currentRecording.getURI();
    currentRecording = null;

    // Reset audio mode
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
    });

    console.warn('[AudioRecorder] Recording stopped, file:', uri);
    return uri;
  } catch (e) {
    console.warn('[AudioRecorder] Error stopping recording:', e);
    currentRecording = null;
    return null;
  }
}

/**
 * Check if currently recording.
 */
export function isRecording(): boolean {
  return currentRecording !== null;
}
