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

export interface AppSettings {
  subtitleMode: SubtitleMode;
  fontSize: number;
  autoPauseOnWordClick: boolean;
  apiKey: string;
  translationProvider: 'gemini' | 'deepl' | 'auto';
  fontFamily: string;
  showBackground: boolean;
  bgOpacity: number;
  sourceLang: string;
  targetLang: string;
  historyLimit?: number;
}

