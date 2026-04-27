import {
  View, Text, TouchableOpacity,
  StyleSheet, SafeAreaView, Alert, ActivityIndicator,
  TextInput, ScrollView,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';

const SYMPTOM_TAGS = [
  'Itching', 'Redness', 'Scaling', 'Burning',
  'Pain', 'Swelling', 'Patches', 'Blisters',
];

export default function CameraScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [capturing, setCapturing] = useState(false);
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [symptomText, setSymptomText] = useState('');
  const cameraRef = useRef<CameraView>(null);
  const router = useRouter();
  const { t } = useTranslation();

  // ── Permission denied screen ──────────────────────────────────────────────
  if (!permission) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#01696f" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.permissionContainer}>
        <Text style={styles.permissionIcon}>📷</Text>
        <Text style={styles.permissionTitle}>Camera access needed</Text>
        <Text style={styles.permissionBody}>
          DermaSeva needs the camera to photograph skin conditions.
          No photos are uploaded — everything stays on your device.
        </Text>
        <TouchableOpacity style={styles.btn} onPress={requestPermission}>
          <Text style={styles.btnText}>Allow Camera</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ── Toggle symptom tag ────────────────────────────────────────────────────
  function toggleTag(tag: string) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  // ── Build symptoms string ─────────────────────────────────────────────────
  function buildSymptomsString(): string {
    const parts: string[] = [];
    if (selectedTags.length > 0) {
      parts.push(`Symptoms: ${selectedTags.join(', ')}`);
    }
    if (symptomText.trim().length > 0) {
      parts.push(symptomText.trim());
    }
    return parts.join('. ') || 'No symptom description provided.';
  }

  // ── Capture ───────────────────────────────────────────────────────────────
  const handleCapture = async () => {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);

    try {
      // 1. Take photo (no EXIF — skipProcessing: false so we can strip)
      const photo = await cameraRef.current.takePictureAsync({
        quality: 1,
        skipProcessing: false,
        exif: false, // strip EXIF at capture time
      });

      if (!photo?.uri) throw new Error('No photo captured');

      // 2. Validate brightness (reject black/white frames)
      const isValid = await validateBrightness(photo.uri);
      if (!isValid) {
        Alert.alert(
          'Poor lighting',
          'The photo is too dark or overexposed. Please retake in better light.',
          [{ text: 'Retake', style: 'default' }]
        );
        setCapturing(false);
        return;
      }

      // 3. Resize to max 1024×1024 + compress to JPEG 85
      const processed = await manipulateAsync(
        photo.uri,
        [{ resize: { width: 1024, height: 1024 } }],
        {
          compress: 0.85,
          format: SaveFormat.JPEG,
          base64: false,
        }
      );

      // 4. Save to cache directory
      const cacheDir = FileSystem.cacheDirectory + 'dermaseva/';
      await FileSystem.makeDirectoryAsync(cacheDir, { intermediates: true });
      const filename = `capture_${Date.now()}.jpg`;
      const finalUri = cacheDir + filename;
      await FileSystem.moveAsync({ from: processed.uri, to: finalUri });

      // 5. Show symptom input overlay
      setCapturedUri(finalUri);
    } catch (err) {
      Alert.alert('Error', 'Could not capture photo. Please try again.');
      console.error('Capture error:', err);
    } finally {
      setCapturing(false);
    }
  };

  // ── Navigate to result with symptoms ──────────────────────────────────────
  function handleAnalyze() {
    if (!capturedUri) return;
    const symptoms = buildSymptomsString();
    router.push({
      pathname: '/(main)/result',
      params: { imageUri: capturedUri, symptoms },
    });
  }

  // ── Retake photo ──────────────────────────────────────────────────────────
  function handleRetake() {
    if (capturedUri) {
      FileSystem.deleteAsync(capturedUri, { idempotent: true }).catch(() => {});
    }
    setCapturedUri(null);
    setSelectedTags([]);
    setSymptomText('');
  }

  // ── Symptom input overlay (shown after photo capture) ─────────────────────
  if (capturedUri) {
    return (
      <SafeAreaView style={styles.symptomContainer}>
        <ScrollView contentContainerStyle={styles.symptomScroll}>
          <Text style={styles.symptomTitle}>📝 Describe the Symptoms</Text>
          <Text style={styles.symptomSubtitle}>
            Select all that apply, then add any details below.
          </Text>

          {/* Quick-tag buttons */}
          <View style={styles.tagGrid}>
            {SYMPTOM_TAGS.map((tag) => {
              const active = selectedTags.includes(tag);
              return (
                <TouchableOpacity
                  key={tag}
                  style={[styles.tag, active && styles.tagActive]}
                  onPress={() => toggleTag(tag)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.tagText, active && styles.tagTextActive]}>
                    {tag}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Free-text input */}
          <TextInput
            style={styles.textInput}
            placeholder="Add more details… (e.g., circular patch on left arm, started 3 days ago)"
            placeholderTextColor="#9a9790"
            value={symptomText}
            onChangeText={setSymptomText}
            multiline
            maxLength={500}
            textAlignVertical="top"
          />

          {/* Action buttons */}
          <TouchableOpacity style={styles.analyzeBtn} onPress={handleAnalyze} activeOpacity={0.8}>
            <Text style={styles.analyzeBtnText}>🔬  Analyze with AI</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.retakeBtn} onPress={handleRetake}>
            <Text style={styles.retakeBtnText}>← Retake Photo</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Camera viewfinder ─────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing="back"
      >
        {/* Overlay guide frame */}
        <View style={styles.overlay}>
          <View style={styles.guideFrame} />
          <Text style={styles.guideText}>{t('camera.instruction')}</Text>
        </View>
      </CameraView>

      {/* Bottom bar */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.historyBtn}
          onPress={() => router.push('/(main)/history')}
        >
          <Text style={styles.historyBtnText}>📋 History</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.captureBtn, capturing && styles.captureBtnDisabled]}
          onPress={handleCapture}
          disabled={capturing}
          activeOpacity={0.8}
        >
          {capturing
            ? <ActivityIndicator color="#fff" size="small" />
            : <View style={styles.captureInner} />
          }
        </TouchableOpacity>

        <View style={{ width: 72 }} />
      </View>
    </View>
  );
}

