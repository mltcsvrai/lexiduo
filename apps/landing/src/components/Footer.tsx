import React from 'react';
import { Download, Shield, Sparkles } from 'lucide-react';

const GithubIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
  </svg>
);

export const Footer: React.FC = () => {
  return (
    <footer className="glass-panel border-t border-white/10 pt-16 pb-12 mt-20 relative bg-[#04060a]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 pb-12 border-b border-white/10">
          
          {/* Col 1: Brand */}
          <div className="md:col-span-2 space-y-4">
            <div className="flex items-center space-x-3">
              <img
                src="./favicon.png"
                alt="Lexiduo Logo"
                className="w-8 h-8 rounded-xl object-contain drop-shadow-[0_0_8px_rgba(99,102,241,0.5)]"
              />
              <span className="text-2xl font-black text-white tracking-tight">
                Lexiduo
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-mono">
                com.lexiduo.app
              </span>
            </div>
            <p className="text-slate-400 text-sm max-w-sm leading-relaxed">
              Context-aware, AI-powered dual subtitle translator and language learning ecosystem for Android and Web.
            </p>
            <div className="text-xs text-slate-500 font-mono">
              Licensed under GNU General Public License v3.0 (GPLv3)
            </div>
          </div>

          {/* Col 2: Navigation */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-white">
              Ecosystem
            </h4>
            <ul className="space-y-2 text-sm text-slate-400">
              <li>
                <a href="#features" className="hover:text-white transition-colors">
                  Floating Overlay
                </a>
              </li>
              <li>
                <a href="#install" className="hover:text-white transition-colors">
                  Android APK Install
                </a>
              </li>
              <li>
                <a href="#faq" className="hover:text-white transition-colors">
                  FAQ & Privacy
                </a>
              </li>
            </ul>
          </div>

          {/* Col 3: Open Source & Community */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-white">
              Open Source
            </h4>
            <ul className="space-y-2 text-sm text-slate-400">
              <li>
                <a
                  href="https://github.com/mltcsvrai/lexiduo"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white transition-colors flex items-center gap-1.5"
                >
                  <GithubIcon className="w-4 h-4" />
                  GitHub Repository
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/mltcsvrai/lexiduo/releases/latest"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white transition-colors flex items-center gap-1.5"
                >
                  <Download className="w-4 h-4" />
                  Releases & Downloads
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/mltcsvrai/lexiduo/issues"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white transition-colors"
                >
                  Issue Tracker & Bugs
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/mltcsvrai/lexiduo/blob/master/LICENSE"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white transition-colors"
                >
                  GNU GPL v3.0 License
                </a>
              </li>
            </ul>
          </div>

        </div>

        {/* Bottom Credits */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-4">
          <div className="flex items-center space-x-1">
            <span>&copy; {new Date().getFullYear()} Lexiduo Contributors. Free software, free as in freedom.</span>
          </div>
          <div className="flex items-center space-x-4">
            <span className="flex items-center space-x-1 text-slate-400">
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
              <span>Zero telemetry</span>
            </span>
            <span className="flex items-center space-x-1 text-slate-400">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              <span>Google Gemini AI</span>
            </span>
          </div>
        </div>

      </div>
    </footer>
  );
};
