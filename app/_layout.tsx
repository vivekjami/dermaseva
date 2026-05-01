import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { loadModel, isModelDownloaded, downloadModel } from '@/modules/ai/llama-engine';
import '../i18n';

export default function RootLayout() {
  useEffect(() => {
    // Pre-load the AI model in the background to save time later
    (async () => {
      try {
        let downloaded = await isModelDownloaded();

        // If not downloaded, start background download
        if (!downloaded) {
          console.warn('[RootLayout] Model not found — starting background download...');
          const success = await downloadModel((p) => {
            if (p.percentage % 10 === 0) console.warn(`[RootLayout] Download: ${p.percentage}%`);
          });
          if (!success) {
            console.warn('[RootLayout] Download failed, will use guideline mode.');
            return;
          }
          downloaded = true;
        }

        if (downloaded) {
          console.warn('[RootLayout] Pre-loading AI model in background...');
          loadModel().catch(e => console.warn('[RootLayout] Preload error:', e));
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
