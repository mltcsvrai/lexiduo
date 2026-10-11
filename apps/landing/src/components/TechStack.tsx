import React from 'react';
import { Code2, Smartphone, Cpu, Box, Sparkles } from 'lucide-react';

export const TechStack: React.FC = () => {
  const technologies = [
    {
      category: 'Frontend & UI',
      icon: Code2,
      color: 'text-cyan-400',
      items: ['React 19', 'TypeScript', 'Tailwind CSS 4', 'Lucide Icons', 'Zustand 5']
    },
    {
      category: 'Mobile Engine',
      icon: Smartphone,
      color: 'text-indigo-400',
      items: ['Capacitor 8', 'Android SDK 36', 'Java 21', 'MediaSession', 'Accessibility FGS']
    },
    {
      category: 'Machine Learning & AI',
      icon: Cpu,
      color: 'text-emerald-400',
      items: ['Google Gemini AI', 'Google Gemma', 'Whisper WASM / ONNX', 'Web Audio 16kHz PCM']
    },
    {
      category: 'Architecture & License',
      icon: Box,
      color: 'text-purple-400',
      items: ['npm workspaces', '@lexiduo/core', 'GNU GPL v3.0', '100% Open Source']
    }
  ];

  return (
    <section className="py-20 sm:py-28 relative bg-[#07090e]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4 mb-16">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 text-xs font-semibold uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Open Source Technology</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
            Built with Modern Engineering Standards
          </h2>
          <p className="text-slate-400 text-base sm:text-lg">
            High performance, zero-runtime bloat, and enterprise-grade cross-platform reliability.
          </p>
        </div>

        {/* Tech Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {technologies.map((tech, index) => {
            const Icon = tech.icon;
            return (
              <div
                key={index}
                className="glass-panel glass-panel-hover rounded-3xl p-6 border border-white/10 space-y-4"
              >
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                    <Icon className={`w-5 h-5 ${tech.color}`} />
                  </div>
                  <h3 className="font-bold text-white text-base">
                    {tech.category}
                  </h3>
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                  {tech.items.map((item, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 rounded-lg bg-white/[0.03] border border-white/5 text-xs text-slate-300 font-mono"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
};
