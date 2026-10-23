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
import { resolveYouTubeStreams, type VideoStreamFormat } from './youtubeStreamResolver';

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
const MAX_STREAM_CHUNK_BATCH_BYTES = 32 * 1024 * 1024; // 32 MB chunk consolidation to protect V8 heap
const MAX_SAFE_HEAP_STREAM_BYTES = 300 * 1024 * 1024; // 300 MB threshold for memory protection warnings

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
  const blobParts: BlobPart[] = [];
  let currentBatch: Uint8Array[] = [];
  let currentBatchBytes = 0;
  let loaded = 0;
  let hasLoggedLargeStream = false;

  try {
    while (true) {
      if (signal?.aborted) {
        reader.cancel().catch(() => {});
        throw new DOMException('Aborted', 'AbortError');
      }
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        currentBatch.push(value);
        currentBatchBytes += value.length;
        loaded += value.length;

        // Consolidate every 32 MB to free underlying typed arrays from V8 GC root
        if (currentBatchBytes >= MAX_STREAM_CHUNK_BATCH_BYTES) {
          blobParts.push(new Blob(currentBatch as BlobPart[]));
          currentBatch = [];
          currentBatchBytes = 0;
        }

        if (!hasLoggedLargeStream && loaded >= MAX_SAFE_HEAP_STREAM_BYTES) {
          hasLoggedLargeStream = true;
          console.info(`[videoRemuxService] Stream reached ${(loaded / (1024 * 1024)).toFixed(0)} MB, streaming via memory-protected Blob batches.`);
        }

        onProgress?.(total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 50, loaded, total);
      }
    }
  } finally {
    reader.releaseLock?.();
  }

  if (currentBatch.length > 0) {
    blobParts.push(new Blob(currentBatch as BlobPart[]));
    currentBatch = [];
  }

  onProgress?.(100, loaded, total || loaded);
  return new Blob(blobParts, { type: contentType });
}

