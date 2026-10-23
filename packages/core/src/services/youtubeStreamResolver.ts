import { smartFetch } from './translationService';

export interface VideoStreamFormat {
  itag: number;
  qualityLabel?: string;
  mimeType: string;
  bitrate?: number;
  contentLength?: string;
  url: string;
  hasAudio: boolean;
  hasVideo: boolean;
  height?: number;
  width?: number;
  fps?: number;
}

export type CipherOp =
  | { type: 'reverse' }
  | { type: 'slice'; arg: number }
  | { type: 'swap'; arg: number };

let cachedVisitorData: string | null = null;
let visitorExpiry = 0;
let cachedCipherOps: CipherOp[] | null = null;
let cipherOpsExpiry = 0;

export function resetStreamResolverCaches(): void {
  cachedVisitorData = null;
  visitorExpiry = 0;
  cachedCipherOps = null;
  cipherOpsExpiry = 0;
}

/**
 * Fetches YouTube visitor data token with 2-hour caching.
 * Primary: sw.js_data array index [0][2][0][0][13]
 * Fallback: watch page regex /"VISITOR_DATA":"([^"]+)"/
 */
export async function fetchVisitorData(signal?: AbortSignal): Promise<string> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const now = Date.now();
  if (cachedVisitorData && now < visitorExpiry) return cachedVisitorData;

  // Tier 1: sw.js_data
  try {
    const res = await smartFetch('https://www.youtube.com/sw.js_data', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' }
    }, 4000);
    if (res.ok) {
      const text = (await res.text()).replace(/^\)\]\}'/, '').trim();
      const parsed = JSON.parse(text);
      const visitor = parsed?.[0]?.[2]?.[0]?.[0]?.[13];
      if (typeof visitor === 'string' && visitor.length > 0) {
        cachedVisitorData = visitor;
        visitorExpiry = now + 2 * 60 * 60 * 1000;
        return visitor;
      }
    }
  } catch { /* Fallback to watch page */ }

  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  // Tier 2: Watch page regex fallback
  try {
    const watchRes = await smartFetch('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    }, 4000);
    if (watchRes.ok) {
      const match = (await watchRes.text()).match(/"VISITOR_DATA":"([^"]+)"/);
      if (match && match[1]) {
        cachedVisitorData = match[1];
        visitorExpiry = now + 2 * 60 * 60 * 1000;
        return match[1];
      }
    }
  } catch { /* Return empty string on failure */ }
  return '';
}

/**
 * Pure deterministic array cipher operation interpreter. Strictly avoids eval / Function execution.
 */
export function applyCipherOperations(signature: string, ops: CipherOp[]): string {
  const chars = signature.split('');
  for (const op of ops) {
    if (op.type === 'reverse') chars.reverse();
    else if (op.type === 'slice') chars.splice(0, op.arg);
    else if (op.type === 'swap') {
      const idx = ((op.arg % chars.length) + chars.length) % chars.length;
      const c = chars[0];
      chars[0] = chars[idx];
      chars[idx] = c;
    }
  }
  return chars.join('');
}

/**
 * Parses player base.js script to extract signature cipher transformation opcodes.
 */
