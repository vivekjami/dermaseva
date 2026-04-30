import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useState, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import * as Speech from 'expo-speech';
import { getHistory, saveHistory, buildHistoryContext } from '@/modules/db/patient-history';


// Use the library's useModel hook — the PROVEN working pattern
import { useModel, GEMMA_4_E2B_IT } from 'react-native-litert-lm';

import { runMockInference, MODEL_SIZE_BYTES } from '@/modules/ai/litert';
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
import { sanitiseSymptomsForStorage } from '@/modules/security/privacy-check';

// System instructions — embedded directly in user message, NOT in useModel config.
// REASON: The Kotlin bridge sends systemPrompt via a hidden sendMessage() during
// loadModel. This hidden call corrupts the conversation state on this model, causing
// ALL subsequent sendMessage calls to crash with "Failed to invoke the compiled model".
const SYSTEM_INSTRUCTIONS = `You are DermaSeva, a skin screening tool for ASHA workers in India.
Reply ONLY with this JSON, no other text:
{"conditionName":string,"confidence":0.0-1.0,"severity":"mild"|"moderate"|"severe","keySigns":[string],"otcSuggestion":string|null,"doctorReferral":string,"needsUrgentReferral":boolean}
OTC only for: fungal infection, scabies, mild eczema, contact dermatitis, heat rash.
Always set doctorReferral. Set confidence<0.3 if unsure.`;

