import React from 'react';
import { Download, Sparkles, Shield, Globe, Cpu, ArrowRight, Layers } from 'lucide-react';

export const Hero: React.FC = () => {
  return (
    <section className="relative pt-28 pb-16 sm:pt-36 sm:pb-24 lg:pt-40 lg:pb-32 overflow-hidden">
      {/* Background Ambient Lights */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-600/15 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute top-1/3 right-10 w-[450px] h-[450px] bg-cyan-500/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          
          {/* Left Column: Headlines & CTA */}
          <div className="lg:col-span-7 text-center lg:text-left space-y-6 sm:space-y-8">
            
            {/* Top Pill */}
            <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-gradient-to-r from-indigo-500/10 via-cyan-500/10 to-indigo-500/10 border border-indigo-500/30 shadow-inner backdrop-blur-md">
              <Sparkles className="w-4 h-4 text-cyan-400 animate-pulse" />
              <span className="text-xs sm:text-sm font-semibold gradient-accent-text tracking-wide">
                Google Gemini AI &bull; On-Device Whisper &bull; GNU GPL v3
              </span>
            </div>

            {/* Main Headline */}
            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.1] text-white">
              Master Any Language While Watching{' '}
              <span className="gradient-accent-text">Videos</span>
            </h1>

            {/* Subtitle */}
            <p className="text-base sm:text-xl text-slate-300 max-w-2xl mx-auto lg:mx-0 font-normal leading-relaxed">
              Lexiduo transforms your favorite YouTube videos and local media into interactive language lessons with frame-accurate bilingual subtitles, an intelligent floating capsule over Android apps, and one-tap dictionary definitions.
            </p>

            {/* CTA Group */}
            <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 pt-2">
              <a
                href="https://github.com/mltcsvrai/lexiduo/releases/latest"
                target="_blank"
                rel="noopener noreferrer"
                className="glow-btn w-full sm:w-auto px-7 py-4 rounded-2xl font-bold text-white bg-gradient-to-r from-indigo-600 via-indigo-500 to-cyan-500 hover:opacity-95 shadow-xl shadow-indigo-600/30 flex items-center justify-center space-x-3 group text-base"
              >
                <Download className="w-5 h-5 transition-transform group-hover:-translate-y-0.5" />
                <span>Download Latest Release</span>
                <span className="text-xs px-2 py-0.5 rounded-md bg-white/20 text-white font-mono ml-1">
                  .apk
                </span>
              </a>

              <a
                href="#features"
                className="w-full sm:w-auto px-6 py-4 rounded-2xl font-semibold text-slate-200 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 transition-all flex items-center justify-center space-x-2 group"
              >
                <Layers className="w-4 h-4 text-cyan-400" />
                <span>Explore Features</span>
                <ArrowRight className="w-4 h-4 text-slate-400 transition-transform group-hover:translate-x-1" />
              </a>
            </div>

            {/* Quick Metrics & Feature Chips */}
            <div className="pt-6 border-t border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-4 text-left">
              <div className="space-y-1">
                <div className="flex items-center space-x-1.5 text-indigo-400 text-xs font-semibold uppercase tracking-wider">
                  <Globe className="w-3.5 h-3.5" />
                  <span>35+ Languages</span>
                </div>
                <p className="text-sm font-bold text-white">Full RTL & Asian</p>
              </div>

              <div className="space-y-1">
                <div className="flex items-center space-x-1.5 text-cyan-400 text-xs font-semibold uppercase tracking-wider">
                  <Layers className="w-3.5 h-3.5" />
                  <span>Floating Capsule</span>
                </div>
                <p className="text-sm font-bold text-white">YouTube Overlay</p>
              </div>

              <div className="space-y-1">
                <div className="flex items-center space-x-1.5 text-emerald-400 text-xs font-semibold uppercase tracking-wider">
                  <Cpu className="w-3.5 h-3.5" />
                  <span>Dual AI Engine</span>
                </div>
                <p className="text-sm font-bold text-white">Gemini + Whisper</p>
              </div>

              <div className="space-y-1">
                <div className="flex items-center space-x-1.5 text-amber-400 text-xs font-semibold uppercase tracking-wider">
                  <Shield className="w-3.5 h-3.5" />
                  <span>Privacy First</span>
                </div>
                <p className="text-sm font-bold text-white">Zero Trackers</p>
              </div>
            </div>

          </div>

          {/* Right Column: Visual Stage (Floating Overlay Simulation Card) */}
          <div className="lg:col-span-5 relative">
            <div className="relative mx-auto max-w-sm sm:max-w-md lg:max-w-none">
              
              {/* Outer Glow Halo */}
              <div className="absolute -inset-1.5 bg-gradient-to-r from-indigo-500 via-cyan-500 to-indigo-600 rounded-3xl blur-xl opacity-30 group-hover:opacity-100 transition duration-1000"></div>

              {/* Phone Mockup Frame */}
              <div className="relative rounded-3xl bg-[#0b0e17] border border-white/15 shadow-2xl overflow-hidden p-3 sm:p-4">
                
                {/* Simulated Phone Top Speaker & Notch */}
                <div className="flex items-center justify-between pb-3 px-2 border-b border-white/5">
                  <div className="flex items-center space-x-1.5">
                    <span className="w-2 h-2 rounded-full bg-red-500"></span>
                    <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                    <span className="w-2 h-2 rounded-full bg-green-500"></span>
                  </div>
                  <div className="px-3 py-0.5 rounded-full bg-white/5 text-[10px] font-mono text-slate-400">
                    YouTube App Overlay Active
                  </div>
                  <div className="text-[10px] text-emerald-400 font-mono font-semibold">
                    1080p 60fps
                  </div>
                </div>

                {/* Simulated YouTube Video Canvas */}
                <div className="relative aspect-[16/10] rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 overflow-hidden flex flex-col justify-end p-4 border border-white/10 group">
                  
                  {/* Subtle video ambient background */}
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-indigo-500/20 via-transparent to-transparent"></div>
                  
                  {/* Simulated video playback graphics */}
                  <div className="absolute top-3 left-3 flex items-center space-x-2 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-lg border border-white/10">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                    <span className="text-[11px] font-medium text-white">TED Talk &bull; Language Learning</span>
                  </div>

                  {/* Lexiduo Floating Subtitle Capsule (The Star Feature) */}
                  <div className="relative z-10 glass-panel rounded-2xl p-3.5 border-2 border-indigo-500/40 shadow-2xl shadow-indigo-950/80 transform hover:scale-[1.02] transition-transform">
                    <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-white/10">
                      <div className="flex items-center space-x-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                        <span className="text-[11px] font-bold text-indigo-300">Lexiduo Floating Capsule</span>
                      </div>
                      <span className="text-[10px] font-mono text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded border border-cyan-500/20">
                        Synchronized
                      </span>
                    </div>

                    {/* Original Subtitle */}
                    <p className="text-sm sm:text-base font-bold text-white tracking-wide">
                      "Curiosity turns foreign words into memorable stories."
                    </p>

                    {/* Translated Subtitle */}
                    <p className="text-xs sm:text-sm font-semibold text-cyan-300 mt-1">
                      "Merak, yabancı kelimeleri unutulmaz hikayelere dönüştürür."
                    </p>

                    {/* Interactive hint */}
                    <div className="mt-2 pt-1.5 border-t border-white/5 flex items-center justify-between text-[10px] text-slate-400">
                      <span>👆 Tap any word for instant dictionary</span>
                      <span className="text-indigo-300 font-mono">EN ➔ TR</span>
                    </div>
                  </div>

                </div>

                {/* Sub-Card: System Integration Highlights */}
                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                  <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5">
                    <div className="font-semibold text-slate-200">MediaSession Sync</div>
                    <div className="text-slate-400 text-[10px]">Zero delay frame lock</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5">
                    <div className="font-semibold text-slate-200">Smart Ad Freeze</div>
                    <div className="text-slate-400 text-[10px]">Auto-pause during ads</div>
                  </div>
                </div>

              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};
