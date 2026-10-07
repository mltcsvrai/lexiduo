import type {
  SubtitleCue,
  VideoDownloadResolution,
  VideoDownloadContainer,
  VideoDownloadProgress
} from '../types';
import { smartFetch } from './translationService';
import { batchTranslateCues, resolveCuesForLanguage, type SubtitleExportMode } from './subtitleExportService';
import { muxSubtitlesIntoMkv } from './mkvMuxerService';
import { muxSubtitlesIntoMp4, type SubtitleTrackExport } from './mp4MuxerService';
import { downloadBlobAsFile, blobToBase64 } from './blobDownloadHelper';

export { muxSubtitlesIntoMkv, muxSubtitlesIntoMp4, downloadBlobAsFile, blobToBase64 };
export type { SubtitleTrackExport };

export interface VideoExportParams {
  videoId?: string; videoTitle?: string; videoBlob?: Blob | File | null; videoFile?: Blob | File | null;
  videoFilename?: string; resolution?: VideoDownloadResolution; container?: VideoDownloadContainer;
  cues?: SubtitleCue[]; initialCues?: SubtitleCue[]; sourceLang?: string; targetLanguages?: string[];
  engine?: 'whisper' | 'gemini' | 'google'; apiKey?: string; subtitleMode?: SubtitleExportMode;
  customTracks?: SubtitleTrackExport[]; onProgress?: (progress: VideoDownloadProgress) => void; signal?: AbortSignal;
}

const getWorkerVideoConfig = () => {
  const metaEnv = typeof import.meta !== 'undefined' ? (import.meta as any).env : undefined;
  const base = metaEnv?.VITE_WORKER_API_BASE_URL || '';
  const token = metaEnv?.VITE_WORKER_APP_TOKEN || '';
  return { url: base ? `${base.replace(/\/+$/, '')}/api/video` : '', token };
};
const FALLBACK_INNERTUBE_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';

async function consumeStreamResponse(
  response: Response,
  onProgress?: (percent: number, loaded: number, total: number) => void,
  signal?: AbortSignal
): Promise<Blob> {
  const total = parseInt(response.headers.get('content-length') || '0', 10);
  const contentType = response.headers.get('content-type') || 'video/mp4';

  if (!response.body) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const b = await response.blob();
    onProgress?.(100, b.size, b.size);
    return b;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;

  try {
    while (true) {
      if (signal?.aborted) {
        reader.cancel().catch(() => {});
        throw new DOMException('Aborted', 'AbortError');
      }
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        loaded += value.length;
        onProgress?.(total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 50, loaded, total);
      }
    }
  } finally {
    reader.releaseLock?.();
  }

  onProgress?.(100, loaded, total || loaded);
  return new Blob(chunks as BlobPart[], { type: contentType });
}

async function fetchCdnStreamBlob(
  streamUrl: string,
  onProgress?: (percent: number, loaded: number, total: number) => void,
  signal?: AbortSignal
): Promise<Blob> {
  const isNative = typeof window !== 'undefined' && typeof (window as any).Capacitor !== 'undefined' && Boolean((window as any).Capacitor.isNativePlatform?.());
  if (isNative) {
    // 1. On Native Android, attempt Filesystem.downloadFile to Cache to bypass 1MB bridge IPC limits
    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const tempFilename = `temp_dl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.mp4`;
      const dlRes = await Filesystem.downloadFile({
        url: streamUrl,
        path: tempFilename,
        directory: Directory.Cache,
        progress: true
      });
      if (dlRes?.path) {
        const { Capacitor } = await import('@capacitor/core');
        const localSrc = Capacitor.convertFileSrc(dlRes.path);
        const localRes = await fetch(localSrc);
        const blob = await localRes.blob();
        Filesystem.deleteFile({ path: tempFilename, directory: Directory.Cache }).catch(() => {});
        onProgress?.(100, blob.size, blob.size);
        return blob;
      }
    } catch (fsDlErr) {
      console.warn('Native Filesystem.downloadFile fallback to stream fetch:', fsDlErr);
    }

    try {
      const res = await smartFetch(streamUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14)' },
        responseType: 'arraybuffer'
      }, 60000);
      const ab = await res.arrayBuffer();
      onProgress?.(100, ab.byteLength, ab.byteLength);
      return new Blob([ab], { type: 'video/mp4' });
    } catch (err) {
      console.warn('Native CapacitorHttp stream fetch fallback to web fetch:', err);
    }
  }

  const res = await fetch(streamUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14)' }, signal });
  if (!res.ok) throw new Error(`Video stream fetch failed: ${res.status} ${res.statusText}`);
  return consumeStreamResponse(res, onProgress, signal);
}

