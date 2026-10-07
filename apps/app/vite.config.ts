import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import https from 'https';
import http from 'http';
import { execFile } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import packageJson from './package.json' with { type: 'json' };

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// In-memory transcript cache (10 minute TTL)
const transcriptCache = new Map<string, { cues: any[]; lang: string; timestamp: number }>();
const TRANSCRIPT_CACHE_TTL_MS = 10 * 60 * 1000;

// Known public InnerTube API Key (fallback if HTML extraction is bypassed)
let cachedInnertubeApiKey = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';

async function getInnertubeApiKey(forceRefresh = false, videoId?: string): Promise<string> {
  if (cachedInnertubeApiKey && !forceRefresh) return cachedInnertubeApiKey;
  try {
    const targetVideo = videoId || 'cT-52mKI8I4';
    const html = await new Promise<string>((resolve, reject) => {
      https.get(`https://www.youtube.com/watch?v=${targetVideo}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      }, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve(data));
      }).on('error', reject);
    });
    const keyMatch = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
    if (keyMatch && keyMatch[1]) {
      cachedInnertubeApiKey = keyMatch[1];
      return cachedInnertubeApiKey;
    }
  } catch (e) {
    console.warn('Failed to refresh Innertube API key from watch page:', e);
  }
  return cachedInnertubeApiKey || 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
}

async function queryPlayerCaptions(videoId: string, apiKey: string): Promise<any> {
  return new Promise<any>((resolve, reject) => {
    const postData = JSON.stringify({
      context: { client: { clientName: 'ANDROID', clientVersion: '20.10.38' } },
      videoId
    });
    const r = https.request('https://www.youtube.com/youtubei/v1/player?key=' + apiKey, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': 'Mozilla/5.0'
      }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });
    r.on('error', reject);
    r.write(postData);
    r.end();
  });
}

async function fetchRealYouTubeTranscript(videoId: string, sourceLang: string = 'auto') {
  const cacheKey = `${videoId}_${sourceLang}`;
  const cached = transcriptCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < TRANSCRIPT_CACHE_TTL_MS) {
    return { cues: cached.cues, lang: cached.lang };
  }

  let apiKey = await getInnertubeApiKey(false, videoId);
  let playerRes: any = null;
  try {
    playerRes = await queryPlayerCaptions(videoId, apiKey);
  } catch {
    apiKey = await getInnertubeApiKey(true, videoId);
    playerRes = await queryPlayerCaptions(videoId, apiKey);
  }

  let renderer = playerRes?.captions?.playerCaptionsTracklistRenderer;
  if (!renderer && !playerRes?.streamingData) {
    apiKey = await getInnertubeApiKey(true, videoId);
    playerRes = await queryPlayerCaptions(videoId, apiKey);
    renderer = playerRes?.captions?.playerCaptionsTracklistRenderer;
  }

  const captionTracks = renderer?.captionTracks || [];
  if (captionTracks.length === 0) return { cues: [], lang: 'en' };

  let selectedTrack: any = null;

  // 1. Explicit source language requested by user
  if (sourceLang && sourceLang !== 'auto') {
    const cleanSource = sourceLang.replace(/^a\./, '').split('-')[0].toLowerCase();
    selectedTrack = captionTracks.find((t: any) =>
      t.languageCode === sourceLang ||
      t.languageCode?.toLowerCase() === cleanSource ||
      t.languageCode?.toLowerCase().startsWith(cleanSource)
    );
  }

  // 2. YouTube official defaultCaptionTrackIndex from default audio track
  const defAudioIdx = typeof renderer?.defaultAudioTrackIndex === 'number' ? renderer.defaultAudioTrackIndex : 0;
  const defaultAudio = renderer?.audioTracks?.[defAudioIdx];
  const defCaptionIdx = defaultAudio?.defaultCaptionTrackIndex;

  if (!selectedTrack && typeof defCaptionIdx === 'number' && captionTracks[defCaptionIdx]) {
    selectedTrack = captionTracks[defCaptionIdx];
  }

  // 3. YouTube defaultTranslationSourceTrackIndices (base track for auto-translations)
  if (!selectedTrack && Array.isArray(renderer?.defaultTranslationSourceTrackIndices) && renderer.defaultTranslationSourceTrackIndices.length > 0) {
    const srcIdx = renderer.defaultTranslationSourceTrackIndices[0];
    if (typeof srcIdx === 'number' && captionTracks[srcIdx]) {
      selectedTrack = captionTracks[srcIdx];
    }
  }

  // 4. Auto mode: Detect original audio language from audioTracks metadata if audioTrackId is provided
  if (!selectedTrack && defaultAudio?.audioTrackId) {
    const originalAudioLang = defaultAudio.audioTrackId.split('.')[0].split('-')[0].toLowerCase();
    if (originalAudioLang) {
      const manualTrack = captionTracks.find((t: any) =>
        (!t.kind || t.kind !== 'asr') &&
        (t.languageCode?.toLowerCase() === originalAudioLang || t.languageCode?.toLowerCase().startsWith(originalAudioLang))
      );
      const asrTrack = captionTracks.find((t: any) =>
        (t.languageCode?.toLowerCase() === originalAudioLang || t.languageCode?.toLowerCase().startsWith(originalAudioLang))
      );
      selectedTrack = manualTrack || asrTrack;
    }
  }

  // 5. ASR native language deduction: YouTube ONLY generates ASR in the true spoken audio language!
  if (!selectedTrack) {
    const asrTrack = captionTracks.find((t: any) => t.kind === 'asr');
    if (asrTrack?.languageCode) {
      const nativeAsrLang = asrTrack.languageCode.replace(/^a\./, '').split('-')[0].toLowerCase();
      const matchingManual = captionTracks.find((t: any) =>
        (!t.kind || t.kind !== 'asr') &&
        (t.languageCode?.toLowerCase() === nativeAsrLang || t.languageCode?.toLowerCase().startsWith(nativeAsrLang))
      );
      selectedTrack = matchingManual || asrTrack;
    }
  }

  // 6. Fallback: Any creator manual subtitle if available, otherwise first track
  if (!selectedTrack) {
    const anyManual = captionTracks.find((t: any) => !t.kind || t.kind !== 'asr');
    selectedTrack = anyManual || captionTracks[0];
  }

  if (!selectedTrack || !selectedTrack.baseUrl) {
    return { cues: [], lang: 'en' };
  }

  const trackLang = selectedTrack.languageCode?.replace(/^a\./, '').split('-')[0] || 'en';
  let baseUrl = selectedTrack.baseUrl;
  if (!baseUrl.includes('&fmt=')) {
    baseUrl += '&fmt=srv3';
  }

  const xmlData = await new Promise<string>((resolve, reject) => {
    https.get(baseUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });

  const lines: any[] = [];
  const pRegex = /<p t="(\d+)" d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;
  let m: RegExpExecArray | null;
  let idx = 1;

  while ((m = pRegex.exec(xmlData)) !== null) {
    const startMs = parseInt(m[1]);
    const durMs = parseInt(m[2]);
    const innerHtml = m[3];
    const text = innerHtml.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\n/g, ' ').trim();
    if (text) {
      lines.push({
        id: String(idx++),
        start: startMs / 1000,
        end: (startMs + durMs) / 1000,
        text: text
      });
    }
  }

  if (lines.length === 0) {
    const textRegex = /<text start="([^"]+)" dur="([^"]+)"[^>]*>([^<]+)<\/text>/g;
    while ((m = textRegex.exec(xmlData)) !== null) {
      const start = parseFloat(m[1]);
      const dur = parseFloat(m[2]);
      const text = m[3].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\n/g, ' ').trim();
      if (text) {
        lines.push({
          id: String(idx++),
          start,
          end: start + dur,
          text: text
        });
      }
    }
  }

  const result = { cues: lines, lang: trackLang };
  if (lines.length > 0) {
    transcriptCache.set(cacheKey, { ...result, timestamp: Date.now() });
  }
  return result;
}

function getAudioStreamUrlViaYtDlp(videoId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('yt-dlp', ['-g', '-f', 'ba/b', `https://www.youtube.com/watch?v=${videoId}`], { timeout: 15000 }, (err, stdout) => {
      if (err) return reject(err);
      const url = stdout.trim().split('\n')[0];
      if (url && url.startsWith('http')) return resolve(url);
      reject(new Error('Invalid URL returned by yt-dlp'));
    });
  });
}

