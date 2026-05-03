import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Animated, Keyboard, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAppStore, type Category } from '@/store/app-store';
import { initHistoryDB } from '@/modules/db/patient-history';
import { isModelLoaded, isModelDownloaded, downloadModel, loadModel } from '@/modules/ai/llama-engine';
import { ensureTTSVoiceForLanguage } from '@/modules/tts/voice-manager';
import {
  isWhisperLoaded, isWhisperDownloaded, downloadWhisperModel,
  loadWhisperModel, transcribeAudio,
} from '@/modules/stt/whisper-engine';
import { startRecording, stopRecording } from '@/modules/stt/audio-recorder';

const MAX_CHARS = 1200;

const VOICE_LANGUAGES = [
  { label: 'English', code: 'en-US', appCode: 'en' },
  { label: 'हिन्दी', code: 'hi-IN', appCode: 'hi' },
  { label: 'తెలుగు', code: 'te-IN', appCode: 'te' },
  { label: 'தமிழ்', code: 'ta-IN', appCode: 'ta' },
  { label: 'ಕನ್ನಡ', code: 'kn-IN', appCode: 'kn' },
  { label: 'मराठी', code: 'mr-IN', appCode: 'mr' },
];

const CATEGORIES: { key: Category; emoji: string; labelKey: string }[] = [
  { key: 'skin', emoji: '🧴', labelKey: 'category.skin' },
  { key: 'child_health', emoji: '👶', labelKey: 'category.childHealth' },
  { key: 'malnutrition', emoji: '🍎', labelKey: 'category.malnutrition' },
];

type InputMode = 'voice' | 'text';

