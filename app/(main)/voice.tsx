import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Animated, Keyboard, Platform, PermissionsAndroid,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Voice, { SpeechResultsEvent, SpeechErrorEvent } from '@react-native-voice/voice';
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
  const [micPermission, setMicPermission] = useState<'granted' | 'denied' | 'undetermined'>('undetermined');
  const [showSetup, setShowSetup] = useState(!workerType);
  const [voiceAvailable, setVoiceAvailable] = useState(true);

  // Refs to prevent race conditions with Voice
  const isProcessing = useRef(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Init DB on mount
  useEffect(() => { initHistoryDB(); }, []);

  // Check mic permission + voice availability on mount
  useEffect(() => {
    checkMicPermission();
    Voice.isAvailable().then((available) => {
      setVoiceAvailable(!!available);
      if (!available) {
        console.warn('[Voice] Speech recognition not available on this device');
      }
    });
  }, []);

  // Voice listeners
  useEffect(() => {
    Voice.onSpeechStart = () => {
      isProcessing.current = false;
      setIsListening(true);
    };
    Voice.onSpeechEnd = () => {
      isProcessing.current = false;
      setIsListening(false);
    };
    Voice.onSpeechResults = (e: SpeechResultsEvent) => {
      if (e.value && e.value.length > 0) {
        setTranscription((prev) => {
          const newText = e.value![0];
          if (!prev.trim()) return newText;
          return `${prev} ${newText}`;
        });
      }
    };
    Voice.onSpeechError = (e: SpeechErrorEvent) => {
      isProcessing.current = false;
      const code = e.error?.code;
      const msg = e.error?.message || '';

      // Error code 7 = "No match" — not a real error, just silence
      // Error code 6 = "Speech not available"
      if (code === '7' || code === '5') {
        // No speech detected — just stop quietly
        setIsListening(false);
        return;
      }

      console.error('[Voice] Error:', code, msg);
      setError(msg || t('voice.speechFailed'));
      setIsListening(false);
    };

    return () => {
      Voice.destroy().then(Voice.removeAllListeners);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // ─── Permissions ──────────────────────────────────────────────────────────
  const checkMicPermission = async () => {
    if (Platform.OS !== 'android') {
      setMicPermission('granted');
      return;
    }
    try {
      const granted = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
      );
      setMicPermission(granted ? 'granted' : 'undetermined');
    } catch {
      setMicPermission('undetermined');
    }
  };

  const requestMicPermission = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return true;
    try {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        {
          title: 'DermaSeva Microphone Access',
          message: 'DermaSeva needs microphone access to listen to symptom descriptions.',
          buttonPositive: 'Allow',
          buttonNegative: 'Deny',
        }
      );
      const granted = result === PermissionsAndroid.RESULTS.GRANTED;
      setMicPermission(granted ? 'granted' : 'denied');
      return granted;
    } catch {
      setMicPermission('denied');
      return false;
    }
  }, []);

  // ─── Language change ──────────────────────────────────────────────────────
  const handleLanguageChange = (langCode: string, appCode: string) => {
    setSelectedLanguage(langCode);
    setLanguage(appCode);
    i18n.changeLanguage(appCode);
  };

  // ─── Voice — TAP TO TOGGLE (not hold-to-record) ──────────────────────────
  // Using toggle pattern instead of onPressIn/onPressOut to avoid race
  // conditions where Voice.stop() fires before Voice.start() finishes.
  const toggleListening = async () => {
    // Prevent double-taps while the native bridge is processing
    if (isProcessing.current) return;

    setError('');
    Keyboard.dismiss();

    if (isListening) {
      // Currently listening → stop
      isProcessing.current = true;
      try {
        await Voice.stop();
      } catch (e) {
        console.error('[Voice] stop error:', e);
        isProcessing.current = false;
      }
      return;
    }

    // Not listening → start
    // 1. Check permission
    if (micPermission !== 'granted') {
      const granted = await requestMicPermission();
      if (!granted) {
        setError(t('voice.permissionDenied'));
        return;
      }
    }

    // 2. Check availability
    if (!voiceAvailable) {
      setError(t('voice.notAvailable'));
      return;
    }

    // 3. Destroy and recreate to clear any stale state
    isProcessing.current = true;
    try {
      await Voice.destroy();
      // Small delay to let the native engine fully release
      await new Promise((r) => setTimeout(r, 200));
      await Voice.start(selectedLanguage);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[Voice] start error:', msg);
      setError(t('voice.startFailed') + (msg ? `: ${msg}` : ''));
      isProcessing.current = false;
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

        {/* Permission denied banner */}
        {micPermission === 'denied' && inputMode === 'voice' && (
          <View style={styles.permBanner}>
            <Text style={styles.permBannerText}>🎙️ {t('voice.permissionDenied')}</Text>
            <TouchableOpacity onPress={requestMicPermission} style={styles.permBtn}>
              <Text style={styles.permBtnText}>{t('voice.permissionBtn')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Voice not available banner */}
        {!voiceAvailable && inputMode === 'voice' && (
          <View style={styles.permBanner}>
            <Text style={styles.permBannerText}>⚠️ {t('voice.notAvailable')}</Text>
          </View>
        )}

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

  // Permission banner
  permBanner: {
    backgroundColor: '#fef3cd', borderRadius: 12, padding: 14,
    marginBottom: 12, borderLeftWidth: 4, borderLeftColor: '#da7101',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  permBannerText: { fontSize: 13, color: '#964219', flex: 1, lineHeight: 18 },
  permBtn: {
    backgroundColor: '#01696f', paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 8, marginLeft: 10,
  },
  permBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },

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