async function getAudioStreamUrlViaAndroidApi(videoId: string): Promise<{ url: string; mimeType?: string }> {
  const apiKey = await getInnertubeApiKey();
  const playerRes = await queryPlayerCaptions(videoId, apiKey);
  const formats = [...(playerRes?.streamingData?.adaptiveFormats || []), ...(playerRes?.streamingData?.formats || [])];
  const audioFormats = formats.filter(f => f.mimeType?.includes('audio/') && f.url);
  const best = audioFormats.find(f => f.mimeType?.includes('audio/webm')) || audioFormats[0];
  if (best?.url) {
    return { url: best.url, mimeType: best.mimeType };
  }
  throw new Error('No streamable audio format found in YouTube response');
}

function getVideoStreamUrlViaYtDlp(videoId: string, resolution: string = '720p'): Promise<string> {
  const formatSelector = resolution === '360p'
    ? '18/b[height<=360][ext=mp4]/b'
    : resolution === '1080p'
    ? 'b[height<=1080][ext=mp4]/b'
    : '22/18/b[height<=720][ext=mp4]/b';
  return new Promise((resolve, reject) => {
    execFile('yt-dlp', ['-g', '-f', formatSelector, `https://www.youtube.com/watch?v=${videoId}`], { timeout: 15000 }, (err, stdout) => {
      if (err) return reject(err);
      const url = stdout.trim().split('\n')[0];
      if (url && url.startsWith('http')) return resolve(url);
      reject(new Error('Invalid video URL returned by yt-dlp'));
    });
  });
}

