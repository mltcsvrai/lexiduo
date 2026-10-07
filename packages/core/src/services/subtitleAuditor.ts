import type { SubtitleCue } from '../types';

// Common stopword sets for lightweight heuristic language mismatch detection
const ENGLISH_STOPWORDS = new Set([
  'the', 'and', 'that', 'this', 'with', 'from', 'have', 'they', 'what',
  'about', 'there', 'your', 'would', 'their', 'which', 'will', 'been',
  'were', 'when', 'who', 'more', 'some', 'into', 'them', 'these', 'could'
]);

/**
 * Checks whether a single subtitle cue appears untranslated or mismatched with target language.
 */
export function isCueUntranslated(
  cue: SubtitleCue,
  sourceLang: string = 'en',
  targetLang: string = 'tr'
): boolean {
  const normSource = (sourceLang || 'auto').replace(/^a\./, '').split('-')[0].toLowerCase();
  const normTarget = (targetLang || 'tr').replace(/^a\./, '').split('-')[0].toLowerCase();

  // If source and target are explicitly the same, it shouldn't be altered
  if (normSource !== 'auto' && normSource === normTarget) {
    return false;
  }

  const src = (cue.sourceText || '').trim();
  const trg = (cue.targetText || '').trim();

  // 1. Completely empty translation
  if (!trg) {
    return true;
  }

  // 2. Pure numbers, timestamps, punctuation or musical notes shouldn't be forced
  if (/^[\d\s\p{P}\p{S}]+$/u.test(src)) {
    return false;
  }

  const srcLower = src.toLowerCase();
  const trgLower = trg.toLowerCase();
  const words = srcLower.split(/\s+/).filter(Boolean);

  // 3. Exact match check: If sentence has 2+ words and target is identical to source
  if (srcLower === trgLower && words.length >= 2) {
    return true;
  }

  // 4. Heuristic: Target is expected to be Turkish ('tr'), but text is still clearly English
  if (normTarget === 'tr') {
    const hasTurkishChar = /[çğışöüÇĞİŞÖÜ]/.test(trg);
    const targetWords = trgLower.split(/[\s,.;:!?"]+/).filter(Boolean);
    const englishStopwordCount = targetWords.filter((w: string) => ENGLISH_STOPWORDS.has(w)).length;

    // If there are multiple prominent English stopwords and zero Turkish characters in a multi-word phrase
    if (!hasTurkishChar && targetWords.length >= 3 && englishStopwordCount >= 2) {
      return true;
    }
  }

  return false;
}

export type TranslationFunction = (text: string, fromLang: string, toLang: string) => Promise<string>;

/**
 * Audits a full list of subtitle cues and repairs ONLY the untranslated items in-place.
 * Accurately leaves all successfully translated cues intact.
 */
export async function auditAndRepairCues(
  cues: SubtitleCue[],
  sourceLang: string = 'auto',
  targetLang: string = 'tr',
  translateFn: TranslationFunction,
  onPatch?: (updatedCues: SubtitleCue[]) => void
): Promise<{ repairedCues: SubtitleCue[]; repairedCount: number }> {
  if (!cues || cues.length === 0) {
    return { repairedCues: [], repairedCount: 0 };
  }

  // 1. Identify indices of untranslated cues
  const untranslatedIndices: number[] = [];
  for (let i = 0; i < cues.length; i++) {
    if (isCueUntranslated(cues[i], sourceLang, targetLang)) {
      untranslatedIndices.push(i);
    }
  }

  if (untranslatedIndices.length === 0) {
    return { repairedCues: cues, repairedCount: 0 };
  }

  // Clone cues to ensure immutable operations
  const repairedCues: SubtitleCue[] = cues.map(c => ({ ...c }));
  const batchSize = 10;

  for (let b = 0; b < untranslatedIndices.length; b += batchSize) {
    const batchIndices = untranslatedIndices.slice(b, b + batchSize);
    const missingItems = batchIndices.map(idx => repairedCues[idx]);

    // Translate batch with newline separation
    const combinedText = missingItems.map(c => c.sourceText.replace(/\n+/g, ' ').trim()).join('\n');
    let translatedLines: string[] = [];

    try {
      const translatedCombined = await translateFn(combinedText, sourceLang, targetLang);
      const splitLines = translatedCombined.split('\n');

      if (splitLines.length === missingItems.length) {
        translatedLines = splitLines.map(l => l.trim());
      } else {
        // Fallback to individual translation for the batch if line count mismatches
        for (const item of missingItems) {
          try {
            const single = await translateFn(item.sourceText, sourceLang, targetLang);
            translatedLines.push(single || item.sourceText);
          } catch {
            translatedLines.push(item.sourceText);
          }
        }
      }
    } catch {
      for (const item of missingItems) {
        try {
          const single = await translateFn(item.sourceText, sourceLang, targetLang);
          translatedLines.push(single || item.sourceText);
        } catch {
          translatedLines.push(item.sourceText);
        }
      }
    }

    // Patch in-place without touching any other cues
    for (let j = 0; j < batchIndices.length; j++) {
      const targetIndex = batchIndices[j];
      const translated = translatedLines[j];
      if (translated && translated.trim().length > 0) {
        repairedCues[targetIndex] = {
          ...repairedCues[targetIndex],
          targetText: translated,
          isAiTranslated: true
        };
      }
    }

    // Notify caller with updated snapshot
    if (onPatch) {
      onPatch([...repairedCues]);
    }
  }

  return {
    repairedCues,
    repairedCount: untranslatedIndices.length
  };
}
