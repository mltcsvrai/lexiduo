import { get, set, del } from 'idb-keyval';
import { retrieveApiKey } from './apiKeyStorage';

export const STORAGE_KEYS = {
  VIDEO_ID: { primary: 'lexiduo_video_id', legacy: 'yt_ceviri_video_id' },
  HISTORY_LIST: { primary: 'lexiduo_history_list', legacy: 'yt_ceviri_history_list' },
  LOCAL_HISTORY: { primary: 'lexiduo_local_history', legacy: 'yt_ceviri_local_history' },
  HISTORY_LAYOUT: { primary: 'lexiduo_history_layout', legacy: 'yt_ceviri_history_layout' },
  HISTORY_LIMIT: { primary: 'lexiduo_history_limit', legacy: 'yt_ceviri_history_limit' },
  AUTO_ASSISTANT: { primary: 'lexiduo_auto_assistant_enabled', legacy: 'yt_ceviri_auto_assistant_enabled' },
  SUBTITLE_BG: { primary: 'lexiduo_subtitle_bg', legacy: 'yt_ceviri_subtitle_bg' },
  SYNC_OFFSET: { primary: 'lexiduo_sync_offset', legacy: 'yt_ceviri_sync_offset' },
  SOURCE_COLOR: { primary: 'lexiduo_source_color', legacy: 'yt_ceviri_source_color' },
  TARGET_COLOR: { primary: 'lexiduo_target_color', legacy: 'yt_ceviri_target_color' },
  FONT_FAMILY: { primary: 'lexiduo_font_family', legacy: 'yt_ceviri_font_family' },
  FONT_WEIGHT: { primary: 'lexiduo_font_weight', legacy: 'yt_ceviri_font_weight' },
  BG_WIDTH_MODE: { primary: 'lexiduo_bg_width_mode', legacy: 'yt_ceviri_bg_width_mode' },
  BG_COLOR: { primary: 'lexiduo_bg_color', legacy: 'yt_ceviri_bg_color' },
  BG_OPACITY: { primary: 'lexiduo_bg_opacity', legacy: 'yt_ceviri_bg_opacity' },
  TEXT_OUTLINE: { primary: 'lexiduo_text_outline', legacy: 'yt_ceviri_text_outline' },
  HIDE_DOWNLOAD_LOCATION_NOTICE: { primary: 'lexiduo_hide_download_location_notice', legacy: 'yt_ceviri_hide_download_location_notice' },
} as const;

export async function getCompatItem<T>(primaryKey: string, legacyKey: string): Promise<T | undefined> {
  try {
    const val = await get<T>(primaryKey);
    if (val !== undefined && val !== null) {
      return val;
    }
    return await get<T>(legacyKey);
  } catch (e) {
    console.warn(`[storageKeys] Error reading ${primaryKey}/${legacyKey}:`, e);
    return undefined;
  }
}

export async function setCompatItem<T>(primaryKey: string, legacyKey: string, value: T): Promise<void> {
  try {
    await Promise.all([
      set(primaryKey, value),
      set(legacyKey, value)
    ]);
  } catch (e) {
    console.warn(`[storageKeys] Error writing ${primaryKey}/${legacyKey}:`, e);
  }
}

export async function delCompatItem(primaryKey: string, legacyKey: string): Promise<void> {
  try {
    await Promise.all([
      del(primaryKey),
      del(legacyKey)
    ]);
  } catch (e) {
    console.warn(`[storageKeys] Error deleting ${primaryKey}/${legacyKey}:`, e);
  }
}

export interface LoadedAppPreferences {
  apiKey: string;
  videoId?: string;
  sourceLang?: string;
  targetLang?: string;
  subtitleBg?: boolean;
  syncOffset?: number;
  historyLimit?: number;
  sourceColor?: string;
  targetColor?: string;
  fontFamily?: string;
  fontWeight?: string;
  bgWidthMode?: string;
  bgColor?: string;
  bgOpacity?: number;
  textOutline?: string;
}

export async function loadAppPreferences(): Promise<LoadedAppPreferences> {
  const [
    apiKey,
    videoId,
    sourceLang,
    targetLang,
    subtitleBg,
    syncOffset,
    historyLimit,
    sourceColor,
    targetColor,
    fontFamily,
    fontWeight,
    bgWidthMode,
    bgColor,
    bgOpacity,
    textOutline
  ] = await Promise.all([
    retrieveApiKey(),
    getCompatItem<string>(STORAGE_KEYS.VIDEO_ID.primary, STORAGE_KEYS.VIDEO_ID.legacy),
    get<string>('source_lang'),
    get<string>('target_lang'),
    getCompatItem<boolean>(STORAGE_KEYS.SUBTITLE_BG.primary, STORAGE_KEYS.SUBTITLE_BG.legacy),
    getCompatItem<number>(STORAGE_KEYS.SYNC_OFFSET.primary, STORAGE_KEYS.SYNC_OFFSET.legacy),
    getCompatItem<number>(STORAGE_KEYS.HISTORY_LIMIT.primary, STORAGE_KEYS.HISTORY_LIMIT.legacy),
    getCompatItem<string>(STORAGE_KEYS.SOURCE_COLOR.primary, STORAGE_KEYS.SOURCE_COLOR.legacy),
    getCompatItem<string>(STORAGE_KEYS.TARGET_COLOR.primary, STORAGE_KEYS.TARGET_COLOR.legacy),
    getCompatItem<string>(STORAGE_KEYS.FONT_FAMILY.primary, STORAGE_KEYS.FONT_FAMILY.legacy),
    getCompatItem<string>(STORAGE_KEYS.FONT_WEIGHT.primary, STORAGE_KEYS.FONT_WEIGHT.legacy),
    getCompatItem<string>(STORAGE_KEYS.BG_WIDTH_MODE.primary, STORAGE_KEYS.BG_WIDTH_MODE.legacy),
    getCompatItem<string>(STORAGE_KEYS.BG_COLOR.primary, STORAGE_KEYS.BG_COLOR.legacy),
    getCompatItem<number>(STORAGE_KEYS.BG_OPACITY.primary, STORAGE_KEYS.BG_OPACITY.legacy),
    getCompatItem<string>(STORAGE_KEYS.TEXT_OUTLINE.primary, STORAGE_KEYS.TEXT_OUTLINE.legacy)
  ]);

  return {
    apiKey,
    videoId,
    sourceLang,
    targetLang,
    subtitleBg,
    syncOffset,
    historyLimit,
    sourceColor,
    targetColor,
    fontFamily,
    fontWeight,
    bgWidthMode,
    bgColor,
    bgOpacity,
    textOutline
  };
}