async function getVideoStreamUrlViaAndroidApi(videoId: string, resolution: string = '720p'): Promise<{ url: string; mimeType?: string }> {
  const apiKey = await getInnertubeApiKey(false, videoId);
  const playerRes = await queryPlayerCaptions(videoId, apiKey);
  const formats = [
    ...(playerRes?.streamingData?.formats || []),
    ...(playerRes?.streamingData?.adaptiveFormats || [])
  ].filter(f => f && typeof f.url === 'string' && f.url.startsWith('http'));

  let selected: any = null;
  if (resolution === '360p') {
    selected = formats.find(f => f.itag === 18) || formats.find(f => f.height <= 360 && f.mimeType?.includes('video'));
  } else if (resolution === '1080p') {
    selected = formats.find(f => f.height === 1080) || formats.find(f => f.itag === 22) || formats.find(f => f.itag === 18);
  } else {
    // 720p
    selected = formats.find(f => f.itag === 22) || formats.find(f => f.height === 720) || formats.find(f => f.itag === 18);
  }

  if (!selected) {
    selected = formats.find(f => f.mimeType?.includes('video/mp4')) || formats[0];
  }

  if (selected?.url) {
    return { url: selected.url, mimeType: selected.mimeType };
  }
  throw new Error('No streamable video format found in YouTube response');
}

function pipeUpstreamWithRedirects(
  targetUrl: string,
  reqHeaders: Record<string, string>,
  res: any,
  req: any,
  maxRedirects = 5
): void {
  if (maxRedirects <= 0) {
    if (!res.headersSent) {
      res.statusCode = 508;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Too many redirects from upstream CDN' }));
    }
    return;
  }

  const parsedUrl = new URL(targetUrl);
  const client = parsedUrl.protocol === 'http:' ? http : https;

  const upstreamReq = client.get(targetUrl, {
    headers: reqHeaders
  }, (upstreamRes) => {
    const statusCode = upstreamRes.statusCode || 200;

    // Follow 3xx redirects (301, 302, 303, 307, 308) from googlevideo
    if ([301, 302, 303, 307, 308].includes(statusCode) && upstreamRes.headers.location) {
      upstreamRes.resume();
      const nextUrl = new URL(upstreamRes.headers.location, targetUrl).toString();
      return pipeUpstreamWithRedirects(nextUrl, reqHeaders, res, req, maxRedirects - 1);
    }

    res.statusCode = statusCode;
    if (upstreamRes.headers['content-type']) {
      res.setHeader('Content-Type', upstreamRes.headers['content-type']);
    }
    if (upstreamRes.headers['content-length']) {
      res.setHeader('Content-Length', upstreamRes.headers['content-length']);
    }
    upstreamRes.pipe(res);
  });

  upstreamReq.on('error', (err) => {
    console.error('Upstream piping error:', err);
    if (!res.headersSent) {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Failed to pipe upstream stream' }));
    }
  });

  req.on('close', () => {
    upstreamReq.destroy();
  });
}

