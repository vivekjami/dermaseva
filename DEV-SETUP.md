# DermaSeva — Developer Setup (WSL2)

**Developer README** – Everything you need to run DermaSeva locally on WSL2.

## Prerequisites

- Ubuntu on **WSL2**
- Node.js **22 LTS** (installed via nvm)
- Expo Go app installed on your Android phone
- ngrok account with authtoken already configured

## One-Time Setup

```bash
# Install project dependencies
npm install

# Add ngrok authtoken (run only once)
ngrok config add-authtoken YOUR_TOKEN_HERE
```

## Every Dev Session (2 terminals required)

### Terminal 1 — Start ngrok tunnel

```bash
ngrok http --host-header=localhost 8081
```

Copy the public URL shown (e.g. `https://xxxx.ngrok-free.dev`).

### Terminal 2 — Start Metro bundler

```bash
EXPO_PACKAGER_PROXY_URL=https://xxxx.ngrok-free.dev npx expo start --lan --clear
```

> Replace the URL with the one you copied from Terminal 1.

### Connect your phone

1. Open **Expo Go** on your Android phone.
2. Scan the QR code shown in Terminal 2.

## Important Notes

- The ngrok URL **changes every session** (free tier) → always copy a fresh URL from Terminal 1.
- WSL internal IP changes on every reboot → **never** rely on LAN IP. Always use ngrok.
- Expo’s built-in `--tunnel` flag is currently broken (their free ngrok service is suspended) → manual ngrok is required.
- Your phone and PC **do not** need to be on the same Wi-Fi network when using ngrok.

## Project Structure

```text
app/
├── (onboarding)/
│   ├── language.tsx
│   └── worker-type.tsx
├── (main)/
│   ├── camera.tsx
│   ├── result.tsx
│   └── history.tsx
├── _layout.tsx
├── index.tsx
├── components/
├── modules/
│   ├── ai/
│   ├── rag/
│   └── safety/
├── i18n/
├── store/
└── constants/
```

## Current Phase Status

- [x] **Phase 1** — Project scaffold, folder structure, Git setup
- [x] **Phase 2** — Onboarding flow, i18n (6 languages), navigation
- [ ] **Phase 3** — Camera capture + image preprocessing
- [ ] **Phase 4** — On-device AI inference (LiteRT)
- [ ] **Phase 5** — RAG retrieval + output parsing
- [ ] **Phase 6** — Safety rules + referral logic
- [ ] **Phase 7** — SQLite case history
- [ ] **Phase 8** — UI polish + offline support
- [ ] **Phase 9** — EAS production build + Play Store submission

---

**Happy coding> DEV-SETUP.md << 'EOF'*  
Any questions or blockers? Open an issue or ping the team. 🚀
