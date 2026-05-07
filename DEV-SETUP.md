# DermaSeva — Developer Setup

**Developer README** – Everything you need to build and run DermaSeva locally.

## Prerequisites

### Required Software

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 20+ LTS | [nodejs.org](https://nodejs.org) |
| Android Studio | Latest | [developer.android.com/studio](https://developer.android.com/studio) |
| Java JDK | 17 | Comes with Android Studio |
| Git | Latest | [git-scm.com](https://git-scm.com) |

### Android Studio Setup

After installing Android Studio, open SDK Manager and install:
- **Android SDK Platform 35** (required — Play Store targetSdkVersion ≥ 35)
- **Android SDK Build-Tools 35.x**
- **Android Emulator** (optional — LiteRT needs physical device)

Set `ANDROID_HOME` environment variable:
```bash
# Add to ~/.bashrc or ~/.zshrc
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools
```

### Physical Device (Required for AI)

LiteRT inference for Gemma 4 E2B requires a **physical ARM Android device** with:
- **4 GB+ RAM** (model uses ~1.5 GB in memory)
- **3 GB free storage** (model file is 2.58 GB)
- **Android 8.0+** (API 26+)
- **USB Debugging** enabled (Settings → Developer Options → USB Debugging)

> **⚠️ This app does NOT work in Expo Go.** The `react-native-litert-lm` library uses native C++ (JSI/Nitro Modules) which requires a native build.

---

## One-Time Setup

```bash
# Clone the repository
git clone https://github.com/vivekjami/dermaseva.git
cd dermaseva

# Install dependencies
npm install

# Generate native android/ directory
npx expo prebuild --clean
```

---

## Every Dev Session

### Option A: USB-connected device (recommended)

```bash
# Connect your Android device via USB
# Verify it's detected:
adb devices

# Build and run
npx expo run:android
```

### Option B: Wireless debugging (Android 11+)

```bash
# Pair device (one-time):
adb pair <device-ip>:<port>

# Connect:
adb connect <device-ip>:<port>

# Build and run:
npx expo run:android
```

### After native code changes

If you modify `app.json` plugins or native configuration:
```bash
npx expo prebuild --clean
npx expo run:android
```

---

## Model Download

On first launch, the app will prompt to download the Gemma 4 E2B model (~2.58 GB). 

**For faster demo testing**, you can pre-load the model via ADB:

```bash
# Download the model file
wget https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it.litertlm

# Push to device (app must have been launched at least once to create the directory)
adb push gemma-4-E2B-it.litertlm /data/data/com.vivekjami.dermaseva/files/models/
```

---

## Project Architecture

```
Camera Screen
    │
    ▼ (photo + symptoms)
Result Screen
    │
    ├── 1. RAG Index Check → Build if needed
    ├── 2. Retrieve guideline chunks (TF-IDF cosine similarity)
    ├── 3. Load Gemma 4 E2B via LiteRT-LM
    ├── 4. Build prompt (system + user + RAG context)
    ├── 5. Run inference (on-device, ~10-30 seconds)
    ├── 6. Parse & validate JSON output
    ├── 7. Cross-check against RAG guidelines
    ├── 8. Apply OTC eligibility rules
    ├── 9. Apply referral logic
    └── 10. Save to SQLite history (PII-stripped)
```

---

## Key Files

| File | Purpose |
|------|---------|
| `modules/ai/litert.ts` | LiteRT-LM engine wrapper, model download, Gemma 4 E2B |
| `modules/ai/prompt-builder.ts` | Structured prompt with anti-hallucination rules |
| `modules/ai/output-parser.ts` | JSON validation, condition name normalization |
| `modules/rag/indexer.ts` | TF-IDF document chunking and embedding |
| `modules/rag/retriever.ts` | Cosine similarity search with keyword boosting |
| `modules/rag/validator.ts` | Cross-check AI output against guidelines |
| `modules/safety/otc-rules.ts` | NHM ASHA OTC medicine allowlist |
| `modules/safety/referral-logic.ts` | Severity-based referral decisions |
| `modules/security/model-verifier.ts` | SHA-256 model integrity verification |
| `modules/security/privacy-check.ts` | PII detection and sanitisation |

---

## Phase Status

- [x] **Phase 1** — Project scaffold, folder structure, Git setup
- [x] **Phase 2** — Onboarding flow, i18n (6 languages), navigation
- [x] **Phase 3** — Camera capture + image preprocessing + symptom input
- [x] **Phase 4** — On-device AI inference (LiteRT + Gemma 4 E2B)
- [x] **Phase 5** — RAG retrieval (TF-IDF) + output parsing + validation
- [x] **Phase 6** — Safety rules + OTC allowlist + referral logic
- [x] **Phase 7** — SQLite case history + PII sanitisation
- [x] **Phase 8** — Security hardening (model verification, log sanitiser)
- [ ] **Phase 9** — CI/CD (GitHub Actions + EAS Build)
- [ ] **Phase 10** — Play Store submission

---

## Troubleshooting

### "Native bridge not available"
You're running in Expo Go. Switch to native build:
```bash
npx expo prebuild --clean
npx expo run:android
```

### Model download fails
- Check Wi-Fi connection
- Ensure 4+ GB free storage
- Try pre-loading via ADB (see above)

### App crashes on inference
- Device needs 6+ GB RAM
- Close other apps to free memory
- GPU backend is auto-selected; if issues persist, the library falls back to CPU

### Build fails after dependency update
```bash
npx expo prebuild --clean
npx expo run:android
```

---

**Happy coding!** 🚀  
Any questions or blockers? Open an issue or ping the team.
