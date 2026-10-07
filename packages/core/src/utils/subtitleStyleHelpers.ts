import type { SubtitleTextOutline, SubtitleFontFamily, SubtitleFontWeight } from '../types';

/**
 * Converts a hex color string (#ffffff or #fff) to an rgba() CSS string.
 */
export function hexToRgba(hex: string, opacityPercent: number): string {
  let cleanHex = hex.replace('#', '').trim();
  if (cleanHex.length === 3) {
    cleanHex = cleanHex.split('').map(c => c + c).join('');
  }
  if (cleanHex.length !== 6) {
    return `rgba(0, 0, 0, ${Math.max(0, Math.min(1, opacityPercent / 100))})`;
  }

  const r = parseInt(cleanHex.substring(0, 2), 16) || 0;
  const g = parseInt(cleanHex.substring(2, 4), 16) || 0;
  const b = parseInt(cleanHex.substring(4, 6), 16) || 0;
  const alpha = Math.max(0, Math.min(1, opacityPercent / 100));

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Computes high-legibility CSS text-shadow based on outline style.
 */
export function getTextShadowCss(outline: SubtitleTextOutline): string {
  switch (outline) {
    case 'stroke':
      // Netflix & YouTube broadcast-standard thick outline
      return '-1.5px -1.5px 0 #000, 1.5px -1.5px 0 #000, -1.5px 1.5px 0 #000, 1.5px 1.5px 0 #000, 0 2px 4px rgba(0,0,0,0.9)';
    case 'shadow':
      // Soft modern drop shadow
      return '0 2px 5px rgba(0,0,0,0.95), 0 0 2px rgba(0,0,0,0.8)';
    case 'none':
    default:
      return 'none';
  }
}

/**
 * Returns Tailwind font family class or CSS font-family string.
 */
export function getFontFamilyClass(font: SubtitleFontFamily | string): string {
  switch (font) {
    case 'serif':
      return 'font-serif';
    case 'mono':
      return 'font-mono';
    case 'dyslexic':
      return 'font-sans tracking-wider';
    case 'sans':
    default:
      return 'font-sans';
  }
}

/**
 * Returns Tailwind font weight class.
 */
export function getFontWeightClass(weight: SubtitleFontWeight | string): string {
  switch (weight) {
    case 'normal':
      return 'font-medium';
    case 'extrabold':
      return 'font-black';
    case 'bold':
    default:
      return 'font-bold';
  }
}
