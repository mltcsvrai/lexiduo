import type { SubtitleCue, VideoInfo } from '../types';
export type { SubtitleCue, VideoInfo };
import { getCachedTranscript, cacheTranscript } from './cacheService';
import { auditAndRepairCues, isCueUntranslated } from './subtitleAuditor';
import { aggregateSentenceCues, distributeTargetTextToWindows } from './sentenceSegmentation';
import { smartFetch, translateTextSecure } from './translationService';
export { smartFetch, translateTextSecure };
import { GEMINI_MODEL_HIERARCHY } from './geminiService';
import { useAppStore } from '../store/useAppStore';



export function extractYouTubeId(urlOrId: string): string {
  if (!urlOrId || typeof urlOrId !== 'string') return '';
  const clean = urlOrId.trim();

  // 1. Direct 11-char YouTube video ID check
  if (/^[a-zA-Z0-9_-]{11}$/.test(clean)) {
    return clean;
  }

  // 2. Comprehensive pattern for all YouTube URL variants (including inside sentence/share texts)
  // Supports: youtu.be, watch?v=, watch?feature=share&v=, shorts/, live/, embed/, v/
  const regExp = /(?:https?:\/\/)?(?:www\.|m\.|music\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  const match = clean.match(regExp);
  if (match && match[1]) {
    return match[1];
  }

  // 3. Fallback: if single word with length 11 without slash or whitespace
  if (clean.length === 11 && !clean.includes('/') && !clean.includes(' ')) {
    return clean;
  }

  return '';
}

export const POPULAR_VIDEOS: VideoInfo[] = [
  {
    id: '0VBIICYDjPo',
    title: '6 AIs WORK TOGETHER to Build A Programming Language',
    channel: 'WeeklyHow',
    thumbnail: 'https://img.youtube.com/vi/0VBIICYDjPo/hqdefault.jpg',
    duration: '9:11'
  },
  {
    id: 'L_LUpnjgPso',
    title: 'How Artificial Intelligence Works',
    channel: 'TechExplained',
    thumbnail: 'https://img.youtube.com/vi/L_LUpnjgPso/hqdefault.jpg',
    duration: '10:15'
  },
  {
    id: 'fJ9rUzIMcZQ',
    title: 'Queen – Bohemian Rhapsody',
    channel: 'Queen Official',
    thumbnail: 'https://img.youtube.com/vi/fJ9rUzIMcZQ/hqdefault.jpg',
    duration: '6:00'
  }
];


export async function fetchVideoSubtitles(
  videoId: string,
  sourceLang: string = 'auto',
  targetLang: string = 'tr',
  apiKey?: string,
  onFastCuesReady?: (cues: SubtitleCue[]) => void
): Promise<{ cues: SubtitleCue[]; isAiTranslated: boolean }> {
  
  // 0. Check Cache First & Audit for Poisoned/Untranslated Cues (only if targetLang is chosen)
  if (targetLang && targetLang.trim().length > 0) {
    const cached = await getCachedTranscript(videoId, sourceLang, targetLang);
    if (cached && cached.cues && cached.cues.length > 0) {
      if (cached.detectedLang) {
        useAppStore.getState().setDetectedSourceLang(cached.detectedLang);
      }
      const hasUntranslated = cached.cues.some(c => isCueUntranslated(c, sourceLang, targetLang));
      if (!hasUntranslated) {
        if (onFastCuesReady) onFastCuesReady(cached.cues);
        return cached;
      }

      // Immediately present existing cues so UI isn't empty, then repair in background
      if (onFastCuesReady) onFastCuesReady(cached.cues);

      try {
        const { repairedCues, repairedCount } = await auditAndRepairCues(
          cached.cues,
          sourceLang,
          targetLang,
          translateTextSecure,
          (patched) => {
            if (onFastCuesReady) onFastCuesReady(patched);
          }
        );
        if (repairedCount > 0) {
          await cacheTranscript(videoId, sourceLang, targetLang, repairedCues, true, cached.detectedLang);
          if (onFastCuesReady) onFastCuesReady(repairedCues);
          return { cues: repairedCues, isAiTranslated: true };
        }
      } catch (e) {
        console.warn('Cached cues repair notice:', e);
      }

      return cached;
    }
  }

  let rawCues: { id: string; start: number; end: number; text: string }[] = [];
  let detectedLang = (sourceLang === 'auto' ? 'en' : sourceLang).replace(/^a\./, '').split('-')[0];

  // 1. In Web Browser Environment (!isNative), try local same-origin dev proxy (/api/transcript)
  const isNative = typeof window !== 'undefined' && typeof (window as any).Capacitor !== 'undefined' && Boolean((window as any).Capacitor.isNativePlatform?.());
  if (!isNative && typeof window !== 'undefined') {
    try {
      const res = await smartFetch(
        `/api/transcript?v=${encodeURIComponent(videoId)}&lang=${encodeURIComponent(sourceLang)}`,
        undefined,
        10000
      );
      if (res.ok) {
        const data = await res.json();
        if (data.cues && Array.isArray(data.cues) && data.cues.length > 0) {
          rawCues = data.cues;
          detectedLang = (data.lang || 'en').replace(/^a\./, '').split('-')[0];
        }
      }
    } catch {
      // Local dev proxy not available or in standalone web build
    }
  }

  // 2. Direct Client InnerTube Fetching (Primary on Android APK / Capacitor native)
  if (rawCues.length === 0) {
    try {
      const clientRes = await fetchClientInnerTube(videoId, sourceLang);
      if (clientRes.cues.length > 0) {
        rawCues = clientRes.cues;
        detectedLang = (clientRes.lang || 'en').replace(/^a\./, '').split('-')[0];
      }
    } catch (err) {
      console.warn('Client InnerTube fetch error:', err);
    }
  }

  // 3. Fallback: Optional Cloudflare Worker Endpoint (if configured)
  const metaEnv = typeof import.meta !== 'undefined' ? (import.meta as any).env : undefined;
  const workerBase = metaEnv?.VITE_WORKER_API_BASE_URL || '';
  if (rawCues.length === 0 && workerBase) {
    try {
      const workerAppToken = metaEnv?.VITE_WORKER_APP_TOKEN || '';
      const headers: Record<string, string> = {};
      if (workerAppToken) {
        headers['X-App-Token'] = workerAppToken;
      }
      const res = await smartFetch(
        `${workerBase.replace(/\/+$/, '')}/api/transcript?v=${encodeURIComponent(videoId)}&lang=${encodeURIComponent(sourceLang)}`,
        { headers },
        2000
      );
      if (res.ok) {
        const data = await res.json();
        if (data.cues && Array.isArray(data.cues) && data.cues.length > 0) {
          rawCues = data.cues;
          detectedLang = (data.lang || 'en').replace(/^a\./, '').split('-')[0];
        }
      }
    } catch {
      // Worker blocked or offline
    }
  }

  // 3. Fallback: Public Timedtext CORS Proxies
  if (rawCues.length === 0) {
    const proxyUrls = sourceLang === 'auto' 
      ? [
          `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=srv3`)}`,
          `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://www.youtube.com/api/timedtext?v=${videoId}&lang=tr&fmt=srv3`)}`,
          `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://www.youtube.com/api/timedtext?v=${videoId}&lang=de&fmt=srv3`)}`
        ]
      : [
          `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://www.youtube.com/api/timedtext?v=${videoId}&lang=${sourceLang}&fmt=srv3`)}`
        ];

    for (const url of proxyUrls) {
      try {
        const res = await smartFetch(url, undefined, 3000);
        if (res.ok) {
          const xml = await res.text();
          const parsed = parseTimedTextXml(xml);
          if (parsed.length > 0) {
            rawCues = parsed;
            const langMatch = url.match(/lang=([^&]+)/);
            detectedLang = langMatch ? langMatch[1].replace(/^a\./, '').split('-')[0] : detectedLang;
            break;
          }
        }
      } catch (e) {
        console.warn('Proxy fetch error:', e);
      }
    }
  }

  if (rawCues.length === 0) {
    return { cues: [], isAiTranslated: false };
  }

  // Record detected video language in store for accurate bidirectional word lookup
  useAppStore.getState().setDetectedSourceLang(detectedLang);

  // Sort and clamp raw cues to guarantee strict non-overlapping timestamps
  rawCues.sort((a, b) => a.start - b.start);
  for (let i = 0; i < rawCues.length - 1; i++) {
    if (rawCues[i].end > rawCues[i + 1].start) {
      rawCues[i].end = rawCues[i + 1].start;
    }
  }

  // Initial raw cues
  const isSameLang = detectedLang === targetLang;
  const initialCues: SubtitleCue[] = rawCues.map(c => ({
    id: c.id,
    start: c.start,
    end: c.end,
    sourceText: c.text,
    targetText: isSameLang ? c.text : ''
  }));

  // Immediately present cues to UI so user doesn't wait with an empty screen
  if (onFastCuesReady) {
    onFastCuesReady(initialCues);
  }

  // If target language is not chosen yet, return raw cues without attempting translation
  if (!targetLang || targetLang.trim().length === 0) {
    return { cues: initialCues, isAiTranslated: false };
  }

  // If already in target language (e.g. video is in Turkish and target is Turkish), no translation needed
  if (isSameLang) {
    await cacheTranscript(videoId, sourceLang, targetLang, initialCues, false, detectedLang);
    return { cues: initialCues, isAiTranslated: false };
  }

  // Set translating status for target language
  useAppStore.getState().setIsTranslatingTarget(true);

  let fastCues: SubtitleCue[] = [];
  try {
    // FAST PATH: Translate sentence groups progressively so BOTH exist immediately
    fastCues = await translateFastParallel(initialCues, detectedLang, targetLang, (progressiveCues) => {
      if (onFastCuesReady) {
        onFastCuesReady(progressiveCues);
      }
    });
    
    if (onFastCuesReady) {
      onFastCuesReady(fastCues);
    }

    // Internal Audit & Gap Repair Engine: Detect untranslated lines and repair them in-place
    try {
      const auditResult = await auditAndRepairCues(
        fastCues,
        detectedLang,
        targetLang,
        translateTextSecure,
        (patchedCues) => {
          if (onFastCuesReady) onFastCuesReady(patchedCues);
        }
      );
      if (auditResult.repairedCount > 0) {
        fastCues = auditResult.repairedCues;
        if (onFastCuesReady) onFastCuesReady(fastCues);
      }
    } catch (auditErr) {
      console.warn('Subtitle gap repair notice:', auditErr);
    }
  } finally {
    useAppStore.getState().setIsTranslatingTarget(false);
  }

  // Safe Gemini AI translation (never crashes or hangs if API key is invalid)
  if (apiKey && apiKey.trim().length > 10) {
    try {
      const aiCues = await translateWithGeminiAI(fastCues, detectedLang, targetLang, apiKey.trim());
      if (aiCues && aiCues.length > 0) {
        // Also audit AI output for any dropped/untranslated cues
        const finalAudit = await auditAndRepairCues(aiCues, detectedLang, targetLang, translateTextSecure);
        const resolvedCues = finalAudit.repairedCues;
        await cacheTranscript(videoId, sourceLang, targetLang, resolvedCues, true, detectedLang);
        return { cues: resolvedCues, isAiTranslated: true };
      }
    } catch (err) {
      console.warn('Gemini AI translation error (falling back to fast cues):', err);
    }
  }

  await cacheTranscript(videoId, sourceLang, targetLang, fastCues, true, detectedLang);
  return { cues: fastCues, isAiTranslated: true };
}


