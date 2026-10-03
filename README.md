<p align="center">
  <img src="assets/logo.png" alt="YT Translator Logo" width="110" />
</p>

<h1 align="center">YT Translator</h1>

<p align="center">
  <strong>Context-aware, AI-powered YouTube subtitle translator and language learning app for Android.</strong><br>
  Learn languages naturally by understanding words and idioms in context while watching videos.
</p>

<p align="center">
  <a href="https://github.com/mltcsvrai/yt-translate-android/releases/latest"><img src="https://img.shields.io/github/v/release/mltcsvrai/yt-translate-android?color=blue&label=Release" alt="Latest Release"></a>
  <a href="https://github.com/mltcsvrai/yt-translate-android/blob/master/LICENSE"><img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License"></a>
  <a href="https://capacitorjs.com"><img src="https://img.shields.io/badge/Capacitor-8-119EFF.svg?logo=capacitor&logoColor=white" alt="Capacitor"></a>
  <a href="https://react.dev"><img src="https://img.shields.io/badge/React-19-61DAFB.svg?logo=react&logoColor=white" alt="React 19"></a>
  <a href="https://tailwindcss.com"><img src="https://img.shields.io/badge/Tailwind-4-38B2AC.svg?logo=tailwind-css&logoColor=white" alt="Tailwind 4"></a>
</p>

<p align="center">
  <a href="https://github.com/mltcsvrai/yt-translate-android/releases/latest/download/app-release.apk">
    <img src="https://img.shields.io/badge/Download-Release%20APK-success?style=for-the-badge&logo=android" alt="Download APK" />
  </a>
</p>

---

## ✨ Highlights

- 🧠 **Context-Aware AI Translation**: Translates complete sentences using Google Gemma 4 31B IT and Gemini AI to capture conversational nuances and metaphors rather than broken word-by-word literal translation.
- 📐 **Zero-Drift Sentence Segmentation**: Automatically aggregates fragmented YouTube ASR captions using punctuation, natural speech pauses ($\ge 0.75\text{s}$), and word limits, distributing translated text across proportional time windows with strict frame-accurate synchronization.
- 🛡️ **Autonomous Subtitle Gap Auditor**: In-place auditor automatically inspects translated cues, detects dropped or mismatched segments, and seamlessly repairs them in the background.
- 📖 **Interactive Word Lookup & Audio Pronunciation**: Tap any subtitle word to automatically pause playback and view its instant translation, hear native audio pronunciation (Text-to-Speech via Web Speech API), or copy it with a single tap.
- 🧩 **Multi-Word Idiom Selection**: Select phrasal verbs and multi-word expressions directly on screen to look them up and translate them as cohesive linguistic units.
- 📜 **Interactive Transcript & Tablet Split-View**: Full scrollable transcript panel with real-time sentence tracking and one-tap video seeking. Supports phones (portrait/landscape), split-screen tablets, and desktop.
- 📲 **YouTube Share Intent & Smart Clipboard**: Share any video directly from the official YouTube app (`ACTION_SEND`) or instantly open copied YouTube links detected from your clipboard.
- 🌍 **35 Global Languages & RTL Support**: Complete interface localization and subtitle support across 35 languages, including Right-to-Left (RTL) layout support for Arabic, Hebrew, and Persian.
- 💾 **Local-First & Offline-Tolerant (IndexedDB)**: Transcripts are cached locally with an LRU eviction policy (up to 20 videos) for instant replay. Watch history, per-video timestamps, and user preferences remain on your device.
- ⚡ **Zero Setup (Works Out of the Box)**: No registration or API key needed. The built-in free standard translation engine is active immediately upon install.
- 🔑 **Optional AI Power (BYOK)**: For deeper conversational nuance and slang detection, you can optionally connect your free Gemini API key to activate Google Gemma 4 31B IT models.

---

## 🚀 Quick Start (Zero Setup Required)

1. **Install App**: Download [`app-release.apk`](https://github.com/mltcsvrai/yt-translate-android/releases/latest/download/app-release.apk) and install it on your Android phone.
2. **Start Watching**: Open the app and start learning immediately! The **free standard engine is enabled by default** with zero setup.
3. **Optional AI Turbocharge**: If you want deep contextual AI translations, you can optionally paste a free Google Gemini key in **Settings** (obtainable free at [Google AI Studio](https://aistudio.google.com/apikey)).

---

## 🛠 Tech Stack

- **Frontend Core**: React 19, TypeScript, TailwindCSS 4, Vite 8
- **State Management**: Zustand 5
- **Mobile Container**: Capacitor 8 (Android)
- **Local Storage**: IndexedDB via `idb-keyval` (Local-first & LRU Transcript Cache)
- **UI & Popovers**: `@floating-ui/react`, Lucide Icons
- **AI Models**: Google Gemma 4 31B IT, Gemini 3.5 Flash Lite, Gemini 2.5 Flash Lite
- **Native Integrations**: Capacitor Clipboard, Native Share Intent (`ACTION_SEND`), Android Hardware Back Navigation

---

## 💻 Development & Build

```bash
# Clone the repository
git clone https://github.com/mltcsvrai/yt-translate-android.git
cd yt-translate-android

# Install dependencies
npm install

# Run test suite
npx vitest run

# Start local web development server
npm run dev

# Build web assets and sync with Capacitor Android
npm run build && npx cap sync android

# Compile Android Release APK
cd android && ./gradlew assembleRelease
```

Compiled APK will be generated at `android/app/build/outputs/apk/release/app-release.apk`.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
