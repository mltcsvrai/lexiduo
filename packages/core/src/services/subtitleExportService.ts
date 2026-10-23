import type { SubtitleCue } from '../types';
import { translateTextSecure } from './translationService';
import { translateWithGeminiAI } from './transcriptService';
import { downloadBlobAsFile, type DownloadFileResult } from './blobDownloadHelper';

export type SubtitleExportMode = 'source' | 'target' | 'dual';

/**
 * Formats seconds into SRT timestamp format: HH:MM:SS,mmm
 * Example: 00:00:01,500
 */
export function formatSrtTimestamp(seconds: number): string {
  const safeSec = Math.max(0, isFinite(seconds) ? seconds : 0);
  const totalMs = Math.floor(safeSec * 1000);
  const ms = totalMs % 1000;
  const totalS = Math.floor(totalMs / 1000);
  const s = totalS % 60;
  const totalM = Math.floor(totalS / 60);
  const m = totalM % 60;
  const h = Math.floor(totalM / 60);

  const pad2 = (n: number) => String(n).padStart(2, '0');
  const pad3 = (n: number) => String(n).padStart(3, '0');
  return `${pad2(h)}:${pad2(m)}:${pad2(s)},${pad3(ms)}`;
}

/**
 * Formats seconds into WebVTT timestamp format: HH:MM:SS.mmm
 * Example: 00:00:01.500
 */
