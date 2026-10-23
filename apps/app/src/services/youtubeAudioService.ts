import { resolveYouTubeStreams, type VideoStreamFormat } from '@lexiduo/core';
import { extractAudioFromVideo, type AudioExtractionProgress } from './audioExtractor';
import { isNativeWhisperAvailable, extractNativeAudio } from './nativeWhisperBridge';

export interface AudioDownloadProgress {
  loaded: number;
  total: number;
  percent: number;
}

export interface DirectAudioStreamResult {
  url: string;
  mimeType: string;
  bitrate?: number;
}

export async function consumeAudioResponse(
  response: Response,
  onProgress?: (progress: AudioDownloadProgress) => void,
  signal?: AbortSignal
): Promise<Blob> {
  const contentType = response.headers.get('content-type') || 'audio/webm';
  const contentLength = response.headers.get('content-length');
  const total = contentLength ? parseInt(contentLength, 10) : 0;

  // Fallback if response.body is not a stream (e.g. in environments where body stream is unavailable)
  if (!response.body) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    const blob = await response.blob();
    onProgress?.({
      loaded: blob.size,
      total: total || blob.size,
      percent: 100,
    });
    return blob;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;

  const onAbort = () => {
    try {
      reader.cancel();
    } catch {
      // Ignore reader cancel errors
    }
  };

  if (signal) {
    if (signal.aborted) {
      onAbort();
      reader.releaseLock?.();
      throw new DOMException('Aborted', 'AbortError');
    }
    signal.addEventListener('abort', onAbort);
  }

  try {
    while (true) {
      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      const { done, value } = await reader.read();
      if (done) break;

      if (value) {
        chunks.push(value);
        loaded += value.length;
        const percent = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
        onProgress?.({
          loaded,
          total: total || loaded,
          percent,
        });
      }
    }
  } finally {
    if (signal) {
      signal.removeEventListener('abort', onAbort);
    }
    reader.releaseLock?.();
  }

  if (total === 0 || loaded >= total) {
    onProgress?.({
      loaded,
      total: loaded,
      percent: 100,
    });
  }

  return new Blob(chunks as BlobPart[], { type: contentType });
}

/**
 * Extracts direct unencrypted audio stream URL from YouTube InnerTube using VISIONOS/IOS client context.
 * Bypasses datacenter rate-limits by executing directly on the client's residential/cellular IP.
 */
export async function extractDirectClientAudioUrl(
  videoId: string,
  signal?: AbortSignal
): Promise<DirectAudioStreamResult> {
  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    throw new Error('Invalid YouTube videoId format');
  }

  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  const formats: VideoStreamFormat[] = await resolveYouTubeStreams(videoId, signal);

  // Audio format hierarchy:
  // 1. itag 140: audio/mp4 (AAC 128kbps) - widest audio decoder compatibility
  // 2. itag 251: audio/webm (Opus 160kbps)
  // 3. other audio format with url
  // 4. itag 18: video/mp4 (360p audio fallback)
  const best = formats.find(f => f.hasAudio && f.itag === 140) ||
    formats.find(f => f.hasAudio && f.itag === 251) ||
    formats.find(f => f.hasAudio) ||
    formats.find(f => f.itag === 18);

  if (!best || !best.url) {
    throw new Error('No direct streamable audio format found in InnerTube response');
  }

  return {
    url: best.url,
    mimeType: best.mimeType || 'audio/mp4',
    bitrate: best.bitrate
  };
}

/**
 * Downloads audio stream directly from Google CDN using extracted direct stream URL.
 */
