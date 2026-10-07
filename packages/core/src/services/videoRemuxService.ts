import type {
  SubtitleCue,
  VideoDownloadResolution,
  VideoDownloadContainer,
  VideoDownloadProgress
} from '../types';
import { smartFetch } from './translationService';
import { batchTranslateCues, getCueTextForExport, resolveCuesForLanguage, type SubtitleExportMode } from './subtitleExportService';
import { muxSubtitlesIntoMkv } from './mkvMuxerService';
export { muxSubtitlesIntoMkv };

export interface SubtitleTrackExport {
  language: string;
  title: string;
  cues: SubtitleCue[];
  mode?: SubtitleExportMode;
}

export interface VideoExportParams {
  videoId?: string; videoTitle?: string; videoBlob?: Blob | File | null; videoFile?: Blob | File | null;
  videoFilename?: string; resolution?: VideoDownloadResolution; container?: VideoDownloadContainer;
  cues?: SubtitleCue[]; initialCues?: SubtitleCue[]; sourceLang?: string; targetLanguages?: string[];
  engine?: 'whisper' | 'gemini' | 'google'; apiKey?: string; subtitleMode?: SubtitleExportMode;
  customTracks?: SubtitleTrackExport[]; onProgress?: (progress: VideoDownloadProgress) => void; signal?: AbortSignal;
}

const ISO_639_2_MAP: Record<string, string> = {
  tr: 'tur', en: 'eng', de: 'deu', es: 'spa', fr: 'fra', it: 'ita',
  pt: 'por', ru: 'rus', zh: 'zho', ja: 'jpn', ko: 'kor', ar: 'ara',
  hi: 'hin', nl: 'nld', pl: 'pol', uk: 'ukr', sv: 'swe', no: 'nor',
  da: 'dan', fi: 'fin', el: 'ell', cs: 'ces', ro: 'ron', hu: 'hun',
  id: 'ind', vi: 'vie', th: 'tha', he: 'heb', fa: 'fas', az: 'aze',
  bg: 'bul', sr: 'srp', sk: 'slk', hr: 'hrv', bn: 'ben'
};

function packIso639Language(lang: string): number {
  const clean = (lang || '').toLowerCase().replace(/^a\./, '').split('-')[0];
  const code = (ISO_639_2_MAP[clean] || (clean.length === 3 ? clean : 'und')).padEnd(3, ' ');
  const c1 = Math.max(1, Math.min(26, code.charCodeAt(0) - 0x60));
  const c2 = Math.max(1, Math.min(26, code.charCodeAt(1) - 0x60));
  const c3 = Math.max(1, Math.min(26, code.charCodeAt(2) - 0x60));
  return ((c1 & 0x1F) << 10) | ((c2 & 0x1F) << 5) | (c3 & 0x1F);
}

function concatBuffers(buffers: Uint8Array[]): Uint8Array {
  const total = buffers.reduce((acc, b) => acc + b.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const b of buffers) { out.set(b, offset); offset += b.length; }
  return out;
}

async function blobToBase64(b: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const res = reader.result as string;
      const base64 = res.includes(',') ? res.split(',')[1] : res;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(b);
  });
}

export async function downloadBlobAsFile(blob: Blob, filename: string): Promise<void> {
  const isNative = typeof window !== 'undefined' && typeof (window as any).Capacitor !== 'undefined' && Boolean((window as any).Capacitor.isNativePlatform?.());
  if (isNative) {
    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const CHUNK_SIZE = 8 * 1024 * 1024; // 8MB chunks to prevent memory pressure

      const writeToLocation = async (targetPath: string, targetDir?: any) => {
        const totalSize = blob.size;
        if (totalSize <= CHUNK_SIZE) {
          const base64Data = await blobToBase64(blob);
          await Filesystem.writeFile({
            path: targetPath,
            data: base64Data,
            directory: targetDir,
            recursive: true
          });
        } else {
          let offset = 0;
          let isFirst = true;
          while (offset < totalSize) {
            const slice = blob.slice(offset, Math.min(totalSize, offset + CHUNK_SIZE));
            const base64Chunk = await blobToBase64(slice);
            if (isFirst) {
              await Filesystem.writeFile({
                path: targetPath,
                data: base64Chunk,
                directory: targetDir,
                recursive: true
              });
              isFirst = false;
            } else {
              await Filesystem.appendFile({
                path: targetPath,
                data: base64Chunk,
                directory: targetDir
              });
            }
            offset += CHUNK_SIZE;
          }
        }
      };

      // 1. Try physical direct write to /storage/emulated/0/Download/ (tablets & Android 11+)
      try {
        await writeToLocation(`/storage/emulated/0/Download/${filename}`);
        return;
      } catch (err1) {
        console.debug('Direct /storage/emulated/0/Download/ write failed, attempting ExternalStorage:', err1);
      }

      // 2. Try ExternalStorage Download/
      try {
        await writeToLocation(`Download/${filename}`, Directory.ExternalStorage);
        return;
      } catch (err2) {
        console.debug('ExternalStorage Download/ write failed, attempting Documents:', err2);
      }

      // 3. Fallback to Documents/
      try {
        await writeToLocation(filename, Directory.Documents);
        return;
      } catch (err3) {
        console.warn('Documents fallback failed, falling back to browser blob download:', err3);
      }
    } catch (fsErr) {
      console.warn('Filesystem import/execution error, falling back to web download:', fsErr);
    }
  }

  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
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

