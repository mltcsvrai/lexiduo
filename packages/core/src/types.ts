export type SubtitleMode = 'SOURCE' | 'TARGET' | 'DUAL';

export interface SubtitleCue {
  id: string;
  start: number; // seconds
  end: number;   // seconds
  sourceText: string;
  targetText?: string;
  isAiTranslated?: boolean;
}

export interface WordTranslation {
  word: string;
  normalizedWord: string;
  phonetic?: string;
  translation: string;
  partOfSpeech?: string;
  contextSentenceSource?: string;
  contextSentenceTarget?: string;
  isTargetWord?: boolean;
}

export interface VideoInfo {
  id: string;
  title: string;
  channel: string;
  thumbnail: string;
  duration?: string;
}

export interface HistoryItem {
  videoId: string;
  title?: string;
  timestamp: number;
}

export type SubtitleBgWidthMode = 'dynamic' | 'fixed';
export type SubtitleTextOutline = 'none' | 'shadow' | 'stroke';
export type SubtitleFontFamily = 'sans' | 'serif' | 'mono' | 'dyslexic';
export type SubtitleFontWeight = 'normal' | 'bold' | 'extrabold';

export interface SubtitlePosition {
  x: number;
  y: number;
}

export type VideoDownloadResolution = '360p' | '720p' | '1080p';
export type VideoDownloadContainer = 'mp4' | 'mkv';

export interface VideoDownloadOptions {
  resolution: VideoDownloadResolution;
  container: VideoDownloadContainer;
  targetLanguages: string[];
  engine: 'whisper' | 'gemini' | 'google';
}

export interface VideoDownloadProgress {
  stage: 'preparing' | 'translating' | 'fetching_video' | 'fetching_audio' | 'muxing' | 'completed' | 'error';
  percent: number;
  detail?: string;
}

export interface AppSettings {
  subtitleMode: SubtitleMode;
  fontSize: number;
  autoPauseOnWordClick: boolean;
  apiKey: string;
  translationProvider: 'gemini' | 'deepl' | 'auto';
  fontFamily: SubtitleFontFamily | string;
  fontWeight: SubtitleFontWeight | string;
  sourceTextColor: string;
  targetTextColor: string;
  showBackground: boolean;
  bgWidthMode: SubtitleBgWidthMode;
  bgColor: string;
  bgOpacity: number;
  textOutline: SubtitleTextOutline;
  isDraggable: boolean;
  subtitlePosition: SubtitlePosition;
  sourceLang: string;
  targetLang: string;
  historyLimit?: number;
  autoPauseAfterSubtitle?: boolean;
  karaokeHighlight?: boolean;
}

export const HISTORY_LIMIT_DEFAULT = 6;
export const HISTORY_LIMIT_OPTIONS = [4, 6, 8, 10, 12, 16, 20] as const;


