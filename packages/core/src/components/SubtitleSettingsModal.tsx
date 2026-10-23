import React, { useState, useCallback } from 'react';
import { 
  Palette, 
  Sparkles, 
  Move, 
  X, 
  RotateCcw, 
  SlidersHorizontal,
  Info
} from 'lucide-react';
import { useTranslation } from '../i18n/useTranslation';
import { useAppStore } from '../store/useAppStore';
import { SUPPORTED_LANGUAGES } from '../i18n/languages';
import { CustomSelect, type SelectOption } from './CustomSelect';
import {
  getFontFamilyClass,
  getFontWeightClass,
} from '../utils/subtitleStyleHelpers';
import { TabButton, ColorPickerGroup } from './subtitle-settings/SubtitleSettingsControls';
import { SubtitlePreviewBox } from './subtitle-settings/SubtitlePreviewBox';
import type { 
  SubtitleFontFamily, 
  SubtitleFontWeight, 
  SubtitleTextOutline, 
  SubtitleBgWidthMode, 
  SubtitleMode 
} from '../types';
import {
  COLOR_PALETTES,
  SOURCE_TEXT_SWATCHES,
  TARGET_TEXT_SWATCHES,
  BG_COLOR_SWATCHES,
  syncStyleToNativeOverlay,
  type SubtitlePalette,
  type SubtitleStyleSyncParams,
} from '../utils/colorPalettes';

type SettingsTab = 'appearance' | 'behaviors' | 'position';

export interface SubtitleSettingsModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  onWhisperClick?: () => void;
}

