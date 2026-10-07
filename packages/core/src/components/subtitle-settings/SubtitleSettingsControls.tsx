import React, { useState, useRef } from 'react';
import { Check, ChevronUp, Plus, Pipette } from 'lucide-react';

export function TabButton({ 
  active, 
  onClick, 
  icon, 
  label 
}: { 
  active: boolean; 
  onClick: () => void; 
  icon: React.ReactNode; 
  label: string; 
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-1 sm:gap-1.5 px-1.5 sm:px-3 py-2 rounded-xl text-[11px] sm:text-xs font-bold transition-all cursor-pointer text-center w-full min-w-0 ${
        active 
          ? 'bg-red-500/15 text-red-400 border border-red-500/30 shadow-sm' 
          : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
      }`}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}

export function ColorPickerGroup({
  label,
  currentColor,
  onChange,
  presets,
}: {
  label: string;
  currentColor: string;
  onChange: (color: string) => void;
  presets: string[];
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const colorInputRef = useRef<HTMLInputElement>(null);

  // Keep active color visible in compact (5-color) mode
  const isCurrentInFirst5 = presets.slice(0, 5).some(c => c.toLowerCase() === currentColor.toLowerCase());
  const compactPresets = isCurrentInFirst5
    ? presets.slice(0, 5)
    : [currentColor, ...presets.filter(c => c.toLowerCase() !== currentColor.toLowerCase()).slice(0, 4)];

  const displayedPresets = isExpanded ? presets : compactPresets;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
        <span>{label}</span>
        <span className="font-mono text-slate-300 uppercase text-[11px] bg-slate-800/90 px-2.5 py-0.5 rounded-lg border border-white/10 shadow-inner">
          {currentColor}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2 p-2 rounded-2xl bg-slate-950/50 border border-slate-800 transition-all duration-200">
        {displayedPresets.map((color) => {
          const isSelected = currentColor.toLowerCase() === color.toLowerCase();
          return (
            <button
              key={color}
              type="button"
              onClick={() => onChange(color)}
              className={`w-7 h-7 sm:w-8 sm:h-8 rounded-xl transition-all border flex items-center justify-center cursor-pointer ${
                isSelected
                  ? 'scale-110 border-white ring-2 ring-white/60 shadow-lg z-10'
                  : 'border-white/15 hover:scale-105 hover:border-white/40'
              }`}
              style={{ backgroundColor: color }}
              title={color}
            >
              {isSelected && (
                <Check
                  className={`w-3.5 h-3.5 ${
                    color.toLowerCase() === '#ffffff' || color.toLowerCase() === '#f8fafc' || color.toLowerCase() === '#fef08a'
                      ? 'text-black'
                      : 'text-white'
                  }`}
                />
              )}
            </button>
          );
        })}
        {presets.length > 5 && (
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl transition-all border border-white/20 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer active:scale-95 shadow-sm"
            title={isExpanded ? 'Daha az göster' : `+${presets.length - 5} daha fazla`}
            aria-label={isExpanded ? 'Daha az göster' : 'Daha fazla renk'}
          >
            {isExpanded ? (
              <ChevronUp className="w-3.5 h-3.5 text-slate-300" />
            ) : (
              <Plus className="w-3.5 h-3.5 text-slate-300" />
            )}
          </button>
        )}
        <button
          type="button"
          onClick={() => colorInputRef.current?.click()}
          className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl transition-all border border-white/20 bg-gradient-to-tr from-indigo-500/30 via-pink-500/30 to-amber-500/30 hover:border-white/50 text-slate-200 hover:text-white flex items-center justify-center cursor-pointer active:scale-95 shadow-sm relative"
          title="Özel renk seç"
          aria-label="Özel renk seç"
        >
          <Pipette className="w-3.5 h-3.5 text-white drop-shadow" />
          <input
            ref={colorInputRef}
            type="color"
            value={currentColor.startsWith('#') && currentColor.length === 7 ? currentColor : '#FFFFFF'}
            onChange={(e) => onChange(e.target.value.toUpperCase())}
            className="sr-only opacity-0 absolute inset-0 pointer-events-none"
            tabIndex={-1}
          />
        </button>
      </div>
    </div>
  );
}
