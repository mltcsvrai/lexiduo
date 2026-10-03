<p align="center">
  <img src="https://raw.githubusercontent.com/mltcsvrai/yt-translate-android/master/assets/logo.png" alt="YT Çeviri Logo" width="110" />
</p>

<h1 align="center">YT Çeviri</h1>

<p align="center">
  <strong>Context-aware, AI-powered YouTube subtitle translator for Android.</strong><br>
  Learn languages naturally by understanding words and idioms in context while watching videos.
</p>

<p align="center">
  <a href="https://github.com/mltcsvrai/yt-translate-android/releases/latest"><img src="https://img.shields.io/github/v/release/mltcsvrai/yt-translate-android?color=blue&label=Release" alt="Latest Release"></a>
  <a href="https://github.com/mltcsvrai/yt-translate-android/blob/master/LICENSE"><img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License"></a>
  <a href="https://capacitorjs.com"><img src="https://img.shields.io/badge/Capacitor-8-119EFF.svg?logo=capacitor&logoColor=white" alt="Capacitor"></a>
  <a href="https://react.dev"><img src="https://img.shields.io/badge/React-18-61DAFB.svg?logo=react&logoColor=white" alt="React"></a>
</p>

<p align="center">
  <a href="https://github.com/mltcsvrai/yt-translate-android/releases/latest/download/app-release.apk">
    <img src="https://img.shields.io/badge/Download-Release%20APK-success?style=for-the-badge&logo=android" alt="Download APK" />
  </a>
</p>

---

## ✨ Highlights

- 🧠 **Context-Aware Translation**: Translates subtitle words within sentence context using Google Gemini.
- 🧩 **Idiom & Phrase Grouping**: Automatically identifies idioms and phrasal verbs as single units.
- 📲 **YouTube Share Intent**: Share any video directly from the official YouTube app to start watching.
- ⏱️ **Audio-Subtitle Sync**: On-the-fly subtitle offset adjustment (-5s to +5s) for delayed captions.
- 🔑 **Bring Your Own Key (BYOK)**: 100% free and open source. Use your own free Gemini API key.

---

## 🚀 Quick Start

1. **Download APK**: Grab the latest [`app-release.apk`](https://github.com/mltcsvrai/yt-translate-android/releases/latest/download/app-release.apk) and install it on your Android phone.
2. **Add API Key**: Open the app and paste your free key from [Google AI Studio](https://aistudio.google.com/).
3. **Start Learning**: Search any YouTube video or share directly from the YouTube app.

---

## 🛠 Tech Stack

- **Frontend**: React, TypeScript, TailwindCSS, Lucide Icons
- **Mobile Container**: Capacitor 8 (Android)
- **AI & Metadata**: Google Gemini API, Cloudflare Workers

---

## 💻 Development

```bash
# Clone & install
git clone https://github.com/mltcsvrai/yt-translate-android.git
cd yt-translate-android
npm install

# Start local web dev
npm run dev

# Build Android Release APK
npm run build && npx cap sync android
cd android && ./gradlew assembleRelease
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
