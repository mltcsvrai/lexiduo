import type { SubtitleCue } from '../types';

export interface SentenceGroup {
  id: string;
  start: number;
  end: number;
  fullSourceText: string;
  cues: SubtitleCue[];
}

export const MAX_DURATION = 7.5;
export const MAX_WORDS = 22;
export const SILENCE_GAP_THRESHOLD = 0.75;
export const MICRO_WINDOW_THRESHOLD = 0.6;
export const LONG_WINDOW_THRESHOLD = 3.8;
export const TARGET_WINDOW_DURATION = 3.2;
export const TARGET_WINDOW_WORDS = 7;

// Matches sentence-ending punctuation: . ? ! ... 。(CJK) ؟(Arabic) ！(Fullwidth) ？(Fullwidth) …(Ellipsis)
const SENTENCE_END_PUNCTUATION_REGEX = /(?:\.{3}|…|[.?!。؟！？])[\s"'”’»)}\]]*$/;

/**
 * Counts words in a string in a whitespace-delimited manner.
 */
function countWords(text: string): number {
  if (!text) return 0;
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length;
}

/**
 * Checks whether text ends with sentence-terminating punctuation.
 */
function hasSentenceEndingPunctuation(text: string): boolean {
  if (!text) return false;
  return SENTENCE_END_PUNCTUATION_REGEX.test(text.trim());
}

/**
 * Round to 3 decimal places to avoid floating point inaccuracies in timestamps.
 */
function roundTime(time: number): number {
  return Math.round(time * 1000) / 1000;
}

/**
 * Aggregates fragmented YouTube ASR cues into meaningful sentence blocks
 * based on punctuation, speaker silence gaps (>= 0.75s), and duration/word ceilings (7.5s, 22 words).
 */
export function aggregateSentenceCues(cues: SubtitleCue[]): SentenceGroup[] {
  if (!cues || cues.length === 0) {
    return [];
  }

  const groups: SentenceGroup[] = [];
  let currentGroup: SubtitleCue[] = [];

  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    currentGroup.push(cue);

    const groupStart = currentGroup[0].start;
    const currentDuration = cue.end - groupStart;
    const currentWords = currentGroup.reduce((sum, c) => sum + countWords(c.sourceText), 0);

    const hasPunctuation = hasSentenceEndingPunctuation(cue.sourceText);
    const nextCue = cues[i + 1];
    const hasSilenceGap = nextCue ? (nextCue.start - cue.end >= SILENCE_GAP_THRESHOLD) : false;
    const isCeilingReached = currentDuration >= MAX_DURATION || currentWords >= MAX_WORDS;
    const isLastCue = i === cues.length - 1;

    if (hasPunctuation || hasSilenceGap || isCeilingReached || isLastCue) {
      groups.push({
        id: `sg-${groups.length + 1}`,
        start: roundTime(groupStart),
        end: roundTime(cue.end),
        fullSourceText: currentGroup
          .map(c => c.sourceText || '')
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim(),
        cues: [...currentGroup]
      });
      currentGroup = [];
    }
  }

  return groups;
}

interface IntermediateWindow {
  id: string;
  start: number;
  end: number;
  sourceText: string;
}

/**
 * Distributes translated target text across time windows derived from a SentenceGroup.
 * Applies the -1 rule (<0.6s micro pieces merged) and +1 rule (>3.8s long pieces split),
 * then distributes fullTargetText words proportionally to window durations without breaking words.
 */