function mp4Box(type: string, payload: Uint8Array): Uint8Array {
  const header = new Uint8Array(8);
  new DataView(header.buffer).setUint32(0, 8 + payload.length);
  for (let i = 0; i < 4; i++) header[4 + i] = type.charCodeAt(i);
  const out = new Uint8Array(8 + payload.length);
  out.set(header, 0);
  out.set(payload, 8);
  return out;
}

function buildTkhd(
  trackId: number,
  duration: number,
  width: number = 640,
  height: number = 360,
  isDefaultTrack: boolean = true
): Uint8Array {
  const buf = new Uint8Array(92);
  const v = new DataView(buf.buffer);
  v.setUint32(0, 92);
  buf[4] = 116; buf[5] = 107; buf[6] = 104; buf[7] = 100; // 'tkhd'
  buf[8] = 0; // version 0
  // flags: track_enabled (1) | track_in_movie (2). Default track is enabled; alternate tracks are in movie but disabled by default
  buf[9] = 0; buf[10] = 0; buf[11] = isDefaultTrack ? 3 : 2;
  v.setUint32(20, trackId);
  v.setUint32(28, Math.round(duration));
  v.setUint16(42, 2); // alternate_group = 2 (groups soft subtitle language tracks together)
  v.setInt32(48, 0x00010000); // 1.0 (16.16)
  v.setInt32(64, 0x00010000); // 1.0 (16.16)
  v.setInt32(80, 0x40000000); // 1.0 (2.30)
  v.setUint32(84, (width & 0xFFFF) << 16); // track width (16.16 fixed point)
  v.setUint32(88, (height & 0xFFFF) << 16); // track height (16.16 fixed point)
  return buf;
}

function buildTx3gBox(width: number = 640, height: number = 360): Uint8Array {
  const buf = new Uint8Array([
    0, 0, 0, 84, 116, 120, 51, 103, // size 84, 'tx3g'
    0, 0, 0, 0, 0, 0, 0, 1, // reserved(6) + data_ref_idx(2)
    0, 0, 0, 0, 1, 255, 0, 0, 0, 0, // flags, h-center(1), v-bottom(255), bgRGBA(0,0,0,0 transparent)
    0, 0, 0, 0, 0, 0, 0, 0, // defaultBox (top, left, bottom, right)
    0, 0, 0, 0, 0, 1, 0, 16, // start/endChar, fontID(1), faceStyle(0), fontSize(16)
    255, 255, 255, 255, // fontColorRGBA (white)
    0, 0, 0, 18, 102, 116, 97, 98, 0, 1, 0, 1, 5, 65, 114, 105, 97, 108, // 'ftab' Arial
    0, 0, 0, 20, 98, 116, 114, 116, 0, 0, 0, 0, 0, 0, 0, 106, 0, 0, 0, 106 // 'btrt'
  ]);
  const v = new DataView(buf.buffer);
  v.setInt16(26, 0); // top
  v.setInt16(28, 0); // left
  v.setInt16(30, Math.min(32767, Math.round(height))); // bottom
  v.setInt16(32, Math.min(32767, Math.round(width))); // right
  return buf;
}