/**
 * Intelligently select the best caption track from YouTube InnerTube renderer data.
 * Prioritizes:
 * 1. Explicit user language choice (if sourceLang !== 'auto')
 * 2. YouTube official default caption track index (audioTracks[defaultAudioTrackIndex].defaultCaptionTrackIndex)
 * 3. YouTube default translation source track index (defaultTranslationSourceTrackIndices[0])
 * 4. Original audio language from audioTrackId metadata
 * 5. ASR track native language deduction (ASR is only generated in the true spoken language)
 * 6. Fallback to any creator manual subtitle or first track
 */
export function selectCaptionTrack(captionTracks: any[], renderer: any, sourceLang: string = 'auto'): any {
  if (!captionTracks || captionTracks.length === 0) return null;

  // 1. Explicit source language requested by user
  if (sourceLang && sourceLang !== 'auto') {
    const cleanSource = sourceLang.replace(/^a\./, '').split('-')[0].toLowerCase();
    const explicit = captionTracks.find((t: any) => 
      t.languageCode === sourceLang || 
      t.languageCode?.toLowerCase() === cleanSource ||
      t.languageCode?.toLowerCase().startsWith(cleanSource)
    );
    if (explicit) return explicit;
  }

  // 2. YouTube official defaultCaptionTrackIndex from default audio track
  const defAudioIdx = typeof renderer?.defaultAudioTrackIndex === 'number' ? renderer.defaultAudioTrackIndex : 0;
  const defaultAudio = renderer?.audioTracks?.[defAudioIdx];
  const defCaptionIdx = defaultAudio?.defaultCaptionTrackIndex;

  if (typeof defCaptionIdx === 'number' && captionTracks[defCaptionIdx]) {
    return captionTracks[defCaptionIdx];
  }

  // 3. YouTube defaultTranslationSourceTrackIndices (base track for auto-translations)
  if (Array.isArray(renderer?.defaultTranslationSourceTrackIndices) && renderer.defaultTranslationSourceTrackIndices.length > 0) {
    const srcIdx = renderer.defaultTranslationSourceTrackIndices[0];
    if (typeof srcIdx === 'number' && captionTracks[srcIdx]) {
      return captionTracks[srcIdx];
    }
  }

  // 4. Auto mode: Detect original audio language from audioTracks metadata if audioTrackId is provided
  if (defaultAudio?.audioTrackId) {
    const originalAudioLang = defaultAudio.audioTrackId.split('.')[0].split('-')[0].toLowerCase();
    if (originalAudioLang) {
      const manualTrack = captionTracks.find((t: any) => 
        (!t.kind || t.kind !== 'asr') && 
        (t.languageCode?.toLowerCase() === originalAudioLang || t.languageCode?.toLowerCase().startsWith(originalAudioLang))
      );
      const asrTrack = captionTracks.find((t: any) => 
        (t.languageCode?.toLowerCase() === originalAudioLang || t.languageCode?.toLowerCase().startsWith(originalAudioLang))
      );
      if (manualTrack || asrTrack) return manualTrack || asrTrack;
    }
  }

  // 5. ASR native language deduction: YouTube ONLY generates ASR in the true spoken audio language!
  // If an ASR track exists (e.g. languageCode 'en'), we know the video is spoken in that language.
  // We prefer creator manual subtitle in that same language, else the ASR track itself.
  const asrTrack = captionTracks.find((t: any) => t.kind === 'asr');
  if (asrTrack?.languageCode) {
    const nativeAsrLang = asrTrack.languageCode.replace(/^a\./, '').split('-')[0].toLowerCase();
    const matchingManual = captionTracks.find((t: any) => 
      (!t.kind || t.kind !== 'asr') && 
      (t.languageCode?.toLowerCase() === nativeAsrLang || t.languageCode?.toLowerCase().startsWith(nativeAsrLang))
    );
    if (matchingManual || asrTrack) return matchingManual || asrTrack;
  }

  // 6. Fallback: Any creator manual subtitle if available, otherwise first track
  const anyManual = captionTracks.find((t: any) => !t.kind || t.kind !== 'asr');
  return anyManual || captionTracks[0];
}


