import React, { useState, useEffect, useCallback } from 'react';
import { 
  Globe, 
  Download, 
  Trash2, 
  CheckCircle2, 
  Check, 
  Zap, 
  Sparkles, 
  AlertCircle,
  Cpu
} from 'lucide-react';
import { useTranslation, type TranslationKey } from '@lexiduo/core';
import { 
  WHISPER_TIERS,
  type WhisperTierKey,
  type WhisperTierConfig,
  type OfflineModelStatus,
  getActiveWhisperTier,
  setActiveWhisperTier,
  getWhisperTierStatus,
  downloadWhisperTier,
  deleteWhisperTier,
  isTierSupportedOnCurrentDevice,
  WHISPER_TIER_CHANGED_EVENT
} from '../services/offlineTranslationEngine';
import { getDeviceHardwareProfile, type DeviceHardwareProfile } from '../services/nativeWhisperBridge';

const TIER_KEYS = Object.keys(WHISPER_TIERS) as WhisperTierKey[];

const TIER_I18N: Record<WhisperTierKey, { taglineKey: TranslationKey; descKey: TranslationKey; deviceKey: TranslationKey }> = {
  tiny: { taglineKey: 'tierTinyTagline', descKey: 'tierTinyDesc', deviceKey: 'tierTinyDevice' },
  base: { taglineKey: 'tierBaseTagline', descKey: 'tierBaseDesc', deviceKey: 'tierBaseDevice' },
  small: { taglineKey: 'tierSmallTagline', descKey: 'tierSmallDesc', deviceKey: 'tierSmallDevice' },
  'large-v3-turbo': { taglineKey: 'tierTurboTagline', descKey: 'tierTurboDesc', deviceKey: 'tierTurboDevice' },
};

