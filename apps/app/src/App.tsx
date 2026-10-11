import { useState, useEffect, useRef, useCallback } from 'react';
import { RefreshCw, Sparkles } from 'lucide-react';
import { get, set } from 'idb-keyval';
import { Clipboard } from '@capacitor/clipboard';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { isNativeWhisperAvailable } from './services/nativeWhisperBridge';
import { 
  SubtitleOverlay, WordDrawer, InteractiveTranscriptPanel, YouTubePlayer, 
  TopSearchOverlay, HistoryModal, fetchVideoSubtitles, extractYouTubeId, fetchYouTubeMetadata, 
  cacheVideoTitle, listenToSharedLinks, uriToFile, useTranslation, useAppStore, FloatingDock, 
  checkFloatingPermissions, startFloatingOverlay, withBackgroundTask, 
  persistApiKey, STORAGE_KEYS, getCompatItem, setCompatItem, loadAppPreferences,
  type YouTubePlayerHandle, type HistoryItem, type SubtitleCue 
} from '@lexiduo/core';

import { StudioHero } from './components/StudioHero';
import { LocalVideoPlayer, type LocalVideoPlayerHandle } from './components/LocalVideoPlayer';
import { AppModals } from './components/AppModals';
import { transcribeVideoOffline, type WhisperProgress } from './services/whisperEngine';
import { processYouTubeWhisper } from './services/youtubeWhisperEngine';
import { useActiveWhisperTier } from './hooks/useActiveWhisperTier';
import { useYouTubePlaybackFlow } from './hooks/useYouTubePlaybackFlow';
import { useModalBackStack } from './hooks/useModalBackStack';
import { useAutoYouTubeAssistant } from './hooks/useAutoYouTubeAssistant';

