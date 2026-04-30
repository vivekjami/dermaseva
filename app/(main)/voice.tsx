import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Animated, Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/store/app-store';
import { initHistoryDB } from '@/modules/db/patient-history';

const MAX_CHARS = 800;

const VOICE_LANGUAGES = [
  { label: 'English', code: 'en-US', appCode: 'en' },
  { label: 'हिन्दी', code: 'hi-IN', appCode: 'hi' },
  { label: 'తెలుగు', code: 'te-IN', appCode: 'te' },
  { label: 'தமிழ்', code: 'ta-IN', appCode: 'ta' },
  { label: 'ಕನ್ನಡ', code: 'kn-IN', appCode: 'kn' },
  { label: 'मराठी', code: 'mr-IN', appCode: 'mr' },
];

const WORKER_TYPES = [
  { key: 'asha' as const, emoji: '🏥' },
  { key: 'anganwadi' as const, emoji: '👶' },
  { key: 'general' as const, emoji: '🩺' },
];

type InputMode = 'voice' | 'text';

export default function VoiceScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const {
    language: appLanguage, workerType, setLanguage, setWorkerType,
  } = useAppStore();

  const [inputMode, setInputMode] = useState<InputMode>('voice');
  const [isListening, setIsListening] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState(
    VOICE_LANGUAGES.find((l) => l.appCode === appLanguage)?.code ?? 'en-US'
  );
  const [error, setError] = useState('');
  const [showSetup, setShowSetup] = useState(!workerType);

  // Pulse animation for mic button
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Init DB on mount
  useEffect(() => { initHistoryDB(); }, []);

  // Check if on-device speech model is available, trigger download if not
  useEffect(() => {
    async function checkOfflineModel() {
      try {
        const onDeviceAvailable = ExpoSpeechRecognitionModule.supportsOnDeviceRecognition();
        if (onDeviceAvailable) {
          // Trigger offline model download for the selected language
          // This opens a system dialog — user can dismiss if already installed
          ExpoSpeechRecognitionModule.androidTriggerOfflineModelDownload({
            locale: selectedLanguage,
          }).catch(() => {
            // User dismissed or already installed — that's fine
          });
        }
      } catch {
        // supportsOnDeviceRecognition not available — skip
      }
    }
    checkOfflineModel();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── expo-speech-recognition event hooks ──────────────────────────────────
  useSpeechRecognitionEvent('start', () => {
    setIsListening(true);
    setError('');
  });

  useSpeechRecognitionEvent('end', () => {
    setIsListening(false);
  });

  useSpeechRecognitionEvent('result', (event) => {
    if (event.results && event.results.length > 0) {
      const latestTranscript = event.results[0]?.transcript ?? '';
      if (event.isFinal) {
        // Final result — append to existing transcription
        setTranscription((prev) => {
          if (!prev.trim()) return latestTranscript;
          return `${prev} ${latestTranscript}`;
        });
      }
    }
  });

  useSpeechRecognitionEvent('error', (event) => {
    console.error('[Voice] Error:', event.error, event.message);
    // Don't show "no-speech" as an error — user just didn't say anything
    if (event.error === 'no-speech') {
      setIsListening(false);
      return;
    }
    setError(event.message || t('voice.speechFailed'));
    setIsListening(false);
  });

  // Pulse animation when listening
  useEffect(() => {
    if (isListening) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.18, duration: 500, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isListening, pulseAnim]);

  // ─── Language change ──────────────────────────────────────────────────────
  const handleLanguageChange = (langCode: string, appCode: string) => {
    setSelectedLanguage(langCode);
    setLanguage(appCode);
    i18n.changeLanguage(appCode);
  };

  // ─── Voice — TAP TO TOGGLE ────────────────────────────────────────────────
  const toggleListening = async () => {
    setError('');
    Keyboard.dismiss();

    if (isListening) {
      // Currently listening → stop
      ExpoSpeechRecognitionModule.stop();
      return;
    }

    // Not listening → request permissions and start
    try {
      const permResult = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permResult.granted) {
        setError(t('voice.permissionDenied'));
        return;
      }

      // Start speech recognition — prefer on-device for offline use
      ExpoSpeechRecognitionModule.start({
        lang: selectedLanguage,
        interimResults: false,
        maxAlternatives: 1,
        continuous: false,
        addsPunctuation: true,
        // Use on-device recognition for fully offline operation.
        // Falls back to cloud if on-device model isn't installed.
        requiresOnDeviceRecognition: true,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[Voice] start error:', msg);

      // If on-device recognition failed, retry without it (cloud fallback)
      if (msg.includes('on-device') || msg.includes('not available')) {
        console.warn('[Voice] On-device not available, trying cloud recognition');
        try {
          ExpoSpeechRecognitionModule.start({
            lang: selectedLanguage,
            interimResults: false,
            maxAlternatives: 1,
            continuous: false,
            addsPunctuation: true,
            requiresOnDeviceRecognition: false,
          });
          return;
        } catch (fallbackErr) {
          const fbMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
          setError(t('voice.startFailed') + `: ${fbMsg}`);
        }
      } else {
        setError(t('voice.startFailed') + (msg ? `: ${msg}` : ''));
      }
      setIsListening(false);
    }
  };

  const clearTranscription = () => {
    setTranscription('');
    setError('');
  };

  const submitToAI = () => {
    if (!transcription.trim()) {
      setError(t('voice.noSymptoms'));
      return;
    }
    router.push({
      pathname: '/(main)/result' as Href,
      params: {
        symptoms: transcription.slice(0, MAX_CHARS),
        language: selectedLanguage,
        inputMode,
      },
    });
  };

  const navigateToHistory = () => {
    router.push('/(main)/history' as Href);
  };

  const charCount = transcription.length;
  const isOverLimit = charCount > MAX_CHARS;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header + Greeting */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.appName}>🩺 DermaSeva</Text>
            <Text style={styles.greeting}>{t('voice.greeting')}</Text>
          </View>
          <TouchableOpacity onPress={navigateToHistory} style={styles.historyBtn}>
            <Text style={styles.historyBtnText}>📋</Text>
          </TouchableOpacity>
        </View>

        {/* Inline Setup — Language + Worker Type */}
        <TouchableOpacity
          style={styles.setupToggle}
          onPress={() => setShowSetup(!showSetup)}
          activeOpacity={0.7}
        >
          <Text style={styles.setupToggleText}>
            ⚙️ {VOICE_LANGUAGES.find(l => l.code === selectedLanguage)?.label ?? 'English'}
            {workerType ? ` • ${t(`workerType.${workerType}`)}` : ''}
          </Text>
          <Text style={styles.setupChevron}>{showSetup ? '▲' : '▼'}</Text>
        </TouchableOpacity>

        {showSetup && (
          <View style={styles.setupContainer}>
            {/* Language */}
            <Text style={styles.setupLabel}>{t('voice.language')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.langScroll}>
              <View style={styles.langRow}>
                {VOICE_LANGUAGES.map((lang) => (
                  <TouchableOpacity
                    key={lang.code}
                    style={[styles.langChip, selectedLanguage === lang.code && styles.langChipSelected]}
                    onPress={() => handleLanguageChange(lang.code, lang.appCode)}
                  >
                    <Text style={[styles.langText, selectedLanguage === lang.code && styles.langTextSelected]}>
                      {lang.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {/* Worker Type */}
            <Text style={[styles.setupLabel, { marginTop: 14 }]}>{t('voice.profession')}</Text>
            <View style={styles.workerRow}>
              {WORKER_TYPES.map((wt) => (
                <TouchableOpacity
                  key={wt.key}
                  style={[styles.workerChip, workerType === wt.key && styles.workerChipSelected]}
                  onPress={() => setWorkerType(wt.key)}
                >
                  <Text style={styles.workerEmoji}>{wt.emoji}</Text>
                  <Text style={[styles.workerText, workerType === wt.key && styles.workerTextSelected]}>
                    {t(`workerType.${wt.key}`)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Input Mode Toggle */}
        <View style={styles.modeToggleContainer}>
          <TouchableOpacity
            style={[styles.modeToggle, inputMode === 'voice' && styles.modeToggleActive]}
            onPress={() => setInputMode('voice')}
          >
            <Text style={[styles.modeToggleText, inputMode === 'voice' && styles.modeToggleTextActive]}>
              🎙️ {t('voice.inputMode.voice')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeToggle, inputMode === 'text' && styles.modeToggleActive]}
            onPress={() => setInputMode('text')}
          >
            <Text style={[styles.modeToggleText, inputMode === 'text' && styles.modeToggleTextActive]}>
              ⌨️ {t('voice.inputMode.text')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Symptoms Transcript — Editable */}
        <View style={styles.transcriptionContainer}>
          <View style={styles.transcriptHeader}>
            <Text style={styles.label}>{t('voice.transcript')}</Text>
            {transcription.length > 0 && (
              <TouchableOpacity onPress={clearTranscription}>
                <Text style={styles.clearBtn}>{t('voice.clear')}</Text>
              </TouchableOpacity>
            )}
          </View>
          <TextInput
            style={[
              styles.transcriptInput,
              isOverLimit && styles.transcriptInputError,
            ]}
            placeholder={t('voice.placeholder')}
            placeholderTextColor="#b0aeaa"
            value={transcription}
            onChangeText={setTranscription}
            multiline
            textAlignVertical="top"
            editable={true}
          />
          <View style={styles.charCountRow}>
            <Text style={[styles.charCount, isOverLimit && styles.charCountError]}>
              {charCount}/{MAX_CHARS}
            </Text>
          </View>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>
      </ScrollView>

      {/* Bottom Actions — Fixed */}
      <View style={styles.bottomActions}>
        {inputMode === 'voice' && (
          <Animated.View style={[styles.micContainer, { transform: [{ scale: pulseAnim }] }]}>
            <TouchableOpacity
              style={[styles.recordButton, isListening && styles.recordingButton]}
              onPress={toggleListening}
              activeOpacity={0.7}
            >
              <Text style={styles.micIcon}>{isListening ? '⏹️' : '🎙️'}</Text>
              <Text style={styles.recordButtonText}>
                {isListening ? t('voice.tapToStop') : t('voice.tapToSpeak')}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        <TouchableOpacity
          style={[
            styles.submitButton,
            (!transcription.trim() || isOverLimit) && styles.submitButtonDisabled,
          ]}
          onPress={submitToAI}
          disabled={!transcription.trim() || isOverLimit}
          activeOpacity={0.8}
        >
          <Text style={styles.submitButtonText}>{t('voice.analyze')}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7f6f2' },
  scrollView: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 8 },

  // Header
  headerRow: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    marginBottom: 16,
  },
  appName: { fontSize: 26, fontWeight: '900', color: '#01696f' },
  greeting: { fontSize: 17, color: '#5a5852', marginTop: 4, fontWeight: '500' },
  historyBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#28251d', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
  },
  historyBtnText: { fontSize: 22 },

  // Setup section
  setupToggle: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#e5e0da', marginBottom: 12,
  },
  setupToggleText: { fontSize: 14, color: '#5a5852', fontWeight: '600' },
  setupChevron: { fontSize: 12, color: '#b0aeaa' },
  setupContainer: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#e5e0da', marginBottom: 12,
  },
  setupLabel: { fontSize: 12, fontWeight: '700', color: '#7a7974', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },

  // Language chips
  langScroll: { flexGrow: 0 },
  langRow: { flexDirection: 'row', gap: 8 },
  langChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#f3f0ec', borderWidth: 1, borderColor: '#e5e0da',
  },
  langChipSelected: { backgroundColor: '#01696f', borderColor: '#01696f' },
  langText: { fontSize: 13, color: '#5a5852' },
  langTextSelected: { color: '#fff', fontWeight: '700' },

  // Worker type chips
  workerRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  workerChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#f3f0ec', borderWidth: 1, borderColor: '#e5e0da',
  },
  workerChipSelected: { backgroundColor: '#01696f', borderColor: '#01696f' },
  workerEmoji: { fontSize: 16 },
  workerText: { fontSize: 13, color: '#5a5852' },
  workerTextSelected: { color: '#fff', fontWeight: '700' },

  // Inputs
  inputContainer: { marginBottom: 12 },
  label: { fontSize: 12, fontWeight: '700', color: '#7a7974', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#e5e0da', fontSize: 16, color: '#28251d',
  },

  // Mode toggle
  modeToggleContainer: {
    flexDirection: 'row', gap: 0, marginBottom: 12,
    backgroundColor: '#e6e4df', borderRadius: 12, padding: 3,
  },
  modeToggle: {
    flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10,
  },
  modeToggleActive: { backgroundColor: '#fff', shadowColor: '#28251d', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3, elevation: 2 },
  modeToggleText: { fontSize: 15, color: '#7a7974', fontWeight: '600' },
  modeToggleTextActive: { color: '#01696f', fontWeight: '700' },

  // Transcript
  transcriptionContainer: { flex: 1, marginBottom: 8 },
  transcriptHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  clearBtn: { fontSize: 14, color: '#a12c7b', fontWeight: '600' },
  transcriptInput: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#e5e0da', fontSize: 16, color: '#28251d',
    minHeight: 120, lineHeight: 24,
  },
  transcriptInputError: { borderColor: '#e74c3c' },
  charCountRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4 },
  charCount: { fontSize: 11, color: '#b0aeaa' },
  charCountError: { color: '#e74c3c', fontWeight: '700' },
  errorText: { color: '#e74c3c', marginTop: 6, fontSize: 13 },

  // Bottom actions
  bottomActions: {
    padding: 16, paddingTop: 8, gap: 10,
    borderTopWidth: 1, borderTopColor: '#e6e4df',
    backgroundColor: '#f7f6f2',
  },
  micContainer: { alignItems: 'center' },
  recordButton: {
    backgroundColor: '#01696f', paddingVertical: 16, paddingHorizontal: 32,
    borderRadius: 50, alignItems: 'center', flexDirection: 'row', gap: 10,
    width: '100%', justifyContent: 'center',
    shadowColor: '#01696f', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },
  recordingButton: { backgroundColor: '#e74c3c', shadowColor: '#e74c3c' },
  micIcon: { fontSize: 22 },
  recordButtonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  submitButton: {
    backgroundColor: '#01696f', paddingVertical: 16, borderRadius: 12,
    alignItems: 'center', width: '100%',
    shadowColor: '#01696f', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2, shadowRadius: 8, elevation: 3,
  },
  submitButtonDisabled: { backgroundColor: '#bab9b4', shadowOpacity: 0 },
  submitButtonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
