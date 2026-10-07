import React from 'react';
import { PlayCircle, Layers, X, Sparkles, Loader2, MonitorPlay } from 'lucide-react';
import { useTranslation } from '@ytceviri/core';

export interface YouTubePlaybackChoiceModalProps {
  isOpen: boolean;
  videoId: string | null;
  videoTitle?: string;
  isPreparingSubtitles?: boolean;
  onStayInApp: () => void;
  onContinueOnYouTube: () => void;
  onClose: () => void;
}

export const YouTubePlaybackChoiceModal: React.FC<YouTubePlaybackChoiceModalProps> = ({
  isOpen,
  videoId,
  videoTitle,
  isPreparingSubtitles = false,
  onStayInApp,
  onContinueOnYouTube,
  onClose,
}) => {
  const { t } = useTranslation();

  if (!isOpen || !videoId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in pointer-events-auto">
      <div className="relative w-full max-w-xl bg-neutral-900 border border-neutral-700/60 rounded-3xl p-6 sm:p-8 shadow-2xl overflow-hidden">
        {/* Subtle decorative background gradients */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-red-600/10 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-neutral-800">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-red-500 animate-pulse" />
              <h2 className="text-xl font-bold text-white">{t('choosePlaybackModeTitle')}</h2>
            </div>
            <p className="text-xs text-neutral-400 mt-1 max-w-md truncate">
              {videoTitle || `YouTube: ${videoId}`}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isPreparingSubtitles}
            className="p-1.5 text-neutral-400 hover:text-white rounded-xl hover:bg-neutral-800 transition disabled:opacity-50 cursor-pointer"
            aria-label={t('close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Options Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-6">
          {/* Option 1: Stay in App */}
          <div className="flex flex-col justify-between p-5 rounded-2xl bg-neutral-800/60 border border-neutral-700/60 hover:border-emerald-500/50 transition-all group">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  <MonitorPlay className="w-6 h-6" />
                </div>
                <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  <PlayCircle className="w-3 h-3" /> {t('dualLanguage')}
                </span>
              </div>
              <h3 className="text-base font-bold text-white mb-1">{t('stayInAppTitle')}</h3>
              <p className="text-xs text-neutral-400 leading-relaxed mb-4">
                {t('stayInAppDesc')}
              </p>
            </div>

            <button
              onClick={onStayInApp}
              disabled={isPreparingSubtitles}
              className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition duration-200 shadow-md group-hover:bg-emerald-500 cursor-pointer disabled:opacity-50"
            >
              {t('stayInAppBtn')}
            </button>
          </div>

          {/* Option 2: Continue on YouTube */}
          <div className="flex flex-col justify-between p-5 rounded-2xl bg-neutral-800/60 border border-neutral-700/60 hover:border-red-500/50 transition-all group">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400">
                  <Layers className="w-6 h-6" />
                </div>
                <span className="flex items-center gap-1 text-[11px] font-semibold text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/20">
                  {t('floatingSubtitles')}
                </span>
              </div>
              <h3 className="text-base font-bold text-white mb-1">{t('continueOnYouTubeTitle')}</h3>
              <p className="text-xs text-neutral-400 leading-relaxed mb-4">
                {t('continueOnYouTubeDesc')}
              </p>
            </div>

            <button
              onClick={onContinueOnYouTube}
              disabled={isPreparingSubtitles}
              className="w-full py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold text-xs transition duration-200 shadow-md group-hover:bg-red-500 cursor-pointer disabled:opacity-75 flex items-center justify-center gap-2"
            >
              {isPreparingSubtitles ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>{t('preparingSubtitles')}</span>
                </>
              ) : (
                <span>{t('continueOnYouTubeBtn')}</span>
              )}
            </button>
          </div>
        </div>

        {/* Footer info */}
        <p className="text-[11px] text-neutral-400 text-center">
          {t('choosePlaybackModeDesc')}
        </p>
      </div>
    </div>
  );
};
