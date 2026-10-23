import React, { useEffect, useState, useCallback } from 'react';
import { 
  Layers, 
  Bell, 
  ShieldAlert, 
  CheckCircle2, 
  ExternalLink, 
  X, 
  Sparkles,
  Info,
  Battery,
  Settings as SettingsIcon,
  ShieldCheck
} from 'lucide-react';
import { 
  checkFloatingPermissions, 
  requestOverlayPermission, 
  requestNotificationAccess, 
  requestAccessibility,
  requestNotificationPermission,
  requestBatteryOptimization,
  openAppSettings,
  type FloatingPermissionsStatus 
} from '../services/floatingSubtitleService';
import { useTranslation } from '../i18n/useTranslation';

export interface FloatingPermissionGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLaunchFloating?: () => void;
  mode?: 'guide' | 'manage';
}

export const FloatingPermissionGuideModal: React.FC<FloatingPermissionGuideModalProps> = ({
  isOpen,
  onClose,
  onLaunchFloating,
  mode = 'guide'
}) => {
  const { t } = useTranslation();
  const [status, setStatus] = useState<FloatingPermissionsStatus>({
    overlay: false,
    notification: false,
    accessibility: false,
    postNotifications: false,
    batteryOptimization: false,
    allGranted: false
  });
  const [loading, setLoading] = useState(true);

  const refreshPermissions = useCallback(async () => {
    try {
      const res = await checkFloatingPermissions();
      setStatus(res);
    } catch (err) {
      console.warn('[FloatingGuide] Failed to check permissions:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    refreshPermissions();

    // Check again when user returns from system settings
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshPermissions();
      }
    };

    const interval = setInterval(refreshPermissions, 2000);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isOpen, refreshPermissions]);

  if (!isOpen) return null;

  const canLaunch = status.overlay;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-md animate-fade-in pointer-events-auto">
      <div 
        className="relative w-full max-w-lg max-h-[92vh] bg-slate-900 border border-white/10 rounded-3xl p-4 sm:p-6 shadow-2xl overflow-y-auto custom-scrollbar flex flex-col space-y-4 animate-in fade-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 sm:top-5 sm:right-5 p-2 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          aria-label={t('close')}
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center space-x-3 pr-8">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20 shrink-0">
            {mode === 'manage' ? (
              <ShieldCheck className="w-6 h-6 text-slate-950 stroke-[2.5]" />
            ) : (
              <Layers className="w-6 h-6 text-slate-950 stroke-[2.5]" />
            )}
          </div>
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">
              {mode === 'manage' ? t('permissionsManagementTitle') : t('floatingSubtitleModeTitle')}
            </h2>
            <p className="text-xs text-slate-400">
              {mode === 'manage' ? t('permissionsManagementDesc') : t('floatingSubtitleModeDesc')}
            </p>
          </div>
        </div>

        {/* Android 13-16 Notice */}
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-3.5 flex items-start space-x-3 text-xs text-amber-200/90 leading-relaxed">
          <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-amber-300 block mb-0.5">
              {t('android13WarningTitle')}
            </span>
            {t('android13WarningDesc')}
          </div>
        </div>

        {/* Permission Cards */}
        <div className="space-y-3">
          {/* 1. Overlay Permission */}
          <div className="bg-slate-800/60 border border-white/5 rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                status.overlay ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700/50 text-slate-400'
              }`}>
                {status.overlay ? <CheckCircle2 className="w-5 h-5" /> : <Layers className="w-4 h-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-semibold text-white leading-snug">{t('overlayPermTitle')}</span>
                  <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-red-500/20 text-red-300">{t('required')}</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed mt-1">
                  {t('overlayPermDesc')}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end sm:justify-start shrink-0 pt-0.5 sm:pt-0">
              {status.overlay ? (
                <span className="text-xs font-bold text-emerald-400 px-3 py-1.5 bg-emerald-500/10 rounded-xl">
                  {t('modelActive')}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={requestOverlayPermission}
                  className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 text-xs font-bold rounded-xl bg-emerald-500 text-slate-950 hover:bg-emerald-400 transition-colors shrink-0 cursor-pointer shadow-md shadow-emerald-500/20 active:scale-95"
                >
                  <span>{t('grantPermission')}</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* 2. Notification Access */}
          <div className="bg-slate-800/60 border border-white/5 rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                status.notification ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700/50 text-slate-400'
              }`}>
                {status.notification ? <CheckCircle2 className="w-5 h-5" /> : <Bell className="w-4 h-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-semibold text-white leading-snug">{t('notificationPermTitle')}</span>
                  <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-300">{t('recommended')}</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed mt-1">
                  {t('notificationPermDesc')}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end sm:justify-start shrink-0 pt-0.5 sm:pt-0">
              {status.notification ? (
                <span className="text-xs font-bold text-emerald-400 px-3 py-1.5 bg-emerald-500/10 rounded-xl">
                  {t('modelActive')}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={requestNotificationAccess}
                  className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 text-xs font-bold rounded-xl bg-slate-700 text-white hover:bg-slate-600 transition-colors shrink-0 cursor-pointer active:scale-95"
                >
                  <span>{t('grantPermission')}</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* 3. Accessibility Scanner */}
          <div className="bg-slate-800/60 border border-white/5 rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                status.accessibility ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700/50 text-slate-400'
              }`}>
                {status.accessibility ? <CheckCircle2 className="w-5 h-5" /> : <ShieldAlert className="w-4 h-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-semibold text-white leading-snug">{t('accessibilityPermTitle')}</span>
                  <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">{t('optional')}</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed mt-1">
                  {t('accessibilityPermDesc')}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end sm:justify-start shrink-0 pt-0.5 sm:pt-0">
              {status.accessibility ? (
                <span className="text-xs font-bold text-emerald-400 px-3 py-1.5 bg-emerald-500/10 rounded-xl">
                  {t('modelActive')}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={requestAccessibility}
                  className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 text-xs font-bold rounded-xl bg-slate-700 text-white hover:bg-slate-600 transition-colors shrink-0 cursor-pointer active:scale-95"
                >
                  <span>{t('grantPermission')}</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* 4. Post Notifications Permission */}
          <div className="bg-slate-800/60 border border-white/5 rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                status.postNotifications ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700/50 text-slate-400'
              }`}>
                {status.postNotifications ? <CheckCircle2 className="w-5 h-5" /> : <Bell className="w-4 h-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-semibold text-white leading-snug">{t('postNotificationsPermTitle')}</span>
                  <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-300">{t('recommended')}</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed mt-1">
                  {t('postNotificationsPermDesc')}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end sm:justify-start shrink-0 pt-0.5 sm:pt-0">
              {status.postNotifications ? (
                <span className="text-xs font-bold text-emerald-400 px-3 py-1.5 bg-emerald-500/10 rounded-xl">
                  {t('modelActive')}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={requestNotificationPermission}
                  className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 text-xs font-bold rounded-xl bg-slate-700 text-white hover:bg-slate-600 transition-colors shrink-0 cursor-pointer active:scale-95"
                >
                  <span>{t('grantPermission')}</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* 5. Battery Optimization Exemption */}
          <div className="bg-slate-800/60 border border-white/5 rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                status.batteryOptimization ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700/50 text-slate-400'
              }`}>
                {status.batteryOptimization ? <CheckCircle2 className="w-5 h-5" /> : <Battery className="w-4 h-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-semibold text-white leading-snug">{t('batteryOptimizationPermTitle')}</span>
                  <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">{t('optional')}</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed mt-1">
                  {t('batteryOptimizationPermDesc')}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end sm:justify-start shrink-0 pt-0.5 sm:pt-0">
              {status.batteryOptimization ? (
                <span className="text-xs font-bold text-emerald-400 px-3 py-1.5 bg-emerald-500/10 rounded-xl">
                  {t('modelActive')}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={requestBatteryOptimization}
                  className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 text-xs font-bold rounded-xl bg-slate-700 text-white hover:bg-slate-600 transition-colors shrink-0 cursor-pointer active:scale-95"
                >
                  <span>{t('grantPermission')}</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* 6. Open System App Settings (Direct bridge for Android 13+ restricted settings) */}
          <div className="bg-gradient-to-r from-slate-800/90 to-slate-800/50 border border-white/10 rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 bg-indigo-500/20 text-indigo-400">
                <SettingsIcon className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-sm font-semibold text-white block leading-snug">{t('openSystemAppSettings')}</span>
                <p className="text-xs text-slate-400 leading-relaxed mt-1">
                  {t('openSystemAppSettingsDesc')}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end sm:justify-start shrink-0 pt-0.5 sm:pt-0">
              <button
                type="button"
                onClick={openAppSettings}
                className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 text-xs font-bold rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 transition-colors shrink-0 cursor-pointer shadow-md shadow-indigo-600/20 active:scale-95"
              >
                <span>{t('manage')}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-2 flex items-center justify-end space-x-3">
          {mode === 'manage' ? (
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 rounded-2xl text-xs font-bold bg-white/10 hover:bg-white/15 text-white transition-all cursor-pointer active:scale-95 shadow-md"
            >
              {t('close')}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-2xl text-xs font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                {t('giveUp')}
              </button>
              
              <button
                type="button"
                disabled={!canLaunch || loading}
                onClick={() => {
                  onLaunchFloating?.();
                  onClose();
                }}
                className={`inline-flex items-center space-x-2 px-5 py-2.5 rounded-2xl text-xs font-bold transition-all shadow-lg cursor-pointer ${
                  canLaunch
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 shadow-emerald-500/25 hover:brightness-110 active:scale-95'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed shadow-none'
                }`}
              >
                <Sparkles className="w-4 h-4" />
                <span>{t('launchFloating')}</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
