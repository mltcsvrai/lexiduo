import React from 'react';
import { Layers, Brain, Video, BookOpen, ScrollText, ShieldCheck, Sparkles } from 'lucide-react';

export const BentoGrid: React.FC = () => {
  return (
    <section id="features" className="py-20 sm:py-28 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4 mb-16">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-xs font-semibold uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Architecture & Capabilities</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
            Engineered for Effortless Comprehension
          </h2>
          <p className="text-slate-400 text-base sm:text-lg">
            Every layer of Lexiduo is purpose-built to merge natural language context with high-performance video synchronization.
          </p>
        </div>

        {/* Bento Grid Layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          
          {/* Card 1: Synchronized Floating Overlay (Large) */}
          <div className="lg:col-span-2 glass-panel glass-panel-hover rounded-3xl p-8 relative overflow-hidden flex flex-col justify-between">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                <Layers className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-bold text-white">
                Synchronized YouTube Floating Overlay
              </h3>
              <p className="text-slate-300 text-sm sm:text-base leading-relaxed max-w-xl">
                Watch videos inside the official YouTube Android application while a draggable, bilingual subtitle capsule stays locked to playback via Android MediaSession & Accessibility Services. Detects ad breaks in real time and freezes automatically.
              </p>
            </div>

            <div className="mt-8 pt-6 border-t border-white/10 flex flex-wrap gap-2 text-xs font-mono text-slate-300">
              <span className="px-3 py-1 rounded-xl bg-white/5 border border-white/10">Android MediaSession</span>
              <span className="px-3 py-1 rounded-xl bg-white/5 border border-white/10">Ad Freeze Detector</span>
              <span className="px-3 py-1 rounded-xl bg-white/5 border border-white/10">System Alert Window</span>
            </div>
          </div>

          {/* Card 2: Context-Aware Gemini AI */}
          <div className="glass-panel glass-panel-hover rounded-3xl p-8 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                <Brain className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-white">
                Context-Aware AI Translation
              </h3>
              <p className="text-slate-300 text-sm leading-relaxed">
                Powered by Google Gemini AI and Gemma. Translates complete grammatical thoughts and conversational slang instead of broken word-by-word literal translations.
              </p>
            </div>

            <div className="mt-6 pt-4 border-t border-white/10 text-xs text-cyan-300 font-semibold flex items-center gap-1.5">
              <span>Zero-drift sentence segmentation</span>
            </div>
          </div>

          {/* Card 3: Polymorphic Local & Stream Player */}
          <div className="glass-panel glass-panel-hover rounded-3xl p-8 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <Video className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-white">
                Polymorphic Dual Player
              </h3>
              <p className="text-slate-300 text-sm leading-relaxed">
                Seamlessly play online YouTube streams or local media files (MP4, MKV) with multi-track subtitle selection and synchronized controls.
              </p>
            </div>

            <div className="mt-6 pt-4 border-t border-white/10 text-xs text-emerald-400 font-semibold">
              <span>MP4 & MKV &bull; Multi-Track Subtitles</span>
            </div>
          </div>

          {/* Card 4: Interactive Word Lookup & Dictionary */}
          <div className="glass-panel glass-panel-hover rounded-3xl p-8 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                <BookOpen className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-white">
                Instant Word Lookup & TTS
              </h3>
              <p className="text-slate-300 text-sm leading-relaxed">
                Tap any subtitle token to pause playback instantly, inspect contextual definitions, parts of speech, and listen to authentic native speech pronunciation via Web Speech API.
              </p>
            </div>

            <div className="mt-6 pt-4 border-t border-white/10 text-xs text-purple-300 font-semibold">
              <span>Interactive Word Drawer &bull; Native Audio</span>
            </div>
          </div>

          {/* Card 5: Full Transcript & Tablet Split-View */}
          <div className="glass-panel glass-panel-hover rounded-3xl p-8 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <ScrollText className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-white">
                Interactive Transcript Panel
              </h3>
              <p className="text-slate-300 text-sm leading-relaxed">
                Explore the entire video transcript in a scrollable panel with real-time sentence tracking. Tap any sentence to seek directly to that exact second in the video.
              </p>
            </div>

            <div className="mt-6 pt-4 border-t border-white/10 text-xs text-amber-300 font-semibold">
              <span>Split-screen tablet & landscape mode</span>
            </div>
          </div>

          {/* Card 6: Open Source & Privacy First */}
          <div className="lg:col-span-3 glass-panel glass-panel-hover rounded-3xl p-8 flex flex-col sm:flex-row items-center justify-between gap-6 border border-emerald-500/20">
            <div className="space-y-2 text-center sm:text-left">
              <div className="flex items-center justify-center sm:justify-start space-x-2 text-emerald-400 text-xs font-bold uppercase tracking-wider">
                <ShieldCheck className="w-4 h-4" />
                <span>GNU General Public License v3.0</span>
              </div>
              <h3 className="text-2xl font-bold text-white">
                100% Open Source &bull; Zero Ads &bull; No Tracking
              </h3>
              <p className="text-slate-300 text-sm max-w-3xl">
                Lexiduo respects your privacy. No user analytics, no background telemetry, no forced account creation. All personal API keys are stored securely in local device storage.
              </p>
            </div>

            <a
              href="https://github.com/mltcsvrai/lexiduo"
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 py-3 rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold text-sm border border-white/10 whitespace-nowrap transition-all"
            >
              Inspect Source on GitHub
            </a>
          </div>

        </div>

      </div>
    </section>
  );
};
