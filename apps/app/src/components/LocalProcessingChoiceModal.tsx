import React, { useState } from 'react';
import { Cpu, Cloud, Key, X, Sparkles, CheckCircle2, Download, ShieldCheck } from 'lucide-react';
import { useTranslation } from '@ytceviri/core';

interface LocalProcessingChoiceModalProps {
  isOpen: boolean;
  fileName: string;
  fileSizeMb?: number;
  hasApiKey: boolean;
  activeWhisperTierName?: string;
  isWhisperDownloaded?: boolean;
  onSelectWhisper: () => void;
  onSelectCloudApi: (apiKey?: string) => void;
  onClose: () => void;
}

export const LocalProcessingChoiceModal: React.FC<LocalProcessingChoiceModalProps> = ({
  isOpen,
  fileName,
  fileSizeMb,
  hasApiKey,
  activeWhisperTierName = 'Whisper AI',
  isWhisperDownloaded = false,
  onSelectWhisper,
  onSelectCloudApi,
  onClose
}) => {
  const { t } = useTranslation();
  const [tempApiKey, setTempApiKey] = useState('');
  const [showKeyInput, setShowKeyInput] = useState(!hasApiKey);

  if (!isOpen) return null;

  const handleCloudSubmit = () => {
    if (hasApiKey) {
      onSelectCloudApi();
    } else if (tempApiKey.trim()) {
      onSelectCloudApi(tempApiKey.trim());
    } else {
      setShowKeyInput(true);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-xl bg-neutral-900 border border-neutral-700/60 rounded-3xl p-6 sm:p-8 shadow-2xl overflow-hidden">
        {/* Subtle decorative background gradient */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-red-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-neutral-800">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-red-500 animate-pulse" />
              <h2 className="text-xl font-bold text-white">{t('chooseSubtitleEngine')}</h2>
            </div>
            <p className="text-xs text-neutral-400 mt-1 max-w-md truncate">
              {fileName} {fileSizeMb ? `(${fileSizeMb.toFixed(1)} MB)` : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-white rounded-xl hover:bg-neutral-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Options Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-6">
          {/* Option 1: On-Device Whisper AI */}
          <div className="flex flex-col justify-between p-5 rounded-2xl bg-neutral-800/60 border border-neutral-700/60 hover:border-red-500/50 transition-all group">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400">
                  <Cpu className="w-6 h-6" />
                </div>
                {isWhisperDownloaded ? (
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                    <CheckCircle2 className="w-3 h-3" /> {t('readyBadge')}
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                    <Download className="w-3 h-3" /> {t('willDownloadBadge')}
                  </span>
                )}
              </div>
              <h3 className="text-base font-bold text-white mb-1">{t('onDeviceWhisperTitle')}</h3>
              <p className="text-xs text-neutral-400 leading-relaxed mb-3">
                {t('onDeviceWhisperDesc')}
              </p>
              <div className="flex items-center gap-1.5 text-[11px] text-neutral-400 bg-neutral-900/60 p-2 rounded-xl mb-4 border border-neutral-800">
                <ShieldCheck className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                <span className="truncate">Model: <strong>{activeWhisperTierName}</strong></span>
              </div>
            </div>

            <button
              onClick={onSelectWhisper}
              className="w-full py-2.5 px-4 rounded-xl bg-neutral-700 hover:bg-red-600 text-white font-semibold text-xs transition duration-200 shadow-md group-hover:bg-red-600 cursor-pointer"
            >
              {isWhisperDownloaded ? t('startWithWhisper') : t('downloadWhisperModelBtn')}
            </button>
          </div>

          {/* Option 2: Cloud Google Gemini API */}
          <div className="flex flex-col justify-between p-5 rounded-2xl bg-neutral-800/60 border border-neutral-700/60 hover:border-blue-500/50 transition-all group">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
                  <Cloud className="w-6 h-6" />
                </div>
                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                  <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                    <Sparkles className="w-2.5 h-2.5 text-amber-300" />
                    {t('recommendedBadge')}
                  </span>
                  {hasApiKey ? (
                    <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                      <Key className="w-3 h-3" /> {t('keySavedBadge')}
                    </span>
                  ) : (
                    <span className="text-[11px] font-semibold text-neutral-400 bg-neutral-700/30 px-2 py-0.5 rounded-full">
                      {t('zeroDownloadBadge')}
                    </span>
                  )}
                </div>
              </div>
              <h3 className="text-base font-bold text-white mb-1">{t('cloudGeminiTitle')}</h3>
              <p className="text-xs text-neutral-400 leading-relaxed mb-3">
                {t('cloudGeminiDesc')}
              </p>

              {(!hasApiKey || showKeyInput) && (
                <div className="mb-3 space-y-1">
                  <input
                    type="password"
                    placeholder={t('geminiKeyPlaceholderShort')}
                    value={tempApiKey}
                    onChange={(e) => setTempApiKey(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-xl bg-neutral-900 border border-neutral-700 text-white focus:outline-none focus:border-blue-500"
                  />
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] text-blue-400 hover:underline block text-right"
                  >
                    {t('getFreeApiKeyLink')}
                  </a>
                </div>
              )}
            </div>

            <button
              onClick={handleCloudSubmit}
              disabled={!hasApiKey && !tempApiKey.trim()}
              className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:hover:bg-blue-600 text-white font-semibold text-xs transition duration-200 shadow-md cursor-pointer disabled:cursor-not-allowed"
            >
              {t('startWithGemini')}
            </button>
          </div>
        </div>

        {/* Footer info */}
        <p className="text-[11px] text-neutral-400 text-center">
          {t('apiKeyNote')}
        </p>
      </div>
    </div>
  );
};
