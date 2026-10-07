import { describe, it, expect, vi } from 'vitest';
import { FloatingSubtitle } from '../../services/floatingSubtitleService';
import {
  COLOR_PALETTES,
  SOURCE_TEXT_SWATCHES,
  TARGET_TEXT_SWATCHES,
  BG_COLOR_SWATCHES,
  syncStyleToNativeOverlay,
} from '../colorPalettes';

vi.mock('../../services/floatingSubtitleService', () => ({
  FloatingSubtitle: {
    updateStyle: vi.fn().mockResolvedValue({ updated: true }),
  },
}));

describe('colorPalettes', () => {
  it('contains at least 24 professionally curated high-contrast palettes', () => {
    expect(COLOR_PALETTES.length).toBeGreaterThanOrEqual(24);
    for (const palette of COLOR_PALETTES) {
      expect(palette.id).toBeTruthy();
      expect(palette.name).toBeTruthy();
      expect(palette.sourceTextColor).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(palette.targetTextColor).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(palette.bgColor).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(palette.bgOpacity).toBeGreaterThanOrEqual(0);
      expect(palette.bgOpacity).toBeLessThanOrEqual(100);
    }
  });

  it('contains at least 24 swatches for each color category', () => {
    expect(SOURCE_TEXT_SWATCHES.length).toBeGreaterThanOrEqual(24);
    expect(TARGET_TEXT_SWATCHES.length).toBeGreaterThanOrEqual(24);
    expect(BG_COLOR_SWATCHES.length).toBeGreaterThanOrEqual(24);

    SOURCE_TEXT_SWATCHES.forEach(color => expect(color).toMatch(/^#[0-9a-fA-F]{6}$/));
    TARGET_TEXT_SWATCHES.forEach(color => expect(color).toMatch(/^#[0-9a-fA-F]{6}$/));
    BG_COLOR_SWATCHES.forEach(color => expect(color).toMatch(/^#[0-9a-fA-F]{6}$/));
  });

  it('syncStyleToNativeOverlay calls FloatingSubtitle.updateStyle safely', async () => {
    await syncStyleToNativeOverlay({
      sourceTextColor: '#FFFFFF',
      targetTextColor: '#00E5FF',
      bgColor: '#0F172A',
      bgOpacity: 85,
      fontSize: 24,
    });
    expect(FloatingSubtitle.updateStyle).toHaveBeenCalledWith({
      sourceTextColor: '#FFFFFF',
      targetTextColor: '#00E5FF',
      bgColor: '#0F172A',
      bgOpacity: 85,
      fontSize: 24,
    });
  });
});
