import { useState, useEffect, useCallback, useRef } from 'react';
import { get, set } from 'idb-keyval';
import { App as CapApp } from '@capacitor/app';
import {
  useAppStore,
  FloatingSubtitle,
  checkFloatingPermissions,
  loadFloatingCues,
  clearFloatingCues,
  fetchVideoSubtitles,
  searchYouTubeVideoId,
  showFloatingAiFallback,
  type FloatingPermissionsStatus,
  type AutoAssistantStatus,
  type AutoAssistantVideoDetectedData
} from '@lexiduo/core';

export const IDB_KEY_AUTO_ASSISTANT = 'yt_ceviri_auto_assistant_enabled';
export const PRIMARY_IDB_KEY_AUTO_ASSISTANT = 'lexiduo_auto_assistant_enabled';

export interface UseAutoYouTubeAssistantOptions {
  onOpenPermissionGuide?: () => void;
}

export interface ProcessDetectedVideoOptions {
  sourceLang?: string;
  targetLang?: string;
}

export async function processDetectedVideo(
  data: AutoAssistantVideoDetectedData,
  activeRequestIdRef: { current: number },
  lastProcessedVideoRef: { current: string },
  options?: ProcessDetectedVideoOptions
): Promise<boolean> {
  if (!data || !data.title) return false;

  const currentStore = useAppStore.getState();
  const sourceLang = options?.sourceLang;
  const targetLang = options?.targetLang;
  const activeSource = (sourceLang && sourceLang.trim()) || (data.sourceLang && data.sourceLang.trim()) || 'auto';
  const activeTarget = (targetLang && targetLang.trim()) || (data.targetLang && data.targetLang.trim()) || (currentStore.targetLang && currentStore.targetLang.trim()) || 'tr';
  const apiKey = currentStore.apiKey;

  const videoKey = `${data.title}::${data.videoId || ''}::${activeSource}::${activeTarget}`;
  if (lastProcessedVideoRef.current === videoKey) {
    return false;
  }
  lastProcessedVideoRef.current = videoKey;
  const currentReqId = ++activeRequestIdRef.current;

  // Immediately clear previous video subtitles from floating overlay to prevent stale text
  await clearFloatingCues();
  if (currentReqId !== activeRequestIdRef.current) return false;

  try {
    let resolvedId = (data.videoId || '').trim();
    if (!resolvedId) {
      resolvedId = (await searchYouTubeVideoId(data.title, data.artist)) || '';
    }

    if (currentReqId !== activeRequestIdRef.current) return false;

    if (!resolvedId) {
      console.warn('[useAutoYouTubeAssistant] Unable to resolve videoId for detected video:', data.title);
      await clearFloatingCues();
      if (currentReqId !== activeRequestIdRef.current) return false;
      await showFloatingAiFallback(true);
      return false;
    }

    const result = await fetchVideoSubtitles(
      resolvedId,
      activeSource,
      activeTarget,
      apiKey,
      async (fastCues) => {
        if (currentReqId !== activeRequestIdRef.current) return;
        if (fastCues && fastCues.length > 0) {
          await loadFloatingCues(fastCues);
          if (currentReqId !== activeRequestIdRef.current) return;
          useAppStore.getState().setCues(fastCues);
        }
      }
    );

    if (currentReqId !== activeRequestIdRef.current) return false;

    if (result && Array.isArray(result.cues) && result.cues.length > 0) {
      await loadFloatingCues(result.cues);
      if (currentReqId !== activeRequestIdRef.current) return false;
      useAppStore.getState().setCues(result.cues);
      useAppStore.getState().setVideoId(resolvedId);
      return true;
    } else {
      await clearFloatingCues();
      if (currentReqId !== activeRequestIdRef.current) return false;
      await showFloatingAiFallback(true);
      return false;
    }
  } catch (err) {
    if (currentReqId !== activeRequestIdRef.current) return false;
    console.error('[useAutoYouTubeAssistant] Error fetching subtitles for detected video:', err);
    await clearFloatingCues();
    if (currentReqId !== activeRequestIdRef.current) return false;
    await showFloatingAiFallback(true);
    return false;
  }
}

