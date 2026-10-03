import { get, set, del } from 'idb-keyval';
import type { SubtitleCue } from '../types';

export async function getCachedTranscript(videoId: string, sourceLang: string, targetLang: string): Promise<{ cues: SubtitleCue[], isAiTranslated: boolean } | null> {
  try {
    const cacheKey = `transcript_${videoId}_${sourceLang}_${targetLang}`;
    const data = await get<{ cues: SubtitleCue[], isAiTranslated: boolean }>(cacheKey);
    
    if (data) {
      // Update LRU timestamp asynchronously and safely
      try {
        const indexPromise = get<Record<string, number>>('transcript_cache_index');
        if (indexPromise && typeof indexPromise.then === 'function') {
          indexPromise.then((index) => {
            const newIndex = index || {};
            newIndex[cacheKey] = Date.now();
            set('transcript_cache_index', newIndex).catch(() => {});
          }).catch(() => {});
        }
      } catch {
        // Silently ignore LRU index update error in restricted environments
      }
      return data;
    }
    return null;
  } catch (err) {
    console.error('Failed to get cached transcript:', err);
    return null;
  }
}

export async function cacheTranscript(videoId: string, sourceLang: string, targetLang: string, cues: SubtitleCue[], isAiTranslated: boolean): Promise<void> {
  try {
    // Only cache if there are actual cues to avoid caching empty states
    if (cues && cues.length > 0) {
      const cacheKey = `transcript_${videoId}_${sourceLang}_${targetLang}`;
      await set(cacheKey, { cues, isAiTranslated });

      // Update LRU index and evict oldest if needed
      const index = (await get<Record<string, number>>('transcript_cache_index')) || {};
      index[cacheKey] = Date.now();

      const keys = Object.keys(index);
      const MAX_CACHED_TRANSCRIPTS = 20; // Evict if over 20 videos cached

      if (keys.length > MAX_CACHED_TRANSCRIPTS) {
        keys.sort((a, b) => index[a] - index[b]);
        const keysToDelete = keys.slice(0, keys.length - MAX_CACHED_TRANSCRIPTS);
        for (const key of keysToDelete) {
          await del(key);
          delete index[key];
        }
      }
      await set('transcript_cache_index', index);
    }
  } catch (err) {
    console.error('Failed to cache transcript:', err);
  }
}