export function distributeTargetTextToWindows(
  group: SentenceGroup,
  fullTargetText: string,
  options?: { disableChunking?: boolean }
): SubtitleCue[] {
  if (!group || !group.cues || group.cues.length === 0) {
    return [];
  }

  if (options?.disableChunking) {
    return [{
      id: group.cues[0]?.id || group.id,
      start: roundTime(group.start),
      end: roundTime(group.end),
      sourceText: group.fullSourceText,
      targetText: fullTargetText.trim(),
      isAiTranslated: true
    }];
  }

  // 1. Initial windows from group cues
  const initialWindows: IntermediateWindow[] = group.cues.map((c, idx) => ({
    id: c.id || `${group.id}_c${idx}`,
    start: c.start,
    end: c.end,
    sourceText: (c.sourceText || '').trim()
  }));

  if (initialWindows.length === 0) {
    return [];
  }

  // 2. -1 Rule: Merge micro parts (< 0.6s) into next window, or previous if last window
  let mergedWindows: IntermediateWindow[] = [];
  for (let i = 0; i < initialWindows.length; i++) {
    const current = initialWindows[i];
    const duration = current.end - current.start;

    if (duration < MICRO_WINDOW_THRESHOLD) {
      if (i < initialWindows.length - 1) {
        // Merge into next window
        const next = initialWindows[i + 1];
        initialWindows[i + 1] = {
          id: current.id,
          start: current.start,
          end: next.end,
          sourceText: [current.sourceText, next.sourceText].filter(Boolean).join(' ').trim()
        };
      } else if (mergedWindows.length > 0) {
        // Last window: merge into previous window
        const prev = mergedWindows[mergedWindows.length - 1];
        mergedWindows[mergedWindows.length - 1] = {
          ...prev,
          end: current.end,
          sourceText: [prev.sourceText, current.sourceText].filter(Boolean).join(' ').trim()
        };
      } else {
        // Only one window exists and it's micro: retain it
        mergedWindows.push(current);
      }
    } else {
      mergedWindows.push(current);
    }
  }

  if (mergedWindows.length === 0 && initialWindows.length > 0) {
    mergedWindows = [initialWindows[0]];
  }

  // 3. +1 Rule: Split excessively long parts (> 3.8s or > 8 words) into balanced, rhythmic time windows
  const splitWindows: IntermediateWindow[] = [];
  for (const w of mergedWindows) {
    const duration = w.end - w.start;
    const sourceWords = (w.sourceText || '').split(/\s+/).filter(Boolean);
    const k = (duration > LONG_WINDOW_THRESHOLD || sourceWords.length > 8)
      ? Math.max(2, Math.ceil(duration / TARGET_WINDOW_DURATION), Math.ceil(sourceWords.length / TARGET_WINDOW_WORDS))
      : 1;

    if (k > 1) {
      const windowSliceDuration = duration / k;
      let prevWordIdx = 0;

      for (let sIdx = 0; sIdx < k; sIdx++) {
        const isLastSubWindow = sIdx === k - 1;
        const subStart = roundTime(w.start + sIdx * windowSliceDuration);
        const subEnd = isLastSubWindow ? roundTime(w.end) : roundTime(w.start + (sIdx + 1) * windowSliceDuration);

        let nextWordIdx: number;
        if (isLastSubWindow || sourceWords.length === 0) {
          nextWordIdx = sourceWords.length;
        } else {
          nextWordIdx = Math.round(((sIdx + 1) / k) * sourceWords.length);
          if (nextWordIdx < prevWordIdx) nextWordIdx = prevWordIdx;
          if (nextWordIdx > sourceWords.length) nextWordIdx = sourceWords.length;
        }

        const sliceWords = sourceWords.slice(prevWordIdx, nextWordIdx);
        prevWordIdx = nextWordIdx;

        splitWindows.push({
          id: `${w.id}_${sIdx + 1}`,
          start: subStart,
          end: subEnd,
          sourceText: sliceWords.join(' ')
        });
      }
    } else {
      splitWindows.push({
        ...w,
        start: roundTime(w.start),
        end: roundTime(w.end)
      });
    }
  }

  const finalWindows = splitWindows.length > 0 ? splitWindows : mergedWindows;

  // 4. Proportional Word Distribution (Language-Agnostic)
  const targetWords = (fullTargetText || '').trim().split(/\s+/).filter(Boolean);
  const totalDuration = finalWindows.reduce((sum, w) => sum + Math.max(w.end - w.start, 0), 0);

  const result: SubtitleCue[] = [];
  let cumulativeDuration = 0;
  let prevWordIndex = 0;

  for (let i = 0; i < finalWindows.length; i++) {
    const w = finalWindows[i];
    const duration = Math.max(w.end - w.start, 0);
    cumulativeDuration += duration;

    let currentWordIndex: number;
    if (i === finalWindows.length - 1 || totalDuration <= 0) {
      currentWordIndex = targetWords.length;
    } else {
      const fraction = cumulativeDuration / totalDuration;
      currentWordIndex = Math.round(targetWords.length * fraction);
      if (currentWordIndex < prevWordIndex) {
        currentWordIndex = prevWordIndex;
      }
      if (currentWordIndex > targetWords.length) {
        currentWordIndex = targetWords.length;
      }
    }

    const windowWords = targetWords.slice(prevWordIndex, currentWordIndex);
    prevWordIndex = currentWordIndex;

    result.push({
      id: w.id,
      start: w.start,
      end: w.end,
      sourceText: w.sourceText,
      targetText: windowWords.join(' '),
      isAiTranslated: true
    });
  }

  return result;
}