export async function fetchYouTubeVideoStream(
  videoId: string,
  resolution: VideoDownloadResolution = '720p',
  onProgress?: (percent: number, loaded: number, total: number) => void,
  signal?: AbortSignal
): Promise<Blob> {
  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) throw new Error('Invalid YouTube videoId format');

  const isNative = typeof window !== 'undefined' &&
    typeof (window as any).Capacitor !== 'undefined' &&
    Boolean((window as any).Capacitor.isNativePlatform?.());

  const isWebBrowser = typeof window !== 'undefined' && !isNative;

  // 1. In Web Browser environment (!isNative), try local same-origin dev proxy first (/api/video)
  if (isWebBrowser) {
    try {
      const localUrl = `/api/video?v=${encodeURIComponent(videoId)}&res=${encodeURIComponent(resolution)}`;
      const { token: localToken } = getWorkerVideoConfig();
      const localRes = await fetch(localUrl, {
        headers: localToken ? { 'X-App-Token': localToken } : {},
        signal
      });
      if (localRes.ok) {
        return await consumeStreamResponse(localRes, onProgress, signal);
      }
      console.warn(`Local video proxy returned status ${localRes.status}, trying fallback`);
    } catch (err: any) {
      if (err?.name === 'AbortError' || signal?.aborted) throw err;
      console.warn('Local video proxy failed, falling back:', err);
    }

    // 2. Fallback: Remote Cloudflare Worker video proxy (if configured)
    const { url: workerUrl, token: workerToken } = getWorkerVideoConfig();
    if (workerUrl) {
      try {
        const fullUrl = `${workerUrl}?v=${encodeURIComponent(videoId)}&res=${encodeURIComponent(resolution)}`;
        const headers: Record<string, string> = {};
        if (workerToken) headers['X-App-Token'] = workerToken;
        const workerRes = await fetch(fullUrl, { headers, signal });
        if (workerRes.ok) {
          return await consumeStreamResponse(workerRes, onProgress, signal);
        }
      } catch (wErr: any) {
        if (wErr?.name === 'AbortError' || signal?.aborted) throw wErr;
      }
    }
  }

  // 3. On Native Android (or last-ditch browser): Attempt on-device InnerTube extraction
  try {
    let apiKey = FALLBACK_INNERTUBE_KEY;
    try {
      const watchRes = await smartFetch(`https://www.youtube.com/watch?v=${videoId}`, { headers: { 'User-Agent': 'Mozilla/5.0' } }, 10000);
      const html = await watchRes.text();
      const extracted = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1];
      if (extracted) apiKey = extracted;
    } catch (watchErr) {
      console.warn('Watch page extraction warning, using fallback InnerTube API key:', watchErr);
    }

    const playerRes = await smartFetch(`https://www.youtube.com/youtubei/v1/player?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (Linux; Android 14)' },
      body: JSON.stringify({ context: { client: { clientName: 'ANDROID', clientVersion: '20.10.38', androidSdkVersion: 34 } }, videoId })
    }, 10000);

    const playerData = await playerRes.json();
    const formats = [...(playerData?.streamingData?.formats || []), ...(playerData?.streamingData?.adaptiveFormats || [])]
      .filter((f: any) => f && typeof f.url === 'string' && f.url.startsWith('http'));

    // Prioritize progressive formats with audio+video (itag 22: 720p, itag 18: 360p)
    let sel: any = null;
    if (resolution === '360p') {
      sel = formats.find((f: any) => f.itag === 18) || formats.find((f: any) => f.height <= 360 && f.mimeType?.includes('video'));
    } else if (resolution === '1080p') {
      sel = formats.find((f: any) => f.height === 1080) || formats.find((f: any) => f.itag === 22) || formats.find((f: any) => f.itag === 18);
    } else {
      // 720p default: prioritize itag 22 (720p progressive), fallback to itag 18 (360p audio+video), then adaptive 720
      sel = formats.find((f: any) => f.itag === 22) || formats.find((f: any) => f.itag === 18) || formats.find((f: any) => f.height === 720);
    }

    if (!sel) {
      sel = formats.find((f: any) => f.itag === 18) || formats.find((f: any) => f.mimeType?.includes('video/mp4')) || formats[0];
    }

    if (sel?.url) {
      return await fetchCdnStreamBlob(sel.url, onProgress, signal);
    }
  } catch (clientErr: any) {
    if (clientErr?.name === 'AbortError' || signal?.aborted) throw clientErr;
    console.warn('Direct InnerTube video extraction failed, trying remote worker fallback:', clientErr);
  }

  // 4. Safe ultimate fallback to Cloudflare Worker (if configured)
  const { url: finalWorkerUrl, token: finalToken } = getWorkerVideoConfig();
  if (finalWorkerUrl) {
    try {
      const fullUrl = `${finalWorkerUrl}?v=${encodeURIComponent(videoId)}&res=${encodeURIComponent(resolution)}`;
      const headers: Record<string, string> = {};
      if (finalToken) headers['X-App-Token'] = finalToken;
      const finalRes = await fetch(fullUrl, { headers, signal });
      if (finalRes.ok) {
        return await consumeStreamResponse(finalRes, onProgress, signal);
      }
    } catch (finalErr: any) {
      if (finalErr?.name === 'AbortError' || signal?.aborted) throw finalErr;
    }
  }

  throw new Error('VIDEO_STREAM_UNAVAILABLE: YouTube video stream could not be loaded due to network, CORS, or regional restrictions.');
}

export async function exportVideoWithSoftSubtitles(options: VideoExportParams): Promise<void> {
  const { onProgress, signal } = options;
  onProgress?.({ stage: 'preparing', percent: 5, detail: 'Preparing export...' });

  let tracks: SubtitleTrackExport[] = options.customTracks ? [...options.customTracks] : [];
  const inputCues = options.cues || options.initialCues;
  if (tracks.length === 0 && inputCues && inputCues.length > 0) {
    const targetLangs = options.targetLanguages?.length ? options.targetLanguages : [options.sourceLang || 'tr'];
    onProgress?.({ stage: 'translating', percent: 15, detail: 'Translating subtitles...' });
    const cleanSource = (options.sourceLang || 'auto').replace(/^a\./, '').split('-')[0].toLowerCase();
    const transMap = await batchTranslateCues(
      inputCues,
      options.sourceLang || 'auto',
      targetLangs,
      options.engine || 'google',
      options.apiKey,
      (pct, cur) => onProgress?.({ stage: 'translating', percent: 15 + Math.round(pct * 0.25), detail: `Translating ${cur}...` }),
      signal
    );
    for (const lang of targetLangs) {
      const cleanLang = lang.replace(/^a\./, '').split('-')[0].toLowerCase();
      tracks.push({
        language: cleanLang,
        title: `${cleanLang.toUpperCase()} Subtitles`,
        cues: resolveCuesForLanguage(lang, inputCues, cleanSource, undefined, false, transMap),
        mode: options.subtitleMode || 'target'
      });
    }
  }

  let rawVideoBlob: Blob;
  const localBlob = options.videoFile || options.videoBlob;
  if (localBlob) {
    onProgress?.({ stage: 'fetching_video', percent: 45, detail: 'Reading local video...' });
    rawVideoBlob = localBlob;
  } else if (options.videoId) {
    onProgress?.({ stage: 'fetching_video', percent: 40, detail: 'Downloading YouTube video...' });
    rawVideoBlob = await fetchYouTubeVideoStream(
      options.videoId,
      options.resolution || '720p',
      (pct) => onProgress?.({ stage: 'fetching_video', percent: 40 + Math.round(pct * 0.4), detail: `Downloading (${pct}%)...` }),
      signal
    );
  } else {
    throw new Error('Either videoId or videoBlob/videoFile must be provided for export');
  }

  const isMkv = options.container === 'mkv';
  onProgress?.({
    stage: 'muxing',
    percent: 85,
    detail: isMkv ? 'Muxing MKV soft-subtitles...' : 'Muxing soft-subtitles...'
  });
  let outBlob: Blob;
  if (isMkv) {
    try {
      outBlob = await muxSubtitlesIntoMkv(rawVideoBlob, tracks);
    } catch (mkvErr) {
      console.warn('MKV native remux error, falling back to MP4 container:', mkvErr);
      outBlob = await muxSubtitlesIntoMp4(rawVideoBlob, tracks);
    }
  } else {
    outBlob = await muxSubtitlesIntoMp4(rawVideoBlob, tracks);
  }
  const baseTitle = options.videoTitle ? options.videoTitle.replace(/[/\\?%*:|"<>]/g, '_').trim() : (options.videoId || 'video');
  const ext = isMkv ? 'mkv' : 'mp4';
  const filename = options.videoFilename || `${baseTitle}_subtitled.${ext}`;
  await downloadBlobAsFile(outBlob, filename);
  onProgress?.({ stage: 'completed', percent: 100, detail: 'Export completed!' });
}
