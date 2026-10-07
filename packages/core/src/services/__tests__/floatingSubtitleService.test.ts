import { describe, it, expect, beforeEach } from 'vitest';
import {
  formatCuesForFloating,
  checkFloatingPermissions,
  startFloatingOverlay,
  stopFloatingOverlay,
  loadFloatingCues,
  clearFloatingCues,
  isFloatingOverlayRunning
} from '../floatingSubtitleService';
import type { SubtitleCue } from '../../types';

describe('floatingSubtitleService', () => {
  beforeEach(async () => {
    await stopFloatingOverlay();
  });

  describe('formatCuesForFloating', () => {
    it('converts second-based SubtitleCues to millisecond-based RawFloatingCues', () => {
      const cues: SubtitleCue[] = [
        {
          id: '1',
          start: 12.345,
          end: 15.678,
          sourceText: 'Hello world',
          targetText: 'Merhaba dünya'
        },
        {
          id: '2',
          start: 20.0,
          end: 24.5,
          sourceText: 'Next line'
        }
      ];

      const formatted = formatCuesForFloating(cues);

      expect(formatted).toHaveLength(2);
      expect(formatted[0].startMs).toBe(12345);
      expect(formatted[0].endMs).toBe(15678);
      expect(formatted[0].start).toBe(12.345);
      expect(formatted[0].end).toBe(15.678);
      expect(formatted[0].sourceText).toBe('Hello world');
      expect(formatted[0].targetText).toBe('Merhaba dünya');

      expect(formatted[1].startMs).toBe(20000);
      expect(formatted[1].endMs).toBe(24500);
      expect(formatted[1].targetText).toBe('');
    });

    it('handles empty and invalid input safely', () => {
      expect(formatCuesForFloating([])).toEqual([]);
      expect(formatCuesForFloating(null as any)).toEqual([]);
      expect(formatCuesForFloating(undefined as any)).toEqual([]);
    });
  });

  describe('web mock lifecycle', () => {
    it('checks permissions and returns all granted on web', async () => {
      const status = await checkFloatingPermissions();
      expect(status.allGranted).toBe(true);
      expect(status.overlay).toBe(true);
      expect(status.notification).toBe(true);
      expect(status.accessibility).toBe(true);
    });

    it('manages overlay start, running state, cue loading, and stop', async () => {
      expect(await isFloatingOverlayRunning()).toBe(false);

      const testCues: SubtitleCue[] = [
        {
          id: '1',
          start: 1.0,
          end: 3.0,
          sourceText: 'Test',
          targetText: 'Deneme'
        }
      ];

      const started = await startFloatingOverlay(testCues);
      expect(started).toBe(true);
      expect(await isFloatingOverlayRunning()).toBe(true);

      const loadedCount = await loadFloatingCues(testCues);
      expect(loadedCount).toBe(1);

      const cleared = await clearFloatingCues();
      expect(cleared).toBe(true);

      const stopped = await stopFloatingOverlay();
      expect(stopped).toBe(true);
      expect(await isFloatingOverlayRunning()).toBe(false);
    });
  });
});
