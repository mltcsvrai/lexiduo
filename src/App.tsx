import { useState, useEffect, useRef } from 'react';
import { YouTubePlayer, type YouTubePlayerHandle } from './components/YouTubePlayer';
import { SubtitleOverlay } from './components/SubtitleOverlay';
import { FloatingDock } from './components/FloatingDock';
import { TopSearchOverlay } from './components/TopSearchOverlay';
import { ApiKeyModal } from './components/ApiKeyModal';
import { fetchVideoSubtitles, extractYouTubeId } from './services/transcriptService';
import { RefreshCw } from 'lucide-react';
import { get, set } from 'idb-keyval';
import { WelcomeHero } from './components/WelcomeHero';
import { HistoryModal } from './components/HistoryModal';
import type { HistoryItem } from './types';
import { fetchYouTubeMetadata, cacheVideoTitle } from './services/videoMetadata';
import { useTranslation } from './i18n/TranslationContext';
import { useAppStore } from './store/useAppStore';
import { listenToSharedLinks } from './services/sendIntentService';
import { Clipboard } from '@capacitor/clipboard';
import { App as CapApp } from '@capacitor/app';
import { WordDrawer } from './components/WordDrawer';
import { InteractiveTranscriptPanel } from './components/InteractiveTranscriptPanel';

