import React from 'react';
import { X, Sparkles, ShieldCheck, Zap } from 'lucide-react';
import { useTranslation } from '@ytceviri/core';
import { OfflineModelSection } from './OfflineModelSection';

interface WhisperModelsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WhisperModelsModal: React.FC<WhisperModelsModalProps> = ({
  isOpen,
  onClose
}) => {
  const { t } = useTranslation();

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div 
        className="relative w-full max-w-2xl max-h-[92vh] overflow-y-auto custom-scrollbar bg-neutral-900 border border-neutral-700/70 rounded-3xl p-5 sm:p-7 shadow-2xl space-y-5 text-left"
        onClick={e => e.stopPropagation()}
      >
        {/* Subtle decorative glow */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-red-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 shrink-0">
              <Sparkles className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight flex items-center gap-2">
                <span>{t('offlineModelsTitle')}</span>
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  {t('onDeviceBadge')}
                </span>
              </h2>
              <p className="text-xs text-neutral-400 mt-0.5 leading-relaxed">
                {t('whisperUniversalNotice')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-neutral-400 hover:text-white rounded-xl hover:bg-neutral-800 transition cursor-pointer"
            aria-label={t('close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Universal Engine Explanation Banner */}
        <div className="p-3.5 rounded-2xl bg-slate-800/50 border border-white/5 flex items-center justify-between gap-3 text-xs text-slate-300">
          <div className="flex items-center gap-2.5">
            <Zap className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="leading-normal">
              🎬 <strong>YouTube:</strong> {t('whisperModalYoutubeDesc')}<br />
              📁 <strong>{t('localVideo')}:</strong> {t('whisperModalLocalDesc')}
            </span>
          </div>
          <div className="hidden sm:flex items-center gap-1 text-[11px] text-emerald-400 font-medium shrink-0">
            <ShieldCheck size={14} />
            <span>{t('private100')}</span>
          </div>
        </div>

        {/* Embedded Offline Model Manager */}
        <div className="pt-1">
          <OfflineModelSection />
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-3 border-t border-neutral-800">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold transition cursor-pointer shadow-md"
          >
            {t('close')}
          </button>
        </div>
      </div>
    </div>
  );
};
