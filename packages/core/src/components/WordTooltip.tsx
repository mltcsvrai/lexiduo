import React, { forwardRef } from 'react';
import type { WordTranslation } from '../types';
import { Volume2, X, Sparkles, Copy, Check } from 'lucide-react';
import { useTranslation } from '../i18n/useTranslation';
import { Clipboard } from '@capacitor/clipboard';
import { useAppStore } from '../store/useAppStore';
import { getLanguageBcp47 } from '../i18n/languages';

interface WordTooltipProps {
  translation: WordTranslation | null;
  loading: boolean;
  isTurkish?: boolean;
  onClose: () => void;
  style?: React.CSSProperties;
}

export const WordTooltip = forwardRef<HTMLDivElement, WordTooltipProps>(({
  translation,
  loading,
  isTurkish: _isTurkish,
  onClose,
  style
}, ref) => {
  const { t } = useTranslation();
  const sourceLang = useAppStore(s => s.sourceLang);
  const targetLang = useAppStore(s => s.targetLang);
  const detectedSourceLang = useAppStore(s => s.detectedSourceLang);
  const [copied, setCopied] = React.useState(false);

  if (!translation && !loading) return null;

  const playAudio = (text: string, isTargetWord?: boolean) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      const fallbackSource = targetLang === 'tr' ? 'en' : 'tr';
      const effectiveSource = (sourceLang && sourceLang !== 'auto') ? sourceLang : (detectedSourceLang || fallbackSource);
      const activeLang = isTargetWord ? targetLang : effectiveSource;
      utterance.lang = getLanguageBcp47(activeLang);
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleCopy = async () => {
    if (translation) {
      await Clipboard.write({
        string: `${translation.word} - ${translation.translation}`
      });
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      ref={ref}
      style={{ ...style, zIndex: 100 }}
      className="absolute animate-fade-in-up cursor-default"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="relative bg-slate-900/90 backdrop-blur-xl border border-red-500/30 text-white rounded-2xl p-4 shadow-[0_0_40px_rgba(0,0,0,0.8)] min-w-[240px] max-w-[320px]">
        {/* Pointer Arrow removed for floating-ui shift support */}

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-2 right-2 p-1 text-slate-400 hover:text-white rounded-full hover:bg-white/10 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {loading ? (
          <div className="flex items-center justify-center space-x-2 py-3">
            <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-xs text-slate-300 font-medium">{t('translating')}</span>
          </div>
        ) : translation ? (
          <div className="space-y-2">
            {/* Word Header */}
            <div className="flex items-center justify-between pr-5">
              <div className="flex items-center space-x-2">
                <span className="text-lg font-bold text-white tracking-wide">{translation.word}</span>
                <button 
                  onClick={() => playAudio(translation.word, translation.isTargetWord)}
                  className="p-1.5 text-white/70 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition-all flex items-center justify-center shrink-0"
                  title={t('listenAudio')}
                >
                  <Volume2 className="w-4 h-4" />
                </button>
                <button 
                  onClick={handleCopy}
                  className="p-1.5 text-white/70 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition-all flex items-center justify-center shrink-0"
                  title={copied ? t('copied') : t('copy')}
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Phonetic & Part of Speech */}
            <div className="flex items-center space-x-2 text-xs">
              {translation.phonetic && (
                <span className="text-slate-400 font-mono bg-white/5 px-2 py-0.5 rounded-md">
                  {translation.phonetic}
                </span>
              )}
              {translation.partOfSpeech && (
                <span className="text-red-400 font-medium capitalize bg-red-950/40 border border-red-500/20 px-2 py-0.5 rounded-md">
                  {translation.partOfSpeech}
                </span>
              )}
            </div>

            {/* Divider */}
            <div className="h-px bg-gradient-to-r from-red-500/40 via-white/10 to-transparent my-1"></div>

            {/* Translation Output */}
            <div className="flex items-start space-x-2 bg-red-950/20 border border-red-500/10 p-2.5 rounded-xl">
              <Sparkles className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div>
                <span className="text-xs text-slate-400 block font-medium">
                  {translation.isTargetWord ? t('targetWordMeaning') : t('sourceWordMeaning')}
                </span>
                <span className="text-sm font-semibold text-red-200">
                  {translation.translation}
                </span>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
});