async function fetchCdnStreamBlob(
  streamUrl: string,
  onProgress?: (percent: number, loaded: number, total: number) => void,
  signal?: AbortSignal
): Promise<Blob> {
  const isNative = typeof window !== 'undefined' && typeof (window as any).Capacitor !== 'undefined' && Boolean((window as any).Capacitor.isNativePlatform?.());
  if (isNative) {
    // 1. On Native Android, stream directly to Cache using Filesystem.downloadFile to bypass WebView heap
    let progressListener: any = null;
    const tempFilename = `temp_dl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.mp4`;
    let cleanupFileNeeded = false;
    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      cleanupFileNeeded = true;

      let downloadedPath = '';
      try {
        const { registerPlugin } = await import('@capacitor/core');
        const MediaDownload = registerPlugin<any>('MediaDownload');
        const fastRes = await MediaDownload.fastDownload({
          url: streamUrl,
          outputFileName: tempFilename
        });
        if (fastRes?.path) {
          downloadedPath = fastRes.path;
        }
      } catch {
        // Fallback to Filesystem.downloadFile if fastDownload is unavailable
      }

      if (!downloadedPath) {
        progressListener = await Filesystem.addListener('progress', (p: any) => {
          const totalBytes = p.contentLength || 0;
          const loadedBytes = p.bytes || 0;
          const pct = totalBytes > 0 ? Math.min(100, Math.round((loadedBytes / totalBytes) * 100)) : 50;
          onProgress?.(pct, loadedBytes, totalBytes);
        });
        const dlRes = await Filesystem.downloadFile({
          url: streamUrl,
          path: tempFilename,
          directory: Directory.Cache,
          headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14)' },
          progress: true
        });
        await progressListener?.remove();
        progressListener = null;
        downloadedPath = dlRes?.path || '';
      }

      if (downloadedPath) {
        try {
          const stat = await Filesystem.stat({ path: tempFilename, directory: Directory.Cache });
          if (stat.size && stat.size > MAX_SAFE_HEAP_STREAM_BYTES) {
            console.info(`[videoRemuxService] Native video size is ${(stat.size / (1024 * 1024)).toFixed(1)} MB. Loading stream with batched memory protection.`);
          }
        } catch {
          // ignore stat check error
        }

        const { Capacitor } = await import('@capacitor/core');
        const localSrc = Capacitor.convertFileSrc(downloadedPath);
        const localRes = await fetch(localSrc);
        const blob = await consumeStreamResponse(localRes, onProgress, signal);
        Filesystem.deleteFile({ path: tempFilename, directory: Directory.Cache }).catch(() => {});
        cleanupFileNeeded = false;
        onProgress?.(100, blob.size, blob.size);
        return blob;
      }
    } catch (fsDlErr) {
      console.warn('Native Filesystem.downloadFile fallback to stream fetch:', fsDlErr);
    } finally {
      if (progressListener) {
        try {
          await progressListener.remove();
        } catch {}
      }
      if (cleanupFileNeeded) {
        try {
          const { Filesystem, Directory } = await import('@capacitor/filesystem');
          Filesystem.deleteFile({ path: tempFilename, directory: Directory.Cache }).catch(() => {});
        } catch {}
      }
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

  // 3. Direct client stream resolution via VISIONOS/IOS InnerTube & safe opcode decipher
  try {
    const formats: VideoStreamFormat[] = await resolveYouTubeStreams(videoId, signal);

    // 1080p dual-stream (video + audio) handling with hardware MediaMuxer
    if (resolution === '1080p') {
      const video1080 = formats.find(f => f.hasVideo && (f.itag === 299 || f.itag === 137 || f.itag === 399 || f.height === 1080));
      const audioFormat = formats.find(f => f.hasAudio && (f.itag === 140 || f.mimeType?.includes('audio/mp4'))) ||
        formats.find(f => f.hasAudio);

      if (video1080?.url) {
        if (isNative && audioFormat?.url) {
          let tempVideoPath = '';
          let tempAudioPath = '';
          const now = Date.now();
          const tempVideoName = `temp_vid_1080p_${now}.mp4`;
          const tempAudioName = `temp_aud_1080p_${now}.mp4`;
          const outputFileName = `muxed_1080p_${now}.mp4`;

          try {
            const { Filesystem, Directory } = await import('@capacitor/filesystem');
            const { Capacitor, registerPlugin } = await import('@capacitor/core');
            const MediaDownload = registerPlugin<any>('MediaDownload');

            onProgress?.(10, 0, 100);
            let dlVideo: any = null;
            try {
              dlVideo = await MediaDownload.fastDownload({
                url: video1080.url,
                outputFileName: tempVideoName
              });
            } catch {
              dlVideo = await Filesystem.downloadFile({
                url: video1080.url,
                path: tempVideoName,
                directory: Directory.Cache,
                headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14)' }
              });
            }
            tempVideoPath = dlVideo?.path || '';
            if (!tempVideoPath) {
              const u = await Filesystem.getUri({ directory: Directory.Cache, path: tempVideoName });
              tempVideoPath = u.uri.replace(/^file:\/\//, '');
            }

            onProgress?.(55, 55, 100);
            let dlAudio: any = null;
            try {
              dlAudio = await MediaDownload.fastDownload({
                url: audioFormat.url,
                outputFileName: tempAudioName
              });
            } catch {
              dlAudio = await Filesystem.downloadFile({
                url: audioFormat.url,
                path: tempAudioName,
                directory: Directory.Cache,
                headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14)' }
              });
            }
            tempAudioPath = dlAudio?.path || '';
            if (!tempAudioPath) {
              const u = await Filesystem.getUri({ directory: Directory.Cache, path: tempAudioName });
              tempAudioPath = u.uri.replace(/^file:\/\//, '');
            }

            onProgress?.(80, 80, 100);
            const muxRes = await MediaDownload.muxVideoAndAudio({
              videoPath: tempVideoPath,
              audioPath: tempAudioPath,
              outputFileName
            });

            const muxedPath = muxRes?.path || muxRes?.outputPath || muxRes?.filePath || '';
            let finalSrc = muxedPath;
            if (!finalSrc) {
              const u = await Filesystem.getUri({ directory: Directory.Cache, path: outputFileName });
              finalSrc = u.uri;
            }

            // Convert muxed file into webview-accessible URL and stream into Blob
            const localSrc = Capacitor.convertFileSrc(finalSrc);
            const localRes = await fetch(localSrc);
            const blob = await consumeStreamResponse(localRes, onProgress, signal);

            onProgress?.(100, blob.size, blob.size);
            return blob;
          } catch (muxErr) {
            console.warn('[videoRemuxService] Native 1080p muxing failed, falling back to direct video stream:', muxErr);
          } finally {
            // Guarantee cleanup of temporary video, audio, and muxed files from cache
            try {
              const { Filesystem, Directory } = await import('@capacitor/filesystem');
              Filesystem.deleteFile({ path: tempVideoName, directory: Directory.Cache }).catch(() => {});
              Filesystem.deleteFile({ path: tempAudioName, directory: Directory.Cache }).catch(() => {});
              Filesystem.deleteFile({ path: outputFileName, directory: Directory.Cache }).catch(() => {});
            } catch {}
          }
        }

        // Web or fallback: download 1080p video stream directly via fetchCdnStreamBlob
        return await fetchCdnStreamBlob(video1080.url, onProgress, signal);
      }
    }

    // 360p and 720p resolution selection:
    // Prioritize unthrottled, combined audio+video progressive formats (itag 18 / itag 22)
    let sel: VideoStreamFormat | undefined;
    if (resolution === '360p') {
      sel = formats.find(f => f.hasVideo && f.hasAudio && f.itag === 18) ||
        formats.find(f => f.hasVideo && f.itag === 18) ||
        formats.find(f => f.hasVideo && (f.height !== undefined && f.height <= 360));
    } else {
      // 720p: prioritize itag 22 (720p progressive), fallback to itag 18 (360p audio+video), then adaptive 720
      sel = formats.find(f => f.hasVideo && f.hasAudio && f.itag === 22) ||
        formats.find(f => f.hasVideo && f.hasAudio && f.itag === 18) ||
        formats.find(f => f.hasVideo && (f.itag === 22 || f.height === 720));
    }

    if (!sel) {
      sel = formats.find(f => f.hasVideo && f.hasAudio) || formats.find(f => f.hasVideo) || formats[0];
    }

    if (sel?.url) {
      return await fetchCdnStreamBlob(sel.url, onProgress, signal);
    }
  } catch (clientErr: any) {
    if (clientErr?.name === 'AbortError' || signal?.aborted) throw clientErr;
    console.warn('Direct stream resolution failed, trying remote worker fallback:', clientErr);
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