export function parseCipherOpsFromPlayerJs(jsCode: string): CipherOp[] {
  try {
    const funcMatch = jsCode.match(
      /(?:[a-zA-Z0-9_$]+|\bfunction)\s*\(\s*(\w+)\s*\)\s*\{\s*\1\s*=\s*\1\.split\(\s*""\s*\);([\s\S]+?)return\s+\1\.join\(\s*""\s*\)/
    ) || jsCode.match(
      /\b([a-zA-Z0-9_$]+)\s*=\s*function\s*\(\s*(\w+)\s*\)\s*\{\s*\2\s*=\s*\2\.split\(\s*""\s*\);([\s\S]+?)return\s+\2\.join\(\s*""\s*\)/
    );
    if (!funcMatch) return [];

    const body = funcMatch[2] || funcMatch[3] || '';
    const objMatch = body.match(/([a-zA-Z0-9_$]+)(?:\.([a-zA-Z0-9_$]+)|\["([^"]+)"\])\s*\(/);
    if (!objMatch) return [];
    const objName = objMatch[1];

    const objDefMatch = jsCode.match(new RegExp(`(?:var|let|const)?\\s*${objName}\\s*=\\s*\\{([\\s\\S]+?)\\}\\s*;`));
    if (!objDefMatch) return [];

    const methodMap: Record<string, 'reverse' | 'slice' | 'swap'> = {};
    for (const m of objDefMatch[1].matchAll(/([a-zA-Z0-9_$]+)\s*:\s*function\s*\([^)]*\)\s*\{([^}]+)\}/g)) {
      if (m[2].includes('reverse')) methodMap[m[1]] = 'reverse';
      else if (m[2].includes('splice') || m[2].includes('slice')) methodMap[m[1]] = 'slice';
      else if (m[2].includes('var c') || m[2].includes('let c') || m[2].includes('[0]=') || m[2].includes('%')) methodMap[m[1]] = 'swap';
    }

    const callRegex = new RegExp(`${objName}(?:\\.([a-zA-Z0-9_$]+)|\\["([^"]+)"\\])\\s*\\(\\s*\\w+(?:,\\s*(\\d+))?\\s*\\)`, 'g');
    const ops: CipherOp[] = [];
    let callMatch: RegExpExecArray | null;
    while ((callMatch = callRegex.exec(body)) !== null) {
      const methodName = callMatch[1] || callMatch[2];
      const arg = callMatch[3] ? parseInt(callMatch[3], 10) : 0;
      const opType = methodMap[methodName];
      if (opType === 'reverse') ops.push({ type: 'reverse' });
      else if (opType === 'slice') ops.push({ type: 'slice', arg });
      else if (opType === 'swap') ops.push({ type: 'swap', arg });
    }
    return ops;
  } catch {
    return [];
  }
}

/**
 * Solves signatureCipher / cipher query string by applying decipher ops.
 */
export function decipherFormatUrl(cipherStr: string, ops: CipherOp[]): string {
  const params = new URLSearchParams(cipherStr);
  const rawUrl = params.get('url');
  const sig = params.get('s');
  const sp = params.get('sp') || 'sig';
  if (!rawUrl) return '';
  if (!sig) return rawUrl;
  const solvedSig = ops.length > 0 ? applyCipherOperations(sig, ops) : sig;
  const separator = rawUrl.includes('?') ? '&' : '?';
  return `${rawUrl}${separator}${sp}=${encodeURIComponent(solvedSig)}`;
}

async function getOrFetchCipherOps(signal?: AbortSignal): Promise<CipherOp[]> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const now = Date.now();
  if (cachedCipherOps && now < cipherOpsExpiry) return cachedCipherOps;
  try {
    const watchRes = await smartFetch('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    }, 4000);
    if (!watchRes.ok) return [];
    const html = await watchRes.text();
    const match = html.match(/"(?:PLAYER_JS_URL|jsUrl)":"([^"]+)"/) || html.match(/\/s\/player\/[a-zA-Z0-9_\-/]+\/base\.js/);
    if (!match) return [];
    const path = (match[1] || match[0]).replace(/\\/g, '');
    const url = path.startsWith('http') ? path : `https://www.youtube.com${path.startsWith('/') ? '' : '/'}${path}`;
    const jsRes = await smartFetch(url, undefined, 4000);
    if (!jsRes.ok) return [];
    const ops = parseCipherOpsFromPlayerJs(await jsRes.text());
    if (ops.length > 0) {
      cachedCipherOps = ops;
      cipherOpsExpiry = now + 2 * 60 * 60 * 1000;
    }
    return ops;
  } catch {
    return [];
  }
}

interface InnerTubeClientConfig {
  headerName: string;
  version: string;
  userAgent: string;
  client: Record<string, any>;
}

const INNERTUBE_TIERS: InnerTubeClientConfig[] = [
  {
    headerName: '101', version: '1.02',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
    client: {
      clientName: 'VISIONOS', clientVersion: '1.02', deviceMake: 'Apple', deviceModel: 'RealityDevice17,1',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
      osName: 'visionOS', osVersion: '26.5.23O471'
    }
  },
  {
    headerName: '5', version: '19.29.1',
    userAgent: 'com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X; en_US)',
    client: {
      clientName: 'IOS', clientVersion: '19.29.1', deviceMake: 'Apple', deviceModel: 'iPhone16,2',
      userAgent: 'com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X; en_US)',
      osName: 'iOS', osVersion: '17.5.1.21F90'
    }
  },
  {
    headerName: '3', version: '20.10.38',
    userAgent: 'com.google.android.youtube/20.10.38 (Linux; U; Android 14; en_US; Pixel 8 Pro)',
    client: {
      clientName: 'ANDROID', clientVersion: '20.10.38', deviceMake: 'Google', deviceModel: 'Pixel 8 Pro',
      userAgent: 'com.google.android.youtube/20.10.38 (Linux; U; Android 14; en_US; Pixel 8 Pro)',
      osName: 'Android', osVersion: '14'
    }
  }
];

/**
 * Resolves direct playback streams using tiered InnerTube client emulation (VISIONOS -> IOS -> ANDROID).
 */
