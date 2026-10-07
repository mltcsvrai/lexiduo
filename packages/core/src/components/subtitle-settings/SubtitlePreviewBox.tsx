import React from 'react';
import { Eye } from 'lucide-react';
import {
  hexToRgba,
  getTextShadowCss,
  getFontFamilyClass,
  getFontWeightClass,
} from '../../utils/subtitleStyleHelpers';
import type {
  SubtitleFontFamily,
  SubtitleFontWeight,
  SubtitleTextOutline,
  SubtitleBgWidthMode,
  SubtitleMode,
} from '../../types';

export interface SubtitlePreviewBoxProps {
  label: string;
  bgWidthMode: SubtitleBgWidthMode;
  showSubtitleBg: boolean;
  bgColor: string;
  bgOpacity: number;
  subtitleMode: SubtitleMode;
  sourceTextColor: string;
  targetTextColor: string;
  fontFamily: SubtitleFontFamily | string;
  fontWeight: SubtitleFontWeight | string;
  fontSize: number;
  textOutline: SubtitleTextOutline;
}

export const SubtitlePreviewBox: React.FC<SubtitlePreviewBoxProps> = ({
  label,
  bgWidthMode,
  showSubtitleBg,
  bgColor,
  bgOpacity,
  subtitleMode,
  sourceTextColor,
  targetTextColor,
  fontFamily,
  fontWeight,
  fontSize,
  textOutline,
}) => {
  return (
    <div className="p-4 bg-slate-950/60 border-b border-slate-800/80">
      <div className="relative p-4 rounded-2xl bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 border border-white/10 overflow-hidden flex flex-col items-center justify-center min-h-[115px] shadow-inner">
        <div className="absolute top-2.5 left-3 flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/10 text-[11px] font-semibold text-slate-300">
          <Eye className="w-3.5 h-3.5 text-red-400" />
          <span>{label}</span>
        </div>

        <div
          className={`transition-all duration-200 text-center px-4 py-2 rounded-xl mt-3 ${
            bgWidthMode === 'dynamic' ? 'w-fit inline-block max-w-[94%]' : 'w-full max-w-[94%]'
          } ${showSubtitleBg ? 'border border-white/5 backdrop-blur-md shadow-lg' : 'drop-shadow-[0_2px_6px_rgba(0,0,0,0.95)]'}`}
          style={{
            backgroundColor: showSubtitleBg ? hexToRgba(bgColor, bgOpacity) : undefined,
          }}
        >
          {(subtitleMode === 'SOURCE' || subtitleMode === 'DUAL') && (
            <div
              className={`${getFontFamilyClass(fontFamily)} ${getFontWeightClass(fontWeight)} leading-tight`}
              style={{
                color: sourceTextColor,
                textShadow: getTextShadowCss(textOutline),
                fontSize: `${Math.min(fontSize, 20)}px`,
              }}
            >
              YouTube Video Subtitle Translation
            </div>
          )}
          {(subtitleMode === 'TARGET' || subtitleMode === 'DUAL') && (
            <div
              className={`${getFontFamilyClass(fontFamily)} ${getFontWeightClass(fontWeight)} leading-tight ${subtitleMode === 'DUAL' ? 'mt-1' : ''}`}
              style={{
                color: targetTextColor,
                textShadow: getTextShadowCss(textOutline),
                fontSize: `${Math.max(12, Math.min(fontSize - (subtitleMode === 'DUAL' ? 3 : 0), 18))}px`,
              }}
            >
              YouTube Video Altyazı Çevirisi
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
