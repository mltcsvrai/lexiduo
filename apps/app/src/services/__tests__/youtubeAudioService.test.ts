import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
  fetchYouTubeAudioBlob, 
  downloadAndExtractYouTubeAudio, 
  extractDirectClientAudioUrl, 
  fetchClientDirectAudioStream 
} from '../youtubeAudioService';
import * as audioExtractor from '../audioExtractor';
import * as coreModule from '@ytceviri/core';

describe('youtubeAudioService', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubEnv('VITE_WORKER_API_BASE_URL', 'https://mock-worker.example.workers.dev');
    vi.stubEnv('VITE_WORKER_APP_TOKEN', 'test_app_token_123');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    globalThis.fetch = originalFetch;
  });

  describe('fetchYouTubeAudioBlob', () => {
    it('sends request with correct URL and X-App-Token header', async () => {
      const mockData = new Uint8Array([1, 2, 3, 4]);
      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(mockData);
          controller.close();
        },
      });

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({
          'content-type': 'audio/webm',
          'content-length': '4',
        }),
        body: mockStream,
      });
      globalThis.fetch = fetchMock;

      const progressUpdates: any[] = [];
      const blob = await fetchYouTubeAudioBlob('dQw4w9WgXcQ', (p) => progressUpdates.push(p));

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [calledUrl, calledOptions] = fetchMock.mock.calls[0];
      expect(calledUrl).toBe('https://mock-worker.example.workers.dev/api/audio?v=dQw4w9WgXcQ');
      expect(calledOptions.headers).toEqual({
        'X-App-Token': 'test_app_token_123',
      });

      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('audio/webm');
      expect(blob.size).toBe(4);

      expect(progressUpdates.length).toBeGreaterThan(0);
      const lastProgress = progressUpdates[progressUpdates.length - 1];
      expect(lastProgress).toEqual({
        loaded: 4,
        total: 4,
        percent: 100,
      });
    });

    it('streams multiple chunks and reports accurate progress', async () => {
      const chunk1 = new Uint8Array([10, 20]);
      const chunk2 = new Uint8Array([30, 40]);
      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(chunk1);
          controller.enqueue(chunk2);
          controller.close();
        },
      });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({
          'content-type': 'audio/mp4',
          'content-length': '4',
        }),
        body: mockStream,
      });

      const progressUpdates: any[] = [];
      const blob = await fetchYouTubeAudioBlob('abc123xyz', (p) => progressUpdates.push(p));

      expect(blob.type).toBe('audio/mp4');
      expect(blob.size).toBe(4);

      expect(progressUpdates).toEqual([
        { loaded: 2, total: 4, percent: 50 },
        { loaded: 4, total: 4, percent: 100 },
        { loaded: 4, total: 4, percent: 100 },
      ]);
    });

    it('handles missing content-length header by defaulting total to loaded', async () => {
      const chunk = new Uint8Array([1, 2, 3]);
      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(chunk);
          controller.close();
        },
      });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({
          'content-type': 'audio/webm',
        }),
        body: mockStream,
      });

      const progressUpdates: any[] = [];
      const blob = await fetchYouTubeAudioBlob('videoWithoutLength', (p) => progressUpdates.push(p));

      expect(blob.size).toBe(3);
      expect(progressUpdates.length).toBeGreaterThan(0);
      const lastProgress = progressUpdates[progressUpdates.length - 1];
      expect(lastProgress).toEqual({
        loaded: 3,
        total: 3,
        percent: 100,
      });
    });

    it('falls back to response.blob() if response.body is unavailable', async () => {
      const expectedBlob = new Blob([new Uint8Array([7, 8, 9])], { type: 'audio/webm' });
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({
          'content-type': 'audio/webm',
          'content-length': '3',
        }),
        body: null,
        blob: vi.fn().mockResolvedValue(expectedBlob),
      });

      const progressUpdates: any[] = [];
      const blob = await fetchYouTubeAudioBlob('videoNoBody', (p) => progressUpdates.push(p));

      expect(blob).toBe(expectedBlob);
      expect(progressUpdates).toEqual([
        { loaded: 3, total: 3, percent: 100 },
      ]);
    });

    it('throws informative error when HTTP response is not ok', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: vi.fn().mockResolvedValue('Invalid token'),
      });

      await expect(fetchYouTubeAudioBlob('restrictedVideo')).rejects.toThrow(
        'Failed to fetch audio (403 Forbidden) - Invalid token'
      );
    });

    it('handles HTTP error when response.text() fails', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: vi.fn().mockRejectedValue(new Error('Cannot read stream')),
      });

      await expect(fetchYouTubeAudioBlob('errorVideo')).rejects.toThrow(
        'Failed to fetch audio (500 Internal Server Error)'
      );
    });

    it('passes abort signal to fetch', async () => {
      const controller = new AbortController();
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        body: null,
        blob: vi.fn().mockResolvedValue(new Blob([])),
      });
      globalThis.fetch = fetchMock;

      await fetchYouTubeAudioBlob('signalVideo', undefined, controller.signal);
      expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal);
    });

    it('prefers local /api/audio in browser environment (!isNative)', async () => {
      const mockData = new Uint8Array([5, 6]);
      const mockBlob = new Blob([mockData], { type: 'audio/webm' });
      const origWindow = (globalThis as any).window;
      (globalThis as any).window = {};

      try {
        const fetchMock = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'content-type': 'audio/webm' }),
          body: null,
          blob: vi.fn().mockResolvedValue(mockBlob),
        });
        globalThis.fetch = fetchMock;

        const blob = await fetchYouTubeAudioBlob('browserVid123');
        expect(blob).toBe(mockBlob);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0][0]).toBe('/api/audio?v=browserVid123');
      } finally {
        (globalThis as any).window = origWindow;
      }
    });

    it('falls back to remote worker when local /api/audio fails in browser environment', async () => {
      const mockData = new Uint8Array([9, 9]);
      const mockBlob = new Blob([mockData], { type: 'audio/webm' });
      const origWindow = (globalThis as any).window;
      (globalThis as any).window = {};

      try {
        const fetchMock = vi.fn()
          .mockResolvedValueOnce({
            ok: false,
            status: 404,
            statusText: 'Not Found',
          })
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            statusText: 'OK',
            headers: new Headers({ 'content-type': 'audio/webm' }),
            body: null,
            blob: vi.fn().mockResolvedValue(mockBlob),
          });
        globalThis.fetch = fetchMock;

        const blob = await fetchYouTubeAudioBlob('fallbackVid123');
        expect(blob).toBe(mockBlob);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock.mock.calls[0][0]).toBe('/api/audio?v=fallbackVid123');
        expect(fetchMock.mock.calls[1][0]).toBe('https://mock-worker.example.workers.dev/api/audio?v=fallbackVid123');
      } finally {
        (globalThis as any).window = origWindow;
      }
    });

    it('cancels stream reading and throws when signal is aborted', async () => {
      const controller = new AbortController();
      controller.abort();

      const cancelSpy = vi.fn();
      const mockStream = {
        getReader: () => ({
          read: vi.fn(),
          cancel: cancelSpy,
          releaseLock: vi.fn(),
        }),
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'audio/webm' }),
        body: mockStream,
      });

      await expect(fetchYouTubeAudioBlob('abortImmediately', undefined, controller.signal)).rejects.toThrow();
    });

    it('prefers on-device direct extraction in native Android environment', async () => {
      const mockBlob = new Blob([new Uint8Array([1, 2])], { type: 'audio/mp4' });
      const origWindow = (globalThis as any).window;
      (globalThis as any).window = {
        Capacitor: { isNativePlatform: () => true },
      };

      try {
        vi.spyOn(coreModule, 'smartFetch')
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            text: async () => '"INNERTUBE_API_KEY":"test_key_123"',
            json: async () => ({}),
            arrayBuffer: async () => new ArrayBuffer(0),
          })
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            text: async () => '',
            json: async () => ({
              streamingData: {
                adaptiveFormats: [
                  { itag: 140, mimeType: 'audio/mp4', url: 'https://cdn.googlevideo.com/stream140' },
                ],
              },
            }),
            arrayBuffer: async () => new ArrayBuffer(0),
          });

        const fetchMock = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'content-type': 'audio/mp4' }),
          body: null,
          blob: vi.fn().mockResolvedValue(mockBlob),
        });
        globalThis.fetch = fetchMock;

        const blob = await fetchYouTubeAudioBlob('dQw4w9WgXcQ');
        expect(blob).toBe(mockBlob);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0][0]).toBe('https://cdn.googlevideo.com/stream140');
      } finally {
        (globalThis as any).window = origWindow;
      }
    });

    it('falls back to remote worker in native Android environment if direct extraction fails', async () => {
      const mockBlob = new Blob([new Uint8Array([3, 4])], { type: 'audio/webm' });
      const origWindow = (globalThis as any).window;
      (globalThis as any).window = {
        Capacitor: { isNativePlatform: () => true },
      };

      try {
        vi.spyOn(coreModule, 'smartFetch').mockRejectedValue(new Error('InnerTube block'));

        const fetchMock = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'content-type': 'audio/webm' }),
          body: null,
          blob: vi.fn().mockResolvedValue(mockBlob),
        });
        globalThis.fetch = fetchMock;

        const blob = await fetchYouTubeAudioBlob('dQw4w9WgXcQ');
        expect(blob).toBe(mockBlob);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0][0]).toBe('https://mock-worker.example.workers.dev/api/audio?v=dQw4w9WgXcQ');
      } finally {
        (globalThis as any).window = origWindow;
      }
    });
  });

  describe('downloadAndExtractYouTubeAudio', () => {
    it('downloads audio and extracts Float32Array PCM samples with staged progress', async () => {
      const fakeBlob = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' });
      const mockPcm = new Float32Array([0.1, -0.2, 0.5, -0.8]);

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-length': '3' }),
        body: null,
        blob: vi.fn().mockResolvedValue(fakeBlob),
      });

      const extractSpy = vi.spyOn(audioExtractor, 'extractAudioFromVideo').mockImplementation(
        async (_file, onProgress) => {
          onProgress?.({ stage: 'reading', percent: 10 });
          onProgress?.({ stage: 'decoding', percent: 40 });
          onProgress?.({ stage: 'resampling', percent: 70 });
          onProgress?.({ stage: 'done', percent: 100 });
          return mockPcm;
        }
      );

      const progressStages: { stage: string; percent: number }[] = [];
      const result = await downloadAndExtractYouTubeAudio('testVid', (stage, percent) => {
        progressStages.push({ stage, percent });
      });

      expect(result).toBe(mockPcm);
      expect(extractSpy).toHaveBeenCalledWith(fakeBlob, expect.any(Function));

      // Check progress sequence
      expect(progressStages).toEqual([
        { stage: 'downloading', percent: 0 },
        { stage: 'downloading', percent: 50 },
        { stage: 'reading', percent: 55 },
        { stage: 'decoding', percent: 70 },
        { stage: 'resampling', percent: 85 },
        { stage: 'done', percent: 100 },
      ]);
    });

    it('throws AbortError if signal is aborted after download', async () => {
      const fakeBlob = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' });
      const controller = new AbortController();

      globalThis.fetch = vi.fn().mockImplementation(async () => {
        // Abort right after fetch starts/completes
        controller.abort();
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: new Headers(),
          body: null,
          blob: vi.fn().mockResolvedValue(fakeBlob),
        };
      });

      await expect(
        downloadAndExtractYouTubeAudio('abortVid', undefined, controller.signal)
      ).rejects.toThrow('Aborted');
    });
  });

  describe('extractDirectClientAudioUrl', () => {
    it('successfully extracts direct audio format (itag 140) from InnerTube player', async () => {
      vi.spyOn(coreModule, 'smartFetch')
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => '<html>"INNERTUBE_API_KEY":"AIzaSyMockKey123"</html>',
          json: async () => ({}),
          arrayBuffer: async () => new ArrayBuffer(0),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => '',
          json: async () => ({
            streamingData: {
              adaptiveFormats: [
                { itag: 251, mimeType: 'audio/webm; codecs="opus"', url: 'https://cdn.googlevideo.com/251' },
                { itag: 140, mimeType: 'audio/mp4; codecs="mp4a.40.2"', url: 'https://cdn.googlevideo.com/140', bitrate: 130000 },
              ],
            },
          }),
          arrayBuffer: async () => new ArrayBuffer(0),
        });

      const result = await extractDirectClientAudioUrl('dQw4w9WgXcQ');
      expect(result.url).toBe('https://cdn.googlevideo.com/140');
      expect(result.mimeType).toBe('audio/mp4; codecs="mp4a.40.2"');
      expect(result.bitrate).toBe(130000);
    });

    it('throws error for invalid videoId format', async () => {
      await expect(extractDirectClientAudioUrl('invalid-id!')).rejects.toThrow('Invalid YouTube videoId format');
    });

    it('throws error when API key cannot be found on watch page', async () => {
      vi.spyOn(coreModule, 'smartFetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '<html>No key here</html>',
        json: async () => ({}),
        arrayBuffer: async () => new ArrayBuffer(0),
      });

      await expect(extractDirectClientAudioUrl('dQw4w9WgXcQ')).rejects.toThrow(
        'Failed to extract InnerTube API key from YouTube page'
      );
    });

    it('throws error when no streamable formats with url are present in player response', async () => {
      vi.spyOn(coreModule, 'smartFetch')
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => '"INNERTUBE_API_KEY":"AIzaSyMockKey123"',
          json: async () => ({}),
          arrayBuffer: async () => new ArrayBuffer(0),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => '',
          json: async () => ({
            streamingData: {
              adaptiveFormats: [
                { itag: 251, mimeType: 'audio/webm', signatureCipher: 's=abc' },
              ],
            },
          }),
          arrayBuffer: async () => new ArrayBuffer(0),
        });

      await expect(extractDirectClientAudioUrl('dQw4w9WgXcQ')).rejects.toThrow(
        'No direct streamable audio format found in InnerTube response'
      );
    });
  });

  describe('fetchClientDirectAudioStream', () => {
    it('downloads stream directly and returns Blob', async () => {
      const mockBlob = new Blob([new Uint8Array([7, 8])], { type: 'audio/mp4' });

      vi.spyOn(coreModule, 'smartFetch')
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => '"INNERTUBE_API_KEY":"AIzaSyMockKey123"',
          json: async () => ({}),
          arrayBuffer: async () => new ArrayBuffer(0),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => '',
          json: async () => ({
            streamingData: {
              adaptiveFormats: [
                { itag: 140, mimeType: 'audio/mp4', url: 'https://cdn.googlevideo.com/audio140' },
              ],
            },
          }),
          arrayBuffer: async () => new ArrayBuffer(0),
        });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'audio/mp4' }),
        body: null,
        blob: vi.fn().mockResolvedValue(mockBlob),
      });

      const blob = await fetchClientDirectAudioStream('dQw4w9WgXcQ');
      expect(blob).toBe(mockBlob);
      expect(globalThis.fetch).toHaveBeenCalledWith('https://cdn.googlevideo.com/audio140', expect.any(Object));
    });

    it('throws error when download response is not ok', async () => {
      vi.spyOn(coreModule, 'smartFetch')
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => '"INNERTUBE_API_KEY":"AIzaSyMockKey123"',
          json: async () => ({}),
          arrayBuffer: async () => new ArrayBuffer(0),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => '',
          json: async () => ({
            streamingData: {
              adaptiveFormats: [
                { itag: 140, mimeType: 'audio/mp4', url: 'https://cdn.googlevideo.com/audio140' },
              ],
            },
          }),
          arrayBuffer: async () => new ArrayBuffer(0),
        });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      });

      await expect(fetchClientDirectAudioStream('dQw4w9WgXcQ')).rejects.toThrow(
        'Direct audio stream download failed (403 Forbidden)'
      );
    });
  });
});
