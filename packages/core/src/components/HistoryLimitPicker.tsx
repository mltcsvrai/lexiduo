import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { set } from 'idb-keyval';
import { useTranslation } from '../i18n/useTranslation';
import { useAppStore } from '../store/useAppStore';
import { HISTORY_LIMIT_OPTIONS } from '../types';

export interface HistoryLimitPickerProps {
  value?: number;
  onChange?: (limit: number) => void;
  accent?: 'red' | 'indigo';
  className?: string;
}

export const HistoryLimitPicker: React.FC<HistoryLimitPickerProps> = ({
  value,
  onChange,
  accent = 'red',
  className = ''
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const storeLimit = useAppStore(s => s.historyLimit);
  const setStoreLimit = useAppStore(s => s.setHistoryLimit);
  const currentLimit = value !== undefined ? value : (storeLimit || 6);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('pointerdown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('pointerdown', handleOutsideClick);
    };
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleSelect = async (num: number) => {
    if (onChange) {
      onChange(num);
    } else {
      setStoreLimit(num);
      await set('yt_ceviri_history_limit', num).catch(() => {});
    }
    setIsOpen(false);
  };

  const unitText = t('videosCount') || 'video';

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] sm:text-xs font-semibold border transition-all cursor-pointer active:scale-95 shadow-sm ${
          isOpen
            ? accent === 'indigo'
              ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-200 ring-1 ring-indigo-500/30'
              : 'bg-red-600/20 border-red-500/50 text-red-200 ring-1 ring-red-500/30'
            : 'bg-white/5 hover:bg-white/10 border-white/10 hover:border-white/20 text-slate-300 hover:text-white'
        }`}
        title={t('recentHistoryLimit')}
        aria-label={t('recentHistoryLimit')}
      >
        <span>{currentLimit} {unitText}</span>
        <ChevronDown
          size={13}
          className={`transition-transform duration-200 ${
            isOpen
              ? accent === 'indigo'
                ? 'rotate-180 text-indigo-400'
                : 'rotate-180 text-red-400'
              : 'text-slate-400'
          }`}
        />
      </button>

      {/* Visual Floating Dropdown Menu */}
      {isOpen && (
        <div
          className="absolute left-0 top-full mt-1.5 z-50 min-w-[115px] bg-slate-900/98 backdrop-blur-2xl border border-white/15 rounded-2xl shadow-[0_16px_50px_rgba(0,0,0,0.85)] p-1 flex flex-col space-y-0.5 animate-in fade-in zoom-in-95 duration-150"
        >
          {HISTORY_LIMIT_OPTIONS.map((num) => {
            const isSelected = num === currentLimit;
            return (
              <button
                key={num}
                type="button"
                onClick={() => handleSelect(num)}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs transition-all cursor-pointer text-left ${
                  isSelected
                    ? accent === 'indigo'
                      ? 'bg-indigo-600/20 text-indigo-200 font-bold border border-indigo-500/30'
                      : 'bg-red-600/20 text-red-200 font-bold border border-red-500/30'
                    : 'text-slate-300 hover:text-white hover:bg-white/10 border border-transparent'
                }`}
              >
                <span>{num} {unitText}</span>
                {isSelected && (
                  <Check
                    size={13}
                    className={`shrink-0 ml-1.5 animate-in zoom-in-50 duration-150 ${
                      accent === 'indigo' ? 'text-indigo-400' : 'text-red-400'
                    }`}
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
