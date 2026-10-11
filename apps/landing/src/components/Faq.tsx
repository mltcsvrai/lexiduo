import React, { useState } from 'react';
import { ChevronDown, HelpCircle } from 'lucide-react';

export const Faq: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const faqs = [
    {
      q: 'Is Lexiduo completely free and open source?',
      a: 'Yes, Lexiduo is 100% free and licensed under the GNU General Public License v3.0 (GPLv3). There are no in-app purchases, forced subscriptions, ads, or paywalled features.'
    },
    {
      q: 'Does the floating overlay require root access or custom ROMs?',
      a: 'No root access is needed. Lexiduo uses official, standard Android APIs (System Alert Window for drawing over apps, and Accessibility Service for YouTube playback/ad detection). It runs on any standard Android 7.0+ device.'
    },
    {
      q: 'Do I need my own Google Gemini API key to use translation?',
      a: 'Lexiduo works out-of-the-box with built-in translation proxies. However, if you prefer using your own free Google Gemini API key for higher rate limits and extended contextual intelligence, you can paste it into the app settings at any time.'
    },
    {
      q: 'Are my local video files ever uploaded to an external server?',
      a: 'Never. When you play local videos with offline transcription, audio extraction and Whisper AI speech recognition run 100% locally on your device using Web Audio 16kHz PCM extraction and an on-demand WASM/ONNX model (~39 MB). Your media never leaves your phone.'
    },
    {
      q: 'Which languages are supported?',
      a: 'Lexiduo supports over 35 global languages: English, Turkish, Spanish, German, French, Italian, Portuguese, Russian, Chinese, Japanese, Korean, Arabic, Hindi, Dutch, Polish, Ukrainian, Swedish, Norwegian, Danish, Finnish, Greek, Czech, Romanian, Hungarian, Indonesian, Vietnamese, Thai, Hebrew, Persian, Azerbaijani, Bulgarian, Serbian, Slovak, Croatian, and Bengali. Full Right-to-Left (RTL) layout is included for Arabic, Hebrew, and Persian.'
    }
  ];

  return (
    <section id="faq" className="py-20 sm:py-28 relative">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="text-center space-y-4 mb-16">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 text-xs font-semibold uppercase tracking-wider">
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Got Questions?</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
            Frequently Asked Questions
          </h2>
          <p className="text-slate-400 text-base sm:text-lg">
            Everything you need to know about Lexiduo, Android permissions, and privacy.
          </p>
        </div>

        {/* Accordion List */}
        <div className="space-y-4">
          {faqs.map((faq, index) => {
            const isOpen = openIndex === index;
            return (
              <div
                key={index}
                className="glass-panel rounded-2xl border border-white/10 overflow-hidden transition-colors"
              >
                <button
                  onClick={() => setOpenIndex(isOpen ? null : index)}
                  className="w-full p-6 text-left flex items-center justify-between space-x-4 cursor-pointer"
                >
                  <span className="font-bold text-white text-base sm:text-lg">
                    {faq.q}
                  </span>
                  <ChevronDown
                    className={`w-5 h-5 text-indigo-400 transition-transform duration-300 shrink-0 ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {isOpen && (
                  <div className="px-6 pb-6 pt-1 text-slate-300 text-sm sm:text-base leading-relaxed border-t border-white/5">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
};
