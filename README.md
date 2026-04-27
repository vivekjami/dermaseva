# DermaSeva 🌿

**Skin Health Intelligence for Every Health Worker**

DermaSeva is an offline-first, multilingual mobile app that helps ASHA and Anganwadi workers in rural India perform AI-assisted skin disease screening — without internet, without cloud costs, and without sending patient photos off-device.

---

## Why DermaSeva Exists

Over 1 million ASHA workers operate across India's rural and semi-urban areas. They are often the first — and only — point of contact for patients with skin conditions like fungal infections, scabies, leprosy patches, and eczema. Most of these workers have no dermatology training and no way to consult a specialist in the field.

DermaSeva puts a clinical-grade AI assistant in their hands — one that speaks their language, works without WiFi, and always tells them when to refer a patient to a doctor.

---

## Features

- **On-device AI** — Gemma 4 E4B via LiteRT; zero data leaves the phone
- **Multimodal input** — Capture a photo + describe symptoms in your own words
- **RAG-backed answers** — Every AI output is validated against NHM India ASHA guidelines, WHO skin disease protocols, and ICMR standards indexed locally
- **Multi-language** — Hindi, Telugu, Tamil, Kannada, Marathi, English
- **Offline-first** — Works in zero-connectivity field conditions
- **Safety-first** — Mandatory "See a Doctor" CTA on every result; AI never makes a definitive cancer diagnosis
- **Case history log** — Local SQLite history so workers can track patient follow-ups

---

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile framework | React Native (Expo SDK 54+) |
| AI model | Gemma 4 E4B (multimodal, on-device, 3.65 GB) |
| On-device inference | LiteRT-LM (Google AI Edge) |
| RAG engine | SQLite + TF-IDF vector embeddings |
| Language support | i18next + react-native-localize |
| Local storage | expo-sqlite, expo-secure-store |
| State management | Zustand |
| CI/CD | GitHub Actions + EAS Build |

---

## Supported Conditions (v1 scope)

**OTC-eligible (ASHA workers may suggest remedies):**
- Ringworm (Tinea corporis / cruris)
- Tinea versicolor (Pityriasis versicolor)
- Scabies
- Contact Dermatitis (mild)
- Heat Rash (Miliaria)
- Mild Eczema (Atopic Dermatitis)

**Referral-only (always refers to doctor):**
- Leprosy (Hansen's disease)
- Psoriasis
- Cellulitis
- Skin Ulcer
- Suspected Melanoma / Skin Cancer
- Severe Eczema
- Drug Reaction

---

## Safety Disclaimer

> DermaSeva is an AI-assisted **screening tool**, not a diagnostic device. Every result screen includes a mandatory "See a Doctor" button. The app never claims to diagnose cancer or leprosy definitively. All suggestions are cross-validated against NHM and WHO indexed guidelines.

---

## Getting Started (Development)

### Prerequisites

- Node.js 20+ (LTS)
- Android Studio with SDK Platform 35, Build-Tools 35.x
- Java 17 JDK
- Physical ARM Android device (6 GB+ RAM) with USB debugging enabled
- `ANDROID_HOME` environment variable set

> **Important:** This app uses `react-native-litert-lm` which requires native modules. It does **not** work in Expo Go. You must use native builds.

### Clone and Install

```bash
git clone https://github.com/vivekjami/dermaseva.git
cd dermaseva
npm install
```

### Build and Run (Native — Required for AI)

```bash
# Generate native android/ directory
npx expo prebuild --clean

# Build and run on connected physical device
npx expo run:android
```

### First Launch

1. App opens → Onboarding: select language → select worker type
2. Camera screen → Take photo of skin condition
3. Symptom input → Select tags (Itching, Redness, etc.) + add description
4. First analysis → Downloads Gemma 4 E4B model (~3.65 GB, one-time, Wi-Fi recommended)
5. AI analysis → On-device inference → Result with referral CTA

---

## Project Structure

```
dermaseva/
├── app/                    # Expo Router screens
│   ├── (onboarding)/       # Language picker, worker type selection
│   ├── (main)/             # Camera, result, history screens
│   └── _layout.tsx
├── components/             # Reusable UI components
│   ├── SafetyBanner.tsx    # Low confidence / severe condition warnings
│   ├── ReferralCTA.tsx     # Always-visible "See a Doctor" button
│   ├── OtcCard.tsx         # OTC remedy card (ASHA/Anganwadi only)
│   └── ResultCard.tsx
├── modules/
│   ├── ai/                 # LiteRT + Gemma 4 E4B integration
│   │   ├── litert.ts       # Model loader, inference engine
│   │   ├── prompt-builder.ts # Structured prompt assembly
│   │   └── output-parser.ts  # JSON validation + condition normalization
│   ├── rag/                # On-device RAG pipeline
│   │   ├── indexer.ts      # TF-IDF document chunking + embedding
│   │   ├── retriever.ts    # Cosine similarity + keyword boosting
│   │   └── validator.ts    # Cross-check AI output vs guidelines
│   ├── safety/             # Medical safety rules
│   │   ├── otc-rules.ts    # OTC medicine eligibility (NHM allowlist)
│   │   └── referral-logic.ts # Urgency-based referral decisions
│   ├── security/           # Privacy & integrity
│   │   ├── model-verifier.ts # SHA-256 model integrity check
│   │   ├── privacy-check.ts  # PII detection & sanitisation
│   │   └── log-sanitiser.ts  # Strip sensitive data from logs
│   └── db/                 # Local storage
│       ├── schema.ts       # SQLite schema definition
│       ├── case-store.ts   # CRUD operations for case history
│       └── thumbnail.ts    # Image thumbnail generation
├── docs/                   # NHM/WHO guideline source documents
│   ├── nhm-asha-guidelines.txt
│   └── who-skin-guidelines.txt
├── i18n/                   # Translation JSON files (6 languages)
├── store/                  # Zustand global state
├── constants/              # Supported conditions, languages
├── assets/                 # Icons, splash screen
└── .github/workflows/      # CI/CD pipelines
```

---

## How It Works

```
📷 Camera → 📝 Symptoms → 🤖 Gemma 4 E4B (on-device) → 📋 RAG Validation → ✅ Result
                                    ↓
                           📚 NHM/WHO Guidelines
                           (TF-IDF vector search)
```

1. **Capture**: Worker photographs the skin condition
2. **Describe**: Quick-tag symptoms (Itching, Redness, etc.) + free text
3. **Infer**: Gemma 4 E4B analyzes photo + symptoms on-device via LiteRT
4. **Validate**: RAG retrieves relevant NHM/WHO guideline chunks; cross-checks AI output
5. **Safety**: OTC allowlist check, severity-based referral logic, confidence gating
6. **Result**: Condition name, severity, key signs, referral CTA, optional OTC remedy
7. **Save**: Case stored locally in SQLite (PII-stripped, thumbnail only)

---

## Hackathon Tracks Targeted

- Health & Sciences Impact Track
- Digital Equity & Inclusivity Track
- Cactus Special Track (local-first mobile)
- LiteRT Special Technology Track

---

## License

MIT License. See [LICENSE](./LICENSE).

Medical guideline documents (NHM ASHA Handbook, WHO Skin Guidelines) are sourced from publicly available government and international health organization publications.
