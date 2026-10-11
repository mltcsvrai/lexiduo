import { create } from 'zustand';
import type { 
  SubtitleCue, 
  SubtitleMode, 
  WordTranslation,
  SubtitleBgWidthMode,
  SubtitleFontFamily,
  SubtitleFontWeight,
  SubtitlePosition,
  SubtitleTextOutline
} from '../types';

interface AppState {
  videoId: string;
  setVideoId: (id: string) => void;
  
  cues: SubtitleCue[];
  setCues: (cues: SubtitleCue[]) => void;
  
  currentTime: number;
  setCurrentTime: (time: number) => void;
  
  loadingSubtitles: boolean;
  setLoadingSubtitles: (loading: boolean) => void;
  
  isTranslatingTarget: boolean;
  setIsTranslatingTarget: (translating: boolean) => void;
  
  savedStartTime: number;
  setSavedStartTime: (time: number) => void;
  
  subtitleMode: SubtitleMode;
  setSubtitleMode: (mode: SubtitleMode) => void;
  
  fontSize: number;
  setFontSize: (size: number) => void;
  
  activeWordTranslation: WordTranslation | null;
  setActiveWordTranslation: (translation: WordTranslation | null) => void;
  
  wordLoading: boolean;
  setWordLoading: (loading: boolean) => void;
  
  activeTokenId: string | null;
  setActiveTokenId: (id: string | null) => void;
  
  externalPause: boolean;
  setExternalPause: (pause: boolean) => void;
  
  apiKey: string;
  setApiKey: (key: string) => void;
  
  autoPause: boolean;
  setAutoPause: (pause: boolean) => void;
  
  playbackRate: number;
  setPlaybackRate: (rate: number) => void;
  
  isSettingsOpen: boolean;
  setIsSettingsOpen: (isOpen: boolean) => void;
  isHistoryOpen: boolean;
  setIsHistoryOpen: (isOpen: boolean) => void;
  
  isSearchOpen: boolean;
  setIsSearchOpen: (isOpen: boolean) => void;
  
  sourceLang: string;
  setSourceLang: (lang: string) => void;
  
  targetLang: string;
  setTargetLang: (lang: string) => void;

  detectedSourceLang: string;
  setDetectedSourceLang: (lang: string) => void;
  
  showSubtitleBg: boolean;
  setShowSubtitleBg: (show: boolean) => void;
  
  syncOffset: number;
  setSyncOffset: (offset: number) => void;

  historyLimit: number;
  setHistoryLimit: (limit: number) => void;

  // Subtitle Appearance & Customization
  sourceTextColor: string;
  setSourceTextColor: (color: string) => void;
  targetTextColor: string;
  setTargetTextColor: (color: string) => void;
  fontFamily: SubtitleFontFamily | string;
  setFontFamily: (font: SubtitleFontFamily | string) => void;
  fontWeight: SubtitleFontWeight | string;
  setFontWeight: (weight: SubtitleFontWeight | string) => void;
  bgWidthMode: SubtitleBgWidthMode;
  setBgWidthMode: (mode: SubtitleBgWidthMode) => void;
  bgColor: string;
  setBgColor: (color: string) => void;
  bgOpacity: number;
  setBgOpacity: (opacity: number) => void;
  textOutline: SubtitleTextOutline;
  setTextOutline: (outline: SubtitleTextOutline) => void;
  isDraggable: boolean;
  setIsDraggable: (draggable: boolean) => void;
  subtitlePosition: SubtitlePosition;
  setSubtitlePosition: (pos: SubtitlePosition) => void;
  autoPauseAfterSubtitle: boolean;
  setAutoPauseAfterSubtitle: (pause: boolean) => void;
  karaokeHighlight: boolean;
  setKaraokeHighlight: (highlight: boolean) => void;

  // Modals
  isSubtitleSettingsOpen: boolean;
  setIsSubtitleSettingsOpen: (isOpen: boolean) => void;
  isDownloadModalOpen: boolean;
  setIsDownloadModalOpen: (isOpen: boolean) => void;

  lookupWordAction: (word: string, isTargetWord: boolean, tokenId: string | null) => Promise<void>;
}

import { lookupWord } from '../services/dictionaryService';

