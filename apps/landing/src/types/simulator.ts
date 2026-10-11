export interface WordDetail {
  word: string;
  cleanWord: string;
  phonetic: string;
  pos: string;
  definition: string;
  translations: Record<string, string>;
}

export interface SubtitleCue {
  id: number;
  startTime: number;
  endTime: number;
  originalText: string;
  words: WordDetail[];
  translations: Record<string, string>;
}

export interface LanguageOption {
  code: string;
  name: string;
  flag: string;
  nativeName: string;
}
