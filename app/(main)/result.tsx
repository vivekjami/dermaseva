import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import * as Speech from 'expo-speech';
import { getHistory, saveHistory, buildHistoryContext } from '@/modules/db/patient-history';

// llama.cpp engine
import {
  runInference, runMockInference,
  isModelLoaded, isModelDownloaded, loadModel,
} from '@/modules/ai/llama-engine';

import { buildPrompt } from '@/modules/ai/prompt-builder';
import { parseModelOutput, type ParsedResult } from '@/modules/ai/output-parser';
import { findCandidateConditions, formatCandidatesForPrompt } from '@/modules/ai/knowledge-base';
import { useAppStore } from '@/store/app-store';
import { isIndexUpToDate, buildIndex } from '@/modules/rag/indexer';
import { retrieveRelevantChunks, buildRagContext } from '@/modules/rag/retriever';
import { validateAgainstRag } from '@/modules/rag/validator';
import { checkOtcEligibility } from '@/modules/safety/otc-rules';
import { getReferralDecision } from '@/modules/safety/referral-logic';
import { ReferralCTA } from '@/components/ReferralCTA';
import { SafetyBanner } from '@/components/SafetyBanner';
import { OtcCard } from '@/components/OtcCard';
import { saveCase, getCaseById } from '@/modules/db/case-store';
import { sanitiseSymptomsForStorage } from '@/modules/security/privacy-check';

type InferenceState =
  | 'loading_model'
  | 'running'
  | 'done'
  | 'error';

type InferenceSource = 'llama' | 'mock';

const SEVERITY_COLORS = { mild: '#437a22', moderate: '#da7101', severe: '#a12c7b' };
const SEVERITY_BG    = { mild: '#d4dfcc', moderate: '#e7d7c4', severe: '#e0ced7' };

