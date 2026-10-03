import { CapacitorHttp } from '@capacitor/core';
import type { SubtitleCue, VideoInfo } from '../types';
export type { SubtitleCue, VideoInfo };
import { getCachedTranscript, cacheTranscript } from './cacheService';
import { auditAndRepairCues, isCueUntranslated } from './subtitleAuditor';
import { aggregateSentenceCues, distributeTargetTextToWindows } from './sentenceSegmentation';

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

// Fail-safe fetch wrapper with strict timeout limit
export async function smartFetch(url: string, options?: { method?: string; headers?: any; body?: string, responseType?: 'text' | 'json' | 'arraybuffer' | 'blob' }, timeoutMs = 4000): Promise<{ ok: boolean; status: number; text: () => Promise<string>; json: () => Promise<any>; arrayBuffer: () => Promise<ArrayBuffer> }> {
  const isNative = typeof (window as any).Capacitor !== 'undefined' && (window as any).Capacitor.isNativePlatform?.();

  const fetchPromise = (async () => {
    if (isNative) {
      const response = await CapacitorHttp.request({
        url,
        method: options?.method || 'GET',
        headers: options?.headers || { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14)' },
        data: options?.body ? (typeof options.body === 'string' ? JSON.parse(options.body) : options.body) : undefined,
        responseType: options?.responseType
      });
      const rawData = response.data;
      return {
        ok: response.status >= 200 && response.status < 300,
        status: response.status,
        text: async () => (typeof rawData === 'string' ? rawData : JSON.stringify(rawData)),
        json: async () => (typeof rawData === 'object' ? rawData : JSON.parse(typeof rawData === 'string' ? rawData : JSON.stringify(rawData))),
        arrayBuffer: async () => {
          if (typeof rawData === 'string') {
            const binaryString = atob(rawData);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            return bytes.buffer;
          }
          throw new Error('Native response data is not a base64 string for arrayBuffer');
        }
      };
    } else {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(url, {
        method: options?.method || 'GET',
        headers: options?.headers,
        body: options?.body,
        signal: controller.signal
      });

      clearTimeout(timer);

      return {
        ok: res.ok,
        status: res.status,
        text: () => res.text(),
        json: () => res.json(),
        arrayBuffer: () => res.arrayBuffer()
      };
    }
  })();

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)
  );

  return Promise.race([fetchPromise, timeoutPromise]);
}

