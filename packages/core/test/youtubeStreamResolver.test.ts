import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  applyCipherOperations,
  fetchVisitorData,
  resolveYouTubeStreams,
  parseCipherOpsFromPlayerJs,
  decipherFormatUrl,
  resetStreamResolverCaches,
  type CipherOp
} from '../src/services/youtubeStreamResolver';
import * as translationService from '../src/services/translationService';

describe('youtubeStreamResolver service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetStreamResolverCaches();
  });

  describe('applyCipherOperations', () => {
    it('correctly executes reverse operation', () => {
      const ops: CipherOp[] = [{ type: 'reverse' }];
      expect(applyCipherOperations('abcdef', ops)).toBe('fedcba');
    });

    it('correctly executes slice operation', () => {
      const ops: CipherOp[] = [{ type: 'slice', arg: 2 }];
      expect(applyCipherOperations('abcdef', ops)).toBe('cdef');
    });

    it('correctly executes swap operation', () => {
      const ops: CipherOp[] = [{ type: 'swap', arg: 2 }];
      // 'abcdef' -> swap chars[0] ('a') with chars[2] ('c') -> 'cbadef'
      expect(applyCipherOperations('abcdef', ops)).toBe('cbadef');
    });

    it('correctly handles swap with modulo wrap-around', () => {
      const ops: CipherOp[] = [{ type: 'swap', arg: 5 }];
      // 'abc' length 3. 5 % 3 = 2. Swap chars[0] ('a') with chars[2] ('c') -> 'cba'
      expect(applyCipherOperations('abc', ops)).toBe('cba');
    });

    it('correctly executes multiple sequenced operations', () => {
      const ops: CipherOp[] = [
        { type: 'reverse' },        // 'abcdef' -> 'fedcba'
        { type: 'slice', arg: 1 },  // 'fedcba' -> 'edcba'
        { type: 'swap', arg: 2 }    // 'edcba' -> swap chars[0] ('e') with chars[2] ('c') -> 'cdeba'
      ];
      expect(applyCipherOperations('abcdef', ops)).toBe('cdeba');
    });

    it('returns original string when ops array is empty', () => {
      expect(applyCipherOperations('hello_world', [])).toBe('hello_world');
    });
  });

  describe('fetchVisitorData', () => {
    it('parses visitor data token from sw.js_data with )]}\' prefix', async () => {
      const mockPayload = [
        [
          null,
          null,
          [
            [
              [
                0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
                'CgtURVNUX1ZJU0lUT1JfMQ%3D%3D'
              ]
            ]
          ]
        ]
      ];
      const rawText = `)]}'\n${JSON.stringify(mockPayload)}`;

      const smartFetchSpy = vi.spyOn(translationService, 'smartFetch').mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => rawText,
        json: async () => mockPayload,
        arrayBuffer: async () => new ArrayBuffer(0)
      });

      const token = await fetchVisitorData();
      expect(token).toBe('CgtURVNUX1ZJU0lUT1JfMQ%3D%3D');
      expect(smartFetchSpy).toHaveBeenCalledWith(
        'https://www.youtube.com/sw.js_data',
        expect.objectContaining({ headers: expect.any(Object) }),
        4000
      );

      // Verify in-memory cache on subsequent call
      const cachedToken = await fetchVisitorData();
      expect(cachedToken).toBe('CgtURVNUX1ZJU0lUT1JfMQ%3D%3D');
      expect(smartFetchSpy).toHaveBeenCalledTimes(1);
    });

    it('falls back to watch page regex if sw.js_data fails', async () => {
      vi.spyOn(translationService, 'smartFetch').mockImplementation(async (url: string) => {
        if (url.includes('sw.js_data')) {
          return {
            ok: false,
            status: 404,
            text: async () => '',
            json: async () => ({}),
            arrayBuffer: async () => new ArrayBuffer(0)
          };
        }
        if (url.includes('watch?v=')) {
          return {
            ok: true,
            status: 200,
            text: async () => '<html><script>var x = {"VISITOR_DATA":"FALLBACK_TOKEN_999"};</script></html>',
            json: async () => ({}),
            arrayBuffer: async () => new ArrayBuffer(0)
          };
        }
        throw new Error('Unexpected URL');
      });

      const token = await fetchVisitorData();
      expect(token).toBe('FALLBACK_TOKEN_999');
    });

    it('returns empty string gracefully if all sources fail', async () => {
      vi.spyOn(translationService, 'smartFetch').mockRejectedValue(new Error('Network down'));
      const token = await fetchVisitorData();
      expect(token).toBe('');
    });
  });

  describe('parseCipherOpsFromPlayerJs & decipherFormatUrl', () => {
    it('extracts opcodes from simulated player base.js', () => {
      const mockJs = `
        var HA = {
          xy: function(a, b) { var c = a[0]; a[0] = a[b % a.length]; a[b % a.length] = c; },
          ab: function(a) { a.reverse(); },
          qr: function(a, b) { a.splice(0, b); }
        };
        var descramble = function(a) {
          a = a.split("");
          HA.xy(a, 3);
          HA.ab(a);
          HA.qr(a, 2);
          return a.join("");
        };
      `;

      const ops = parseCipherOpsFromPlayerJs(mockJs);
      expect(ops).toEqual([
        { type: 'swap', arg: 3 },
        { type: 'reverse' },
        { type: 'slice', arg: 2 }
      ]);
    });

    it('deciphers signatureCipher query string and appends sp parameter', () => {
      const cipherStr = 'url=https%3A%2F%2Frr1---sn-4g5ednks.googlevideo.com%2Fvideoplayback%3Fexpire%3D123&s=abcdef&sp=sig';
      const ops: CipherOp[] = [{ type: 'reverse' }]; // 'abcdef' -> 'fedcba'

      const finalUrl = decipherFormatUrl(cipherStr, ops);
      expect(finalUrl).toBe('https://rr1---sn-4g5ednks.googlevideo.com/videoplayback?expire=123&sig=fedcba');
    });
  });

  describe('resolveYouTubeStreams', () => {
    it('resolves formats using VISIONOS client emulation (Tier 1)', async () => {
      let capturedPayload: any = null;
      let capturedHeaders: any = null;

      vi.spyOn(translationService, 'smartFetch').mockImplementation(async (url: string, opts?: any) => {
        if (url.includes('sw.js_data')) {
          return {
            ok: true,
            status: 200,
            text: async () => ')]}\'\n' + JSON.stringify([[null, null, [[[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 'VIS_VOS']]]]]),
            json: async () => [],
            arrayBuffer: async () => new ArrayBuffer(0)
          };
        }
        if (url.includes('youtubei/v1/player')) {
          capturedPayload = JSON.parse(opts?.body || '{}');
          capturedHeaders = opts?.headers;
          return {
            ok: true,
            status: 200,
            json: async () => ({
              playabilityStatus: { status: 'OK' },
              streamingData: {
                formats: [
                  {
                    itag: 18,
                    qualityLabel: '360p',
                    mimeType: 'video/mp4; codecs="avc1.42001E, mp4a.40.2"',
                    bitrate: 600000,
                    contentLength: '1234567',
                    url: 'https://googlevideo.com/videoplayback?itag=18',
                    audioQuality: 'AUDIO_QUALITY_LOW',
                    width: 640,
                    height: 360,
                    fps: 30
                  }
                ],
                adaptiveFormats: [
                  {
                    itag: 140,
                    mimeType: 'audio/mp4; codecs="mp4a.40.2"',
                    bitrate: 128000,
                    url: 'https://googlevideo.com/videoplayback?itag=140'
                  }
                ]
              }
            }),
            text: async () => '',
            arrayBuffer: async () => new ArrayBuffer(0)
          };
        }
        throw new Error(`Unhandled url: ${url}`);
      });

      const streams = await resolveYouTubeStreams('dQw4w9WgXcQ');
      expect(streams).toHaveLength(2);

      // Check Video + Audio format
      expect(streams[0].itag).toBe(18);
      expect(streams[0].hasVideo).toBe(true);
      expect(streams[0].hasAudio).toBe(true);
      expect(streams[0].qualityLabel).toBe('360p');

      // Check Audio-only format
      expect(streams[1].itag).toBe(140);
      expect(streams[1].hasVideo).toBe(false);
      expect(streams[1].hasAudio).toBe(true);

      // Verify VISIONOS Client request headers & body
      expect(capturedHeaders['X-YouTube-Client-Name']).toBe('101');
      expect(capturedPayload.context.client.clientName).toBe('VISIONOS');
      expect(capturedPayload.context.client.visitorData).toBe('VIS_VOS');
    });

    it('falls back to Tier 2 (IOS) when VISIONOS returns non-ok response', async () => {
      const clientNamesCalled: string[] = [];

      vi.spyOn(translationService, 'smartFetch').mockImplementation(async (url: string, opts?: any) => {
        if (url.includes('sw.js_data')) {
          return {
            ok: false,
            status: 404,
            text: async () => '',
            json: async () => ({}),
            arrayBuffer: async () => new ArrayBuffer(0)
          };
        }
        if (url.includes('watch?v=')) {
          return {
            ok: false,
            status: 404,
            text: async () => '',
            json: async () => ({}),
            arrayBuffer: async () => new ArrayBuffer(0)
          };
        }
        if (url.includes('youtubei/v1/player')) {
          const body = JSON.parse(opts?.body || '{}');
          const clientName = body.context?.client?.clientName;
          clientNamesCalled.push(clientName);

          if (clientName === 'VISIONOS') {
            return {
              ok: false,
              status: 403,
              json: async () => ({}),
              text: async () => '',
              arrayBuffer: async () => new ArrayBuffer(0)
            };
          }

          if (clientName === 'IOS') {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                streamingData: {
                  formats: [
                    {
                      itag: 22,
                      qualityLabel: '720p',
                      mimeType: 'video/mp4; codecs="avc1.64001F, mp4a.40.2"',
                      url: 'https://googlevideo.com/videoplayback?itag=22',
                      audioQuality: 'AUDIO_QUALITY_MEDIUM'
                    }
                  ]
                }
              }),
              text: async () => '',
              arrayBuffer: async () => new ArrayBuffer(0)
            };
          }
        }
        throw new Error(`Unhandled: ${url}`);
      });

      const streams = await resolveYouTubeStreams('dQw4w9WgXcQ');
      expect(clientNamesCalled).toEqual(['VISIONOS', 'IOS']);
      expect(streams).toHaveLength(1);
      expect(streams[0].itag).toBe(22);
      expect(streams[0].qualityLabel).toBe('720p');
    });

    it('returns empty array when video ID is invalid', async () => {
      const streams = await resolveYouTubeStreams('');
      expect(streams).toEqual([]);
    });
  });
});
