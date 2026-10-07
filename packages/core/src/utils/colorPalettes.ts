import { FloatingSubtitle } from '../services/floatingSubtitleService';

export interface SubtitlePalette {
  id: string;
  name: string;
  sourceTextColor: string;
  targetTextColor: string;
  bgColor: string;
  bgOpacity: number;
}

/**
 * 26 Professionally Curated Cinema & Streaming Subtitle Palettes
 * Inspired by Netflix, YouTube, Apple TV, Disney+, Prime Video, and Anime.
 * Optimized for maximum contrast, legibility, and zero visual fatigue.
 */
export const COLOR_PALETTES: SubtitlePalette[] = [
  {
    id: 'netflix-classic',
    name: 'Netflix Classic',
    sourceTextColor: '#FFFFFF',
    targetTextColor: '#FFD700',
    bgColor: '#000000',
    bgOpacity: 80,
  },
  {
    id: 'youtube-standard',
    name: 'YouTube CC Standard',
    sourceTextColor: '#FFFFFF',
    targetTextColor: '#FDE047',
    bgColor: '#0F0F0F',
    bgOpacity: 75,
  },
  {
    id: 'apple-tv-capsule',
    name: 'Apple TV Capsule',
    sourceTextColor: '#F8FAFC',
    targetTextColor: '#38BDF8',
    bgColor: '#18181B',
    bgOpacity: 85,
  },
  {
    id: 'prime-cyan',
    name: 'Prime Video Cyan',
    sourceTextColor: '#FFFFFF',
    targetTextColor: '#00E5FF',
    bgColor: '#0B132B',
    bgOpacity: 85,
  },
  {
    id: 'disney-plus-blue',
    name: 'Disney+ Modern Blue',
    sourceTextColor: '#F0F9FF',
    targetTextColor: '#60A5FA',
    bgColor: '#0F172A',
    bgOpacity: 85,
  },
  {
    id: 'anime-crunchyroll',
    name: 'Anime Gold (Crunchyroll)',
    sourceTextColor: '#FFFFFF',
    targetTextColor: '#FFE600',
    bgColor: '#000000',
    bgOpacity: 75,
  },
  {
    id: 'oled-pitch-black',
    name: 'OLED Pure Black',
    sourceTextColor: '#FFFFFF',
    targetTextColor: '#F59E0B',
    bgColor: '#000000',
    bgOpacity: 100,
  },
  {
    id: 'warm-cinema',
    name: 'Warm Cinema Gold',
    sourceTextColor: '#FFFBEB',
    targetTextColor: '#FBBF24',
    bgColor: '#171717',
    bgOpacity: 85,
  },
  {
    id: 'nordic-mint',
    name: 'Nordic Mint',
    sourceTextColor: '#F8FAFC',
    targetTextColor: '#34D399',
    bgColor: '#1E293B',
    bgOpacity: 85,
  },
  {
    id: 'cyber-neon-cyan',
    name: 'Cyber Neon Cyan',
    sourceTextColor: '#FFFFFF',
    targetTextColor: '#06B6D4',
    bgColor: '#030712',
    bgOpacity: 90,
  },
  {
    id: 'rose-sunset',
    name: 'Rose Sunset Coral',
    sourceTextColor: '#FFF1F2',
    targetTextColor: '#FB7185',
    bgColor: '#18181B',
    bgOpacity: 85,
  },
  {
    id: 'soft-lavender',
    name: 'Soft Lavender',
    sourceTextColor: '#F5F3FF',
    targetTextColor: '#C084FC',
    bgColor: '#18181B',
    bgOpacity: 85,
  },
  {
    id: 'hc-yellow',
    name: 'High Contrast Yellow',
    sourceTextColor: '#FFFFFF',
    targetTextColor: '#FFFF00',
    bgColor: '#000000',
    bgOpacity: 95,
  },
  {
    id: 'hc-green',
    name: 'High Contrast Green',
    sourceTextColor: '#FFFFFF',
    targetTextColor: '#22C55E',
    bgColor: '#000000',
    bgOpacity: 95,
  },
  {
    id: 'slate-silver',
    name: 'Minimal Slate Silver',
    sourceTextColor: '#FFFFFF',
    targetTextColor: '#CBD5E1',
    bgColor: '#1E293B',
    bgOpacity: 80,
  },
  {
    id: 'golden-hour',
    name: 'Golden Hour Amber',
    sourceTextColor: '#FEF9C3',
    targetTextColor: '#FB923C',
    bgColor: '#1C1917',
    bgOpacity: 85,
  },
  {
    id: 'royal-indigo',
    name: 'Royal Indigo',
    sourceTextColor: '#FFFFFF',
    targetTextColor: '#818CF8',
    bgColor: '#0B0F19',
    bgOpacity: 85,
  },
  {
    id: 'crisp-emerald',
    name: 'Crisp Emerald',
    sourceTextColor: '#ECFDF5',
    targetTextColor: '#10B981',
    bgColor: '#121212',
    bgOpacity: 85,
  },
  {
    id: 'polar-ice-teal',
    name: 'Polar Ice Teal',
    sourceTextColor: '#F0FDFA',
    targetTextColor: '#2DD4BF',
    bgColor: '#0F172A',
    bgOpacity: 85,
  },
  {
    id: 'electric-fuchsia',
    name: 'Electric Fuchsia',
    sourceTextColor: '#FFFFFF',
    targetTextColor: '#F43F5E',
    bgColor: '#111111',
    bgOpacity: 85,
  },
  {
    id: 'amber-glow',
    name: 'Amber Warm Glow',
    sourceTextColor: '#FFFDF7',
    targetTextColor: '#EAB308',
    bgColor: '#0F172A',
    bgOpacity: 80,
  },
  {
    id: 'warm-sepia',
    name: 'Warm Vintage Sepia',
    sourceTextColor: '#FEF3C7',
    targetTextColor: '#F97316',
    bgColor: '#1C1816',
    bgOpacity: 85,
  },
  {
    id: 'deep-ocean-blue',
    name: 'Deep Ocean Blue',
    sourceTextColor: '#FFFFFF',
    targetTextColor: '#38BDF8',
    bgColor: '#0C1E33',
    bgOpacity: 90,
  },
  {
    id: 'glass-shadow',
    name: 'Glass Shadow Cinema',
    sourceTextColor: '#FFFFFF',
    targetTextColor: '#FACC15',
    bgColor: '#000000',
    bgOpacity: 50,
  },
  {
    id: 'platinum-clean',
    name: 'Platinum Clean',
    sourceTextColor: '#FFFFFF',
    targetTextColor: '#E2E8F0',
    bgColor: '#1E293B',
    bgOpacity: 75,
  },
  {
    id: 'dark-cinema-lime',
    name: 'Dark Cinema Lime',
    sourceTextColor: '#FFFFFF',
    targetTextColor: '#A3E635',
    bgColor: '#000000',
    bgOpacity: 90,
  },
];