export function formatVttTimestamp(seconds: number): string {
  const safeSec = Math.max(0, isFinite(seconds) ? seconds : 0);
  const totalMs = Math.floor(safeSec * 1000);
  const ms = totalMs % 1000;
  const totalS = Math.floor(totalMs / 1000);
  const s = totalS % 60;
  const totalM = Math.floor(totalS / 60);
  const m = totalM % 60;
  const h = Math.floor(totalM / 60);

  const pad2 = (n: number) => String(n).padStart(2, '0');
  const pad3 = (n: number) => String(n).padStart(3, '0');
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}.${pad3(ms)}`;
}

/**
 * Extracts formatted text from cue based on mode (source, target, dual).
 */
export function getCueTextForExport(cue: SubtitleCue, mode: SubtitleExportMode = 'target'): string {
  const src = (cue.sourceText || '').trim();
  const trg = (cue.targetText || '').trim();

  if (mode === 'source') {
    return src;
  }
  if (mode === 'target') {
    return trg || src;
  }
  // 'dual' mode: original source line followed by translated target line
  if (trg && trg !== src) {
    return `${src}\n${trg}`;
  }
  return src;
}

/**
 * Converts SubtitleCue array to SubRip (.srt) string format.
 */
export function cuesToSrt(cues: SubtitleCue[], mode: SubtitleExportMode = 'target'): string {
  if (!cues || cues.length === 0) return '';
  const blocks: string[] = [];
  let counter = 1;

  for (const cue of cues) {
    const text = getCueTextForExport(cue, mode);
    if (!text) continue;
    const start = formatSrtTimestamp(cue.start);
    const end = formatSrtTimestamp(cue.end);
    blocks.push(`${counter++}\n${start} --> ${end}\n${text}`);
  }

  return blocks.length > 0 ? `${blocks.join('\n\n')}\n` : '';
}

/**
 * Converts SubtitleCue array to WebVTT (.vtt) string format.
 */
export function cuesToVtt(cues: SubtitleCue[], mode: SubtitleExportMode = 'target'): string {
  if (!cues || cues.length === 0) return 'WEBVTT\n\n';
  const blocks: string[] = ['WEBVTT\n'];
  let counter = 1;

  for (const cue of cues) {
    const text = getCueTextForExport(cue, mode);
    if (!text) continue;
    const start = formatVttTimestamp(cue.start);
    const end = formatVttTimestamp(cue.end);
    blocks.push(`${counter++}\n${start} --> ${end}\n${text}`);
  }

  return `${blocks.join('\n\n')}\n`;
}

import { aggregateSentenceCues, distributeTargetTextToWindows } from './sentenceSegmentation';

/**
 * Lightweight concurrency limiter for parallel execution.
 */
function createConcurrencyLimiter(concurrency: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (active >= concurrency) {
      await new Promise<void>(resolve => queue.push(resolve));
    }
    active++;
    try {
      return await fn();
    } finally {
      active--;
      if (queue.length > 0) {
        queue.shift()!();
      }
    }
  };
}

/**
 * Translates cues for a single target language using sentence aggregation (Zero Discourse Drift)
 * and parallel chunk execution via Google Translate fallback.
 */
async function translateCuesWithGoogle(
  cues: SubtitleCue[],
  sourceLang: string,
  targetLang: string
): Promise<SubtitleCue[]> {
  if (!cues || cues.length === 0) return [];
  const sentenceGroups = aggregateSentenceCues(cues);

  if (sentenceGroups.length > 0) {
    const BATCH_SIZE = 10;
    const batches: (typeof sentenceGroups)[] = [];
    for (let i = 0; i < sentenceGroups.length; i += BATCH_SIZE) {
      batches.push(sentenceGroups.slice(i, i + BATCH_SIZE));
    }

    const chunkLimit = createConcurrencyLimiter(3);
    const translatedBatches = await Promise.all(
      batches.map(batch =>
        chunkLimit(async () => {
          // Combine sentences in batch using distinct newline delimiter \n
          const combined = batch
            .map(g => (g.fullSourceText || '').replace(/\n+/g, ' ').trim())
            .join('\n');

          let translatedLines: string[] = [];
          try {
            const res = await translateTextSecure(combined, sourceLang, targetLang);
            const isUntranslated = Boolean(
              res &&
              sourceLang !== 'auto' &&
              sourceLang !== targetLang &&
              res.trim().toLowerCase() === combined.trim().toLowerCase()
            );
            if (res && !isUntranslated) {
              const lines = res.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n');
              if (lines.length === batch.length) {
                translatedLines = lines.map(l => l.trim());
              }
            }
          } catch (err) {
            console.warn('Batch translation warning, falling back to individual:', err);
          }

          // If lines match, map directly to groups and distribute to windows
          if (translatedLines.length === batch.length) {
            const batchCues: SubtitleCue[] = [];
            for (let i = 0; i < batch.length; i++) {
              const group = batch[i];
              const translated = translatedLines[i];
              const distributed = distributeTargetTextToWindows(group, translated);
              if (distributed && distributed.length > 0) {
                batchCues.push(...distributed.map(c => ({ ...c, isAiTranslated: true })));
              } else {
                batchCues.push(...group.cues.map(c => ({ ...c, targetText: translated, isAiTranslated: true })));
              }
            }
            return batchCues;
          }

          // Fallback: translate each group in this batch individually
          const fallbackCues: SubtitleCue[] = [];
          for (const group of batch) {
            try {
              const single = await translateTextSecure(group.fullSourceText, sourceLang, targetLang);
              if (single && single.trim()) {
                const distributed = distributeTargetTextToWindows(group, single.trim());
                if (distributed && distributed.length > 0) {
                  fallbackCues.push(...distributed.map(c => ({ ...c, isAiTranslated: true })));
                  continue;
                }
              }
            } catch {}
            // Fallback to cue-by-cue
            for (const cue of group.cues) {
              try {
                const single = await translateTextSecure(cue.sourceText, sourceLang, targetLang);
                fallbackCues.push({ ...cue, targetText: single?.trim() || cue.sourceText, isAiTranslated: true });
              } catch {
                fallbackCues.push({ ...cue, targetText: cue.sourceText });
              }
            }
          }
          return fallbackCues;
        })
      )
    );
    return translatedBatches.flat();
  }

  // Fallback for empty sentence groups: direct parallel translation
  const singleLimit = createConcurrencyLimiter(3);
  return Promise.all(
    cues.map(c =>
      singleLimit(async () => {
        try {
          const single = await translateTextSecure(c.sourceText, sourceLang, targetLang);
          return { ...c, targetText: single?.trim() || c.sourceText, isAiTranslated: true };
        } catch {
          return { ...c, targetText: c.sourceText };
        }
      })
    )
  );
}

/**
 * Resolves a clean, single-track SubtitleCue array for a specific language.
 * Guarantees that:
 * 1. If language is source language, cue targetText is set to sourceText (clean source track).
 * 2. If language is current active target language and existing translations are present, reuses them.
 * 3. If translation exists in transMap, uses it.
 * 4. Safe fallback: clean sourceText (never leaks another target language's translation into this track).
 */
export function resolveCuesForLanguage(
  lang: string,
  cues: SubtitleCue[],
  sourceLang: string,
  currentTargetLang?: string,
  hasExistingTargetTranslations?: boolean,
  transMap?: Map<string, SubtitleCue[]>
): SubtitleCue[] {
  if (!cues || cues.length === 0) return [];
  const cleanLang = (lang || '').replace(/^a\./, '').split('-')[0].toLowerCase();
  const cleanSource = (sourceLang || 'auto').replace(/^a\./, '').split('-')[0].toLowerCase();
  const cleanCurrentTarget = (currentTargetLang || '').replace(/^a\./, '').split('-')[0].toLowerCase();

  // 1. Source language requested: always clean sourceText
  if (cleanSource !== 'auto' && cleanLang === cleanSource) {
    return cues.map(c => ({ ...c, targetText: c.sourceText }));
  }

  // 2. Active target language with existing valid translations
  if (cleanCurrentTarget && cleanLang === cleanCurrentTarget && hasExistingTargetTranslations) {
    return cues;
  }

  // 3. Translated in transMap
  if (transMap) {
    const translated = transMap.get(cleanLang) || transMap.get(lang);
    if (translated && translated.length > 0) {
      return translated;
    }
  }

  // 4. Safe fallback: clean sourceText (never another language's targetText)
  return cues.map(c => ({ ...c, targetText: c.sourceText }));
}

/**
 * Filters out languages that do not need network translation:
 * - The original source language (cues already have clean sourceText)
 * - The current active target language (if cues already have valid translations)
 */
export function filterLangsNeedingTranslation(
  targetLangs: string[],
  cues: SubtitleCue[],
  sourceLang: string,
  currentTargetLang?: string
): string[] {
  if (!targetLangs || targetLangs.length === 0) return [];
  const cleanSource = (sourceLang || 'auto').replace(/^a\./, '').split('-')[0].toLowerCase();
  const cleanCurrentTarget = (currentTargetLang || '').replace(/^a\./, '').split('-')[0].toLowerCase();
  const hasExistingTarget = (cues || []).some(c =>
    Boolean(c.targetText && c.targetText.trim().length > 0 && c.targetText.trim() !== c.sourceText.trim())
  );

  return targetLangs.filter(lang => {
    const clean = (lang || '').replace(/^a\./, '').split('-')[0].toLowerCase();
    if (cleanSource !== 'auto' && clean === cleanSource) return false;
    if (cleanCurrentTarget && clean === cleanCurrentTarget && hasExistingTarget) return false;
    return true;
  });
}

/**
 * Translates subtitle cues for multiple target languages in parallel (concurrency: 3) with progress feedback.
 * Returns a Map where key is the target language code and value is the translated SubtitleCue array.
 */
export async function batchTranslateCues(
  cues: SubtitleCue[],
  sourceLang: string,
  targetLangs: string[],
  engine: 'whisper' | 'gemini' | 'google',
  apiKey?: string,
  onProgress?: (percent: number, currentLang: string) => void,
  signal?: AbortSignal
): Promise<Map<string, SubtitleCue[]>> {
  const result = new Map<string, SubtitleCue[]>();
  if (!cues || cues.length === 0 || !targetLangs || targetLangs.length === 0 || signal?.aborted) {
    return result;
  }

  const cleanSource = (sourceLang || 'auto').replace(/^a\./, '').split('-')[0].toLowerCase();
  const distinctTargets = Array.from(
    new Set(targetLangs.map(l => l.replace(/^a\./, '').split('-')[0].toLowerCase()))
  );

  const langLimit = createConcurrencyLimiter(3);
  let completedCount = 0;

  await Promise.all(
    distinctTargets.map(targetLang =>
      langLimit(async () => {
        if (signal?.aborted) return;
        if (cleanSource !== 'auto' && cleanSource === targetLang) {
          const selfCues = cues.map(c => ({ ...c, targetText: c.sourceText }));
          result.set(targetLang, selfCues);
          for (const orig of targetLangs) {
            if (orig.replace(/^a\./, '').split('-')[0].toLowerCase() === targetLang) {
              result.set(orig, selfCues);
            }
          }
          completedCount++;
          const pct = Math.round((completedCount / distinctTargets.length) * 100);
          onProgress?.(pct, targetLang);
          return;
        }

        let translated: SubtitleCue[] = [];

        if (engine === 'gemini' && apiKey && apiKey.trim().length >= 8) {
          try {
            translated = await translateWithGeminiAI(cues, cleanSource, targetLang, apiKey);
            const hasTranslation = translated.some(c => Boolean(c.targetText && c.targetText.trim() !== c.sourceText.trim()));
            if (!hasTranslation && !signal?.aborted) {
              translated = await translateCuesWithGoogle(cues, cleanSource, targetLang);
            }
          } catch (err) {
            console.warn(`Gemini batch translation failed for ${targetLang}, falling back to Google:`, err);
            if (!signal?.aborted) {
              translated = await translateCuesWithGoogle(cues, cleanSource, targetLang);
            }
          }
        } else if (!signal?.aborted) {
          translated = await translateCuesWithGoogle(cues, cleanSource, targetLang);
        }

        if (signal?.aborted) return;

        result.set(targetLang, translated);
        for (const orig of targetLangs) {
          if (orig.replace(/^a\./, '').split('-')[0].toLowerCase() === targetLang) {
            result.set(orig, translated);
          }
        }
        completedCount++;
        const pct = Math.round((completedCount / distinctTargets.length) * 100);
        onProgress?.(pct, targetLang);
      })
    )
  );

  return result;
}

/**
 * Triggers client-side browser or native MediaStore download for a subtitle text file (.srt or .vtt).
 * Delegates to downloadBlobAsFile to ensure files are placed in Download/Lexiduo on Android.
 */
export async function downloadSubtitleFile(
  content: string,
  filename: string,
  mimeType: string = 'text/plain;charset=utf-8'
): Promise<DownloadFileResult> {
  const blob = new Blob([content], { type: mimeType });
  return await downloadBlobAsFile(blob, filename);
}
