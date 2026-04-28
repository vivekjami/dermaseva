import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, Alert, Image,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as FileSystem from 'expo-file-system/legacy';
import * as Network from 'expo-network';

import {
  loadModel, runInference, runMockInference, isModelDownloaded,
  downloadModel, MODEL_SIZE_BYTES, getLastModelError,
  type DownloadProgress,
} from '@/modules/ai/litert';
import { buildPrompt } from '@/modules/ai/prompt-builder';
import { parseModelOutput, type ParsedResult } from '@/modules/ai/output-parser';
import { useAppStore } from '@/store/app-store';
import { isIndexUpToDate, buildIndex } from '@/modules/rag/indexer';
import { retrieveRelevantChunks, buildRagContext } from '@/modules/rag/retriever';
import { validateAgainstRag } from '@/modules/rag/validator';
import { checkOtcEligibility } from '@/modules/safety/otc-rules';
import { getReferralDecision } from '@/modules/safety/referral-logic';
import { ReferralCTA } from '@/components/ReferralCTA';
import { SafetyBanner } from '@/components/SafetyBanner';
import { OtcCard } from '@/components/OtcCard';
import { saveCase } from '@/modules/db/case-store';
import { makeThumbnail, deleteOriginal } from '@/modules/db/thumbnail';
import { sanitiseSymptomsForStorage } from '@/modules/security/privacy-check';

type InferenceState =
  | 'checking'
  | 'needs_download'
  | 'downloading'
  | 'loading_model'
  | 'running'
  | 'done'
  | 'error';

type InferenceSource = 'litert' | 'mock';

