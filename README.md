# DermaSeva

**Offline AI Clinical Screening for Rural Frontline Health Workers**

Built for the Gemma 4 Good Hackathon — Health & Sciences · Digital Equity & Inclusivity · llama.cpp Special Track

---

## Why This Exists

India has over one million ASHA and Anganwadi workers. They are not doctors. They are community health workers — often the sole point of contact between a remote village and any form of medical guidance. They handle pediatric pneumonia, early leprosy, severe malnutrition, and fungal infections with no diagnostic tools, no specialist to call, and frequently no internet signal.

The problem is not that good AI doesn't exist. The problem is that it has never been built for this context — cheap hardware, zero connectivity, six languages, and users who need answers, not prompts.

DermaSeva is our attempt to close that gap.

---

## What It Actually Does

A health worker opens the app, selects a category (Skin, Child Health, or Malnutrition), and describes what they are seeing — by voice, in their own language. Within seconds, they receive a structured action plan: what to do, what not to do, and whether to refer the patient to a doctor immediately.

Everything — speech recognition, medical knowledge retrieval, LLM inference — happens on the device. No internet required. No data leaves the phone.

**35+ conditions are covered across three domains:**

- Skin: ringworm, leprosy, cellulitis, eczema, impetigo, psoriasis, vitiligo, fungal infections, boils
- Child health: pneumonia, dengue, tuberculosis suspect, malaria, newborn danger signs, conjunctivitis, ear infections, diarrhea with dehydration
- Malnutrition: SAM, MAM, iron deficiency anemia, vitamin A/D deficiency, iodine deficiency goiter

All conditions and treatment steps are mapped directly from NHM, WHO, and IMNCI guidelines. The app does not invent.

---

## The Engineering

### Stack

| Layer | Technology |
|---|---|
| Framework | React Native (Expo SDK 54+, bare workflow) |
| State | Zustand |
| C++ Bridge | React Native Nitro Modules |
| LLM Runtime | llama.cpp via `llama.rn` |
| Model | Gemma 4 E2B — `gemma-4-E2B-it-Q4_K_M.gguf` |
| Speech (Hindi/English) | Google Native Offline STT via `expo-speech-recognition` |
| Speech (Regional) | Whisper.cpp via `whisper.rn` — `ggml-small-q5_1.bin` |
| TTS | Google Offline TTS via `expo-speech` |
| Local Storage | expo-sqlite + expo-secure-store |
| Navigation | expo-router |

---

### Running Gemma 4 on a $150 Phone

This was the central engineering challenge. The Gemma 4 E2B model at full precision is ~8GB — far beyond what a budget Android device can handle.

**Quantization:** We use `Q4_K_M`, which compresses model weights from 16-bit floats to 4-bit integers. The resulting file is 3.11GB. Accuracy loss is negligible for this use case; the reasoning quality needed for structured clinical triage survives quantization well.

**Memory mapping:** Even 3.11GB cannot be loaded into active RAM on a 4GB device without an OOM crash. llama.cpp's `mmap` support maps the model file on flash storage into virtual memory. The CPU pages only the layers it needs at any given moment — keeping the active RAM footprint under 800MB during inference.

**Downloading the model on rural 3G:** Standard HTTP downloads reset on network drops. We built a resumable background loop using `FileSystem.createDownloadResumable`. On failure, the engine writes the current byte offset to disk via `savable()`, waits five seconds, and issues an HTTP `Range: bytes=X-` resume request. This retries up to 50 times. From the user's perspective, the progress bar pauses and continues. They never restart from zero.

---

### The Speech Pipeline

Getting voice input right across Indian languages was harder than the LLM work.

**Hindi and English** are handled by the native Android Google Speech Recognition engine via `expo-speech-recognition`. It is hardware-accelerated, streams interim results to the UI, and works offline once the language pack is downloaded. Fast and battery-efficient.

**Telugu, Tamil, Kannada, and Marathi** are a different problem. Google's offline recognition for these languages is either absent or unreliable on the devices our users actually have. We bypassed the OS entirely and embedded Whisper.cpp via `whisper.rn`, using the `ggml-small-q5_1.bin` model (~181MB). Audio is recorded as a WAV/PCM buffer via `expo-av` and fed directly into the Whisper engine.

The specific problem we had to solve: Whisper offline, without context, tends to transliterate Indian language audio into English phonetics. A worker saying "దురద" (itching) would come back as "doora." We fixed this with a prompt injection system (`WHISPER_PROMPTS`). When Telugu is selected, the Whisper engine is seeded with native-script medical vocabulary before transcription begins. This anchors the model's attention heads to the correct token space and produces accurate native-script output.

**TTS:** After Gemma generates a response, Google Offline TTS reads the action steps aloud. This matters — some workers have limited reading literacy, and the audio output is not a nice-to-have.

---

### The Knowledge Base and RAG

Gemma 4 is a capable model, but we cannot let it reason freely in a clinical context. A confident hallucination about drug dosage or referral thresholds is worse than no answer at all.

We considered local vector embeddings — TF-IDF, ChromaDB — and abandoned the approach. Cosine similarity over 300+ condition vectors is too slow and too battery-intensive on cheap hardware for a tool that needs to feel instant.

Instead, we built a deterministic keyword scoring algorithm. `knowledge-base.ts` contains 35+ condition entries, each with:

```typescript
{
  id: 'dengue_fever',
  category: 'child_health',
  conditionName: 'Dengue Fever / తీవ్రమైన జ్వరం (డెంగ్యూ)',
  keywords: ['fever', 'joint pain', 'eye pain', 'bleeding', 'rash', 'retro-orbital', 'జ్వరం', 'నొప్పి'],
  severity: 'severe',
  actionSteps: [
    'Assess for warning signs: bleeding from gums, persistent vomiting, severe abdominal pain.',
    'Do NOT give Aspirin or Ibuprofen. Use ONLY Paracetamol for fever.',
    'Ensure high fluid intake (ORS, coconut water).'
  ],
  referral: 'URGENT: If bleeding, severe pain, or cold clammy skin — refer to PHC/Hospital immediately.',
  source: 'NHM ASHA Guidelines - Vector Borne Diseases'
}
```

The transcribed symptom text is tokenized and scored against every `keywords` array. The top 3 matching conditions are retrieved and injected directly into Gemma's system prompt:

> "You are an AI assistant for ASHA workers. Compare the patient symptoms ONLY against the following verified NHM guidelines. Output a structured JSON response. Do NOT invent remedies outside these guidelines."

Gemma's output is strict JSON, validated before it reaches the UI. The model never operates without a clinical anchor.

---

### Safety Guardrails

Two hard rules that override everything else:

**Mandatory referrals:** Any condition marked `severe` in the knowledge base — leprosy, SAM, TB, dengue with warning signs — forces an URGENT referral output. The router catches the severity flag and renders a full-screen red alert. The worker must explicitly acknowledge before they can navigate away. "Treat at Home" options are not shown. This is hardcoded, not a suggestion to the LLM.

**Low confidence rejection:** If the keyword scorer finds no meaningful match, or if Gemma's confidence falls below threshold, the app shows a "Condition Not Recognized" screen that instructs the worker to consult a Medical Officer. The system would rather say nothing than say something wrong.

---

### Data Privacy

The privacy model is simple: the app is offline, so patient data has nowhere to go. There is no telemetry, no sync, no API endpoint. Case history — symptom text, AI output, severity flag, timestamp — is written to a local SQLite database via `expo-sqlite`. That database lives on the device and nowhere else.

---

### Session Flow, End to End

1. App opens — `llama-engine.ts` memory-maps the Gemma model from flash storage
2. Worker selects a condition category and taps the microphone
3. Speech input:
   - Hindi / English → native Google STT, streaming output
   - Telugu / Tamil / Kannada / Marathi → `whisper.rn` with native-script prompt injection (~4 seconds)
4. `findCandidateConditions()` scores the transcript against the knowledge base
5. System prompt + top 3 NHM guideline entries + symptom text are assembled
6. `llama.rn` runs inference against Gemma 4 E2B on-device
7. JSON output is validated; severity flag checked
8. If severe → full-screen referral alert via expo-router; otherwise → standard result screen
9. Google Offline TTS reads action steps aloud
10. Case logged to local SQLite

---

## Running It

**Requirements:**
- Node.js 20+ LTS
- Android Studio, SDK Platform 35, Build-Tools 35.x
- Physical ARM64 Android device, 4–6GB RAM

This project uses C++ JNI bindings (`llama.rn`, `whisper.rn`). Expo Go and web simulators will not work. You need a native build.

```bash
git clone https://github.com/vivekjami/dermaseva.git
cd dermaseva
npm install

npx expo prebuild --clean
npx expo run:android
```

On first launch: select language and worker type, wait for the Gemma model download (3.11GB, auto-resumes on drops), and the app is ready to use offline from that point forward.

---

## What Comes Next

These are not features we have — they are the honest next steps:

**True multimodal inference:** Currently the app is voice and text only. As llama.cpp's `llava` mobile support matures, the plan is to pass camera frames directly into a Vision-Language Model for visual diagnostic confirmation — still fully offline.

**NPU offloading via LiteRT:** CPU inference is functional but power-hungry. NNAPI delegate support through Google AI Edge would move matrix multiplication to the device NPU, cutting battery consumption significantly and pushing inference speed past 20 tokens/second.

**Fine-tuning with Unsloth:** A custom Gemma 4 fine-tune (`DermaSeva-Med-2B`) trained on Indian rural health corpora would reduce RAG prompt length, improve edge-case accuracy, and allow the model to operate with less injected context per session.

**PII sanitization and image metadata stripping:** Scanning symptom text for Aadhaar numbers and phone numbers before SQLite writes, and stripping EXIF data from any photos taken in-app. These are v3 targets.

**Expanded acoustic models:** Whisper fine-tuning on Santhali, Gondi, and other rural sub-dialects where the base model underperforms.

---

## Clinical Disclaimer

DermaSeva is a screening and triage tool. It does not diagnose. It operates within the legally permitted scope of ASHA practice — OTC remedies only, with mandatory escalation for anything beyond that boundary. Any real-world clinical deployment would require validation by licensed medical professionals and regulatory clearance. This submission is a working proof-of-concept.

---

## Tracks

- Main Track
- Impact Track: Health & Sciences
- Impact Track: Digital Equity & Inclusivity
- Special Technology Track: llama.cpp

---

## License

MIT.

Medical content sourced from the NHM ASHA Handbook, WHO Skin Disease Protocols, and IMNCI Guidelines — all publicly available.