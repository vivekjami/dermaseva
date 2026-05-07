import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { loadModel, isModelDownloaded } from '@/modules/ai/llama-engine';
import '../i18n';

export default function RootLayout() {
  useEffect(() => {
    // Pre-load the AI model in the background if already downloaded.
    // Download is handled by the onboarding welcome screen or voice screen.
    (async () => {
      try {
        const downloaded = await isModelDownloaded();
        if (downloaded) {
          console.warn('[RootLayout] Model found — pre-loading in background...');
          loadModel().catch(e => console.warn('[RootLayout] Preload error:', e));
        } else {
          console.warn('[RootLayout] Model not downloaded — will prompt user later.');
        }
      } catch (e) {
        console.warn('[RootLayout] Check failed:', e);
      }
    })();
  }, []);

  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(onboarding)" />
        <Stack.Screen name="(main)" />
      </Stack>
    </SafeAreaProvider>
  );
}