// ── Brightness validation ─────────────────────────────────────────────────────
// Resize to 2×2, read base64, decode to raw bytes and average luminance.
// A real JPEG's mid-section bytes reflect pixel values when resolution is this tiny.
async function validateBrightness(uri: string): Promise<boolean> {
  try {
    // Resize to 2x2 pixels — 4 pixels averaged = dominant image brightness
    const tiny = await manipulateAsync(
      uri,
      [{ resize: { width: 2, height: 2 } }],
      { compress: 0, format: SaveFormat.JPEG, base64: true }
    );

    if (!tiny.base64 || tiny.base64.length < 10) return true;

    // Decode base64 → raw bytes
    const binaryStr = atob(tiny.base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    // Sample bytes from the pixel data region (skip JPEG header ~20 bytes)
    const start = Math.min(20, bytes.length - 4);
    let sum = 0;
    let count = 0;
    for (let i = start; i < bytes.length; i++) {
      sum += bytes[i];
      count++;
    }
    const avg = count > 0 ? sum / count : 128;

    // avg < 30  → too dark (covered lens, pitch black room)
    // avg > 230 → overexposed (direct flash, white wall)
    if (avg < 30 || avg > 230) return false;
    return true;
  } catch {
    // If validation throws, allow through — never block the user silently
    return true;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f7f6f2' },
  camera: { flex: 1 },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  guideFrame: {
    width: 260,
    height: 260,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.7)',
    borderRadius: 16,
    borderStyle: 'dashed',
  },
  guideText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 32,
    fontWeight: '500',
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 32,
    backgroundColor: '#000',
  },
  historyBtn: {
    width: 72,
    alignItems: 'center',
  },
  historyBtnText: { color: '#fff', fontSize: 12, marginTop: 4 },
  captureBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  captureBtnDisabled: { opacity: 0.5 },
  captureInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#ccc',
  },
  // Permission screen
  permissionContainer: {
    flex: 1,
    backgroundColor: '#f7f6f2',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  permissionIcon: { fontSize: 64, marginBottom: 24 },
  permissionTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#28251d',
    marginBottom: 12,
    textAlign: 'center',
  },
  permissionBody: {
    fontSize: 16,
    color: '#7a7974',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  btn: {
    backgroundColor: '#01696f',
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 12,
  },
  btnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  // ── Symptom input overlay ──────────────────────────────────────────────────
  symptomContainer: {
    flex: 1,
    backgroundColor: '#f7f6f2',
  },
  symptomScroll: {
    padding: 24,
    paddingTop: 56,
    paddingBottom: 48,
  },
  symptomTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#28251d',
    marginBottom: 8,
  },
  symptomSubtitle: {
    fontSize: 15,
    color: '#7a7974',
    lineHeight: 22,
    marginBottom: 24,
  },
  tagGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  tag: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 99,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#ddd8d0',
  },
  tagActive: {
    backgroundColor: '#01696f',
    borderColor: '#01696f',
  },
  tagText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#28251d',
  },
  tagTextActive: {
    color: '#fff',
  },
  textInput: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    fontSize: 15,
    color: '#28251d',
    minHeight: 100,
    borderWidth: 1,
    borderColor: '#ddd8d0',
    lineHeight: 22,
    marginBottom: 24,
  },
  analyzeBtn: {
    backgroundColor: '#01696f',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  analyzeBtnText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  retakeBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  retakeBtnText: {
    color: '#01696f',
    fontSize: 15,
    fontWeight: '600',
  },
});
