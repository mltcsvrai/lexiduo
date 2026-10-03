import React, { useState, useEffect } from 'react';
import { Search, Play, Clipboard as ClipboardIcon, Sparkles, Clock, Trash2 } from 'lucide-react';
import { useTranslation } from '../i18n/TranslationContext';
import { get, set } from 'idb-keyval';
import { Clipboard } from '@capacitor/clipboard';
import type { HistoryItem } from '../types';
import { useAppStore } from '../store/useAppStore';
import { HISTORY_LIMIT_OPTIONS, enrichHistoryItems } from '../services/videoMetadata';

interface WelcomeHeroProps {
  onLoadVideo: (urlOrId: string) => void;
}

interface SampleVideo {
  videoId: string;
  titleTr: string;
  titleEn: string;
  categoryKey: 'sampleCategoryInspiration' | 'sampleCategoryScience' | 'sampleCategoryTed';
  thumbnail: string;
}

const SAMPLE_VIDEOS: SampleVideo[] = [
  {
    videoId: 'UF8uR6Z6KLc',
    titleTr: 'Steve Jobs: 2005 Stanford Konuşması',
    titleEn: 'Steve Jobs: 2005 Stanford Commencement Address',
    categoryKey: 'sampleCategoryInspiration',
    thumbnail: 'https://img.youtube.com/vi/UF8uR6Z6KLc/mqdefault.jpg'
  },
  {
    videoId: 'JyECrGp-Sw8',
    titleTr: 'Kurzgesagt: Tüm Nükleer Bombalar Patlarsa?',
    titleEn: 'Kurzgesagt: What If We Detonated All Nuclear Bombs?',
    categoryKey: 'sampleCategoryScience',
    thumbnail: 'https://img.youtube.com/vi/JyECrGp-Sw8/mqdefault.jpg'
  },
  {
    videoId: 'arj7oStGLkU',
    titleTr: 'Tim Urban: Erteleme Hastalığı (TED)',
    titleEn: 'Tim Urban: Inside the Mind of a Procrastinator (TED)',
    categoryKey: 'sampleCategoryTed',
    thumbnail: 'https://img.youtube.com/vi/arj7oStGLkU/mqdefault.jpg'
  }
];

