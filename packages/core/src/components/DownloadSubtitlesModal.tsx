import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  Download, 
  X, 
  AlertTriangle, 
  Sparkles, 
  Layers, 
  Film, 
  Cpu, 
  Loader2,
  FileText
} from 'lucide-react';
import { useTranslation } from '../i18n/useTranslation';
import { SUPPORTED_LANGUAGES, getLanguageDisplayName } from '../i18n/languages';
import { DownloadLanguagePicker } from './download-subtitles/DownloadLanguagePicker';
import { useAppStore } from '../store/useAppStore';
import type { 
  VideoDownloadResolution, 
  VideoDownloadContainer, 
  VideoDownloadProgress 
} from '../types';
import { exportVideoWithSoftSubtitles } from '../services/videoRemuxService';
import { fetchVideoSubtitles } from '../services/transcriptService';
import { 
  cuesToSrt, 
  cuesToVtt, 
  batchTranslateCues, 
  resolveCuesForLanguage,
  filterLangsNeedingTranslation,
  downloadSubtitleFile
} from '../services/subtitleExportService';
import { STORAGE_KEYS, getCompatItem, setCompatItem } from '../services/storageKeys';
import { DownloadSuccessModal } from './DownloadSuccessModal';

export interface DownloadSubtitlesModalProps {
  isOpen: boolean;
  onClose: () => void;
  videoTitle?: string;
  videoFile?: File | null;
}