export function App() {
  const { t } = useTranslation();
  const playerRef = useRef<YouTubePlayerHandle>(null);
  const lastSaveTimeRef = useRef<number>(0);
  const lastCheckedClipboardId = useRef<string>('');
  
  // Local UI States
  const [showWordHint, setShowWordHint] = useState(false);
  const [clipboardPrompt, setClipboardPrompt] = useState<{ id: string; rawText: string } | null>(null);

  // Zustand Global State Selectors
  const videoId = useAppStore(s => s.videoId);
  const setVideoId = useAppStore(s => s.setVideoId);
  const cues = useAppStore(s => s.cues);
  const setCues = useAppStore(s => s.setCues);
  const setCurrentTime = useAppStore(s => s.setCurrentTime);
  const loadingSubtitles = useAppStore(s => s.loadingSubtitles);
  const setLoadingSubtitles = useAppStore(s => s.setLoadingSubtitles);
  const savedStartTime = useAppStore(s => s.savedStartTime);
  const setSavedStartTime = useAppStore(s => s.setSavedStartTime);
  const externalPause = useAppStore(s => s.externalPause);
  const playbackRate = useAppStore(s => s.playbackRate);
  const isSearchOpen = useAppStore(s => s.isSearchOpen);
  const setIsSearchOpen = useAppStore(s => s.setIsSearchOpen);
  const isSettingsOpen = useAppStore(s => s.isSettingsOpen);
  const setIsSettingsOpen = useAppStore(s => s.setIsSettingsOpen);
  const isHistoryOpen = useAppStore(s => s.isHistoryOpen);
  const setIsHistoryOpen = useAppStore(s => s.setIsHistoryOpen);
  const apiKey = useAppStore(s => s.apiKey);
  const setApiKey = useAppStore(s => s.setApiKey);
  const sourceLang = useAppStore(s => s.sourceLang);
  const setSourceLang = useAppStore(s => s.setSourceLang);
  const targetLang = useAppStore(s => s.targetLang);
  const setTargetLang = useAppStore(s => s.setTargetLang);
  const setShowSubtitleBg = useAppStore(s => s.setShowSubtitleBg);
  const setSyncOffset = useAppStore(s => s.setSyncOffset);
  const lookupWordAction = useAppStore(s => s.lookupWordAction);
  const setActiveWordTranslation = useAppStore(s => s.setActiveWordTranslation);

  // IndexedDB Migration and Initialization
  useEffect(() => {
    async function initStorage() {
      // Migrate localStorage to IDB if needed
      const oldKey = localStorage.getItem('yt_ceviri_gemini_key');
      if (oldKey !== null) {
        await set('yt_ceviri_gemini_key', oldKey);
        localStorage.removeItem('yt_ceviri_gemini_key');
      }
      const oldLastVideo = localStorage.getItem('yt_ceviri_last_video');
      if (oldLastVideo !== null) {
        await set('yt_ceviri_last_video', oldLastVideo);
        localStorage.removeItem('yt_ceviri_last_video');
      }
      const oldBg = localStorage.getItem('yt_ceviri_subtitle_bg');
      if (oldBg !== null) {
        await set('yt_ceviri_subtitle_bg', oldBg !== 'false');
        localStorage.removeItem('yt_ceviri_subtitle_bg');
      }
      const oldHistory = localStorage.getItem('yt_ceviri_watch_history');
      if (oldHistory !== null) {
        // Migration to new per-video history keys
        try {
          const hist = JSON.parse(oldHistory);
          for (const [vid, time] of Object.entries(hist)) {
             await set(`watch_history_${vid}`, time);
          }
        } catch (e) {}
        localStorage.removeItem('yt_ceviri_watch_history');
      }

      // Load from IDB
      try {
        const [savedVideoId, savedKeyYt, savedKeyGemini, savedSourceLang, savedTargetLang] = await Promise.all([
          get<string>('yt_ceviri_video_id'),
          get<string>('yt_ceviri_gemini_key'),
          get<string>('gemini_api_key'),
          get<string>('source_lang'),
          get<string>('target_lang')
        ]);
        if (savedVideoId) setVideoId(savedVideoId);
        const resolvedKey = savedKeyYt || savedKeyGemini;
        if (resolvedKey) setApiKey(resolvedKey);
        if (savedSourceLang) setSourceLang(savedSourceLang);
        if (savedTargetLang) setTargetLang(savedTargetLang);
        const [savedBg, savedSync, savedLimit] = await Promise.all([
          get<boolean>('yt_ceviri_subtitle_bg'),
          get<number>('yt_ceviri_sync_offset'),
          get<number>('yt_ceviri_history_limit')
        ]);
        if (savedBg !== undefined) setShowSubtitleBg(savedBg);
        if (savedSync !== undefined) setSyncOffset(savedSync);
        if (savedLimit !== undefined && typeof savedLimit === 'number') {
          useAppStore.getState().setHistoryLimit(savedLimit);
        }
      } catch (e) {
        console.error('Failed to load state from DB', e);
      }
    }
    initStorage();
  }, []); // Run once on mount

  // Layered Android Hardware Back Button Handling
  useEffect(() => {
    let backListener: any = null;

    const setupBackListener = async () => {
      try {
        backListener = await CapApp.addListener('backButton', () => {
          // 1. Kelime sözlük çekmecesi / popup açıksa kapat (Tam ekranda dahi olsa önce sözlüğü kapat)
          const store = useAppStore.getState();
          if (store.activeTokenId || store.activeWordTranslation || store.wordLoading) {
            store.setActiveTokenId(null);
            store.setActiveWordTranslation(null);
            return;
          }
          // 2. Tam ekranda video açıksa tam ekrandan çık
          if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
            return;
          }
          // 3. Modallar açıksa kapat (öncelik sırasıyla)
          if (store.isSearchOpen) {
            store.setIsSearchOpen(false);
            return;
          }
          if (store.isSettingsOpen) {
            store.setIsSettingsOpen(false);
            return;
          }
          if (store.isHistoryOpen) {
            store.setIsHistoryOpen(false);
            return;
          }
          // 4. Ana ekranda hiçbir şey açık değilse uygulamayı kapat
          CapApp.exitApp();
        });
      } catch (e) {
        console.warn('Capacitor App backButton listener not supported in web mode:', e);
      }
    };

    setupBackListener();

    return () => {
      if (backListener) {
        backListener.remove();
      }
    };
  }, []);

  // Load saved watch position whenever videoId changes (per-video key to prevent race conditions)
  useEffect(() => {
    async function loadSavedTime() {
      try {
        const time = await get(`watch_history_${videoId}`);
        setSavedStartTime(typeof time === 'number' ? time : 0);
      } catch (e) {
        console.warn('Failed to load saved time:', e);
      }
    }
    loadSavedTime();
  }, [videoId, setSavedStartTime]);

  // One-time micro hint for word tapping on first video load
  useEffect(() => {
    let timer: any = null;
    if (videoId) {
      get<boolean>('has_seen_word_hint').then(seen => {
        if (!seen) {
          setShowWordHint(true);
          timer = setTimeout(() => {
            setShowWordHint(false);
            set('has_seen_word_hint', true).catch(() => {});
          }, 4500);
        }
      }).catch(() => {});
    } else {
      setShowWordHint(false);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [videoId]);

  // Synchronize language choices to IDB
  useEffect(() => {
    if (sourceLang) set('source_lang', sourceLang).catch(() => {});
  }, [sourceLang]);

  useEffect(() => {
    if (targetLang) set('target_lang', targetLang).catch(() => {});
  }, [targetLang]);

  // Handle Word & Idiom Lookup Events from SubtitleOverlay
  useEffect(() => {
    const handleWordLookup = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { word, isTargetWord, tokenId } = customEvent.detail;
      lookupWordAction(word, isTargetWord, tokenId);
    };

    const handleIdiomLookup = (e: Event) => {
      const customEvent = e as CustomEvent;
      const idiom = customEvent.detail;
      lookupWordAction(idiom, false, 'idiom-selection');
    };

    window.addEventListener('yt-ceviri-word-lookup', handleWordLookup);
    window.addEventListener('yt-ceviri-idiom-lookup', handleIdiomLookup);
    
    return () => {
      window.removeEventListener('yt-ceviri-word-lookup', handleWordLookup);
      window.removeEventListener('yt-ceviri-idiom-lookup', handleIdiomLookup);
    };
  }, [lookupWordAction]);

  const activeRequestRef = useRef<string>('');

  // Fetch subtitles whenever videoId or apiKey changes
  useEffect(() => {
    let isMounted = true;
    const currentRequest = `${videoId}_${sourceLang}_${targetLang}`;
    activeRequestRef.current = currentRequest;
    
    if (!videoId) {
      setCues([]);
      setLoadingSubtitles(false);
      return;
    }
    
    setCues([]);
    setLoadingSubtitles(true);

    async function loadSubs() {
      try {
        const result = await fetchVideoSubtitles(videoId, sourceLang, targetLang, apiKey, (fastCues) => {
          if (isMounted && activeRequestRef.current === currentRequest) {
            setCues(fastCues);
            setLoadingSubtitles(false);
          }
        });
        if (isMounted && activeRequestRef.current === currentRequest && result.cues.length > 0) {
          setCues(result.cues);
        }
      } catch (err) {
        console.error('Subtitles load error:', err);
      } finally {
        if (isMounted && activeRequestRef.current === currentRequest) setLoadingSubtitles(false);
      }
    }
    loadSubs();

    return () => { isMounted = false; };
  }, [videoId, apiKey, sourceLang, targetLang, setCues, setLoadingSubtitles]);

  // Handle Loading a new Video URL or ID
  const handleLoadVideo = async (urlOrId: string) => {
    const extracted = extractYouTubeId(urlOrId);
    const currentVideoId = useAppStore.getState().videoId;
    if (extracted !== currentVideoId) {
      setCues([]);
      setVideoId(extracted);
      setActiveWordTranslation(null);
      set('yt_ceviri_video_id', extracted).catch(() => {});

      // Add to History with Title
      (async () => {
        try {
          const meta = await fetchYouTubeMetadata(extracted);
          let currentHistory = await get<HistoryItem[]>('yt_ceviri_history_list') || [];
          // Remove if it already exists to move it to the top
          currentHistory = currentHistory.filter(item => item.videoId !== extracted);
          currentHistory.unshift({ videoId: extracted, title: meta.title, timestamp: Date.now() });
          // Cap at 20
          if (currentHistory.length > 20) {
            currentHistory = currentHistory.slice(0, 20);
          }
          await set('yt_ceviri_history_list', currentHistory);
        } catch (e) {
          console.warn('Failed to save history', e);
        }
      })();
    }
  };

  // Listen for shared links (SendIntent) from Android OS
  useEffect(() => {
    let cleanupFn: (() => void) | null = null;

    listenToSharedLinks((rawText) => {
      const extracted = extractYouTubeId(rawText);
      if (extracted && extracted !== useAppStore.getState().videoId) {
        handleLoadVideo(rawText);
      }
    }).then((cleanup) => {
      cleanupFn = cleanup;
    });

    return () => {
      if (cleanupFn) {
        cleanupFn();
      }
    };
  }, []);

  // Smart Clipboard Detection: Check for YouTube links on launch and app resume
  useEffect(() => {
    const checkClipboardForVideo = async () => {
      try {
        const { value } = await Clipboard.read();
        if (!value || typeof value !== 'string') return;
        const detectedId = extractYouTubeId(value);
        if (
          detectedId &&
          detectedId !== useAppStore.getState().videoId &&
          detectedId !== lastCheckedClipboardId.current
        ) {
          lastCheckedClipboardId.current = detectedId;
          setClipboardPrompt({ id: detectedId, rawText: value });
        }
      } catch {
        // Clipboard permission denied or unavailable
      }
    };

    // 1. Check on initial mount
    checkClipboardForVideo();

    // 2. Check when app returns to foreground
    let appStateHandle: any = null;
    try {
      CapApp.addListener('appStateChange', (state) => {
        if (state.isActive) {
          checkClipboardForVideo();
        }
      }).then((handle) => {
        appStateHandle = handle;
      });
    } catch {
      // Non-Capacitor environment
    }

    return () => {
      if (appStateHandle && appStateHandle.remove) {
        appStateHandle.remove();
      }
    };
  }, []);

  // Save API Key
  const handleSaveApiKey = (key: string) => {
    setApiKey(key);
    set('yt_ceviri_gemini_key', key);
    set('gemini_api_key', key);
  };

  return (
    <div className="min-h-[100dvh] h-[100dvh] w-full overflow-hidden mesh-bg text-slate-100 flex flex-col justify-between selection:bg-red-500 selection:text-white relative">
      <TopSearchOverlay 
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onLoadVideo={handleLoadVideo}
      />
      
      <HistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        onLoadVideo={handleLoadVideo}
      />

      {/* Smart Clipboard Video Detected Banner */}
      {clipboardPrompt && (
        <div className="fixed top-[calc(1rem+env(safe-area-inset-top))] left-1/2 -translate-x-1/2 z-50 max-w-[92vw] sm:max-w-md w-full bg-slate-900/95 border border-red-500/50 shadow-2xl shadow-red-500/20 rounded-2xl px-4 py-3 flex items-center justify-between gap-3 backdrop-blur-xl animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z"/></svg>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-semibold text-slate-100 truncate">
                {t('clipboardVideoDetected')}
              </span>
              <span className="text-[11px] text-slate-400 font-mono truncate">
                {clipboardPrompt.id}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                const textToLoad = clipboardPrompt.rawText;
                setClipboardPrompt(null);
                handleLoadVideo(textToLoad);
              }}
              className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 active:scale-95 text-white text-xs font-medium transition-all shadow-md shadow-red-600/30"
            >
              {t('openFromClipboard')}
            </button>
            <button
              onClick={() => setClipboardPrompt(null)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title={t('dismiss')}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* One-time subtle micro hint */}
      {showWordHint && cues.length > 0 && (
        <div className="fixed top-[calc(3.5rem+env(safe-area-inset-top))] sm:top-18 left-1/2 -translate-x-1/2 z-40 bg-slate-900/95 border border-red-500/40 text-white text-xs px-4 py-2 rounded-full shadow-2xl backdrop-blur-md flex items-center space-x-2 animate-in fade-in slide-in-from-top-2 duration-300 pointer-events-none">
          <span>💡</span>
          <span className="font-semibold text-slate-200">{t('wordHint')}</span>
        </div>
      )}

      <main className="flex-1 w-full h-full max-w-7xl mx-auto overflow-hidden flex flex-col justify-start md:justify-center px-0 md:px-6 lg:px-8 pt-safe md:pt-14 lg:pt-16 pb-0 md:pb-24">
        {!videoId ? (
          <div className="flex-1 w-full overflow-y-auto custom-scrollbar flex flex-col items-center justify-start pb-28">
            <WelcomeHero onLoadVideo={handleLoadVideo} />
          </div>
        ) : (
          <div className="w-full h-full flex flex-col md:grid md:grid-cols-12 md:gap-6 md:items-center overflow-hidden">
            {/* SOL SÜTUN: Mobil dikeyde en üstte, landscape'te tam ekran, tablette 7 col, masaüstünde ortalı */}
            <div className="w-full shrink-0 md:shrink md:col-span-7 lg:col-span-12 xl:max-w-5xl xl:mx-auto md:w-full landscape:fixed landscape:inset-0 landscape:z-30 landscape:md:static landscape:md:z-auto">
              <div className="w-full aspect-video rounded-none md:rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)] bg-slate-900/50 backdrop-blur-xl border-b md:border border-white/10 flex items-center justify-center relative">
                <YouTubePlayer
                  ref={playerRef}
                  videoId={videoId}
                  initialStartTime={savedStartTime}
                  onTimeUpdate={(t) => {
                    setCurrentTime(t);
                    if (videoId && t > 2) {
                      const now = Date.now();
                      if (now - lastSaveTimeRef.current > 4000) {
                        lastSaveTimeRef.current = now;
                        set(`watch_history_${videoId}`, Math.floor(t)).catch(() => {});
                      }
                    }
                  }}
                  onStateChange={() => {}}
                  externalPauseRequest={externalPause}
                  playbackRate={playbackRate}
                  onVideoTitle={(title) => {
                    cacheVideoTitle(videoId, title);
                    (async () => {
                      try {
                        const list = await get<HistoryItem[]>('yt_ceviri_history_list');
                        if (list && Array.isArray(list)) {
                          let hasChange = false;
                          const updated = list.map(item => {
                            if (item.videoId === videoId && (!item.title || item.title.startsWith('Video ('))) {
                              hasChange = true;
                              return { ...item, title };
                            }
                            return item;
                          });
                          if (hasChange) {
                            await set('yt_ceviri_history_list', updated);
                          }
                        }
                      } catch (err) {
                        console.warn('Failed to update title from player:', err);
                      }
                    })();
                  }}
                >
                  {loadingSubtitles && cues.length === 0 ? (
                    <div className="pointer-events-auto flex items-center space-x-2 bg-slate-900/90 backdrop-blur-md px-5 py-3 rounded-2xl border border-white/10 shadow-2xl animate-pulse">
                      <RefreshCw className="w-4 h-4 text-red-500 animate-spin" />
                      <span className="text-xs font-semibold text-slate-300">
                        {t('loading')}
                      </span>
                    </div>
                  ) : cues.length === 0 ? (
                    <div className="pointer-events-auto flex flex-col items-center justify-center p-6 bg-slate-900/90 backdrop-blur-md rounded-2xl border border-white/10 shadow-2xl">
                      <p className="text-slate-300 text-sm font-semibold mb-3">{t('noSubtitles')}</p>
                    </div>
                  ) : (
                    <SubtitleOverlay />
                  )}
                </YouTubePlayer>
              </div>
            </div>

            {/* SAĞ SÜTUN (TABLET SPLIT-VIEW): 768px-1024px arasında sağ tarafta interaktif transkript */}
            <div className="hidden md:flex lg:hidden md:col-span-5 h-[65vh] bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-3xl p-4 overflow-hidden shadow-2xl flex-col">
              <InteractiveTranscriptPanel onSeek={(time) => playerRef.current?.seekTo(time)} />
            </div>

            {/* MOBİL DİKEY ALT PANEL (< md): Videonun hemen altında scrollable altyazı & kelime öğrenme alanı */}
            <div className="flex-1 md:hidden w-full overflow-y-auto px-4 py-4 pb-28 space-y-3 landscape:hidden">
              <InteractiveTranscriptPanel onSeek={(time) => playerRef.current?.seekTo(time)} />
            </div>
          </div>
        )}
      </main>

      {/* Global Bottom Sheet Word Drawer for Mobile & Tablet */}
      <WordDrawer />

      <FloatingDock 
        onSearchToggle={() => setIsSearchOpen(true)}
        onSettingsOpen={() => setIsSettingsOpen(true)}
        onHomeClick={() => {
          setVideoId('');
          set('yt_ceviri_video_id', '').catch(() => {});
        }}
        showHome={Boolean(videoId)}
      />

      <ApiKeyModal 
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        currentKey={apiKey}
        onSave={handleSaveApiKey}
      />
    </div>
  );
}

export default App;
