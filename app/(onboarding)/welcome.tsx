import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAppStore, type WorkerType } from '@/store/app-store';
import { isModelDownloaded, downloadModel, loadModel } from '@/modules/ai/llama-engine';

const LANGUAGES = [
  { label: 'English', code: 'en', native: 'English' },
  { label: 'हिन्दी', code: 'hi', native: 'Hindi' },
  { label: 'తెలుగు', code: 'te', native: 'Telugu' },
  { label: 'தமிழ்', code: 'ta', native: 'Tamil' },
  { label: 'ಕನ್ನಡ', code: 'kn', native: 'Kannada' },
  { label: 'मराठी', code: 'mr', native: 'Marathi' },
];

const WORKER_TYPES: { key: WorkerType; emoji: string; labelKey: string }[] = [
  { key: 'asha', emoji: '🏥', labelKey: 'workerType.asha' },
  { key: 'anganwadi', emoji: '👶', labelKey: 'workerType.anganwadi' },
  { key: 'general', emoji: '🩺', labelKey: 'workerType.general' },
];

type Step = 'language' | 'role';

export default function WelcomeScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const {
    language, workerType, setLanguage, setWorkerType, setOnboardingComplete,
  } = useAppStore();

  const [step, setStep] = useState<Step>('language');
  const [selectedLang, setSelectedLang] = useState(language);
  const [selectedRole, setSelectedRole] = useState<WorkerType | null>(workerType);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadPct, setDownloadPct] = useState(0);
  const fadeAnim = React.useRef(new Animated.Value(1)).current;

  const animateTransition = (nextStep: Step) => {
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
    ]).start();
    setTimeout(() => setStep(nextStep), 150);
  };

  const handleLanguageSelect = (code: string) => {
    setSelectedLang(code);
    setLanguage(code);
    i18n.changeLanguage(code);
  };

  const handleRoleSelect = (role: WorkerType) => {
    setSelectedRole(role);
    setWorkerType(role);
  };

  const goToMain = () => {
    setOnboardingComplete(true);
    router.replace('/(main)/voice' as Href);
    // Start model loading in background
    loadModel().catch(e => console.warn('[Welcome] Background model load error:', e));
  };

  const handleGetStarted = async () => {
    if (!selectedRole) return;

    try {
      const downloaded = await isModelDownloaded();
      if (downloaded) {
        // Model already present — go straight to main screen
        goToMain();
        return;
      }

      // Model not downloaded — ask user
      Alert.alert(
        '📥 Download AI Model?',
        'DermaSeva uses an on-device AI model (~3 GB) for accurate diagnosis. ' +
        'Without it, the app will use guideline-based analysis only.\n\n' +
        'You can always download it later from the voice screen.',
        [
          {
            text: 'Download Now',
            onPress: () => startModelDownload(),
          },
          {
            text: 'Skip for Now',
            style: 'cancel',
            onPress: () => goToMain(),
          },
        ]
      );
    } catch {
      // If check fails, just proceed
      goToMain();
    }
  };

  const startModelDownload = async () => {
    setIsDownloading(true);
    setDownloadPct(0);
    try {
      const success = await downloadModel((p) => {
        setDownloadPct(p.percentage);
      });
      if (success) {
        goToMain();
      } else {
        Alert.alert('Download Failed', 'Could not download the AI model. You can try again from the voice screen.');
        goToMain();
      }
    } catch {
      Alert.alert('Download Error', 'An error occurred. You can try again later.');
      goToMain();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* App branding */}
        <View style={styles.brandSection}>
          <Text style={styles.logoEmoji}>🩺</Text>
          <Text style={styles.appName}>DermaSeva</Text>
          <Text style={styles.tagline}>
            {step === 'language'
              ? 'Select your preferred language'
              : t('welcome.selectRole')}
          </Text>
        </View>

        <Animated.View style={[styles.stepContainer, { opacity: fadeAnim }]}>
          {step === 'language' && (
            <>
              <Text style={styles.stepIndicator}>Step 1 of 2</Text>
              <Text style={styles.stepTitle}>🌐 Language</Text>

              <View style={styles.grid}>
                {LANGUAGES.map((lang) => (
                  <TouchableOpacity
                    key={lang.code}
                    style={[styles.card, selectedLang === lang.code && styles.cardSelected]}
                    onPress={() => handleLanguageSelect(lang.code)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.cardLabel, selectedLang === lang.code && styles.cardLabelSelected]}>
                      {lang.label}
                    </Text>
                    <Text style={[styles.cardSub, selectedLang === lang.code && styles.cardSubSelected]}>
                      {lang.native}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={styles.nextButton}
                onPress={() => animateTransition('role')}
                activeOpacity={0.8}
              >
                <Text style={styles.nextButtonText}>{t('welcome.next') || 'Next'} →</Text>
              </TouchableOpacity>
            </>
          )}

          {step === 'role' && (
            <>
              <Text style={styles.stepIndicator}>{t('welcome.step2') || 'Step 2 of 2'}</Text>
              <Text style={styles.stepTitle}>👤 {t('welcome.yourRole') || 'Your Role'}</Text>

              <View style={styles.roleList}>
                {WORKER_TYPES.map((wt) => (
                  <TouchableOpacity
                    key={wt.key}
                    style={[styles.roleCard, selectedRole === wt.key && styles.roleCardSelected]}
                    onPress={() => handleRoleSelect(wt.key)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.roleEmoji}>{wt.emoji}</Text>
                    <View style={styles.roleTextContainer}>
                      <Text style={[styles.roleLabel, selectedRole === wt.key && styles.roleLabelSelected]}>
                        {t(wt.labelKey)}
                      </Text>
                    </View>
                    {selectedRole === wt.key && <Text style={styles.checkmark}>✓</Text>}
                  </TouchableOpacity>
                ))}
              </View>

              {isDownloading ? (
                <View style={styles.downloadContainer}>
                  <Text style={styles.downloadText}>
                    ⬇️ Downloading AI Model… {downloadPct}%
                  </Text>
                  <View style={styles.downloadBarBg}>
                    <View style={[styles.downloadBarFill, { width: `${downloadPct}%` }]} />
                  </View>
                  <Text style={styles.downloadHint}>
                    Please keep the app open. This may take a few minutes.
                  </Text>
                </View>
              ) : (
                <View style={styles.buttonRow}>
                  <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => animateTransition('language')}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.backButtonText}>← {t('welcome.back') || 'Back'}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.startButton, !selectedRole && styles.startButtonDisabled]}
                    onPress={handleGetStarted}
                    disabled={!selectedRole}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.startButtonText}>{t('welcome.getStarted') || 'Get Started'} 🚀</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7f6f2' },
  scrollContent: { padding: 24, paddingBottom: 40 },

  brandSection: { alignItems: 'center', marginBottom: 32, marginTop: 20 },
  logoEmoji: { fontSize: 56 },
  appName: { fontSize: 34, fontWeight: '900', color: '#01696f', marginTop: 8 },
  tagline: { fontSize: 16, color: '#7a7974', marginTop: 8, textAlign: 'center', lineHeight: 22 },

  stepContainer: { flex: 1 },
  stepIndicator: { fontSize: 12, color: '#b0aeaa', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  stepTitle: { fontSize: 22, fontWeight: '800', color: '#28251d', marginBottom: 20 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: {
    width: '47%', paddingVertical: 18, paddingHorizontal: 16,
    backgroundColor: '#fff', borderRadius: 16,
    borderWidth: 2, borderColor: '#e5e0da',
    alignItems: 'center',
  },
  cardSelected: { borderColor: '#01696f', backgroundColor: '#e6f5f5' },
  cardLabel: { fontSize: 20, fontWeight: '700', color: '#28251d' },
  cardLabelSelected: { color: '#01696f' },
  cardSub: { fontSize: 12, color: '#b0aeaa', marginTop: 4 },
  cardSubSelected: { color: '#01696f' },

  roleList: { gap: 12 },
  roleCard: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 18, paddingHorizontal: 16,
    backgroundColor: '#fff', borderRadius: 16,
    borderWidth: 2, borderColor: '#e5e0da',
  },
  roleCardSelected: { borderColor: '#01696f', backgroundColor: '#e6f5f5' },
  roleEmoji: { fontSize: 32, marginRight: 14 },
  roleTextContainer: { flex: 1 },
  roleLabel: { fontSize: 18, fontWeight: '700', color: '#28251d' },
  roleLabelSelected: { color: '#01696f' },
  checkmark: { fontSize: 22, color: '#01696f', fontWeight: '900' },

  nextButton: {
    backgroundColor: '#01696f', paddingVertical: 16, borderRadius: 14,
    alignItems: 'center', marginTop: 28,
    shadowColor: '#01696f', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },
  nextButtonText: { color: '#fff', fontSize: 18, fontWeight: '700' },

  buttonRow: { flexDirection: 'row', gap: 12, marginTop: 28 },
  backButton: {
    flex: 1, paddingVertical: 16, borderRadius: 14,
    alignItems: 'center', backgroundColor: '#e6e4df',
  },
  backButtonText: { fontSize: 16, fontWeight: '600', color: '#5a5852' },
  startButton: {
    flex: 2, paddingVertical: 16, borderRadius: 14,
    alignItems: 'center', backgroundColor: '#01696f',
    shadowColor: '#01696f', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },
  startButtonDisabled: { backgroundColor: '#bab9b4', shadowOpacity: 0 },
  startButtonText: { color: '#fff', fontSize: 18, fontWeight: '700' },

  downloadContainer: {
    marginTop: 28, padding: 20, backgroundColor: '#e6f5f5',
    borderRadius: 14, borderWidth: 1, borderColor: '#01696f',
    alignItems: 'center',
  },
  downloadText: { fontSize: 16, fontWeight: '700', color: '#01696f', marginBottom: 12 },
  downloadBarBg: {
    width: '100%', height: 8, backgroundColor: '#cde8e8',
    borderRadius: 4, overflow: 'hidden',
  },
  downloadBarFill: { height: 8, backgroundColor: '#01696f', borderRadius: 4 },
  downloadHint: { fontSize: 13, color: '#5a5852', marginTop: 10, textAlign: 'center' },
});