export const SubtitleSettingsModal: React.FC<SubtitleSettingsModalProps> = ({
  isOpen: propIsOpen,
  onClose: propOnClose,
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance');

  // Zustand Store States & Actions
  const storeIsOpen = useAppStore(s => s.isSubtitleSettingsOpen);
  const setStoreIsOpen = useAppStore(s => s.setIsSubtitleSettingsOpen);

  const isOpen = propIsOpen !== undefined ? propIsOpen : storeIsOpen;
  const handleClose = () => {
    if (propOnClose) propOnClose();
    setStoreIsOpen(false);
  };

  const sourceTextColor = useAppStore(s => s.sourceTextColor);
  const setSourceTextColor = useAppStore(s => s.setSourceTextColor);
  const targetTextColor = useAppStore(s => s.targetTextColor);
  const setTargetTextColor = useAppStore(s => s.setTargetTextColor);

  const fontFamily = useAppStore(s => s.fontFamily);
  const setFontFamily = useAppStore(s => s.setFontFamily);
  const fontWeight = useAppStore(s => s.fontWeight);
  const setFontWeight = useAppStore(s => s.setFontWeight);
  const fontSize = useAppStore(s => s.fontSize);

  const showSubtitleBg = useAppStore(s => s.showSubtitleBg);
  const setShowSubtitleBg = useAppStore(s => s.setShowSubtitleBg);
  const bgWidthMode = useAppStore(s => s.bgWidthMode);
  const setBgWidthMode = useAppStore(s => s.setBgWidthMode);
  const bgColor = useAppStore(s => s.bgColor);
  const setBgColor = useAppStore(s => s.setBgColor);
  const bgOpacity = useAppStore(s => s.bgOpacity);
  const setBgOpacity = useAppStore(s => s.setBgOpacity);
  const textOutline = useAppStore(s => s.textOutline);
  const setTextOutline = useAppStore(s => s.setTextOutline);

  const isDraggable = useAppStore(s => s.isDraggable);
  const setIsDraggable = useAppStore(s => s.setIsDraggable);
  const subtitlePosition = useAppStore(s => s.subtitlePosition);
  const setSubtitlePosition = useAppStore(s => s.setSubtitlePosition);

  const subtitleMode = useAppStore(s => s.subtitleMode);
  const setSubtitleMode = useAppStore(s => s.setSubtitleMode);
  const sourceLang = useAppStore(s => s.sourceLang);
  const setSourceLang = useAppStore(s => s.setSourceLang);
  const targetLang = useAppStore(s => s.targetLang);
  const setTargetLang = useAppStore(s => s.setTargetLang);

  const autoPauseAfterSubtitle = useAppStore(s => s.autoPauseAfterSubtitle);
  const setAutoPauseAfterSubtitle = useAppStore(s => s.setAutoPauseAfterSubtitle);
  const karaokeHighlight = useAppStore(s => s.karaokeHighlight);
  const setKaraokeHighlight = useAppStore(s => s.setKaraokeHighlight);

  const syncAllStyles = useCallback((override?: Partial<SubtitleStyleSyncParams>) => {
    syncStyleToNativeOverlay({
      sourceTextColor,
      targetTextColor,
      bgColor,
      bgOpacity,
      fontSize,
      showSubtitleBg,
      bgWidthMode,
      subtitleMode,
      fontFamily,
      fontWeight,
      textOutline,
      ...override,
    });
  }, [sourceTextColor, targetTextColor, bgColor, bgOpacity, fontSize, showSubtitleBg, bgWidthMode, subtitleMode, fontFamily, fontWeight, textOutline]);

  const handleSourceColorChange = (c: string) => {
    setSourceTextColor(c);
    syncAllStyles({ sourceTextColor: c });
  };

  const handleTargetColorChange = (c: string) => {
    setTargetTextColor(c);
    syncAllStyles({ targetTextColor: c });
  };

  const handleBgColorChange = (c: string) => {
    setBgColor(c);
    syncAllStyles({ bgColor: c });
  };

  const handleToggleSubtitleBg = () => {
    const nextVal = !showSubtitleBg;
    setShowSubtitleBg(nextVal);
    syncAllStyles({ showSubtitleBg: nextVal });
  };

  const handleBgOpacityChange = (val: number) => {
    setBgOpacity(val);
    syncAllStyles({ bgOpacity: val });
  };

  const handleBgWidthModeChange = (mode: SubtitleBgWidthMode) => {
    setBgWidthMode(mode);
    syncAllStyles({ bgWidthMode: mode });
  };

  const handleSelectPalette = (p: SubtitlePalette) => {
    setSourceTextColor(p.sourceTextColor);
    setTargetTextColor(p.targetTextColor);
    setBgColor(p.bgColor);
    setBgOpacity(p.bgOpacity);
    setShowSubtitleBg(true);
    syncAllStyles({
      sourceTextColor: p.sourceTextColor,
      targetTextColor: p.targetTextColor,
      bgColor: p.bgColor,
      bgOpacity: p.bgOpacity,
      showSubtitleBg: true,
    });
  };

  const handleFontFamilyChange = (f: SubtitleFontFamily) => {
    setFontFamily(f);
    syncAllStyles({ fontFamily: f });
  };

  const handleFontWeightChange = (w: SubtitleFontWeight) => {
    setFontWeight(w);
    syncAllStyles({ fontWeight: w });
  };

  const handleTextOutlineChange = (outline: SubtitleTextOutline) => {
    setTextOutline(outline);
    syncAllStyles({ textOutline: outline });
  };

  const handleSubtitleModeChange = (m: SubtitleMode) => {
    setSubtitleMode(m);
    syncAllStyles({ subtitleMode: m });
  };

  if (!isOpen) return null;

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
    <div 
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in"
      onClick={handleClose}
    >
      <div 
        className="bg-slate-900 border border-slate-700/80 w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[85vh] overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:px-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-red-500/20 text-red-400 flex items-center justify-center">
              <SlidersHorizontal className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white leading-tight">
                {t('subtitleAppearanceTitle')}
              </h2>
            </div>
          </div>
          <button 
            type="button"
            onClick={handleClose}
            className="p-2 text-slate-400 hover:text-white rounded-full hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Live Preview Box */}
        <SubtitlePreviewBox
          label={t('livePreview')}
          bgWidthMode={bgWidthMode}
          showSubtitleBg={showSubtitleBg}
          bgColor={bgColor}
          bgOpacity={bgOpacity}
          subtitleMode={subtitleMode}
          sourceTextColor={sourceTextColor}
          targetTextColor={targetTextColor}
          fontFamily={fontFamily}
          fontWeight={fontWeight}
          fontSize={fontSize}
          textOutline={textOutline}
        />

        {/* 3 Streamlined Tabs Navigation */}
        <div className="grid grid-cols-3 gap-1.5 border-b border-slate-800 p-2 bg-slate-900">
          <TabButton 
            active={activeTab === 'appearance'} 
            onClick={() => setActiveTab('appearance')} 
            icon={<Palette className="w-3.5 h-3.5 shrink-0" />} 
            label={t('appearanceAndColors')} 
          />
          <TabButton 
            active={activeTab === 'behaviors'} 
            onClick={() => setActiveTab('behaviors')} 
            icon={<Sparkles className="w-3.5 h-3.5 shrink-0" />} 
            label={t('smartBehaviors')} 
          />
          <TabButton 
            active={activeTab === 'position'} 
            onClick={() => setActiveTab('position')} 
            icon={<Move className="w-3.5 h-3.5 shrink-0" />} 
            label={t('positionAndLayout')} 
          />
        </div>

        {/* Tab Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto custom-scrollbar flex-1 space-y-5">
          {/* 1. Appearance & Colors Tab */}
          {activeTab === 'appearance' && (
            <div className="space-y-5">
              {/* Pinch-to-zoom user hint banner */}
              <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-xs text-red-200 shadow-sm">
                <Info className="w-4 h-4 text-red-400 shrink-0" />
                <span className="leading-relaxed">{t('pinchToResizeHint')}</span>
              </div>

              {/* Preset Palettes Section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white block">{t('colorPresetsTitle')}</span>
                  <span className="text-[11px] text-slate-400">{t('colorPresetsDesc')}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto custom-scrollbar p-1">
                  {COLOR_PALETTES.map((palette) => {
                    const isSelected =
                      sourceTextColor.toLowerCase() === palette.sourceTextColor.toLowerCase() &&
                      targetTextColor.toLowerCase() === palette.targetTextColor.toLowerCase() &&
                      bgColor.toLowerCase() === palette.bgColor.toLowerCase();
                    return (
                      <button
                        key={palette.id}
                        type="button"
                        onClick={() => handleSelectPalette(palette)}
                        className={`p-2.5 rounded-xl text-left border transition-all flex flex-col justify-between hover:scale-[1.02] cursor-pointer shadow-md relative overflow-hidden ${
                          isSelected
                            ? 'border-white ring-2 ring-red-500/80 shadow-lg'
                            : 'border-slate-800/90 hover:border-white/30'
                        }`}
                        style={{ backgroundColor: palette.bgColor }}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="text-[11px] font-bold truncate block" style={{ color: palette.sourceTextColor }}>
                            {palette.name}
                          </span>
                          {isSelected && (
                            <span className="w-2 h-2 rounded-full bg-red-400 shrink-0 ml-1" />
                          )}
                        </div>
                        <div className="flex items-center justify-between mt-1.5 text-[10px]">
                          <div className="flex items-center gap-1.5">
                            <span className="px-1 py-0.5 rounded text-[9px] font-bold bg-white/10" style={{ color: palette.sourceTextColor }}>
                              EN
                            </span>
                            <span className="font-semibold" style={{ color: palette.targetTextColor }}>
                              TR Altyazı
                            </span>
                          </div>
                          <span className="text-white/40 text-[9px] font-mono">
                            %{palette.bgOpacity}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="w-full h-px bg-slate-800" />

              <ColorPickerGroup
                label={t('sourceTextColor')}
                currentColor={sourceTextColor}
                onChange={handleSourceColorChange}
                presets={SOURCE_TEXT_SWATCHES}
              />
              <div className="w-full h-px bg-slate-800" />
              <ColorPickerGroup
                label={t('targetTextColor')}
                currentColor={targetTextColor}
                onChange={handleTargetColorChange}
                presets={TARGET_TEXT_SWATCHES}
              />

              <div className="w-full h-px bg-slate-800" />

              {/* Typography selectors */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-slate-300 block">{t('fontFamilyLabel')}</span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(['sans', 'serif', 'mono', 'dyslexic'] as SubtitleFontFamily[]).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => handleFontFamilyChange(f)}
                      className={`p-2.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                        fontFamily === f 
                          ? 'bg-red-500/20 text-red-300 border-red-500/50 shadow-sm' 
                          : 'bg-slate-800/80 text-slate-300 border-slate-700/60 hover:bg-slate-800'
                      } ${getFontFamilyClass(f)}`}
                    >
                      {f === 'sans' && t('fontSans')}
                      {f === 'serif' && t('fontSerif')}
                      {f === 'mono' && t('fontMono')}
                      {f === 'dyslexic' && t('fontDyslexic')}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-semibold text-slate-300 block">{t('fontWeightLabel')}</span>
                <div className="grid grid-cols-3 gap-2">
                  {(['normal', 'bold', 'extrabold'] as SubtitleFontWeight[]).map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => handleFontWeightChange(w)}
                      className={`p-2.5 rounded-xl text-xs transition-all border cursor-pointer ${
                        fontWeight === w 
                          ? 'bg-red-500/20 text-red-300 border-red-500/50 shadow-sm' 
                          : 'bg-slate-800/80 text-slate-300 border-slate-700/60 hover:bg-slate-800'
                      } ${getFontWeightClass(w)}`}
                    >
                      {w === 'normal' && t('weightNormal')}
                      {w === 'bold' && t('weightBold')}
                      {w === 'extrabold' && t('weightExtraBold')}
                    </button>
                  ))}
                </div>
              </div>

              {/* Text Outline & Effects */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-slate-300 block">{t('textOutlineLabel')}</span>
                <div className="grid grid-cols-3 gap-2">
                  {(['none', 'shadow', 'stroke'] as SubtitleTextOutline[]).map((outline) => (
                    <button
                      key={outline}
                      type="button"
                      onClick={() => handleTextOutlineChange(outline)}
                      className={`p-2.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                        textOutline === outline 
                          ? 'bg-red-500/20 text-red-300 border-red-500/50 shadow-sm' 
                          : 'bg-slate-800/80 text-slate-300 border-slate-700/60 hover:bg-slate-800'
                      }`}
                    >
                      {outline === 'none' && t('outlineNone')}
                      {outline === 'shadow' && t('outlineShadow')}
                      {outline === 'stroke' && t('outlineStroke')}
                    </button>
                  ))}
                </div>
              </div>

              <div className="w-full h-px bg-slate-800" />

              {/* Background Toggle & Opacity */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-800/50 border border-slate-800">
                <span className="text-xs font-semibold text-white">{t('background')}</span>
                <button
                  type="button"
                  onClick={handleToggleSubtitleBg}
                  className={`w-12 h-6 rounded-full transition-colors relative flex items-center px-1 cursor-pointer ${
                    showSubtitleBg ? 'bg-red-500' : 'bg-slate-700'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform ${
                      showSubtitleBg ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {showSubtitleBg && (
                <>
                  <ColorPickerGroup
                    label={t('bgColorLabel')}
                    currentColor={bgColor}
                    onChange={handleBgColorChange}
                    presets={BG_COLOR_SWATCHES}
                  />

                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-semibold text-slate-300">
                      <span>{t('bgOpacityLabel')}</span>
                      <span className="font-mono text-red-400">%{bgOpacity}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={bgOpacity}
                      onChange={(e) => handleBgOpacityChange(Number(e.target.value))}
                      className="w-full accent-red-500 h-2 bg-slate-800 rounded-lg cursor-pointer"
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {/* 2. Smart Behaviors Tab */}
          {activeTab === 'behaviors' && (
            <div className="space-y-5">
              {/* View Mode */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-slate-300 block">{t('viewMode')}</span>
                <div className="grid grid-cols-3 gap-2">
                  {(['DUAL', 'TARGET', 'SOURCE'] as SubtitleMode[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => handleSubtitleModeChange(m)}
                      className={`p-2.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                        subtitleMode === m 
                          ? 'bg-red-500/20 text-red-300 border-red-500/50 shadow-sm' 
                          : 'bg-slate-800/80 text-slate-300 border-slate-700/60 hover:bg-slate-800'
                      }`}
                    >
                      {m === 'DUAL' && t('dualLanguage')}
                      {m === 'TARGET' && t('targetOnly')}
                      {m === 'SOURCE' && t('sourceOnly')}
                    </button>
                  ))}
                </div>
              </div>

              {/* Language Selection */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">{t('sourceLang')}</span>
                  <CustomSelect
                    value={sourceLang}
                    onChange={setSourceLang}
                    options={sourceOptions}
                    direction="down"
                    searchable={true}
                    searchPlaceholder={t('searchLanguagePlaceholder')}
                  />
                </div>
                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">{t('targetLang')}</span>
                  <CustomSelect
                    value={targetLang}
                    onChange={setTargetLang}
                    options={targetOptions}
                    direction="down"
                    searchable={true}
                    placeholder={t('selectLanguage')}
                    searchPlaceholder={t('searchLanguagePlaceholder')}
                  />
                </div>
              </div>

              {/* Smart Feature Toggles */}
              <div className="space-y-3 pt-3 border-t border-slate-800/80">
                {/* Karaoke Word Highlight */}
                <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-800/50 border border-slate-800">
                  <div className="pr-3">
                    <span className="text-xs font-semibold text-white block">{t('karaokeHighlight')}</span>
                    <span className="text-[11px] text-slate-400 leading-tight block mt-0.5">{t('karaokeHighlightDesc')}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setKaraokeHighlight(!karaokeHighlight)}
                    className={`w-12 h-6 rounded-full transition-colors relative flex items-center px-1 shrink-0 cursor-pointer ${
                      karaokeHighlight ? 'bg-red-500' : 'bg-slate-700'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white transition-transform ${
                        karaokeHighlight ? 'translate-x-6' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Auto-Pause After Subtitle */}
                <div className="flex flex-col p-3 rounded-2xl bg-slate-800/50 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="pr-3">
                      <span className="text-xs font-semibold text-white block">{t('autoPauseAfterSubtitle')}</span>
                      <span className="text-[11px] text-slate-400 leading-tight block mt-0.5">{t('autoPauseAfterSubtitleDesc')}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAutoPauseAfterSubtitle(!autoPauseAfterSubtitle)}
                      className={`w-12 h-6 rounded-full transition-colors relative flex items-center px-1 shrink-0 cursor-pointer ${
                        autoPauseAfterSubtitle ? 'bg-amber-500' : 'bg-slate-700'
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded-full bg-white transition-transform ${
                          autoPauseAfterSubtitle ? 'translate-x-6' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                  {autoPauseAfterSubtitle && (
                    <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 animate-in fade-in duration-200">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>{t('autoPauseSentenceUnifiedNote')}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 3. Position & Layout Tab */}
          {activeTab === 'position' && (
            <div className="space-y-5">
              {/* Draggable Switch */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-800/50 border border-slate-800">
                <div>
                  <span className="text-xs font-semibold text-white block">{t('draggableSubtitlesLabel')}</span>
                  <span className="text-[11px] text-slate-400">
                    {subtitlePosition.x !== 0 || subtitlePosition.y !== 0
                      ? `X: ${subtitlePosition.x}px, Y: ${subtitlePosition.y}px`
                      : t('defaultBottomPosition')}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsDraggable(!isDraggable)}
                  className={`w-12 h-6 rounded-full transition-colors relative flex items-center px-1 cursor-pointer ${
                    isDraggable ? 'bg-red-500' : 'bg-slate-700'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform ${
                      isDraggable ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Reset Position Button */}
              <div className="p-3.5 rounded-2xl bg-slate-800/30 border border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-300 font-medium">{t('resetPositionBtn')}</span>
                  <button
                    type="button"
                    onClick={() => setSubtitlePosition({ x: 0, y: 0 })}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white transition-colors border border-white/10 active:scale-95 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-red-400" />
                    <span>{t('resetPositionBtn')}</span>
                  </button>
                </div>
              </div>

              {/* Background Width Mode */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-slate-300 block">{t('bgWidthModeLabel')}</span>
                <div className="grid grid-cols-2 gap-2">
                  {(['dynamic', 'fixed'] as SubtitleBgWidthMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => handleBgWidthModeChange(mode)}
                      className={`p-2.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                        bgWidthMode === mode 
                          ? 'bg-red-500/20 text-red-300 border-red-500/50 shadow-sm' 
                          : 'bg-slate-800/80 text-slate-300 border-slate-700/60 hover:bg-slate-800'
                      }`}
                    >
                      {mode === 'dynamic' ? t('bgWidthDynamic') : t('bgWidthFixed')}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 flex justify-end bg-slate-900/90">
          <button
            type="button"
            onClick={handleClose}
            className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 active:scale-95 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-lg shadow-red-600/30 cursor-pointer"
          >
            {t('close')}
          </button>
        </div>
      </div>
    </div>
  );
};