async function fetchClientInnerTube(videoId: string, sourceLang: string = 'auto'): Promise<{ cues: any[]; lang: string }> {
  const watchRes = await smartFetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
  }, 10000);
  const html = await watchRes.text();

  const keyMatch = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
  const apiKey = keyMatch ? keyMatch[1] : '';

  if (!apiKey) return { cues: [], lang: 'en' };

  const playerRes = await smartFetch(`https://www.youtube.com/youtubei/v1/player?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
    body: JSON.stringify({
      context: { client: { clientName: 'ANDROID', clientVersion: '20.10.38' } },
      videoId
    })
  }, 10000);

  const playerData = await playerRes.json();
  const renderer = playerData?.captions?.playerCaptionsTracklistRenderer;
  const captionTracks = renderer?.captionTracks || [];

  const selectedTrack = selectCaptionTrack(captionTracks, renderer, sourceLang);
  if (!selectedTrack || !selectedTrack.baseUrl) return { cues: [], lang: 'en' };

  const trackLang = selectedTrack.languageCode?.replace(/^a\./, '').split('-')[0] || 'en';
  let baseUrl = selectedTrack.baseUrl;

  if (!baseUrl.includes('&fmt=')) {
    baseUrl += '&fmt=srv3';
  }

  const xmlRes = await smartFetch(baseUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
  }, 10000);
  const xmlData = await xmlRes.text();

  const lines = parseTimedTextXml(xmlData);
  return { cues: lines, lang: trackLang };
}

function parseTimedTextXml(xmlData: string): any[] {
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
      lines.push({ id: String(idx++), start: startMs / 1000, end: (startMs + durMs) / 1000, text });
    }
  }

  if (lines.length === 0) {
    const textRegex = /<text\s+start="([^"]+)"\s+dur="([^"]+)"[^>]*>([\s\S]*?)<\/text>/g;
    while ((m = textRegex.exec(xmlData)) !== null) {
      const start = parseFloat(m[1]);
      const dur = parseFloat(m[2]);
      const text = m[3].replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\n/g, ' ').trim();
      if (text) {
        lines.push({ id: String(idx++), start, end: start + dur, text });
      }
    }
  }

  // Sort by start time and clamp overlapping end times
  lines.sort((a, b) => a.start - b.start);
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i].end > lines[i + 1].start) {
      lines[i].end = lines[i + 1].start;
    }
  }

  return lines;
}


// Helper to delay between rapid API calls
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function translateFastParallel(
  cues: SubtitleCue[],
  sourceLang: string,
  targetLang: string,
  onProgressCues?: (cues: SubtitleCue[]) => void
): Promise<SubtitleCue[]> {
  const cleanSource = (sourceLang || 'auto').replace(/^a\./, '').split('-')[0];
  const cleanTarget = (targetLang || 'tr').replace(/^a\./, '').split('-')[0];
  if (!cues || cues.length === 0) return [];
  if (cleanSource !== 'auto' && cleanSource === cleanTarget) {
    return cues.map(c => ({
      ...c,
      targetText: c.sourceText
    }));
  }

  // 1. Group fragmented ASR cues into meaningful sentences
  const sentenceGroups = aggregateSentenceCues(cues);
  const batchSize = 12;
  const processedGroups: { group: any; targetText: string }[] = [];
  const disableChunking = Boolean(useAppStore.getState().autoPauseAfterSubtitle);

  const emitProgressSnapshot = () => {
    if (!onProgressCues) return;
    try {
      const snapshot: SubtitleCue[] = [];
      for (const item of processedGroups) {
        snapshot.push(...distributeTargetTextToWindows(item.group, item.targetText, { disableChunking }));
      }
      for (let k = processedGroups.length; k < sentenceGroups.length; k++) {
        snapshot.push(...distributeTargetTextToWindows(sentenceGroups[k], '', { disableChunking }));
      }
      onProgressCues(snapshot);
    } catch (e) {
      console.warn('[translateFastParallel] Progress snapshot warning:', e);
    }
  };

  for (let i = 0; i < sentenceGroups.length; i += batchSize) {
    const chunk = sentenceGroups.slice(i, i + batchSize);
    
    // Tagged index tokens to eliminate line-splitting and merger ambiguities
    const taggedText = chunk
      .map((g, idx) => `⟦${idx}⟧ ${(g.fullSourceText || '').replace(/\n+/g, ' ').trim()}`)
      .join('\n');

    let translatedSentences: string[] = [];

    try {
      const translatedCombined = await translateTextSecure(taggedText, cleanSource, cleanTarget);
      if (translatedCombined && translatedCombined.includes('⟦')) {
        const regex = /⟦(\d+)⟧\s*([^⟦]*)/g;
        let match: RegExpExecArray | null;
        const parsedMap = new Map<number, string>();
        while ((match = regex.exec(translatedCombined)) !== null) {
          const idx = parseInt(match[1], 10);
          if (idx >= 0 && idx < chunk.length) {
            parsedMap.set(idx, match[2].trim());
          }
        }
        for (let j = 0; j < chunk.length; j++) {
          translatedSentences.push(parsedMap.get(j) || chunk[j].fullSourceText);
        }
      } else if (translatedCombined) {
        const splitLines = translatedCombined.split('\n');
        if (splitLines.length === chunk.length) {
          translatedSentences = splitLines.map(line => line.trim());
        }
      }
    } catch {
      // Handled by individual fallback
    }

    if (translatedSentences.length !== chunk.length) {
      translatedSentences = [];
      for (const g of chunk) {
        try {
          const single = await translateTextSecure(g.fullSourceText, cleanSource, cleanTarget);
          translatedSentences.push(single || g.fullSourceText);
        } catch {
          translatedSentences.push(g.fullSourceText);
        }
      }
    }

    for (let j = 0; j < chunk.length; j++) {
      processedGroups.push({
        group: chunk[j],
        targetText: translatedSentences[j] || chunk[j].fullSourceText
      });
    }

    emitProgressSnapshot();

    if (i + batchSize < sentenceGroups.length) {
      await sleep(30);
    }
  }

  // 2. Final distribution to N ± 1 time windows
  const finalCues: SubtitleCue[] = [];
  for (const item of processedGroups) {
    const distributed = distributeTargetTextToWindows(item.group, item.targetText, { disableChunking });
    finalCues.push(...distributed);
  }

  return finalCues;
}

export async function translateWithGeminiAI(cues: SubtitleCue[], _detectedLang: string, targetLang: string, apiKey: string): Promise<SubtitleCue[]> {
  if (!cues || cues.length === 0) return cues;

  const targetLangMap: Record<string, string> = {
    tr: 'natural Turkish',
    en: 'natural English',
    de: 'natural German',
    es: 'natural Spanish',
    fr: 'natural French',
    it: 'natural Italian',
    pt: 'natural Portuguese',
    ru: 'natural Russian',
    zh: 'natural Simplified Chinese',
    ja: 'natural Japanese',
    ko: 'natural Korean',
    ar: 'natural Arabic',
    hi: 'natural Hindi',
    nl: 'natural Dutch',
    pl: 'natural Polish',
    uk: 'natural Ukrainian',
    sv: 'natural Swedish',
    no: 'natural Norwegian',
    da: 'natural Danish',
    fi: 'natural Finnish',
    el: 'natural Greek',
    cs: 'natural Czech',
    ro: 'natural Romanian',
    hu: 'natural Hungarian',
    id: 'natural Indonesian',
    vi: 'natural Vietnamese',
    th: 'natural Thai',
    he: 'natural Hebrew',
    fa: 'natural Persian',
    az: 'natural Azerbaijani',
    bg: 'natural Bulgarian',
    sr: 'natural Serbian',
    sk: 'natural Slovak',
    hr: 'natural Croatian',
    bn: 'natural Bengali'
  };
  const targetLangName = targetLangMap[targetLang] || `natural ${targetLang}`;

  // 1. Group fragmented cues into full sentences
  const sentenceGroups = aggregateSentenceCues(cues);
  const chunkSize = 25; // Optimal sentence batch size for low latency and high reliability
  const groupTranslationMap = new Map<string, string>();

  for (let i = 0; i < sentenceGroups.length; i += chunkSize) {
    const targetGroups = sentenceGroups.slice(i, i + chunkSize);
    const jsonPayload = targetGroups.map(g => ({
      id: g.id,
      text: g.fullSourceText
    }));

    const promptText = `You are an expert ${targetLangName} translator. Translate the "text" field of each complete sentence in this JSON array into contextually accurate, natural ${targetLangName}. Maintain conversational flow and tone. Return ONLY a valid JSON array of objects, where each object has the same "id" and the translated "text". No markdown formatting outside the JSON array.\n${JSON.stringify(jsonPayload)}`;

    let responseData: any = null;

    const models = GEMINI_MODEL_HIERARCHY;
    for (const model of models) {
      try {
        const response = await smartFetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: promptText }] }]
            })
          },
          12000
        );

        if (response.ok) {
          responseData = await response.json();
          if (responseData) break;
        }
      } catch (err) {
        console.warn(`Translation request failed for ${model}:`, err);
      }
    }

    if (responseData) {
      try {
        const rawText = responseData.candidates?.[0]?.content?.parts?.[0]?.text || '';
        // Clean thinking blocks and markdown fences if present
        const cleanedText = rawText
          .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
          .replace(/```json\s*/gi, '')
          .replace(/```\s*/gi, '')
          .trim();

        const jsonMatch = cleanedText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const translatedArr: { id: string; text: string }[] = JSON.parse(jsonMatch[0]);
          for (const item of translatedArr) {
            if (item.id && item.text) {
              groupTranslationMap.set(item.id, item.text);
            }
          }
        }
      } catch (parseErr) {
        console.warn('Failed to parse AI JSON chunk:', parseErr);
      }
    }
  }

  // 2. If AI translation succeeded for groups, distribute to windows; otherwise retain original cues
  if (groupTranslationMap.size === 0) {
    return cues;
  }

  const aiDistributedCues: SubtitleCue[] = [];
  for (const group of sentenceGroups) {
    const aiTargetText = groupTranslationMap.get(group.id);
    if (aiTargetText) {
      aiDistributedCues.push(...distributeTargetTextToWindows(group, aiTargetText));
    } else {
      const existingText = group.cues.map(c => c.targetText || c.sourceText).join(' ');
      aiDistributedCues.push(...distributeTargetTextToWindows(group, existingText));
    }
  }

  return aiDistributedCues;
}