export const WelcomeHero: React.FC<WelcomeHeroProps> = ({ onLoadVideo }) => {
  const { t, language } = useTranslation();
  const [url, setUrl] = useState('');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const historyLimit = useAppStore(s => s.historyLimit);
  const setHistoryLimit = useAppStore(s => s.setHistoryLimit);

  useEffect(() => {
    async function loadHistory() {
      try {
        const data = await get<HistoryItem[]>('yt_ceviri_history_list');
        if (data && Array.isArray(data)) {
          setHistory(data);
          // Enrich missing titles in background
          enrichHistoryItems(data).then(({ enrichedItems, hasChanges }) => {
            if (hasChanges) {
              setHistory(enrichedItems);
              set('yt_ceviri_history_list', enrichedItems).catch(() => {});
            }
          });
        }
      } catch (e) {
        console.warn('Failed to load history in WelcomeHero:', e);
      }
    }
    loadHistory();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      onLoadVideo(url.trim());
      setUrl('');
    }
  };

  const handlePaste = async () => {
    try {
      let pastedText = '';
      if (Clipboard && typeof Clipboard.read === 'function') {
        const { value } = await Clipboard.read();
        pastedText = value || '';
      }
      if (!pastedText && navigator.clipboard && navigator.clipboard.readText) {
        pastedText = await navigator.clipboard.readText();
      }
      if (pastedText.trim()) {
        setUrl(pastedText.trim());
        onLoadVideo(pastedText.trim());
      }
    } catch (err) {
      console.warn('Clipboard read error:', err);
    }
  };

  const handleLimitChange = async (newLimit: number) => {
    setHistoryLimit(newLimit);
    await set('yt_ceviri_history_limit', newLimit);
  };

  const handleClearHistory = async () => {
    if (confirm(t('clearHistoryConfirm'))) {
      await set('yt_ceviri_history_list', []);
      setHistory([]);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-4 sm:py-10 flex flex-col items-center justify-start space-y-6 sm:space-y-8 animate-in fade-in duration-300">
      
      {/* Brand Header */}
      <div className="text-center space-y-3 flex flex-col items-center">
        <div className="relative group mb-1">
          <div className="absolute -inset-2 bg-gradient-to-r from-red-600/40 via-purple-600/40 to-pink-600/40 rounded-3xl blur-xl opacity-60 group-hover:opacity-100 transition duration-500" />
          <img
            src="/logo.png"
            alt="YT Translator Logo"
            className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-2xl shadow-[0_10px_25px_rgba(0,0,0,0.6)] ring-1 ring-white/15 object-contain"
          />
        </div>

        <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-red-600/10 border border-red-500/20 text-red-400 text-xs font-semibold shadow-inner">
          <Sparkles className="w-3.5 h-3.5" />
          <span>{t('aiBilingualBadge')}</span>
        </div>
        
        <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
          YT <span className="text-red-500">{t('brandTitleSuffix')}</span>
        </h1>
        
        <p className="text-slate-300 text-xs sm:text-sm max-w-lg mx-auto leading-relaxed">
          {t('heroSubtitle')}
        </p>
      </div>

      {/* Main Search & URL Input Bar */}
      <form onSubmit={handleSubmit} className="w-full max-w-2xl relative group">
        <div className="relative flex items-center bg-slate-900/80 backdrop-blur-2xl border border-white/15 focus-within:border-red-500/80 rounded-2xl p-1.5 shadow-[0_10px_35px_rgba(0,0,0,0.6)] ring-1 ring-white/5 transition-all">
          <Search className="w-5 h-5 ml-3 text-slate-400 group-focus-within:text-red-400 shrink-0 transition-colors" />
          
          <input
            type="text"
            placeholder={t('searchVideoPlaceholder')}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1 bg-transparent px-3 py-3 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none min-w-0"
          />

          <div className="flex items-center space-x-1.5 shrink-0">
            <button
              type="button"
              onClick={handlePaste}
              className="px-2.5 sm:px-3 py-2 bg-white/5 hover:bg-white/10 active:scale-95 text-slate-300 hover:text-white rounded-xl text-xs font-semibold transition-all flex items-center space-x-1.5 border border-white/5 cursor-pointer"
              title={t('pasteFromClipboard')}
            >
              <ClipboardIcon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t('pasteFromClipboard')}</span>
            </button>

            <button
              type="submit"
              disabled={!url.trim()}
              className="px-4 sm:px-6 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:hover:bg-red-600 text-white rounded-xl text-xs sm:text-sm font-bold shadow-[0_0_15px_rgba(239,68,68,0.4)] active:scale-95 transition-all cursor-pointer"
            >
              {t('open')}
            </button>
          </div>
        </div>
      </form>

      {/* Quick Try Sample Videos */}
      <div className="w-full space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs sm:text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
            <span>{t('quickTry')}</span>
          </h2>
          <span className="text-[11px] text-slate-400">{t('testWithOneClick')}</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {SAMPLE_VIDEOS.map((item) => (
            <div
              key={item.videoId}
              onClick={() => onLoadVideo(item.videoId)}
              className="group bg-slate-900/60 hover:bg-slate-800/80 border border-white/10 hover:border-red-500/40 rounded-2xl p-2.5 transition-all cursor-pointer shadow-lg hover:shadow-[0_8px_25px_rgba(239,68,68,0.15)] flex sm:flex-col items-center sm:items-start space-x-3 sm:space-x-0 space-y-0 sm:space-y-2.5"
            >
              <div className="relative w-24 sm:w-full aspect-video rounded-xl overflow-hidden bg-slate-950 shrink-0">
                <img
                  src={item.thumbnail}
                  alt={language === 'tr' ? item.titleTr : item.titleEn}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                  <div className="w-8 h-8 rounded-full bg-red-600 text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                    <Play className="w-4 h-4 fill-current ml-0.5" />
                  </div>
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider block">
                  {t(item.categoryKey as any)}
                </span>
                <p className="text-xs font-semibold text-slate-200 group-hover:text-white truncate">
                  {language === 'tr' ? item.titleTr : item.titleEn}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent History (Son İzlenenler) */}
      {history.length > 0 && (
        <div className="w-full space-y-3 pt-2">
          <div className="flex items-center justify-between px-1 gap-2 flex-wrap">
            <div className="flex items-center gap-3">
              <h2 className="text-xs sm:text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>{t('recentHistory')}</span>
              </h2>

              {/* Quick Limit Selector */}
              <div className="flex items-center space-x-1.5 text-xs text-slate-400 bg-white/5 hover:bg-white/10 px-2.5 py-1 rounded-xl border border-white/5 transition-colors">
                <span className="text-[11px] font-medium text-slate-400">{t('showCount')}:</span>
                <select
                  value={historyLimit}
                  onChange={(e) => handleLimitChange(Number(e.target.value))}
                  className="bg-transparent text-[11px] font-bold text-slate-200 focus:outline-none cursor-pointer pr-1"
                >
                  {HISTORY_LIMIT_OPTIONS.map((num) => (
                    <option key={num} value={num} className="bg-slate-900 text-white">
                      {num}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              onClick={handleClearHistory}
              className="text-[11px] text-slate-400 hover:text-red-400 flex items-center gap-1 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
              <span>{t('clearHistory')}</span>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {history.slice(0, historyLimit).map((item) => (
              <div
                key={item.videoId}
                onClick={() => onLoadVideo(item.videoId)}
                className="group bg-slate-900/60 hover:bg-slate-800/90 border border-white/5 hover:border-white/20 rounded-xl p-2 transition-all cursor-pointer flex flex-col justify-between space-y-2 hover:shadow-lg hover:shadow-black/40"
              >
                <div className="space-y-1.5">
                  <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-slate-950">
                    <img
                      src={`https://img.youtube.com/vi/${item.videoId}/mqdefault.jpg`}
                      alt={item.title || item.videoId}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-black/40 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                      <Play className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity fill-current" />
                    </div>
                  </div>
                  <p
                    className="text-xs font-semibold text-slate-200 group-hover:text-white line-clamp-2 leading-snug"
                    title={item.title || item.videoId}
                  >
                    {item.title || `Video ${item.videoId}`}
                  </p>
                </div>
                <div className="text-[10px] text-slate-400 pt-0.5 border-t border-white/5 flex items-center justify-between">
                  <span>{new Date(item.timestamp).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
};
