import React, { useState } from 'react';
import { Settings, X, Eye, EyeOff, Sparkles, Globe, Languages, Cpu, ExternalLink, ShieldCheck, Lock, ChevronDown, ChevronUp, HelpCircle, CheckCircle2, AlertCircle, AlertTriangle, WifiOff, Loader2 } from 'lucide-react';
import { useTranslation } from '../i18n/TranslationContext';
import type { Language } from '../i18n/translations';
import { SUPPORTED_LANGUAGES } from '../i18n/languages';
import { CustomSelect, type SelectOption } from './CustomSelect';
import { useAppStore } from '../store/useAppStore';
import { testGeminiApiKey, type ApiKeyStatus } from '../services/geminiService';

import { persistApiKey } from '../services/apiKeyStorage';
import { set } from 'idb-keyval';

const LANGUAGE_OPTIONS: SelectOption[] = SUPPORTED_LANGUAGES.map(l => ({
  value: l.code,
  label: `${l.nativeName} (${l.name})`
}));

export interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave?: (key: string) => void;
  currentKey?: string;
  extraSections?: React.ReactNode;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ 
  isOpen, 
  onClose, 
  onSave, 
  currentKey, 
  extraSections 
}) => {
  const { t, language, setLanguage } = useTranslation();
  const storeApiKey = useAppStore(s => s.apiKey);
  const targetLang = useAppStore(s => s.targetLang);
  const setTargetLang = useAppStore(s => s.setTargetLang);
  const initialKey = currentKey !== undefined ? currentKey : storeApiKey;
  const [key, setKey] = useState(initialKey);
  const [showKey, setShowKey] = useState(false);
  const [showGuide, setShowGuide] = useState(!initialKey.trim());
  const [testStatus, setTestStatus] = useState<ApiKeyStatus>('idle');

  // Sync state if initialKey changes
  React.useEffect(() => {
    if (isOpen) {
      setKey(currentKey !== undefined ? currentKey : storeApiKey);
      setTestStatus('idle');
    }
  }, [isOpen, currentKey, storeApiKey]);

  const handleTestKey = async () => {
    const clean = key.trim();
    if (!clean) return;
    setTestStatus('testing');
    try {
      const res = await testGeminiApiKey(clean);
      setTestStatus(res.status);
    } catch {
      setTestStatus('network_error');
    }
  };

  if (!isOpen) return null;

  const handleSave = () => {
    const trimmed = key.trim();
    useAppStore.getState().setApiKey(trimmed);
    persistApiKey(trimmed).catch(() => {});
    if (onSave) {
      onSave(trimmed);
    }
    onClose();
  };

  const hasCustomKey = Boolean(key.trim());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-md animate-in fade-in duration-200" onClick={onClose}>
      <div 
        className="w-full max-w-md max-h-[92vh] overflow-y-auto custom-scrollbar bg-slate-900/95 backdrop-blur-3xl border border-white/10 rounded-3xl p-5 sm:p-7 shadow-[0_20px_50px_rgba(0,0,0,0.6)] ring-1 ring-white/5 animate-in zoom-in-95 duration-200 space-y-5"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3 text-red-500">
            <div className="p-2 bg-red-500/10 rounded-full">
              <Settings size={22} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">{t('appSettings')}</h2>
              <p className="text-xs text-slate-400">{t('appSettingsDesc')}</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition-all active:scale-90 cursor-pointer"
          >
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>

        {/* Translation Engine Status */}
        <div className="bg-black/40 border border-white/10 rounded-2xl p-3.5 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <Cpu className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-medium text-slate-300">{t('activeEngineLabel')}</span>
          </div>
          <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5 ${
            hasCustomKey 
              ? testStatus === 'valid'
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                : testStatus === 'invalid'
                ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                : testStatus === 'rate_limited'
                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                : 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30'
              : 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${
              hasCustomKey && testStatus === 'valid' 
                ? 'bg-emerald-400 animate-pulse' 
                : hasCustomKey && testStatus === 'invalid'
                ? 'bg-red-400'
                : hasCustomKey && testStatus === 'rate_limited'
                ? 'bg-amber-400'
                : 'bg-indigo-400'
            }`} />
            {hasCustomKey 
              ? testStatus === 'valid'
                ? t('gemmaActiveBadge')
                : testStatus === 'invalid'
                ? t('apiKeyStatusInvalid')
                : testStatus === 'rate_limited'
                ? t('apiKeyStatusRateLimit')
                : `${t('gemmaActiveBadge')} (${t('apiKeyNotTested')})`
              : t('engineStandard')}
          </span>
        </div>

        {/* Interface Language */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
            <Globe size={14} className="text-slate-400" />
            <span>{t('interfaceLanguage')}</span>
          </label>
          <CustomSelect
            value={language}
            onChange={(val) => setLanguage(val as Language)}
            options={LANGUAGE_OPTIONS}
            direction="down"
            searchable={true}
            searchPlaceholder={t('searchLanguagePlaceholder')}
          />
        </div>

        {/* Target Subtitle Language */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
            <Languages size={14} className="text-indigo-400" />
            <span>{t('targetLang')}</span>
          </label>
          <CustomSelect
            value={targetLang}
            onChange={(val) => {
              setTargetLang(val);
              set('target_lang', val).catch(() => {});
            }}
            options={LANGUAGE_OPTIONS}
            direction="down"
            searchable={true}
            placeholder={t('selectLanguage')}
            searchPlaceholder={t('searchLanguagePlaceholder')}
          />
        </div>

        {/* Gemini / Gemma API Key Input */}
        <div className="space-y-2.5">
          <div className="flex justify-between items-center px-0.5">
            <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <Sparkles size={14} className="text-yellow-400" />
              <span>{t('geminiApiKeyTitle')}</span>
            </label>
            <button 
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="text-[11px] text-slate-400 hover:text-white flex items-center space-x-1 transition-colors cursor-pointer"
            >
              {showKey ? <><EyeOff size={13}/><span>{t('hide')}</span></> : <><Eye size={13}/><span>{t('show')}</span></>}
            </button>
          </div>
          <input
            type={showKey ? "text" : "password"}
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              if (testStatus !== 'idle') setTestStatus('idle');
            }}
            placeholder={t('apiKeyPlaceholder')}
            className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 px-3 text-xs text-white font-mono placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-red-500 transition-all"
          />

          {/* Test API Key Button & Live Status Badge */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
            <button
              type="button"
              onClick={handleTestKey}
              disabled={!key.trim() || testStatus === 'testing'}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/15 disabled:opacity-40 text-white text-xs font-semibold rounded-xl border border-white/10 transition-all active:scale-95 cursor-pointer disabled:cursor-not-allowed"
            >
              {testStatus === 'testing' ? (
                <>
                  <Loader2 size={13} className="animate-spin text-red-400" />
                  <span>{t('testingApiKey')}</span>
                </>
              ) : (
                <>
                  <Sparkles size={13} className="text-yellow-400" />
                  <span>{t('testApiKeyBtn')}</span>
                </>
              )}
            </button>

            {testStatus !== 'idle' && (
              <div className={`text-[11px] font-medium px-2.5 py-1 rounded-xl flex items-center gap-1.5 border animate-in fade-in duration-200 ${
                testStatus === 'valid'
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                  : testStatus === 'rate_limited'
                  ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                  : 'bg-red-500/15 text-red-400 border-red-500/30'
              }`}>
                {testStatus === 'valid' && <CheckCircle2 size={13} className="shrink-0" />}
                {testStatus === 'invalid' && <AlertCircle size={13} className="shrink-0" />}
                {testStatus === 'rate_limited' && <AlertTriangle size={13} className="shrink-0" />}
                {testStatus === 'network_error' && <WifiOff size={13} className="shrink-0" />}
                <span>
                  {testStatus === 'valid' && t('apiKeyStatusValid')}
                  {testStatus === 'invalid' && t('apiKeyStatusInvalid')}
                  {testStatus === 'rate_limited' && t('apiKeyStatusRateLimit')}
                  {testStatus === 'network_error' && t('apiKeyStatusNetworkError')}
                </span>
              </div>
            )}
          </div>

          {/* Collapsible 3-Step Guide */}
          <button
            type="button"
            onClick={() => setShowGuide(!showGuide)}
            className="w-full flex items-center justify-between p-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/10 transition-all text-left cursor-pointer group"
          >
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-300 group-hover:text-white">
              <HelpCircle size={15} className="text-red-400" />
              <span>{t('howToGetApiKey')}</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <span className="text-red-400/90 font-medium">{showGuide ? t('hide') : t('show')}</span>
              {showGuide ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </div>
          </button>

          {showGuide && (
            <div className="p-3.5 rounded-2xl bg-black/50 border border-red-500/20 space-y-3 text-xs text-slate-300 animate-in fade-in duration-200">
              <div className="font-bold text-white text-xs flex items-center gap-1.5">
                <Sparkles size={14} className="text-yellow-400" />
                <span>{t('apiKeyGuideTitle')}</span>
              </div>

              <div className="space-y-2.5 text-[11px] text-slate-300 leading-relaxed">
                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">1</span>
                  <div className="flex-1">
                    <p>{t('apiKeyStep1')}</p>
                    <a
                      href="https://aistudio.google.com/apikey"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 mt-1.5 px-3 py-1 bg-red-600/20 hover:bg-red-600/30 text-red-400 hover:text-red-300 border border-red-500/30 rounded-lg text-[11px] font-bold transition-all"
                    >
                      <span>{t('getApiKeyBtn')}</span>
                      <ExternalLink size={12} />
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">2</span>
                  <p className="flex-1">{t('apiKeyStep2')}</p>
                </div>

                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">3</span>
                  <p className="flex-1">{t('apiKeyStep3')}</p>
                </div>
              </div>

              {/* Trust Badges */}
              <div className="pt-2 border-t border-white/5 flex flex-wrap gap-2 text-[10px]">
                <div className="flex items-center gap-1 text-emerald-400 font-medium">
                  <ShieldCheck size={12} className="shrink-0" />
                  <span>{t('apiKeyBadgeFree')}</span>
                </div>
                <div className="flex items-center gap-1 text-indigo-300 font-medium">
                  <Lock size={12} className="shrink-0" />
                  <span>{t('apiKeyBadgePrivacy')}</span>
                </div>
              </div>
            </div>
          )}

          <p className="text-[10px] text-slate-400 px-0.5 leading-relaxed">
            {t('apiKeyNote')} <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-red-400 hover:underline">Google AI Studio</a>
          </p>
        </div>

        {/* Optional Custom App-Specific Sections (e.g. Offline Model Download in Studio) */}
        {extraSections}

        {/* Footer Actions */}
        <div className="flex justify-end space-x-2.5 pt-2 border-t border-white/10">
          <button 
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-white/5 transition-all cursor-pointer"
          >
            {t('giveUp')}
          </button>
          <button 
            onClick={handleSave}
            className="bg-red-600 hover:bg-red-500 text-white text-xs font-bold py-2 px-6 rounded-xl shadow-[0_0_15px_rgba(239,68,68,0.3)] transition-all active:scale-95 cursor-pointer"
          >
            {t('save')}
          </button>
        </div>
      </div>
    </div>
  );
};
