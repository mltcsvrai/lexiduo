import React, { useState, useEffect } from 'react';
import { Play, Pause, Volume2, Globe, Sparkles, BookOpen, Check, Copy } from 'lucide-react';
import { SAMPLE_CUES, SUPPORTED_LANGUAGES } from '../data/sampleSubtitles';
import type { WordDetail } from '../types/simulator';

export const LiveSimulator: React.FC = () => {
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentCueIndex, setCurrentCueIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [selectedLang, setSelectedLang] = useState('tr');
  const [activeWord, setActiveWord] = useState<WordDetail | null>(SAMPLE_CUES[0].words[1]); // Default to "acquisition"
  const [copied, setCopied] = useState(false);

  // Auto-play timeline simulation
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          setCurrentCueIndex((c) => (c === 0 ? 1 : 0));
          return 0;
        }
        return prev + 2.5;
      });
    }, 200);

    return () => clearInterval(interval);
  }, [isPlaying]);

  const currentCue = SAMPLE_CUES[currentCueIndex];

  // Native Speech Synthesis
  const handlePronounce = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleCopyWord = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section id="simulator" className="py-20 sm:py-28 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4 mb-12 sm:mb-16">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 text-xs font-semibold uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Interactive Web Playground</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
            Try the Dual Subtitle & Word Lookup Experience
          </h2>
          <p className="text-slate-400 text-base sm:text-lg">
            Click any word in the subtitle below to inspect its dictionary definition, grammatical category, and native audio pronunciation.
          </p>
        </div>

        {/* Playground Arena */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Left Column: Simulated Video Player with Dual Subtitles */}
          <div className="lg:col-span-7 space-y-4">
            
            {/* Player Container */}
            <div className="glass-panel rounded-3xl overflow-hidden border border-white/10 shadow-2xl bg-[#090c14]">
              
              {/* Simulated Video Viewport */}
              <div className="relative aspect-video bg-gradient-to-br from-slate-950 via-[#0d1322] to-slate-950 flex flex-col justify-between p-4 sm:p-6 overflow-hidden">
                
                {/* Ambient dynamic waves */}
                <div className="absolute inset-0 opacity-20 pointer-events-none">
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-500 rounded-full blur-[100px]"></div>
                </div>

                {/* Top Video Header */}
                <div className="relative z-10 flex items-center justify-between">
                  <div className="flex items-center space-x-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10">
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-pulse"></span>
                    <span className="text-xs font-medium text-slate-200">
                      Lexiduo Bilingual Engine
                    </span>
                  </div>

                  {/* Target Language Dropdown */}
                  <div className="flex items-center space-x-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10">
                    <Globe className="w-3.5 h-3.5 text-slate-400" />
                    <select
                      value={selectedLang}
                      onChange={(e) => setSelectedLang(e.target.value)}
                      className="bg-transparent text-xs font-semibold text-white focus:outline-none cursor-pointer"
                    >
                      {SUPPORTED_LANGUAGES.map((lang) => (
                        <option key={lang.code} value={lang.code} className="bg-slate-900 text-white">
                          {lang.flag} {lang.name} ({lang.nativeName})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Center Audio Spectrum / Speaker simulation */}
                <div className="relative z-10 flex items-center justify-center space-x-1.5 my-auto">
                  {[40, 75, 55, 90, 60, 85, 45, 95, 65, 50, 70, 30].map((height, i) => (
                    <div
                      key={i}
                      className="w-1.5 bg-gradient-to-t from-indigo-500 to-cyan-400 rounded-full transition-all duration-300"
                      style={{
                        height: isPlaying ? `${height}%` : '20%',
                        opacity: isPlaying ? 0.8 : 0.3
                      }}
                    />
                  ))}
                </div>

                {/* Interactive Subtitle Capsule Overlay */}
                <div className="relative z-10 glass-panel rounded-2xl p-4 sm:p-5 border-2 border-indigo-500/30 shadow-2xl backdrop-blur-xl">
                  
                  {/* Original Sentence with Clickable Words */}
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-2">
                    {currentCue.words.map((w, index) => {
                      const isSelected = activeWord?.cleanWord === w.cleanWord;
                      return (
                        <button
                          key={index}
                          onClick={() => {
                            setActiveWord(w);
                            handlePronounce(w.cleanWord);
                          }}
                          className={`text-sm sm:text-lg font-bold px-2 py-0.5 rounded-lg transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-gradient-to-r from-indigo-500 to-cyan-500 text-white shadow-lg shadow-indigo-500/40 scale-105 ring-2 ring-white/50'
                              : 'text-slate-100 hover:bg-white/10 hover:text-cyan-300'
                          }`}
                        >
                          {w.word}
                        </button>
                      );
                    })}
                  </div>

                  {/* Translated Sentence */}
                  <div className="text-xs sm:text-sm font-semibold text-cyan-300/90 pt-2 border-t border-white/10 flex items-center justify-between">
                    <span>{currentCue.translations[selectedLang] || currentCue.translations['tr']}</span>
                    <span className="text-[10px] text-slate-400 font-mono uppercase">
                      {selectedLang}
                    </span>
                  </div>

                </div>

              </div>

              {/* Player Timeline & Controls Bar */}
              <div className="p-4 bg-slate-950/90 border-t border-white/10 flex items-center space-x-4">
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-white" />}
                </button>

                {/* Progress Bar */}
                <div className="flex-1 space-y-1">
                  <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400 transition-all duration-200"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] font-mono text-slate-400">
                    <span>00:0{currentCueIndex * 4 + Math.floor((progress / 100) * 4)}s</span>
                    <span>00:08s (Sentence 0{currentCueIndex + 1}/02)</span>
                  </div>
                </div>

                <div className="flex items-center space-x-2 text-slate-400 text-xs">
                  <span className="hidden sm:inline text-[11px]">Click any word above</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                </div>
              </div>

            </div>

          </div>

          {/* Right Column: Live Dictionary Definition Card (WordDrawer) */}
          <div className="lg:col-span-5 space-y-4">
            {activeWord ? (
              <div className="glass-panel rounded-3xl p-6 sm:p-7 border border-indigo-500/30 shadow-2xl relative overflow-hidden bg-[#0c101c]">
                
                {/* Card Accent Top Banner */}
                <div className="flex items-center justify-between pb-4 border-b border-white/10">
                  <div className="flex items-center space-x-2 text-indigo-400 text-xs font-bold uppercase tracking-wider">
                    <BookOpen className="w-4 h-4" />
                    <span>Instant Word Drawer</span>
                  </div>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 font-mono border border-indigo-500/20">
                    {activeWord.pos}
                  </span>
                </div>

                {/* Main Word Header */}
                <div className="mt-5 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-3xl font-black text-white tracking-tight">
                      {activeWord.cleanWord}
                    </h3>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handlePronounce(activeWord.cleanWord)}
                        className="p-2.5 rounded-xl bg-indigo-600/30 hover:bg-indigo-600 text-indigo-300 hover:text-white transition-all shadow-md"
                        title="Pronounce Word (Audio)"
                      >
                        <Volume2 className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => handleCopyWord(activeWord.cleanWord)}
                        className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 transition-all border border-white/10"
                        title="Copy Word"
                      >
                        {copied ? <Check className="w-5 h-5 text-emerald-400" /> : <Copy className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>

                  <p className="text-sm font-mono text-cyan-400">
                    {activeWord.phonetic}
                  </p>
                </div>

                {/* Target Translation Highlight */}
                <div className="mt-5 p-4 rounded-2xl bg-gradient-to-r from-indigo-500/10 to-cyan-500/10 border border-indigo-500/20 space-y-1">
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Meaning in selected language ({selectedLang.toUpperCase()})
                  </div>
                  <div className="text-lg font-bold text-white">
                    {activeWord.translations[selectedLang] || activeWord.translations['tr']}
                  </div>
                </div>

                {/* Grammatical English Definition */}
                <div className="mt-5 space-y-2">
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    English Context Definition
                  </div>
                  <p className="text-sm text-slate-200 leading-relaxed bg-white/[0.02] p-3 rounded-xl border border-white/5">
                    {activeWord.definition}
                  </p>
                </div>

                {/* Feature Note */}
                <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between text-xs text-slate-400">
                  <span>⚡ Web Speech API Native Synthesis</span>
                  <span className="text-emerald-400 font-semibold">Real-time Lookup</span>
                </div>

              </div>
            ) : (
              <div className="glass-panel rounded-3xl p-12 text-center text-slate-400 border border-white/10">
                Click any word in the subtitle player to see instant definition.
              </div>
            )}
          </div>

        </div>

      </div>
    </section>
  );
};