export const OfflineModelSection: React.FC = () => {
  const { t } = useTranslation();

  const [activeTierId, setActiveTierId] = useState<string>('tiny');
  const [statuses, setStatuses] = useState<Record<string, OfflineModelStatus>>({});
  const [downloadingTierId, setDownloadingTierId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [hardwareProfile, setHardwareProfile] = useState<DeviceHardwareProfile | null>(null);

  const loadStatuses = useCallback(async () => {
    try {
      const activeId = await getActiveWhisperTier();
      setActiveTierId(activeId);

      const statusMap: Record<string, OfflineModelStatus> = {};
      await Promise.all(
        TIER_KEYS.map(async (key) => {
          const st = await getWhisperTierStatus(key);
          statusMap[key] = st;
        })
      );
      setStatuses(statusMap);
    } catch (err) {
      console.warn('Failed to load Whisper tiers status:', err);
    }
  }, []);

  useEffect(() => {
    loadStatuses();
    getDeviceHardwareProfile().then(setHardwareProfile).catch(() => {});

    const handleTierChange = () => {
      loadStatuses();
    };

    window.addEventListener(WHISPER_TIER_CHANGED_EVENT, handleTierChange);
    return () => {
      window.removeEventListener(WHISPER_TIER_CHANGED_EVENT, handleTierChange);
    };
  }, [loadStatuses]);

  const handleActivate = async (tierId: string) => {
    try {
      setErrorMsg(null);
      const support = isTierSupportedOnCurrentDevice(tierId, hardwareProfile);
      if (!support.supported) {
        setErrorMsg(support.message || t('modelActivateError'));
        return;
      }
      await setActiveWhisperTier(tierId);
      setActiveTierId(tierId);
      await loadStatuses();
    } catch (err: any) {
      setErrorMsg(err?.message || t('modelActivateError'));
    }
  };

  const handleDownload = async (tierId: string) => {
    try {
      setErrorMsg(null);
      setDownloadingTierId(tierId);
      setDownloadProgress(1);

      const success = await downloadWhisperTier(tierId, (p) => {
        setDownloadProgress(p);
      });

      if (!success) {
        setErrorMsg(t('modelDownloadError'));
      } else {
        await loadStatuses();
      }
    } catch (err: any) {
      setErrorMsg(err?.message || t('downloadError'));
    } finally {
      setDownloadingTierId(null);
    }
  };

  const handleDelete = async (tier: WhisperTierConfig) => {
    const confirmMsg = t('deleteModelConfirm');

    if (confirm(confirmMsg)) {
      try {
        setErrorMsg(null);
        await deleteWhisperTier(tier.id);
        await loadStatuses();
      } catch (err: any) {
        setErrorMsg(err?.message || t('modelDeleteError'));
      }
    }
  };

  const isAnyDownloading = downloadingTierId !== null;
  const activeConfig = WHISPER_TIERS[activeTierId as WhisperTierKey] || WHISPER_TIERS.tiny;
  const isActiveDownloaded = statuses[activeTierId]?.isDownloaded ?? false;

  return (
    <div className="p-4 sm:p-5 rounded-2xl bg-indigo-950/30 border border-indigo-500/20 space-y-4 text-left">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 text-indigo-300 font-bold text-sm">
          <Globe className="w-4 h-4 text-indigo-400 shrink-0" />
          <span>{t('offlineModelsTitle')}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[11px] px-2.5 py-1 rounded-full border font-semibold inline-flex items-center gap-1.5 ${
            isActiveDownloaded
              ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300'
              : 'bg-slate-800 border-white/10 text-slate-400'
          }`}>
            <Cpu className="w-3.5 h-3.5 text-indigo-400" />
            <span>
              {isActiveDownloaded
                ? `${t('modelActive')}: ${activeConfig.name}`
                : t('modelSelectOrDownload')}
            </span>
          </span>
        </div>
      </div>

      <p className="text-xs text-slate-300 leading-relaxed">
        {t('offlineModelsDesc')}
      </p>

      {/* Dynamic Device Hardware Profile & Tier Badge */}
      {hardwareProfile ? (
        <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-xl border text-xs leading-relaxed ${
          hardwareProfile.tier === 1
            ? 'bg-gradient-to-r from-emerald-500/15 via-teal-500/15 to-indigo-500/15 border-emerald-500/30 text-emerald-200'
            : hardwareProfile.tier === 2
            ? 'bg-gradient-to-r from-blue-500/15 via-indigo-500/15 to-purple-500/15 border-blue-500/30 text-blue-200'
            : hardwareProfile.tier === 3
            ? 'bg-gradient-to-r from-amber-500/15 via-orange-500/15 to-slate-800 border-amber-500/30 text-amber-200'
            : 'bg-slate-900 border-white/10 text-slate-300'
        }`}>
          <div className="flex items-center gap-2.5">
            <Cpu className="w-4 h-4 shrink-0 text-indigo-400" />
            <div>
              <span className="font-bold text-white mr-2">
                {hardwareProfile.deviceModel} ({Math.round(hardwareProfile.totalRamMb / 1024)} GB RAM)
              </span>
              <span className="text-[11px] font-medium opacity-90 block sm:inline">
                {hardwareProfile.tier === 1 && t('hardwareTierFlagship')}
                {hardwareProfile.tier === 2 && t('hardwareTierBalanced')}
                {hardwareProfile.tier === 3 && t('hardwareTierLowMemory')}
                {hardwareProfile.tier === 4 && t('hardwareTierCloudRecommended')}
              </span>
            </div>
          </div>
          <span className="self-start sm:self-center text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-white/10 text-white font-semibold shrink-0 border border-white/10">
            Tier {hardwareProfile.tier}
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2.5 p-3 rounded-xl bg-gradient-to-r from-amber-500/15 via-indigo-500/15 to-purple-500/15 border border-amber-500/30 text-amber-200">
          <Zap className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
          <span className="text-xs font-semibold leading-relaxed">
            {t('flagshipBanner')}
          </span>
        </div>
      )}

      {/* Error message */}
      {errorMsg && (
        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* 4 Model Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
        {TIER_KEYS.map((key) => {
          const tier = WHISPER_TIERS[key];
          const status = statuses[key] || { isDownloaded: false, modelName: tier.name };
          const isDownloaded = status.isDownloaded;
          const isCurrentActive = isDownloaded && activeTierId === key;
          const isThisDownloading = downloadingTierId === key;

          return (
            <div
              key={tier.id}
              className={`p-3.5 rounded-2xl border transition-all flex flex-col justify-between space-y-3 ${
                isCurrentActive
                  ? 'border-indigo-500/60 bg-indigo-950/50 shadow-md shadow-indigo-950/40 ring-1 ring-indigo-500/30'
                  : isDownloaded
                  ? 'border-emerald-500/30 bg-slate-900/70 hover:border-emerald-500/50'
                  : 'border-white/10 bg-slate-900/40 hover:border-white/20'
              }`}
            >
              <div className="space-y-2">
                {/* Title & Status Badge */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-bold text-white flex items-center gap-1.5 flex-wrap">
                      <span>{tier.name}</span>
                      <span className="text-xs font-mono font-normal text-slate-400">(~{tier.sizeMB} MB)</span>
                    </h4>
                    <div className="flex items-center gap-1.5 flex-wrap mt-1">
                      <span className="text-[10px] font-semibold text-indigo-300 bg-indigo-500/15 px-2 py-0.5 rounded-md">
                        {t(TIER_I18N[key].taglineKey)}
                      </span>
                      <span className="text-[10px] text-slate-300">
                        • {t(TIER_I18N[key].descKey)}
                      </span>
                    </div>
                  </div>

                  {isCurrentActive ? (
                    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold shrink-0 border border-emerald-500/30">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      <span>{t('modelActive')}</span>
                    </span>
                  ) : isDownloaded ? (
                    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 font-medium shrink-0 border border-cyan-500/25">
                      <Check className="w-3 h-3 text-cyan-400" />
                      <span>{t('modelDownloaded')}</span>
                    </span>
                  ) : (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-medium shrink-0">
                      {t('modelNotDownloaded')}
                    </span>
                  )}
                </div>

                {/* Device Hardware Load Indicator */}
                <div className="flex items-center justify-between text-xs py-1 px-2 rounded-xl bg-slate-950/40 border border-white/5">
                  <span className="text-[10px] text-slate-400">{t('deviceLoad')}:</span>
                  <div className="flex items-center gap-1.5">
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((lvl) => (
                        <span
                          key={lvl}
                          className={`w-2.5 h-1.5 rounded-xs transition-colors ${
                            lvl <= tier.hardwareLoad
                              ? tier.hardwareLoad >= 5
                                ? 'bg-purple-400'
                                : tier.hardwareLoad >= 3
                                ? 'bg-amber-400'
                                : 'bg-emerald-400'
                              : 'bg-slate-700/60'
                          }`}
                        />
                      ))}
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 font-semibold">({tier.hardwareLoad}/5)</span>
                  </div>
                </div>

                {/* RAM Requirements */}
                <div className="flex items-center justify-between py-1 px-2 rounded-xl bg-slate-950/40 border border-white/5 text-[10px]">
                  <span className="text-slate-400 flex items-center gap-1 font-medium">
                    <Cpu className="w-3 h-3 text-slate-400 shrink-0" />
                    <span>RAM:</span>
                  </span>
                  <span className="text-slate-200">
                    <span className="text-slate-400">{t('minRamLabel')}:</span> <span className="font-semibold text-white">{tier.minRam}</span>
                    <span className="text-slate-500 mx-1">•</span>
                    <span className="text-slate-400">{t('recommendedRamLabel')}:</span> <span className="font-semibold text-indigo-300">{tier.recRam}</span>
                  </span>
                </div>

                {/* Recommended Device/SoC */}
                <div className="py-1 px-2 rounded-xl bg-slate-950/40 border border-white/5 flex items-start gap-1.5 text-[10px]">
                  <span className="text-slate-400 shrink-0 font-medium">{t('recommendedDeviceLabel')}:</span>
                  <span className="text-slate-300 font-medium leading-tight">
                    {t(TIER_I18N[key].deviceKey)}
                  </span>
                </div>

                {/* Studio Recommendation Note (Whisper Small) */}
                {tier.isStudioRecommended && (
                  <div className="flex items-center gap-1.5 text-[10px] text-cyan-300 font-medium">
                    <Sparkles className="w-3 h-3 text-cyan-400 shrink-0" />
                    <span>{t('studioIdeal')}</span>
                  </div>
                )}

                {/* Flagship Recommendation Note (Whisper Large v3 Turbo) */}
                {tier.isFlagshipRecommended && (
                  <div className="flex items-center gap-1.5 text-[10px] text-amber-300 font-medium">
                    <Sparkles className="w-3 h-3 text-amber-400 shrink-0" />
                    <span>{t('flagshipIdeal')}</span>
                  </div>
                )}

                {/* Dynamic Hardware Advisory Badge for Large v3 Turbo */}
                {tier.id === 'large-v3-turbo' && (
                  <div className={`py-1.5 px-2.5 rounded-xl border text-[10px] leading-tight ${
                    !hardwareProfile || hardwareProfile.tier === 1
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 font-medium'
                      : hardwareProfile.tier === 2
                        ? 'bg-blue-500/10 border-blue-500/20 text-blue-300 font-medium'
                        : 'bg-amber-500/10 border-amber-500/20 text-amber-300'
                  }`}>
                    <span>
                      {!hardwareProfile || hardwareProfile.tier === 1
                        ? `⚡ ${t('largeModelFlagshipReady')}`
                        : hardwareProfile.tier === 2
                          ? `ℹ️ ${t('largeModelBalancedNote')}`
                          : `⚠️ ${t('largeModelLowMemoryNote')}`}
                    </span>
                  </div>
                )}

                {/* Mobile CPU Performance Advisory for Heavy Models (Small & Large v3 Turbo) */}
                {(tier.id === 'small' || tier.id === 'large-v3-turbo') && (
                  <div className="py-1.5 px-2.5 rounded-xl border border-amber-500/25 bg-amber-500/10 text-amber-200 text-[10px] leading-tight flex items-start gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <span className="leading-snug">{t('heavyModelGuidanceNotice')}</span>
                  </div>
                )}
              </div>

              {/* Action Buttons & Progress */}
              <div className="pt-2 border-t border-white/5">
                {isThisDownloading ? (
                  <div className="space-y-1.5">
                    <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400 transition-all duration-200"
                        style={{ width: `${downloadProgress}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[11px] text-indigo-300">
                      <span>{t('modelDownloading')}</span>
                      <span className="font-mono">%{downloadProgress}</span>
                    </div>
                  </div>
                ) : isDownloaded ? (
                  <div className="flex items-center justify-between gap-2">
                    {isCurrentActive ? (
                      <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>{t('modelCurrentlyInUse')}</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleActivate(tier.id)}
                        disabled={isAnyDownloading}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-colors cursor-pointer active:scale-95 disabled:opacity-50"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>{t('modelActivate')}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDelete(tier)}
                      disabled={isAnyDownloading}
                      className="inline-flex items-center gap-1 p-1.5 px-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
                      title={t('modelRemove')}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span className="text-[11px]">{t('modelRemove')}</span>
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleDownload(tier.id)}
                    disabled={isAnyDownloading}
                    className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-slate-800 hover:bg-indigo-600 text-slate-200 hover:text-white font-semibold text-xs transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{t('modelDownload')} (~{tier.sizeMB} MB)</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
