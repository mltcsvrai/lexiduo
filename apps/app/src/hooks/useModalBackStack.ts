import { useEffect, useRef } from 'react';
import { App as CapApp } from '@capacitor/app';
import { useAppStore } from '@lexiduo/core';

export interface ModalBackStackProps {
  isYtPlaybackChoiceOpen: boolean;
  onCloseYtPlaybackChoice: () => void;
  isChoiceModalOpen: boolean;
  onCloseChoiceModal: () => void;
  isYtWhisperModalOpen: boolean;
  onCloseYtWhisperModal: () => void;
  isFloatingGuideOpen: boolean;
  onCloseFloatingGuide: () => void;
  hasActiveMedia: boolean;
  onHomeClick: () => void;
}

/**
 * Pure LIFO Back-Button Decision Logic.
 * Returns true if an overlay, modal, or active playback was intercepted,
 * or false if the application was exited at the root level.
 */
export function handleModalBackPress(
  store: ReturnType<typeof useAppStore.getState>,
  props: ModalBackStackProps
): boolean {
  // 1. Dismiss active word translation dictionary tooltip / drawer
  if (store.activeTokenId || store.activeWordTranslation || store.wordLoading) {
    store.setActiveTokenId(null);
    store.setActiveWordTranslation(null);
    return true;
  }

  // 2. Fullscreen mode
  if (typeof document !== 'undefined' && document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
    return true;
  }

  // 3. Top-level subtitle appearance & download modals (LIFO topmost)
  if (store.isSubtitleSettingsOpen) {
    store.setIsSubtitleSettingsOpen(false);
    return true;
  }

  if (store.isDownloadModalOpen) {
    store.setIsDownloadModalOpen(false);
    return true;
  }

  // 4. In-App Selection and Guidance Dialogs
  if (props.isYtPlaybackChoiceOpen) {
    props.onCloseYtPlaybackChoice();
    return true;
  }

  if (props.isChoiceModalOpen) {
    props.onCloseChoiceModal();
    return true;
  }

  if (props.isYtWhisperModalOpen) {
    props.onCloseYtWhisperModal();
    return true;
  }

  if (props.isFloatingGuideOpen) {
    props.onCloseFloatingGuide();
    return true;
  }

  // 5. App Core Drawer Overlays
  if (store.isSearchOpen) {
    store.setIsSearchOpen(false);
    return true;
  }

  if (store.isSettingsOpen) {
    store.setIsSettingsOpen(false);
    return true;
  }

  if (store.isHistoryOpen) {
    store.setIsHistoryOpen(false);
    return true;
  }

  // 6. Active Video Playback Dismissal (Navigate cleanly to home)
  if (props.hasActiveMedia || store.videoId) {
    props.onHomeClick();
    return true;
  }

  // 7. Root home screen -> Exit application cleanly
  try {
    CapApp.exitApp();
  } catch {}
  return false;
}

/**
 * Centralized LIFO Modal Back-Stack Hook
 * Resolves Android hardware back-button 2s freeze and accidental video deletion.
 * Strictly respects modal hierarchy before falling through to active video dismissal or app exit.
 */
export function useModalBackStack({
  isYtPlaybackChoiceOpen,
  onCloseYtPlaybackChoice,
  isChoiceModalOpen,
  onCloseChoiceModal,
  isYtWhisperModalOpen,
  onCloseYtWhisperModal,
  isFloatingGuideOpen,
  onCloseFloatingGuide,
  hasActiveMedia,
  onHomeClick,
}: ModalBackStackProps): void {
  const isYtChoiceOpenRef = useRef(isYtPlaybackChoiceOpen);
  const onCloseYtChoiceRef = useRef(onCloseYtPlaybackChoice);
  const isChoiceOpenRef = useRef(isChoiceModalOpen);
  const onCloseChoiceRef = useRef(onCloseChoiceModal);
  const isYtWhisperOpenRef = useRef(isYtWhisperModalOpen);
  const onCloseYtWhisperRef = useRef(onCloseYtWhisperModal);
  const isFloatingGuideRef = useRef(isFloatingGuideOpen);
  const onCloseFloatingGuideRef = useRef(onCloseFloatingGuide);
  const hasActiveMediaRef = useRef(hasActiveMedia);
  const onHomeClickRef = useRef(onHomeClick);
  const lastPressTimeRef = useRef(0);

  isYtChoiceOpenRef.current = isYtPlaybackChoiceOpen;
  onCloseYtChoiceRef.current = onCloseYtPlaybackChoice;
  isChoiceOpenRef.current = isChoiceModalOpen;
  onCloseChoiceRef.current = onCloseChoiceModal;
  isYtWhisperOpenRef.current = isYtWhisperModalOpen;
  onCloseYtWhisperRef.current = onCloseYtWhisperModal;
  isFloatingGuideRef.current = isFloatingGuideOpen;
  onCloseFloatingGuideRef.current = onCloseFloatingGuide;
  hasActiveMediaRef.current = hasActiveMedia;
  onHomeClickRef.current = onHomeClick;

  useEffect(() => {
    let backListener: any = null;

    const setupBackListener = async () => {
      try {
        backListener = await CapApp.addListener('backButton', () => {
          const now = Date.now();
          // 250ms debounce prevents rapid multi-press fallthrough
          if (now - lastPressTimeRef.current < 250) {
            return;
          }
          lastPressTimeRef.current = now;

          handleModalBackPress(useAppStore.getState(), {
            isYtPlaybackChoiceOpen: isYtChoiceOpenRef.current,
            onCloseYtPlaybackChoice: onCloseYtChoiceRef.current,
            isChoiceModalOpen: isChoiceOpenRef.current,
            onCloseChoiceModal: onCloseChoiceRef.current,
            isYtWhisperModalOpen: isYtWhisperOpenRef.current,
            onCloseYtWhisperModal: onCloseYtWhisperRef.current,
            isFloatingGuideOpen: isFloatingGuideRef.current,
            onCloseFloatingGuide: onCloseFloatingGuideRef.current,
            hasActiveMedia: hasActiveMediaRef.current,
            onHomeClick: onHomeClickRef.current,
          });
        });
      } catch (e) {
        console.warn('Capacitor App backButton listener not supported in web mode:', e);
      }
    };

    setupBackListener();

    return () => {
      if (backListener) {
        backListener.remove();
      }
    };
  }, []);
}