export default function ResultScreen() {
  const { caseId, symptoms, language: voiceLang, inputMode: rawInputMode, category: rawCategory, isFollowUp: rawFollowUp } = useLocalSearchParams<{
    caseId?: string;
    symptoms?: string;
    language?: string;
    inputMode?: string;
    category?: string;
    isFollowUp?: string;
  }>();
  const inputMode = (rawInputMode === 'text' ? 'text' : 'voice') as 'voice' | 'text';
  const category = (rawCategory === 'child_health' || rawCategory === 'malnutrition' ? rawCategory : 'skin') as import('@/store/app-store').Category;
  const isFollowUp = rawFollowUp === 'true';
  const router = useRouter();
  const { t } = useTranslation();
  const { workerType, language: appLanguage, conversationHistory, addMessage } = useAppStore();

  const [inferenceState, setInferenceState] = useState<InferenceState>('loading_model');
  const [inferenceSource, setInferenceSource] = useState<InferenceSource>('llama');
  const [result, setResult] = useState<ParsedResult | null>(null);
  const [inferenceMs, setInferenceMs] = useState(0);
  const [ragNote, setRagNote] = useState('');
  const [otcOverridden, setOtcOverridden] = useState(false);
  const [otcRule, setOtcRule] = useState<import('@/modules/safety/otc-rules').OtcRule | null>(null);
  const [, setAnalysisError] = useState('');
  const hasStartedAnalysis = useRef(false);

  // ─── Load from history flow ───────────────────────────────────────────────
  useEffect(() => {
    if (!caseId) return;

    (async () => {
      try {
        const pastCase = await getCaseById(caseId);
        if (pastCase && pastCase.condition_name) {
          const parsed: ParsedResult = {
            conditionName: pastCase.condition_name,
            confidence: pastCase.confidence ?? 0,
            severity: (pastCase.severity as 'mild' | 'moderate' | 'severe') ?? 'moderate',
            keySigns: [],
            actionSteps: [],
            otcSuggestion: pastCase.otc_suggestion,
            doctorReferral: pastCase.doctor_referral ?? '',
            needsUrgentReferral: pastCase.needs_urgent_referral,
            guidelineSource: null,
            followUpPlan: null,
            isLowConfidence: (pastCase.confidence ?? 0) < 0.55,
            parseError: null,
            inferenceSource: (pastCase.inference_source as 'llama' | 'mock') ?? 'mock',
          };
          setResult(parsed);
          setInferenceSource(parsed.inferenceSource);
          setInferenceState('done');
        } else {
          setInferenceState('error');
        }
      } catch (e) {
        console.error('[Result] Failed to load history case:', e);
        setInferenceState('error');
      }
    })();
  }, [caseId]);

  // ─── Single clean flow: always try AI first, only fall back if truly unavailable ────
  useEffect(() => {
    if (caseId || !symptoms || hasStartedAnalysis.current) return;
    hasStartedAnalysis.current = true;

    (async () => {
      try {
        if (isModelLoaded()) {
          // Model already loaded — use it immediately
          console.warn('[Result] Model already loaded, running AI inference.');
          await runAnalysis(false);
          return;
        }

        // Model is loading in background (_layout.tsx started it) OR downloaded but not started
        const downloaded = await isModelDownloaded();
        if (!downloaded) {
          // Truly not available — use guidelines immediately
          console.warn('[Result] Model not downloaded, using guideline analysis.');
          await runAnalysis(true);
          return;
        }

        // Model is downloaded. loadModel() is idempotent — if already loading,
        // it returns the SAME shared promise started by _layout.tsx.
        // We just await it — no artificial timeout.
        console.warn('[Result] Waiting for model to finish loading...');
        setInferenceState('loading_model');

        const loaded = await loadModel(); // waits for existing load or starts one

        if (loaded) {
          console.warn('[Result] Model ready, running AI inference.');
          await runAnalysis(false);
        } else {
          console.warn('[Result] Model load failed, using guideline analysis.');
          await runAnalysis(true);
        }
      } catch (e: unknown) {
        console.error('[Result] Top-level error, falling back to guidelines:', e);
        try {
          await runAnalysis(true);
        } catch (fallbackErr) {
          console.error('[Result] Even guideline fallback failed:', fallbackErr);
          setInferenceState('error');
        }
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symptoms]);

  // ─── Smart TTS with voice fallback ──────────────────────────────────────────
  async function speakResult(parsed: ParsedResult, langInput: string) {
    const actionSummary = parsed.actionSteps?.length > 0
      ? `. ${parsed.actionSteps[0]}` : '';
    const textToSpeak = `${parsed.conditionName}. ${parsed.severity}. ${parsed.doctorReferral}${actionSummary}`;

    // Get the base language code (e.g., 'te' from 'te-IN')
    const baseLang = langInput.split('-')[0];

    // Try to find a voice for the requested language
    try {
      const voices = await Speech.getAvailableVoicesAsync();

      // Preferred language order: requested → Hindi → English
      const langPreference = [baseLang, 'hi', 'en'];
      let chosenVoice: string | undefined;
      let chosenLang = baseLang;

      for (const lang of langPreference) {
        const match = voices.find(
          (v) => v.language.startsWith(lang) && v.quality === 'Enhanced'
        ) ?? voices.find(
          (v) => v.language.startsWith(lang)
        );
        if (match) {
          chosenVoice = match.identifier;
          chosenLang = match.language;
          break;
        }
      }

      Speech.speak(textToSpeak, {
        language: chosenLang,
        voice: chosenVoice,
        rate: 0.9,      // Natural speaking pace
        pitch: 1.0,     // Natural pitch (1.3 was too robotic/squeaky)
      });
    } catch {
      // Fallback — just use basic English
      Speech.speak(textToSpeak, {
        language: 'en',
        rate: 0.9,
        pitch: 1.0,
      });
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

      // 3. Retrieve recent case history for context
      let historyContext = '';
      try {
        const caseId = `case-${Date.now()}`;
        const historyRecords = getHistory(caseId, 3);
        historyContext = buildHistoryContext(historyRecords);
      } catch {
        // No history yet — that's fine
      }

      // 4. Find candidate conditions from knowledge base
      const symptomText = symptoms ?? 'skin rash itching';
      const candidates = findCandidateConditions(symptomText, category);
      const candidateContext = formatCandidatesForPrompt(candidates);
      console.warn(`[Result] Found ${candidates.length} candidate conditions:`, candidates.map(c => c.condition.name));

      // 5. Build prompt with candidates injected
      setInferenceState('running');
      const basePrompt = buildPrompt({
        symptomDescription: symptoms ?? 'No symptom description provided.',
        workerType: workerType ?? 'general',
        languageCode: voiceLang ?? appLanguage ?? 'en',
        inputMode,
        category,
        isFollowUp,
        conversationHistory: isFollowUp ? conversationHistory : undefined,
        candidateContext,
      });

      let fullPrompt = '';
      if (historyContext) fullPrompt += `Previous visits:\n${historyContext}\n\n`;
      // Don't inject raw RAG text if we already injected candidates to save tokens
      if (ragContext && candidates.length === 0) fullPrompt += `Guidelines:\n${ragContext.slice(0, 600)}\n\n`;
      fullPrompt += basePrompt;

      // 5. Run inference
      let rawText: string;
      let elapsed: number;

      if (useMock) {
        setInferenceSource('mock');
        const mockOutput = runMockInference({ prompt: fullPrompt, language: voiceLang ?? appLanguage ?? 'en' });
        rawText = mockOutput.rawText;
        elapsed = mockOutput.inferenceTimeMs;
      } else {
        setInferenceSource('llama');
        try {
          const output = await runInference({
            prompt: fullPrompt,
            language: voiceLang ?? appLanguage ?? 'en',
          });
          rawText = output.rawText;
          elapsed = output.inferenceTimeMs;
        } catch (inferenceErr: unknown) {
          const errMsg = inferenceErr instanceof Error ? inferenceErr.message : String(inferenceErr);
          console.error('[Result] Inference failed, falling back to mock:', errMsg);
          setInferenceSource('mock');
          const mockOutput = runMockInference({ prompt: fullPrompt, language: voiceLang ?? appLanguage ?? 'en' });
          rawText = mockOutput.rawText;
          elapsed = mockOutput.inferenceTimeMs;
        }
      }
      setInferenceMs(elapsed);

      // 6. Parse and validate
      let parsed = parseModelOutput(rawText);

      // Only fall back to mock if parsing COMPLETELY failed (no valid JSON at all)
      if (parsed.parseError && !useMock) {
        console.warn('[Result] AI returned unparseable output, falling back to guidelines:', parsed.parseError);
        setInferenceSource('mock');
        const mockOutput = runMockInference({ prompt: fullPrompt, language: voiceLang ?? appLanguage ?? 'en' });
        rawText = mockOutput.rawText;
        elapsed += mockOutput.inferenceTimeMs;
        setInferenceMs(elapsed);
        parsed = parseModelOutput(rawText);
        parsed = { ...parsed, inferenceSource: 'mock' };
      } else {
        parsed = { ...parsed, inferenceSource: useMock ? 'mock' : 'llama' };
      }

      const validation = validateAgainstRag(parsed, ragChunks, candidates);
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

      // Read diagnosis aloud — pick best available voice
      speakResult(parsed, voiceLang || appLanguage || 'en');

      // Save AI response to conversation history
      addMessage({
        role: 'assistant',
        text: `${parsed.conditionName} (${parsed.severity}): ${parsed.doctorReferral}`,
        timestamp: Date.now(),
        category,
      });

      // 7. Save to history
      try {
        const sanitisedSymptoms = sanitiseSymptomsForStorage(symptoms ?? null);
        const caseId = `case-${Date.now()}`;
        saveHistory(caseId, sanitisedSymptoms ?? '', JSON.stringify(parsed));

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
          inference_source: useMock ? 'mock' : 'llama',
        });
      } catch (e) { console.warn('[History] Failed to save case:', e); }

    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[Result] Inference error:', msg);
      setAnalysisError(msg);
      setInferenceState('error');
    }
  }

  // ── Loading / Analyzing ───────────────────────────────────────────────────
  if (inferenceState === 'loading_model' || inferenceState === 'running') {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color="#01696f" />
        <Text style={styles.loadingText}>
          {inferenceState === 'loading_model' ? 'Loading Gemma 4 E2B…' : 'Analyzing with AI…'}
        </Text>
        <Text style={styles.loadingSubtext}>
          {inferenceState === 'running' ? 'This may take 10–30 seconds' : 'Memory-mapping model from disk'}
        </Text>
      </SafeAreaView>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (inferenceState === 'error' || !result) {
    return (
      <SafeAreaView style={styles.centered}>
        <ScrollView contentContainerStyle={{ alignItems: 'center', padding: 32 }}>
          <Text style={styles.errorIcon}>🔄</Text>
          <Text style={styles.errorTitle}>Could not complete analysis</Text>
          <Text style={styles.errorBody}>
            Please go back and try again. Make sure you have described the symptoms clearly.
          </Text>
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
            {inferenceSource === 'llama' ? '⚡ On-Device AI (Gemma 4 E2B)' : '📋 Guideline-Based Analysis'}
          </Text>
        </View>

        {/* Guideline note when using mock */}
        {inferenceSource === 'mock' && (
          <View style={[styles.mockBanner, { borderLeftColor: '#01696f', backgroundColor: '#e6f5f5' }]}>
            <Text style={[styles.mockBannerText, { color: '#01696f' }]}>
              📚 This result is based on NHM, IMNCI, and WHO clinical guidelines.
              For best results, ensure the AI model is downloaded.
            </Text>
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

        {/* Action Steps — what the health worker should do */}
        {result.actionSteps && result.actionSteps.length > 0 && (
          <View style={[styles.card, { borderLeftWidth: 4, borderLeftColor: '#01696f' }]}>
            <Text style={styles.sectionLabel}>📋 Action Steps</Text>
            {result.actionSteps.map((step, i) => (
              <Text key={i} style={styles.actionStep}>{i + 1}. {step}</Text>
            ))}
          </View>
        )}

        {/* Guideline Source */}
        {result.guidelineSource && (
          <View style={[styles.ragNote, { backgroundColor: '#e6f5f5' }]}>
            <Text style={styles.ragNoteText}>📚 Source: {result.guidelineSource}</Text>
          </View>
        )}

        {/* Follow-up Plan */}
        {result.followUpPlan && (
          <View style={[styles.card, { backgroundColor: '#fef9ee' }]}>
            <Text style={styles.sectionLabel}>📅 Follow-up Plan</Text>
            <Text style={styles.bullet}>{result.followUpPlan}</Text>
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
          {inferenceMs}ms • {inferenceSource === 'llama' ? 'On-device (llama.cpp)' : 'Guidelines'} • {inputMode}
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
  actionStep: { fontSize: 15, color: '#28251d', marginBottom: 6, lineHeight: 22, paddingLeft: 4 },
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
