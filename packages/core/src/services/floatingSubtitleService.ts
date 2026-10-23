import { registerPlugin, Capacitor } from '@capacitor/core';
import type { SubtitleCue } from '../types';

export interface FloatingPermissionsStatus {
  overlay: boolean;
  notification: boolean;
  accessibility: boolean;
  allGranted: boolean;
  postNotifications?: boolean;
  batteryOptimization?: boolean;
}

export interface RawFloatingCue {
  startMs: number;
  endMs: number;
  start?: number;
  end?: number;
  targetText: string;
  sourceText: string;
}

export interface AutoAssistantStatus {
  active: boolean;
  enabled?: boolean;
  started?: boolean;
  currentVideoId?: string;
  targetLang?: string;
  sourceLang?: string;
  currentTitle?: string;
  currentArtist?: string;
  isOverlayRunning?: boolean;
}

export interface AutoAssistantVideoDetectedData {
  title: string;
  artist?: string;
  videoId?: string;
  sourceLang?: string;
  targetLang?: string;
}

export interface FloatingSubtitlePlugin {
  checkPermissions(): Promise<FloatingPermissionsStatus>;
  requestOverlayPermission(): Promise<void>;
  requestNotificationAccess(): Promise<void>;
  requestAccessibility(): Promise<void>;
  openAppSettings(): Promise<void>;
  requestBatteryOptimization(): Promise<void>;
  requestNotificationPermission(): Promise<void>;
  startOverlay(options?: { cues?: RawFloatingCue[]; videoId?: string }): Promise<{ started: boolean }>;
  stopOverlay(): Promise<{ stopped: boolean }>;
  loadCues(options: { cues: RawFloatingCue[] }): Promise<{ count: number }>;
  clearCues(): Promise<{ cleared: boolean }>;
  isOverlayRunning(): Promise<{ running: boolean }>;
  startAutoAssistant(options?: { sourceLang?: string; targetLang?: string }): Promise<{ started?: boolean; enabled?: boolean; active?: boolean }>;
  stopAutoAssistant(): Promise<{ stopped?: boolean; enabled?: boolean; active?: boolean }>;
  getAutoAssistantStatus(): Promise<AutoAssistantStatus>;
  updateAssistantLanguages(options?: { sourceLang?: string; targetLang?: string }): Promise<{ updated?: boolean }>;
  showAiFallback(options?: { show?: boolean }): Promise<{ shown?: boolean }>;
  updateStyle(options?: { sourceTextColor?: string; targetTextColor?: string; bgColor?: string; bgOpacity?: number; fontSize?: number }): Promise<{ updated?: boolean }>;
  addListener(
    eventName: 'autoAssistantVideoDetected',
    listenerFunc: (data: AutoAssistantVideoDetectedData) => void
  ): Promise<{ remove: () => Promise<void> }>;
  addListener(
    eventName: string,
    listenerFunc: (...args: any[]) => void
  ): Promise<{ remove: () => Promise<void> }>;
}

// In-memory state for web mock fallback
let mockRunning = false;
let mockCues: RawFloatingCue[] = [];
let mockAutoAssistantActive = false;
let mockAutoAssistantSourceLang = 'auto';
let mockAutoAssistantTargetLang = 'tr';

export const FloatingSubtitle = registerPlugin<FloatingSubtitlePlugin>('FloatingSubtitle', {
  web: () => ({
    async checkPermissions(): Promise<FloatingPermissionsStatus> {
      return {
        overlay: true,
        notification: true,
        accessibility: true,
        allGranted: true,
        postNotifications: true,
        batteryOptimization: true
      };
    },
    async requestOverlayPermission(): Promise<void> {},
    async requestNotificationAccess(): Promise<void> {},
    async requestAccessibility(): Promise<void> {},
    async openAppSettings(): Promise<void> {},
    async requestBatteryOptimization(): Promise<void> {},
    async requestNotificationPermission(): Promise<void> {},
    async startOverlay(options?: { cues?: RawFloatingCue[]; videoId?: string }): Promise<{ started: boolean }> {
      mockRunning = true;
      if (options?.cues) {
        mockCues = [...options.cues];
      }
      return { started: true };
    },
    async stopOverlay(): Promise<{ stopped: boolean }> {
      mockRunning = false;
      return { stopped: true };
    },
    async loadCues(options: { cues: RawFloatingCue[] }): Promise<{ count: number }> {
      mockCues = [...options.cues];
      return { count: mockCues.length };
    },
    async clearCues(): Promise<{ cleared: boolean }> {
      mockCues = [];
      return { cleared: true };
    },
    async isOverlayRunning(): Promise<{ running: boolean }> {
      return { running: mockRunning };
    },
    async startAutoAssistant(options?: { sourceLang?: string; targetLang?: string }): Promise<{ started: boolean }> {
      mockAutoAssistantActive = true;
      if (options?.sourceLang) mockAutoAssistantSourceLang = options.sourceLang;
      if (options?.targetLang) mockAutoAssistantTargetLang = options.targetLang;
      return { started: true };
    },
    async stopAutoAssistant(): Promise<{ stopped: boolean }> {
      mockAutoAssistantActive = false;
      return { stopped: true };
    },
    async getAutoAssistantStatus(): Promise<AutoAssistantStatus> {
      return {
        active: mockAutoAssistantActive,
        sourceLang: mockAutoAssistantSourceLang,
        targetLang: mockAutoAssistantTargetLang
      };
    },
    async updateAssistantLanguages(options?: { sourceLang?: string; targetLang?: string }): Promise<{ updated: boolean }> {
      if (options?.sourceLang) mockAutoAssistantSourceLang = options.sourceLang;
      if (options?.targetLang) mockAutoAssistantTargetLang = options.targetLang;
      return { updated: true };
    },
    async showAiFallback(): Promise<{ shown: boolean }> {
      return { shown: true };
    },
    async updateStyle(): Promise<{ updated: boolean }> {
      return { updated: true };
    },
    async addListener(): Promise<{ remove: () => Promise<void> }> {
      return { remove: async () => {} };
    }
  })
});

