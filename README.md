<p align="center">
  <img src="assets/logo.png" alt="Lexiduo Logo" width="110" />
</p>

<h1 align="center">Lexiduo</h1>

<p align="center">
  <strong>Context-aware, AI-powered dual subtitle translator and language learning ecosystem for Android.</strong><br>
  All-in-one unified application supporting YouTube streaming, offline on-device Whisper AI speech recognition, context-aware Gemini AI translation, and synchronized floating overlay across Android apps.
</p>

<p align="center">
  <a href="https://github.com/mltcsvrai/lexiduo/releases/latest"><img src="https://img.shields.io/github/v/release/mltcsvrai/lexiduo?color=blue&label=Release" alt="Latest Release"></a>
  <a href="https://github.com/mltcsvrai/lexiduo/blob/master/LICENSE"><img src="https://img.shields.io/badge/License-GPL%20v3-blue.svg" alt="License: GPL v3"></a>
  <a href="https://github.com/mltcsvrai/lexiduo/releases/download/v0.0.3/app-release.apk"><img src="https://img.shields.io/badge/APK%20Size-27.2%20MB-success.svg" alt="APK Size: 27.2 MB"></a>
  <a href="https://www.rust-lang.org"><img src="https://img.shields.io/badge/Rust-NDK%20ARM64-DEA584.svg?logo=rust&logoColor=white" alt="Rust NDK"></a>
  <a href="https://capacitorjs.com"><img src="https://img.shields.io/badge/Capacitor-8-119EFF.svg?logo=capacitor&logoColor=white" alt="Capacitor"></a>
  <a href="https://react.dev"><img src="https://img.shields.io/badge/React-19-61DAFB.svg?logo=react&logoColor=white" alt="React 19"></a>
  <a href="https://tailwindcss.com"><img src="https://img.shields.io/badge/Tailwind-4-38B2AC.svg?logo=tailwind-css&logoColor=white" alt="Tailwind 4"></a>
</p>

<p align="center">
  <a href="https://github.com/mltcsvrai/lexiduo/releases/latest">
    <img src="https://img.shields.io/badge/Download-Lexiduo%20APK%20(Release%20v0.0.3)-success?style=for-the-badge&logo=android" alt="Download Release APK" />
  </a>
</p>

---

## ✨ Features

- 🎙️ **Offline On-Device Whisper AI**: Transcribe speech from local video files directly on your device without requiring an active internet connection or sending audio to third-party servers. Powered by quantized int8 Whisper models running via ONNX Runtime Mobile with zero-copy `FloatBuffer` tensors.
- ⚡ **64-Bit ARM NEON Rust DSP Engine (`liblexiduo_rust.so`)**: High-performance audio DSP migrating 400-point Real-FFT, Slaney Log-Mel spectrogram extraction, streaming PCM downmixing/resampling (48kHz/44.1kHz to 16kHz mono), and Hugging Face BPE token decoding to pure Rust via JNI. Reduces feature extraction time from seconds down to ~12 ms per 30-second audio chunk.
- 📺 **Polymorphic Dual-Mode Player**: Seamlessly switch between online YouTube streams and local video files (MP4, MKV).
- 🪟 **Synchronized YouTube Floating Overlay**: Watch videos in the official YouTube app while a floating, draggable bilingual subtitle capsule stays synchronized via native Android MediaSession & Accessibility Services.
- 🛑 **Intelligent Ad Detection**: Accessibility scanner detects YouTube ads in real time and freezes subtitles (`AD_BREAK_FREEZE`) until the ad concludes.
- 🧠 **Context-Aware AI Translation**: Translates complete grammatical sentences using Google Gemini AI to capture conversational nuances rather than broken word-by-word literal translation.
- 📐 **Zero-Drift Sentence Segmentation**: Automatically aggregates speech captions using punctuation, natural speech pauses ($\ge 0.75\text{s}$), and word limits, distributing translated text across proportional time windows with strict frame-accurate synchronization.
- 📖 **Interactive Word Lookup & Pronunciation**: Tap any subtitle word to pause playback, inspect instant definitions, listen to native pronunciation (Text-to-Speech via Web Speech API), or copy it.
- 📜 **Interactive Transcript & Tablet Split-View**: Full scrollable transcript panel with real-time sentence tracking and one-tap video seeking. Supports phones (portrait/landscape), split-screen and tablets.
- 🌍 **35 Global Languages & RTL Support**: Complete interface localization and subtitle support across 35 languages (English, Turkish, German, French, Spanish and more), including Right-to-Left (RTL) layout support for Arabic, Hebrew, and Persian.
- 📲 **System Share Intent & Smart Clipboard**: Automatically detects YouTube links from Android's "Share" menu or the system clipboard upon resuming the app.

---

## 🏛️ Architecture

The project is organized as a clean npm workspaces monorepo with integrated native Rust NDK acceleration:

```
lexiduo/
├── packages/
│   └── core/                     # Shared UI components, dictionary service, i18n, and types
├── apps/
│   ├── app/                      # Unified master app (YouTube + Local Video + Floating Overlay)
│   │   └── android/app/src/main/
│   │       ├── java/             # Android services, accessibility, overlay, and JNI bridges
│   │       ├── jniLibs/arm64-v8a/# Pre-built native 64-bit ARM NEON shared libraries
│   │       └── rust/             # Native Rust DSP & RealFFT crate (liblexiduo_rust.so)
│   └── landing/                  # Web showcase and documentation landing site
├── patches/                      # Upstream patches (Capacitor SendIntent)
└── package.json                  # Monorepo workspaces coordinator
```

---

## 🛠 Tech Stack

- **Monorepo**: npm workspaces
- **Frontend Core**: React 19, TypeScript, TailwindCSS 4, Lucide Icons, Zustand 5, IndexedDB (`idb-keyval`)
- **Mobile Container**: Capacitor 8, Android SDK 36 (Java 21)
- **Native Audio DSP & Systems**: Rust (2021 Edition), 64-bit ARM NEON SIMD (`realfft`, `rayon`, `serde`, `serde_json`, `jni`)
- **On-Device STT Engine**: OpenAI Whisper (ONNX Runtime Mobile `onnxruntime-android`)
- **Cloud Translation Engine**: Google Gemini AI

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

## 🔒 Security, Permissions & Privacy Architecture

Lexiduo is designed with a strict zero-telemetry, privacy-first architecture. Because several advanced native features require elevated Android platform permissions, our implementation enforces strict architectural safeguards to prevent false positives and guarantee user privacy:

| Component & Permission | Architectural Safeguards & Scope | Purpose |
| :--- | :--- | :--- |
| **Accessibility Service**<br>`YouTubeAccessibilityScanner`<br>`BIND_ACCESSIBILITY_SERVICE` | • Strictly scoped to `packageNames="com.google.android.youtube"` both at the OS manifest/XML config level and runtime package verification.<br>• **100% Read-Only:** Zero automated clicks, key injections, or touch gestures (`performAction` is never invoked). | Inspects YouTube UI hierarchy exclusively to detect active video ad intervals (`AD_BREAK_FREEZE`) and portrait video titles. |
| **Floating Overlay**<br>`FloatingOverlayService`<br>`SYSTEM_ALERT_WINDOW` | • Configured with `WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE` and `FLAG_LAYOUT_NO_LIMITS`.<br>• Cannot intercept keystrokes, soft-keyboard inputs, or touch events intended for background apps. | Renders non-intrusive bilingual subtitle capsules while you watch videos inside the YouTube app. |
| **Notification Listener**<br>`YouTubeNotificationListenerService`<br>`BIND_NOTIFICATION_LISTENER_SERVICE` | • **Zero Message Reading:** Never extracts notification text, senders, or message bodies (`extras` are completely ignored).<br>• Listens exclusively for `com.google.android.youtube` `MediaSession` playback tokens. | Synchronizes playback state (play/pause/seek) and timestamp progress with the floating overlay. |
| **Smart Clipboard**<br>`Clipboard.read()` | • Evaluated entirely in-memory on app resume using an offline 11-character regex (`extractYouTubeId`).<br>• If the clipboard text is not a valid YouTube URL/ID, it is discarded immediately without retention. Never transmitted over the network. | Automatically loads shared YouTube video links when you switch back to Lexiduo. |
| **Local Video Storage**<br>Android Storage Access Framework (SAF) | • **Zero Broad Storage Permissions:** `READ_EXTERNAL_STORAGE` and `WRITE_EXTERNAL_STORAGE` are completely purged.<br>• Access is strictly scoped to the exact video file chosen by the user via the Android system document picker. | Allows local video playback and on-device Whisper transcription without compromising device storage privacy. |
| **Native Binary Hardening**<br>MobSF & R8 Compliance | • Rust release profile configured with `strip = true`, `lto = true`, `opt-level = 3`, and `panic = "abort"`.<br>• ProGuard / R8 rules protect native JNI symbols while stripping unneeded code. | Guarantees zero unstripped debug symbols and optimal security hygiene under automated binary scanners. |

### 🛡️ VirusTotal Clean Scan Report

Lexiduo release binaries are fully audited and free of malware, spyware, or PUPs (**0 / 65 detections** on VirusTotal):

<p align="center">
  <img src="assets/screenshots/virustotal_report.png" alt="VirusTotal 100% Clean Scan Report" width="600" />
</p>

### ℹ️ Android 13+ Sideloading Notice ("Allow Restricted Settings")
When sideloading APKs outside Google Play on Android 13 and newer, Android automatically restricts Accessibility and Notification Listener permissions for downloaded apps as a default platform security precaution:
1. Open Android **Settings** ➔ **Apps** ➔ **Lexiduo**.
2. Tap the **three dots (⋮)** in the top right corner.
3. Select **"Allow restricted settings"** and confirm with your device PIN or biometric unlock.
4. You can now enable the Accessibility Service and Notification Listener in their respective Android settings menus.

---

## 📄 License

This project is licensed under the [GNU General Public License v3.0](LICENSE).
