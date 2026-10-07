import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Search, 
  Play, 
  Clipboard as ClipboardIcon, 
  Sparkles, 
  Clock, 
  Upload, 
  Cpu, 
  Film, 
  FileVideo, 
  ShieldCheck, 
  HardDrive,
  LayoutGrid,
  List,
  Trash2,
  Languages,
  CheckCircle2,
  Download,
  ChevronRight
} from 'lucide-react';
import { get, set } from 'idb-keyval';
import { Clipboard } from '@capacitor/clipboard';
import { 
  useTranslation, 
  useAppStore, 
  enrichHistoryItems, 
  type HistoryItem,
  type TranslationKey,
  CustomSelect,
  type SelectOption,
  SUPPORTED_LANGUAGES,
  HistoryLimitPicker
} from '@ytceviri/core';
import { 
  getActiveWhisperTier, 
  getWhisperTierStatus, 
  WHISPER_TIERS, 
  type WhisperTierKey, 
  WHISPER_TIER_CHANGED_EVENT 
} from '../services/offlineTranslationEngine';
import { isNativeWhisperAvailable, pickNativeVideo } from '../services/nativeWhisperBridge';
import { WhisperModelsModal } from './WhisperModelsModal';
import { WhisperProcessingCard } from './WhisperProcessingCard';
import { AutoYouTubeAssistantCard } from './AutoYouTubeAssistantCard';
import type { WhisperProgress } from '../services/whisperEngine';

export interface LocalHistoryItem {
  id: string;
  name: string;
  size: number;
  lastModified?: number;
  timestamp: number;
  cueCount?: number;
}

interface StudioHeroProps {
  onLoadYouTube: (urlOrId: string) => void;
  onSelectLocalFile: (file: File) => void;
  isProcessingLocal?: boolean;
  whisperProgress?: WhisperProgress | null;
  statusText?: string;
  progressPercent?: number;
  onOpenPermissionGuide?: () => void;
}


interface SampleVideo {
  videoId: string;
  titleKey: TranslationKey;
  categoryKey: TranslationKey;
  thumbnail: string;
}

const SAMPLE_VIDEOS: SampleVideo[] = [
  {
    videoId: 'UF8uR6Z6KLc',
    titleKey: 'sampleVideoJobs',
    categoryKey: 'sampleCategoryInspiration',
    thumbnail: 'https://img.youtube.com/vi/UF8uR6Z6KLc/mqdefault.jpg'
  },
  {
    videoId: 'JyECrGp-Sw8',
    titleKey: 'sampleVideoKurzgesagt',
    categoryKey: 'sampleCategoryScience',
    thumbnail: 'https://img.youtube.com/vi/JyECrGp-Sw8/mqdefault.jpg'
  },
  {
    videoId: 'arj7oStGLkU',
    titleKey: 'sampleVideoTimUrban',
    categoryKey: 'sampleCategoryTed',
    thumbnail: 'https://img.youtube.com/vi/arj7oStGLkU/mqdefault.jpg'
  }
];

