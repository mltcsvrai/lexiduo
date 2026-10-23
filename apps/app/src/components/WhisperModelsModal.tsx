import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  X, 
  Sparkles, 
  ShieldCheck, 
  Zap, 
  Globe, 
  Cpu, 
  Download, 
  Trash2, 
  CheckCircle2, 
  Check, 
  AlertCircle,
  Loader2
} from 'lucide-react';
import { useTranslation } from '@lexiduo/core';
import { OfflineModelSection } from './OfflineModelSection';
import {
  MARIAN_MODEL_PAIRS,
  type MarianModelPair,
  downloadMarianModel,
  deleteMarianModel,
  getDownloadedMarianModels,
  getActiveMarianModel,
  setActiveMarianModel,
  MARIAN_MODEL_CHANGED_EVENT
} from '../services/marianTranslationEngine';

interface WhisperModelsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WhisperModelsModal: React.FC<WhisperModelsModalProps> = ({
  isOpen,
  onClose
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'whisper' | 'translation'>('whisper');

  // MarianMT State
  const [downloadedPairs, setDownloadedPairs] = useState<string[]>([]);
  const [activePairId, setActivePairId] = useState<string | null>(null);
  const [downloadingPairId, setDownloadingPairId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [filterGroup, setFilterGroup] = useState<'all' | 'tr' | 'en'>('all');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadMarianStatus = useCallback(async () => {
    try {
      const [downloaded, active] = await Promise.all([
        getDownloadedMarianModels(),
        getActiveMarianModel()
      ]);
      setDownloadedPairs(downloaded);
      setActivePairId(active);
    } catch (err) {
      console.warn('Failed to load Marian models status:', err);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    loadMarianStatus();

    const handleModelChange = () => {
      loadMarianStatus();
    };

    window.addEventListener(MARIAN_MODEL_CHANGED_EVENT, handleModelChange);
    return () => {
      window.removeEventListener(MARIAN_MODEL_CHANGED_EVENT, handleModelChange);
    };
  }, [isOpen, loadMarianStatus]);

  const filteredMarianModels = useMemo(() => {
    if (filterGroup === 'all') return MARIAN_MODEL_PAIRS;
    return MARIAN_MODEL_PAIRS.filter((p) => p.targetGroup === filterGroup);
  }, [filterGroup]);

  const handleDownloadMarian = async (pair: MarianModelPair) => {
    try {
      setErrorMsg(null);
      setDownloadingPairId(pair.id);
      setDownloadProgress(1);

      await downloadMarianModel(pair.id, (pct) => {
        setDownloadProgress(pct);
      });

      await loadMarianStatus();
    } catch (err: any) {
      setErrorMsg(err?.message || t('modelDownloadError'));
    } finally {
      setDownloadingPairId(null);
      setDownloadProgress(0);
    }
  };

  const handleDeleteMarian = async (pair: MarianModelPair) => {
    try {
      const ok = window.confirm(t('deleteTranslationModelConfirm'));
      if (!ok) return;

      setErrorMsg(null);
      await deleteMarianModel(pair.id);
      await loadMarianStatus();
    } catch (err: any) {
      setErrorMsg(err?.message || t('modelDeleteError'));
    }
  };

  const handleActivateMarian = async (pairId: string) => {
    try {
      setErrorMsg(null);
      await setActiveMarianModel(pairId);
      setActivePairId(pairId);
    } catch (err: any) {
      setErrorMsg(err?.message || t('modelActivateError'));
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div 
        className="relative w-full max-w-2xl max-h-[92vh] overflow-y-auto custom-scrollbar bg-neutral-900 border border-neutral-700/70 rounded-3xl p-5 sm:p-7 shadow-2xl space-y-5 text-left"
        onClick={(e) => e.stopPropagation()}
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

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 p-1 bg-neutral-950/60 border border-white/5 rounded-2xl">
          <button
            onClick={() => setActiveTab('whisper')}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
              activeTab === 'whisper'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                : 'text-neutral-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Cpu className="w-4 h-4" />
            <span>{t('tabWhisperModels')}</span>
          </button>
          <button
            onClick={() => setActiveTab('translation')}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
              activeTab === 'translation'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                : 'text-neutral-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Globe className="w-4 h-4" />
            <span>{t('tabTranslationModels')}</span>
          </button>
        </div>

        {/* Tab 1: Whisper STT Content */}
        {activeTab === 'whisper' && (
          <div className="space-y-4">
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

            {/* Embedded Whisper Offline Model Manager */}
            <div className="pt-1">
              <OfflineModelSection />
            </div>
          </div>
        )}

        {/* Tab 2: MarianMT Offline Translation Content */}
        {activeTab === 'translation' && (
          <div className="space-y-4">
            {/* MarianMT Explanation Banner */}
            <div className="p-3.5 rounded-2xl bg-slate-800/50 border border-white/5 flex items-center justify-between gap-3 text-xs text-slate-300">
              <div className="flex items-center gap-2.5">
                <Globe className="w-4 h-4 text-indigo-400 shrink-0" />
                <span className="leading-normal">
                  {t('offlineTranslationDesc')}
                </span>
              </div>
              <div className="hidden sm:flex items-center gap-1 text-[11px] text-emerald-400 font-medium shrink-0">
                <ShieldCheck size={14} />
                <span>{t('private100')}</span>
              </div>
            </div>

            {/* Error Message */}
            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Filter Pills */}
            <div className="flex items-center gap-2 pb-1">
              <button
                onClick={() => setFilterGroup('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition cursor-pointer ${
                  filterGroup === 'all'
                    ? 'bg-neutral-700 text-white'
                    : 'bg-neutral-800/60 text-neutral-400 hover:text-white'
                }`}
              >
                {t('filterAll')}
              </button>
              <button
                onClick={() => setFilterGroup('tr')}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
                  filterGroup === 'tr'
                    ? 'bg-neutral-700 text-white'
                    : 'bg-neutral-800/60 text-neutral-400 hover:text-white'
                }`}
              >
                <span>🇹🇷</span>
                <span>{t('filterTargetTr')}</span>
              </button>
              <button
                onClick={() => setFilterGroup('en')}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
                  filterGroup === 'en'
                    ? 'bg-neutral-700 text-white'
                    : 'bg-neutral-800/60 text-neutral-400 hover:text-white'
                }`}
              >
                <span>🇬🇧</span>
                <span>{t('filterTargetEn')}</span>
              </button>
            </div>

            {/* MarianMT Models Cards Grid */}
            <div className="space-y-2.5 max-h-[50vh] overflow-y-auto pr-1 custom-scrollbar">
              {filteredMarianModels.map((pair) => {
                const isDownloaded = downloadedPairs.includes(pair.id);
                const isActive = activePairId === pair.id;
                const isDownloading = downloadingPairId === pair.id;

                return (
                  <div
                    key={pair.id}
                    className={`p-3.5 rounded-2xl border transition ${
                      isActive
                        ? 'bg-emerald-950/20 border-emerald-500/40 shadow-sm'
                        : isDownloaded
                        ? 'bg-neutral-800/40 border-neutral-700/60'
                        : 'bg-neutral-900/60 border-neutral-800/80 hover:border-neutral-700/50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      {/* Left: Language Pair Info */}
                      <div className="min-w-0 flex items-center gap-3">
                        <div className="flex items-center gap-1 text-lg shrink-0 px-2.5 py-1.5 rounded-xl bg-neutral-800/80 border border-white/5">
                          <span>{pair.sourceFlag}</span>
                          <span className="text-neutral-500 text-xs">➔</span>
                          <span>{pair.targetFlag}</span>
                        </div>
                        <div className="truncate">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-white tracking-tight truncate">
                              {pair.sourceName} ➔ {pair.targetName}
                            </span>
                            {isActive && (
                              <span className="shrink-0 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                <span>{t('modelActive')}</span>
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-neutral-400 flex items-center gap-2 mt-0.5">
                            <span>~{pair.sizeMB} MB</span>
                            <span className="text-neutral-600">•</span>
                            <span>ONNX INT8 (q8)</span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        {isDownloading ? (
                          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-medium">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>%{downloadProgress}</span>
                          </div>
                        ) : isDownloaded ? (
                          <div className="flex items-center gap-1.5">
                            {!isActive && (
                              <button
                                onClick={() => handleActivateMarian(pair.id)}
                                className="px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 border border-white/5"
                              >
                                <Check className="w-3.5 h-3.5 text-neutral-400" />
                                <span>{t('modelActivate')}</span>
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteMarian(pair)}
                              className="p-2 text-neutral-400 hover:text-red-400 rounded-xl hover:bg-red-500/10 transition cursor-pointer"
                              title={t('deleteTranslationModel')}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleDownloadMarian(pair)}
                            disabled={downloadingPairId !== null}
                            className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer shadow-md shadow-indigo-600/20 flex items-center gap-1.5"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>{t('downloadTranslationModel')}</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Download Progress Bar */}
                    {isDownloading && (
                      <div className="mt-3 pt-2 border-t border-neutral-800">
                        <div className="w-full bg-neutral-800 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-indigo-500 h-1.5 rounded-full transition-all duration-300 ease-out"
                            style={{ width: `${downloadProgress}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

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