function youtubeDevProxyPlugin(): Plugin {
  return {
    name: 'youtube-dev-proxy-plugin',
    configureServer(server) {
      // 1. YouTube Transcript Proxy
      server.middlewares.use('/api/transcript', async (req, res) => {
        const urlParams = new URL(req.url || '', 'http://localhost').searchParams;
        const videoId = urlParams.get('v');
        const lang = urlParams.get('lang') || 'auto';

        if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Missing or invalid videoId' }));
          return;
        }

        try {
          const result = await fetchRealYouTubeTranscript(videoId, lang);
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(result));
        } catch (err) {
          console.error('Transcript fetch error:', err);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: String(err) }));
        }
      });

      // 2. YouTube Audio Stream Proxy
      server.middlewares.use('/api/audio', async (req, res) => {
        const urlParams = new URL(req.url || '', 'http://localhost').searchParams;
        const videoId = urlParams.get('v');

        if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Missing or invalid videoId' }));
          return;
        }

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-App-Token');

        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.end();
          return;
        }

        try {
          let streamUrl = '';
          try {
            streamUrl = await getAudioStreamUrlViaYtDlp(videoId);
          } catch (dlpErr) {
            console.warn('yt-dlp stream extraction failed, trying Android API fallback:', dlpErr);
            const fallback = await getAudioStreamUrlViaAndroidApi(videoId);
            streamUrl = fallback.url;
          }

          if (req.method === 'HEAD') {
            res.setHeader('Content-Type', 'audio/webm');
            res.statusCode = 200;
            res.end();
            return;
          }

          pipeUpstreamWithRedirects(
            streamUrl,
            { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Accept': '*/*' },
            res,
            req
          );
        } catch (err: any) {
          console.error('Audio proxy error:', err);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: String(err?.message || err) }));
          }
        }
      });

      // 3. YouTube Video Stream Proxy
      server.middlewares.use('/api/video', async (req, res) => {
        const urlParams = new URL(req.url || '', 'http://localhost').searchParams;
        const videoId = urlParams.get('v');
        const resolution = urlParams.get('res') || '720p';

        if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Missing or invalid videoId' }));
          return;
        }

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-App-Token');

        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.end();
          return;
        }

        try {
          let streamUrl = '';
          try {
            streamUrl = await getVideoStreamUrlViaYtDlp(videoId, resolution);
          } catch (dlpErr) {
            console.warn('yt-dlp video extraction failed, trying Android API fallback:', dlpErr);
            const fallback = await getVideoStreamUrlViaAndroidApi(videoId, resolution);
            streamUrl = fallback.url;
          }

          if (req.method === 'HEAD') {
            res.setHeader('Content-Type', 'video/mp4');
            res.statusCode = 200;
            res.end();
            return;
          }

          pipeUpstreamWithRedirects(
            streamUrl,
            { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Accept': '*/*' },
            res,
            req
          );
        } catch (err: any) {
          console.error('Video proxy error:', err);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: String(err?.message || err) }));
          }
        }
      });
    }
  };
}

export default defineConfig({
  resolve: {
    alias: {
      '@ytceviri/core': path.resolve(__dirname, '../../packages/core/src/index.ts')
    }
  },
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(packageJson.version)
  },
  plugins: [react(), tailwindcss(), youtubeDevProxyPlugin()],
});