export async function resolveYouTubeStreams(videoId: string, signal?: AbortSignal): Promise<VideoStreamFormat[]> {
  const cleanId = videoId.match(/(?:v=|youtu\.be\/|^)([a-zA-Z0-9_-]{11})/)?.[1] || videoId.trim();
  if (!cleanId) return [];

  const visitorId = await fetchVisitorData(signal).catch(() => '');
  let cipherOps: CipherOp[] | null = null;

  for (const tier of INNERTUBE_TIERS) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    try {
      const payload: Record<string, any> = {
        context: {
          client: {
            ...tier.client, hl: 'en', timeZone: 'UTC', utcOffsetMinutes: 0,
            ...(visitorId ? { visitorData: visitorId } : {})
          }
        },
        videoId: cleanId,
        playbackContext: { contentPlaybackContext: { html5Preference: 'HTML5_PREF_WANTS' } },
        contentCheckOk: true, racyCheckOk: true
      };

      const res = await smartFetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-YouTube-Client-Name': tier.headerName,
          'X-YouTube-Client-Version': tier.version,
          'Origin': 'https://www.youtube.com',
          'User-Agent': tier.userAgent
        },
        body: JSON.stringify(payload)
      }, 7000);

      if (!res.ok) continue;
      const data = await res.json();
      const streamingData = data?.streamingData;
      if (!streamingData) continue;

      const rawFormats = [...(streamingData.formats || []), ...(streamingData.adaptiveFormats || [])];
      if (rawFormats.length === 0) continue;

      const resolved: VideoStreamFormat[] = [];
      for (const fmt of rawFormats) {
        let streamUrl = fmt.url || '';
        const cipherStr = fmt.signatureCipher || fmt.cipher;
        if (!streamUrl && cipherStr) {
          if (!cipherOps) cipherOps = await getOrFetchCipherOps(signal);
          streamUrl = decipherFormatUrl(cipherStr, cipherOps);
        }
        if (!streamUrl) continue;

        const mime = fmt.mimeType || '';
        const isAudio = mime.startsWith('audio/');
        const isVideo = mime.startsWith('video/');

        resolved.push({
          itag: fmt.itag, qualityLabel: fmt.qualityLabel, mimeType: mime, bitrate: fmt.bitrate,
          contentLength: fmt.contentLength, url: streamUrl,
          hasAudio: isAudio || Boolean(fmt.audioQuality || fmt.audioChannels),
          hasVideo: isVideo, height: fmt.height, width: fmt.width, fps: fmt.fps
        });
      }

      if (resolved.length > 0) {
        // If current tier has no progressive (combined audio+video) formats (e.g. VISIONOS),
        // fetch progressive formats (itag 18/22) from ANDROID tier so 360p/720p download in 1-2s with full audio
        if (!resolved.some(f => f.hasAudio && f.hasVideo) && tier.client.clientName !== 'ANDROID') {
          const androidTier = INNERTUBE_TIERS.find(t => t.client.clientName === 'ANDROID');
          if (androidTier) {
            try {
              const androidPayload = {
                context: {
                  client: {
                    ...androidTier.client, hl: 'en', timeZone: 'UTC', utcOffsetMinutes: 0,
                    ...(visitorId ? { visitorData: visitorId } : {})
                  }
                },
                videoId: cleanId,
                playbackContext: { contentPlaybackContext: { html5Preference: 'HTML5_PREF_WANTS' } },
                contentCheckOk: true, racyCheckOk: true
              };
              const aRes = await smartFetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'X-YouTube-Client-Name': androidTier.headerName,
                  'X-YouTube-Client-Version': androidTier.version,
                  'Origin': 'https://www.youtube.com',
                  'User-Agent': androidTier.userAgent
                },
                body: JSON.stringify(androidPayload)
              }, 4000);
              if (aRes.ok) {
                const aData = await aRes.json();
                const progFormats = aData?.streamingData?.formats || [];
                for (const fmt of progFormats) {
                  let streamUrl = fmt.url || '';
                  const cipherStr = fmt.signatureCipher || fmt.cipher;
                  if (!streamUrl && cipherStr) {
                    if (!cipherOps) cipherOps = await getOrFetchCipherOps(signal);
                    streamUrl = decipherFormatUrl(cipherStr, cipherOps);
                  }
                  if (streamUrl && !resolved.some(r => r.itag === fmt.itag)) {
                    resolved.push({
                      itag: fmt.itag, qualityLabel: fmt.qualityLabel, mimeType: fmt.mimeType || 'video/mp4', bitrate: fmt.bitrate,
                      contentLength: fmt.contentLength, url: streamUrl,
                      hasAudio: true, hasVideo: true, height: fmt.height, width: fmt.width, fps: fmt.fps
                    });
                  }
                }
              }
            } catch { /* Fallback to resolved without android progressive formats */ }
          }
        }
        return resolved;
      }
    } catch { /* Fallback to next tier on failure */ }
  }

  return [];
}
