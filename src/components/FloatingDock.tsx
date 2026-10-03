import React, { useState } from 'react';
import { Search, Settings, Type, Pause, Play, MonitorPlay, ArrowRight, Home } from 'lucide-react';
import { useTranslation } from '../i18n/TranslationContext';
import { SUPPORTED_LANGUAGES } from '../i18n/languages';
import { useAppStore } from '../store/useAppStore';
import { CustomSelect, type SelectOption } from './CustomSelect';

interface FloatingDockProps {
  onSearchToggle: () => void;
  onSettingsOpen: () => void;
  onHomeClick?: () => void;
  showHome?: boolean;
}

export const FloatingDock: React.FC<FloatingDockProps> = ({
  onSearchToggle,
  onSettingsOpen,
  onHomeClick,
  showHome = false,
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'subtitle' | 'video' | null>(null);

  // Zustand State
  const fontSize = useAppStore(s => s.fontSize);
  const onFontSizeChange = useAppStore(s => s.setFontSize);
  const subtitleMode = useAppStore(s => s.subtitleMode);
  const onModeChange = useAppStore(s => s.setSubtitleMode);
  const sourceLang = useAppStore(s => s.sourceLang);
  const onSourceLangChange = useAppStore(s => s.setSourceLang);
  const targetLang = useAppStore(s => s.targetLang);
  const onTargetLangChange = useAppStore(s => s.setTargetLang);
  const autoPause = useAppStore(s => s.autoPause);
  const onAutoPauseChange = useAppStore(s => s.setAutoPause);
  const playbackRate = useAppStore(s => s.playbackRate);
  const onPlaybackRateChange = useAppStore(s => s.setPlaybackRate);
  const showSubtitleBg = useAppStore(s => s.showSubtitleBg);
  const setShowSubtitleBg = useAppStore(s => s.setShowSubtitleBg);

  const onLanguageChange = (type: 'source' | 'target', val: string) => {
    if (type === 'source') onSourceLangChange(val);
    else onTargetLangChange(val);
  };

  const onToggleSubtitleBg = () => {
    setShowSubtitleBg(!showSubtitleBg);
  };

  const sourceOptions: SelectOption[] = [
    { value: 'auto', label: t('autoDetect') },
    ...SUPPORTED_LANGUAGES.map(lang => ({
      value: lang.code,
      label: `${lang.nativeName} (${lang.name})`
    }))
  ];

  const targetOptions: SelectOption[] = SUPPORTED_LANGUAGES.map(lang => ({
    value: lang.code,
    label: `${lang.nativeName} (${lang.name})`
  }));

  return (
    <div className="fixed bottom-3 sm:bottom-6 pb-safe left-0 right-0 z-50 flex flex-col items-center justify-end pointer-events-none transition-all duration-300 landscape:hidden md:landscape:flex">
      
      {/* Backdrop for closing popovers on tap */}
      {activeTab && (
        <div 
          className="fixed inset-0 bg-black/40 backdrop-blur-[1px] pointer-events-auto z-40 animate-fade-in"
          onClick={() => setActiveTab(null)}
        />
      )}

      {/* Subtitle Settings Popover */}
      {activeTab === 'subtitle' && (
        <div className="mb-3 max-w-[92vw] w-72 sm:w-80 bg-slate-900/95 backdrop-blur-3xl border border-white/10 p-4 sm:p-5 rounded-3xl shadow-2xl animate-in fade-in slide-in-from-bottom-3 pointer-events-auto z-50 max-h-[75vh] overflow-y-auto space-y-4">
          
          {/* Language Pair Selector */}
          <div className="flex items-center space-x-2 bg-black/40 p-2.5 rounded-2xl border border-white/10">
            <div className="flex-1 min-w-0">
              <span className="text-[10px] font-bold text-slate-400 block px-1 uppercase mb-1">{t('sourceLang')}</span>
              <CustomSelect
                value={sourceLang}
                onChange={(val) => onLanguageChange('source', val)}
                options={sourceOptions}
                direction="down"
                searchable={true}
                searchPlaceholder={t('searchLanguagePlaceholder')}
              />
            </div>
            
            <ArrowRight className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-4" />

            <div className="flex-1 min-w-0">
              <span className="text-[10px] font-bold text-slate-400 block px-1 uppercase mb-1">{t('targetLang')}</span>
              <CustomSelect
                value={targetLang}
                onChange={(val) => onLanguageChange('target', val)}
                options={targetOptions}
                direction="down"
                searchable={true}
                searchPlaceholder={t('searchLanguagePlaceholder')}
              />
            </div>
          </div>

          {/* Segmented Subtitle Mode Switcher */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-bold text-slate-400 block px-1">{t('viewMode')}</span>
            <div className="grid grid-cols-3 p-1 bg-black/40 rounded-xl border border-white/10 gap-1 text-center">
              <button
                type="button"
                onClick={() => onModeChange('DUAL')}
                className={`py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  subtitleMode === 'DUAL'
                    ? 'bg-red-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {t('dualLanguage')}
              </button>
              <button
                type="button"
                onClick={() => onModeChange('TARGET')}
                className={`py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  subtitleMode === 'TARGET'
                    ? 'bg-red-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {t('targetOnly')}
              </button>
              <button
                type="button"
                onClick={() => onModeChange('SOURCE')}
                className={`py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  subtitleMode === 'SOURCE'
                    ? 'bg-red-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {t('sourceOnly')}
              </button>
            </div>
          </div>

          {/* Font Size Slider */}
          <div className="space-y-2 pt-1 border-t border-white/10">
            <div className="flex justify-between text-xs font-semibold text-slate-300">
              <span>{t('subtitleSize')}</span>
              <span className="bg-black/40 px-2 py-0.5 rounded-md font-mono text-[11px]">{fontSize}px</span>
            </div>
            <input
              type="range"
              min="16"
              max="48"
              value={fontSize}
              onChange={(e) => onFontSizeChange(Number(e.target.value))}
              className="w-full h-1.5 bg-slate-700 rounded-full appearance-none cursor-pointer accent-red-500"
            />
          </div>
          
          {/* Background Toggle */}
          <div className="flex items-center justify-between pt-2 border-t border-white/10">
            <span className="text-xs font-semibold text-slate-300">{t('background')}</span>
            <button
              onClick={() => onToggleSubtitleBg()}
              className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer ${
                showSubtitleBg ? 'bg-red-600' : 'bg-slate-700'
              }`}
            >
              <div 
                className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.75 transition-transform ${
                  showSubtitleBg ? 'left-5.5' : 'left-1'
                }`} 
              />
            </button>
          </div>
        </div>
      )}

      {/* Video Settings Popover */}
      {activeTab === 'video' && (
        <div className="mb-3 max-w-[92vw] w-64 sm:w-72 bg-slate-900/95 backdrop-blur-3xl border border-white/10 p-4 sm:p-5 rounded-3xl shadow-2xl animate-in fade-in slide-in-from-bottom-3 pointer-events-auto z-50 max-h-[75vh] overflow-y-auto space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300">{t('autoPause')}</span>
            <button
              onClick={() => onAutoPauseChange(!autoPause)}
              className={`p-2 rounded-xl transition-all cursor-pointer ${
                autoPause ? 'bg-emerald-500 text-white shadow-[0_0_10px_rgba(16,185,129,0.3)]' : 'bg-white/10 text-slate-400'
              }`}
            >
              {autoPause ? <Pause size={15} /> : <Play size={15} fill="currentColor" />}
            </button>
          </div>

          <div className="space-y-2 pt-2 border-t border-white/10">
            <div className="flex justify-between text-xs font-semibold text-slate-300">
              <span>{t('playbackSpeed')}</span>
              <span className="bg-black/40 px-2 py-0.5 rounded-md font-mono text-[11px]">{playbackRate}x</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.25"
              value={playbackRate}
              onChange={(e) => onPlaybackRateChange(Number(e.target.value))}
              className="w-full h-1.5 bg-slate-700 rounded-full appearance-none cursor-pointer accent-emerald-500"
            />
          </div>
        </div>
      )}

      {/* Main Dock */}
      <div className="flex items-center justify-center space-x-1.5 bg-black/60 backdrop-blur-3xl border border-white/10 p-2 sm:p-2.5 rounded-full shadow-[0_8px_32px_rgba(0,0,0,0.6)] ring-1 ring-white/5 pointer-events-auto">
        
        {showHome && (
          <>
            <DockIcon 
              icon={<Home size={20} strokeWidth={2.5} />} 
              label={t('home')} 
              onClick={() => { setActiveTab(null); onHomeClick?.(); }} 
              color="text-red-400"
            />
            <div className="w-px h-7 bg-white/10 mx-1" />
          </>
        )}

        <DockIcon 
          icon={<Search size={20} strokeWidth={2.5} />} 
          label={t('openNewVideo')} 
          onClick={() => { setActiveTab(null); onSearchToggle(); }} 
        />
        
        <div className="w-px h-7 bg-white/10 mx-1" />

        <DockIcon 
          icon={<Type size={20} strokeWidth={2.5} />} 
          label="CC" 
          onClick={() => setActiveTab(activeTab === 'subtitle' ? null : 'subtitle')} 
          active={activeTab === 'subtitle'}
        />

        <DockIcon 
          icon={<MonitorPlay size={20} strokeWidth={2.5} />} 
          label="Video" 
          onClick={() => setActiveTab(activeTab === 'video' ? null : 'video')} 
          active={activeTab === 'video'}
        />

        <div className="w-px h-7 bg-white/10 mx-1" />

        <DockIcon 
          icon={<Settings size={20} strokeWidth={2.5} />} 
          label={t('settings')} 
          onClick={() => { setActiveTab(null); onSettingsOpen(); }} 
        />
      </div>
    </div>
  );
};

function DockIcon({ 
  icon, 
  label, 
  onClick, 
  active = false,
  color = "text-slate-200"
}: { 
  icon: React.ReactNode, 
  label: string, 
  onClick: () => void,
  active?: boolean,
  color?: string
}) {
  return (
    <button
      onClick={onClick}
      className={`group relative p-3 min-w-[42px] min-h-[42px] flex items-center justify-center rounded-full transition-all duration-200 active:scale-90 cursor-pointer
        ${active ? 'bg-white/20 shadow-inner' : 'hover:bg-white/10'} 
      `}
    >
      <span className={`${color} transition-colors ${active ? 'text-white' : ''}`}>{icon}</span>
      <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 scale-95 group-hover:scale-100 transition-all duration-150 bg-slate-900 text-white text-[10px] font-bold py-1 px-2.5 rounded-lg whitespace-nowrap shadow-xl border border-white/10 pointer-events-none">
        {label}
      </div>
    </button>
  );
}