export const DownloadSubtitlesModal: React.FC<DownloadSubtitlesModalProps> = ({
  isOpen,
  onClose,
  videoTitle,
  videoFile,
}) => {
  const { t, language } = useTranslation();
  const videoId = useAppStore(s => s.videoId);
  const cues = useAppStore(s => s.cues);
  const sourceLang = useAppStore(s => s.sourceLang);
  const targetLang = useAppStore(s => s.targetLang);
  const detectedSourceLang = useAppStore(s => s.detectedSourceLang);
  const apiKey = useAppStore(s => s.apiKey);

  const getEffectiveSource = () => {
    const curSource = useAppStore.getState().sourceLang || sourceLang;
    const curDetected = useAppStore.getState().detectedSourceLang || detectedSourceLang;
    return (curSource && curSource !== 'auto') ? curSource : (curDetected || 'auto');
  };

  const [downloadType, setDownloadType] = useState<'subtitles' | 'video'>('subtitles');
  const [subFormat, setSubFormat] = useState<'srt' | 'vtt'>('srt');
  const [resolution, setResolution] = useState<VideoDownloadResolution>('720p');
  const [container, setContainer] = useState<VideoDownloadContainer>('mp4');
  const [selectedLangs, setSelectedLangs] = useState<string[]>([targetLang || 'tr']);
  const [engine, setEngine] = useState<'whisper' | 'gemini' | 'google'>('google');
  const [langSearch, setLangSearch] = useState('');

  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState<VideoDownloadProgress | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showFallbackAction, setShowFallbackAction] = useState(false);
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  const [completedFileName, setCompletedFileName] = useState('');
  const abortControllerRef = useRef<AbortController | null>(null);
  const prevIsOpenRef = useRef(false);

  const isLocalVideo = Boolean(videoFile);

  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      setSelectedLangs([targetLang || 'tr']);
      setIsSuccessModalOpen(false);
      setCompletedFileName('');
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, targetLang]);

  const toggleLanguage = (code: string) => {
    if (selectedLangs.includes(code)) {
      setSelectedLangs(selectedLangs.filter(c => c !== code));
    } else {
      if (selectedLangs.length < 5) {
        setSelectedLangs([...selectedLangs, code]);
      }
    }
  };

  const filteredLanguages = useMemo(() => {
    const list = SUPPORTED_LANGUAGES.map(l => ({
      ...l,
      displayName: getLanguageDisplayName(l.code, language)
    }));
    if (!langSearch.trim()) return list;
    const q = langSearch.toLowerCase();
    return list.filter(
      l =>
        l.name.toLowerCase().includes(q) ||
        l.nativeName.toLowerCase().includes(q) ||
        l.displayName.toLowerCase().includes(q) ||
        l.code.toLowerCase().includes(q)
    );
  }, [langSearch, language]);

  const handleCancelDownload = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsDownloading(false);
    setProgress(null);
  };

  const handleDownloadCompleted = async (fileName: string) => {
    setProgress({ stage: 'completed', percent: 100, detail: t('downloadCompleted') });
    setCompletedFileName(fileName);
    try {
      const hideNotice = await getCompatItem<boolean>(
        STORAGE_KEYS.HIDE_DOWNLOAD_LOCATION_NOTICE.primary,
        STORAGE_KEYS.HIDE_DOWNLOAD_LOCATION_NOTICE.legacy
      );
      if (hideNotice) {
        setTimeout(() => {
          setIsDownloading(false);
          onClose();
        }, 1200);
      } else {
        setIsDownloading(false);
        setIsSuccessModalOpen(true);
      }
    } catch {
      setTimeout(() => {
        setIsDownloading(false);
        onClose();
      }, 1200);
    }
  };

  const handleDontShowAgain = async () => {
    await setCompatItem(
      STORAGE_KEYS.HIDE_DOWNLOAD_LOCATION_NOTICE.primary,
      STORAGE_KEYS.HIDE_DOWNLOAD_LOCATION_NOTICE.legacy,
      true
    );
    setIsSuccessModalOpen(false);
    onClose();
  };

  const handleCloseSuccessModal = () => {
    setIsSuccessModalOpen(false);
    onClose();
  };

  const prepareEffectiveCues = async () => {
    let effectiveCues = cues;
    const effSource = getEffectiveSource();
    if ((!effectiveCues || effectiveCues.length === 0) && !isLocalVideo && videoId) {
      setProgress({ stage: 'preparing', percent: 8, detail: t('preparingSubtitles') });
      try {
        const fetched = await fetchVideoSubtitles(
          videoId,
          effSource,
          selectedLangs[0] || targetLang || 'tr',
          apiKey
        );
        if (fetched?.cues && fetched.cues.length > 0) {
          effectiveCues = fetched.cues;
        }
      } catch (fetchErr) {
        console.warn('Auto-fetching cues for export notice:', fetchErr);
      }
    }
    return effectiveCues;
  };

  const handleDownloadSubtitlesOnly = async (forcedFormat?: 'srt' | 'vtt') => {
    if (selectedLangs.length === 0) return;
    setIsDownloading(true);
    setErrorMsg(null);
    setShowFallbackAction(false);
    setProgress({ stage: 'preparing', percent: 10, detail: t('preparingSubtitles') });

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const effectiveCues = await prepareEffectiveCues();
      if (!effectiveCues || effectiveCues.length === 0) {
        throw new Error(t('downloadError'));
      }

      const activeFormat = forcedFormat || subFormat;
      const effSource = getEffectiveSource();
      const currentTarget = (useAppStore.getState().targetLang || targetLang || '').replace(/^a\./, '').split('-')[0].toLowerCase();
      const hasExistingTarget = effectiveCues.some(c => 
        Boolean(c.targetText && c.targetText.trim().length > 0 && c.targetText.trim() !== c.sourceText.trim())
      );
      const langsToTranslate = filterLangsNeedingTranslation(selectedLangs, effectiveCues, effSource, currentTarget);

      let transMap = new Map<string, typeof effectiveCues>();
      if (langsToTranslate.length > 0) {
        setProgress({ stage: 'translating', percent: 30, detail: t('translating') });
        transMap = await batchTranslateCues(
          effectiveCues,
          effSource,
          langsToTranslate,
          engine === 'whisper' ? 'google' : engine,
          apiKey,
          (pct, cur) => setProgress({ stage: 'translating', percent: 30 + Math.round(pct * 0.5), detail: `${t('translating')} ${cur}...` }),
          controller.signal
        );
      }

      if (controller.signal.aborted) {
        setIsDownloading(false);
        setProgress(null);
        return;
      }

      const baseName = (videoTitle || videoFile?.name || 'video').replace(/[/\\?%*:|"<>]/g, '_').trim();
      
      for (let i = 0; i < selectedLangs.length; i++) {
        if (controller.signal.aborted) return;
        const lang = selectedLangs[i];
        if (i > 0) {
          await new Promise(r => setTimeout(r, 250));
        }
        if (controller.signal.aborted) return;

        const cleanLang = lang.replace(/^a\./, '').split('-')[0].toLowerCase();
        const langCues = resolveCuesForLanguage(
          lang,
          effectiveCues,
          effSource,
          currentTarget,
          hasExistingTarget,
          transMap
        );
        const textContent = activeFormat === 'vtt' 
          ? cuesToVtt(langCues, 'target') 
          : cuesToSrt(langCues, 'target');
        const fileName = `${baseName}_[${cleanLang}].${activeFormat}`;
        await downloadSubtitleFile(textContent, fileName);
      }

      const summaryFileName = selectedLangs.length > 1 
        ? `${baseName}_(${selectedLangs.length}_langs).${activeFormat}` 
        : `${baseName}_[${selectedLangs[0] || 'sub'}].${activeFormat}`;
      await handleDownloadCompleted(summaryFileName);
    } catch (err: any) {
      if (err?.name === 'AbortError' || controller.signal.aborted) {
        setIsDownloading(false);
        setProgress(null);
        return;
      }
      console.error('Subtitle download failed:', err);
      setErrorMsg(t('downloadError'));
      setIsDownloading(false);
    }
  };

  const handleStartVideoDownload = async () => {
    if (selectedLangs.length === 0) return;
    setIsDownloading(true);
    setErrorMsg(null);
    setShowFallbackAction(false);
    setProgress({ stage: 'preparing', percent: 5, detail: t('preparingSubtitles') });

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const effectiveCues = await prepareEffectiveCues();
      if (!effectiveCues || effectiveCues.length === 0) {
        throw new Error(t('downloadError'));
      }

      const effSource = getEffectiveSource();
      const currentTarget = (useAppStore.getState().targetLang || targetLang || '').replace(/^a\./, '').split('-')[0].toLowerCase();
      const hasExistingTarget = effectiveCues.some(c => 
        Boolean(c.targetText && c.targetText.trim().length > 0 && c.targetText.trim() !== c.sourceText.trim())
      );
      const langsToTranslate = filterLangsNeedingTranslation(selectedLangs, effectiveCues, effSource, currentTarget);

      let transMap = new Map<string, typeof effectiveCues>();
      if (langsToTranslate.length > 0) {
        setProgress({ stage: 'translating', percent: 15, detail: t('translating') });
        transMap = await batchTranslateCues(
          effectiveCues,
          effSource,
          langsToTranslate,
          engine === 'whisper' ? 'google' : engine,
          apiKey,
          (pct, cur) => setProgress({
            stage: 'translating',
            percent: 15 + Math.round(pct * 0.25),
            detail: `${t('translating')} ${cur}...`
          }),
          controller.signal
        );
      }

      if (controller.signal.aborted) {
        setIsDownloading(false);
        setProgress(null);
        return;
      }

      const customTracks = selectedLangs.map(lang => {
        const cleanLang = lang.replace(/^a\./, '').split('-')[0].toLowerCase();
        const langCues = resolveCuesForLanguage(
          lang,
          effectiveCues,
          effSource,
          currentTarget,
          hasExistingTarget,
          transMap
        );
        const langObj = SUPPORTED_LANGUAGES.find(l => l.code === cleanLang || l.code === lang);
        const langName = langObj ? getLanguageDisplayName(langObj.code, language) : cleanLang.toUpperCase();
        return {
          language: cleanLang,
          title: `${langName} Subtitles`,
          cues: langCues,
          mode: 'target' as const
        };
      });

      await exportVideoWithSoftSubtitles({
        videoId: isLocalVideo ? undefined : videoId,
        videoFile: isLocalVideo ? videoFile : undefined,
        videoTitle: videoTitle || 'video',
        resolution,
        container,
        targetLanguages: selectedLangs,
        sourceLang: effSource,
        engine,
        apiKey,
        initialCues: effectiveCues,
        customTracks,
        subtitleMode: 'target',
        onProgress: (p) => setProgress(p),
        signal: controller.signal,
      });

      const baseTitle = (videoTitle || videoFile?.name || videoId || 'video').replace(/[/\\?%*:|"<>]/g, '_').trim();
      const videoFileName = `${baseTitle}_subtitled.${container}`;
      await handleDownloadCompleted(videoFileName);
    } catch (err: any) {
      if (err?.name === 'AbortError' || controller.signal.aborted) {
        setIsDownloading(false);
        setProgress(null);
        return;
      }
      console.error('Video download failed:', err);
      const raw = String(err?.message || err || '');
      let friendlyError = raw;
      const isNetworkOrCors = raw.toLowerCase().includes('failed to fetch') || 
                              raw.toLowerCase().includes('network') ||
                              raw.includes('VIDEO_STREAM_UNAVAILABLE');

      if (isNetworkOrCors) {
        friendlyError = `${t('apiKeyStatusNetworkError') || 'Network error'}: ${t('downloadError') || 'Download failed'}`;
        setShowFallbackAction(true);
      } else if (!friendlyError) {
        friendlyError = t('downloadError');
      }
      setErrorMsg(friendlyError);
      setIsDownloading(false);
    }
  };

  const handleStartDownload = () => {
    if (downloadType === 'subtitles') {
      handleDownloadSubtitlesOnly();
    } else {
      handleStartVideoDownload();
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div 
        className="w-full max-w-lg bg-slate-900 border border-white/10 rounded-3xl p-5 sm:p-6 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center text-white shadow-lg shadow-red-500/20">
              <Download size={20} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white tracking-wide">
                {t('downloadWithSubtitles')}
              </h2>
              <p className="text-xs text-slate-400 line-clamp-1">
                {videoTitle || t('downloadWithSubtitlesDesc')}
              </p>
            </div>
          </div>
          <button 
            type="button"
            onClick={() => {
              if (isDownloading) handleCancelDownload();
              onClose();
            }}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar py-4 space-y-5">
          {/* Download Type Switcher Tabs */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <Layers size={14} className="text-red-400" />
              {t('downloadTypeLabel')}
            </label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-black/40 rounded-2xl border border-white/5">
              <button
                type="button"
                onClick={() => { setDownloadType('subtitles'); setErrorMsg(null); setShowFallbackAction(false); }}
                className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
                  downloadType === 'subtitles'
                    ? 'bg-red-600 text-white shadow-md shadow-red-600/20'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <FileText size={14} />
                <span>{t('downloadTypeSubtitles')}</span>
              </button>
              <button
                type="button"
                onClick={() => { setDownloadType('video'); setErrorMsg(null); setShowFallbackAction(false); }}
                className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
                  downloadType === 'video'
                    ? 'bg-red-600 text-white shadow-md shadow-red-600/20'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Film size={14} />
                <span>{t('downloadTypeVideo')}</span>
              </button>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3.5 bg-red-500/10 border border-red-500/20 rounded-2xl space-y-2 text-xs text-red-300 animate-fade-in">
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} className="text-red-400 shrink-0" />
                <span>{errorMsg}</span>
              </div>
              {showFallbackAction && (
                <div className="pt-2 border-t border-red-500/20 space-y-2">
                  <p className="text-[11px] text-slate-300">
                    {t('videoStreamUnavailableDesc')}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleDownloadSubtitlesOnly('srt')}
                      className="px-3 py-1.5 rounded-xl bg-red-600/40 hover:bg-red-600/60 border border-red-500/40 text-white text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition shadow-md"
                    >
                      <Download size={12} />
                      <span>{t('downloadSubtitlesFallbackBtn')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadSubtitlesOnly('vtt')}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-slate-200 text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition"
                    >
                      <Download size={12} />
                      <span>{t('downloadSubtitlesVttBtn')}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Subtitles-Only Configuration */}
          {downloadType === 'subtitles' && (
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <FileText size={14} className="text-emerald-400" />
                {t('subtitleFileFormat')}
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSubFormat('srt')}
                  className={`py-2 px-3 rounded-2xl border text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
                    subFormat === 'srt'
                      ? 'bg-red-600 text-white border-red-500 shadow-md'
                      : 'bg-black/30 border-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  <span>SRT (SubRip)</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-normal">
                    {t('recommendedBadge')}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setSubFormat('vtt')}
                  className={`py-2 px-3 rounded-2xl border text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
                    subFormat === 'vtt'
                      ? 'bg-red-600 text-white border-red-500 shadow-md'
                      : 'bg-black/30 border-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  <span>VTT (WebVTT)</span>
                </button>
              </div>
            </div>
          )}

          {/* Video Download Configuration */}
          {downloadType === 'video' && (
            <>
              {/* 1. Container Selection */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <Film size={14} className="text-red-400" />
                    {t('containerFormat')}
                  </label>
                  <span className="text-[11px] text-emerald-400 font-medium">
                    {container === 'mp4' ? t('mp4Format') : 'MKV (Matroska)'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setContainer('mp4')}
                    className={`py-2.5 px-3 rounded-2xl border text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
                      container === 'mp4'
                        ? 'bg-red-600 text-white border-red-500 shadow-md shadow-red-600/20'
                        : 'bg-black/30 border-white/10 text-slate-400 hover:text-white'
                    }`}
                  >
                    <span>MP4</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-normal">
                      {t('recommendedBadge')}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setContainer('mkv')}
                    className={`py-2.5 px-3 rounded-2xl border text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
                      container === 'mkv'
                        ? 'bg-red-600 text-white border-red-500 shadow-md shadow-red-600/20'
                        : 'bg-black/30 border-white/10 text-slate-400 hover:text-white'
                    }`}
                  >
                    <span>MKV</span>
                  </button>
                </div>
                {container === 'mkv' && (
                  <p className="text-[11px] text-slate-400 px-1 animate-fade-in">
                    {t('mkvBestCompatibilityNote')}
                  </p>
                )}
              </div>

              {/* 2. Resolution Selection (Only for YouTube) */}
              {!isLocalVideo && (
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <Layers size={14} className="text-blue-400" />
                    {t('videoResolution')}
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['360p', '720p', '1080p'] as VideoDownloadResolution[]).map(res => (
                      <button
                        key={res}
                        type="button"
                        onClick={() => setResolution(res)}
                        className={`py-2 px-3 rounded-2xl border text-xs font-bold transition cursor-pointer ${
                          resolution === res
                            ? 'bg-red-600 text-white border-red-500 shadow-md'
                            : 'bg-black/30 border-white/10 text-slate-400 hover:text-white'
                        }`}
                      >
                        {res === '720p' ? '720p HD' : res === '1080p' ? '1080p FHD' : res}
                      </button>
                    ))}
                  </div>
                  {resolution === '1080p' && (
                    <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center gap-2 text-[11px] text-amber-300">
                      <AlertTriangle size={14} className="text-amber-400 shrink-0" />
                      <span>{t('resolution1080pNote')}</span>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Target Languages (All 35 Languages with Search & Display Names) */}
          <DownloadLanguagePicker
            selectedLangs={selectedLangs}
            toggleLanguage={toggleLanguage}
            langSearch={langSearch}
            setLangSearch={setLangSearch}
            filteredLanguages={filteredLanguages}
            language={language}
            t={t}
          />

          {/* Translation Engine */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <Cpu size={14} className="text-purple-400" />
              {t('translationEngine')}
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setEngine('google')}
                className={`py-2 px-2.5 rounded-2xl border text-xs font-bold flex flex-col items-center justify-center gap-1 transition cursor-pointer ${
                  engine === 'google'
                    ? 'bg-red-600 text-white border-red-500 shadow-md'
                    : 'bg-black/30 border-white/10 text-slate-400 hover:text-white'
                }`}
              >
                <span>Google</span>
                <span className="text-[10px] text-slate-300 font-normal">{t('apiKeyBadgeFree')}</span>
              </button>
              <button
                type="button"
                onClick={() => setEngine('gemini')}
                className={`py-2 px-2.5 rounded-2xl border text-xs font-bold flex flex-col items-center justify-center gap-1 transition cursor-pointer ${
                  engine === 'gemini'
                    ? 'bg-red-600 text-white border-red-500 shadow-md'
                    : 'bg-black/30 border-white/10 text-slate-400 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-1">
                  Gemini <Sparkles size={11} className="text-amber-400" />
                </span>
                <span className="text-[10px] text-slate-300 font-normal">AI API</span>
              </button>
            </div>
            {engine === 'gemini' && (!apiKey || apiKey.trim().length < 8) && (
              <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center gap-2 text-[11px] text-amber-300">
                <AlertTriangle size={13} className="text-amber-400 shrink-0" />
                <span>{t('apiKeyNote')}</span>
              </div>
            )}
          </div>
        </div>

        {/* Progress Display */}
        {isDownloading && progress && (
          <div className="pt-3 pb-2 space-y-2 border-t border-white/10 animate-fade-in">
            <div className="flex justify-between text-xs font-semibold text-slate-300">
              <span className="flex items-center gap-2">
                <Loader2 size={14} className="text-red-500 animate-spin" />
                {progress.detail || (downloadType === 'subtitles' ? t('preparingSubtitles') : t('muxingVideo'))}
              </span>
              <span className="font-mono text-red-400">{progress.percent}%</span>
            </div>
            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-red-500 to-rose-600 transition-all duration-300 rounded-full"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
          </div>
        )}

        {/* Footer Action */}
        <div className="pt-3 border-t border-white/10 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={isDownloading ? handleCancelDownload : onClose}
            className="px-4 py-2.5 rounded-2xl border border-white/10 text-slate-400 hover:text-white hover:bg-white/5 text-xs font-bold transition cursor-pointer"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            disabled={isDownloading || selectedLangs.length === 0}
            onClick={handleStartDownload}
            className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white text-xs font-bold shadow-lg shadow-red-600/30 flex items-center gap-2 transition disabled:opacity-50 cursor-pointer"
          >
            {isDownloading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                <span>{t('translating')}...</span>
              </>
            ) : (
              <>
                <Download size={14} />
                <span>
                  {downloadType === 'subtitles' 
                    ? t('downloadSubtitlesOnlyBtn') 
                    : t('startDownloadBtn')}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>

    <DownloadSuccessModal
      isOpen={isSuccessModalOpen}
      onClose={handleCloseSuccessModal}
      fileName={completedFileName}
      onDontShowAgain={handleDontShowAgain}
    />
  </>
);
};