export async function fetchClientDirectAudioStream(
  videoId: string,
  onProgress?: (progress: AudioDownloadProgress) => void,
  signal?: AbortSignal
): Promise<Blob> {
  const directStream = await extractDirectClientAudioUrl(videoId, signal);

  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  const response = await fetch(directStream.url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 14)',
    },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Direct audio stream download failed (${response.status} ${response.statusText})`);
  }

  return await consumeAudioResponse(response, onProgress, signal);
}

/**
 * Fallback: Downloads audio stream via Cloudflare Worker proxy.
 */
export async function fetchRemoteWorkerAudioBlob(
  videoId: string,
  onProgress?: (progress: AudioDownloadProgress) => void,
  signal?: AbortSignal
): Promise<Blob> {
  const workerBase = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_WORKER_API_BASE_URL) || '';
  if (!workerBase) {
    throw new Error('WORKER_UNCONFIGURED: VITE_WORKER_API_BASE_URL is not configured.');
  }
  const appToken = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_WORKER_APP_TOKEN) || '';
  const url = `${workerBase.replace(/\/+$/, '')}/api/audio?v=${encodeURIComponent(videoId)}`;
  const headers: Record<string, string> = {};
  if (appToken) {
    headers['X-App-Token'] = appToken;
  }
  const response = await fetch(url, { headers, signal });

  if (!response.ok) {
    let errorDetail = '';
    try {
      errorDetail = await response.text();
    } catch {
      // Ignore text decoding failure
    }
    const message = errorDetail ? ` - ${errorDetail}` : '';
    throw new Error(`Failed to fetch audio (${response.status} ${response.statusText})${message}`);
  }

  return await consumeAudioResponse(response, onProgress, signal);
}

/**
 * Downloads audio stream for a given YouTube videoId as a Blob.
 * 1. Web environment (!isNative): prefers local dev proxy (/api/audio).
 * 2. Native Android (isNative): prefers On-Device direct InnerTube extraction (0 proxy bandwidth).
 * 3. Fallback: Cloudflare Worker proxy.
 */
export async function fetchYouTubeAudioBlob(
  videoId: string,
  onProgress?: (progress: AudioDownloadProgress) => void,
  signal?: AbortSignal
): Promise<Blob> {
  const isNative = typeof window !== 'undefined' &&
    typeof (window as any).Capacitor !== 'undefined' &&
    Boolean((window as any).Capacitor.isNativePlatform?.());

  const isWebBrowser = typeof window !== 'undefined' && !isNative;

  // 1. In Web Browser environment (!isNative), try local same-origin dev proxy first (/api/audio)
  if (isWebBrowser) {
    try {
      const localUrl = `/api/audio?v=${encodeURIComponent(videoId)}`;
      const appToken = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_WORKER_APP_TOKEN) || '';
      const headers: Record<string, string> = {};
      if (appToken) headers['X-App-Token'] = appToken;
      const localResponse = await fetch(localUrl, { headers, signal });

      if (localResponse.ok) {
        return await consumeAudioResponse(localResponse, onProgress, signal);
      }
      console.warn(`Local audio proxy returned status ${localResponse.status}, falling back`);
    } catch (err: any) {
      if (err?.name === 'AbortError' || signal?.aborted) {
        throw err;
      }
      console.warn('Local audio proxy failed, falling back:', err);
    }
  }

  // 2. On Native Android, attempt Direct Client InnerTube Extraction first
  if (isNative) {
    try {
      return await fetchClientDirectAudioStream(videoId, onProgress, signal);
    } catch (clientErr: any) {
      if (clientErr?.name === 'AbortError' || signal?.aborted) {
        throw clientErr;
      }
      console.warn('Direct client audio extraction failed, falling back to remote worker:', clientErr);
    }
  }

  // 3. Fallback: Remote Cloudflare Worker
  return await fetchRemoteWorkerAudioBlob(videoId, onProgress, signal);
}

let lastCachedAudioPath: string | null = null;

export function getLastCachedAudioPath(): string | null {
  return lastCachedAudioPath;
}

export function setLastCachedAudioPath(path: string | null): void {
  lastCachedAudioPath = path;
}

/**
 * Downloads audio blob from YouTube worker and extracts 16kHz mono Float32Array PCM samples.
 * Progress callback reports stage and overall percent (0-50% downloading, 50-100% extraction).
 */
export async function downloadAndExtractYouTubeAudio(
  videoId: string,
  onProgress?: (stage: string, percent: number) => void,
  signal?: AbortSignal
): Promise<Float32Array> {
  onProgress?.('downloading', 0);

  // High-performance Native Android path: bypass WebView RAM and AudioContext Float32Array extraction
  if (isNativeWhisperAvailable()) {
    try {
      const audioBlob = await fetchYouTubeAudioBlob(
        videoId,
        (progress) => {
          const percent = Math.min(50, Math.round((progress.percent / 100) * 50));
          onProgress?.('downloading', percent);
        },
        signal
      );

      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      onProgress?.('extracting', 55);

      // Write compressed audio blob to device cache
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const tempFileName = `whisper_audio/yt_${videoId}_${Date.now()}.mp4`;

      const reader = new FileReader();
      const base64Data = await new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          const res = reader.result as string;
          const b64 = res.includes(',') ? res.split(',')[1] : res;
          resolve(b64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(audioBlob);
      });

      await Filesystem.writeFile({
        path: tempFileName,
        data: base64Data,
        directory: Directory.Cache,
        recursive: true
      });

      const uriRes = await Filesystem.getUri({
        path: tempFileName,
        directory: Directory.Cache
      });

      onProgress?.('extracting', 75);

      // Extract 16kHz mono WAV natively with zero WebView RAM impact
      const extRes = await extractNativeAudio(uriRes.uri);
      setLastCachedAudioPath(extRes.wavPath);

      onProgress?.('ready', 100);

      const audioProxy = new Float32Array(16000);
      (audioProxy as any).audioPath = extRes.wavPath;
      (audioProxy as any).cachedAudioPath = extRes.wavPath;
      (audioProxy as any).duration = extRes.durationMs / 1000;
      return audioProxy;
    } catch (nativeErr: any) {
      if (nativeErr?.name === 'AbortError' || signal?.aborted) {
        throw nativeErr;
      }
      console.warn('[youtubeAudioService] Native file extraction failed, falling back to Web Audio:', nativeErr);
    }
  }

  const audioBlob = await fetchYouTubeAudioBlob(
    videoId,
    (progress) => {
      // Scale 0..100% download progress to 0..50% overall progress
      const percent = Math.min(50, Math.round((progress.percent / 100) * 50));
      onProgress?.('downloading', percent);
    },
    signal
  );

  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  // Extract PCM samples from downloaded blob (50% to 100%)
  const pcmData = await extractAudioFromVideo(audioBlob, (progress: AudioExtractionProgress) => {
    const percent = Math.min(100, 50 + Math.round((progress.percent / 100) * 50));
    onProgress?.(progress.stage, percent);
  });

  return pcmData;
}