export async function fetchVideoSubtitles(
  videoId: string,
  sourceLang: string = 'auto',
  targetLang: string = 'tr',
  apiKey?: string,
  onFastCuesReady?: (cues: SubtitleCue[]) => void
): Promise<{ cues: SubtitleCue[]; isAiTranslated: boolean }> {
  
  // 0. Check Cache First & Audit for Poisoned/Untranslated Cues
  const cached = await getCachedTranscript(videoId, sourceLang, targetLang);
  if (cached && cached.cues && cached.cues.length > 0) {
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
        await cacheTranscript(videoId, sourceLang, targetLang, repairedCues, true);
        if (onFastCuesReady) onFastCuesReady(repairedCues);
        return { cues: repairedCues, isAiTranslated: true };
      }
    } catch (e) {
      console.warn('Cached cues repair notice:', e);
    }

    return cached;
  }

  let rawCues: { id: string; start: number; end: number; text: string }[] = [];
  let detectedLang = sourceLang === 'auto' ? 'en' : sourceLang;

  // 1. Try Local Server Dev Endpoint (Fastest on Dev)
  try {
    const res = await smartFetch(`https://yt-ceviri-api.erencloudflare.workers.dev/api/transcript?v=${videoId}&app_token=ytceviri_secure_2026&lang=${sourceLang}`, undefined, 2500);
    if (res.ok) {
      const data = await res.json();
      if (data.cues && Array.isArray(data.cues) && data.cues.length > 0) {
        rawCues = data.cues;
        detectedLang = data.lang || 'en';
      }
    }
  } catch (err) {
    // Expected in standalone APK production mode
  }

  // 2. Try Direct Client InnerTube Fetching
  if (rawCues.length === 0) {
    try {
      const clientRes = await fetchClientInnerTube(videoId, sourceLang);
      if (clientRes.cues.length > 0) {
        rawCues = clientRes.cues;
        detectedLang = clientRes.lang;
      }
    } catch (err) {
      console.warn('Client InnerTube fetch error:', err);
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
            detectedLang = langMatch ? langMatch[1] : detectedLang;
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

  // Sort and clamp raw cues to guarantee strict non-overlapping timestamps
  rawCues.sort((a, b) => a.start - b.start);
  for (let i = 0; i < rawCues.length - 1; i++) {
    if (rawCues[i].end > rawCues[i + 1].start) {
      rawCues[i].end = rawCues[i + 1].start;
    }
  }

  // Initial raw cues
  const initialCues: SubtitleCue[] = rawCues.map(c => ({
    id: c.id,
    start: c.start,
    end: c.end,
    sourceText: c.text,
    targetText: ''
  }));

  // FAST PATH: Translate sentence groups in parallel so BOTH exist immediately
  let fastCues = await translateFastParallel(initialCues, detectedLang, targetLang);
  
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

  // Safe Gemma 4 31B IT AI translation (never crashes or hangs if API key is invalid)
  if (apiKey && apiKey.trim().length > 10) {
    try {
      const aiCues = await translateWithGemmaAI(fastCues, detectedLang, targetLang, apiKey.trim());
      if (aiCues && aiCues.length > 0) {
        // Also audit AI output for any dropped/untranslated cues
        const finalAudit = await auditAndRepairCues(aiCues, detectedLang, targetLang, translateTextSecure);
        const resolvedCues = finalAudit.repairedCues;
        await cacheTranscript(videoId, sourceLang, targetLang, resolvedCues, true);
        return { cues: resolvedCues, isAiTranslated: true };
      }
    } catch (err) {
      console.warn('Gemma AI translation error (falling back to fast cues):', err);
    }
  }

  await cacheTranscript(videoId, sourceLang, targetLang, fastCues, true);
  return { cues: fastCues, isAiTranslated: true };
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
  const captionTracks = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];

  if (captionTracks.length === 0) return { cues: [], lang: 'en' };

  let selectedTrack = captionTracks[0];
  if (sourceLang !== 'auto') {
    selectedTrack = captionTracks.find((t: any) => t.languageCode === sourceLang || t.languageCode?.startsWith(sourceLang)) || captionTracks[0];
  } else {
    // Prefer EN if auto, otherwise first track
    selectedTrack = captionTracks.find((t: any) => t.languageCode === 'en' || t.languageCode?.startsWith('en')) || captionTracks[0];
  }

  const trackLang = selectedTrack.languageCode?.split('-')[0] || 'en';
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

async function translateFastParallel(cues: SubtitleCue[], sourceLang: string, targetLang: string): Promise<SubtitleCue[]> {
  if (!cues || cues.length === 0) return [];

  // 1. Group fragmented ASR cues into meaningful sentences
  const sentenceGroups = aggregateSentenceCues(cues);
  const batchSize = 12;
  const processedGroups: { group: any; targetText: string }[] = [];

  for (let i = 0; i < sentenceGroups.length; i += batchSize) {
    const chunk = sentenceGroups.slice(i, i + batchSize);
    
    // Combine full sentences using distinct newline delimiter \n
    const combinedText = chunk.map(g => (g.fullSourceText || '').replace(/\n+/g, ' ').trim()).join('\n');
    let translatedSentences: string[] = [];

    try {
      const translatedCombined = await translateTextSecure(combinedText, sourceLang, targetLang);
      const splitLines = translatedCombined.split('\n');

      if (splitLines.length === chunk.length) {
        translatedSentences = splitLines.map(line => line.trim());
      } else {
        // If line count mismatch, translate full sentence individually
        for (const g of chunk) {
          try {
            const single = await translateTextSecure(g.fullSourceText, sourceLang, targetLang);
            translatedSentences.push(single || g.fullSourceText);
          } catch {
            translatedSentences.push(g.fullSourceText);
          }
        }
      }
    } catch {
      for (const g of chunk) {
        try {
          const single = await translateTextSecure(g.fullSourceText, sourceLang, targetLang);
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

    if (i + batchSize < sentenceGroups.length) {
      await sleep(40);
    }
  }

  // 2. Distribute translated sentences to N ± 1 time windows
  const finalCues: SubtitleCue[] = [];
  for (const item of processedGroups) {
    const distributed = distributeTargetTextToWindows(item.group, item.targetText);
    finalCues.push(...distributed);
  }

  return finalCues;
}

async function translateWithGemmaAI(cues: SubtitleCue[], _detectedLang: string, targetLang: string, apiKey: string): Promise<SubtitleCue[]> {
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

    // 1. Primary: Gemma 4 31B IT
    try {
      const response = await smartFetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemma-4-31b-it:generateContent?key=${apiKey}`,
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
      }
    } catch (err) {
      console.warn('Gemma 4 31B IT request failed, falling back to gemini-3.5-flash-lite:', err);
    }

    // 2. Secondary Fallback: gemini-3.5-flash-lite or gemini-2.5-flash-lite
    if (!responseData) {
      for (const fallbackModel of ['gemini-3.5-flash-lite', 'gemini-2.5-flash-lite', 'gemini-1.5-flash']) {
        try {
          const fbRes = await smartFetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${fallbackModel}:generateContent?key=${apiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: promptText }] }]
              })
            },
            10000
          );
          if (fbRes.ok) {
            responseData = await fbRes.json();
            break;
          }
        } catch {
          // Try next model
        }
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

// Secure client-level translator using Google Chrome extension API & multi-provider fallbacks
export async function translateTextSecure(text: string, fromLang: string, toLang: string): Promise<string> {
  if (!text || !text.trim()) return text;
  const cleanFrom = fromLang === 'auto' ? 'auto' : fromLang;

  // 1. Primary: Google Chrome Extension official endpoint (Clean JSON array, no bot 429 page)
  try {
    const url = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=${cleanFrom}&tl=${toLang}&q=${encodeURIComponent(text)}`;
    const res = await smartFetch(url, undefined, 4000);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        if (Array.isArray(data[0])) {
          const combined = data
            .map((chunk: any) => (Array.isArray(chunk) && typeof chunk[0] === 'string' ? chunk[0] : ''))
            .filter(Boolean)
            .join('\n')
            .trim();
          if (combined && combined.length > 0) return combined;
        } else if (typeof data[0] === 'string') {
          const tr = data[0].trim();
          if (tr && tr.length > 0) return tr;
        }
      }
    }
  } catch (e) {
    // Continue to fallback
  }

  // 2. Secondary: Google WebApp endpoint
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=webapp&sl=${cleanFrom}&tl=${toLang}&dt=t&q=${encodeURIComponent(text)}`;
    const res = await smartFetch(url, undefined, 4000);
    if (res.ok) {
      const json = await res.json();
      if (json && Array.isArray(json[0])) {
        const fullTr = json[0].map((chunk: any) => chunk[0]).join('').trim();
        if (fullTr && fullTr !== text) return fullTr;
      }
    }
  } catch (e) {
    // Continue to fallback
  }

  // 3. Tertiary: MyMemory Translation API
  try {
    const langpair = `${cleanFrom === 'auto' ? 'en' : cleanFrom}|${toLang}`;
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${langpair}`;
    const res = await smartFetch(url, undefined, 4000);
    if (res.ok) {
      const json = await res.json();
      if (json?.responseData?.translatedText) {
        return json.responseData.translatedText.trim();
      }
    }
  } catch (e) {
    // All fallbacks exhausted
  }

  return text;
}
