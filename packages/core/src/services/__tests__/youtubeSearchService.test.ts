import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  searchYouTubeVideoId,
  cacheResolvedVideoId
} from '../youtubeSearchService';
import * as translationService from '../translationService';

describe('youtubeSearchService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null when title is empty or whitespace', async () => {
    expect(await searchYouTubeVideoId('')).toBeNull();
    expect(await searchYouTubeVideoId('   ')).toBeNull();
  });

  it('returns pre-cached videoId without making network requests', async () => {
    const spy = vi.spyOn(translationService, 'smartFetch');
    cacheResolvedVideoId('Steve Jobs Speech', 'Stanford', 'UF8uR6Z6KLc');

    const result = await searchYouTubeVideoId('Steve Jobs Speech', 'Stanford');
    expect(result).toBe('UF8uR6Z6KLc');
    expect(spy).not.toHaveBeenCalled();
  });

  it('resolves videoId from InnerTube search JSON response', async () => {
    const mockJson = JSON.stringify({
      contents: {
        twoColumnSearchResultsRenderer: {
          primaryContents: {
            sectionListRenderer: {
              contents: [
                {
                  itemSectionRenderer: {
                    contents: [
                      {
                        videoRenderer: {
                          videoId: 'dQw4w9WgXcQ',
                          title: { runs: [{ text: 'Never Gonna Give You Up' }] }
                        }
                      }
                    ]
                  }
                }
              ]
            }
          }
        }
      }
    });

    vi.spyOn(translationService, 'smartFetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => mockJson,
      json: async () => JSON.parse(mockJson),
      arrayBuffer: async () => new ArrayBuffer(0)
    });

    const result = await searchYouTubeVideoId('Never Gonna Give You Up', 'Rick Astley');
    expect(result).toBe('dQw4w9WgXcQ');
  });

  it('resolves videoId from HTML search fallback when InnerTube fails', async () => {
    // 1st call (InnerTube) fails
    vi.spyOn(translationService, 'smartFetch').mockRejectedValueOnce(new Error('InnerTube timeout'));

    // 2nd call (HTML) succeeds with /watch?v=
    const mockHtml = `
      <html>
        <body>
          <a href="/watch?v=L_LUpnjgPso">How AI Works</a>
        </body>
      </html>
    `;
    vi.spyOn(translationService, 'smartFetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => mockHtml,
      json: async () => ({}),
      arrayBuffer: async () => new ArrayBuffer(0)
    });

    const result = await searchYouTubeVideoId('How AI Works', 'TechExplained');
    expect(result).toBe('L_LUpnjgPso');
  });

  it('returns null gracefully when both InnerTube and HTML fail to return a videoId', async () => {
    vi.spyOn(translationService, 'smartFetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '<html><body>No videos found</body></html>',
      json: async () => ({}),
      arrayBuffer: async () => new ArrayBuffer(0)
    });

    const result = await searchYouTubeVideoId('NonExistentVideoXYZ123456');
    expect(result).toBeNull();
  });

  it('resolves videoId from formatted InnerTube JSON containing spaces around colon', async () => {
    const formattedJson = `{
      "videoRenderer": {
        "videoId": "YQHsXMglC9A",
        "title": { "runs": [{ "text": "Adele - Hello" }] }
      }
    }`;

    vi.spyOn(translationService, 'smartFetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => formattedJson,
      json: async () => JSON.parse(formattedJson),
      arrayBuffer: async () => new ArrayBuffer(0)
    });

    const result = await searchYouTubeVideoId('Adele Hello');
    expect(result).toBe('YQHsXMglC9A');
  });
});