type InferenceState =
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
  const { symptoms, language: voiceLang, inputMode: rawInputMode } = useLocalSearchParams<{
    symptoms: string;
    language: string;
    inputMode: string;
  }>();
  const inputMode = (rawInputMode === 'text' ? 'text' : 'voice') as 'voice' | 'text';
  const router = useRouter();
  const { t } = useTranslation();
  const { workerType, language: appLanguage } = useAppStore();

  const modelConfig = useMemo(() => ({
    backend: 'cpu' as const, // Force CPU. GPU delegate is highly unstable on some Androids and causes nativeSendMessage crashes.
    autoLoad: true,
    // CRITICAL: Do NOT pass systemPrompt here. The Kotlin bridge sends a hidden
    // sendMessage() during loadModel for system prompts, which corrupts the
    // conversation state and causes ALL subsequent sendMessage calls to crash
    // with "Failed to invoke the compiled model". We embed system instructions
    // directly in the user message via SYSTEM_INSTRUCTIONS instead.
    systemPrompt: undefined,
  }), []);

  const {
    model,
    isReady,
    downloadProgress,
    error: modelHookError,
  } = useModel(GEMMA_4_E2B_IT, modelConfig);

  const [inferenceState, setInferenceState] = useState<InferenceState>('downloading');
  const [inferenceSource, setInferenceSource] = useState<InferenceSource>('litert');
  const [result, setResult] = useState<ParsedResult | null>(null);
  const [inferenceMs, setInferenceMs] = useState(0);
  const [ragNote, setRagNote] = useState('');
  const [otcOverridden, setOtcOverridden] = useState(false);
  const [otcRule, setOtcRule] = useState<import('@/modules/safety/otc-rules').OtcRule | null>(null);
  const [modelError, setModelError] = useState('');
  const [analysisError, setAnalysisError] = useState('');
  const hasStartedAnalysis = useRef(false);

  useEffect(() => {
    if (!symptoms) { setInferenceState('error'); return; }
  }, [symptoms]);

  // When the model becomes ready, start analysis
  useEffect(() => {
    if (isReady && model && !hasStartedAnalysis.current) {
      hasStartedAnalysis.current = true;
      runAnalysis(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, model]);

  // If the model hook errors, fall back to mock
  useEffect(() => {
    if (modelHookError && !hasStartedAnalysis.current) {
      hasStartedAnalysis.current = true;
      setModelError(modelHookError);
      console.warn('[Result] useModel hook error:', modelHookError);
      runAnalysis(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelHookError]);

  // Timeout fallback — if model isn't ready after 15s, use mock
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!hasStartedAnalysis.current) {
        hasStartedAnalysis.current = true;
        console.warn('[Result] Model load timeout (15s), falling back to mock');
        setModelError('Model load timed out after 15 seconds');
        runAnalysis(true);
      }
    }, 15000);
    return () => clearTimeout(timeout);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update inference state based on download progress
  useEffect(() => {
    if (downloadProgress > 0 && downloadProgress < 1) {
      setInferenceState('downloading');
    } else if (downloadProgress >= 1 && !isReady) {
      setInferenceState('loading_model');
    }
  }, [downloadProgress, isReady]);

  async function runAnalysis(useMock: boolean) {
    try {
      // 1. Ensure RAG index is built
      const indexed = await isIndexUpToDate();
      if (!indexed) await buildIndex((msg) => console.warn('[RAG]', msg));

      // 2. Retrieve relevant guideline chunks
      const symptomQuery = symptoms ?? 'skin rash itching';
      const ragChunks = await retrieveRelevantChunks(symptomQuery);

      const ragContext = buildRagContext(ragChunks);

      // 3. Retrieve Patient History
      let historyContext = '';
      if (patientId) {
        const historyRecords = getHistory(patientId, 3); // Get last 3 visits
        historyContext = buildHistoryContext(historyRecords);
      }

      // 4. Build prompt
      setInferenceState('running');
      const basePrompt = buildPrompt({
        symptomDescription: symptoms ?? 'No symptom description provided.',
        workerType: workerType ?? 'general',
        languageCode: voiceLang ?? appLanguage ?? 'en',
        inputMode,
      });
      
      let promptToSend = `${SYSTEM_INSTRUCTIONS}\n\n`;
      if (historyContext) {
        promptToSend += `Patient History (Past Visits):\n${historyContext}\n\n`;
      }
      if (ragContext) {
        promptToSend += `Guidelines:\n${ragContext.slice(0, 500)}\n\n`;
      }
      promptToSend += `---\n${basePrompt}`;

      // 4. Run inference
      let USE_MOCK = useMock;
      let rawText: string;
      let elapsed: number;

      if (USE_MOCK || !model) {
        setInferenceSource('mock');
        const mockOutput = runMockInference({ prompt: promptToSend });
        rawText = mockOutput.rawText;
        elapsed = mockOutput.inferenceTimeMs;
      } else {
        setInferenceSource('litert');
        const start = Date.now();
        try {
          // The Gemma 4 E2B model provided by LiteRT is strictly text-only.
          // Using sendMessageWithImage crashes the C++ engine. We must use sendMessage.
          rawText = await model.sendMessage(promptToSend);
          elapsed = Date.now() - start;
        } catch (inferenceErr: unknown) {
          // Catch native crash, fall back to mock instead of showing error screen
          const errMsg = inferenceErr instanceof Error ? inferenceErr.message : String(inferenceErr);
          console.error('[Result] sendMessage failed, falling back to mock:', errMsg);
          setModelError(errMsg);
          setInferenceSource('mock');
          const mockOutput = runMockInference({ prompt: promptToSend });
          rawText = mockOutput.rawText;
          elapsed = mockOutput.inferenceTimeMs;
        }
      }
      setInferenceMs(elapsed);

      // 5. Parse and validate
      let parsed = parseModelOutput(rawText);
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

      // Read diagnosis aloud
      Speech.speak(
        `${parsed.conditionName}. Severity is ${parsed.severity}. ${parsed.doctorReferral}`,
        { language: voiceLang || 'en-US' }
      );

      // 6. Save to history
      try {
        const sanitisedSymptoms = sanitiseSymptomsForStorage(symptoms ?? null);
        
        // Save to Patient History DB with a generated case ID
        const caseId = `case-${Date.now()}`;
        saveHistory(caseId, sanitisedSymptoms ?? '', JSON.stringify(parsed));

        // Save to existing case store for analytics
        await saveCase({
          worker_type: workerType ?? 'general',
          condition_name: parsed.conditionName,
          confidence: parsed.confidence,
          severity: parsed.severity,
          otc_suggestion: parsed.otcSuggestion ?? null,
          doctor_referral: parsed.doctorReferral,
          needs_urgent_referral: parsed.needsUrgentReferral,
          thumbnail_base64: null,
          raw_symptoms: sanitisedSymptoms,
          language_used: voiceLang ?? 'en',
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

  // ── Downloading ──────────────────────────────────────────────────────────
  if (inferenceState === 'downloading' && !isReady) {
    const pct = Math.round(downloadProgress * 100);
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.errorIcon}>⬇️</Text>
        <Text style={styles.errorTitle}>
          {pct > 0 ? 'Downloading Gemma 4 E2B…' : 'Preparing AI Model…'}
        </Text>
        {pct > 0 && (
          <>
            <Text style={styles.loadingSubtext}>
              {formatBytes(downloadProgress * MODEL_SIZE_BYTES)} / {formatBytes(MODEL_SIZE_BYTES)}
            </Text>
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: `${pct}%` }]} />
            </View>
            <Text style={styles.progressPct}>{pct}%</Text>
          </>
        )}
        {pct === 0 && <ActivityIndicator size="large" color="#01696f" style={{ marginTop: 16 }} />}
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
          {inferenceState === 'loading_model' ? 'Loading Gemma 4 E2B…' : 'Analyzing symptoms…'}
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
          {modelHookError ? (
            <View style={{ backgroundColor: '#fef3cd', borderRadius: 10, padding: 12, marginTop: 12, width: '100%' }}>
              <Text style={{ fontSize: 11, fontFamily: 'monospace', color: '#964219', lineHeight: 16 }}>
                Model hook error: {modelHookError}
              </Text>
            </View>
          ) : null}
          <TouchableOpacity style={[styles.btn, { marginTop: 20 }]} onPress={() => router.back()}>
            <Text style={styles.btnText}>{t('result.tryAgain')}</Text>
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
            <Text style={styles.backBtn}>{t('result.back')}</Text>
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

        {/* Mock warning banner */}
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

        {/* Symptoms Summary Card */}
        {symptoms ? (
          <View style={styles.symptomsCard}>
            <Text style={styles.sectionLabel}>{t('result.symptomsTitle')}</Text>
            <Text style={styles.symptomsText}>{symptoms}</Text>
          </View>
        ) : null}

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

        {/* Follow-up button */}
        <TouchableOpacity
          style={styles.followUpBtn}
          onPress={() => router.back()}
          activeOpacity={0.8}
        >
          <Text style={styles.followUpBtnText}>{t('result.followUp')}</Text>
        </TouchableOpacity>

        <Text style={styles.debugText}>
          Inference: {inferenceMs}ms • Source: {inferenceSource} • Input: {inputMode}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7f6f2' },
  center: { justifyContent: 'center', alignItems: 'center', padding: 24 },
  downloadText: { marginTop: 16, fontSize: 18, fontWeight: '600', color: '#1a1a1a' },
  downloadSub: { marginTop: 8, fontSize: 14, color: '#666', textAlign: 'center' },
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
  // Symptoms summary card
  symptomsCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#01696f',
    shadowColor: '#28251d',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  symptomsText: { fontSize: 15, color: '#28251d', lineHeight: 22, marginTop: 4 },
  patientIdText: { fontSize: 12, color: '#7a7974', marginTop: 8, fontWeight: '600' },
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
  // Follow-up button
  followUpBtn: {
    backgroundColor: '#fff',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 2,
    borderColor: '#01696f',
  },
  followUpBtnText: { color: '#01696f', fontSize: 16, fontWeight: '700' },
  debugText: { fontSize: 11, color: '#bab9b4', textAlign: 'center', marginTop: 8 },
});