export function useAutoYouTubeAssistant(options?: UseAutoYouTubeAssistantOptions) {
  const [isActive, setIsActive] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [permissions, setPermissions] = useState<FloatingPermissionsStatus | null>(null);

  const sourceLang = useAppStore((s) => s.sourceLang);
  const targetLang = useAppStore((s) => s.targetLang);

  const onOpenPermissionGuideRef = useRef(options?.onOpenPermissionGuide);
  onOpenPermissionGuideRef.current = options?.onOpenPermissionGuide;

  const lastProcessedVideoRef = useRef<string>('');
  const activeRequestIdRef = useRef<number>(0);
  const lastDetectedDataRef = useRef<AutoAssistantVideoDetectedData | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const [savedEnabledPrimary, savedEnabledLegacy, perms, status] = await Promise.all([
        get<boolean>(PRIMARY_IDB_KEY_AUTO_ASSISTANT),
        get<boolean>(IDB_KEY_AUTO_ASSISTANT),
        checkFloatingPermissions(),
        FloatingSubtitle.getAutoAssistantStatus().catch(() => ({ active: false } as AutoAssistantStatus))
      ]);

      const savedEnabled = savedEnabledPrimary !== undefined ? savedEnabledPrimary : savedEnabledLegacy;
      setPermissions(perms);

      const isActuallyActive = Boolean(status?.active || status?.enabled || status?.isOverlayRunning);
      const shouldBeActive = Boolean(savedEnabled && perms.overlay);
      if (shouldBeActive && !isActuallyActive) {
        await FloatingSubtitle.startAutoAssistant({ sourceLang, targetLang }).catch(() => {});
        setIsActive(true);
      } else if (!perms.overlay && savedEnabled) {
        await Promise.all([
          set(PRIMARY_IDB_KEY_AUTO_ASSISTANT, false),
          set(IDB_KEY_AUTO_ASSISTANT, false)
        ]);
        setIsActive(false);
      } else {
        setIsActive(isActuallyActive || shouldBeActive);
      }
    } catch (err) {
      console.warn('Failed to refresh auto assistant status:', err);
    } finally {
      setIsLoading(false);
    }
  }, [sourceLang, targetLang]);

  useEffect(() => {
    refreshStatus();

    let appStateHandle: any = null;
    try {
      CapApp.addListener('appStateChange', (state) => {
        if (state.isActive) {
          refreshStatus();
        }
      }).then((handle) => {
        appStateHandle = handle;
      });
    } catch {}

    return () => {
      if (appStateHandle?.remove) {
        appStateHandle.remove();
      }
    };
  }, [refreshStatus]);

  // Synchronize language updates from app settings to native assistant service and re-fetch if video is active
  useEffect(() => {
    if (isActive) {
      FloatingSubtitle.updateAssistantLanguages({ sourceLang, targetLang }).catch(() => {});
      if (lastDetectedDataRef.current) {
        processDetectedVideo(lastDetectedDataRef.current, activeRequestIdRef, lastProcessedVideoRef, { sourceLang, targetLang }).catch(() => {});
      }
    }
  }, [isActive, sourceLang, targetLang]);

  // Listen for native overlay 'X' button close events to synchronize toggle switch
  useEffect(() => {
    let stoppedHandle: any = null;
    let statusHandle: any = null;

    const onStop = async () => {
      activeRequestIdRef.current++;
      await set(IDB_KEY_AUTO_ASSISTANT, false);
      setIsActive(false);
      lastProcessedVideoRef.current = '';
      lastDetectedDataRef.current = null;
    };

    try {
      FloatingSubtitle.addListener('onAutoAssistantStopped', onStop).then((h) => {
        stoppedHandle = h;
      });
      FloatingSubtitle.addListener('autoAssistantStatusChanged', (status) => {
        if (!status?.active && !status?.enabled) {
          onStop();
        }
      }).then((h) => {
        statusHandle = h;
      });
    } catch {}

    return () => {
      stoppedHandle?.remove?.();
      statusHandle?.remove?.();
    };
  }, []);

  // Orchestrate automatic video subtitle fetching when assistant is active
  useEffect(() => {
    if (!isActive) {
      activeRequestIdRef.current++;
      lastProcessedVideoRef.current = '';
      lastDetectedDataRef.current = null;
      return;
    }

    let listenerHandle: any = null;

    const handleDetectedVideo = async (data: AutoAssistantVideoDetectedData) => {
      lastDetectedDataRef.current = data;
      await processDetectedVideo(data, activeRequestIdRef, lastProcessedVideoRef, { sourceLang, targetLang });
    };

    try {
      FloatingSubtitle.addListener('autoAssistantVideoDetected', handleDetectedVideo).then((handle) => {
        listenerHandle = handle;
      });
    } catch (e) {
      console.warn('[useAutoYouTubeAssistant] Failed to register autoAssistantVideoDetected listener:', e);
    }

    return () => {
      if (listenerHandle?.remove) {
        listenerHandle.remove();
      }
    };
  }, [isActive, sourceLang, targetLang]);

  const start = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    try {
      const perms = await checkFloatingPermissions();
      setPermissions(perms);

      if (!perms.overlay || !perms.notification) {
        onOpenPermissionGuideRef.current?.();
        if (!perms.overlay) {
          return false;
        }
      }

      const res = await FloatingSubtitle.startAutoAssistant({ sourceLang, targetLang });
      if (res?.started || res?.enabled || res?.active) {
        await Promise.all([
          set(PRIMARY_IDB_KEY_AUTO_ASSISTANT, true),
          set(IDB_KEY_AUTO_ASSISTANT, true)
        ]);
        setIsActive(true);

        // Pre-prime floating overlay with existing cues if store already has an active video
        const currentStore = useAppStore.getState();
        if (currentStore.cues && currentStore.cues.length > 0) {
          try {
            await loadFloatingCues(currentStore.cues);
          } catch (primeErr) {
            console.warn('[useAutoYouTubeAssistant] Pre-priming cues warning:', primeErr);
          }
        }
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to start auto assistant:', err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [sourceLang, targetLang]);

  const stop = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    try {
      activeRequestIdRef.current++;
      const res = await FloatingSubtitle.stopAutoAssistant();
      await Promise.all([
        set(PRIMARY_IDB_KEY_AUTO_ASSISTANT, false),
        set(IDB_KEY_AUTO_ASSISTANT, false)
      ]);
      setIsActive(false);
      lastProcessedVideoRef.current = '';
      lastDetectedDataRef.current = null;
      return Boolean(res?.stopped || res?.enabled === false);
    } catch (err) {
      console.error('Failed to stop auto assistant:', err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const toggle = useCallback(async (): Promise<boolean> => {
    if (isActive) {
      return await stop();
    } else {
      return await start();
    }
  }, [isActive, start, stop]);

  return {
    isActive,
    isLoading,
    permissions,
    start,
    stop,
    toggle,
    refreshStatus
  };
}