function parseVideoDimensions(moovData: Uint8Array, headerSize: number): { width: number; height: number } {
  const view = new DataView(moovData.buffer, moovData.byteOffset, moovData.byteLength);
  let pos = headerSize;
  const end = moovData.length;

  while (pos + 8 <= end) {
    let sz = view.getUint32(pos);
    let hsz = 8;
    if (sz === 1 && pos + 16 <= end) {
      hsz = 16;
      sz = view.getUint32(pos + 8) * 4294967296 + view.getUint32(pos + 12);
    } else if (sz === 0) {
      sz = end - pos;
    }
    if (sz < hsz || pos + sz > end) break;

    const type = String.fromCharCode(moovData[pos + 4], moovData[pos + 5], moovData[pos + 6], moovData[pos + 7]);
    if (type === 'trak') {
      let trakScan = pos + hsz;
      const trakEnd = pos + sz;
      let isVideo = false;
      let trackWidth = 0;
      let trackHeight = 0;

      while (trakScan + 8 <= trakEnd) {
        let childSz = view.getUint32(trakScan);
        let childHsz = 8;
        if (childSz === 1 && trakScan + 16 <= trakEnd) {
          childHsz = 16;
          childSz = view.getUint32(trakScan + 8) * 4294967296 + view.getUint32(trakScan + 12);
        } else if (childSz === 0) {
          childSz = trakEnd - trakScan;
        }
        if (childSz < childHsz || trakScan + childSz > trakEnd) break;

        const childType = String.fromCharCode(moovData[trakScan + 4], moovData[trakScan + 5], moovData[trakScan + 6], moovData[trakScan + 7]);
        if (childType === 'tkhd' && childSz >= 92) {
          trackWidth = view.getUint32(trakScan + 84) >>> 16;
          trackHeight = view.getUint32(trakScan + 88) >>> 16;
        } else if (childType === 'mdia') {
          let mdiaScan = trakScan + childHsz;
          const mdiaEnd = trakScan + childSz;
          while (mdiaScan + 8 <= mdiaEnd) {
            let mSz = view.getUint32(mdiaScan);
            if (mSz < 8 || mdiaScan + mSz > mdiaEnd) break;
            const mType = String.fromCharCode(moovData[mdiaScan + 4], moovData[mdiaScan + 5], moovData[mdiaScan + 6], moovData[mdiaScan + 7]);
            if (mType === 'hdlr' && mSz >= 20) {
              const handlerType = String.fromCharCode(moovData[mdiaScan + 16], moovData[mdiaScan + 17], moovData[mdiaScan + 18], moovData[mdiaScan + 19]);
              if (handlerType === 'vide') {
                isVideo = true;
              }
            }
            mdiaScan += mSz;
          }
        }
        trakScan += childSz;
      }

      if (isVideo && trackWidth > 0 && trackHeight > 0) {
        return { width: trackWidth, height: trackHeight };
      }
    }
    pos += sz;
  }
  return { width: 1280, height: 720 };
}

function updateOriginalChunkOffsets(
  view: DataView,
  bytes: Uint8Array,
  start: number,
  end: number,
  adjustOff: (off: number) => number,
  moovOffset: number,
  moovSize: number
): void {
  let pos = start;
  const moovOffBig = BigInt(moovOffset);
  const moovSizeBig = BigInt(moovSize);

  while (pos + 8 <= end) {
    let bsize = view.getUint32(pos);
    let bheader = 8;
    if (bsize === 1) {
      bheader = 16;
      const hi = view.getUint32(pos + 8);
      const lo = view.getUint32(pos + 12);
      bsize = hi * 4294967296 + lo;
    } else if (bsize === 0) {
      bsize = end - pos;
    }
    if (bsize < bheader || pos + bsize > end) break;

    const btype = String.fromCharCode(bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7]);

    if (btype === 'stco') {
      const count = view.getUint32(pos + 12);
      for (let i = 0; i < count; i++) {
        const offPos = pos + 16 + i * 4;
        if (offPos + 4 <= pos + bsize) {
          const oldOff = view.getUint32(offPos);
          view.setUint32(offPos, adjustOff(oldOff));
        }
      }
    } else if (btype === 'co64') {
      const count = view.getUint32(pos + 12);
      for (let i = 0; i < count; i++) {
        const offPos = pos + 16 + i * 8;
        if (offPos + 8 <= pos + bsize) {
          const oldOff = view.getBigUint64(offPos);
          const newOff = oldOff > moovOffBig ? oldOff - moovSizeBig : oldOff;
          view.setBigUint64(offPos, newOff);
        }
      }
    } else if (['trak', 'mdia', 'minf', 'stbl', 'edts'].includes(btype)) {
      updateOriginalChunkOffsets(view, bytes, pos + bheader, pos + bsize, adjustOff, moovOffset, moovSize);
    }

    pos += bsize;
  }
}

