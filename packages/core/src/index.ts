// Packages/core barrel export

// Types
export * from './types';

// Components
export { SubtitleOverlay } from './components/SubtitleOverlay';
export { WordDrawer } from './components/WordDrawer';
export { WordToken } from './components/WordToken';
export { WordTooltip } from './components/WordTooltip';
export { CustomSelect, type SelectOption } from './components/CustomSelect';
export { ApiKeyModal, type ApiKeyModalProps } from './components/ApiKeyModal';
export { InteractiveTranscriptPanel } from './components/InteractiveTranscriptPanel';
export { YouTubePlayer, type YouTubePlayerHandle } from './components/YouTubePlayer';
export { TopSearchOverlay } from './components/TopSearchOverlay';
export { HistoryModal } from './components/HistoryModal';
export { HistoryLimitPicker, type HistoryLimitPickerProps } from './components/HistoryLimitPicker';
export { FloatingDock, type FloatingDockProps } from './components/FloatingDock';
export { FloatingPermissionGuideModal, type FloatingPermissionGuideModalProps } from './components/FloatingPermissionGuideModal';
export { DownloadSubtitlesModal, type DownloadSubtitlesModalProps } from './components/DownloadSubtitlesModal';
export { SubtitleSettingsModal, type SubtitleSettingsModalProps } from './components/SubtitleSettingsModal';

// Services
export { lookupWord } from './services/dictionaryService';
export { persistApiKey, retrieveApiKey, PRIMARY_KEY_NAME, LEGACY_KEY_NAME } from './services/apiKeyStorage';
export { smartFetch, translateTextSecure } from './services/translationService';
export { testGeminiApiKey, GEMINI_MODEL_HIERARCHY, type ApiKeyStatus, type ApiKeyTestResult } from './services/geminiService';
export { 
  aggregateSentenceCues, 
  distributeTargetTextToWindows, 
  type SentenceGroup 
} from './services/sentenceSegmentation';
export { auditAndRepairCues, isCueUntranslated, type TranslationFunction } from './services/subtitleAuditor';
export { getCachedTranscript, cacheTranscript } from './services/cacheService';
export { fetchVideoSubtitles, extractYouTubeId, selectCaptionTrack, translateWithGeminiAI, POPULAR_VIDEOS } from './services/transcriptService';
export { 
  fetchYouTubeMetadata, 
  cacheVideoTitle, 
  enrichHistoryItems, 
  HISTORY_LIMIT_DEFAULT, 
  HISTORY_LIMIT_OPTIONS 
} from './services/videoMetadata';
export { searchYouTubeVideoId, cacheResolvedVideoId } from './services/youtubeSearchService';
export { 
  listenToSharedLinks, 
  extractTextFromIntentPayload, 
  uriToFile,
  SendIntent, 
  type SendIntentResult 
} from './services/sendIntentService';
export {
  FloatingSubtitle,
  formatCuesForFloating,
  checkFloatingPermissions,
  requestOverlayPermission,
  requestNotificationAccess,
  requestAccessibility,
  startFloatingOverlay,
  stopFloatingOverlay,
  loadFloatingCues,
  clearFloatingCues,
  isFloatingOverlayRunning,
  startAutoAssistant,
  stopAutoAssistant,
  getAutoAssistantStatus,
  showFloatingAiFallback,
  addAutoAssistantVideoListener,
  type FloatingPermissionsStatus,
  type FloatingSubtitlePlugin,
  type RawFloatingCue,
  type AutoAssistantStatus,
  type AutoAssistantVideoDetectedData
} from './services/floatingSubtitleService';
export {
  BackgroundTask,
  startBackgroundTask,
  updateBackgroundTask,
  finishBackgroundTask,
  isBackgroundTaskRunning,
  withBackgroundTask,
  getBackgroundTaskMockState,
  type BackgroundTaskPlugin,
  type BackgroundTaskState
} from './services/backgroundTaskManager';
export {
  formatSrtTimestamp,
  formatVttTimestamp,
  getCueTextForExport,
  cuesToSrt,
  cuesToVtt,
  batchTranslateCues,
  resolveCuesForLanguage,
  filterLangsNeedingTranslation,
  downloadSubtitleFile,
  type SubtitleExportMode
} from './services/subtitleExportService';
export {
  downloadBlobAsFile,
  fetchYouTubeVideoStream,
  muxSubtitlesIntoMp4,
  muxSubtitlesIntoMkv,
  exportVideoWithSoftSubtitles,
  type SubtitleTrackExport,
  type VideoExportParams
} from './services/videoRemuxService';

// Store
export { useAppStore } from './store/useAppStore';

// i18n
export { TranslationProvider, TranslationContext } from './i18n/TranslationContext';
export { useTranslation } from './i18n/useTranslation';
export { SUPPORTED_LANGUAGES, LANGUAGE_MAP, BCP47_MAP, getLanguageBcp47, getLanguageDisplayName } from './i18n/languages';
export type { Language, LanguageInfo, TranslationKey } from './i18n/types';

// Utils & Palettes
export {
  COLOR_PALETTES,
  SOURCE_TEXT_SWATCHES,
  TARGET_TEXT_SWATCHES,
  BG_COLOR_SWATCHES,
  syncStyleToNativeOverlay,
  type SubtitlePalette,
  type SubtitleStyleSyncParams,
} from './utils/colorPalettes';


