import React from 'react';
import { Share2, Layers, BookOpen, Sparkles, ArrowRight } from 'lucide-react';

export const HowItWorks: React.FC = () => {
  const steps = [
    {
      step: '01',
      title: 'Share or Play',
      icon: Share2,
      color: 'from-indigo-500 to-indigo-600',
      description:
        'Open any video in the YouTube app and tap "Share" ➔ "Lexiduo", or open your local video files directly from device storage.'
    },
    {
      step: '02',
      title: 'Floating Capsule Syncs',
      icon: Layers,
      color: 'from-cyan-500 to-cyan-600',
      description:
        'The Lexiduo floating subtitle capsule appears over YouTube, locking to frame playback through native MediaSession tracking and auto-pausing for ads.'
    },
    {
      step: '03',
      title: 'Tap, Listen & Learn',
      icon: BookOpen,
      color: 'from-emerald-500 to-emerald-600',
      description:
        'Tap any word in real time to pause playback, hear native pronunciation audio, and expand contextual definitions in your target language.'
    }
  ];

  return (
    <section id="how-it-works" className="py-20 sm:py-28 relative bg-[#06080e]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4 mb-16">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 text-xs font-semibold uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Effortless Workflow</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
            How Lexiduo Works in 3 Simple Steps
          </h2>
          <p className="text-slate-400 text-base sm:text-lg">
            No complicated configuration, root access, or intrusive account setups required.
          </p>
        </div>

        {/* Steps Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          {steps.map((s, index) => {
            const Icon = s.icon;
            return (
              <div
                key={index}
                className="glass-panel glass-panel-hover rounded-3xl p-8 relative flex flex-col justify-between border border-white/10"
              >
                <div className="space-y-6">
                  {/* Step Number & Icon */}
                  <div className="flex items-center justify-between">
                    <span className="text-4xl font-black font-mono text-white/20">
                      {s.step}
                    </span>
                    <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${s.color} flex items-center justify-center text-white shadow-lg`}>
                      <Icon className="w-7 h-7" />
                    </div>
                  </div>

                  <h3 className="text-2xl font-bold text-white">
                    {s.title}
                  </h3>

                  <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
                    {s.description}
                  </p>
                </div>

                <div className="mt-8 pt-4 border-t border-white/5 flex items-center text-xs font-semibold text-slate-400">
                  <span>Step {s.step} of 03</span>
                  <ArrowRight className="w-3.5 h-3.5 ml-auto text-indigo-400" />
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
};
