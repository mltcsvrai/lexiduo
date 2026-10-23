import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as core from '@lexiduo/core';
import { useAutoYouTubeAssistant, processDetectedVideo, IDB_KEY_AUTO_ASSISTANT } from '../useAutoYouTubeAssistant';

describe('useAutoYouTubeAssistant hook & processDetectedVideo', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    core.useAppStore.setState({
      cues: [],
      videoId: '',
      targetLang: 'tr',
      sourceLang: 'auto',
      apiKey: 'test-key'
    });
  });

  it('exports IDB_KEY_AUTO_ASSISTANT key correctly', () => {
    expect(IDB_KEY_AUTO_ASSISTANT).toBe('yt_ceviri_auto_assistant_enabled');
  });

  it('exports useAutoYouTubeAssistant function', () => {
    expect(typeof useAutoYouTubeAssistant).toBe('function');
  });

  it('initializes with expected properties and callback functions', () => {
    let capturedHook: any = null;
    const TestComponent = () => {
      capturedHook = useAutoYouTubeAssistant();
      return null;
    };

    ReactDOMServer.renderToString(React.createElement(TestComponent));

    expect(capturedHook).toBeDefined();
    expect(typeof capturedHook.isActive).toBe('boolean');
    expect(typeof capturedHook.isLoading).toBe('boolean');
    expect(typeof capturedHook.start).toBe('function');
    expect(typeof capturedHook.stop).toBe('function');
    expect(typeof capturedHook.toggle).toBe('function');
    expect(typeof capturedHook.refreshStatus).toBe('function');
  });

  it('ignores duplicate video events when title and videoId match lastProcessedVideoRef', async () => {
    const activeReqRef = { current: 0 };
    const lastProcRef = { current: '' };

    vi.spyOn(core, 'fetchVideoSubtitles').mockResolvedValue({
      cues: [{ id: '1', start: 0, end: 5, targetText: 'Selam', sourceText: 'Hello' }],
      isAiTranslated: false
    });
    vi.spyOn(core, 'loadFloatingCues').mockResolvedValue(1);

    const firstResult = await processDetectedVideo(
      { title: 'Video A', videoId: 'vidA' },
      activeReqRef,
      lastProcRef
    );
    expect(firstResult).toBe(true);
    expect(lastProcRef.current).toBe('Video A::vidA::auto::tr');

    // Duplicate event should be ignored immediately
    const secondResult = await processDetectedVideo(
      { title: 'Video A', videoId: 'vidA' },
      activeReqRef,
      lastProcRef
    );
    expect(secondResult).toBe(false);

    // Language change allows re-fetching the same video
    const langChangeResult = await processDetectedVideo(
      { title: 'Video A', videoId: 'vidA' },
      activeReqRef,
      lastProcRef,
      { sourceLang: 'en', targetLang: 'de' }
    );
    expect(langChangeResult).toBe(true);
    expect(lastProcRef.current).toBe('Video A::vidA::en::de');
  });

  it('discards zombie fastCues and final cues from an earlier video when a new video is detected', async () => {
    const activeReqRef = { current: 0 };
    const lastProcRef = { current: '' };

    let video1FastCuesCb: ((cues: any[]) => void) | undefined;
    let resolveVideo1Promise: (val: any) => void;
    const video1Promise = new Promise<{ cues: any[]; isAiTranslated: boolean }>((res) => {
      resolveVideo1Promise = res;
    });

    const video2Cues = [{ id: '2', start: 1, end: 4, targetText: 'Video 2 Replik', sourceText: 'Video 2 Cue' }];

    const loadCuesSpy = vi.spyOn(core, 'loadFloatingCues').mockResolvedValue(1);

    vi.spyOn(core, 'fetchVideoSubtitles').mockImplementation((videoId, _src, _dst, _key, onFast) => {
      if (videoId === 'vid1') {
        video1FastCuesCb = onFast;
        return video1Promise;
      }
      return Promise.resolve({ cues: video2Cues, isAiTranslated: false });
    });

    // 1. Video 1 starts fetching
    const p1 = processDetectedVideo(
      { title: 'Video 1', videoId: 'vid1' },
      activeReqRef,
      lastProcRef
    );
    expect(activeReqRef.current).toBe(1);

    // 2. Video 2 is detected before Video 1 finishes
    const p2 = processDetectedVideo(
      { title: 'Video 2', videoId: 'vid2' },
      activeReqRef,
      lastProcRef
    );
    expect(activeReqRef.current).toBe(2);
    await p2;

    // Video 2 loaded its cues
    expect(core.useAppStore.getState().videoId).toBe('vid2');
    expect(core.useAppStore.getState().cues).toEqual(video2Cues);
    loadCuesSpy.mockClear();

    // 3. Video 1 now emits fast cues and finally resolves
    if (video1FastCuesCb) {
      video1FastCuesCb([{ id: '1-fast', start: 0, end: 2, targetText: 'V1 Fast', sourceText: 'V1 Fast' }]);
    }
    resolveVideo1Promise!({
      cues: [{ id: '1-final', start: 0, end: 5, targetText: 'V1 Final', sourceText: 'V1 Final' }],
      isAiTranslated: false
    });
    await p1;

    // Assert: Video 1 cues were completely DISCARDED and did not overwrite Video 2
    expect(loadCuesSpy).not.toHaveBeenCalled();
    expect(core.useAppStore.getState().videoId).toBe('vid2');
    expect(core.useAppStore.getState().cues).toEqual(video2Cues);
  });

  it('clears floating cues and sets AI fallback on fetch error, preserving videoKey to stop re-detection loops', async () => {
    const activeReqRef = { current: 0 };
    const lastProcRef = { current: '' };

    const clearSpy = vi.spyOn(core, 'clearFloatingCues').mockResolvedValue(true);
    const aiFallbackSpy = vi.spyOn(core, 'showFloatingAiFallback').mockResolvedValue();
    vi.spyOn(core, 'fetchVideoSubtitles').mockRejectedValue(new Error('Network offline'));

    const result = await processDetectedVideo(
      { title: 'Failing Video', videoId: 'fail1' },
      activeReqRef,
      lastProcRef
    );

    expect(result).toBe(false);
    expect(clearSpy).toHaveBeenCalled();
    expect(aiFallbackSpy).toHaveBeenCalledWith(true);
    // Key must NOT be cleared on failure (preventing endless retries on player buffer)
    expect(lastProcRef.current).toBe('Failing Video::fail1::auto::tr');

    // Repeated event for same failing video is safely rejected
    const repeatResult = await processDetectedVideo(
      { title: 'Failing Video', videoId: 'fail1' },
      activeReqRef,
      lastProcRef
    );
    expect(repeatResult).toBe(false);
  });

  it('handles unresolvable videoId by clearing cues and triggering AI fallback', async () => {
    const activeReqRef = { current: 0 };
    const lastProcRef = { current: '' };

    const clearSpy = vi.spyOn(core, 'clearFloatingCues').mockResolvedValue(true);
    const aiFallbackSpy = vi.spyOn(core, 'showFloatingAiFallback').mockResolvedValue();
    vi.spyOn(core, 'searchYouTubeVideoId').mockResolvedValue(null);

    const result = await processDetectedVideo(
      { title: 'Mysterious Video Without ID', videoId: '' },
      activeReqRef,
      lastProcRef
    );

    expect(result).toBe(false);
    expect(clearSpy).toHaveBeenCalled();
    expect(aiFallbackSpy).toHaveBeenCalledWith(true);
    expect(lastProcRef.current).toBe('Mysterious Video Without ID::::auto::tr');
  });

  it('calls clearFloatingCues immediately when a new video is detected before fetching subtitles', async () => {
    const activeReqRef = { current: 0 };
    const lastProcRef = { current: '' };

    let clearedBeforeFetch = false;
    const clearSpy = vi.spyOn(core, 'clearFloatingCues').mockImplementation(async () => {
      clearedBeforeFetch = true;
      return true;
    });

    vi.spyOn(core, 'fetchVideoSubtitles').mockImplementation(async () => {
      expect(clearedBeforeFetch).toBe(true);
      return {
        cues: [{ id: '1', start: 0, end: 5, targetText: 'Yeni', sourceText: 'New' }],
        isAiTranslated: false
      };
    });
    vi.spyOn(core, 'loadFloatingCues').mockResolvedValue(1);

    const result = await processDetectedVideo(
      { title: 'Fresh Video', videoId: 'fresh123' },
      activeReqRef,
      lastProcRef
    );

    expect(result).toBe(true);
    expect(clearSpy).toHaveBeenCalled();
  });
});
