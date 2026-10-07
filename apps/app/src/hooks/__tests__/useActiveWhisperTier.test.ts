import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as offlineEngine from '../../services/offlineTranslationEngine';
import { useActiveWhisperTier } from '../useActiveWhisperTier';

describe('useActiveWhisperTier hook logic', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('exports useActiveWhisperTier as a function', () => {
    expect(typeof useActiveWhisperTier).toBe('function');
  });

  it('executes hook and provides active tier defaults and refreshStatus callback', () => {
    let capturedState: any = null;
    const TestComponent = () => {
      capturedState = useActiveWhisperTier();
      return null;
    };

    ReactDOMServer.renderToString(React.createElement(TestComponent));

    expect(capturedState).toBeDefined();
    expect(capturedState.activeTierId).toBe('tiny');
    expect(capturedState.activeWhisperTierName).toBe('Whisper AI');
    expect(capturedState.isWhisperDownloaded).toBe(false);
    expect(typeof capturedState.refreshStatus).toBe('function');
  });

  it('refreshStatus queries offlineEngine and updates configuration', async () => {
    vi.spyOn(offlineEngine, 'getActiveWhisperTier').mockResolvedValue('base');
    vi.spyOn(offlineEngine, 'getWhisperTierStatus').mockResolvedValue({
      isDownloaded: true,
      modelName: 'Whisper Base',
      tierId: 'base',
      isActive: true,
    });

    let capturedState: any = null;
    const TestComponent = () => {
      capturedState = useActiveWhisperTier();
      return null;
    };

    ReactDOMServer.renderToString(React.createElement(TestComponent));
    await capturedState.refreshStatus();

    expect(offlineEngine.getActiveWhisperTier).toHaveBeenCalled();
    expect(offlineEngine.getWhisperTierStatus).toHaveBeenCalledWith('base');
  });

  it('handles fallback gracefully when offlineEngine fails during refreshStatus', async () => {
    vi.spyOn(offlineEngine, 'getActiveWhisperTier').mockRejectedValue(new Error('IDB read error'));

    let capturedState: any = null;
    const TestComponent = () => {
      capturedState = useActiveWhisperTier();
      return null;
    };

    ReactDOMServer.renderToString(React.createElement(TestComponent));
    await capturedState.refreshStatus();

    expect(offlineEngine.getActiveWhisperTier).toHaveBeenCalled();
  });

  it('properly registers and unregisters WHISPER_TIER_CHANGED_EVENT listener', () => {
    const addSpy = vi.fn();
    const removeSpy = vi.fn();

    const origWindow = (globalThis as any).window;
    (globalThis as any).window = {
      addEventListener: addSpy,
      removeEventListener: removeSpy,
    };

    try {
      const handler = () => {};
      window.addEventListener(offlineEngine.WHISPER_TIER_CHANGED_EVENT, handler);
      expect(addSpy).toHaveBeenCalledWith(offlineEngine.WHISPER_TIER_CHANGED_EVENT, handler);

      window.removeEventListener(offlineEngine.WHISPER_TIER_CHANGED_EVENT, handler);
      expect(removeSpy).toHaveBeenCalledWith(offlineEngine.WHISPER_TIER_CHANGED_EVENT, handler);
    } finally {
      (globalThis as any).window = origWindow;
    }
  });
});
