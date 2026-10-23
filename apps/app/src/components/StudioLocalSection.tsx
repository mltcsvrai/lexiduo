import React from 'react';
import { 
  Languages, 
  Upload, 
  ShieldCheck, 
  Sparkles, 
  Clock, 
  Trash2, 
  FileVideo 
} from 'lucide-react';
import { 
  useTranslation, 
  CustomSelect, 
  type SelectOption, 
  HistoryLimitPicker 
} from '@lexiduo/core';
import { WhisperProcessingCard } from './WhisperProcessingCard';
import type { WhisperProgress } from '../services/whisperEngine';

export interface LocalHistoryItem {
  id: string;
  name: string;
  size: number;
  lastModified?: number;
  timestamp: number;
  cueCount?: number;
}

export interface StudioLocalSectionProps {
  isProcessingLocal: boolean;
  whisperProgress: WhisperProgress | null;
  statusText: string;
  progressPercent: number;
  activeModel: {
    id: string;
    name: string;
    sizeMB: number;
    isDownloaded: boolean;
  };
  sourceLang: string;
  setSourceLang: (lang: string) => void;
  languageOptions: SelectOption[];
  handleChooseVideo: () => void;
  handleDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  setIsWhisperModalOpen: (open: boolean) => void;
  localHistory: LocalHistoryItem[];
  historyLimit: number;
  handleDeleteLocalItem: (e: React.MouseEvent, id: string) => void;
  handleClearLocalHistory: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onCancelProcessing?: () => void;
  processingTierName?: string;
}

export const StudioLocalSection: React.FC<StudioLocalSectionProps> = ({
  isProcessingLocal,
  whisperProgress,
  statusText,
  progressPercent,
  activeModel,
  sourceLang,
  setSourceLang,
  languageOptions,
  handleChooseVideo,
  handleDrop,
  setIsWhisperModalOpen: _setIsWhisperModalOpen,
  localHistory,
  historyLimit,
  handleDeleteLocalItem,
  handleClearLocalHistory,
  fileInputRef,
  onCancelProcessing,
  processingTierName
}) => {
  const { t } = useTranslation();

  return (
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
            tierName={processingTierName || (activeModel?.name || 'Whisper AI')}
            fallbackText={statusText}
            fallbackPercent={progressPercent}
            onCancel={onCancelProcessing}
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

      {/* Privacy & Engine Badges */}
      <div className="grid grid-cols-2 gap-3 text-left">
        <div className="p-3 rounded-2xl bg-slate-900/60 border border-white/5 flex items-center gap-2.5">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <div>
            <p className="text-xs font-semibold text-white">{t('private100')}</p>
            <p className="text-[10px] text-slate-400">{t('privateDesc')}</p>
          </div>
        </div>
        <div className="p-3 rounded-2xl bg-slate-900/60 border border-white/5 flex items-center gap-2.5">
          <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
          <div>
            <p className="text-xs font-semibold text-white">Google Gemini AI</p>
            <p className="text-[10px] text-slate-400">{t('zeroDownloadBadge')}</p>
          </div>
        </div>
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
  );
};