export default function VoiceScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const {
    language: appLanguage, workerType, category, conversationHistory,
    setLanguage, setCategory, addMessage,
  } = useAppStore();

  const [inputMode, setInputMode] = useState<InputMode>('voice');
  const [isListening, setIsListening] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState(
    VOICE_LANGUAGES.find((l) => l.appCode === appLanguage)?.code ?? 'en-US'
  );
  const [error, setError] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [isFollowUp, setIsFollowUp] = useState(false);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const scrollRef = useRef<ScrollView>(null);
  const [aiModelStatus, setAiModelStatus] = useState<'loaded' | 'loading' | 'not_downloaded' | 'downloading'>('loading');
  const [whisperStatus, setWhisperStatus] = useState<'loaded' | 'loading' | 'not_downloaded' | 'downloading'>('loading');
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isTranscribing, setIsTranscribing] = useState(false);

  // Init DB on mount
  useEffect(() => { initHistoryDB(); }, []);

  // Poll AI model status so the pill updates once preloading finishes
  useEffect(() => {
    async function checkAiStatus() {
      try {
        const downloaded = await isModelDownloaded();
        if (!downloaded) {
          setAiModelStatus('not_downloaded');
          return;
        }
        setAiModelStatus(isModelLoaded() ? 'loaded' : 'loading');
      } catch {
        setAiModelStatus('not_downloaded');
      }
    }
    checkAiStatus();
    const interval = setInterval(async () => {
      if (isModelLoaded()) {
        setAiModelStatus('loaded');
        clearInterval(interval);
      } else {
        await checkAiStatus();
      }
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Check & load Whisper STT model
  useEffect(() => {
    async function checkWhisperStatus() {
      try {
        if (isWhisperLoaded()) {
          setWhisperStatus('loaded');
          return;
        }
        const downloaded = await isWhisperDownloaded();
        if (!downloaded) {
          setWhisperStatus('not_downloaded');
          return;
        }
        setWhisperStatus('loading');
        await loadWhisperModel();
        setWhisperStatus('loaded');
      } catch {
        setWhisperStatus('not_downloaded');
      }
    }
    checkWhisperStatus();
  }, []);



  // Pulse animation
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

  // ─── Handlers ─────────────────────────────────────────────────────────────
  const handleLanguageChange = (langCode: string, appCode: string) => {
    setSelectedLanguage(langCode);
    setLanguage(appCode);
    i18n.changeLanguage(appCode);
    // Silent TTS warmup — no UI, no intents, just a near-silent speak
    ensureTTSVoiceForLanguage(appCode).catch(() => {});
  };

  // Download Whisper STT model
  const handleDownloadWhisper = async () => {
    setWhisperStatus('downloading');
    try {
      await downloadWhisperModel((pct) => setDownloadProgress(pct));
      setWhisperStatus('loading');
      await loadWhisperModel();
      setWhisperStatus('loaded');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert('Download Failed', `Could not download speech model: ${msg}`);
      setWhisperStatus('not_downloaded');
    }
  };

  // Toggle recording — fully offline via Whisper
  const toggleListening = async () => {
    setError('');
    Keyboard.dismiss();

    if (isListening) {
      // Stop recording and transcribe
      setIsListening(false);
      setIsTranscribing(true);
      try {
        const audioPath = await stopRecording();
        if (!audioPath) {
          setError('Recording failed — no audio captured');
          setIsTranscribing(false);
          return;
        }
        // Transcribe using Whisper (fully offline)
        const result = await transcribeAudio(audioPath, selectedLanguage);
        if (result.text.trim()) {
          setTranscription((prev) => {
            if (!prev.trim()) return result.text;
            return `${prev} ${result.text}`;
          });
        } else {
          setError(t('voice.speechFailed') || 'No speech detected');
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(`Transcription failed: ${msg}`);
      } finally {
        setIsTranscribing(false);
      }
      return;
    }

    // Check if Whisper model is ready
    if (!isWhisperLoaded()) {
      setError('Speech model not loaded. Please download it first.');
      return;
    }

    // Start recording
    try {
      await startRecording();
      setIsListening(true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(t('voice.startFailed') + (msg ? `: ${msg}` : ''));
      setIsListening(false);
    }
  };

  const clearTranscription = () => {
    setTranscription('');
    setError('');
    setIsFollowUp(false);
  };

  const submitToAI = () => {
    if (!transcription.trim()) {
      setError(t('voice.noSymptoms'));
      return;
    }

    // Save user message to conversation history
    addMessage({
      role: 'user',
      text: transcription.trim(),
      timestamp: Date.now(),
      category,
    });

    router.push({
      pathname: '/(main)/result',
      params: {
        symptoms: transcription.slice(0, MAX_CHARS),
        language: selectedLanguage,
        inputMode,
        category,
        isFollowUp: isFollowUp ? 'true' : 'false',
      },
    } as any); // eslint-disable-line @typescript-eslint/no-explicit-any
  };

  const handleDownloadModel = async () => {
    setAiModelStatus('downloading');
    setDownloadProgress(0);
    try {
      const success = await downloadModel((p) => {
        setDownloadProgress(p.percentage);
      });
      if (success) {
        setAiModelStatus('loading');
        const loaded = await loadModel();
        setAiModelStatus(loaded ? 'loaded' : 'loading');
      } else {
        Alert.alert('Download Failed', 'Could not download the AI model. Check your internet connection and try again.');
        setAiModelStatus('not_downloaded');
      }
    } catch (e) {
      console.error('[Voice] Download error:', e);
      Alert.alert('Download Error', 'An error occurred while downloading. Please try again.');
      setAiModelStatus('not_downloaded');
    }
  };

  const navigateToHistory = () => {
    router.push('/(main)/history' as Href);
  };

  const charCount = transcription.length;
  const isOverLimit = charCount > MAX_CHARS;
  const hasRecentCase = conversationHistory.length > 0;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        ref={scrollRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.appName}>🩺 DermaSeva</Text>
            <Text style={styles.greeting}>{t('voice.greeting')}</Text>
          </View>
          <TouchableOpacity onPress={navigateToHistory} style={styles.historyBtn}>
            <Text style={styles.historyBtnText}>📋</Text>
          </TouchableOpacity>
        </View>

        {/* AI Model Status Pill */}
        <View style={[
          styles.aiStatusPill,
          aiModelStatus === 'loaded' && styles.aiStatusPillReady,
          (aiModelStatus === 'not_downloaded' || aiModelStatus === 'downloading') && styles.aiStatusPillMissing,
        ]}>
          {aiModelStatus === 'downloading' ? (
            <View style={{ width: '100%' }}>
              <Text style={[styles.aiStatusText, styles.aiStatusTextMissing]}>
                ⬇️ Downloading AI Model… {downloadProgress}%
              </Text>
              <View style={{ height: 4, backgroundColor: '#e0e0e0', borderRadius: 2, marginTop: 4 }}>
                <View style={{ height: 4, backgroundColor: '#01696f', borderRadius: 2, width: `${downloadProgress}%` }} />
              </View>
            </View>
          ) : aiModelStatus === 'not_downloaded' ? (
            <TouchableOpacity onPress={handleDownloadModel} activeOpacity={0.7} style={{ width: '100%' }}>
              <Text style={[styles.aiStatusText, styles.aiStatusTextMissing]}>
                📥 Tap to Download AI Model (~3 GB)
              </Text>
            </TouchableOpacity>
          ) : (
            <Text style={[
              styles.aiStatusText,
              aiModelStatus === 'loaded' && styles.aiStatusTextReady,
            ]}>
              {aiModelStatus === 'loaded'
                ? '⚡ AI Ready'
                : '⏳ AI Loading in background…'}
            </Text>
          )}
        </View>

        {/* Category Selector */}
        <Text style={styles.sectionLabel}>{t('category.title')}</Text>
        <View style={styles.categoryRow}>
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat.key}
              style={[styles.categoryChip, category === cat.key && styles.categoryChipSelected]}
              onPress={() => setCategory(cat.key)}
              activeOpacity={0.7}
            >
              <Text style={styles.categoryEmoji}>{cat.emoji}</Text>
              <Text style={[styles.categoryText, category === cat.key && styles.categoryTextSelected]}>
                {t(cat.labelKey)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Follow-up toggle — if previous case exists */}
        {hasRecentCase && (
          <TouchableOpacity
            style={[styles.followUpBanner, isFollowUp && styles.followUpBannerActive]}
            onPress={() => setIsFollowUp(!isFollowUp)}
            activeOpacity={0.7}
          >
            <Text style={styles.followUpText}>
              {isFollowUp ? '🔄 ' + t('voice.followUpActive') : '💬 ' + t('voice.followUpAvailable')}
            </Text>
          </TouchableOpacity>
        )}

        {/* Settings toggle */}
        <TouchableOpacity
          style={styles.setupToggle}
          onPress={() => setShowSettings(!showSettings)}
          activeOpacity={0.7}
        >
          <Text style={styles.setupToggleText}>
            ⚙️ {VOICE_LANGUAGES.find(l => l.code === selectedLanguage)?.label ?? 'English'}
            {workerType ? ` • ${t(`workerType.${workerType}`)}` : ''}
          </Text>
          <Text style={styles.setupChevron}>{showSettings ? '▲' : '▼'}</Text>
        </TouchableOpacity>

        {showSettings && (
          <View style={styles.setupContainer}>
            <Text style={styles.setupLabel}>{t('voice.language')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.langScroll}>
              <View style={styles.langRow}>
                {VOICE_LANGUAGES.map((lang) => {
                  const isSelected = selectedLanguage === lang.code;
                  return (
                    <TouchableOpacity
                      key={lang.code}
                      style={[styles.langChip, isSelected && styles.langChipSelected]}
                      onPress={() => handleLanguageChange(lang.code, lang.appCode)}
                    >
                      <Text style={[styles.langText, isSelected && styles.langTextSelected]}>
                        {lang.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        )}




        {/* Mode Toggle */}
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

        {/* Transcript / Input */}
        <View style={styles.transcriptionContainer}>
          <View style={styles.transcriptHeader}>
            <Text style={styles.label}>
              {isFollowUp ? t('voice.followUpLabel') : t('voice.transcript')}
            </Text>
            {transcription.length > 0 && (
              <TouchableOpacity onPress={clearTranscription}>
                <Text style={styles.clearBtn}>{t('voice.clear')}</Text>
              </TouchableOpacity>
            )}
          </View>
          <TextInput
            style={[styles.transcriptInput, isOverLimit && styles.transcriptInputError]}
            placeholder={
              isFollowUp
                ? t('voice.followUpPlaceholder')
                : t(`voice.placeholder.${category}`) || t('voice.placeholder')
            }
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

      {/* Bottom Actions */}
      <View style={styles.bottomActions}>
        {inputMode === 'voice' && whisperStatus === 'not_downloaded' && (
          <TouchableOpacity
            style={[styles.recordButton, { backgroundColor: '#1565C0' }]}
            onPress={handleDownloadWhisper}
            activeOpacity={0.7}
          >
            <Text style={styles.micIcon}>📥</Text>
            <Text style={styles.recordButtonText}>Download Speech Model (~142 MB)</Text>
          </TouchableOpacity>
        )}

        {inputMode === 'voice' && whisperStatus === 'downloading' && (
          <View style={[styles.recordButton, { backgroundColor: '#37474F' }]}>
            <ActivityIndicator size="small" color="#fff" />
            <Text style={styles.recordButtonText}>Downloading... {downloadProgress}%</Text>
          </View>
        )}

        {inputMode === 'voice' && whisperStatus === 'loading' && (
          <View style={[styles.recordButton, { backgroundColor: '#37474F' }]}>
            <ActivityIndicator size="small" color="#fff" />
            <Text style={styles.recordButtonText}>Loading speech model...</Text>
          </View>
        )}

        {inputMode === 'voice' && whisperStatus === 'loaded' && !isTranscribing && (
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

        {inputMode === 'voice' && isTranscribing && (
          <View style={[styles.recordButton, { backgroundColor: '#37474F' }]}>
            <ActivityIndicator size="small" color="#fff" />
            <Text style={styles.recordButtonText}>Transcribing speech...</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.submitButton, (!transcription.trim() || isOverLimit) && styles.submitButtonDisabled]}
          onPress={submitToAI}
          disabled={!transcription.trim() || isOverLimit}
          activeOpacity={0.8}
        >
          <Text style={styles.submitButtonText}>
            {isFollowUp ? t('voice.askFollowUp') : t('voice.analyze')}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7f6f2' },
  scrollView: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 8 },

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

  // AI Status Pill
  aiStatusPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#e6e4df',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 16,
  },
  aiStatusPillReady: { backgroundColor: '#e6f5f5' },
  aiStatusPillMissing: { backgroundColor: '#fef3cd' },
  aiStatusText: { fontSize: 12, fontWeight: '600', color: '#7a7974' },
  aiStatusTextReady: { color: '#01696f' },
  aiStatusTextMissing: { color: '#964219' },

  // Section labels
  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: '#7a7974',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8,
  },

  // Category chips
  categoryRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  categoryChip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12, borderRadius: 14,
    backgroundColor: '#fff', borderWidth: 2, borderColor: '#e5e0da',
  },
  categoryChipSelected: { borderColor: '#01696f', backgroundColor: '#e6f5f5' },
  categoryEmoji: { fontSize: 18 },
  categoryText: { fontSize: 13, fontWeight: '600', color: '#5a5852' },
  categoryTextSelected: { color: '#01696f', fontWeight: '700' },

  // Follow-up
  followUpBanner: {
    backgroundColor: '#fef9ee', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#e8dcc8', marginBottom: 12,
  },
  followUpBannerActive: { backgroundColor: '#e6f5f5', borderColor: '#01696f' },
  followUpText: { fontSize: 14, color: '#5a5852', fontWeight: '600', textAlign: 'center' },

  // Settings
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
  setupLabel: {
    fontSize: 12, fontWeight: '700', color: '#7a7974',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8,
  },
  langScroll: { flexGrow: 0 },
  langRow: { flexDirection: 'row', gap: 8 },
  langChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#f3f0ec', borderWidth: 1, borderColor: '#e5e0da',
  },
  langChipSelected: { backgroundColor: '#01696f', borderColor: '#01696f' },
  langText: { fontSize: 13, color: '#5a5852' },
  langTextSelected: { color: '#fff', fontWeight: '700' },

  // Mode toggle
  modeToggleContainer: {
    flexDirection: 'row', gap: 0, marginBottom: 12,
    backgroundColor: '#e6e4df', borderRadius: 12, padding: 3,
  },
  modeToggle: {
    flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10,
  },
  modeToggleActive: {
    backgroundColor: '#fff',
    shadowColor: '#28251d', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1, shadowRadius: 3, elevation: 2,
  },
  modeToggleText: { fontSize: 15, color: '#7a7974', fontWeight: '600' },
  modeToggleTextActive: { color: '#01696f', fontWeight: '700' },

  // Transcript
  transcriptionContainer: { flex: 1, marginBottom: 8 },
  transcriptHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 6,
  },
  label: {
    fontSize: 12, fontWeight: '700', color: '#7a7974',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
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

  // Bottom
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
