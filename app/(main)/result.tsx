import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import { useEffect } from 'react';

export default function ResultScreen() {
  const { imageUri } = useLocalSearchParams<{ imageUri: string }>();
  const router = useRouter();

  // Log file size to confirm preprocessing worked
  useEffect(() => {
    if (imageUri) {
      FileSystem.getInfoAsync(imageUri).then((info) => {
        if (info.exists) {
          const sizeKB = Math.round((info as any).size / 1024);
          console.log(`Captured image: ${sizeKB}KB at ${imageUri}`);
        }
      });
    }
  }, [imageUri]);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.heading}>📸 Image captured</Text>
      <Text style={styles.sub}>Phase 4 will run AI inference here</Text>

      {imageUri ? (
        <Image
          source={{ uri: imageUri }}
          style={styles.preview}
          resizeMode="cover"
        />
      ) : null}

      <TouchableOpacity style={styles.btn} onPress={() => router.back()}>
        <Text style={styles.btnText}>← Retake</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7f6f2', padding: 24 },
  heading: { fontSize: 24, fontWeight: '700', color: '#28251d', marginBottom: 8 },
  sub: { fontSize: 16, color: '#7a7974', marginBottom: 24 },
  preview: { width: '100%', height: 320, borderRadius: 12, marginBottom: 24 },
  btn: {
    backgroundColor: '#01696f',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