export function App() {
  useAutoYouTubeAssistant();
  const { t } = useTranslation();
  const ytPlayerRef = useRef<YouTubePlayerHandle>(null);
  const localPlayerRef = useRef<LocalVideoPlayerHandle>(null);
  const lastSaveTimeRef = useRef<number>(0);
  const lastCheckedClipboardId = useRef<string>('');

  // Local Media & Studio States
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [whisperProgress, setWhisperProgress] = useState<WhisperProgress | null>(null);
  const [isChoiceModalOpen, setIsChoiceModalOpen] = useState(false);

  const [pendingLocalFile, setPendingLocalFile] = useState<File | null>(null);
  const { activeWhisperTierName, isWhisperDownloaded, refreshStatus: refreshWhisperStatus } = useActiveWhisperTier();
  const [isYtWhisperModalOpen, setIsYtWhisperModalOpen] = useState(false);
  const [ytVideoTitle, setYtVideoTitle] = useState('');

  // UI States
  const [showWordHint, setShowWordHint] = useState(false);
  const [clipboardPrompt, setClipboardPrompt] = useState<{ id: string; rawText: string } | null>(null);
  const [isFloatingGuideOpen, setIsFloatingGuideOpen] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  // Zustand Global State Selectors
  const videoId = useAppStore(s => s.videoId); const setVideoId = useAppStore(s => s.setVideoId);
  const cues = useAppStore(s => s.cues); const setCues = useAppStore(s => s.setCues);
  const setCurrentTime = useAppStore(s => s.setCurrentTime);
  const loadingSubtitles = useAppStore(s => s.loadingSubtitles); const setLoadingSubtitles = useAppStore(s => s.setLoadingSubtitles);
  const savedStartTime = useAppStore(s => s.savedStartTime); const setSavedStartTime = useAppStore(s => s.setSavedStartTime);
  const externalPause = useAppStore(s => s.externalPause); const playbackRate = useAppStore(s => s.playbackRate);
  const isSearchOpen = useAppStore(s => s.isSearchOpen); const setIsSearchOpen = useAppStore(s => s.setIsSearchOpen);
  const isSettingsOpen = useAppStore(s => s.isSettingsOpen); const setIsSettingsOpen = useAppStore(s => s.setIsSettingsOpen);
  const isHistoryOpen = useAppStore(s => s.isHistoryOpen); const setIsHistoryOpen = useAppStore(s => s.setIsHistoryOpen);
  const isSubtitleSettingsOpen = useAppStore(s => s.isSubtitleSettingsOpen); const setIsSubtitleSettingsOpen = useAppStore(s => s.setIsSubtitleSettingsOpen);
  const isDownloadModalOpen = useAppStore(s => s.isDownloadModalOpen); const setIsDownloadModalOpen = useAppStore(s => s.setIsDownloadModalOpen);
  const apiKey = useAppStore(s => s.apiKey); const setApiKey = useAppStore(s => s.setApiKey);
  const sourceLang = useAppStore(s => s.sourceLang); const setSourceLang = useAppStore(s => s.setSourceLang);
  const targetLang = useAppStore(s => s.targetLang); const setTargetLang = useAppStore(s => s.setTargetLang);
  const setShowSubtitleBg = useAppStore(s => s.setShowSubtitleBg); const setSyncOffset = useAppStore(s => s.setSyncOffset);
  const lookupWordAction = useAppStore(s => s.lookupWordAction); const setActiveWordTranslation = useAppStore(s => s.setActiveWordTranslation);

  const hasActiveVideo = Boolean(videoId || videoUrl);

  // Return to Home Screen & Reset Active Playback
  const handleHomeClick = useCallback((clearPersisted = false) => {
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
      setVideoUrl('');
      setVideoFile(null);
    }
    setVideoId('');
    setCues([]);
    setYtVideoTitle('');
    setIsYtWhisperModalOpen(false);
    setActiveWordTranslation(null);
    if (clearPersisted) {
      setCompatItem(STORAGE_KEYS.VIDEO_ID.primary, STORAGE_KEYS.VIDEO_ID.legacy, '').catch(() => {});
    }
  }, [videoUrl, setVideoId, setCues, setActiveWordTranslation]);

  // Floating Subtitle Overlay Trigger
  const handleFloatingClick = async () => {
    try {
      const perms = await checkFloatingPermissions();
      if (!perms.overlay) {
        setIsFloatingGuideOpen(true);
      } else {
        await startFloatingOverlay(cues, videoId);
      }
    } catch {
      setIsFloatingGuideOpen(true);
    }
  };

  // Storage Initialization and Migration
  useEffect(() => {
    async function initStorage() {
      try {
        const prefs = await loadAppPreferences();
        if (prefs.apiKey) setApiKey(prefs.apiKey);
        if (prefs.videoId) setVideoId(prefs.videoId);
        if (prefs.sourceLang) setSourceLang(prefs.sourceLang);
        if (prefs.targetLang) setTargetLang(prefs.targetLang);
        else setTargetLang('tr');
        if (prefs.subtitleBg !== undefined) setShowSubtitleBg(prefs.subtitleBg);
        if (prefs.syncOffset !== undefined) setSyncOffset(prefs.syncOffset);
        if (typeof prefs.historyLimit === 'number') useAppStore.getState().setHistoryLimit(prefs.historyLimit);
        if (prefs.sourceColor) useAppStore.getState().setSourceTextColor(prefs.sourceColor);
        if (prefs.targetColor) useAppStore.getState().setTargetTextColor(prefs.targetColor);
        if (prefs.fontFamily) useAppStore.getState().setFontFamily(prefs.fontFamily);
        if (prefs.fontWeight) useAppStore.getState().setFontWeight(prefs.fontWeight);
        if (prefs.bgWidthMode === 'dynamic' || prefs.bgWidthMode === 'fixed') {
          useAppStore.getState().setBgWidthMode(prefs.bgWidthMode);
        }
        if (prefs.bgColor) useAppStore.getState().setBgColor(prefs.bgColor);
        if (typeof prefs.bgOpacity === 'number') useAppStore.getState().setBgOpacity(prefs.bgOpacity);
        if (prefs.textOutline === 'none' || prefs.textOutline === 'shadow' || prefs.textOutline === 'stroke') {
          useAppStore.getState().setTextOutline(prefs.textOutline);
        }
      } catch (e) { console.error('Failed to load state from DB', e); }
    }
    initStorage();
  }, [setVideoId, setApiKey, setSourceLang, setTargetLang, setShowSubtitleBg, setSyncOffset]);

  // Handle Loading a YouTube Video In-App
  const executeLoadYouTubeInApp = useCallback(async (extracted: string, initialTitle?: string) => {
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
      setVideoUrl('');
      setVideoFile(null);
    }

    const currentVideoId = useAppStore.getState().videoId;
    if (extracted !== currentVideoId) {
      setCues([]);
      setVideoId(extracted);
      setActiveWordTranslation(null);
      setCompatItem(STORAGE_KEYS.VIDEO_ID.primary, STORAGE_KEYS.VIDEO_ID.legacy, extracted).catch(() => {});

      if (initialTitle) setYtVideoTitle(initialTitle);

      fetchYouTubeMetadata(extracted).then(async (meta) => {
        if (meta.title) setYtVideoTitle(meta.title);
        const hist = ((await getCompatItem<HistoryItem[]>(STORAGE_KEYS.HISTORY_LIST.primary, STORAGE_KEYS.HISTORY_LIST.legacy)) || []).filter(i => i.videoId !== extracted);
        hist.unshift({ videoId: extracted, title: meta.title || initialTitle, timestamp: Date.now() });
        setCompatItem(STORAGE_KEYS.HISTORY_LIST.primary, STORAGE_KEYS.HISTORY_LIST.legacy, hist.slice(0, useAppStore.getState().historyLimit || 20)).catch(() => {});
      }).catch(() => {});
    }
  }, [videoUrl, setVideoId, setCues, setActiveWordTranslation]);

  // YouTube Playback Flow Hook (Choice Modal: Stay in App vs YouTube Floating Overlay)
  const {
    pendingVideo: pendingYtVideo,
    isChoiceModalOpen: isYtPlaybackChoiceOpen,
    isPreparingSubtitles: isPreparingYtFloatingSubtitles,
    initiatePlaybackChoice: handleLoadYouTube,
    confirmStayInApp: handleConfirmStayInApp,
    confirmContinueOnYouTube: handleConfirmContinueOnYouTube,
    closeChoiceModal: handleCloseYtChoiceModal,
  } = useYouTubePlaybackFlow({
    cues,
    currentVideoId: videoId,
    apiKey,
    sourceLang,
    targetLang,
    onExecuteInApp: executeLoadYouTubeInApp,
    onOpenPermissionGuide: () => setIsFloatingGuideOpen(true),
    onSubtitlesLoaded: (loadedCues) => setCues(loadedCues),
  });

  // Centralized LIFO Android Hardware Back Button Handling
  useModalBackStack({
    isYtPlaybackChoiceOpen,
    onCloseYtPlaybackChoice: handleCloseYtChoiceModal,
    isChoiceModalOpen,
    onCloseChoiceModal: () => {
      setIsChoiceModalOpen(false);
      setPendingLocalFile(null);
    },
    isYtWhisperModalOpen,
    onCloseYtWhisperModal: () => setIsYtWhisperModalOpen(false),
    isFloatingGuideOpen,
    onCloseFloatingGuide: () => setIsFloatingGuideOpen(false),
    hasActiveMedia: Boolean(videoId || videoUrl),
    onHomeClick: handleHomeClick,
  });

  // Load saved watch position whenever videoId changes
  useEffect(() => {
    async function loadSavedTime() {
      if (!videoId) return;
      try {
        const time = await get<number>(`watch_history_${videoId}`);
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
    if (targetLang) set('target_lang', targetLang).catch(() => {});
  }, [sourceLang, targetLang]);

  // Handle Word & Idiom Lookup Events from SubtitleOverlay
  useEffect(() => {
    let lastWordTime = 0;
    let lastWordKey = '';
    const onWord = (e: any) => {
      const { word, isTargetWord, tokenId } = e.detail || {};
      const key = `${word}:${isTargetWord}:${tokenId}`;
      const now = Date.now();
      if (lastWordKey === key && now - lastWordTime < 100) return;
      lastWordKey = key;
      lastWordTime = now;
      lookupWordAction(word, isTargetWord, tokenId);
    };

    let lastIdiomTime = 0;
    let lastIdiomText = '';
    const onIdiom = (e: any) => {
      const text = e.detail || '';
      const now = Date.now();
      if (lastIdiomText === text && now - lastIdiomTime < 100) return;
      lastIdiomText = text;
      lastIdiomTime = now;
      lookupWordAction(text, false, 'idiom-selection');
    };

    window.addEventListener('lexiduo-word-lookup', onWord);
    window.addEventListener('yt-ceviri-word-lookup', onWord);
    window.addEventListener('lexiduo-idiom-lookup', onIdiom);
    window.addEventListener('yt-ceviri-idiom-lookup', onIdiom);
    return () => {
      window.removeEventListener('lexiduo-word-lookup', onWord);
      window.removeEventListener('yt-ceviri-word-lookup', onWord);
      window.removeEventListener('lexiduo-idiom-lookup', onIdiom);
      window.removeEventListener('yt-ceviri-idiom-lookup', onIdiom);
    };
  }, [lookupWordAction]);

  const activeRequestRef = useRef<string>('');

  // Fetch YouTube Subtitles whenever videoId or apiKey changes
  useEffect(() => {
    let isMounted = true;
    const currentRequest = `${videoId}_${sourceLang}_${targetLang}`;
    activeRequestRef.current = currentRequest;
    
    if (!videoId) {
      return;
    }
    
    setCues([]);
    setLoadingSubtitles(true);

    // 12-second official subtitle waiting tolerance timer (gives 10s fetch buffer room)
    const toleranceTimer = setTimeout(() => {
      if (isMounted && activeRequestRef.current === currentRequest) {
        if (useAppStore.getState().cues.length === 0) {
          refreshWhisperStatus();
          setIsYtWhisperModalOpen(true);
        }
      }
    }, 12000);

    async function loadSubs() {
      try {
        const result = await fetchVideoSubtitles(videoId, sourceLang, targetLang, apiKey, (fastCues) => {
          if (isMounted && activeRequestRef.current === currentRequest) {
            clearTimeout(toleranceTimer);
            setCues(fastCues);
            setIsYtWhisperModalOpen(false);
            setLoadingSubtitles(false);
          }
        });
        if (isMounted && activeRequestRef.current === currentRequest && result.cues.length > 0) {
          clearTimeout(toleranceTimer);
          setCues(result.cues);
          setIsYtWhisperModalOpen(false);
        }
      } catch (err) {
        console.error('Subtitles load error:', err);
      } finally {
        if (isMounted && activeRequestRef.current === currentRequest) setLoadingSubtitles(false);
      }
    }
    loadSubs();

    return () => {
      isMounted = false;
      clearTimeout(toleranceTimer);
    };
  }, [videoId, apiKey, sourceLang, targetLang, retryCount, setCues, setLoadingSubtitles, refreshWhisperStatus]);

  // Subtitle retry handler
  const handleRetrySubtitles = useCallback(() => {
    setRetryCount(c => c + 1);
  }, []);

  useEffect(() => {
    let lastRetryTime = 0;
    const onRetry = () => {
      const now = Date.now();
      if (now - lastRetryTime < 500) return;
      lastRetryTime = now;
      handleRetrySubtitles();
    };
    window.addEventListener('lexiduo-retry-subtitles', onRetry);
    window.addEventListener('yt-ceviri-retry-subtitles', onRetry);
    return () => {
      window.removeEventListener('lexiduo-retry-subtitles', onRetry);
      window.removeEventListener('yt-ceviri-retry-subtitles', onRetry);
    };
  }, [handleRetrySubtitles]);


  // Update Local Videos Cache & History
  const updateLocalHistory = useCallback(async (name: string, size: number, cueCount?: number) => {
    const list = ((await getCompatItem<any[]>(STORAGE_KEYS.LOCAL_HISTORY.primary, STORAGE_KEYS.LOCAL_HISTORY.legacy)) || []).filter(i => !(i.name === name && i.size === size));
    list.unshift({ id: `${name}_${size}`, name, size, timestamp: Date.now(), cueCount });
    setCompatItem(STORAGE_KEYS.LOCAL_HISTORY.primary, STORAGE_KEYS.LOCAL_HISTORY.legacy, list.slice(0, useAppStore.getState().historyLimit || 20)).catch(() => {});
  }, []);

  // Handle Selecting a Local File (Choice between On-device Whisper AI or Cloud Gemini API)
  const handleSelectLocalFile = async (file: File) => {
    setVideoId('');
    setCompatItem(STORAGE_KEYS.VIDEO_ID.primary, STORAGE_KEYS.VIDEO_ID.legacy, '').catch(() => {});

    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
    }

    setVideoFile(file);

    const cacheKey = `lexiduo_local_cues_${file.name}_${file.size}_${targetLang}`;
    const legacyCacheKey = `yt_local_cues_${file.name}_${file.size}_${targetLang}`;
    const oldestCacheKey = `yt_local_cues_${file.name}_${file.size}`;
    try {
      const cached = (await get<SubtitleCue[]>(cacheKey)) ||
                     (await get<SubtitleCue[]>(legacyCacheKey)) ||
                     (await get<SubtitleCue[]>(oldestCacheKey));
      if (cached && Array.isArray(cached) && cached.length > 0) {
        setCues(cached);
        const url = (file as any)?.uri && isNativeWhisperAvailable()
          ? Capacitor.convertFileSrc((file as any).uri)
          : URL.createObjectURL(file);
        setVideoUrl(url);
        setIsProcessing(false);
        setProgressPercent(100);
        setStatusText(t('loadedFromCache'));
        await updateLocalHistory(file.name, file.size, cached.length);
        return;
      }
    } catch (err) {
      console.warn('Failed to read cached cues:', err);
    }

    if (apiKey && apiKey.trim().length > 10) {
      executeLocalProcessing(file, 'gemini');
      return;
    }

    setPendingLocalFile(file);
    setIsChoiceModalOpen(true);
  };

  const executeLocalProcessing = async (file: File, engine: 'whisper' | 'gemini', customApiKey?: string) => {
    setIsProcessing(true);
    const effectiveKey = customApiKey || apiKey;
    if (customApiKey && customApiKey.trim() && customApiKey.trim() !== apiKey) {
      setApiKey(customApiKey.trim());
      persistApiKey(customApiKey.trim()).catch(() => {});
    }

    const cacheKey = `yt_local_cues_${file.name}_${file.size}_${targetLang}`;
    setStatusText(engine === 'gemini' ? t('transcribingGemini') : `${activeWhisperTierName} ${t('transcribingWhisper')}`);
    setProgressPercent(5);
    setWhisperProgress({ stage: 'extracting', progress: 5, detail: t('extractingAudio') });

    await withBackgroundTask(`local_video_${file.name}`, file.name, async (updateBg) => {
      try {
        const effectiveSourceLang = sourceLang || 'auto';
        const extractedCues = await transcribeVideoOffline(file, {
          sourceLang: effectiveSourceLang,
          targetLang,
          apiKey: effectiveKey,
          forceEngine: engine,
          t,
          onProgress: (w) => {
            setWhisperProgress(w);
            setProgressPercent(w.progress);
            if (w.detail) {
              setStatusText(w.detail);
              updateBg(w.detail, w.progress);
            }
          }
        });

        setCues(extractedCues);
        await set(cacheKey, extractedCues).catch(() => {});
        await updateLocalHistory(file.name, file.size, extractedCues.length);

        const url = (file as any)?.uri && isNativeWhisperAvailable()
          ? Capacitor.convertFileSrc((file as any).uri)
          : URL.createObjectURL(file);
        setVideoUrl(url);
        setProgressPercent(100);
        setStatusText(t('processingComplete'));
        updateBg(t('processingComplete'), 100);
      } catch (err) {
        console.error('Local video transcription failed:', err);
        alert(`${t('processingVideoError')} ${String(err)}`);
      } finally {
        setIsProcessing(false);
        setWhisperProgress(null);
      }
    });
  };

  const handleExecuteYouTubeAudio = async (engine: 'whisper' | 'gemini' = 'whisper', customApiKey?: string) => {
    if (!videoId) return;
    setIsYtWhisperModalOpen(false);
    setLoadingSubtitles(false);
    setIsProcessing(true);
    const effectiveKey = customApiKey || apiKey;
    if (customApiKey && customApiKey.trim() && customApiKey.trim() !== apiKey) {
      setApiKey(customApiKey.trim());
      persistApiKey(customApiKey.trim()).catch(() => {});
    }
    setStatusText(t('downloadingYoutubeAudio'));
    setProgressPercent(5);
    setWhisperProgress({ stage: 'extracting', progress: 5, detail: t('downloadingYoutubeAudio') });

    try {
      const extractedCues = await processYouTubeWhisper({
        videoId,
        sourceLang: sourceLang || 'auto',
        targetLang,
        apiKey: effectiveKey,
        forceEngine: engine,
        activeWhisperTierName,
        t,
        onProgress: (status, percent, details) => {
          setStatusText(status);
          setProgressPercent(percent);
          if (details) setWhisperProgress(details);
        }
      });

      if (extractedCues.length > 0) {
        setCues(extractedCues);
      }
    } catch (err) {
      console.error('YouTube audio transcription failed:', err);
      alert(`${t('audioStreamFailed')}: ${String(err)}`);
    } finally {
      setIsProcessing(false);
      setWhisperProgress(null);
    }
  };

  // Listen for Shared Links & Media Files (Android SendIntent)
  const handleSelectLocalFileRef = useRef(handleSelectLocalFile);
  handleSelectLocalFileRef.current = handleSelectLocalFile;

  useEffect(() => {
    let cleanupFn: (() => void) | null = null;

    listenToSharedLinks(async (rawText) => {
      const extracted = extractYouTubeId(rawText);
      if (extracted && extracted !== useAppStore.getState().videoId) {
        handleLoadYouTube(rawText);
      } else if (rawText.startsWith('content://') || rawText.startsWith('file://')) {
        const file = await uriToFile(rawText);
        if (file) {
          (file as any).uri = rawText;
          (file as any).path = rawText;
          handleSelectLocalFileRef.current(file);
        }
      }
    }).then((cleanup) => {
      cleanupFn = cleanup;
    });

    return () => {
      if (cleanupFn) cleanupFn();
    };
  }, [handleLoadYouTube]);

  // Smart Clipboard Detection
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
      } catch {}
    };

    checkClipboardForVideo();

    let appStateHandle: any = null;
    try {
      CapApp.addListener('appStateChange', (state) => {
        if (state.isActive) checkClipboardForVideo();
      }).then((handle) => {
        appStateHandle = handle;
      });
    } catch {}

    return () => {
      if (appStateHandle && appStateHandle.remove) appStateHandle.remove();
    };
  }, []);

  // Save API Key
  const handleSaveApiKey = (k: string) => { setApiKey(k); persistApiKey(k).catch(() => {}); };

  return (
    <div className="min-h-[100dvh] h-[100dvh] w-full overflow-hidden mesh-bg text-slate-100 flex flex-col justify-between selection:bg-red-500 selection:text-white relative font-sans">
      <TopSearchOverlay 
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onLoadVideo={handleLoadYouTube}
      />
      
      <HistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        onLoadVideo={handleLoadYouTube}
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
              <span className="text-[11px] text-slate-400 font-mono truncate">{clipboardPrompt.id}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => { const text = clipboardPrompt.rawText; setClipboardPrompt(null); handleLoadYouTube(text); }}
              className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 active:scale-95 text-white text-xs font-medium transition-all shadow-md shadow-red-600/30 cursor-pointer"
            >
              {t('openFromClipboard')}
            </button>
            <button
              onClick={() => setClipboardPrompt(null)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
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

      {/* Main Screen Content */}
      <main className="flex-1 w-full h-full max-w-7xl mx-auto overflow-hidden flex flex-col justify-start md:justify-center px-0 md:px-6 lg:px-8 pt-safe md:pt-14 lg:pt-16 pb-0 md:pb-24">
        {!hasActiveVideo ? (
          <div className="flex-1 w-full overflow-y-auto custom-scrollbar flex flex-col items-center justify-start pb-28">
            <StudioHero 
              onLoadYouTube={handleLoadYouTube}
              onSelectLocalFile={handleSelectLocalFile}
              isProcessingLocal={isProcessing}
              whisperProgress={whisperProgress}
              statusText={statusText}
              progressPercent={progressPercent}
              onOpenPermissionGuide={() => setIsFloatingGuideOpen(true)}
            />
          </div>
        ) : (
          <div className="w-full h-full flex flex-col md:grid md:grid-cols-12 md:gap-6 md:items-center overflow-hidden">
            {/* Player Container */}
            <div className="w-full shrink-0 md:shrink md:col-span-7 lg:col-span-8 md:w-full landscape:fixed landscape:inset-0 landscape:z-30 landscape:md:static landscape:md:z-auto">
              <div className="w-full aspect-video rounded-none md:rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)] bg-slate-900/50 backdrop-blur-xl border-b md:border border-white/10 flex items-center justify-center relative">
                {/* Mode 1: YouTube Player */}
                {videoId && (
                  <YouTubePlayer
                    ref={ytPlayerRef}
                    videoId={videoId}
                    initialStartTime={savedStartTime}
                    onDismiss={handleHomeClick}
                    onTimeUpdate={(t: number) => {
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
                    onVideoTitle={(title: string) => {
                      setYtVideoTitle(title);
                      cacheVideoTitle(videoId, title);
                      get<HistoryItem[]>('yt_ceviri_history_list').then(list => {
                        if (list) {
                          const updated = list.map(i => i.videoId === videoId && (!i.title || i.title.startsWith('Video (')) ? { ...i, title } : i);
                          set('yt_ceviri_history_list', updated).catch(() => {});
                        }
                      }).catch(() => {});
                    }}
                  >
                    {loadingSubtitles && cues.length === 0 ? (
                      <div className="pointer-events-auto flex items-center space-x-2 bg-slate-900/90 backdrop-blur-md px-5 py-3 rounded-2xl border border-white/10 shadow-2xl animate-pulse">
                        <RefreshCw className="w-4 h-4 text-red-500 animate-spin" />
                        <span className="text-xs font-semibold text-slate-300">
                          {t('searchingOfficialSubtitles') || t('loading')}
                        </span>
                      </div>
                    ) : cues.length === 0 ? (
                      <div className="pointer-events-auto flex flex-col items-center justify-center p-6 bg-slate-900/90 backdrop-blur-md rounded-2xl border border-white/10 shadow-2xl space-y-3">
                        <p className="text-slate-300 text-sm font-semibold">{t('noSubtitlesFound') || t('noSubtitles')}</p>
                        <button
                          onClick={() => { refreshWhisperStatus(); setIsYtWhisperModalOpen(true); }}
                          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold shadow-lg shadow-red-600/30 transition cursor-pointer active:scale-95"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-white animate-pulse" />
                          <span>{t('transcribeYoutubeWhisper')}</span>
                        </button>
                      </div>
                    ) : (
                      <SubtitleOverlay />
                    )}
                  </YouTubePlayer>
                )}

                {/* Mode 2: Local Video Player */}
                {videoUrl && (
                  <LocalVideoPlayer
                    ref={localPlayerRef}
                    videoUrl={videoUrl}
                    onDismiss={handleHomeClick}
                  >
                    {videoFile && (
                      <div className="absolute top-3 left-4 z-20 pointer-events-none px-3 py-1 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 text-xs text-slate-300 font-mono truncate max-w-[260px]">
                        {videoFile.name}
                      </div>
                    )}
                    <SubtitleOverlay />
                  </LocalVideoPlayer>
                )}
              </div>
            </div>

            {/* Tablet & Desktop Split-View: Interactive Transcript */}
            <div className="hidden md:flex md:col-span-5 lg:col-span-4 h-[65vh] lg:h-[70vh] bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-3xl p-4 overflow-hidden shadow-2xl flex-col">
              <InteractiveTranscriptPanel 
                onSeek={(time) => {
                  if (videoId) ytPlayerRef.current?.seekTo(time);
                  else if (videoUrl) localPlayerRef.current?.seekTo(time);
                }}
                onRetry={handleRetrySubtitles}
              />
            </div>

            {/* Mobile Vertical Subtitle Panel */}
            <div className="flex-1 md:hidden w-full overflow-y-auto px-4 py-4 pb-28 space-y-3 landscape:hidden">
              <InteractiveTranscriptPanel 
                onSeek={(time) => {
                  if (videoId) ytPlayerRef.current?.seekTo(time);
                  else if (videoUrl) localPlayerRef.current?.seekTo(time);
                }}
                onRetry={handleRetrySubtitles}
              />
            </div>
          </div>
        )}
      </main>

      {/* Global Interactive Word Drawer */}
      <WordDrawer />

      {/* Bottom Floating Control Dock */}
      <FloatingDock 
        onSearchToggle={() => setIsSearchOpen(true)}
        onSettingsOpen={() => setIsSettingsOpen(true)}
        onHomeClick={handleHomeClick}
        showHome={hasActiveVideo}
        showDownload={hasActiveVideo}
        onFloatingClick={videoId && cues.length > 0 ? handleFloatingClick : undefined}
        onDownloadClick={() => setIsDownloadModalOpen(true)}
        onSubtitleSettingsClick={() => setIsSubtitleSettingsOpen(true)}
      />

      {/* Unified Modals & Overlays */}
      <AppModals
        isSettingsOpen={isSettingsOpen} setIsSettingsOpen={setIsSettingsOpen}
        apiKey={apiKey} onSaveApiKey={handleSaveApiKey}
        isSubtitleSettingsOpen={isSubtitleSettingsOpen} setIsSubtitleSettingsOpen={setIsSubtitleSettingsOpen}
        isDownloadModalOpen={isDownloadModalOpen} setIsDownloadModalOpen={setIsDownloadModalOpen}
        videoId={videoId} ytVideoTitle={ytVideoTitle} videoFile={videoFile} cues={cues}
        sourceLang={sourceLang} targetLang={targetLang}
        activeWhisperTierName={activeWhisperTierName} isWhisperDownloaded={isWhisperDownloaded} refreshWhisperStatus={refreshWhisperStatus}
        isYtWhisperModalOpen={isYtWhisperModalOpen} setIsYtWhisperModalOpen={setIsYtWhisperModalOpen} onExecuteYouTubeAudio={handleExecuteYouTubeAudio}
        pendingLocalFile={pendingLocalFile} setPendingLocalFile={setPendingLocalFile}
        isChoiceModalOpen={isChoiceModalOpen} setIsChoiceModalOpen={setIsChoiceModalOpen} onExecuteLocalProcessing={executeLocalProcessing}
        isFloatingGuideOpen={isFloatingGuideOpen} setIsFloatingGuideOpen={setIsFloatingGuideOpen}
        isYtPlaybackChoiceOpen={isYtPlaybackChoiceOpen} pendingYtVideo={pendingYtVideo} isPreparingYtFloatingSubtitles={isPreparingYtFloatingSubtitles}
        onConfirmStayInApp={handleConfirmStayInApp} onConfirmContinueOnYouTube={handleConfirmContinueOnYouTube} onCloseYtChoiceModal={handleCloseYtChoiceModal}
        isProcessing={isProcessing} whisperProgress={whisperProgress} statusText={statusText} progressPercent={progressPercent}
      />
    </div>
  );
}

export default App;