export const StudioHero: React.FC<StudioHeroProps> = ({
  onLoadYouTube,
  onSelectLocalFile,
  isProcessingLocal = false,
  whisperProgress = null,
  statusText = '',
  progressPercent = 0,
  onOpenPermissionGuide
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'youtube' | 'local'>('youtube');
  const [ytUrl, setYtUrl] = useState('');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [localHistory, setLocalHistory] = useState<LocalHistoryItem[]>([]);
  const [historyLayout, setHistoryLayout] = useState<'grid' | 'list'>('grid');
  const [isWhisperModalOpen, setIsWhisperModalOpen] = useState(false);
  const [activeModel, setActiveModel] = useState<{
    id: string;
    name: string;
    sizeMB: number;
    isDownloaded: boolean;
  }>({
    id: 'tiny',
    name: 'Whisper Tiny',
    sizeMB: 39,
    isDownloaded: false
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const historyLimit = useAppStore(s => s.historyLimit);
  const sourceLang = useAppStore(s => s.sourceLang);
  const setSourceLang = useAppStore(s => s.setSourceLang);

  const loadActiveModelInfo = useCallback(async () => {
    try {
      const activeId = await getActiveWhisperTier();
      const status = await getWhisperTierStatus(activeId);
      const tierConfig = WHISPER_TIERS[activeId as WhisperTierKey] || WHISPER_TIERS.tiny;
      setActiveModel({
        id: activeId,
        name: tierConfig.name,
        sizeMB: tierConfig.sizeMB,
        isDownloaded: status.isDownloaded
      });
    } catch (e) {
      console.warn('Failed to load active model in StudioHero:', e);
    }
  }, []);

  // Check offline model status & listen for changes
  useEffect(() => {
    loadActiveModelInfo();
    const handleTierChange = () => {
      loadActiveModelInfo();
    };
    window.addEventListener(WHISPER_TIER_CHANGED_EVENT, handleTierChange);
    return () => {
      window.removeEventListener(WHISPER_TIER_CHANGED_EVENT, handleTierChange);
    };
  }, [loadActiveModelInfo]);

  // Load history & preferences from IDB
  useEffect(() => {
    async function loadData() {
      try {
        const [data, savedLayout, savedLocal] = await Promise.all([
          get<HistoryItem[]>('yt_ceviri_history_list'),
          get<'grid' | 'list'>('yt_ceviri_history_layout'),
          get<LocalHistoryItem[]>('yt_ceviri_local_history')
        ]);

        if (savedLayout === 'grid' || savedLayout === 'list') {
          setHistoryLayout(savedLayout);
        }

        if (savedLocal && Array.isArray(savedLocal)) {
          setLocalHistory(savedLocal);
        }

        if (data && Array.isArray(data)) {
          setHistory(data);
          enrichHistoryItems(data).then(({ enrichedItems, hasChanges }) => {
            if (hasChanges) {
              setHistory(enrichedItems);
              set('yt_ceviri_history_list', enrichedItems).catch(() => {});
            }
          });
        }
      } catch (e) {
        console.warn('Failed to load history in StudioHero:', e);
      }
    }
    loadData();
  }, []);

  const handleToggleLayout = async (mode: 'grid' | 'list') => {
    setHistoryLayout(mode);
    await set('yt_ceviri_history_layout', mode).catch(() => {});
  };

  const handleDeleteYtItem = async (e: React.MouseEvent, videoId: string) => {
    e.stopPropagation();
    const updated = history.filter(item => item.videoId !== videoId);
    setHistory(updated);
    await set('yt_ceviri_history_list', updated).catch(() => {});
  };

  const handleClearYtHistory = async () => {
    const confirmMsg = t('clearHistoryConfirm');
    if (confirm(confirmMsg)) {
      setHistory([]);
      await set('yt_ceviri_history_list', []).catch(() => {});
    }
  };

  const handleDeleteLocalItem = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const updated = localHistory.filter(item => item.id !== id);
    setLocalHistory(updated);
    await set('yt_ceviri_local_history', updated).catch(() => {});
  };

  const handleClearLocalHistory = async () => {
    const confirmMsg = t('clearLocalHistoryConfirm');
    if (confirm(confirmMsg)) {
      setLocalHistory([]);
      await set('yt_ceviri_local_history', []).catch(() => {});
    }
  };

  const languageOptions: SelectOption[] = [
    { value: 'auto', label: `${t('autoDetect')} (AI Auto)` },
    ...SUPPORTED_LANGUAGES.map(l => ({
      value: l.code,
      label: `${l.nativeName} (${l.name})`
    }))
  ];

  const handleYtSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (ytUrl.trim()) {
      onLoadYouTube(ytUrl.trim());
      setYtUrl('');
    }
  };

  const handlePasteClipboard = async () => {
    try {
      let text = '';
      if (Clipboard && typeof Clipboard.read === 'function') {
        const res = await Clipboard.read();
        text = res.value || '';
      }
      if (!text && navigator.clipboard && navigator.clipboard.readText) {
        text = await navigator.clipboard.readText();
      }
      if (text.trim()) {
        setYtUrl(text.trim());
        onLoadYouTube(text.trim());
      }
    } catch (err) {
      console.warn('Clipboard read error:', err);
    }
  };

  const handleChooseVideo = async () => {
    if (isProcessingLocal) return;
    if (isNativeWhisperAvailable()) {
      try {
        const picked = await pickNativeVideo();
        if (picked && picked.uri) {
          const fileObj = new File([], picked.name, { type: 'video/mp4' });
          (fileObj as any).uri = picked.uri;
          (fileObj as any).path = picked.uri;
          Object.defineProperty(fileObj, 'size', { value: picked.size, writable: false });
          onSelectLocalFile(fileObj);
          return;
        }
      } catch (err: any) {
        if (String(err?.message || err).toLowerCase().includes('cancel')) {
          return;
        }
        console.warn('Native video picker failed, falling back to input:', err);
      }
    }
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onSelectLocalFile(e.target.files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onSelectLocalFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col items-center justify-start p-4 sm:p-6 text-center space-y-6">
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Hero Badge */}
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold">
        <Sparkles className="w-3.5 h-3.5" />
        <span>YT Translator Studio • {activeModel.name} {activeModel.isDownloaded ? t('activeReadyBadge') : t('downloadableBadge')}</span>
      </div>

      {/* Headline */}
      <div className="space-y-2">
        <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white">
          {t('dualSubtitleStudio')}
        </h1>
        <p className="text-sm sm:text-base text-slate-400 max-w-xl mx-auto leading-relaxed">
          {t('studioSubtitleDesc')}
        </p>
      </div>

      {/* Mode Switcher Tabs with Animated Sliding Pill Indicator */}
      <div className="relative flex items-center p-1 rounded-2xl bg-slate-900 border border-white/10 shadow-xl max-w-md w-full">
        {/* Animated Sliding Pill with Smooth Color & Glow Morphing */}
        <div
          className={`absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded-xl transition-all duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] shadow-lg pointer-events-none ${
            activeTab === 'youtube'
              ? 'translate-x-0 bg-red-600 shadow-red-600/30'
              : 'translate-x-full bg-indigo-600 shadow-indigo-600/30'
          }`}
          aria-hidden="true"
        />

        <button
          type="button"
          onClick={() => setActiveTab('youtube')}
          className={`relative z-10 flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-bold text-xs sm:text-sm transition-colors duration-200 cursor-pointer ${
            activeTab === 'youtube'
              ? 'text-white'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Film className="w-4 h-4" />
          <span>YouTube</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('local')}
          className={`relative z-10 flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-bold text-xs sm:text-sm transition-colors duration-200 cursor-pointer ${
            activeTab === 'local'
              ? 'text-white'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <FileVideo className="w-4 h-4" />
          <span>{t('localVideo')}</span>
        </button>
      </div>

      {/* Dynamic Whisper AI Management Capsule Button */}
      <button
        type="button"
        onClick={() => setIsWhisperModalOpen(true)}
        className="inline-flex items-center gap-2 px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-white/10 hover:border-indigo-500/50 text-xs text-slate-300 hover:text-white transition-all shadow-xl backdrop-blur-xl group cursor-pointer active:scale-95"
      >
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-indigo-400 group-hover:rotate-12 transition-transform" />
          <span className="font-bold text-white tracking-wide">Whisper AI:</span>
        </div>

        {activeModel.isDownloaded ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" />
            <span>{activeModel.name} ({activeModel.sizeMB} MB • {t('readyBadge')})</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
            <Download className="w-3 h-3" />
            <span>{t('noModelDownloaded')} (~{activeModel.sizeMB} MB)</span>
          </span>
        )}

        <span className="text-[11px] text-slate-400 group-hover:text-slate-200 flex items-center gap-0.5 ml-0.5 font-medium">
          <span>{t('manageModels')}</span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:translate-x-0.5 transition-transform" />
        </span>
      </button>

      {/* TAB 1: YOUTUBE SECTION */}
      {activeTab === 'youtube' && (
        <div className="w-full max-w-2xl space-y-6 animate-in fade-in duration-200">
          <AutoYouTubeAssistantCard onOpenPermissionGuide={onOpenPermissionGuide} />
          {/* Search / Paste Form */}
          <form onSubmit={handleYtSubmit} className="relative w-full">
            <div className="relative flex items-center">
              <Search className="absolute left-4 w-5 h-5 text-slate-400" />
              <input
                type="text"
                value={ytUrl}
                onChange={e => setYtUrl(e.target.value)}
                placeholder={t('searchVideoPlaceholder')}
                className="w-full bg-slate-900/90 border border-white/15 rounded-2xl pl-12 pr-28 py-3.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 shadow-2xl backdrop-blur-xl"
              />
              <div className="absolute right-2 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handlePasteClipboard}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all text-xs flex items-center gap-1 cursor-pointer"
                  title={t('pasteFromClipboard')}
                >
                  <ClipboardIcon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{t('pasteFromClipboard')}</span>
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-all shadow-md shadow-red-600/20 active:scale-95 cursor-pointer"
                >
                  {t('open')}
                </button>
              </div>
            </div>
          </form>

          {/* Quick Sample Videos */}
          <div className="space-y-2 text-left">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
              {t('quickTry')}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {SAMPLE_VIDEOS.map(video => (
                <div
                  key={video.videoId}
                  onClick={() => onLoadYouTube(video.videoId)}
                  className="p-2.5 rounded-2xl bg-slate-900/60 hover:bg-slate-800/80 border border-white/10 hover:border-red-500/40 transition-all cursor-pointer flex items-center space-x-3 group"
                >
                  <div className="relative w-16 aspect-video bg-black rounded-lg overflow-hidden shrink-0">
                    <img src={video.thumbnail} alt={t(video.titleKey)} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 group-hover:bg-black/10 flex items-center justify-center">
                      <Play className="w-4 h-4 text-white fill-current opacity-80 group-hover:opacity-100" />
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] font-bold text-red-400 block truncate">{t(video.categoryKey)}</span>
                    <p className="text-xs font-semibold text-white truncate">{t(video.titleKey)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Watch History */}
          {history.length > 0 && (
            <div className="space-y-3 text-left">
              <div className="flex items-center justify-between px-1 gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-indigo-400" />
                    <span>{t('recentHistory')}</span>
                  </h3>

                  <HistoryLimitPicker accent="red" />
                </div>

                <div className="flex items-center gap-2">
                  {/* Grid / List Layout Toggle */}
                  <div className="flex items-center bg-white/5 p-0.5 rounded-xl border border-white/5">
                    <button
                      type="button"
                      onClick={() => handleToggleLayout('grid')}
                      className={`p-1 rounded-lg transition-colors cursor-pointer ${
                        historyLayout === 'grid' ? 'bg-red-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                      }`}
                      title={t('layoutGridTitle')}
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleLayout('list')}
                      className={`p-1 rounded-lg transition-colors cursor-pointer ${
                        historyLayout === 'list' ? 'bg-red-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                      }`}
                      title={t('layoutListTitle')}
                    >
                      <List className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleClearYtHistory}
                    className="text-[11px] text-slate-400 hover:text-red-400 flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>{t('clearHistory')}</span>
                  </button>
                </div>
              </div>

              {historyLayout === 'grid' ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {history.slice(0, historyLimit || 6).map(item => (
                    <div
                      key={item.videoId}
                      onClick={() => onLoadYouTube(item.videoId)}
                      className="group relative bg-slate-900/40 hover:bg-slate-800/80 border border-white/5 hover:border-red-500/30 rounded-xl p-2 transition-all cursor-pointer flex flex-col justify-between space-y-2 hover:shadow-lg"
                    >
                      <button
                        type="button"
                        onClick={(e) => handleDeleteYtItem(e, item.videoId)}
                        className="absolute top-3 right-3 z-10 p-1 rounded-md bg-black/70 hover:bg-red-600 text-slate-300 hover:text-white transition-all opacity-80 sm:opacity-0 group-hover:opacity-100 shadow-md cursor-pointer"
                        title={t('delete')}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                      <div className="space-y-1.5">
                        <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden shrink-0">
                          <img src={`https://img.youtube.com/vi/${item.videoId}/mqdefault.jpg`} alt="Thumbnail" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                          <div className="absolute inset-0 bg-black/40 group-hover:bg-black/10 flex items-center justify-center">
                            <Play className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 fill-current" />
                          </div>
                        </div>
                        <p className="text-xs font-medium text-slate-200 group-hover:text-white truncate" title={item.title || item.videoId}>
                          {item.title || item.videoId}
                        </p>
                      </div>
                      <span className="text-[10px] text-slate-500">{new Date(item.timestamp).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {history.slice(0, historyLimit || 6).map(item => (
                    <div
                      key={item.videoId}
                      onClick={() => onLoadYouTube(item.videoId)}
                      className="p-2 rounded-xl bg-slate-900/40 hover:bg-slate-800/60 border border-white/5 hover:border-slate-600 transition-all cursor-pointer flex items-center justify-between gap-2.5 group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className="w-14 aspect-video bg-black rounded-lg overflow-hidden shrink-0">
                          <img src={`https://img.youtube.com/vi/${item.videoId}/mqdefault.jpg`} alt="Thumbnail" className="w-full h-full object-cover" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-slate-200 truncate">{item.title || item.videoId}</p>
                          <span className="text-[10px] text-slate-500">{new Date(item.timestamp).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteYtItem(e, item.videoId)}
                        className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors shrink-0 cursor-pointer"
                        title={t('delete')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: LOCAL VIDEO WHISPER SECTION */}
      {activeTab === 'local' && (
        <div className="w-full max-w-2xl space-y-4 animate-in fade-in duration-200">
          {/* Video Speech Language Selector */}
          <div className="flex items-center justify-between bg-slate-900/80 border border-white/10 p-3 rounded-2xl w-full gap-3 shadow-md">
            <div className="flex items-center gap-2 text-indigo-300 font-semibold text-xs shrink-0">
              <Languages className="w-4 h-4 text-indigo-400" />
              <span>{t('speechLanguage')}</span>
            </div>
            <div className="flex-1 min-w-[140px] max-w-xs">
              <CustomSelect
                value={sourceLang}
                onChange={(val) => setSourceLang(val)}
                options={languageOptions}
                direction="down"
                searchable={true}
                searchPlaceholder={t('searchLanguagePlaceholder')}
              />
            </div>
          </div>

          <div
            onClick={handleChooseVideo}
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
            className={`w-full p-8 sm:p-10 rounded-3xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center group ${
              isProcessingLocal
                ? 'border-indigo-500/50 bg-indigo-950/20 cursor-wait'
                : 'border-slate-800 hover:border-indigo-500/60 bg-slate-900/40 hover:bg-slate-900/80 shadow-xl hover:shadow-indigo-500/10'
            }`}
          >
            {isProcessingLocal ? (
              <WhisperProcessingCard
                progress={whisperProgress}
                tierName={activeModel.name}
                fallbackText={statusText}
                fallbackPercent={progressPercent}
              />
            ) : (
              <>
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-cyan-500/20 flex items-center justify-center text-indigo-400 group-hover:scale-110 group-hover:text-indigo-300 transition-all mb-4 border border-indigo-500/30">
                  <Upload className="w-8 h-8" />
                </div>
                <p className="text-base font-bold text-white mb-1">
                  {t('selectFromPhoneOrGallery')}
                </p>
                <p className="text-xs text-slate-400 mb-4">
                  {t('chooseVideoFormatDesc')}
                </p>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleChooseVideo();
                  }}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-all shadow-lg shadow-indigo-600/20 cursor-pointer"
                >
                  {t('chooseVideoFile')}
                </button>
              </>
            )}
          </div>

          {/* Privacy & Offline Badges */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-left">
            <div className="p-3 rounded-2xl bg-slate-900/60 border border-white/5 flex items-center gap-2.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-white">{t('private100')}</p>
                <p className="text-[10px] text-slate-400">{t('privateDesc')}</p>
              </div>
            </div>
            <div className="p-3 rounded-2xl bg-slate-900/60 border border-white/5 flex items-center gap-2.5">
              <Cpu className="w-4 h-4 text-indigo-400 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-white">Whisper AI STT</p>
                <p className="text-[10px] text-slate-400">{t('onDeviceTranscription')}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsWhisperModalOpen(true)}
              className={`p-3 rounded-2xl border flex items-center justify-between col-span-2 sm:col-span-1 transition-all text-left group cursor-pointer ${
                activeModel.isDownloaded 
                  ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300 hover:border-emerald-400/60' 
                  : 'bg-slate-900/60 border-white/5 hover:border-indigo-500/40'
              }`}
              title={t('manageModels')}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <HardDrive className={`w-4 h-4 shrink-0 ${activeModel.isDownloaded ? 'text-emerald-400' : 'text-cyan-400'}`} />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white truncate">
                    {activeModel.isDownloaded ? `${activeModel.name} ${t('modelActive')}` : activeModel.name}
                  </p>
                  <p className={`text-[10px] ${activeModel.isDownloaded ? 'text-emerald-400 font-medium' : 'text-slate-400'}`}>
                    {activeModel.isDownloaded 
                      ? `${activeModel.sizeMB} MB • ${t('readyBadge')}` 
                      : `${activeModel.sizeMB} MB • ${t('downloadableBadge')}`}
                  </p>
                </div>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-white group-hover:translate-x-0.5 transition-transform shrink-0" />
            </button>
          </div>

          {/* Quick Whisper Model Management Banner */}
          <div className="p-3 sm:p-3.5 rounded-2xl bg-indigo-950/20 border border-indigo-500/20 flex items-center justify-between gap-3 text-left">
            <div className="flex items-center gap-2.5 min-w-0">
              <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white">
                  {t('manageModels')}
                </p>
                <p className="text-[11px] text-slate-400 truncate">
                  {t('whisperUniversalNotice')}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsWhisperModalOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-indigo-600/80 hover:bg-indigo-600 text-white font-medium text-xs transition-colors shrink-0 cursor-pointer shadow-md"
            >
              {activeModel.isDownloaded ? t('manageModels') : t('downloadOrManage')}
            </button>
          </div>

          {/* Recent Local Videos History */}
          {localHistory.length > 0 && (
            <div className="w-full space-y-3 pt-2 text-left">
              <div className="flex items-center justify-between px-1 gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-indigo-400" />
                    <span>{t('recentLocalVideos')}</span>
                  </h3>

                  <HistoryLimitPicker accent="indigo" />
                </div>

                <button
                  type="button"
                  onClick={handleClearLocalHistory}
                  className="text-[11px] text-slate-400 hover:text-red-400 flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>{t('clearHistory')}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {localHistory.slice(0, historyLimit || 6).map((item) => (
                  <div
                    key={item.id}
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2.5 rounded-xl bg-slate-900/60 hover:bg-slate-800/80 border border-white/5 hover:border-indigo-500/40 transition-all cursor-pointer flex items-center justify-between gap-3 group"
                    title={t('clickToReopen')}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
                        <FileVideo className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-white truncate" title={item.name}>
                          {item.name}
                        </p>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                          <span>{(item.size / (1024 * 1024)).toFixed(1)} MB</span>
                          <span>•</span>
                          <span className="text-emerald-400 font-medium">
                            {item.cueCount ? `${item.cueCount} ${t('cuesReady')}` : t('cuesReady')}
                          </span>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteLocalItem(e, item.id)}
                      className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors shrink-0 cursor-pointer"
                      title={t('delete')}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Dedicated Whisper AI Models Management Modal */}
      <WhisperModelsModal
        isOpen={isWhisperModalOpen}
        onClose={() => setIsWhisperModalOpen(false)}
      />
    </div>
  );
};
