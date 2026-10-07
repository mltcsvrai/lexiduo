import React, { useState, useEffect } from 'react';
import { Search, X, Video, Clipboard as ClipboardIcon, Play, Clock } from 'lucide-react';
import { get } from 'idb-keyval';
import { Clipboard } from '@capacitor/clipboard';
import { useTranslation } from '../i18n/TranslationContext';
import { useAppStore } from '../store/useAppStore';
import type { HistoryItem } from '../types';
import { HistoryLimitPicker } from './HistoryLimitPicker';


interface TopSearchOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadVideo: (url: string) => void;
}

export const TopSearchOverlay: React.FC<TopSearchOverlayProps> = ({
  isOpen,
  onClose,
  onLoadVideo
}) => {
  const { t } = useTranslation();
  const [url, setUrl] = useState('');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const historyLimit = useAppStore(s => s.historyLimit);

  useEffect(() => {
    if (isOpen) {
      get<HistoryItem[]>('yt_ceviri_history_list').then(data => {
        if (data && Array.isArray(data)) {
          setHistory(data.slice(0, historyLimit));
        }
      }).catch(() => {});
    }
  }, [isOpen, historyLimit]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      onLoadVideo(url.trim());
      setUrl('');
      onClose();
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
        onClose();
      }
    } catch (err) {
      console.warn('Clipboard read error in TopSearchOverlay:', err);
    }
  };

  const handlePlayHistory = (videoId: string) => {
    onLoadVideo(videoId);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[calc(2.5rem+env(safe-area-inset-top,28px))] sm:pt-20 px-3.5 bg-black/75 backdrop-blur-md animate-in fade-in duration-200" onClick={onClose}>
      <div 
        className="w-full max-w-xl bg-slate-900/95 backdrop-blur-3xl border border-white/10 rounded-3xl p-5 sm:p-6 shadow-[0_20px_50px_rgba(0,0,0,0.6)] ring-1 ring-white/5 animate-in slide-in-from-top-4 duration-300 max-h-[85dvh] overflow-y-auto space-y-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5 text-red-500">
            <div className="p-2 bg-red-500/10 rounded-full">
              <Video size={20} />
            </div>
            <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">{t('openNewVideo')}</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition-all active:scale-95 cursor-pointer"
          >
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="relative group">
          <div className="relative flex items-center bg-black/40 border border-white/15 focus-within:border-red-500/80 rounded-2xl p-1 shadow-inner transition-all">
            <Search className="w-5 h-5 ml-3 text-slate-400 group-focus-within:text-red-400 shrink-0 transition-colors" />
            
            <input
              type="text"
              placeholder={t('searchVideoPlaceholder')}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="flex-1 bg-transparent px-3 py-2.5 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none min-w-0"
              autoFocus
            />

            <div className="flex items-center space-x-1.5 shrink-0">
              <button
                type="button"
                onClick={handlePaste}
                className="px-2.5 py-1.5 bg-white/5 hover:bg-white/10 active:scale-95 text-slate-300 hover:text-white rounded-xl text-xs font-semibold transition-all flex items-center space-x-1 border border-white/5 cursor-pointer"
                title={t('pasteFromClipboard')}
              >
                <ClipboardIcon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t('pasteFromClipboard')}</span>
              </button>

              <button
                type="submit"
                disabled={!url.trim()}
                className="px-4 py-1.5 bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white rounded-xl text-xs sm:text-sm font-bold shadow-[0_0_15px_rgba(239,68,68,0.4)] active:scale-95 transition-all cursor-pointer"
              >
                {t('open')}
              </button>
            </div>
          </div>
        </form>

        {/* Recent History Quick Access */}
        {history.length > 0 && (
          <div className="space-y-2.5 pt-2 border-t border-white/10">
            <div className="flex items-center justify-between px-0.5">
              <div className="flex items-center space-x-1.5 text-slate-400 text-xs font-semibold">
                <Clock className="w-3.5 h-3.5" />
                <span>{t('recentHistory')}</span>
              </div>

              <HistoryLimitPicker accent="red" />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {history.map((item) => (
                <div
                  key={item.videoId}
                  onClick={() => handlePlayHistory(item.videoId)}
                  className="group bg-black/30 hover:bg-white/5 border border-white/5 hover:border-white/15 rounded-xl p-1.5 transition-all cursor-pointer flex flex-col space-y-1"
                >
                  <div className="relative aspect-video rounded-lg overflow-hidden bg-slate-950">
                    <img
                      src={`https://img.youtube.com/vi/${item.videoId}/mqdefault.jpg`}
                      alt={item.title || item.videoId}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-black/40 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                      <Play className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity fill-current" />
                    </div>
                  </div>
                  <p className="text-[11px] font-semibold text-slate-200 group-hover:text-white truncate px-0.5" title={item.title || item.videoId}>
                    {item.title || `Video ${item.videoId}`}
                  </p>
                  <div className="text-[9px] text-slate-400 truncate px-0.5">
                    {new Date(item.timestamp).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
