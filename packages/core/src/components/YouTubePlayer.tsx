import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef, useCallback } from 'react';
import { Maximize, Minimize, History, ChevronDown, PauseCircle } from 'lucide-react';
import { useTranslation } from '../i18n/useTranslation';
import { useAppStore } from '../store/useAppStore';


export interface YouTubePlayerHandle {
  toggleFullscreen: () => void;
  seekTo: (seconds: number) => void;
  pauseVideo: () => void;
}

interface YouTubePlayerProps {
  videoId: string;
  initialStartTime?: number;
  onTimeUpdate: (currentTime: number) => void;
  onStateChange: (isPlaying: boolean) => void;
  externalPauseRequest?: boolean;
  playbackRate?: number;
  onFullscreenToggle?: (isFullscreen: boolean) => void;
  onVideoTitle?: (title: string) => void;
  onDismiss?: () => void;
  children?: React.ReactNode;
}

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

export const YouTubePlayer = forwardRef<YouTubePlayerHandle, YouTubePlayerProps>(({
  videoId,
  initialStartTime,
  onTimeUpdate,
  onStateChange,
  externalPauseRequest,
  playbackRate = 1,
  onFullscreenToggle,
  onVideoTitle,
  onDismiss,
  children
}, ref) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const playerWrapperRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const timerRef = useRef<any>(null);
  const idleTimerRef = useRef<any>(null);

  const onTimeUpdateRef = useRef(onTimeUpdate);
  const onStateChangeRef = useRef(onStateChange);
  const onVideoTitleRef = useRef(onVideoTitle);
  const playbackRateRef = useRef(playbackRate);

  useEffect(() => { onTimeUpdateRef.current = onTimeUpdate; }, [onTimeUpdate]);
  useEffect(() => { onStateChangeRef.current = onStateChange; }, [onStateChange]);
  useEffect(() => { onVideoTitleRef.current = onVideoTitle; }, [onVideoTitle]);
  useEffect(() => { playbackRateRef.current = playbackRate; }, [playbackRate]);

  const [isReady, setIsReady] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isControlsVisible, setIsControlsVisible] = useState(true);
  const [resumedToast, setResumedToast] = useState<string | null>(null);

  const autoPauseAfterSubtitle = useAppStore(s => s.autoPauseAfterSubtitle);
  const setAutoPauseAfterSubtitle = useAppStore(s => s.setAutoPauseAfterSubtitle);

  // Gesture handling state for swipe down / pull-to-dismiss
  const touchStartY = useRef<number | null>(null);
  const touchStartX = useRef<number | null>(null);
  const [pullOffset, setPullOffset] = useState(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    // Interaktif veya altyazı alanından gelen dokunmalarda oynatıcı swipe jestini iptal et
    const target = e.target as HTMLElement | null;
    if (target && target.closest('[data-subtitle-interactive], [data-no-swipe], button, input, [role="button"]')) {
      touchStartY.current = null;
      touchStartX.current = null;
      return;
    }
    handleUserInteraction();
    if (e.touches.length === 1) {
      touchStartY.current = e.touches[0].clientY;
      touchStartX.current = e.touches[0].clientX;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    const deltaY = e.touches[0].clientY - touchStartY.current;
    const deltaX = touchStartX.current !== null ? e.touches[0].clientX - touchStartX.current : 0;

    // Prioritize vertical swipes downward
    if (deltaY > 0 && Math.abs(deltaY) > Math.abs(deltaX)) {
      if (isFullscreen) {
        if (deltaY > 50) {
          toggleFullscreen();
          touchStartY.current = null;
        }
      } else {
        const dampened = Math.min(110, deltaY * 0.85);
        setPullOffset(dampened);
      }
    }
  };

  const handleTouchEnd = () => {
    if (!isFullscreen && pullOffset > 45) {
      if (onDismiss) {
        onDismiss();
      }
    }
    setPullOffset(0);
    touchStartY.current = null;
    touchStartX.current = null;
  };

  useImperativeHandle(ref, () => ({
    toggleFullscreen: () => {
      toggleFullscreen();
    },
    seekTo: (seconds: number) => {
      if (playerRef.current && playerRef.current.seekTo) {
        playerRef.current.seekTo(seconds, true);
      }
    },
    pauseVideo: () => {
      try {
        if (playerRef.current && playerRef.current.pauseVideo) {
          playerRef.current.pauseVideo();
        }
      } catch (err) {
        console.warn('Manual pauseVideo failed:', err);
      }
    }
  }));

  const handleUserInteraction = () => {
    setIsControlsVisible(true);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      setIsControlsVisible(false);
    }, 2800);
  };

  useEffect(() => {
    if (playerRef.current && playerRef.current.setPlaybackRate) {
      playerRef.current.setPlaybackRate(playbackRate);
    }
  }, [playbackRate]);

  useEffect(() => {
    const handleFsChange = () => {
      const active = !!document.fullscreenElement;
      setIsFullscreen(active);
      if (onFullscreenToggle) onFullscreenToggle(active);
    };

    const handlePopState = () => {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    };

    document.addEventListener('fullscreenchange', handleFsChange);
    window.addEventListener('popstate', handlePopState);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      window.removeEventListener('popstate', handlePopState);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [onFullscreenToggle]);

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      if (playerRef.current && playerRef.current.getCurrentTime) {
        const time = playerRef.current.getCurrentTime();
        onTimeUpdateRef.current(time);
      }
    }, 100);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const initPlayer = useCallback(() => {
    if (!containerRef.current) return;
    
    if (playerRef.current && playerRef.current.destroy) {
      playerRef.current.destroy();
    }

    playerRef.current = new window.YT.Player(containerRef.current, {
      videoId: videoId,
      width: '100%',
      height: '100%',
      playerVars: {
        autoplay: 1,
        controls: 1,
        modestbranding: 1,
        rel: 0,
        enablejsapi: 1,
        cc_load_policy: 0,
        iv_load_policy: 3, // Disable video annotations
        fs: 0, // Disable native iframe-only fullscreen
      },
      events: {
        onReady: (event: any) => {
          setIsReady(true);
          
          // Auto-resume from saved watch progress
          if (initialStartTime) {
            event.target.seekTo(initialStartTime, true);
            setResumedToast(`${t('resumedToastPrefix')}: ${Math.floor(initialStartTime/60)}:${Math.floor(initialStartTime%60).toString().padStart(2,'0')}`);
            setTimeout(() => setResumedToast(null), 4000);
          }
          // Initialize playback rate
          event.target.setPlaybackRate(playbackRateRef.current);
          
          event.target.playVideo();
          startTimer();
          handleUserInteraction();

          try {
            const videoData = event.target.getVideoData?.();
            if (videoData && videoData.title && onVideoTitleRef.current) {
              onVideoTitleRef.current(videoData.title);
            }
          } catch {
            // Ignore error
          }
        },
        onStateChange: (event: any) => {
          const playing = event.data === 1;
          onStateChangeRef.current(playing);
          if (playing) {
            startTimer();
          } else {
            stopTimer();
          }
        }
      }
    });
  }, [videoId, initialStartTime, t, startTimer, stopTimer]);

  useEffect(() => {
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

      window.onYouTubeIframeAPIReady = () => {
        initPlayer();
      };
    } else {
      initPlayer();
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (playerRef.current && playerRef.current.destroy) {
        playerRef.current.destroy();
      }
    };
  }, [initPlayer]);

  useEffect(() => {
    if (externalPauseRequest && playerRef.current && playerRef.current.pauseVideo) {
      try {
        playerRef.current.pauseVideo();
      } catch (err) {
        console.warn('Player pause failed:', err);
      }
    }
  }, [externalPauseRequest]);

  const toggleFullscreen = () => {
    if (!playerWrapperRef.current) return;

    if (!document.fullscreenElement) {
      playerWrapperRef.current.requestFullscreen().then(() => {
        setIsFullscreen(true);
        try {
          window.history.pushState({ fullscreen: true }, '');
        } catch {}
      }).catch(err => {
        console.warn('Fullscreen request failed:', err);
      });
    } else {
      document.exitFullscreen().then(() => {
        setIsFullscreen(false);
      }).catch(() => {});
    }
  };

  return (
    <div
      ref={playerWrapperRef}
      onMouseMove={handleUserInteraction}
      onMouseEnter={handleUserInteraction}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseLeave={() => setIsControlsVisible(false)}
      style={{
        transform: pullOffset > 0 ? `translateY(${pullOffset}px)` : undefined,
        opacity: pullOffset > 0 ? Math.max(0.4, 1 - pullOffset / 140) : 1,
        transition: pullOffset === 0 ? 'transform 0.25s ease-out, opacity 0.25s ease-out' : 'none'
      }}
      className={`absolute inset-0 z-10 w-full h-full bg-black group select-none ${
        isFullscreen ? 'z-50' : ''
      }`}
    >
      {/* Top Pull Down & Minimize Bar */}
      <div className={`absolute top-0 left-0 right-0 z-40 flex items-center justify-between px-3 py-2 transition-opacity duration-200 pointer-events-none ${
        isControlsVisible || pullOffset > 0 ? 'opacity-100' : 'opacity-0'
      }`}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (isFullscreen) {
              toggleFullscreen();
            } else if (onDismiss) {
              onDismiss();
            }
          }}
          className={`p-1.5 rounded-xl backdrop-blur-md bg-black/60 hover:bg-black/85 active:scale-95 text-white/95 hover:text-white border border-white/20 shadow-lg drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] transition-all cursor-pointer ${
            isControlsVisible || pullOffset > 0 ? 'pointer-events-auto' : 'pointer-events-none'
          }`}
          title={isFullscreen ? t('exitFullscreenTitle') : t('dismiss')}
        >
          <ChevronDown className="w-4 h-4" />
        </button>

        {/* Center Drag Indicator with dedicated touch target */}
        <div
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className={`px-4 py-2 cursor-grab active:cursor-grabbing touch-none select-none ${
            isControlsVisible || pullOffset > 0 ? 'pointer-events-auto' : 'pointer-events-none'
          }`}
          title={isFullscreen ? t('exitFullscreenTitle') : t('dismiss')}
        >
          <div className="w-14 h-1.5 rounded-full bg-white/70 backdrop-blur-md shadow-md ring-1 ring-black/30 hover:bg-white transition-colors" />
        </div>

        <div className="w-8" />
      </div>

      {/* Embedded Video IFrame */}
      <div ref={containerRef} className="w-full h-full pointer-events-auto" />

      {/* Video Touch & Click Surface to Wake Controls / Fullscreen */}
      {!isControlsVisible && (
        <div
          onClick={handleUserInteraction}
          onTouchStart={handleTouchStart}
          className="absolute inset-0 z-20 cursor-pointer bg-transparent"
          aria-label="Show video playback controls"
        />
      )}

      {/* Loading Spinner */}
      {!isReady && (
        <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center space-y-3 z-30">
          <div className="w-10 h-10 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-sm font-medium text-slate-300">{t('playerLoading')}</span>
        </div>
      )}

      {/* Resume Watch Toast Banner */}
      {resumedToast && (
        <div className="absolute top-12 left-4 z-40 bg-slate-900/90 border border-red-500/40 text-red-300 px-3.5 py-2 rounded-2xl shadow-2xl backdrop-blur-xl flex items-center space-x-2 animate-bounce text-xs font-semibold">
          <History className="w-4 h-4 text-red-400" />
          <span>{resumedToast}</span>
        </div>
      )}

      {/* Auto-Pause After Subtitle Toggle Button in Playback Controls */}
      <button
        type="button"
        onClick={() => setAutoPauseAfterSubtitle(!autoPauseAfterSubtitle)}
        className={`absolute z-40 backdrop-blur-md active:scale-90 p-2.5 sm:px-3 sm:py-2 rounded-xl sm:rounded-2xl border shadow-[0_2px_12px_rgba(0,0,0,0.6)] flex items-center space-x-1.5 text-xs font-semibold transition-all duration-200 cursor-pointer ${
          autoPauseAfterSubtitle
            ? 'bg-amber-500/90 text-white border-amber-400 ring-2 ring-amber-400/40 shadow-amber-500/30'
            : 'bg-black/60 hover:bg-black/80 text-white/80 hover:text-white border-white/20'
        } ${
          isControlsVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        } ${
          isFullscreen ? 'bottom-16 right-20 sm:right-32' : 'bottom-12 right-14 sm:bottom-14 sm:right-28'
        }`}
        title={t('autoPauseAfterSubtitle')}
      >
        <PauseCircle className={`w-4 h-4 ${autoPauseAfterSubtitle ? 'text-white' : 'text-amber-400'}`} />
        <span className="hidden sm:inline">{t('autoPauseAfterSubtitle')}</span>
      </button>

      {/* Fullscreen Toggle Button - Cleanly Positioned with Gated Pointer Events */}
      <button
        onClick={toggleFullscreen}
        className={`absolute z-40 backdrop-blur-md bg-black/60 hover:bg-black/80 active:scale-90 text-white/95 hover:text-white p-2.5 sm:px-3 sm:py-2 rounded-xl sm:rounded-2xl border border-white/20 shadow-[0_2px_12px_rgba(0,0,0,0.6)] drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] flex items-center space-x-1.5 text-xs font-medium transition-all duration-200 cursor-pointer ${
          isControlsVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        } ${
          isFullscreen ? 'bottom-16 right-4' : 'bottom-12 right-3 sm:bottom-14 sm:right-4'
        }`}
        title={isFullscreen ? t('exitFullscreenTitle') : t('fullscreenTitle')}
      >
        {isFullscreen ? (
          <>
            <Minimize className="w-4 h-4 sm:w-4 sm:h-4 text-red-400 drop-shadow" />
            <span className="hidden sm:inline">{t('exitFullscreen')}</span>
          </>
        ) : (
          <>
            <Maximize className="w-4 h-4 sm:w-4 sm:h-4 text-white drop-shadow" />
            <span className="hidden sm:inline">{t('fullscreen')}</span>
          </>
        )}
      </button>

      {/* Dynamic Subtitles Overlay Layer */}
      <div
        data-no-swipe="true"
        className={`absolute left-0 right-0 z-30 pointer-events-none flex justify-center px-3 sm:px-4 transition-all duration-300 ease-out ${
          isControlsVisible
            ? 'bottom-16 sm:bottom-20' // Gentle lift when controls are visible
            : 'bottom-4 sm:bottom-8'
        }`}
      >
        {children}
      </div>
    </div>
  );
});
