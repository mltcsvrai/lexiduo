import React, { useRef, useMemo } from 'react';
import { WordToken } from './WordToken';
import { useAppStore } from '../store/useAppStore';

export const SubtitleOverlay: React.FC = React.memo(() => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Subscribe to required states from Zustand
  const cues = useAppStore(s => s.cues);
  const currentTime = useAppStore(s => s.currentTime);
  const syncOffset = useAppStore(s => s.syncOffset);
  const mode = useAppStore(s => s.subtitleMode);
  const fontSize = useAppStore(s => s.fontSize);
  const showSubtitleBg = useAppStore(s => s.showSubtitleBg);

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
    return tokens.map((token, idx) => {
      if (token.trim().length === 0) {
        return <span key={idx}>{token}</span>;
      }
      const tokenId = `${prefix}-${idx}`;
      return (
        <WordToken
          key={idx}
          token={token}
          isTargetWord={isTargetWord}
          tokenId={tokenId}
        />
      );
    });
  };

  const showSource = mode === 'SOURCE' || mode === 'DUAL';
  const showTarget = mode === 'TARGET' || mode === 'DUAL';

  return (
    <div
      ref={containerRef}
      onPointerUp={handlePointerUp}
      className="w-full flex flex-col items-center justify-center transition-all duration-300 pointer-events-none"
    >
      <div className={`w-full flex flex-col items-center justify-center space-y-1 sm:space-y-1.5 pointer-events-auto max-w-[96%] sm:max-w-4xl mx-auto text-center px-2.5 py-1.5 sm:px-5 sm:py-2.5 rounded-xl sm:rounded-2xl transition-all duration-300 ${
        showSubtitleBg ? 'bg-black/75 backdrop-blur-md shadow-2xl border border-white/5' : 'drop-shadow-[0_2px_6px_rgba(0,0,0,0.95)]'
      }`}>

        {showSource && currentCue.sourceText && (
          <div
            dir="auto"
            className="font-sans font-bold text-white tracking-wide leading-tight selection:bg-red-500 selection:text-white cursor-text"
            style={{ fontSize: `clamp(13px, 2.8vw, ${fontSize}px)` }}
          >
            {renderInteractiveText(currentCue.sourceText, false)}
          </div>
        )}

        {showTarget && currentCue.targetText && (
          <div
            dir="auto"
            className={`font-sans font-extrabold tracking-wide leading-tight cursor-text ${showSource ? 'text-yellow-400' : 'text-white'}`}
            style={{ fontSize: `clamp(12px, 2.5vw, ${Math.max(14, fontSize - (showSource ? 4 : 0))}px)` }}
          >
            {renderInteractiveText(currentCue.targetText, true)}
          </div>
        )}
      </div>
    </div>
  );
});
