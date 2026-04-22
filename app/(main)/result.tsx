import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import * as FileSystem from 'expo-file-system/legacy';

import { loadModel, runInference, isModelDownloaded } from '@/modules/ai/litert';
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

type InferenceState = 'loading_model' | 'running' | 'done' | 'error' | 'no_model';

const SEVERITY_COLORS = {
  mild: '#437a22',
  moderate: '#da7101',
  severe: '#a12c7b',
};

const SEVERITY_BG = {
  mild: '#d4dfcc',
  moderate: '#e7d7c4',
  severe: '#e0ced7',
};

export default function ResultScreen() {
  const { imageUri, symptoms } = useLocalSearchParams<{
    imageUri: string;
    symptoms?: string;
  }>();
  const router = useRouter();
  const { t } = useTranslation();
  const { workerType, language } = useAppStore();

  const [inferenceState, setInferenceState] = useState<InferenceState>('loading_model');
  const [result, setResult] = useState<ParsedResult | null>(null);
  const [inferenceMs, setInferenceMs] = useState(0);
  const [ragNote, setRagNote] = useState<string>('');
  const [otcOverridden, setOtcOverridden] = useState(false);
  const [otcRule, setOtcRule] = useState<import('@/modules/safety/otc-rules').OtcRule | null>(null);

  useEffect(() => {
    if (!imageUri) {
      setInferenceState('error');
      return;
    }
    runAnalysis();

    // Cleanup: delete temp image after done (regardless of result)
    return () => {
      FileSystem.deleteAsync(imageUri, { idempotent: true }).catch(() => {});
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const runAnalysis = useCallback(async () => {
    try {
      // 1. Check model is present (skip in dev mock mode)
      const DEV_MOCK_MODE = true;
      if (!DEV_MOCK_MODE) {
        const downloaded = await isModelDownloaded();
        if (!downloaded) {
          setInferenceState('no_model');
          return;
        }
      }

      // 2. Ensure RAG index is built (runs once at first launch, ~1s)
      const indexed = await isIndexUpToDate();
      if (!indexed) {
        await buildIndex((msg) => console.warn('[RAG]', msg));
      }

      // 3. Retrieve relevant guideline chunks for the symptom query
      const symptomQuery = symptoms ?? 'skin rash itching';
      const ragChunks = await retrieveRelevantChunks(symptomQuery);
      const ragContext = buildRagContext(ragChunks);

      // 4. Load model into memory
      setInferenceState('loading_model');
      const loaded = await loadModel();
      if (!loaded) {
        setInferenceState('no_model');
        return;
      }

      // 5. Build RAG-augmented prompt
      setInferenceState('running');
      const basePrompt = buildPrompt({
        symptomDescription: symptoms ?? 'No symptom description provided.',
        workerType: workerType ?? 'general',
        languageCode: language ?? 'en',
      });
      // Prepend RAG context to ground the model in guidelines
      const augmentedPrompt = ragContext
        ? `${ragContext}

---

${basePrompt}`
        : basePrompt;

      // 6. Run inference
      const output = await runInference({ imagePath: imageUri, prompt: augmentedPrompt });
      setInferenceMs(output.inferenceTimeMs);

      // 7. Parse & validate AI output
      let parsed = parseModelOutput(output.rawText);

      // 8. RAG validation — cross-check AI output against retrieved guidelines
      const validation = validateAgainstRag(parsed, ragChunks);
      setRagNote(validation.validationNote);

      // Apply RAG confidence adjustment
      const adjustedConfidence = Math.max(
        0,
        Math.min(1, parsed.confidence + validation.ragConfidenceBoost)
      );

      // Force urgent referral if RAG says condition is outside guidelines
      parsed = {
        ...parsed,
        confidence: adjustedConfidence,
        isLowConfidence: adjustedConfidence < 0.55,
        needsUrgentReferral: parsed.needsUrgentReferral || validation.forceUrgentReferral,
        // Suppress OTC if RAG validation flagged it
        otcSuggestion: validation.forceUrgentReferral ? null : parsed.otcSuggestion,
      };

      // OTC safety gate — enforce all 4 rules from build spec
      if (parsed.otcSuggestion) {
        const otcCheck = checkOtcEligibility(
          parsed.conditionName,
          parsed.severity,
          workerType ?? 'general',
          validation.conditionFoundInGuidelines
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

      // Persist to SQLite history (thumbnail saved, original deleted)
      try {
        const thumb = imageUri ? await makeThumbnail(imageUri) : null;
        if (imageUri) await deleteOriginal(imageUri);
        await saveCase({
          worker_type:          workerType ?? 'general',
          condition_name:       parsed.conditionName,
          confidence:           parsed.confidence,
          severity:             parsed.severity,
          otc_suggestion:       parsed.otcSuggestion ?? null,
          doctor_referral:      parsed.doctorReferral,
          needs_urgent_referral: parsed.needsUrgentReferral,
          thumbnail_base64:     thumb,
          raw_symptoms:         symptoms ?? null,
          language_used:        language ?? 'en',
        });
      } catch (e) {
        console.warn('[History] Failed to save case:', e);
      }
    } catch (e: unknown) {
      console.error('[Result] Inference error:', e);
      setInferenceState('error');
    }
  }, [imageUri, symptoms, workerType, language]);
  // ── Loading states ─────────────────────────────────────────────────────────
  if (inferenceState === 'loading_model' || inferenceState === 'running') {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color="#01696f" />
        <Text style={styles.loadingText}>
          {inferenceState === 'loading_model' ? 'Loading AI model…' : 'Analyzing skin condition…'}
        </Text>
        <Text style={styles.loadingSubtext}>
          {inferenceState === 'running' ? 'This may take 10–30 seconds on first run' : ''}
        </Text>
      </SafeAreaView>
    );
  }

  if (inferenceState === 'no_model') {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.errorIcon}>⬇️</Text>
        <Text style={styles.errorTitle}>AI Model Not Downloaded</Text>
        <Text style={styles.errorBody}>
          The Gemma 4 model needs to be downloaded once before use. Connect to Wi-Fi and relaunch.
        </Text>
        <TouchableOpacity style={styles.btn} onPress={() => router.back()}>
          <Text style={styles.btnText}>← Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (inferenceState === 'error' || !result) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={styles.errorTitle}>Analysis Failed</Text>
        <Text style={styles.errorBody}>
          Something went wrong. Please retake the photo in better lighting.
        </Text>
        <TouchableOpacity style={styles.btn} onPress={() => router.back()}>
          <Text style={styles.btnText}>← Retake Photo</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ── Result screen ──────────────────────────────────────────────────────────
  const severityColor = SEVERITY_COLORS[result.severity];
  const severityBg = SEVERITY_BG[result.severity];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backBtn}>← Retake</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Screening Result</Text>
          <View style={{ width: 60 }} />
        </View>

        {/* Safety banners */}
        {result.isLowConfidence && <SafetyBanner type="low_confidence" />}
        {result.severity === 'severe' && !result.isLowConfidence && (
          <SafetyBanner type="severe" />
        )}

        {/* Condition card */}
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
              <View
                style={[
                  styles.confidenceBarFill,
                  {
                    width: `${Math.round(result.confidence * 100)}%`,
                    backgroundColor: severityColor,
                  },
                ]}
              />
            </View>
            <Text style={styles.confidenceValue}>
              {Math.round(result.confidence * 100)}%
            </Text>
          </View>
        </View>

        {/* Key signs */}
        {result.keySigns.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Key Signs Observed</Text>
            {result.keySigns.map((sign, i) => (
              <Text key={i} style={styles.bullet}>• {sign}</Text>
            ))}
          </View>
        )}

        {/* OTC suggestion */}
        {result.otcSuggestion && !result.isLowConfidence && (
          <View style={[styles.card, styles.otcCard]}>
            <Text style={styles.sectionLabel}>{t('result.otcSuggestion')}</Text>
            <Text style={styles.otcText}>{result.otcSuggestion}</Text>
          </View>
        )}

        {/* ReferralCTA — ALWAYS shown, cannot be hidden */}
        <ReferralCTA
          decision={getReferralDecision(
            result.severity,
            result.isLowConfidence,
            result.needsUrgentReferral
          )}
          doctorReferralText={result.doctorReferral}
        />

        {/* RAG validation note */}
        {ragNote ? (
          <View style={styles.ragNote}>
            <Text style={styles.ragNoteText}>📋 {ragNote}</Text>
          </View>
        ) : null}

        {/* OTC remedy card — only for ASHA/Anganwadi, mild, guideline-confirmed */}
        {otcRule && !otcOverridden && (
          <OtcCard rule={otcRule} conditionName={result.conditionName} />
        )}

        {/* OTC suppressed notice */}
        {otcOverridden && (
          <View style={styles.otcSuppressed}>
            <Text style={styles.otcSuppressedText}>
              ℹ️ OTC suggestion not shown — consult a doctor for proper treatment.
            </Text>
          </View>
        )}

        {/* Safety disclaimer — ALWAYS shown */}
        <View style={styles.disclaimer}>
          <Text style={styles.disclaimerText}>
            ℹ️ {t('result.disclaimer')}
          </Text>
        </View>

        {/* Debug info (remove in production) */}
        <Text style={styles.debugText}>
          Inference: {inferenceMs}ms
        </Text>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7f6f2' },
  scroll: { padding: 16, paddingBottom: 48 },
  centered: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#f7f6f2', padding: 32,
  },
  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 16,
  },
  backBtn: { color: '#01696f', fontSize: 16, fontWeight: '600' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#28251d' },
  // Cards
  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16,
    marginBottom: 12,
    shadowColor: '#28251d', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  severityBadge: {
    alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 99, marginBottom: 10,
  },
  severityText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  conditionName: {
    fontSize: 22, fontWeight: '700', color: '#28251d', marginBottom: 12,
  },
  confidenceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  confidenceLabel: { fontSize: 13, color: '#7a7974', width: 72 },
  confidenceBarBg: {
    flex: 1, height: 6, backgroundColor: '#e6e4df', borderRadius: 99, overflow: 'hidden',
  },
  confidenceBarFill: { height: '100%', borderRadius: 99 },
  confidenceValue: { fontSize: 13, fontWeight: '600', color: '#28251d', width: 36, textAlign: 'right' },
  // Key signs
  sectionLabel: {
    fontSize: 13, fontWeight: '600', color: '#7a7974',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8,
  },
  bullet: { fontSize: 15, color: '#28251d', marginBottom: 4, lineHeight: 22 },
  // OTC
  otcCard: { borderLeftWidth: 3, borderLeftColor: '#437a22' },
  otcText: { fontSize: 15, color: '#28251d', lineHeight: 22 },
  // Referral
  // Warning banner
  // Disclaimer
  disclaimer: {
    backgroundColor: '#f3f0ec', borderRadius: 10, padding: 12, marginBottom: 8,
  },
  disclaimerText: { color: '#7a7974', fontSize: 13, lineHeight: 18 },
  // Loading / Error
  loadingText: {
    fontSize: 18, fontWeight: '600', color: '#28251d', marginTop: 16, textAlign: 'center',
  },
  loadingSubtext: { fontSize: 14, color: '#7a7974', marginTop: 6, textAlign: 'center' },
  errorIcon: { fontSize: 56, marginBottom: 16 },
  errorTitle: { fontSize: 22, fontWeight: '700', color: '#28251d', marginBottom: 8, textAlign: 'center' },
  errorBody: { fontSize: 15, color: '#7a7974', textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  btn: {
    backgroundColor: '#01696f', paddingVertical: 14, paddingHorizontal: 40, borderRadius: 12,
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  ragNote: {
    backgroundColor: '#cedcd8', borderRadius: 10, padding: 12, marginBottom: 8,
  },
  ragNoteText: { color: '#01696f', fontSize: 13, lineHeight: 18 },
  otcSuppressed: {
    backgroundColor: '#f3f0ec', borderRadius: 10, padding: 12, marginBottom: 8,
  },
  otcSuppressedText: { color: '#7a7974', fontSize: 13, lineHeight: 18 },
  debugText: { fontSize: 11, color: '#bab9b4', textAlign: 'center', marginTop: 8 },
});