const SEVERITY_COLORS = { mild: '#437a22', moderate: '#da7101', severe: '#a12c7b' };
const SEVERITY_BG    = { mild: '#d4dfcc', moderate: '#e7d7c4', severe: '#e0ced7' };

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function ResultScreen() {
  const { imageUri, symptoms } = useLocalSearchParams<{ imageUri: string; symptoms?: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const { workerType, language } = useAppStore();

  const [inferenceState, setInferenceState] = useState<InferenceState>('checking');
  const [inferenceSource, setInferenceSource] = useState<InferenceSource>('litert');
  const [result, setResult] = useState<ParsedResult | null>(null);
  const [inferenceMs, setInferenceMs] = useState(0);
  const [ragNote, setRagNote] = useState('');
  const [otcOverridden, setOtcOverridden] = useState(false);
  const [otcRule, setOtcRule] = useState<import('@/modules/safety/otc-rules').OtcRule | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress>({
    bytesDownloaded: 0, totalBytes: MODEL_SIZE_BYTES, percentage: 0,
  });
  const [downloadError, setDownloadError] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [modelError, setModelError] = useState('');
  const [analysisError, setAnalysisError] = useState('');

  useEffect(() => {
    if (!imageUri) { setInferenceState('error'); return; }
    setImagePreview(imageUri);
    checkAndProceed();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clean up image after component unmounts
  useEffect(() => {
    return () => {
      if (imageUri) {
        FileSystem.deleteAsync(imageUri, { idempotent: true }).catch(() => {});
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function checkAndProceed() {
    setInferenceState('checking');

    // Skip the native bridge check — just try to load the model directly.
    // loadModel() handles native bridge errors internally and returns false
    // if the bridge isn't available (e.g. Expo Go).
    const downloaded = await isModelDownloaded();
    if (!downloaded) {
      setInferenceState('needs_download');
    } else {
      runAnalysis(false);
    }
  }

  async function startDownload() {
    // Warn if not on Wi-Fi
    const net = await Network.getNetworkStateAsync();
    if (net.type !== Network.NetworkStateType.WIFI) {
      Alert.alert(
        'Mobile Data Warning',
        'You are not on Wi-Fi. Downloading the Gemma 4 E2B AI model uses ~2.58 GB of mobile data. Continue?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Download Anyway', onPress: () => doDownload() },
        ]
      );
      return;
    }
    doDownload();
  }

  async function doDownload() {
    setInferenceState('downloading');
    setDownloadError('');
    try {
      const success = await downloadModel((progress) => {
        setDownloadProgress(progress);
      });
      if (success) {
        runAnalysis(false);
      } else {
        setDownloadError('Download failed. Please check your connection and try again.');
        setInferenceState('needs_download');
      }
    } catch (e: unknown) {
      setDownloadError((e as Error).message ?? 'Download failed. Try again.');
      setInferenceState('needs_download');
    }
  }

  async function runAnalysis(useMock: boolean) {
    try {
      // 1. Ensure RAG index is built
      const indexed = await isIndexUpToDate();
      if (!indexed) await buildIndex((msg) => console.warn('[RAG]', msg));

      // 2. Retrieve relevant guideline chunks
      const symptomQuery = symptoms ?? 'skin rash itching';
      const ragChunks = await retrieveRelevantChunks(symptomQuery);
      const ragContext = buildRagContext(ragChunks);

      // 3. Load model
      let USE_MOCK = useMock;
      if (!USE_MOCK) {
        setInferenceState('loading_model');
        const loaded = await loadModel();
        USE_MOCK = !loaded;
        if (USE_MOCK) {
          const err = getLastModelError();
          setModelError(err);
          console.warn('[Result] LiteRT model failed to load:', err);
          setInferenceSource('mock');
        } else {
          setInferenceSource('litert');
        }
      }

      // 4. Build prompt and run inference
      setInferenceState('running');
      const basePrompt = buildPrompt({
        symptomDescription: symptoms ?? 'No symptom description provided.',
        workerType: workerType ?? 'general',
        languageCode: language ?? 'en',
      });
      const augmentedPrompt = ragContext
        ? `Guidelines:\n${ragContext.slice(0, 500)}\n\n---\n${basePrompt}`
        : basePrompt;
      const output = USE_MOCK
        ? runMockInference({ imagePath: imageUri, prompt: augmentedPrompt })
        : await runInference({ imagePath: imageUri, prompt: augmentedPrompt });
      setInferenceMs(output.inferenceTimeMs);

      // 5. Parse and validate
      let parsed = parseModelOutput(output.rawText);
      parsed = { ...parsed, inferenceSource: USE_MOCK ? 'mock' : 'litert' };

      const validation = validateAgainstRag(parsed, ragChunks);
      setRagNote(validation.validationNote);
      const adjustedConfidence = Math.max(0, Math.min(1, parsed.confidence + validation.ragConfidenceBoost));
      parsed = {
        ...parsed,
        confidence: adjustedConfidence,
        isLowConfidence: adjustedConfidence < 0.55,
        needsUrgentReferral: parsed.needsUrgentReferral || validation.forceUrgentReferral,
        otcSuggestion: validation.forceUrgentReferral ? null : parsed.otcSuggestion,
      };

      if (parsed.otcSuggestion) {
        const otcCheck = checkOtcEligibility(
          parsed.conditionName, parsed.severity,
          workerType ?? 'general', validation.conditionFoundInGuidelines
        );
        if (otcCheck.eligible && otcCheck.rule) {
          setOtcRule(otcCheck.rule);
        } else {
          parsed = { ...parsed, otcSuggestion: null };
          setOtcOverridden(true);
        }
      }

      setResult(parsed);
      setInferenceState('done');

      // 6. Save to history (with PII sanitisation)
      try {
        const thumb = imageUri ? await makeThumbnail(imageUri) : null;
        if (imageUri) await deleteOriginal(imageUri);
        const sanitisedSymptoms = sanitiseSymptomsForStorage(symptoms ?? null);
        await saveCase({
          worker_type: workerType ?? 'general',
          condition_name: parsed.conditionName,
          confidence: parsed.confidence,
          severity: parsed.severity,
          otc_suggestion: parsed.otcSuggestion ?? null,
          doctor_referral: parsed.doctorReferral,
          needs_urgent_referral: parsed.needsUrgentReferral,
          thumbnail_base64: thumb,
          raw_symptoms: sanitisedSymptoms,
          language_used: language ?? 'en',
          inference_source: USE_MOCK ? 'mock' : 'litert',
        });
      } catch (e) { console.warn('[History] Failed to save case:', e); }

    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const stack = e instanceof Error ? e.stack?.slice(0, 500) : '';
      const fullError = `${msg}${stack ? '\n' + stack : ''}`;
      console.error('[Result] Inference error:', fullError);
      setAnalysisError(fullError);
      setInferenceState('error');
    }
  }

  // ── Checking ──────────────────────────────────────────────────────────────
  if (inferenceState === 'checking') {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color="#01696f" />
        <Text style={styles.loadingText}>Checking AI model…</Text>
      </SafeAreaView>
    );
  }

  // ── Needs Download ────────────────────────────────────────────────────────
  if (inferenceState === 'needs_download') {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.errorIcon}>🤖</Text>
        <Text style={styles.errorTitle}>AI Model Required</Text>
        <Text style={styles.errorBody}>
          DermaSeva uses Gemma 4 E2B — Google's on-device AI model (~2.58 GB).
          {'\n\n'}It downloads once and runs fully offline. No patient data ever leaves your phone.
          {'\n\n'}Connect to Wi-Fi for best experience.
        </Text>
        {downloadError ? (
          <Text style={styles.downloadErrorText}>⚠️ {downloadError}</Text>
        ) : null}
        <TouchableOpacity style={styles.btn} onPress={startDownload}>
          <Text style={styles.btnText}>⬇️  Download AI Model</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnSecondary} onPress={() => router.back()}>
          <Text style={styles.btnSecondaryText}>← Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ── Downloading ───────────────────────────────────────────────────────────
  if (inferenceState === 'downloading') {
    const pct = downloadProgress.percentage;
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.errorIcon}>⬇️</Text>
        <Text style={styles.errorTitle}>Downloading Gemma 4 E2B…</Text>
        <Text style={styles.loadingSubtext}>
          {formatBytes(downloadProgress.bytesDownloaded)} / {formatBytes(downloadProgress.totalBytes)}
        </Text>
        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, { width: `${pct}%` }]} />
        </View>
        <Text style={styles.progressPct}>{pct}%</Text>
        <Text style={styles.loadingSubtext}>
          Keep the app open. Do not close or lock your screen.
        </Text>
      </SafeAreaView>
    );
  }

  // ── Loading / Analyzing ───────────────────────────────────────────────────
  if (inferenceState === 'loading_model' || inferenceState === 'running') {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color="#01696f" />
        <Text style={styles.loadingText}>
          {inferenceState === 'loading_model' ? 'Loading Gemma 4 E2B…' : 'Analyzing skin condition…'}
        </Text>
        <Text style={styles.loadingSubtext}>
          {inferenceState === 'running' ? 'This may take 10–30 seconds' : 'Initializing on-device AI engine'}
        </Text>
      </SafeAreaView>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (inferenceState === 'error' || !result) {
    return (
      <SafeAreaView style={styles.centered}>
        <ScrollView contentContainerStyle={{ alignItems: 'center', padding: 32 }}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorTitle}>Analysis Failed</Text>
          <Text style={styles.errorBody}>Something went wrong during AI analysis.</Text>
          {analysisError ? (
            <View style={{ backgroundColor: '#f3f0ec', borderRadius: 10, padding: 12, marginTop: 12, width: '100%' }}>
              <Text style={{ fontSize: 11, fontFamily: 'monospace', color: '#964219', lineHeight: 16 }}>
                {analysisError}
              </Text>
            </View>
          ) : null}
          <TouchableOpacity style={[styles.btn, { marginTop: 20 }]} onPress={() => router.back()}>
            <Text style={styles.btnText}>← Retake Photo</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Result ────────────────────────────────────────────────────────────────
  const severityColor = SEVERITY_COLORS[result.severity];
  const severityBg    = SEVERITY_BG[result.severity];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 48 }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backBtn}>← Retake</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Screening Result</Text>
          <View style={{ width: 60 }} />
        </View>

        {/* Inference source indicator */}
        <View style={styles.sourceIndicator}>
          <Text style={styles.sourceText}>
            {inferenceSource === 'litert' ? '⚡ On-Device AI (Gemma 4 E2B)' : '🧪 Demo Mode (Mock)'}
          </Text>
        </View>

        {/* Mock warning banner — shows actual error for debugging */}
        {inferenceSource === 'mock' && (
          <View style={styles.mockBanner}>
            <Text style={styles.mockBannerText}>
              ⚠️ This result is from demo mode, not real AI analysis.
            </Text>
            {modelError ? (
              <Text style={[styles.mockBannerText, { marginTop: 8, fontSize: 11, fontFamily: 'monospace' }]}>
                Error: {modelError}
              </Text>
            ) : null}
          </View>
        )}

        {/* Captured image preview */}
        {imagePreview && (
          <View style={styles.imagePreviewContainer}>
            <Image source={{ uri: imagePreview }} style={styles.imagePreview} resizeMode="cover" />
          </View>
        )}

        {result.isLowConfidence && <SafetyBanner type="low_confidence" />}
        {result.severity === 'severe' && !result.isLowConfidence && <SafetyBanner type="severe" />}

        <View style={styles.card}>
          <View style={[styles.severityBadge, { backgroundColor: severityBg }]}>
            <Text style={[styles.severityText, { color: severityColor }]}>
              {result.severity.toUpperCase()}
            </Text>
          </View>
          <Text style={styles.conditionName}>{result.conditionName}</Text>
          <View style={styles.confidenceRow}>
            <Text style={styles.confidenceLabel}>{t('result.confidence')}</Text>
            <View style={styles.confidenceBarBg}>
              <View style={[styles.confidenceBarFill, { width: `${Math.round(result.confidence * 100)}%`, backgroundColor: severityColor }]} />
            </View>
            <Text style={styles.confidenceValue}>{Math.round(result.confidence * 100)}%</Text>
          </View>
        </View>

        {result.keySigns.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Key Signs Observed</Text>
            {result.keySigns.map((sign, i) => (
              <Text key={i} style={styles.bullet}>• {sign}</Text>
            ))}
          </View>
        )}

        <ReferralCTA decision={getReferralDecision(result.severity, result.needsUrgentReferral, result.needsUrgentReferral)} doctorReferralText={result.doctorReferral} />

        {ragNote ? (
          <View style={styles.ragNote}><Text style={styles.ragNoteText}>📋 {ragNote}</Text></View>
        ) : null}

        {otcRule && !otcOverridden && <OtcCard rule={otcRule} conditionName={result.conditionName} />}

        {otcOverridden && (
          <View style={styles.otcSuppressed}>
            <Text style={styles.otcSuppressedText}>ℹ️ OTC suggestion not shown — consult a doctor for proper treatment.</Text>
          </View>
        )}

        <View style={styles.disclaimer}>
          <Text style={styles.disclaimerText}>ℹ️ {t('result.disclaimer')}</Text>
        </View>

        <Text style={styles.debugText}>
          Inference: {inferenceMs}ms • Source: {inferenceSource}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7f6f2' },
  scroll: { padding: 16 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f7f6f2', padding: 32 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  backBtn: { color: '#01696f', fontSize: 16, fontWeight: '600' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#28251d' },
  // Source indicator
  sourceIndicator: {
    backgroundColor: '#cedcd8',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  sourceText: { fontSize: 12, fontWeight: '700', color: '#01696f' },
  // Mock warning
  mockBanner: {
    backgroundColor: '#fef3cd',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#da7101',
  },
  mockBannerText: { fontSize: 13, color: '#964219', lineHeight: 19 },
  mockCode: { fontFamily: 'monospace', fontWeight: '700' },
  // Image preview
  imagePreviewContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
    height: 180,
    backgroundColor: '#e6e4df',
  },
  imagePreview: { width: '100%', height: '100%' },
  // Cards
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, shadowColor: '#28251d', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  severityBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, marginBottom: 10 },
  severityText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  conditionName: { fontSize: 22, fontWeight: '700', color: '#28251d', marginBottom: 12 },
  confidenceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  confidenceLabel: { fontSize: 13, color: '#7a7974', width: 72 },
  confidenceBarBg: { flex: 1, height: 6, backgroundColor: '#e6e4df', borderRadius: 99, overflow: 'hidden' },
  confidenceBarFill: { height: '100%', borderRadius: 99 },
  confidenceValue: { fontSize: 13, fontWeight: '600', color: '#28251d', width: 36, textAlign: 'right' },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: '#7a7974', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  bullet: { fontSize: 15, color: '#28251d', marginBottom: 4, lineHeight: 22 },
  btn: { backgroundColor: '#01696f', paddingVertical: 14, paddingHorizontal: 40, borderRadius: 12, marginBottom: 12, width: '100%', alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnSecondary: { paddingVertical: 12, paddingHorizontal: 40 },
  btnSecondaryText: { color: '#01696f', fontSize: 15, fontWeight: '600' },
  downloadErrorText: { color: '#a12c7b', fontSize: 14, marginBottom: 16, textAlign: 'center' },
  progressBarBg: { width: '100%', height: 10, backgroundColor: '#e6e4df', borderRadius: 99, overflow: 'hidden', marginTop: 16, marginBottom: 8 },
  progressBarFill: { height: '100%', backgroundColor: '#01696f', borderRadius: 99 },
  progressPct: { fontSize: 20, fontWeight: '700', color: '#01696f', marginBottom: 12 },
  loadingText: { fontSize: 18, fontWeight: '600', color: '#28251d', marginTop: 16, textAlign: 'center' },
  loadingSubtext: { fontSize: 14, color: '#7a7974', marginTop: 6, textAlign: 'center', lineHeight: 20 },
  errorIcon: { fontSize: 56, marginBottom: 16 },
  errorTitle: { fontSize: 22, fontWeight: '700', color: '#28251d', marginBottom: 8, textAlign: 'center' },
  errorBody: { fontSize: 15, color: '#7a7974', textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  ragNote: { backgroundColor: '#cedcd8', borderRadius: 10, padding: 12, marginBottom: 8 },
  ragNoteText: { color: '#01696f', fontSize: 13, lineHeight: 18 },
  otcSuppressed: { backgroundColor: '#f3f0ec', borderRadius: 10, padding: 12, marginBottom: 8 },
  otcSuppressedText: { color: '#7a7974', fontSize: 13, lineHeight: 18 },
  disclaimer: { backgroundColor: '#f3f0ec', borderRadius: 10, padding: 12, marginBottom: 8 },
  disclaimerText: { color: '#7a7974', fontSize: 13, lineHeight: 18 },
  debugText: { fontSize: 11, color: '#bab9b4', textAlign: 'center', marginTop: 8 },
});
