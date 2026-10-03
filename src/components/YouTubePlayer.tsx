import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { Maximize, Minimize, History } from 'lucide-react';
import { useTranslation } from '../i18n/TranslationContext';

export interface YouTubePlayerHandle {
  toggleFullscreen: () => void;
  seekTo: (seconds: number) => void;
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
  children
}, ref) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const playerWrapperRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const timerRef = useRef<any>(null);
  const idleTimerRef = useRef<any>(null);

  const [isReady, setIsReady] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isControlsVisible, setIsControlsVisible] = useState(true);
  const [resumedToast, setResumedToast] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({
    toggleFullscreen: () => {
      toggleFullscreen();
    },
    seekTo: (seconds: number) => {
      if (playerRef.current && playerRef.current.seekTo) {
        playerRef.current.seekTo(seconds, true);
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
  }, [videoId]);

  const initPlayer = () => {
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
          event.target.setPlaybackRate(playbackRate);
          
          event.target.playVideo();
          startTimer();
          handleUserInteraction();

          try {
            const videoData = event.target.getVideoData?.();
            if (videoData && videoData.title && onVideoTitle) {
              onVideoTitle(videoData.title);
            }
          } catch {
            // Ignore error
          }
        },
        onStateChange: (event: any) => {
          const playing = event.data === 1;
          onStateChange(playing);
          if (playing) {
            startTimer();
          } else {
            stopTimer();
          }
        }
      }
    });
  };

  const startTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      if (playerRef.current && playerRef.current.getCurrentTime) {
        const time = playerRef.current.getCurrentTime();
        onTimeUpdate(time);
      }
    }, 100);
  };

  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
  };

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
      onTouchStart={handleUserInteraction}
      onMouseLeave={() => setIsControlsVisible(false)}
      className={`absolute inset-0 z-10 w-full h-full bg-black group ${
        isFullscreen ? 'z-50' : ''
      }`}
    >
      {/* Embedded Video IFrame */}
      <div ref={containerRef} className="w-full h-full pointer-events-auto" />

      {/* Loading Spinner */}
      {!isReady && (
        <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center space-y-3 z-30">
          <div className="w-10 h-10 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-sm font-medium text-slate-300">{t('playerLoading')}</span>
        </div>
      )}

      {/* Resume Watch Toast Banner */}
      {resumedToast && (
        <div className="absolute top-4 left-4 z-40 bg-slate-900/90 border border-red-500/40 text-red-300 px-3.5 py-2 rounded-2xl shadow-2xl backdrop-blur-xl flex items-center space-x-2 animate-bounce text-xs font-semibold">
          <History className="w-4 h-4 text-red-400" />
          <span>{resumedToast}</span>
        </div>
      )}

      {/* Fullscreen Toggle Button - Always Accessible & Persistent */}
      <button
        onClick={toggleFullscreen}
        className={`absolute z-40 bg-black/25 hover:bg-black/60 active:scale-90 backdrop-blur-sm text-white/70 hover:text-white p-2.5 sm:px-3 sm:py-2 rounded-xl sm:rounded-2xl border border-white/10 shadow-lg flex items-center space-x-1.5 text-xs font-medium transition-all duration-200 pointer-events-auto cursor-pointer ${
          isFullscreen ? 'bottom-16 right-4' : 'bottom-3 right-3 sm:bottom-6 sm:right-6'
        }`}
        title={isFullscreen ? t('exitFullscreenTitle') : t('fullscreenTitle')}
      >
        {isFullscreen ? (
          <>
            <Minimize className="w-4 h-4 sm:w-4 sm:h-4 text-red-400" />
            <span className="hidden sm:inline">{t('exitFullscreen')}</span>
          </>
        ) : (
          <>
            <Maximize className="w-4 h-4 sm:w-4 sm:h-4 text-white" />
            <span className="hidden sm:inline">{t('fullscreen')}</span>
          </>
        )}
      </button>

      {/* Dynamic Subtitles Overlay Layer */}
      <div className={`absolute left-0 right-0 z-30 pointer-events-none flex justify-center px-3 sm:px-4 transition-all duration-300 ease-out ${
        isControlsVisible
          ? 'bottom-16 sm:bottom-20' // Gentle lift when controls are visible
          : 'bottom-4 sm:bottom-8'
      }`}>
        {children}
      </div>
    </div>
  );
});
