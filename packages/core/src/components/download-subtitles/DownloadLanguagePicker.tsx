import React from 'react';
import { Globe, Check } from 'lucide-react';
import { SUPPORTED_LANGUAGES, getLanguageDisplayName } from '../../i18n/languages';
import type { Language } from '../../i18n/types';

export interface DownloadLanguagePickerProps {
  selectedLangs: string[];
  toggleLanguage: (code: string) => void;
  langSearch: string;
  setLangSearch: (query: string) => void;
  filteredLanguages: Array<{
    code: string;
    name: string;
    nativeName: string;
    displayName: string;
  }>;
  language: Language;
  t: (key: any) => string;
}

export const DownloadLanguagePicker: React.FC<DownloadLanguagePickerProps> = ({
  selectedLangs,
  toggleLanguage,
  langSearch,
  setLangSearch,
  filteredLanguages,
  language,
  t,
}) => {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
          <Globe size={14} className="text-emerald-400" />
          {t('selectLanguagesMax5')}
        </label>
        <span className="text-[11px] font-mono text-slate-400">
          {selectedLangs.length} / 5
        </span>
      </div>

      {/* Selected badges */}
      <div className="flex flex-wrap gap-1.5 p-2 bg-black/40 rounded-2xl border border-white/5 min-h-[44px] items-center">
        {selectedLangs.map(code => {
          const langObj = SUPPORTED_LANGUAGES.find(l => l.code === code);
          const disp = langObj ? getLanguageDisplayName(code, language) : code;
          return (
            <span
              key={code}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-red-600/20 border border-red-500/30 text-white text-xs font-medium"
            >
              <span>{disp}</span>
              <button
                type="button"
                onClick={() => toggleLanguage(code)}
                className="text-red-300 hover:text-white cursor-pointer"
              >
                ×
              </button>
            </span>
          );
        })}
      </div>

      {/* Language filter & picker list */}
      <div className="relative">
        <input
          type="text"
          placeholder={t('searchLanguagePlaceholder')}
          value={langSearch}
          onChange={(e) => setLangSearch(e.target.value)}
          className="w-full px-3 py-1.5 pr-8 rounded-xl bg-black/30 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-red-500"
        />
        {langSearch && (
          <button
            type="button"
            onClick={() => setLangSearch('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs cursor-pointer"
          >
            ×
          </button>
        )}
      </div>

      <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
        <span>{filteredLanguages.length} / {SUPPORTED_LANGUAGES.length}</span>
        {selectedLangs.length >= 5 && (
          <span className="text-amber-400 font-medium">({t('selectLanguagesMax5')})</span>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-44 overflow-y-auto custom-scrollbar p-1">
        {filteredLanguages.map(l => {
          const isSelected = selectedLangs.includes(l.code);
          const isMaxReached = selectedLangs.length >= 5 && !isSelected;
          return (
            <button
              key={l.code}
              type="button"
              disabled={isMaxReached}
              onClick={() => toggleLanguage(l.code)}
              className={`py-1.5 px-2.5 rounded-xl text-[11px] font-medium border text-left flex items-center justify-between transition ${
                isSelected
                  ? 'bg-red-600/30 border-red-500/40 text-white cursor-pointer'
                  : isMaxReached
                  ? 'bg-black/10 border-white/5 text-slate-600 cursor-not-allowed opacity-50'
                  : 'bg-black/20 border-white/5 text-slate-400 hover:text-slate-200 cursor-pointer'
              }`}
            >
              <span className="truncate">{l.displayName || l.name}</span>
              {isSelected && <Check size={12} className="text-red-400 shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>
  );
};