/**
 * 24 High-Contrast & Clearly Distinct Swatches for Source Text
 */
export const SOURCE_TEXT_SWATCHES: string[] = [
  '#FFFFFF', '#F8FAFC', '#FFFBEB', '#FEF9C3', '#F0F9FF',
  '#E0F2FE', '#ECFDF5', '#F5F3FF', '#FFF1F2', '#FFEDD5',
  '#FEF08A', '#BBF7D0', '#BAE6FD', '#DDD6FE', '#FBCFE8',
  '#99F6E4', '#E2E8F0', '#CBD5E1', '#94A3B8', '#FDE68A',
  '#FECDD3', '#D9F99D', '#7DD3FC', '#F1F5F9',
];

/**
 * 24 High-Contrast Accent Swatches for Target Text
 */
export const TARGET_TEXT_SWATCHES: string[] = [
  '#FFD700', '#FFE600', '#FACC15', '#FBBF24', '#F59E0B',
  '#00E5FF', '#38BDF8', '#60A5FA', '#3B82F6', '#06B6D4',
  '#22C55E', '#10B981', '#34D399', '#4ADE80', '#A3E635',
  '#FB7185', '#F472B6', '#EC4899', '#C084FC', '#A78BFA',
  '#818CF8', '#FB923C', '#F97316', '#FFFFFF',
];

/**
 * 24 Neutral, Cinematic, High-Readability Swatches for Subtitle Background
 * Pure blacks, OLEDs, charcoals, graphites, and midnight slates.
 */
export const BG_COLOR_SWATCHES: string[] = [
  '#000000', '#050505', '#0A0A0A', '#0F0F0F',
  '#111111', '#141414', '#171717', '#1A1A1A',
  '#18181B', '#202023', '#27272A', '#2E2E33',
  '#0F172A', '#1E293B', '#334155', '#020617',
  '#0B132B', '#0B0F19', '#1C1917', '#292524',
  '#1C1816', '#0C1E33', '#111827', '#1F2937',
];

export interface SubtitleStyleSyncParams {
  sourceTextColor?: string;
  targetTextColor?: string;
  bgColor?: string;
  bgOpacity?: number;
  fontSize?: number;
  showSubtitleBg?: boolean;
  bgWidthMode?: string;
}

/**
 * Synchronize chosen colors and styling to native Android floating overlay
 */
export async function syncStyleToNativeOverlay(params: SubtitleStyleSyncParams): Promise<void> {
  try {
    if (typeof (FloatingSubtitle as any).updateStyle === 'function') {
      await (FloatingSubtitle as any).updateStyle(params);
    }
  } catch (err) {
    // Non-blocking fallback for web environments or older plugin bindings
    console.debug('FloatingSubtitle.updateStyle sync skipped:', err);
  }
}
