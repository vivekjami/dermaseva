import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Animated, Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Voice, { SpeechResultsEvent, SpeechErrorEvent } from '@react-native-voice/voice';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/store/app-store';

const MAX_CHARS = 800;

const VOICE_LANGUAGES = [
  { label: 'English', code: 'en-US', appCode: 'en' },
  { label: 'हिन्दी', code: 'hi-IN', appCode: 'hi' },
  { label: 'తెలుగు', code: 'te-IN', appCode: 'te' },
  { label: 'தமிழ்', code: 'ta-IN', appCode: 'ta' },
  { label: 'ಕನ್ನಡ', code: 'kn-IN', appCode: 'kn' },
  { label: 'मराठी', code: 'mr-IN', appCode: 'mr' },
];

type InputMode = 'voice' | 'text';

export default function VoiceScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { language: appLanguage } = useAppStore();

  const [inputMode, setInputMode] = useState<InputMode>('voice');
  const [isListening, setIsListening] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [patientId, setPatientId] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState(
    VOICE_LANGUAGES.find((l) => l.appCode === appLanguage)?.code ?? 'en-US'
  );
  const [error, setError] = useState('');

  // Pulse animation for mic button
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Voice.onSpeechStart = () => setIsListening(true);
    Voice.onSpeechEnd = () => setIsListening(false);
    Voice.onSpeechResults = (e: SpeechResultsEvent) => {
      if (e.value && e.value.length > 0) {
        // Append mode — add to existing transcription
        setTranscription((prev) => {
          const newText = e.value![0];
          if (!prev.trim()) return newText;
          return `${prev} ${newText}`;
        });
      }
    };
    Voice.onSpeechError = (e: SpeechErrorEvent) => {
      setError(e.error?.message || t('voice.speechFailed'));
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
          Animated.timing(pulseAnim, { toValue: 1.15, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isListening, pulseAnim]);

  const startListening = async () => {
    setError('');
    Keyboard.dismiss();
    try {
      await Voice.start(selectedLanguage);
    } catch (e) {
      console.error(e);
      setError(t('voice.startFailed'));
    }
  };

  const stopListening = async () => {
    try {
      await Voice.stop();
    } catch (e) {
      console.error(e);
    }
  };

  const clearTranscription = () => {
    setTranscription('');
    setError('');
  };

  const submitToAI = () => {
    if (!patientId.trim()) {
      setError(t('voice.noPatientId'));
      return;
    }
    if (!transcription.trim()) {
      setError(t('voice.noSymptoms'));
      return;
    }
    router.push({
      pathname: '/(main)/result',
      params: {
        symptoms: transcription.slice(0, MAX_CHARS),
        patientId: patientId.trim(),
        language: selectedLanguage,
        inputMode,
      },
    });
  };

  const navigateToHistory = () => {
    router.push('/(main)/history');
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
        {/* Header */}
        <View style={styles.headerRow}>
          <Text style={styles.header}>{t('voice.title')}</Text>
          <TouchableOpacity onPress={navigateToHistory} style={styles.historyBtn}>
            <Text style={styles.historyBtnText}>📋</Text>
          </TouchableOpacity>
        </View>

        {/* Patient ID */}
        <View style={styles.inputContainer}>
          <Text style={styles.label}>{t('voice.patientId')}</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Patient 101"
            placeholderTextColor="#b0aeaa"
            value={patientId}
            onChangeText={setPatientId}
          />
        </View>

        {/* Language Selector */}
        <View style={styles.inputContainer}>
          <Text style={styles.label}>{t('voice.language')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.langScroll}>
            <View style={styles.langRow}>
              {VOICE_LANGUAGES.map((lang) => (
                <TouchableOpacity
                  key={lang.code}
                  style={[styles.langChip, selectedLanguage === lang.code && styles.langChipSelected]}
                  onPress={() => setSelectedLanguage(lang.code)}
                >
                  <Text style={[styles.langText, selectedLanguage === lang.code && styles.langTextSelected]}>
                    {lang.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>

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
            onPress={() => { setInputMode('text'); }}
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
              onPressIn={startListening}
              onPressOut={stopListening}
              activeOpacity={0.7}
            >
              <Text style={styles.micIcon}>{isListening ? '🔴' : '🎙️'}</Text>
              <Text style={styles.recordButtonText}>
                {isListening ? t('voice.listening') : t('voice.holdToRecord')}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        <TouchableOpacity
          style={[
            styles.submitButton,
            (!transcription.trim() || !patientId.trim() || isOverLimit) && styles.submitButtonDisabled,
          ]}
          onPress={submitToAI}
          disabled={!transcription.trim() || !patientId.trim() || isOverLimit}
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
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 20,
  },
  header: { fontSize: 24, fontWeight: '800', color: '#28251d' },
  historyBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#28251d', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
  },
  historyBtnText: { fontSize: 22 },

  // Inputs
  inputContainer: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '700', color: '#5a5852', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#e5e0da', fontSize: 16, color: '#28251d',
  },

  // Language chips
  langScroll: { flexGrow: 0 },
  langRow: { flexDirection: 'row', gap: 8 },
  langChip: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e0da',
  },
  langChipSelected: { backgroundColor: '#01696f', borderColor: '#01696f' },
  langText: { fontSize: 14, color: '#5a5852' },
  langTextSelected: { color: '#fff', fontWeight: '700' },

  // Mode toggle
  modeToggleContainer: {
    flexDirection: 'row', gap: 0, marginBottom: 16,
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
  transcriptHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  clearBtn: { fontSize: 14, color: '#a12c7b', fontWeight: '600' },
  transcriptInput: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#e5e0da', fontSize: 16, color: '#28251d',
    minHeight: 140, lineHeight: 24,
  },
  transcriptInputError: { borderColor: '#e74c3c' },
  charCountRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 6 },
  charCount: { fontSize: 12, color: '#b0aeaa' },
  charCountError: { color: '#e74c3c', fontWeight: '700' },
  errorText: { color: '#e74c3c', marginTop: 8, fontSize: 14 },

  // Bottom actions
  bottomActions: {
    padding: 16, paddingTop: 8, gap: 12,
    borderTopWidth: 1, borderTopColor: '#e6e4df',
    backgroundColor: '#f7f6f2',
  },
  micContainer: { alignItems: 'center' },
  recordButton: {
    backgroundColor: '#e74c3c', paddingVertical: 16, paddingHorizontal: 32,
    borderRadius: 50, alignItems: 'center', flexDirection: 'row', gap: 10,
    width: '100%', justifyContent: 'center',
    shadowColor: '#e74c3c', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },
  recordingButton: { backgroundColor: '#c0392b' },
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
