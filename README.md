<p align="center">
  <img src="assets/logo.png" alt="Lexiduo Logo" width="110" />
</p>

<h1 align="center">Lexiduo</h1>

<p align="center">
  <strong>Context-aware, AI-powered dual subtitle translator and language learning ecosystem for Android and Web.</strong><br>
  All-in-one unified application supporting YouTube streaming, local video playback with on-demand Whisper AI speech recognition, and synchronized floating overlay across Android apps.
</p>

<p align="center">
  <a href="https://github.com/mltcsvrai/lexiduo/releases/latest"><img src="https://img.shields.io/github/v/release/mltcsvrai/lexiduo?color=blue&label=Release" alt="Latest Release"></a>
  <a href="https://github.com/mltcsvrai/lexiduo/releases"><img src="https://img.shields.io/github/downloads/mltcsvrai/lexiduo/total?color=blueviolet&label=Downloads" alt="Total Downloads"></a>
  <a href="https://github.com/mltcsvrai/lexiduo/blob/master/LICENSE"><img src="https://img.shields.io/badge/License-GPL%20v3-blue.svg" alt="License: GPL v3"></a>
  <a href="https://capacitorjs.com"><img src="https://img.shields.io/badge/Capacitor-8-119EFF.svg?logo=capacitor&logoColor=white" alt="Capacitor"></a>
  <a href="https://react.dev"><img src="https://img.shields.io/badge/React-19-61DAFB.svg?logo=react&logoColor=white" alt="React 19"></a>
  <a href="https://tailwindcss.com"><img src="https://img.shields.io/badge/Tailwind-4-38B2AC.svg?logo=tailwind-css&logoColor=white" alt="Tailwind 4"></a>
</p>

<p align="center">
  <a href="https://github.com/mltcsvrai/lexiduo/releases/latest">
    <img src="https://img.shields.io/badge/Download-Lexiduo%20APK%20(Release)-success?style=for-the-badge&logo=android" alt="Download Release APK" />
  </a>
</p>

---

## ✨ Features

- 📺 **Polymorphic Dual-Mode Player**: Seamlessly switch between online YouTube streams and local video files (MP4, MKV).
- 🪟 **Synchronized YouTube Floating Overlay**: Watch videos in the official YouTube app while a floating, draggable bilingual subtitle capsule stays synchronized via native Android MediaSession & Accessibility Services.
- 🛑 **Intelligent Ad Detection**: Accessibility scanner detects YouTube ads in real time and freezes subtitles (`AD_BREAK_FREEZE`) until the ad concludes.
- 🧠 **Context-Aware AI Translation**: Translates complete grammatical sentences using Google Gemini AI to capture conversational nuances rather than broken word-by-word literal translation.
- 📐 **Zero-Drift Sentence Segmentation**: Automatically aggregates speech captions using punctuation, natural speech pauses ($\ge 0.75\text{s}$), and word limits, distributing translated text across proportional time windows with strict frame-accurate synchronization.
- 📖 **Interactive Word Lookup & Pronunciation**: Tap any subtitle word to pause playback, inspect instant definitions, listen to native pronunciation (Text-to-Speech via Web Speech API), or copy it.
- 📜 **Interactive Transcript & Tablet Split-View**: Full scrollable transcript panel with real-time sentence tracking and one-tap video seeking. Supports phones (portrait/landscape), split-screen tablets, and desktop.
- 🌍 **35 Global Languages & RTL Support**: Complete interface localization and subtitle support across 35 languages, including Right-to-Left (RTL) layout support for Arabic, Hebrew, and Persian.
- 📲 **System Share Intent & Smart Clipboard**: Automatically detects YouTube links from Android's "Share" menu or the system clipboard upon resuming the app.

---

## 🏛️ Architecture

The project is organized as a clean npm workspaces monorepo:

```
ytceviri/
├── packages/
│   └── core/                     # Shared UI components, dictionary service, i18n, and types
├── apps/
│   └── app/                      # Unified master app (YouTube + Local Video + Floating Overlay + Whisper AI)
├── patches/                      # Upstream patches (Capacitor SendIntent)
└── package.json                  # Monorepo workspaces coordinator
```

---

## 🛠 Tech Stack

- **Monorepo**: npm workspaces
- **Frontend Core**: React 19, TypeScript, TailwindCSS 4, Lucide Icons, Zustand 5, IndexedDB (`idb-keyval`)
- **Mobile Container**: Capacitor 8, Android SDK 36 (Java 21)
- **Local AI & Audio**: Web Audio API (`OfflineAudioContext` 16kHz PCM), `@huggingface/transformers` (WASM / ONNX)
- **Cloud Translation Engine**: Google Gemma 4 31B IT, Gemini 3.5 Flash Lite, Cloudflare Workers proxy

---

## 💻 Development & Build

```bash
# Clone the repository
git clone https://github.com/mltcsvrai/lexiduo.git
cd lexiduo

# Install workspace dependencies & apply patches
npm install

# Run unit tests across all packages
npm run test

# Run code linter
npm run lint

# Start development server
npm run dev

# Build web distribution
npm run build

# Build Android Release APK (Strictly Release-Only)
cd apps/app/android && ./gradlew assembleRelease
```

---

## 📄 License

This project is licensed under the [GNU General Public License v3.0](LICENSE).