export async function muxSubtitlesIntoMp4(videoBlob: Blob, tracks: SubtitleTrackExport[]): Promise<Blob> {
  const buf = new Uint8Array(await videoBlob.arrayBuffer());
  let offset = 0;
  let moovBox: { offset: number; size: number; headerSize: number; data: Uint8Array } | null = null;
  const nonMoovBoxes: Uint8Array[] = [];

  while (offset + 8 <= buf.length) {
    let size = new DataView(buf.buffer, buf.byteOffset + offset, 4).getUint32(0);
    const type = String.fromCharCode(...buf.subarray(offset + 4, offset + 8));
    let headerSize = 8;
    if (size === 1) {
      headerSize = 16;
      const hi = new DataView(buf.buffer, buf.byteOffset + offset + 8, 4).getUint32(0);
      const lo = new DataView(buf.buffer, buf.byteOffset + offset + 12, 4).getUint32(0);
      size = hi * 4294967296 + lo;
    } else if (size === 0) {
      size = buf.length - offset;
    }
    if (size < headerSize || offset + size > buf.length) break;

    const boxBytes = buf.subarray(offset, offset + size);
    if (type === 'moov') {
      moovBox = { offset, size, headerSize, data: boxBytes };
    } else {
      nonMoovBoxes.push(boxBytes);
    }
    offset += size;
  }
  if (!moovBox || tracks.length === 0) return videoBlob;

  const baseFile = concatBuffers(nonMoovBoxes);
  const subMdatStart = baseFile.length;

  const moovData = moovBox.data.slice();
  const moovView = new DataView(moovData.buffer, moovData.byteOffset, moovData.byteLength);
  const moovOffset = moovBox.offset;
  const moovSize = moovBox.size;
  const adjustOff = (oldOff: number) => (oldOff > moovOffset ? oldOff - moovSize : oldOff);

  const moovHeaderSize = moovBox.headerSize;
  updateOriginalChunkOffsets(moovView, moovData, moovHeaderSize, moovData.length, adjustOff, moovOffset, moovSize);
  const { width: videoWidth, height: videoHeight } = parseVideoDimensions(moovData, moovHeaderSize);

  let mvhdPos = -1;
  let scan = moovHeaderSize;
  while (scan + 8 <= moovData.length) {
    const sz = moovView.getUint32(scan);
    const type = String.fromCharCode(moovData[scan + 4], moovData[scan + 5], moovData[scan + 6], moovData[scan + 7]);
    if (type === 'mvhd') { mvhdPos = scan; break; }
    if (sz < 8 || scan + sz > moovData.length) break;
    scan += sz;
  }

  let movieTimescale = 1000;
  let movieDuration = 60000;
  let nextTrackId = 3;
  if (mvhdPos !== -1) {
    const v = moovData[mvhdPos + 8];
    if (v === 0) {
      movieTimescale = moovView.getUint32(mvhdPos + 8 + 12) || 1000;
      movieDuration = moovView.getUint32(mvhdPos + 8 + 16) || 60000;
      nextTrackId = moovView.getUint32(mvhdPos + 8 + 96) || 3;
    } else {
      movieTimescale = moovView.getUint32(mvhdPos + 8 + 20) || 1000;
      movieDuration = Number(moovView.getBigUint64(mvhdPos + 8 + 24)) || 60000;
      nextTrackId = moovView.getUint32(mvhdPos + 8 + 108) || 3;
    }
  }
  const movieDurationSec = movieDuration / movieTimescale;

  let subPayloadOffset = 0;
  const allPayloads: Uint8Array[] = [];
  const newTraks: Uint8Array[] = [];
  let isFirstSubTrack = true;

  for (const track of tracks) {
    const trackId = nextTrackId++;
    const sortedCues = [...track.cues].sort((a, b) => a.start - b.start);
    let curTimeSec = 0;
    const samples: { durationMs: number; size: number; offset: number }[] = [];

    for (const cue of sortedCues) {
      const rawStart = Number.isFinite(cue.start) && cue.start >= 0 ? cue.start : curTimeSec;
      const cueStart = Math.max(curTimeSec, rawStart);
      const rawEnd = Number.isFinite(cue.end) && cue.end > cueStart ? cue.end : cueStart + 2.0;
      const cueEnd = Math.max(cueStart + 0.1, rawEnd);

      if (cueStart > curTimeSec) {
        const gapMs = Math.round((cueStart - curTimeSec) * 1000);
        if (gapMs > 0) {
          const off = subMdatStart + 8 + subPayloadOffset;
          allPayloads.push(new Uint8Array([0, 0]));
          samples.push({ durationMs: gapMs, size: 2, offset: off });
          subPayloadOffset += 2;
        }
      }

      const durMs = Math.max(100, Math.round((cueEnd - cueStart) * 1000));
      const text = getCueTextForExport(cue, track.mode || 'target');
      const utf8 = new TextEncoder().encode(text);
      const p = new Uint8Array(2 + utf8.length);
      p[0] = (utf8.length >> 8) & 0xFF;
      p[1] = utf8.length & 0xFF;
      p.set(utf8, 2);

      const off = subMdatStart + 8 + subPayloadOffset;
      allPayloads.push(p);
      samples.push({ durationMs: durMs, size: p.length, offset: off });
      subPayloadOffset += p.length;
      curTimeSec = cueStart + (durMs / 1000);
    }

    if (curTimeSec < movieDurationSec) {
      const trailMs = Math.round((movieDurationSec - curTimeSec) * 1000);
      if (trailMs > 0) {
        const off = subMdatStart + 8 + subPayloadOffset;
        allPayloads.push(new Uint8Array([0, 0]));
        samples.push({ durationMs: trailMs, size: 2, offset: off });
        subPayloadOffset += 2;
      }
    }

    const tkhd = buildTkhd(trackId, movieDuration, videoWidth, videoHeight, isFirstSubTrack);
    isFirstSubTrack = false;

    const mdhd = new Uint8Array(24);
    const mv = new DataView(mdhd.buffer);
    mv.setUint32(12, 1000);
    mv.setUint32(16, samples.reduce((a, s) => a + s.durationMs, 0));
    mv.setUint16(20, packIso639Language(track.language));

    const hdlrPre = new Uint8Array([
      0, 0, 0, 0, 0, 0, 0, 0,
      115, 98, 116, 108,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    ]);
    const hdlr = mp4Box('hdlr', concatBuffers([hdlrPre, new TextEncoder().encode(`${track.title}\0`)]));

    const dref = mp4Box('dref', concatBuffers([
      new Uint8Array([0, 0, 0, 0, 0, 0, 0, 1]),
      mp4Box('url ', new Uint8Array([0, 0, 0, 1]))
    ]));

    const stsd = mp4Box('stsd', concatBuffers([
      new Uint8Array([0, 0, 0, 0, 0, 0, 0, 1]),
      buildTx3gBox(videoWidth, videoHeight)
    ]));

    const stts = new Uint8Array(8 + samples.length * 8);
    const sttsv = new DataView(stts.buffer);
    sttsv.setUint32(4, samples.length);
    samples.forEach((s, i) => { sttsv.setUint32(8 + i * 8, 1); sttsv.setUint32(12 + i * 8, s.durationMs); });

    const stsc = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
    const stsz = new Uint8Array(12 + samples.length * 4);
    const stszv = new DataView(stsz.buffer);
    stszv.setUint32(8, samples.length);
    samples.forEach((s, i) => stszv.setUint32(12 + i * 4, s.size));

    const stco = new Uint8Array(8 + samples.length * 4);
    const stcov = new DataView(stco.buffer);
    stcov.setUint32(4, samples.length);
    samples.forEach((s, i) => stcov.setUint32(8 + i * 4, s.offset));

    const stbl = mp4Box('stbl', concatBuffers([stsd, mp4Box('stts', stts), mp4Box('stsc', stsc), mp4Box('stsz', stsz), mp4Box('stco', stco)]));
    const minf = mp4Box('minf', concatBuffers([mp4Box('nmhd', new Uint8Array(4)), mp4Box('dinf', concatBuffers([dref])), stbl]));
    const udta = mp4Box('udta', mp4Box('name', new TextEncoder().encode(`${track.title}\0`)));
    newTraks.push(mp4Box('trak', concatBuffers([tkhd, mp4Box('mdia', concatBuffers([mp4Box('mdhd', mdhd), hdlr, minf])), udta])));
  }

  if (mvhdPos !== -1) {
    const v = moovData[mvhdPos + 8];
    if (v === 0) moovView.setUint32(mvhdPos + 8 + 96, nextTrackId);
    else moovView.setUint32(mvhdPos + 8 + 108, nextTrackId);
  }

  const updatedMoovPayload = concatBuffers([moovData.subarray(moovHeaderSize), ...newTraks]);
  return new Blob([
    baseFile as BlobPart,
    mp4Box('mdat', concatBuffers(allPayloads)) as BlobPart,
    mp4Box('moov', updatedMoovPayload) as BlobPart
  ], { type: 'video/mp4' });
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
