import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { App as CapApp } from '@capacitor/app';
import { useAppStore } from '@ytceviri/core';
import { useModalBackStack, handleModalBackPress } from '../useModalBackStack';

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn(),
    exitApp: vi.fn(),
  },
}));

describe('useModalBackStack and handleModalBackPress', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('exports useModalBackStack and handleModalBackPress as functions', () => {
    expect(typeof useModalBackStack).toBe('function');
    expect(typeof handleModalBackPress).toBe('function');
  });

  it('renders hook safely without throwing', () => {
    const TestComponent = () => {
      useModalBackStack({
        isYtPlaybackChoiceOpen: false,
        onCloseYtPlaybackChoice: vi.fn(),
        isChoiceModalOpen: false,
        onCloseChoiceModal: vi.fn(),
        isYtWhisperModalOpen: false,
        onCloseYtWhisperModal: vi.fn(),
        isFloatingGuideOpen: false,
        onCloseFloatingGuide: vi.fn(),
        hasActiveMedia: false,
        onHomeClick: vi.fn(),
      });
      return null;
    };

    expect(() => {
      ReactDOMServer.renderToString(React.createElement(TestComponent));
    }).not.toThrow();
  });

  it('intercepts active word lookup before any other modal', () => {
    useAppStore.setState({ activeTokenId: 'tok-1', isSubtitleSettingsOpen: true });
    const onHomeClick = vi.fn();

    const handled = handleModalBackPress(useAppStore.getState(), {
      isYtPlaybackChoiceOpen: false,
      onCloseYtPlaybackChoice: vi.fn(),
      isChoiceModalOpen: false,
      onCloseChoiceModal: vi.fn(),
      isYtWhisperModalOpen: false,
      onCloseYtWhisperModal: vi.fn(),
      isFloatingGuideOpen: false,
      onCloseFloatingGuide: vi.fn(),
      hasActiveMedia: true,
      onHomeClick,
    });

    expect(handled).toBe(true);
    expect(useAppStore.getState().activeTokenId).toBeNull();
    expect(onHomeClick).not.toHaveBeenCalled();
  });

  it('closes subtitle appearance modal without wiping media or triggering home click', () => {
    useAppStore.setState({ activeTokenId: null, isSubtitleSettingsOpen: true, videoId: 'active-video' });
    const onHomeClick = vi.fn();

    const handled = handleModalBackPress(useAppStore.getState(), {
      isYtPlaybackChoiceOpen: false,
      onCloseYtPlaybackChoice: vi.fn(),
      isChoiceModalOpen: false,
      onCloseChoiceModal: vi.fn(),
      isYtWhisperModalOpen: false,
      onCloseYtWhisperModal: vi.fn(),
      isFloatingGuideOpen: false,
      onCloseFloatingGuide: vi.fn(),
      hasActiveMedia: true,
      onHomeClick,
    });

    expect(handled).toBe(true);
    expect(useAppStore.getState().isSubtitleSettingsOpen).toBe(false);
    expect(onHomeClick).not.toHaveBeenCalled();
  });

  it('closes download subtitles modal without closing active video', () => {
    useAppStore.setState({ activeTokenId: null, isDownloadModalOpen: true, videoId: 'active-video' });
    const onHomeClick = vi.fn();

    const handled = handleModalBackPress(useAppStore.getState(), {
      isYtPlaybackChoiceOpen: false,
      onCloseYtPlaybackChoice: vi.fn(),
      isChoiceModalOpen: false,
      onCloseChoiceModal: vi.fn(),
      isYtWhisperModalOpen: false,
      onCloseYtWhisperModal: vi.fn(),
      isFloatingGuideOpen: false,
      onCloseFloatingGuide: vi.fn(),
      hasActiveMedia: true,
      onHomeClick,
    });

    expect(handled).toBe(true);
    expect(useAppStore.getState().isDownloadModalOpen).toBe(false);
    expect(onHomeClick).not.toHaveBeenCalled();
  });

  it('closes guidance and choice dialogs when active', () => {
    useAppStore.setState({
      activeTokenId: null,
      isSubtitleSettingsOpen: false,
      isDownloadModalOpen: false,
    });
    const onCloseChoice = vi.fn();

    const handled = handleModalBackPress(useAppStore.getState(), {
      isYtPlaybackChoiceOpen: false,
      onCloseYtPlaybackChoice: vi.fn(),
      isChoiceModalOpen: true,
      onCloseChoiceModal: onCloseChoice,
      isYtWhisperModalOpen: false,
      onCloseYtWhisperModal: vi.fn(),
      isFloatingGuideOpen: false,
      onCloseFloatingGuide: vi.fn(),
      hasActiveMedia: false,
      onHomeClick: vi.fn(),
    });

    expect(handled).toBe(true);
    expect(onCloseChoice).toHaveBeenCalled();
  });

  it('triggers onHomeClick when active video exists and all modals are closed', () => {
    useAppStore.setState({
      activeTokenId: null,
      isSubtitleSettingsOpen: false,
      isDownloadModalOpen: false,
      isSearchOpen: false,
      isSettingsOpen: false,
      isHistoryOpen: false,
      videoId: 'v123',
    });
    const onHomeClick = vi.fn();

    const handled = handleModalBackPress(useAppStore.getState(), {
      isYtPlaybackChoiceOpen: false,
      onCloseYtPlaybackChoice: vi.fn(),
      isChoiceModalOpen: false,
      onCloseChoiceModal: vi.fn(),
      isYtWhisperModalOpen: false,
      onCloseYtWhisperModal: vi.fn(),
      isFloatingGuideOpen: false,
      onCloseFloatingGuide: vi.fn(),
      hasActiveMedia: true,
      onHomeClick,
    });

    expect(handled).toBe(true);
    expect(onHomeClick).toHaveBeenCalled();
    expect(CapApp.exitApp).not.toHaveBeenCalled();
  });

  it('calls CapApp.exitApp when at home screen with no active modals or media', () => {
    useAppStore.setState({
      activeTokenId: null,
      isSubtitleSettingsOpen: false,
      isDownloadModalOpen: false,
      isSearchOpen: false,
      isSettingsOpen: false,
      isHistoryOpen: false,
      videoId: '',
    });
    const onHomeClick = vi.fn();

    const handled = handleModalBackPress(useAppStore.getState(), {
      isYtPlaybackChoiceOpen: false,
      onCloseYtPlaybackChoice: vi.fn(),
      isChoiceModalOpen: false,
      onCloseChoiceModal: vi.fn(),
      isYtWhisperModalOpen: false,
      onCloseYtWhisperModal: vi.fn(),
      isFloatingGuideOpen: false,
      onCloseFloatingGuide: vi.fn(),
      hasActiveMedia: false,
      onHomeClick,
    });

    expect(handled).toBe(false);
    expect(onHomeClick).not.toHaveBeenCalled();
    expect(CapApp.exitApp).toHaveBeenCalled();
  });
});
