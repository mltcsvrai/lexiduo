import React, { useRef, useEffect } from 'react';
import { WordToken } from './WordToken';
import { useAppStore } from '../store/useAppStore';
import { Sparkles, RefreshCw } from 'lucide-react';
import { useTranslation } from '../i18n/TranslationContext';

interface InteractiveTranscriptPanelProps {
  onSeek?: (time: number) => void;
  onRetry?: () => void;
}

export const InteractiveTranscriptPanel: React.FC<InteractiveTranscriptPanelProps> = ({ onSeek, onRetry }) => {
  const { t } = useTranslation();
  const cues = useAppStore(s => s.cues);
  const loadingSubtitles = useAppStore(s => s.loadingSubtitles);
  const currentTime = useAppStore(s => s.currentTime);
  const syncOffset = useAppStore(s => s.syncOffset);
  const mode = useAppStore(s => s.subtitleMode);
  const apiKey = useAppStore(s => s.apiKey);
  const setIsSettingsOpen = useAppStore(s => s.setIsSettingsOpen);
  const activeCueRef = useRef<HTMLDivElement>(null);

  const adjustedTime = currentTime + syncOffset;

  // Find latest active cue index (Prioritizes newest active sentence on overlaps)
  const activeIndex = cues.findLastIndex(c => adjustedTime >= c.start && adjustedTime <= c.end + 0.25);

  // Auto scroll to active cue in list mode
  useEffect(() => {
    if (activeCueRef.current) {
      activeCueRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [activeIndex]);

  const showSource = mode === 'SOURCE' || mode === 'DUAL';
  const showTarget = mode === 'TARGET' || mode === 'DUAL';

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const renderTokens = (text: string, isTargetWord: boolean, cueId: string = 'featured') => {
    const tokens = text.split(/(\s+)/);
    const prefix = isTargetWord ? 'panel-tgt' : 'panel-src';
    return tokens.map((token, idx) => {
      if (token.trim().length === 0) {
        return <span key={idx}>{token}</span>;
      }
      return (
        <WordToken
          key={idx}
          token={token}
          isTargetWord={isTargetWord}
          tokenId={`${cueId}-${prefix}-${idx}`}
        />
      );
    });
  };

  if (loadingSubtitles && cues.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[220px] text-center p-6 bg-slate-900/60 border border-white/5 rounded-3xl backdrop-blur-xl space-y-4 my-auto">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-red-500/20 to-indigo-500/20 border border-white/10 flex items-center justify-center shadow-lg">
          <RefreshCw className="w-6 h-6 text-red-500 animate-spin" />
        </div>
        <div className="space-y-1.5 max-w-sm">
          <h3 className="text-sm font-bold text-white tracking-tight">
            {t('loading')}
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            {t('searchingOfficialSubtitles')}
          </p>
        </div>
      </div>
    );
  }

  if (cues.length === 0) {
    const hasKey = Boolean(apiKey && apiKey.trim());
    return (
      <div className="flex flex-col items-center justify-center min-h-[220px] text-center p-6 bg-slate-900/60 border border-white/5 rounded-3xl backdrop-blur-xl space-y-4 my-auto">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-red-500/20 to-indigo-500/20 border border-white/10 flex items-center justify-center shadow-lg">
          <Sparkles className="w-6 h-6 text-yellow-400 animate-pulse" />
        </div>
        <div className="space-y-1.5 max-w-sm">
          <h3 className="text-sm font-bold text-white tracking-tight">
            {t('noSubtitlesAiPrompt')}
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            {hasKey ? t('noSubtitlesWithKeyHint') : t('noSubtitlesAiHint')}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => {
              if (onRetry) onRetry();
              window.dispatchEvent(new CustomEvent('yt-ceviri-retry-subtitles'));
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold border border-white/10 shadow-lg transition-all active:scale-95 cursor-pointer"
          >
            <RefreshCw size={14} className="text-red-400" />
            <span>{t('retrySubtitlesBtn')}</span>
          </button>
          {!hasKey && (
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-red-600 to-indigo-600 hover:from-red-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold shadow-[0_4px_20px_rgba(239,68,68,0.25)] transition-all active:scale-95 cursor-pointer border border-white/10"
            >
              <Sparkles size={14} className="text-yellow-300" />
              <span>{t('activateAiBtn')}</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  const currentCue = activeIndex !== -1 ? cues[activeIndex] : null;

  return (
    <div className="flex flex-col h-full space-y-3">
      {/* Featured Current Sentence Highlight (Instant Readability on Mobile/Tablet) */}
      {currentCue && (
        <div className="bg-slate-900/90 border border-red-500/30 rounded-2xl p-4 shadow-xl backdrop-blur-xl relative overflow-hidden shrink-0">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-red-500 via-yellow-400 to-indigo-500" />
          
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 mb-2">
            <div className="flex items-center space-x-1.5 text-red-400 font-medium text-xs">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="font-mono">{formatTime(currentCue.start)}</span>
            </div>
          </div>

          <div className="space-y-2">
            {showSource && currentCue.sourceText && (
              <div className="text-base sm:text-lg font-bold text-white leading-relaxed">
                {renderTokens(currentCue.sourceText, false, currentCue.id)}
              </div>
            )}
            {showTarget && currentCue.targetText && (
              <div className="text-sm sm:text-base font-semibold text-yellow-300/95 leading-relaxed border-t border-white/5 pt-2">
                {renderTokens(currentCue.targetText, true, currentCue.id)}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Transcript Scroll Area */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar max-h-[45vh] sm:max-h-full">
        {cues.map((cue, idx) => {
          const isActive = idx === activeIndex;
          return (
            <div
              key={idx}
              ref={isActive ? activeCueRef : null}
              onClick={() => onSeek?.(cue.start)}
              className={`p-3 rounded-xl transition-all cursor-pointer border text-left ${
                isActive
                  ? 'bg-red-950/40 border-red-500/50 shadow-md ring-1 ring-red-500/30'
                  : 'bg-slate-900/40 hover:bg-slate-800/60 border-white/5'
              }`}
            >
              <div className="flex items-center space-x-2 text-[10px] text-slate-400 mb-1">
                <span className={`font-mono px-1.5 py-0.5 rounded ${isActive ? 'bg-red-500/20 text-red-300 font-bold' : 'bg-white/5 text-slate-400'}`}>
                  {formatTime(cue.start)}
                </span>
              </div>

              {showSource && (
                <div dir="auto" className={`text-xs sm:text-sm font-medium leading-snug ${isActive ? 'text-white font-semibold' : 'text-slate-300'}`}>
                  {cue.sourceText}
                </div>
              )}
              {showTarget && (
                <div dir="auto" className={`text-[11px] sm:text-xs leading-snug mt-1 ${isActive ? 'text-yellow-300 font-medium' : 'text-slate-400'}`}>
                  {cue.targetText}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
