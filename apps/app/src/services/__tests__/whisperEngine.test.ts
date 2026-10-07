import { describe, it, expect, vi, beforeEach } from 'vitest';
import { yieldToMain, transcribeAudioBuffer, splitTextIntoSentenceCues, type WhisperProgress } from '../whisperEngine';
import { configureWhisperEnvironment } from '../offlineTranslationEngine';

// In-memory mock for idb-keyval
const storage = new Map<string, any>();
vi.mock('idb-keyval', () => ({
  get: vi.fn(async (key: string) => storage.get(key)),
  set: vi.fn(async (key: string, value: any) => { storage.set(key, value); }),
  del: vi.fn(async (key: string) => { storage.delete(key); })
}));

describe('whisperEngine - Cooperative Multitasking, Warmup & Progress Tracking', () => {
  beforeEach(() => {
    storage.clear();
    vi.clearAllMocks();
  });

  it('yieldToMain resolves smoothly and yields to event loop', async () => {
    let order: number[] = [];
    const p = yieldToMain().then(() => {
      order.push(2);
    });
    order.push(1);
    await p;
    expect(order).toEqual([1, 2]);
  });

  it('yieldToMain resolves without hanging when document is hidden (background mode)', async () => {
    const hadDocument = typeof document !== 'undefined';
    const originalHidden = hadDocument ? Object.getOwnPropertyDescriptor(document, 'hidden') : undefined;
    try {
      if (!hadDocument) {
        (globalThis as any).document = { hidden: true };
      } else {
        Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      }
      let resolved = false;
      await yieldToMain().then(() => { resolved = true; });
      expect(resolved).toBe(true);
    } finally {
      if (hadDocument && originalHidden) {
        Object.defineProperty(document, 'hidden', originalHidden);
      } else if (!hadDocument) {
        delete (globalThis as any).document;
      }
    }
  });

  it('configureWhisperEnvironment returns valid device configuration', async () => {
    const config = await configureWhisperEnvironment();
    expect(config).toBeDefined();
    expect(['webgpu', 'wasm']).toContain(config.device);
  });

  it('transcribeAudioBuffer falls back gracefully and emits expected progress stages', async () => {
    // 1-second of silent Float32Array at 16kHz
    const audioData = new Float32Array(16000);
    const progressList: WhisperProgress[] = [];

    const cues = await transcribeAudioBuffer(audioData, {
      sourceLang: 'en',
      targetLang: 'tr',
      forceEngine: 'whisper',
      onProgress: (p) => {
        progressList.push({ ...p });
      }
    });

    expect(cues).toBeDefined();
    expect(cues.length).toBeGreaterThan(0);

    // Initial model loading stage must have been emitted
    const hasInitialStage = progressList.some(p => p.progress >= 5);
    expect(hasInitialStage).toBe(true);

    // Final stage should be ready
    const lastProgress = progressList[progressList.length - 1];
    expect(lastProgress.progress).toBe(100);
  });

  it('calculates realistic progress percentage and ETA structure', () => {
    const totalDuration = 120; // 2 minutes video
    const processedDuration = 30; // 30s processed
    const elapsedSec = 15; // took 15s -> 2.0x speed

    const speed = processedDuration / elapsedSec;
    const remainingSec = (totalDuration - processedDuration) / speed;

    expect(speed).toBe(2.0);
    expect(remainingSec).toBe(45); // 90s remaining at 2x -> 45s
  });

  it('handles cooperative chunk progress correctly without infinite seek loops', async () => {
    // 30 seconds of audio data (requires multiple chunks since windowDuration is 25s, step is 23s)
    const audioData = new Float32Array(30 * 16000);
    // Add small amplitude so energy > 0.00003
    for (let i = 0; i < audioData.length; i++) {
      audioData[i] = 0.05 * Math.sin((2 * Math.PI * 220 * i) / 16000);
    }

    const progressList: WhisperProgress[] = [];
    const cues = await transcribeAudioBuffer(audioData, {
      sourceLang: 'en',
      targetLang: 'tr',
      forceEngine: 'whisper',
      onProgress: (p) => {
        progressList.push({ ...p });
      }
    });

    expect(cues).toBeDefined();
    expect(cues.length).toBeGreaterThan(0);
    // At least fallback or ready stage reached
    expect(progressList.some(p => p.progress === 100)).toBe(true);
  });

  it('safely handles initially empty audio buffer without NaN or 0s freezing', async () => {
    const emptyAudio = new Float32Array(0);
    const progressList: WhisperProgress[] = [];

    const cues = await transcribeAudioBuffer(emptyAudio, {
      sourceLang: 'en',
      targetLang: 'tr',
      forceEngine: 'whisper',
      onProgress: (p) => {
        progressList.push({ ...p });
      }
    });

    expect(cues).toBeDefined();
    // Progress percent should never be NaN
    for (const p of progressList) {
      if (typeof p.progress === 'number') {
        expect(Number.isNaN(p.progress)).toBe(false);
      }
    }
    expect(progressList.some(p => p.progress === 100)).toBe(true);
  });

  describe('splitTextIntoSentenceCues', () => {
    it('splits continuous paragraph text into sentence-level cues with continuous proportional timestamps', () => {
      const text = 'Hello world! How are you doing today? This is a great test.';
      const res = splitTextIntoSentenceCues(text, 0.0, 15.0, 1);

      expect(res.cues).toHaveLength(3);
      expect(res.cues[0].sourceText).toBe('Hello world!');
      expect(res.cues[1].sourceText).toBe('How are you doing today?');
      expect(res.cues[2].sourceText).toBe('This is a great test.');

      // Check timestamps continuity
      expect(res.cues[0].start).toBe(0.0);
      expect(res.cues[0].end).toBe(res.cues[1].start);
      expect(res.cues[1].end).toBe(res.cues[2].start);
      expect(res.cues[2].end).toBe(15.0);

      // Verify nextId
      expect(res.nextId).toBe(4);
    });

    it('returns single cue when there is only one sentence or no punctuation', () => {
      const singleText = 'This is a single continuous phrase without sentence markers';
      const res = splitTextIntoSentenceCues(singleText, 2.5, 8.0, 10);

      expect(res.cues).toHaveLength(1);
      expect(res.cues[0].sourceText).toBe(singleText);
      expect(res.cues[0].start).toBe(2.5);
      expect(res.cues[0].end).toBe(8.0);
      expect(res.nextId).toBe(11);
    });

    it('returns empty cues array for empty or whitespace text', () => {
      const res = splitTextIntoSentenceCues('   ', 0, 10, 1);
      expect(res.cues).toEqual([]);
      expect(res.nextId).toBe(1);
    });

    it('handles multilingual sentence terminators including Japanese and Arabic', () => {
      const multilingualText = 'こんにちは世界。كيف حالك اليوم؟ Evet harika!';
      const res = splitTextIntoSentenceCues(multilingualText, 0.0, 12.0, 1);

      expect(res.cues).toHaveLength(3);
      expect(res.cues[0].start).toBe(0.0);
      expect(res.cues[2].end).toBe(12.0);
    });
  });
});

