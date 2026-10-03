import { smartFetch } from './transcriptService';
import type { HistoryItem } from '../types';

export const HISTORY_LIMIT_DEFAULT = 6;
export const HISTORY_LIMIT_OPTIONS = [4, 6, 8, 10, 12, 16, 20] as const;

export const KNOWN_VIDEO_TITLES: Record<string, string> = {
  'UF8uR6Z6KLc': 'Steve Jobs: 2005 Stanford Konuşması',
  'JyECrGp-Sw8': 'Kurzgesagt: Tüm Nükleer Bombalar Patlarsa?',
  'arj7oStGLkU': 'Tim Urban: Erteleme Hastalığı (TED)',
  '0VBIICYDjPo': '6 AIs WORK TOGETHER to Build A Programming Language',
  'L_LUpnjgPso': 'How Artificial Intelligence Works',
  'fJ9rUzIMcZQ': 'Queen – Bohemian Rhapsody',
};

// In-memory runtime cache
const titleCache = new Map<string, string>(Object.entries(KNOWN_VIDEO_TITLES));

/**
 * Fetches the YouTube video title using YouTube oEmbed API or local fallback.
 * YouTube oEmbed is official, CORS-enabled, and requires no API key.
 */
export async function fetchYouTubeMetadata(videoId: string): Promise<{ title: string }> {
  const cleanId = videoId.trim();
  if (!cleanId) {
    return { title: 'Video' };
  }

  // 1. Check in-memory cache
  if (titleCache.has(cleanId)) {
    return { title: titleCache.get(cleanId)! };
  }

  // 2. Query YouTube oEmbed
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${cleanId}&format=json`;
    const res = await smartFetch(oembedUrl, undefined, 4000);
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data.title === 'string' && data.title.trim()) {
        const title = data.title.trim();
        titleCache.set(cleanId, title);
        return { title };
      }
    }
  } catch (err) {
    console.warn(`oEmbed fetch failed for video ${cleanId}:`, err);
  }

  // 3. Graceful fallback
  const fallback = `Video (${cleanId})`;
  return { title: fallback };
}

/**
 * Cache title manually (e.g. from player.getVideoData() or sample list).
 */
export function cacheVideoTitle(videoId: string, title: string): void {
  if (videoId && title && !title.startsWith('Video (')) {
    titleCache.set(videoId.trim(), title.trim());
  }
}

/**
 * Enriches a list of HistoryItem objects with missing titles.
 * Returns the updated items list and a boolean indicating if changes occurred.
 */
export async function enrichHistoryItems(
  items: HistoryItem[]
): Promise<{ enrichedItems: HistoryItem[]; hasChanges: boolean }> {
  if (!items || items.length === 0) {
    return { enrichedItems: [], hasChanges: false };
  }

  let hasChanges = false;
  const enrichedItems = await Promise.all(
    items.map(async (item) => {
      // If title is missing or only a raw fallback, try to resolve it
      const needsTitle = !item.title || item.title.startsWith('Video (');
      if (needsTitle) {
        try {
          const meta = await fetchYouTubeMetadata(item.videoId);
          if (meta.title && meta.title !== item.title) {
            hasChanges = true;
            return { ...item, title: meta.title };
          }
        } catch {
          // Keep existing item on error
        }
      }
      return item;
    })
  );

  return { enrichedItems, hasChanges };
}
