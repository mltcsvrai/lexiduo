import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as core from '@lexiduo/core';
import { useYouTubePlaybackFlow } from '../useYouTubePlaybackFlow';

vi.mock('@lexiduo/core', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    useTranslation: () => ({ t: (k: string) => k }),
    checkFloatingPermissions: vi.fn(),
    startFloatingOverlay: vi.fn(),
    loadFloatingCues: vi.fn(),
    fetchVideoSubtitles: vi.fn(),
    extractYouTubeId: vi.fn((val: string) => val ? 'vid123' : null),
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
        onRunInApp: vi.fn(),
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

  it('confirmContinueOnYouTube opens permission guide if overlay permission is missing', async () => {
    const mockCheckPerms = vi.spyOn(core, 'checkFloatingPermissions').mockResolvedValue({
      overlay: false,
      notification: true,
      accessibility: true,
      allGranted: false,
    });
    const mockOnOpenPermissionGuide = vi.fn();
    const mockStartFloatingOverlay = vi.spyOn(core, 'startFloatingOverlay');

    let hookResult: any = null;
    const pending = { videoId: 'vid123', rawText: 'https://youtube.com/watch?v=vid123' };

    const TestComponent = () => {
      hookResult = useYouTubePlaybackFlow({
        cues: [],
        currentVideoId: '',
        apiKey: '',
        sourceLang: 'auto',
        targetLang: 'tr',
        onRunInApp: vi.fn(),
        onOpenPermissionGuide: mockOnOpenPermissionGuide,
        initialPendingVideo: pending,
      });
      return null;
    };

    ReactDOMServer.renderToString(React.createElement(TestComponent));

    expect(hookResult.isChoiceModalOpen).toBe(true);
    expect(hookResult.pendingVideo).toEqual(pending);

    await hookResult.confirmContinueOnYouTube();

    expect(mockCheckPerms).toHaveBeenCalled();
    expect(mockOnOpenPermissionGuide).toHaveBeenCalled();
    expect(mockStartFloatingOverlay).not.toHaveBeenCalled();
  });

  it('confirmContinueOnYouTube launches overlay with cached cues immediately without fetching', async () => {
    vi.spyOn(core, 'checkFloatingPermissions').mockResolvedValue({
      overlay: true,
      notification: true,
      accessibility: true,
      allGranted: true,
    });
    const mockStartOverlay = vi.spyOn(core, 'startFloatingOverlay').mockResolvedValue(true);
    const mockFetchSubtitles = vi.spyOn(core, 'fetchVideoSubtitles');

    let hookResult: any = null;
    const pending = { videoId: 'cached_vid', rawText: 'https://youtube.com/watch?v=cached_vid' };
    const cachedCues: any[] = [{ start: 1, end: 2, targetText: 'Merhaba' }];

    const TestComponent = () => {
      hookResult = useYouTubePlaybackFlow({
        cues: cachedCues,
        currentVideoId: 'cached_vid',
        apiKey: 'key123',
        sourceLang: 'auto',
        targetLang: 'tr',
        onRunInApp: vi.fn(),
        onOpenPermissionGuide: vi.fn(),
        initialPendingVideo: pending,
      });
      return null;
    };

    ReactDOMServer.renderToString(React.createElement(TestComponent));

    await hookResult.confirmContinueOnYouTube();

    expect(mockStartOverlay).toHaveBeenCalledWith(cachedCues, 'cached_vid');
    expect(mockFetchSubtitles).not.toHaveBeenCalled();
  });

  it('confirmContinueOnYouTube launches overlay immediately and fetches subtitles in background with fast cues', async () => {
    vi.spyOn(core, 'checkFloatingPermissions').mockResolvedValue({
      overlay: true,
      notification: true,
      accessibility: true,
      allGranted: true,
    });
    const mockStartOverlay = vi.spyOn(core, 'startFloatingOverlay').mockResolvedValue(true);
    const mockLoadFloatingCues = vi.spyOn(core, 'loadFloatingCues').mockResolvedValue(2);
    const mockOnSubtitlesLoaded = vi.fn();

    let fastCuesCallback: any = null;
    vi.spyOn(core, 'fetchVideoSubtitles').mockImplementation(
      async (_vId, _src, _tgt, _key, onFastCues) => {
        fastCuesCallback = onFastCues;
        return {
          cues: [{ start: 0, end: 3, targetText: 'Nihai Altyazı' } as any],
          isAiTranslated: false,
        };
      }
    );

    let hookResult: any = null;
    const pending = { videoId: 'uncached_vid', rawText: 'https://youtube.com/watch?v=uncached_vid' };

    const TestComponent = () => {
      hookResult = useYouTubePlaybackFlow({
        cues: [],
        currentVideoId: '',
        apiKey: 'key123',
        sourceLang: 'auto',
        targetLang: 'tr',
        onRunInApp: vi.fn(),
        onOpenPermissionGuide: vi.fn(),
        onSubtitlesLoaded: mockOnSubtitlesLoaded,
        initialPendingVideo: pending,
      });
      return null;
    };

    ReactDOMServer.renderToString(React.createElement(TestComponent));

    await hookResult.confirmContinueOnYouTube();

    // 1. startFloatingOverlay called with undefined cues immediately
    expect(mockStartOverlay).toHaveBeenCalledWith(undefined, 'uncached_vid');

    // 2. fetchVideoSubtitles called in background
    expect(core.fetchVideoSubtitles).toHaveBeenCalledWith(
      'uncached_vid',
      'auto',
      'tr',
      'key123',
      expect.any(Function)
    );

    // 3. Test onFastCuesReady callback
    expect(fastCuesCallback).toBeTypeOf('function');
    const fastCues = [{ start: 0, end: 1, targetText: 'Hızlı ham metin' } as any];
    await fastCuesCallback(fastCues);
    expect(mockLoadFloatingCues).toHaveBeenCalledWith(fastCues);

    // 4. Allow promise chain to resolve
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(mockLoadFloatingCues).toHaveBeenCalledWith([
      expect.objectContaining({ targetText: 'Nihai Altyazı' }),
    ]);
    expect(mockOnSubtitlesLoaded).toHaveBeenCalledWith([
      expect.objectContaining({ targetText: 'Nihai Altyazı' }),
    ]);
  });
});
