import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Volume2, X, Sparkles, Copy, Check } from 'lucide-react';
import { useTranslation } from '../i18n/TranslationContext';
import { Clipboard } from '@capacitor/clipboard';
import { useAppStore } from '../store/useAppStore';
import { getLanguageBcp47 } from '../i18n/languages';

export const WordDrawer: React.FC = () => {
  const { t } = useTranslation();
  const sourceLang = useAppStore(s => s.sourceLang);
  const targetLang = useAppStore(s => s.targetLang);
  const detectedSourceLang = useAppStore(s => s.detectedSourceLang);
  const activeWordTranslation = useAppStore(s => s.activeWordTranslation);
  const wordLoading = useAppStore(s => s.wordLoading);
  const activeTokenId = useAppStore(s => s.activeTokenId);
  const setActiveTokenId = useAppStore(s => s.setActiveTokenId);
  const setActiveWordTranslation = useAppStore(s => s.setActiveWordTranslation);

  const [copied, setCopied] = React.useState(false);
  const [mountNode, setMountNode] = useState<Element | null>(null);

  // Dynamic portal target: Attaches to document.fullscreenElement when video is fullscreen (Top Layer),
  // or document.body when in standard viewport.
  useEffect(() => {
    const updateMountNode = () => {
      setMountNode(document.fullscreenElement || document.body);
    };

    updateMountNode();
    document.addEventListener('fullscreenchange', updateMountNode);
    document.addEventListener('webkitfullscreenchange', updateMountNode);
    return () => {
      document.removeEventListener('fullscreenchange', updateMountNode);
      document.removeEventListener('webkitfullscreenchange', updateMountNode);
    };
  }, []);

  const isOpen = Boolean(activeTokenId || wordLoading || activeWordTranslation);

  if (!isOpen) return null;

  const targetNode = mountNode || (typeof document !== 'undefined' ? (document.fullscreenElement || document.body) : null);
  if (!targetNode) return null;

  const handleClose = () => {
    setActiveTokenId(null);
    setActiveWordTranslation(null);
  };

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
    if (activeWordTranslation) {
      await Clipboard.write({
        string: `${activeWordTranslation.word} - ${activeWordTranslation.translation}`
      });
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const drawerContent = (
    <div className="fixed inset-x-0 bottom-0 z-[90] pointer-events-auto transition-transform duration-300 ease-out">
      {/* Backdrop for easy tap-to-dismiss on mobile */}
      <div 
        className="fixed inset-0 bg-black/40 backdrop-blur-[2px] -z-10 animate-fade-in"
        onClick={handleClose} 
      />

      <div className="w-full max-w-xl mx-auto bg-slate-900/95 backdrop-blur-2xl border-t border-x sm:border border-white/15 rounded-t-[2rem] sm:rounded-3xl p-5 landscape:p-4 pb-safe landscape:pb-4 shadow-[0_-15px_50px_rgba(0,0,0,0.9)] animate-in slide-in-from-bottom duration-300 relative max-h-[85vh] overflow-y-auto">
        {/* Drag handle pill */}
        <div className="w-12 h-1.5 bg-white/20 rounded-full mx-auto mb-3 shrink-0" />

        {/* Close Button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-full hover:bg-white/10 active:scale-95 transition-all"
        >
          <X className="w-5 h-5" />
        </button>

        {wordLoading ? (
          <div className="flex items-center justify-center space-x-3 py-6">
            <div className="w-5 h-5 border-2 border-red-500 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-sm text-slate-300 font-medium">{t('translating')}</span>
          </div>
        ) : activeWordTranslation ? (
          <div className="space-y-3 pr-6">
            {/* Word Header */}
            <div className="flex items-center space-x-3">
              <span className="text-xl sm:text-2xl font-bold text-white tracking-wide">
                {activeWordTranslation.word}
              </span>
              <button 
                onClick={() => playAudio(activeWordTranslation.word, activeWordTranslation.isTargetWord)}
                className="p-2 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 active:scale-90 rounded-full transition-all flex items-center justify-center shrink-0"
                title={t('listenAudio')}
              >
                <Volume2 className="w-4 h-4 sm:w-5 sm:h-5 text-red-400" />
              </button>
              <button 
                onClick={handleCopy}
                className="p-2 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 active:scale-90 rounded-full transition-all flex items-center justify-center shrink-0"
                title={copied ? t('copied') : t('copy')}
              >
                {copied ? <Check className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" /> : <Copy className="w-4 h-4 sm:w-5 sm:h-5" />}
              </button>
            </div>

            {/* Phonetic & Part of Speech */}
            <div className="flex items-center space-x-2 text-xs">
              {activeWordTranslation.phonetic && (
                <span className="text-slate-400 font-mono bg-white/5 px-2.5 py-1 rounded-md border border-white/5">
                  {activeWordTranslation.phonetic}
                </span>
              )}
              {activeWordTranslation.partOfSpeech && (
                <span className="text-red-400 font-semibold capitalize bg-red-950/50 border border-red-500/30 px-2.5 py-1 rounded-md">
                  {activeWordTranslation.partOfSpeech}
                </span>
              )}
            </div>

            {/* Translation Output Card */}
            <div className="flex items-center space-x-3 bg-red-950/30 border border-red-500/20 p-3 sm:p-4 rounded-2xl">
              <Sparkles className="w-5 h-5 text-red-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-base sm:text-lg font-bold text-red-100 leading-snug">
                  {activeWordTranslation.translation}
                </span>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );

  return createPortal(drawerContent, targetNode);
};

