import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Search } from 'lucide-react';
import { useTranslation } from '../i18n/useTranslation';

export interface SelectOption {
  value: string;
  label: string;
  badge?: string;
}

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  direction?: 'up' | 'down';
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyText?: string;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
  value,
  onChange,
  options,
  placeholder = '...',
  className = '',
  direction = 'down',
  searchable = false,
  searchPlaceholder = '...',
  emptyText
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close when clicked outside
  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
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

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Reset search input when dropdown opens
  useEffect(() => {
    if (isOpen) {
      setSearchTerm('');
    }
  }, [isOpen]);

  const selectedOption = options.find(opt => opt.value === value);

  const filteredOptions = searchable && searchTerm.trim()
    ? options.filter(opt => 
        opt.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
        opt.value.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : options;

  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between bg-black/40 hover:bg-black/60 border border-white/10 hover:border-white/20 rounded-xl px-3 py-2 text-xs text-white transition-all cursor-pointer focus:outline-none focus:ring-1 focus:ring-red-500/80 active:scale-[0.98] ${
          isOpen ? 'ring-1 ring-red-500/80 border-red-500/50' : ''
        }`}
      >
        <span className="truncate font-medium">
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown 
          size={14} 
          className={`text-slate-400 shrink-0 ml-1.5 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-red-400' : ''
          }`} 
        />
      </button>

      {/* Custom Floating Dropdown Menu */}
      {isOpen && (
        <div
          className={`absolute left-0 right-0 z-[70] bg-slate-900/98 backdrop-blur-3xl border border-white/15 rounded-2xl shadow-[0_16px_50px_rgba(0,0,0,0.85)] p-1.5 flex flex-col animate-in fade-in zoom-in-95 duration-150 ${
            direction === 'up' 
              ? 'bottom-full mb-1.5' 
              : 'top-full mt-1.5'
          }`}
        >
          {searchable && (
            <div className="p-1 pb-1.5 border-b border-white/10 mb-1 shrink-0">
              <div className="relative flex items-center">
                <Search size={13} className="absolute left-2.5 text-slate-400 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="w-full bg-black/50 border border-white/10 rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-red-500/80 focus:ring-1 focus:ring-red-500/50"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                />
              </div>
            </div>
          )}

          {/* Options Container: displays 5 items then scrolls internally without shifting page */}
          <div className="overflow-y-auto overscroll-contain custom-scrollbar space-y-0.5 max-h-[175px]">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-3 text-[11px] text-slate-400 text-center">
                {emptyText || (searchable ? t('noLanguagesFound') : t('notFound'))}
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleSelect(opt.value)}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs transition-all cursor-pointer text-left ${
                      isSelected
                        ? 'bg-red-600/20 text-red-200 font-bold border border-red-500/30'
                        : 'text-slate-300 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <span className="truncate">{opt.label}</span>
                    {isSelected && (
                      <Check size={14} className="text-red-400 shrink-0 ml-2 animate-in zoom-in-50 duration-150" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