export const useAppStore = create<AppState>((set, get) => ({
  videoId: '',
  setVideoId: (id) => set({ videoId: id }),
  
  cues: [],
  setCues: (cues) => set({ cues }),
  
  currentTime: 0,
  setCurrentTime: (time) => set({ currentTime: time }),
  
  loadingSubtitles: false,
  setLoadingSubtitles: (loading) => set({ loadingSubtitles: loading }),
  
  isTranslatingTarget: false,
  setIsTranslatingTarget: (translating) => set({ isTranslatingTarget: translating }),
  
  savedStartTime: 0,
  setSavedStartTime: (time) => set({ savedStartTime: time }),
  
  subtitleMode: 'DUAL',
  setSubtitleMode: (mode) => set({ subtitleMode: mode }),
  
  fontSize: 13,
  setFontSize: (size) => set({ fontSize: size }),
  
  activeWordTranslation: null,
  setActiveWordTranslation: (translation) => set({ activeWordTranslation: translation }),
  
  wordLoading: false,
  setWordLoading: (loading) => set({ wordLoading: loading }),
  
  activeTokenId: null,
  setActiveTokenId: (id) => set({ activeTokenId: id }),
  
  externalPause: false,
  setExternalPause: (pause) => set({ externalPause: pause }),
  
  apiKey: '',
  setApiKey: (key) => set({ apiKey: key }),
  
  autoPause: true,
  setAutoPause: (pause) => set({ autoPause: pause }),
  
  playbackRate: 1,
  setPlaybackRate: (rate) => set({ playbackRate: rate }),
  
  isSettingsOpen: false,
  setIsSettingsOpen: (isOpen) => set({ isSettingsOpen: isOpen }),
  isHistoryOpen: false,
  setIsHistoryOpen: (isOpen) => set({ isHistoryOpen: isOpen }),
  
  isSearchOpen: false,
  setIsSearchOpen: (isOpen) => set({ isSearchOpen: isOpen }),
  
  sourceLang: 'auto',
  setSourceLang: (lang) => set({ sourceLang: lang }),
  
  targetLang: 'tr',
  setTargetLang: (lang) => set({ targetLang: lang }),

  detectedSourceLang: '',
  setDetectedSourceLang: (lang) => set({ detectedSourceLang: lang }),
  
  showSubtitleBg: true,
  setShowSubtitleBg: (show) => set({ showSubtitleBg: show }),
  
  syncOffset: 0,
  setSyncOffset: (offset) => set({ syncOffset: offset }),

  historyLimit: 6,
  setHistoryLimit: (limit) => set({ historyLimit: limit }),

  // Subtitle Appearance defaults
  sourceTextColor: '#ffffff',
  setSourceTextColor: (color) => set({ sourceTextColor: color }),
  targetTextColor: '#facc15',
  setTargetTextColor: (color) => set({ targetTextColor: color }),
  fontFamily: 'sans',
  setFontFamily: (font) => set({ fontFamily: font }),
  fontWeight: 'bold',
  setFontWeight: (weight) => set({ fontWeight: weight }),
  bgWidthMode: 'dynamic',
  setBgWidthMode: (mode) => set({ bgWidthMode: mode }),
  bgColor: '#000000',
  setBgColor: (color) => set({ bgColor: color }),
  bgOpacity: 75,
  setBgOpacity: (opacity) => set({ bgOpacity: opacity }),
  textOutline: 'shadow',
  setTextOutline: (outline) => set({ textOutline: outline }),
  isDraggable: false,
  setIsDraggable: (draggable) => set({ isDraggable: draggable }),
  subtitlePosition: { x: 0, y: 0 },
  setSubtitlePosition: (pos) => set({ subtitlePosition: pos }),
  autoPauseAfterSubtitle: false,
  setAutoPauseAfterSubtitle: (pause) => set({ autoPauseAfterSubtitle: pause }),
  karaokeHighlight: true,
  setKaraokeHighlight: (highlight) => set({ karaokeHighlight: highlight }),

  isSubtitleSettingsOpen: false,
  setIsSubtitleSettingsOpen: (isOpen) => set({ isSubtitleSettingsOpen: isOpen }),
  isDownloadModalOpen: false,
  setIsDownloadModalOpen: (isOpen) => set({ isDownloadModalOpen: isOpen }),

  lookupWordAction: async (word: string, isTargetWord: boolean, tokenId: string | null) => {
    const state = get();
    set({ activeTokenId: tokenId, wordLoading: true });
    
    // Auto-pause video playback during word lookup as immutable system default
    set({ externalPause: true });
    setTimeout(() => set({ externalPause: false }), 300);

    try {
      const translation = await lookupWord(
        word, 
        state.sourceLang, 
        state.targetLang, 
        isTargetWord, 
        state.apiKey,
        state.detectedSourceLang
      );
      // Ensure we haven't clicked another word while waiting
      if (get().activeTokenId === tokenId) {
        set({ activeWordTranslation: translation });
      }
    } catch (err) {
      console.warn('Word translation error:', err);
      if (get().activeTokenId === tokenId) {
        set({
          activeWordTranslation: {
            word,
            normalizedWord: word,
            translation: word
          }
        });
      }
    } finally {
      if (get().activeTokenId === tokenId) {
        set({ wordLoading: false });
      }
    }
  },
}));
