import React from 'react';
import { Search, Settings, Type, Download, Home, Layers } from 'lucide-react';
import { useTranslation } from '../i18n/useTranslation';
import { useAppStore } from '../store/useAppStore';

export interface FloatingDockProps {
  onSearchToggle: () => void;
  onSettingsOpen: () => void;
  onHomeClick?: () => void;
  showHome?: boolean;
  showDownload?: boolean;
  onFloatingClick?: () => void;
  onWhisperClick?: () => void;
  onDownloadClick?: () => void;
  onSubtitleSettingsClick?: () => void;
}

export const FloatingDock: React.FC<FloatingDockProps> = ({
  onSearchToggle,
  onSettingsOpen,
  onHomeClick,
  showHome = false,
  showDownload = true,
  onFloatingClick,
  onDownloadClick,
  onSubtitleSettingsClick,
}) => {
  const { t } = useTranslation();
  const setIsSubtitleSettingsOpen = useAppStore(s => s.setIsSubtitleSettingsOpen);
  const setIsDownloadModalOpen = useAppStore(s => s.setIsDownloadModalOpen);

  return (
    <div className="fixed bottom-3 sm:bottom-6 pb-safe left-0 right-0 z-50 flex flex-col items-center justify-end pointer-events-none transition-all duration-300 landscape:hidden md:landscape:flex">
      {/* Main Dock */}
      <div className="flex items-center justify-center space-x-1.5 bg-black/60 backdrop-blur-3xl border border-white/10 p-2 sm:p-2.5 rounded-full shadow-[0_8px_32px_rgba(0,0,0,0.6)] ring-1 ring-white/5 pointer-events-auto">
        
        {showHome && (
          <>
            <DockIcon 
              icon={<Home size={20} strokeWidth={2.5} />} 
              label={t('home')} 
              onClick={() => onHomeClick?.()} 
              color="text-red-400"
            />
            <div className="w-px h-7 bg-white/10 mx-1" />
          </>
        )}

        <DockIcon 
          icon={<Search size={20} strokeWidth={2.5} />} 
          label={t('openNewVideo')} 
          onClick={() => onSearchToggle()} 
        />
        
        <div className="w-px h-7 bg-white/10 mx-1" />

        <DockIcon 
          icon={<Type size={20} strokeWidth={2.5} />} 
          label="CC" 
          onClick={() => {
            if (onSubtitleSettingsClick) onSubtitleSettingsClick();
            else setIsSubtitleSettingsOpen(true);
          }} 
        />

        {showDownload !== false && (
          <>
            <div className="w-px h-7 bg-white/10 mx-1" />
            <DockIcon 
              icon={<Download size={20} strokeWidth={2.5} />} 
              label={t('downloadWithSubtitles')} 
              onClick={() => {
                if (onDownloadClick) onDownloadClick();
                else setIsDownloadModalOpen(true);
              }} 
              color="text-amber-400"
            />
          </>
        )}

        {onFloatingClick && (
          <>
            <div className="w-px h-7 bg-white/10 mx-1" />
            <DockIcon 
              icon={<Layers size={20} strokeWidth={2.5} />} 
              label={t('floatingSubtitles')} 
              onClick={() => onFloatingClick()} 
              color="text-emerald-400"
            />
          </>
        )}

        <div className="w-px h-7 bg-white/10 mx-1" />

        <DockIcon 
          icon={<Settings size={20} strokeWidth={2.5} />} 
          label={t('settings')} 
          onClick={() => onSettingsOpen()} 
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
      type="button"
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
