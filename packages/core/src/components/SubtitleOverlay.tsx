import React, { useRef, useMemo, useState, useCallback } from 'react';
import { GripHorizontal } from 'lucide-react';
import { WordToken } from './WordToken';
import { useAppStore } from '../store/useAppStore';
import { useTranslation } from '../i18n/TranslationContext';
import { getLanguageDisplayName } from '../i18n/languages';
import {
  hexToRgba,
  getTextShadowCss,
  getFontFamilyClass,
  getFontWeightClass,
} from '../utils/subtitleStyleHelpers';
import { syncStyleToNativeOverlay } from '../utils/colorPalettes';
import type { SubtitleCue } from '../types';

export const SubtitleOverlay: React.FC = React.memo(() => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Core Subtitle Store States
  const cues = useAppStore(s => s.cues);
  const currentTime = useAppStore(s => s.currentTime);
  const syncOffset = useAppStore(s => s.syncOffset);
  const mode = useAppStore(s => s.subtitleMode);
  const fontSize = useAppStore(s => s.fontSize);
  const setFontSize = useAppStore(s => s.setFontSize);
  const showSubtitleBg = useAppStore(s => s.showSubtitleBg);
  const isTranslatingTarget = useAppStore(s => s.isTranslatingTarget);
  const targetLang = useAppStore(s => s.targetLang);

  // Subtitle Custom Appearance & Position States
  const bgWidthMode = useAppStore(s => s.bgWidthMode);
  const sourceTextColor = useAppStore(s => s.sourceTextColor);
  const targetTextColor = useAppStore(s => s.targetTextColor);
  const fontFamily = useAppStore(s => s.fontFamily);
  const fontWeight = useAppStore(s => s.fontWeight);
  const bgColor = useAppStore(s => s.bgColor);
  const bgOpacity = useAppStore(s => s.bgOpacity);
  const textOutline = useAppStore(s => s.textOutline);
  const isDraggable = useAppStore(s => s.isDraggable);
  const subtitlePosition = useAppStore(s => s.subtitlePosition);
  const setSubtitlePosition = useAppStore(s => s.setSubtitlePosition);
  const autoPauseAfterSubtitle = useAppStore(s => s.autoPauseAfterSubtitle);
  const karaokeHighlight = useAppStore(s => s.karaokeHighlight);
  const setExternalPause = useAppStore(s => s.setExternalPause);

  // Translation Context
  const { t, language } = useTranslation();
  const targetLangDisplayName = useMemo(() => {
    return getLanguageDisplayName(targetLang, language);
  }, [targetLang, language]);

  // Drag Interaction State
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ startX: number; startY: number; initX: number; initY: number } | null>(null);

  const handleDragPointerDown = useCallback((e: React.PointerEvent) => {
    if (!isDraggable) return;
    e.stopPropagation();
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initX: subtitlePosition.x,
      initY: subtitlePosition.y,
    };
    setIsDragging(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
  }, [isDraggable, subtitlePosition]);

  const handleDragPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragStartRef.current) return;
    e.stopPropagation();
    const dx = e.clientX - dragStartRef.current.startX;
    const dy = e.clientY - dragStartRef.current.startY;
    setSubtitlePosition({
      x: Math.round(dragStartRef.current.initX + dx),
      y: Math.round(dragStartRef.current.initY + dy),
    });
  }, [setSubtitlePosition]);

  const handleDragPointerUp = useCallback((e: React.PointerEvent) => {
    if (dragStartRef.current) {
      e.stopPropagation();
      dragStartRef.current = null;
      setIsDragging(false);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
    }
  }, []);

  // Multi-touch Pinch-to-Zoom Gesture for Subtitle Font Size
  const touchDistRef = useRef<number>(0);
  const initialFontSizeRef = useRef<number>(fontSize);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      touchDistRef.current = dist;
      initialFontSizeRef.current = fontSize;
    }
  }, [fontSize]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && touchDistRef.current > 0) {
      if (e.cancelable) {
        e.preventDefault();
      }
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const ratio = dist / touchDistRef.current;
      const nextSize = Math.round(Math.min(36, Math.max(12, initialFontSizeRef.current * ratio)));
      setFontSize(nextSize);
      syncStyleToNativeOverlay({
        sourceTextColor,
        targetTextColor,
        bgColor,
        bgOpacity,
        fontSize: nextSize,
      });
    }
  }, [sourceTextColor, targetTextColor, bgColor, bgOpacity, setFontSize]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (e.touches.length < 2) {
      touchDistRef.current = 0;
    }
  }, []);

  // Optimized cue search with micro-gap bridging and latest-cue priority
  const lastIndexRef = useRef(0);
  const currentCue = useMemo(() => {
    if (cues.length === 0) return null;
    const adjustedTime = currentTime + syncOffset;

    // 1. Prioritize latest active cue (Search backwards to pick newest sentence immediately on overlaps)
    for (let i = cues.length - 1; i >= 0; i--) {
      const cue = cues[i];
      if (adjustedTime >= cue.start && adjustedTime <= cue.end) {
        lastIndexRef.current = i;
        return cue;
      }
    }

    // 2. Micro-gap bridging (250ms persistence after cue end, or 100ms early start)
    // Prevents subtitles from blinking out during 100-300ms natural pauses between speech
    for (let i = cues.length - 1; i >= 0; i--) {
      const cue = cues[i];
      const nextCue = cues[i + 1];
      const gapEnd = nextCue ? Math.min(cue.end + 0.25, nextCue.start) : cue.end + 0.25;

      if (adjustedTime >= cue.start - 0.1 && adjustedTime <= gapEnd) {
        lastIndexRef.current = i;
        return cue;
      }
    }

    return null;
  }, [cues, currentTime, syncOffset]);

  // Auto-pause playback after active subtitle cue completes with boundary & transition tracking
  const prevCueRef = useRef<SubtitleCue | null>(null);
  const lastAutoPausedCueIdRef = useRef<string | null>(null);

  React.useEffect(() => {
    if (!autoPauseAfterSubtitle || !currentCue) {
      prevCueRef.current = currentCue;
      return;
    }

    const adjustedTime = currentTime + syncOffset;

    // Reset paused state if playback moves to start of cue
    if (adjustedTime < currentCue.start + 0.2) {
      lastAutoPausedCueIdRef.current = null;
    }

    // Cue transition detected (previous cue finished and we moved to a new cue)
    if (prevCueRef.current && prevCueRef.current.id !== currentCue.id) {
      if (lastAutoPausedCueIdRef.current !== prevCueRef.current.id) {
        lastAutoPausedCueIdRef.current = prevCueRef.current.id;
        setExternalPause(true);
        setTimeout(() => setExternalPause(false), 300);
      }
    }
    prevCueRef.current = currentCue;

    // Cue end boundary approaching (within 100ms of cue end)
    if (adjustedTime >= currentCue.end - 0.1 && lastAutoPausedCueIdRef.current !== currentCue.id) {
      lastAutoPausedCueIdRef.current = currentCue.id;
      setExternalPause(true);
      setTimeout(() => setExternalPause(false), 300);
    }
  }, [autoPauseAfterSubtitle, currentCue, currentTime, syncOffset, setExternalPause]);

  if (!currentCue) {
    return null;
  }

  // Idiom (Multi-word) selection handling
  const handlePointerUp = () => {
    const selection = window.getSelection();
    if (selection) {
      const text = selection.toString().trim();
      if (text.includes(' ')) {
        const event = new CustomEvent('yt-ceviri-idiom-lookup', { detail: text });
        window.dispatchEvent(event);
      }
    }
  };

  const renderInteractiveText = (text: string, isTargetWord: boolean) => {
    const tokens = text.split(/(\s+)/);
    const prefix = isTargetWord ? 'tgt' : 'src';

    // Realtime Karaoke speech flow progress computation (character length weighted, whitespace/punctuation filtered)
    let activeWordIndex = -1;
    if (karaokeHighlight && currentCue && currentCue.end > currentCue.start) {
      // Filter out pure punctuation and whitespace from actual words
      const actualWords = tokens.filter(t => {
        const clean = t.replace(/[.,!?()[\]{}"':;—\-–…/\\«»""'']/g, '').trim();
        return clean.length > 0;
      });

      if (actualWords.length > 0) {
        const adjustedTime = currentTime + syncOffset;
        const elapsed = Math.max(0, adjustedTime - currentCue.start);
        const duration = currentCue.end - currentCue.start;
        const progress = Math.min(Math.max(elapsed / duration, 0), 1);

        // Weight words by their letter count
        const weights = actualWords.map(w => {
          const letters = w.replace(/[.,!?()[\]{}"':;—\-–…/\\«»""'']/g, '').trim();
          return Math.max(1, letters.length);
        });
        const totalWeight = weights.reduce((acc, curr) => acc + curr, 0);
        const targetWeight = progress * totalWeight;

        let accWeight = 0;
        if (adjustedTime >= currentCue.end) {
          activeWordIndex = actualWords.length;
        } else {
          for (let i = 0; i < weights.length; i++) {
            accWeight += weights[i];
            if (targetWeight <= accWeight || i === weights.length - 1) {
              activeWordIndex = i;
              break;
            }
          }
        }
      }
    }

    let currentWordCounter = 0;
    return tokens.map((token, idx) => {
      const cleanToken = token.replace(/[.,!?()[\]{}"':;—\-–…/\\«»""'']/g, '').trim();
      const isWord = cleanToken.length > 0;

      if (!isWord) {
        return <span key={idx}>{token}</span>;
      }

      const isWordActive = karaokeHighlight && currentWordCounter === activeWordIndex;
      const isWordPast = karaokeHighlight && currentWordCounter < activeWordIndex;
      currentWordCounter++;

      const tokenId = `${currentCue.id}-${prefix}-${idx}`;
      return (
        <WordToken
          key={idx}
          token={token}
          isTargetWord={isTargetWord}
          tokenId={tokenId}
          isKaraokeActive={isWordActive}
          isKaraokePast={isWordPast}
          karaokeEnabled={karaokeHighlight}
        />
      );
    });
  };

  const showSource = mode === 'SOURCE' || mode === 'DUAL';
  const showTarget = mode === 'TARGET' || mode === 'DUAL';

  // Compute typography and styling helpers
  const fontFamilyClass = getFontFamilyClass(fontFamily);
  const fontWeightClass = getFontWeightClass(fontWeight);
  const textShadowCss = getTextShadowCss(textOutline);

  const widthClasses = bgWidthMode === 'dynamic'
    ? 'w-fit inline-block max-w-[96%]'
    : 'w-full max-w-[96%] sm:max-w-4xl';

  const transformStyle = isDraggable
    ? `translate3d(${subtitlePosition.x}px, ${subtitlePosition.y}px, 0)`
    : 'none';

  return (
    <div
      ref={containerRef}
      onPointerUp={handlePointerUp}
      className="w-full flex flex-col items-center justify-center transition-all duration-300 pointer-events-none"
    >
      <div
        data-subtitle-interactive="true"
        data-subtitle-card="true"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        className={`${widthClasses} flex flex-col items-center justify-center space-y-1 sm:space-y-1.5 pointer-events-auto mx-auto text-center px-2.5 py-1.5 sm:px-5 sm:py-2.5 rounded-xl sm:rounded-2xl select-none touch-none ${
          showSubtitleBg
            ? 'backdrop-blur-md shadow-2xl border border-white/5'
            : 'drop-shadow-[0_2px_6px_rgba(0,0,0,0.95)]'
        }`}
        style={{
          transform: transformStyle,
          backgroundColor: showSubtitleBg ? hexToRgba(bgColor, bgOpacity) : undefined,
          transition: isDragging ? 'none' : 'transform 0.15s ease-out, background-color 0.2s ease',
        }}
      >
        {/* Subtle Grip Drag Handle when Draggable is enabled */}
        {isDraggable && (
          <div
            data-subtitle-interactive="true"
            data-subtitle-drag-handle="true"
            onPointerDown={handleDragPointerDown}
            onPointerMove={handleDragPointerMove}
            onPointerUp={handleDragPointerUp}
            onPointerCancel={handleDragPointerUp}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
            className="w-full flex items-center justify-center cursor-grab active:cursor-grabbing py-0.5 -mt-1 mb-1 text-white/50 hover:text-white select-none touch-none transition-colors group"
            title={t('dragToMove')}
          >
            <div className="flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-white/10 group-hover:bg-white/20 transition-colors pointer-events-auto shadow-sm">
              <GripHorizontal className="w-3.5 h-3.5 text-white/80" />
              <span className="text-[10px] uppercase font-bold tracking-wider text-white/70">{t('dragToMove')}</span>
            </div>
          </div>
        )}

        {showSource && currentCue.sourceText && (
          <div
            dir="auto"
            className={`${fontFamilyClass} ${fontWeightClass} tracking-wide leading-tight selection:bg-red-500 selection:text-white cursor-text`}
            style={{
              fontSize: `${fontSize}px`,
              color: sourceTextColor,
              textShadow: textShadowCss,
            }}
          >
            {renderInteractiveText(currentCue.sourceText, false)}
          </div>
        )}

        {showTarget && currentCue.targetText ? (
          <div
            dir="auto"
            className={`${fontFamilyClass} ${fontWeightClass} tracking-wide leading-tight cursor-text`}
            style={{
              fontSize: `${Math.max(12, fontSize - (showSource ? 3 : 0))}px`,
              color: targetTextColor,
              textShadow: textShadowCss,
            }}
          >
            {renderInteractiveText(currentCue.targetText, true)}
          </div>
        ) : showTarget && isTranslatingTarget ? (
          <div className="flex items-center justify-center gap-2 py-1 px-3.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs sm:text-sm font-semibold animate-pulse shadow-sm">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            <span>🔄 {t('preparingTargetTranslation', { lang: targetLangDisplayName })}</span>
          </div>
        ) : showTarget && !targetLang ? (
          <div className="flex items-center justify-center gap-2 py-1 px-3.5 rounded-full bg-slate-900/80 border border-white/10 text-slate-300 text-[11px] sm:text-xs font-medium">
            <span>ℹ️ {t('pleaseSelectTargetLang')}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
});