/**
 * Formats app SubtitleCues (seconds) into RawFloatingCues (milliseconds)
 */
export function formatCuesForFloating(cues: SubtitleCue[]): RawFloatingCue[] {
  if (!Array.isArray(cues)) return [];

  return cues.map(cue => {
    const startMs = Math.round((cue.start || 0) * 1000);
    const endMs = Math.round((cue.end || 0) * 1000);
    return {
      startMs,
      endMs,
      start: cue.start,
      end: cue.end,
      targetText: cue.targetText || '',
      sourceText: cue.sourceText || ''
    };
  });
}

export async function checkFloatingPermissions(): Promise<FloatingPermissionsStatus> {
  if (!Capacitor.isNativePlatform()) {
    return {
      overlay: true,
      notification: true,
      accessibility: true,
      allGranted: true,
      postNotifications: true,
      batteryOptimization: true
    };
  }
  return await FloatingSubtitle.checkPermissions();
}

export async function requestOverlayPermission(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  await FloatingSubtitle.requestOverlayPermission();
}

export async function requestNotificationAccess(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  await FloatingSubtitle.requestNotificationAccess();
}

export async function requestAccessibility(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  await FloatingSubtitle.requestAccessibility();
}

export async function openAppSettings(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  await FloatingSubtitle.openAppSettings();
}

export async function requestBatteryOptimization(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  await FloatingSubtitle.requestBatteryOptimization();
}

export async function requestNotificationPermission(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  await FloatingSubtitle.requestNotificationPermission();
}

export async function startFloatingOverlay(cues?: SubtitleCue[], videoId?: string): Promise<boolean> {
  const rawCues = cues ? formatCuesForFloating(cues) : undefined;
  const result = await FloatingSubtitle.startOverlay({
    cues: rawCues,
    videoId: videoId || undefined
  });
  return !!result.started;
}

export async function stopFloatingOverlay(): Promise<boolean> {
  const result = await FloatingSubtitle.stopOverlay();
  return !!result.stopped;
}

export async function loadFloatingCues(cues: SubtitleCue[]): Promise<number> {
  const rawCues = formatCuesForFloating(cues);
  const result = await FloatingSubtitle.loadCues({ cues: rawCues });
  return result.count ?? rawCues.length;
}

export async function clearFloatingCues(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) {
    mockCues = [];
    return true;
  }
  try {
    const result = await FloatingSubtitle.clearCues();
    return !!result.cleared;
  } catch (err) {
    console.warn('clearFloatingCues failed on native platform:', err);
    return false;
  }
}

export async function isFloatingOverlayRunning(): Promise<boolean> {
  const result = await FloatingSubtitle.isOverlayRunning();
  return !!result.running;
}

export async function startAutoAssistant(sourceLang?: string, targetLang?: string): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) {
    mockAutoAssistantActive = true;
    if (sourceLang) mockAutoAssistantSourceLang = sourceLang;
    if (targetLang) mockAutoAssistantTargetLang = targetLang;
    return true;
  }
  try {
    const result = await FloatingSubtitle.startAutoAssistant({ sourceLang, targetLang });
    return !!(result?.started || result?.enabled || result?.active);
  } catch (err) {
    console.warn('startAutoAssistant failed on native platform:', err);
    return false;
  }
}

export async function stopAutoAssistant(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) {
    mockAutoAssistantActive = false;
    return true;
  }
  try {
    const result = await FloatingSubtitle.stopAutoAssistant();
    return !!(result?.stopped || result?.enabled === false);
  } catch (err) {
    console.warn('stopAutoAssistant failed on native platform:', err);
    return false;
  }
}

export async function getAutoAssistantStatus(): Promise<AutoAssistantStatus> {
  if (!Capacitor.isNativePlatform()) {
    return {
      active: mockAutoAssistantActive,
      enabled: mockAutoAssistantActive,
      sourceLang: mockAutoAssistantSourceLang,
      targetLang: mockAutoAssistantTargetLang
    };
  }
  try {
    const status = await FloatingSubtitle.getAutoAssistantStatus();
    return {
      ...status,
      active: Boolean(status.active || status.enabled)
    };
  } catch (err) {
    console.warn('getAutoAssistantStatus failed on native platform:', err);
    return { active: false, enabled: false };
  }
}

export async function showFloatingAiFallback(show = true): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await FloatingSubtitle.showAiFallback({ show });
  } catch (err) {
    console.warn('showFloatingAiFallback failed:', err);
  }
}

export function addAutoAssistantVideoListener(
  callback: (data: AutoAssistantVideoDetectedData) => void
): Promise<{ remove: () => Promise<void> }> {
  return FloatingSubtitle.addListener('autoAssistantVideoDetected', callback);
}

