import React, { useEffect, useState } from 'react';
import { MonitorPlay, X, Play, Trash2 } from 'lucide-react';
import { get, set } from 'idb-keyval';
import { useTranslation } from '../i18n/TranslationContext';

import type { HistoryItem } from '../types';
import { enrichHistoryItems } from '../services/videoMetadata';
export type { HistoryItem };

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onLoadVideo: (videoId: string) => void;
}

export const HistoryModal: React.FC<Props> = ({ isOpen, onClose, onLoadVideo }) => {
  const { t } = useTranslation();
  const [history, setHistory] = useState<HistoryItem[]>([]);

  useEffect(() => {
    if (isOpen) {
      get<HistoryItem[]>('yt_ceviri_history_list').then(data => {
        if (data && Array.isArray(data)) {
          // Sort by newest first
          const sorted = data.sort((a, b) => b.timestamp - a.timestamp);
          setHistory(sorted);
          enrichHistoryItems(sorted).then(({ enrichedItems, hasChanges }) => {
            if (hasChanges) {
              setHistory(enrichedItems);
              set('yt_ceviri_history_list', enrichedItems).catch(() => {});
            }
          });
        }
      });
    }
  }, [isOpen]);

  const handleClear = async () => {
    if (confirm(t('clearHistoryConfirm'))) {
      await set('yt_ceviri_history_list', []);
      setHistory([]);
    }
  };

  const handlePlay = (videoId: string) => {
    onLoadVideo(videoId);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[85vh]">
        <div className="p-4 border-b border-slate-700/50 flex items-center justify-between bg-slate-800/50">
          <div className="flex items-center space-x-2">
            <MonitorPlay className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold text-white">{t('recentHistory')}</h2>
          </div>
          <div className="flex items-center space-x-2">
            {history.length > 0 && (
              <button 
                onClick={handleClear}
                className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-xl transition-colors"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            )}
            <button 
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-slate-500">
              <MonitorPlay className="w-12 h-12 mb-3 opacity-20" />
              <p>{t('noHistoryYet')}</p>
            </div>
          ) : (
             history.map((item) => (
              <div 
                key={item.videoId}
                onClick={() => handlePlay(item.videoId)}
                className="flex items-center space-x-4 p-3 rounded-xl bg-slate-800/40 hover:bg-slate-700/60 border border-transparent hover:border-slate-600 transition-all cursor-pointer group"
              >
                <div className="relative w-24 aspect-video bg-slate-800 rounded-lg overflow-hidden shrink-0">
                  <img 
                    src={`https://img.youtube.com/vi/${item.videoId}/mqdefault.jpg`} 
                    alt="Thumbnail"
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-black/40 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                    <Play className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-200 line-clamp-2 leading-snug" title={item.title || item.videoId}>
                    {item.title || `Video: ${item.videoId}`}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {new Date(item.timestamp).toLocaleDateString()} {new Date(item.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
