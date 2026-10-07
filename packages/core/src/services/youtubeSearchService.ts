import { smartFetch } from './translationService';

// In-memory runtime cache for resolved video IDs
const searchCache = new Map<string, string>();

/**
 * Searches YouTube for the best matching 11-character video ID using
 * YouTube InnerTube search API with smart fallback.
 * Works seamlessly on both native Android (CapacitorHttp) and web environments.
 */
export async function searchYouTubeVideoId(title: string, channelOrArtist?: string): Promise<string | null> {
  const cleanTitle = (title || '').trim();
  const cleanArtist = (channelOrArtist || '').trim();

  if (!cleanTitle) {
    return null;
  }

  // 1. Check in-memory cache
  const cacheKey = `${cleanTitle.toLowerCase()}::${cleanArtist.toLowerCase()}`;
  if (searchCache.has(cacheKey)) {
    return searchCache.get(cacheKey)!;
  }

  // Construct optimized search query
  const query = cleanArtist && !cleanTitle.toLowerCase().includes(cleanArtist.toLowerCase())
    ? `${cleanTitle} ${cleanArtist}`
    : cleanTitle;

  // 2. Query YouTube InnerTube Search API
  try {
    const searchUrl = 'https://www.youtube.com/youtubei/v1/search';
    const payload = JSON.stringify({
      context: {
        client: {
          clientName: 'WEB',
          clientVersion: '2.20240101.00.00'
        }
      },
      query
    });

    const res = await smartFetch(
      searchUrl,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
        },
        body: payload
      },
      5000
    );

    if (res.ok) {
      const responseText = await res.text();
      const videoId = extractFirstVideoId(responseText);
      if (videoId) {
        searchCache.set(cacheKey, videoId);
        return videoId;
      }
    }
  } catch (err) {
    console.warn(`[youtubeSearchService] InnerTube search failed for "${query}":`, err);
  }

  // 3. Fallback: YouTube HTML Search Scraping
  try {
    const htmlUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    const res = await smartFetch(
      htmlUrl,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
        }
      },
      5000
    );

    if (res.ok) {
      const htmlText = await res.text();
      const videoId = extractFirstVideoId(htmlText);
      if (videoId) {
        searchCache.set(cacheKey, videoId);
        return videoId;
      }
    }
  } catch (err) {
    console.warn(`[youtubeSearchService] HTML search fallback failed for "${query}":`, err);
  }

  return null;
}

/**
 * Extracts the first valid 11-character YouTube videoId from InnerTube JSON or HTML text.
 */
function extractFirstVideoId(content: string): string | null {
  if (!content) return null;

  // Pattern 1: Target videoRenderer videoId specifically (InnerTube search results)
  const videoRendererMatch = content.match(/"videoRenderer"\s*:\s*\{[\s\S]*?"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/);
  if (videoRendererMatch && videoRendererMatch[1]) {
    return videoRendererMatch[1];
  }

  // Pattern 2: Explicit "videoId":"..." (with optional whitespace)
  const videoIdMatch = content.match(/"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/);
  if (videoIdMatch && videoIdMatch[1]) {
    return videoIdMatch[1];
  }

  // Pattern 3: watch?v=...
  const watchMatch = content.match(/(?:\/watch\?v=|watch\?v=)([a-zA-Z0-9_-]{11})/);
  if (watchMatch && watchMatch[1]) {
    return watchMatch[1];
  }

  // Pattern 4: youtu.be/ or shorts/
  const shortMatch = content.match(/(?:youtu\.be\/|\/shorts\/)([a-zA-Z0-9_-]{11})/);
  if (shortMatch && shortMatch[1]) {
    return shortMatch[1];
  }

  return null;
}

/**
 * Utility to manually prime the search cache (e.g. for testing).
 */
export function cacheResolvedVideoId(title: string, channelOrArtist: string | undefined, videoId: string): void {
  if (title && videoId) {
    const cleanTitle = title.trim();
    const cleanArtist = (channelOrArtist || '').trim();
    const cacheKey = `${cleanTitle.toLowerCase()}::${cleanArtist.toLowerCase()}`;
    searchCache.set(cacheKey, videoId.trim());
  }
}
