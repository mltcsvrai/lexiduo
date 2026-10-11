import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, ChevronDown } from 'lucide-react';
import { useAppStore, useTranslation } from '@lexiduo/core';

export interface LocalVideoPlayerHandle {
  toggleFullscreen: () => void;
  seekTo: (seconds: number) => void;
  play: () => void;
  pause: () => void;
}

interface LocalVideoPlayerProps {
  videoUrl: string;
  onTimeUpdate?: (time: number) => void;
  onDismiss?: () => void;
  children?: React.ReactNode;
}

export const LocalVideoPlayer = forwardRef<LocalVideoPlayerHandle, LocalVideoPlayerProps>(
  ({ videoUrl, onTimeUpdate, onDismiss, children }, ref) => {
    const { t } = useTranslation();
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isMuted, setIsMuted] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);

    // Gesture handling state for swipe down / pull-to-dismiss
    const touchStartY = useRef<number | null>(null);
    const touchStartX = useRef<number | null>(null);
    const isDraggingRef = useRef(false);
    const [pullOffset, setPullOffset] = useState(0);

    const handleTouchStart = (e: React.TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && target.closest('[data-subtitle-interactive], [data-no-swipe], button, input, [role="button"]')) {
        touchStartY.current = null;
        touchStartX.current = null;
        isDraggingRef.current = false;
        return;
      }
      if (e.touches.length === 1) {
        touchStartY.current = e.touches[0].clientY;
        touchStartX.current = e.touches[0].clientX;
        isDraggingRef.current = false;
      }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
      if (touchStartY.current === null) return;
      const deltaY = e.touches[0].clientY - touchStartY.current;
      const deltaX = touchStartX.current !== null ? e.touches[0].clientX - touchStartX.current : 0;

      if (deltaY > 0 && Math.abs(deltaY) > Math.abs(deltaX)) {
        if (deltaY > 6) {
          isDraggingRef.current = true;
        }
        if (isFullscreen) {
          if (deltaY > 50) {
            if (document.fullscreenElement) {
              document.exitFullscreen().catch(() => {});
            }
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
      setTimeout(() => {
        isDraggingRef.current = false;
      }, 100);
    };

    // Zustand Store Sync
    const setStoreCurrentTime = useAppStore(s => s.setCurrentTime);
    const externalPause = useAppStore(s => s.externalPause);
    const playbackRate = useAppStore(s => s.playbackRate);

    // Expose handle methods to parent
    useImperativeHandle(ref, () => ({
      toggleFullscreen: () => {
        if (!document.fullscreenElement) {
          containerRef.current?.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      },
      seekTo: (seconds: number) => {
        if (videoRef.current) {
          videoRef.current.currentTime = seconds;
          setCurrentTime(seconds);
          setStoreCurrentTime(seconds);
        }
      },
      play: () => {
        videoRef.current?.play().catch(() => {});
      },
      pause: () => {
        videoRef.current?.pause();
      }
    }));

    // Listen to external pause (triggered when user clicks a word in subtitles)
    useEffect(() => {
      if (externalPause && videoRef.current && !videoRef.current.paused) {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    }, [externalPause]);

    // Update playback speed
    useEffect(() => {
      if (videoRef.current) {
        videoRef.current.playbackRate = playbackRate;
      }
    }, [playbackRate]);

    // Fullscreen event listener
    useEffect(() => {
      const handleFullscreenChange = () => {
        setIsFullscreen(!!document.fullscreenElement);
      };
      document.addEventListener('fullscreenchange', handleFullscreenChange);
      return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    const [controlsVisible, setControlsVisible] = useState(true);
    const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastTapTimeRef = useRef<number>(0);

    const resetControlsTimeout = () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      setControlsVisible(true);
      controlsTimeoutRef.current = setTimeout(() => {
        setControlsVisible(false);
      }, 3500);
    };

    const handleContainerClick = () => {
      if (isDraggingRef.current) return;
      const now = Date.now();
      if (now - lastTapTimeRef.current < 300) {
        // Double tap: toggle fullscreen
        if (!document.fullscreenElement) {
          containerRef.current?.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
        lastTapTimeRef.current = 0;
        return;
      }
      lastTapTimeRef.current = now;

      // Single tap: toggle controls visibility
      if (!controlsVisible) {
        resetControlsTimeout();
      } else {
        setControlsVisible(false);
        if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      }
    };

    // Keep controls visible when paused, start timeout when playing
    useEffect(() => {
      if (isPlaying) {
        resetControlsTimeout();
      } else {
        setControlsVisible(true);
        if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      }
      return () => {
        if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      };
    }, [isPlaying]);

    const togglePlay = () => {
      if (isDraggingRef.current) return;
      if (!videoRef.current) return;
      if (videoRef.current.paused) {
        videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
      } else {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    };

    const handleTimeUpdate = () => {
      if (!videoRef.current) return;
      const t = videoRef.current.currentTime;
      setCurrentTime(t);
      setStoreCurrentTime(t);
      onTimeUpdate?.(t);
    };

    const handleLoadedMetadata = () => {
      if (videoRef.current) {
        setDuration(videoRef.current.duration);
      }
    };

    const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newTime = parseFloat(e.target.value);
      if (videoRef.current) {
        videoRef.current.currentTime = newTime;
        setCurrentTime(newTime);
        setStoreCurrentTime(newTime);
      }
    };

    const toggleMute = () => {
      if (!videoRef.current) return;
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(videoRef.current.muted);
    };

    const formatTime = (secs: number) => {
      const m = Math.floor(secs / 60);
      const s = Math.floor(secs % 60);
      return `${m}:${s < 10 ? '0' : ''}${s}`;
    };

    return (
      <div 
        ref={containerRef}
        onClick={handleContainerClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: pullOffset > 0 ? `translateY(${pullOffset}px)` : undefined,
          opacity: pullOffset > 0 ? Math.max(0.4, 1 - pullOffset / 140) : 1,
          transition: pullOffset === 0 ? 'transform 0.25s ease-out, opacity 0.25s ease-out' : 'none'
        }}
        className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl group border border-slate-800/80 select-none cursor-pointer"
      >
        {/* Top Pull Down & Minimize Bar */}
        <div className={`absolute top-0 left-0 right-0 z-40 flex items-center justify-between px-3 py-2 transition-opacity duration-300 ${
          controlsVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (isFullscreen) {
                if (document.fullscreenElement) {
                  document.exitFullscreen().catch(() => {});
                }
              } else if (onDismiss) {
                onDismiss();
              }
            }}
            className="p-1.5 rounded-xl backdrop-blur-md bg-black/60 hover:bg-black/85 active:scale-95 text-white/95 hover:text-white border border-white/20 shadow-lg drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] transition-all cursor-pointer pointer-events-auto"
            title={isFullscreen ? t('exitFullscreenTitle') : t('close')}
          >
            <ChevronDown className="w-4 h-4" />
          </button>

          {/* Center Drag Indicator with dedicated touch target */}
          <div
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className="px-4 py-2 cursor-grab active:cursor-grabbing touch-none select-none pointer-events-auto"
            title={t('close')}
          >
            <div className="w-14 h-1.5 rounded-full bg-white/70 backdrop-blur-md shadow-md ring-1 ring-black/30 hover:bg-white transition-colors" />
          </div>

          <div className="w-8" />
        </div>

        {/* Center Animated Play/Pause Button */}
        {controlsVisible && (
          <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                togglePlay();
                resetControlsTimeout();
              }}
              className="pointer-events-auto p-4 rounded-full backdrop-blur-md bg-black/60 hover:bg-black/80 text-white/95 hover:text-white border border-white/20 shadow-2xl transition-all active:scale-90 cursor-pointer animate-in fade-in zoom-in-90 duration-200"
              aria-label={isPlaying ? 'Durdur' : 'Oynat'}
            >
              {isPlaying ? <Pause className="w-8 h-8" /> : <Play className="w-8 h-8 fill-current ml-0.5" />}
            </button>
          </div>
        )}

        <video
          ref={videoRef}
          src={videoUrl}
          playsInline
          className="w-full h-full object-contain"
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
        />

        {/* Video Bottom Control Bar */}
        <div className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/95 via-slate-950/60 to-transparent p-3 pt-6 transition-opacity duration-300 flex flex-col gap-2 z-20 ${
          controlsVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}>
          {/* Progress / Seek bar */}
          <input
            type="range"
            min="0"
            max={duration || 100}
            step="0.1"
            value={currentTime}
            onClick={(e) => e.stopPropagation()}
            onChange={handleSeekChange}
            className="w-full h-1.5 bg-slate-700/60 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:h-2 transition-all"
          />

          <div className="flex items-center justify-between text-xs text-slate-200" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  togglePlay();
                  resetControlsTimeout();
                }}
                className="p-1 hover:text-white transition-colors cursor-pointer"
                aria-label={isPlaying ? 'Durdur' : 'Oynat'}
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleMute();
                }}
                className="p-1 hover:text-white transition-colors cursor-pointer"
                aria-label={isMuted ? t('unmute') : t('mute')}
              >
                {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
              </button>

              <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!document.fullscreenElement) {
                    containerRef.current?.requestFullscreen().catch(() => {});
                  } else {
                    document.exitFullscreen().catch(() => {});
                  }
                }}
                className="p-1.5 rounded-xl backdrop-blur-md bg-black/60 hover:bg-black/85 active:scale-95 text-white/95 hover:text-white border border-white/20 shadow-lg drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] transition-all cursor-pointer flex items-center gap-1 pointer-events-auto"
                aria-label={isFullscreen ? t('exitFullscreen') : t('fullscreen')}
              >
                {isFullscreen ? <Minimize className="w-4 h-4 text-red-400 drop-shadow" /> : <Maximize className="w-4 h-4 text-white drop-shadow" />}
              </button>
            </div>
          </div>
        </div>

        {/* Dynamic Subtitles Overlay Layer */}
        <div
          data-no-swipe="true"
          className="absolute left-0 right-0 z-30 pointer-events-none flex justify-center px-3 sm:px-4 bottom-14 sm:bottom-16 transition-all duration-300 ease-out"
        >
          {children}
        </div>
      </div>
    );
  }
);
