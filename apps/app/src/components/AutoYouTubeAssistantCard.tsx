import React, { useCallback } from 'react';
import { Sparkles, ExternalLink, Play, Radio, CheckCircle2, ShieldCheck } from 'lucide-react';
import { useTranslation, useAppStore, openYouTubeApp } from '@lexiduo/core';
import { useAutoYouTubeAssistant } from '../hooks/useAutoYouTubeAssistant';

export interface AutoYouTubeAssistantCardProps {
  onOpenPermissionGuide?: () => void;
}

export const AutoYouTubeAssistantCard: React.FC<AutoYouTubeAssistantCardProps> = ({
  onOpenPermissionGuide
}) => {
  const { t } = useTranslation();
  const targetLang = useAppStore((s) => s.targetLang);
  const { isActive, isLoading, toggle } = useAutoYouTubeAssistant({
    onOpenPermissionGuide
  });

  const handleOpenYouTube = useCallback(() => {
    openYouTubeApp().catch((err) => {
      console.warn('Failed to open YouTube app:', err);
      window.open('https://www.youtube.com', '_system');
    });
  }, []);

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border p-4 sm:p-5 transition-all duration-300 backdrop-blur-xl ${
        isActive
          ? 'bg-gradient-to-br from-emerald-950/40 via-slate-900/90 to-slate-900/80 border-emerald-500/40 shadow-[0_0_30px_rgba(16,185,129,0.15)] ring-1 ring-emerald-500/20'
          : 'bg-slate-900/80 border-white/10 hover:border-white/20 shadow-xl'
      }`}
    >
      {/* Background Glow */}
      {isActive && (
        <div className="absolute -top-12 -right-12 w-36 h-36 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none" />
      )}

      {/* Header Row */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={`p-2 rounded-xl border flex items-center justify-center transition-colors ${
              isActive
                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                : 'bg-slate-800 border-white/10 text-slate-400'
            }`}
          >
            {isActive ? (
              <Radio className="w-4 h-4 animate-pulse" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
          </div>
          <div className="min-w-0 text-left flex flex-col justify-center">
            <h3 className="text-sm sm:text-base font-bold text-white tracking-tight truncate leading-snug">
              {t('autoAssistantTitle')}
            </h3>
            <div className="mt-1 flex items-center">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold tracking-wide border transition-all ${
                  isActive
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
                    : 'bg-slate-800/80 text-slate-400 border-white/10'
                }`}
              >
                {isActive ? (
                  <>
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                    </span>
                    <span className="whitespace-nowrap">{t('autoAssistantActive')}</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                    <span className="whitespace-nowrap">{t('autoAssistantReady')}</span>
                  </>
                )}
              </span>

              {onOpenPermissionGuide && (
                <button
                  type="button"
                  onClick={onOpenPermissionGuide}
                  className="inline-flex items-center gap-1 px-2 py-0.5 ml-2 rounded-full text-[10px] font-semibold bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 transition-colors cursor-pointer active:scale-95"
                  title={t('systemPermissionsTitle')}
                >
                  <ShieldCheck className="w-3 h-3 text-emerald-400" />
                  <span>{t('manage')}</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Toggle Switch */}
        <button
          type="button"
          onClick={() => toggle()}
          disabled={isLoading}
          aria-label={isActive ? t('autoAssistantStopBtn') : t('autoAssistantStartBtn')}
          className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500/50 ${
            isActive ? 'bg-emerald-600' : 'bg-slate-800 hover:bg-slate-700'
          } ${isLoading ? 'opacity-60 cursor-not-allowed' : ''}`}
        >
          <span
            className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
              isActive ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {/* Description */}
      <p className="text-xs text-slate-300/90 text-left mb-4 leading-relaxed">
        {t('autoAssistantDesc')}
      </p>

      {/* Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-white/5">
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <span className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">
            {t('targetLang')}:
          </span>
          <span className="px-2 py-0.5 rounded-lg bg-slate-800/80 border border-white/10 text-slate-200 font-semibold text-xs uppercase">
            {targetLang ? targetLang.toUpperCase() : t('selectLanguage')}
          </span>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {/* YouTube Launcher Button */}
          <button
            type="button"
            onClick={handleOpenYouTube}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-600/90 hover:bg-red-600 active:scale-95 text-white text-xs font-semibold shadow-md shadow-red-600/20 transition-all cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>{t('continueOnYouTubeTitle')}</span>
            <ExternalLink className="w-3 h-3 text-red-200" />
          </button>
        </div>
      </div>
    </div>
  );
};
