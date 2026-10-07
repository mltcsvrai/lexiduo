import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchYouTubeMetadata,
  cacheVideoTitle,
  enrichHistoryItems,
  KNOWN_VIDEO_TITLES,
  HISTORY_LIMIT_DEFAULT,
  HISTORY_LIMIT_OPTIONS
} from '../videoMetadata';
import * as transcriptService from '../transcriptService';
import type { HistoryItem } from '@ytceviri/core';


describe('videoMetadata service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('provides sensible default and options for history limit', () => {
    expect(HISTORY_LIMIT_DEFAULT).toBe(6);
    expect(HISTORY_LIMIT_OPTIONS).toContain(20);
    expect(HISTORY_LIMIT_OPTIONS[HISTORY_LIMIT_OPTIONS.length - 1]).toBe(20);
    expect(HISTORY_LIMIT_OPTIONS.length).toBeGreaterThanOrEqual(5);
  });

  it('returns known titles immediately from cache without network calls', async () => {
    const spy = vi.spyOn(transcriptService, 'smartFetch');
    const knownId = 'UF8uR6Z6KLc';
    const result = await fetchYouTubeMetadata(knownId);

    expect(result.title).toBe(KNOWN_VIDEO_TITLES[knownId]);
    expect(spy).not.toHaveBeenCalled();
  });

  it('fetches title via oEmbed when not in cache', async () => {
    const mockTitle = 'Incredible Science Documentary';
    vi.spyOn(transcriptService, 'smartFetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ title: mockTitle }),
      text: async () => JSON.stringify({ title: mockTitle }),
      arrayBuffer: async () => new ArrayBuffer(0)
    });

    const result = await fetchYouTubeMetadata('customId123');
    expect(result.title).toBe(mockTitle);
  });

  it('falls back to Video (id) gracefully when oEmbed fails', async () => {
    vi.spyOn(transcriptService, 'smartFetch').mockRejectedValue(new Error('Network error'));

    const result = await fetchYouTubeMetadata('errorId456');
    expect(result.title).toBe('Video (errorId456)');
  });

  it('allows manual cache updates via cacheVideoTitle', async () => {
    cacheVideoTitle('newVid789', 'Manual Cached Title');
    const result = await fetchYouTubeMetadata('newVid789');
    expect(result.title).toBe('Manual Cached Title');
  });

  it('enriches history items with missing titles', async () => {
    vi.spyOn(transcriptService, 'smartFetch').mockImplementation(async (url: string) => {
      if (url.includes('vidWithoutTitle')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ title: 'Resolved Title' }),
          text: async () => '',
          arrayBuffer: async () => new ArrayBuffer(0)
        };
      }
      return {
        ok: false,
        status: 404,
        json: async () => ({}),
        text: async () => '',
        arrayBuffer: async () => new ArrayBuffer(0)
      };
    });

    const items: HistoryItem[] = [
      { videoId: 'UF8uR6Z6KLc', timestamp: 1000 }, // Known in KNOWN_VIDEO_TITLES
      { videoId: 'vidWithoutTitle', timestamp: 2000 },
      { videoId: 'alreadyHasTitle', title: 'Existing Title', timestamp: 3000 }
    ];

    const { enrichedItems, hasChanges } = await enrichHistoryItems(items);

    expect(hasChanges).toBe(true);
    expect(enrichedItems[0].title).toBe(KNOWN_VIDEO_TITLES['UF8uR6Z6KLc']);
    expect(enrichedItems[1].title).toBe('Resolved Title');
    expect(enrichedItems[2].title).toBe('Existing Title');
  });
});
