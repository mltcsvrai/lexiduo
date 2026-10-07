import type { SubtitleCue } from '@ytceviri/core';

/**
 * Yields control back to the event loop so that the UI can paint,
 * CSS animations can run, and the browser/Android WebView won't trigger ANR.
 * Includes background awareness and safety timeout fallback to prevent
 * freezing when the app or tab is minimized.
 */
export function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    // 1. If document is in background or hidden, requestAnimationFrame will never fire.
    // Yield directly to macrotask loop to allow uninterrupted background execution.
    if (typeof document !== 'undefined' && document.hidden) {
      setTimeout(resolve, 0);
      return;
    }

    // 2. If foreground, synchronize with rAF while arming a 32ms safety fallback
    // in case the app is minimized right between scheduling and execution.
    if (typeof requestAnimationFrame === 'function') {
      let resolved = false;
      const fallbackTimer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve();
        }
      }, 32);

      requestAnimationFrame(() => {
        if (!resolved) {
          resolved = true;
          clearTimeout(fallbackTimer);
          setTimeout(resolve, 0);
        }
      });
    } else {
      setTimeout(resolve, 0);
    }
  });
}

/**
 * Energy-based Voice Activity Detection (VAD)
 * Filters out silent regions to avoid hallucination and speed up processing.
 */
export function calculateEnergy(samples: Float32Array, start: number, end: number): number {
  let sum = 0;
  for (let i = start; i < end; i++) {
    sum += samples[i] * samples[i];
  }
  return sum / (end - start);
}

export function encodeWav(samples: Float32Array, sampleRate = 16000): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (v: DataView, o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };

  writeStr(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(view, 8, 'WAVE');
  writeStr(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(view, 36, 'data');
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  const CHUNK_SIZE = 0x8000;
  let binary = '';
  for (let i = 0; i < len; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, Math.min(i + CHUNK_SIZE, len));
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binary);
}

/**
 * Splits continuous transcribed text into sentence/phrase level SubtitleCues
 * with proportional timestamps across the chunk time window.
 */
export function splitTextIntoSentenceCues(
  text: string,
  startTime: number,
  endTime: number,
  startId: number
): { cues: SubtitleCue[]; nextId: number } {
  const clean = (text || '').trim();
  if (!clean) return { cues: [], nextId: startId };

  // Split on sentence-ending punctuation: . ? ! ... 。(CJK) ؟(Arabic) ！(Fullwidth) ？(Fullwidth) \n
  const sentenceRegex = /[^.?!。؟！？\n]+(?:[.?!。؟！？]+[\s"'”’»)}\]]*|\n|$)/g;
  const matches = clean.match(sentenceRegex);
  const rawSentences = matches 
    ? matches.map(s => s.trim()).filter(Boolean)
    : [clean];

  if (rawSentences.length <= 1) {
    return {
      cues: [{
        id: String(startId),
        start: Number(startTime.toFixed(2)),
        end: Number(endTime.toFixed(2)),
        sourceText: clean,
        targetText: ''
      }],
      nextId: startId + 1
    };
  }

  // Calculate word counts to distribute time proportionally
  const sentenceWordCounts = rawSentences.map(s => Math.max(1, s.split(/\s+/).filter(Boolean).length));
  const totalWords = sentenceWordCounts.reduce((a, b) => a + b, 0);
  const totalDuration = Math.max(0.1, endTime - startTime);

  const cues: SubtitleCue[] = [];
  let currentStart = startTime;
  let currentId = startId;

  for (let i = 0; i < rawSentences.length; i++) {
    const sentence = rawSentences[i];
    const words = sentenceWordCounts[i];
    const durationFraction = (words / totalWords) * totalDuration;
    const currentEnd = i === rawSentences.length - 1 ? endTime : currentStart + durationFraction;

    cues.push({
      id: String(currentId++),
      start: Number(currentStart.toFixed(2)),
      end: Number(currentEnd.toFixed(2)),
      sourceText: sentence,
      targetText: ''
    });

    currentStart = currentEnd;
  }

  return { cues, nextId: currentId };
}
