import React from 'react';
import { Download, Smartphone, ShieldCheck, AlertCircle, ExternalLink } from 'lucide-react';

export const InstallGuide: React.FC = () => {
  return (
    <section id="install" className="py-20 sm:py-28 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4 mb-16">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold uppercase tracking-wider">
            <Smartphone className="w-3.5 h-3.5" />
            <span>Android Installation</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
            Get Lexiduo for Android
          </h2>
          <p className="text-slate-400 text-base sm:text-lg">
            Download the signed release APK directly from GitHub Releases. No root access or proprietary app stores needed.
          </p>
        </div>

        {/* Main Download & Guide Card */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          
          {/* Left Column: Direct Download Action */}
          <div className="lg:col-span-5 glass-panel rounded-3xl p-8 sm:p-10 border border-white/10 shadow-2xl space-y-6 bg-[#0c101c]">
            <div className="space-y-2">
              <span className="text-xs font-mono text-indigo-400 font-semibold uppercase tracking-wider">
                Official Release
              </span>
              <h3 className="text-3xl font-black text-white">
                Lexiduo APK
              </h3>
              <p className="text-slate-300 text-sm">
                Signed release build featuring the unified master architecture (YouTube streaming, floating overlay, and dual subtitles).
              </p>
            </div>

            {/* Spec Details */}
            <div className="space-y-2 py-4 border-y border-white/10 text-xs font-mono">
              <div className="flex justify-between text-slate-300">
                <span className="text-slate-400">Package ID:</span>
                <span className="text-white font-bold">com.lexiduo.app</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span className="text-slate-400">Build Type:</span>
                <span className="text-emerald-400 font-bold">Release (Signed)</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span className="text-slate-400">Target Platform:</span>
                <span className="text-white">Android 7.0+ (SDK 24 - 36)</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span className="text-slate-400">License:</span>
                <span className="text-cyan-400">GNU GPL v3</span>
              </div>
            </div>

            {/* Download CTA Button */}
            <a
              href="https://github.com/mltcsvrai/lexiduo/releases/latest"
              target="_blank"
              rel="noopener noreferrer"
              className="glow-btn w-full py-4 px-6 rounded-2xl font-bold text-white bg-gradient-to-r from-indigo-600 via-indigo-500 to-cyan-500 hover:opacity-95 shadow-xl shadow-indigo-600/30 flex items-center justify-center space-x-3 text-base"
            >
              <Download className="w-5 h-5" />
              <span>Download on GitHub Releases</span>
              <ExternalLink className="w-4 h-4 text-white/70" />
            </a>

            <div className="flex items-center justify-center space-x-2 text-[11px] text-slate-400">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Always verify release checksums on GitHub Releases</span>
            </div>
          </div>

          {/* Right Column: 3 Steps for Installation */}
          <div className="lg:col-span-7 space-y-4">
            
            <div className="glass-panel rounded-2xl p-6 border border-white/10 flex items-start space-x-4">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold font-mono shrink-0">
                1
              </div>
              <div className="space-y-1">
                <h4 className="text-lg font-bold text-white">
                  Download the Release APK
                </h4>
                <p className="text-slate-300 text-sm">
                  Click the download button above to visit the latest release page on GitHub and download <code className="text-xs bg-white/10 px-1.5 py-0.5 rounded text-cyan-300">app-release.apk</code>.
                </p>
              </div>
            </div>

            <div className="glass-panel rounded-2xl p-6 border border-white/10 flex items-start space-x-4">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 font-bold font-mono shrink-0">
                2
              </div>
              <div className="space-y-1">
                <h4 className="text-lg font-bold text-white">
                  Allow Installation from Unknown Sources
                </h4>
                <p className="text-slate-300 text-sm">
                  If prompted by your browser or file manager, toggle <strong className="text-white">"Allow from this source"</strong> in Android settings to complete installation.
                </p>
              </div>
            </div>

            <div className="glass-panel rounded-2xl p-6 border border-white/10 flex items-start space-x-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold font-mono shrink-0">
                3
              </div>
              <div className="space-y-1">
                <h4 className="text-lg font-bold text-white">
                  Grant Floating Overlay & Accessibility Permissions
                </h4>
                <p className="text-slate-300 text-sm">
                  To display the bilingual subtitle capsule over the official YouTube app, enable <strong className="text-white">"Display over other apps"</strong> and <strong className="text-white">"Accessibility"</strong> when prompted.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center space-x-3 text-xs text-amber-200">
              <AlertCircle className="w-5 h-5 shrink-0 text-amber-400" />
              <span>
                Accessibility permission is strictly used on-device to detect YouTube ads and player sync. No keystrokes or personal information are ever monitored.
              </span>
            </div>

          </div>

        </div>

      </div>
    </section>
  );
};
