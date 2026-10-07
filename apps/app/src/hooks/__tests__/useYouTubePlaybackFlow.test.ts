import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useYouTubePlaybackFlow } from '../useYouTubePlaybackFlow';

vi.mock('@ytceviri/core', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    useTranslation: () => ({ t: (k: string) => k }),
  };
});

describe('useYouTubePlaybackFlow hook logic', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('exports useYouTubePlaybackFlow as a function', () => {
    expect(typeof useYouTubePlaybackFlow).toBe('function');
  });

  it('initializes with default closed state', () => {
    let capturedHook: any = null;
    const TestComponent = () => {
      capturedHook = useYouTubePlaybackFlow({
        cues: [],
        currentVideoId: '',
        apiKey: '',
        sourceLang: 'auto',
        targetLang: 'tr',
        onExecuteInApp: vi.fn(),
        onOpenPermissionGuide: vi.fn(),
      });
      return null;
    };

    ReactDOMServer.renderToString(React.createElement(TestComponent));

    expect(capturedHook).toBeDefined();
    expect(capturedHook.isChoiceModalOpen).toBe(false);
    expect(capturedHook.pendingVideo).toBeNull();
    expect(capturedHook.isPreparingSubtitles).toBe(false);
    expect(typeof capturedHook.initiatePlaybackChoice).toBe('function');
    expect(typeof capturedHook.confirmStayInApp).toBe('function');
    expect(typeof capturedHook.confirmContinueOnYouTube).toBe('function');
    expect(typeof capturedHook.closeChoiceModal).toBe('function');
  });
});
