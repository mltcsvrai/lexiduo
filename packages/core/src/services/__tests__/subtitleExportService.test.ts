import { describe, it, expect, vi } from 'vitest';
import {
  formatSrtTimestamp,
  formatVttTimestamp,
  cuesToSrt,
  cuesToVtt,
  getCueTextForExport,
  batchTranslateCues,
  resolveCuesForLanguage,
  filterLangsNeedingTranslation,
  downloadSubtitleFile
} from '../subtitleExportService';
import type { SubtitleCue } from '../../types';

vi.mock('../translationService', () => ({
  smartFetch: vi.fn(),
  translateTextSecure: vi.fn(async (text: string, _from: string, to: string) => {
    return text.split('\n').map(l => `[${to}] ${l}`).join('\n');
  })
}));

vi.mock('../transcriptService', () => ({
  translateWithGeminiAI: vi.fn(async (cues: SubtitleCue[], _from: string, to: string) => {
    return cues.map(c => ({
      ...c,
      targetText: `[gemini-${to}] ${c.sourceText}`,
      isAiTranslated: true
    }));
  })
}));

describe('subtitleExportService', () => {
  const sampleCues: SubtitleCue[] = [
    {
      id: '1',
      start: 1.5,
      end: 4.2,
      sourceText: 'Hello world',
      targetText: 'Merhaba dunya'
    },
    {
      id: '2',
      start: 65.123,
      end: 70.5,
      sourceText: 'Learning languages is fun',
      targetText: 'Dil ogrenmek keyifli'
    }
  ];

  describe('formatSrtTimestamp', () => {
    it('formats 0 seconds correctly', () => {
      expect(formatSrtTimestamp(0)).toBe('00:00:00,000');
    });

    it('formats fractional seconds with comma separator', () => {
      expect(formatSrtTimestamp(1.5)).toBe('00:00:01,500');
      expect(formatSrtTimestamp(65.123)).toBe('00:01:05,123');
      expect(formatSrtTimestamp(3665.456)).toBe('01:01:05,456');
    });
  });

  describe('formatVttTimestamp', () => {
    it('formats seconds with dot separator', () => {
      expect(formatVttTimestamp(0)).toBe('00:00:00.000');
      expect(formatVttTimestamp(1.5)).toBe('00:00:01.500');
      expect(formatVttTimestamp(65.123)).toBe('00:01:05.123');
      expect(formatVttTimestamp(3665.456)).toBe('01:01:05.456');
    });
  });

  describe('cuesToSrt', () => {
    it('returns empty string for empty cues', () => {
      expect(cuesToSrt([])).toBe('');
    });

    it('exports source mode subtitles', () => {
      const srt = cuesToSrt(sampleCues, 'source');
      expect(srt).toContain('1\n00:00:01,500 --> 00:00:04,200\nHello world');
      expect(srt).toContain('2\n00:01:05,123 --> 00:01:10,500\nLearning languages is fun');
      expect(srt).not.toContain('Merhaba dunya');
    });

    it('exports target mode subtitles', () => {
      const srt = cuesToSrt(sampleCues, 'target');
      expect(srt).toContain('1\n00:00:01,500 --> 00:00:04,200\nMerhaba dunya');
      expect(srt).toContain('2\n00:01:05,123 --> 00:01:10,500\nDil ogrenmek keyifli');
      expect(srt).not.toContain('Hello world');
    });

    it('exports dual mode with source and target lines', () => {
      const srt = cuesToSrt(sampleCues, 'dual');
      expect(srt).toContain('1\n00:00:01,500 --> 00:00:04,200\nHello world\nMerhaba dunya');
      expect(srt).toContain('2\n00:01:05,123 --> 00:01:10,500\nLearning languages is fun\nDil ogrenmek keyifli');
    });

    it('defaults to target mode when mode parameter is omitted', () => {
      const srt = cuesToSrt(sampleCues);
      expect(srt).toContain('1\n00:00:01,500 --> 00:00:04,200\nMerhaba dunya');
      expect(srt).toContain('2\n00:01:05,123 --> 00:01:10,500\nDil ogrenmek keyifli');
      expect(srt).not.toContain('Hello world');
    });
  });

  describe('cuesToVtt', () => {
    it('starts with WEBVTT header', () => {
      const vtt = cuesToVtt(sampleCues, 'dual');
      expect(vtt.startsWith('WEBVTT\n')).toBe(true);
      expect(vtt).toContain('1\n00:00:01.500 --> 00:00:04.200\nHello world\nMerhaba dunya');
    });

    it('defaults to target mode when mode parameter is omitted', () => {
      const vtt = cuesToVtt(sampleCues);
      expect(vtt.startsWith('WEBVTT\n')).toBe(true);
      expect(vtt).toContain('1\n00:00:01.500 --> 00:00:04.200\nMerhaba dunya');
      expect(vtt).not.toContain('Hello world');
    });

    it('handles empty cues array with valid empty WEBVTT file', () => {
      const vtt = cuesToVtt([]);
      expect(vtt).toBe('WEBVTT\n\n');
    });
  });

  describe('getCueTextForExport', () => {
    it('defaults to target mode when mode parameter is omitted', () => {
      expect(getCueTextForExport(sampleCues[0])).toBe('Merhaba dunya');
    });

    it('falls back to sourceText when targetText is missing in target mode', () => {
      expect(getCueTextForExport({ id: '99', start: 0, end: 1, sourceText: 'Original only' })).toBe('Original only');
    });
  });

  describe('batchTranslateCues', () => {
    it('handles source equals target without calling API', async () => {
      const result = await batchTranslateCues(sampleCues, 'en', ['en'], 'google');
      expect(result.has('en')).toBe(true);
      const enCues = result.get('en')!;
      expect(enCues[0].targetText).toBe('Hello world');
    });

    it('translates multiple target languages with progress updates', async () => {
      const progressRecords: { percent: number; lang: string }[] = [];
      const result = await batchTranslateCues(
        sampleCues,
        'en',
        ['tr', 'de'],
        'google',
        undefined,
        (percent, currentLang) => {
          progressRecords.push({ percent, lang: currentLang });
        }
      );

      expect(result.has('tr')).toBe(true);
      expect(result.has('de')).toBe(true);
      expect(result.get('tr')![0].targetText).toContain('[tr]');
      expect(result.get('de')![0].targetText).toContain('[de]');
      expect(progressRecords.length).toBeGreaterThan(0);
      expect(progressRecords[progressRecords.length - 1].percent).toBe(100);
    });

    it('translates with Gemini when apiKey is provided', async () => {
      const result = await batchTranslateCues(
        sampleCues,
        'en',
        ['es'],
        'gemini',
        'valid-mock-gemini-key'
      );

      expect(result.has('es')).toBe(true);
      expect(result.get('es')![0].targetText).toContain('[gemini-es]');
    });

    it('translates larger datasets (>10 cues) in batches of 10-12 cues with parallel chunking', async () => {
      const manyCues: SubtitleCue[] = Array.from({ length: 25 }, (_, i) => ({
        id: `cue-${i + 1}`,
        start: i * 3,
        end: (i + 1) * 3,
        sourceText: `Sentence number ${i + 1}.`,
        targetText: ''
      }));

      const result = await batchTranslateCues(manyCues, 'en', ['fr'], 'google');
      expect(result.has('fr')).toBe(true);
      const frCues = result.get('fr')!;
      expect(frCues).toHaveLength(25);
      expect(frCues[0].targetText).toContain('[fr]');
      expect(frCues[24].targetText).toContain('[fr]');
    });

    it('populates both sanitized and original language codes in result map', async () => {
      const cues: SubtitleCue[] = [
        { id: '1', start: 0, end: 2, sourceText: 'Merhaba Dünya' }
      ];

      const result = await batchTranslateCues(cues, 'tr', ['es-ES', 'a.de'], 'google');
      expect(result.has('es')).toBe(true);
      expect(result.has('es-ES')).toBe(true);
      expect(result.has('de')).toBe(true);
      expect(result.has('a.de')).toBe(true);
      expect(result.get('es-ES')![0].targetText).toContain('[es]');
      expect(result.get('a.de')![0].targetText).toContain('[de]');
    });

    it('exits early and returns empty map when signal is aborted', async () => {
      const controller = new AbortController();
      controller.abort();
      const result = await batchTranslateCues(sampleCues, 'en', ['tr'], 'google', undefined, undefined, controller.signal);
      expect(result.size).toBe(0);
    });
  });

  describe('resolveCuesForLanguage', () => {
    const sessionCues: SubtitleCue[] = [
      { id: '1', start: 0, end: 2, sourceText: 'Hello World', targetText: 'Merhaba Dunya' }
    ];

    it('returns clean source text when requested language matches source language', () => {
      const resolved = resolveCuesForLanguage('en', sessionCues, 'en', 'tr', true);
      expect(resolved).toHaveLength(1);
      expect(resolved[0].targetText).toBe('Hello World');
    });

    it('reuses existing target translations when matching active target language', () => {
      const resolved = resolveCuesForLanguage('tr', sessionCues, 'en', 'tr', true);
      expect(resolved).toHaveLength(1);
      expect(resolved[0].targetText).toBe('Merhaba Dunya');
    });

    it('uses translation from transMap when available', () => {
      const transMap = new Map<string, SubtitleCue[]>([
        ['de', [{ id: '1', start: 0, end: 2, sourceText: 'Hello World', targetText: 'Hallo Welt' }]]
      ]);
      const resolved = resolveCuesForLanguage('de', sessionCues, 'en', 'tr', true, transMap);
      expect(resolved).toHaveLength(1);
      expect(resolved[0].targetText).toBe('Hallo Welt');
    });

    it('safely falls back to sourceText when translation is missing, never leaking active target translation', () => {
      const resolved = resolveCuesForLanguage('de', sessionCues, 'en', 'tr', true, new Map());
      expect(resolved).toHaveLength(1);
      expect(resolved[0].targetText).toBe('Hello World');
      expect(resolved[0].targetText).not.toBe('Merhaba Dunya');
    });
  });

  describe('filterLangsNeedingTranslation', () => {
    const sessionCues: SubtitleCue[] = [
      { id: '1', start: 0, end: 2, sourceText: 'Hello World', targetText: 'Merhaba Dunya' }
    ];

    it('filters out source language and already-translated target language', () => {
      const needed = filterLangsNeedingTranslation(['en', 'tr', 'de', 'es'], sessionCues, 'en', 'tr');
      expect(needed).toEqual(['de', 'es']);
    });

    it('returns empty array when only source and active target are selected', () => {
      const needed = filterLangsNeedingTranslation(['en', 'tr'], sessionCues, 'en', 'tr');
      expect(needed).toEqual([]);
    });

    it('includes target language if cues do not have existing translations', () => {
      const untranslatedCues: SubtitleCue[] = [
        { id: '1', start: 0, end: 2, sourceText: 'Hello World', targetText: '' }
      ];
      const needed = filterLangsNeedingTranslation(['tr'], untranslatedCues, 'en', 'tr');
      expect(needed).toEqual(['tr']);
    });
  });

  describe('downloadSubtitleFile', () => {
    it('creates anchor and triggers click in browser environment', () => {
      const clickMock = vi.fn();
      const appendChildMock = vi.fn();
      const removeChildMock = vi.fn();

      const mockElement = {
        href: '',
        download: '',
        style: { display: '' },
        click: clickMock
      };

      (globalThis as any).window = {};
      (globalThis as any).document = {
        createElement: vi.fn(() => mockElement),
        body: {
          appendChild: appendChildMock,
          removeChild: removeChildMock
        }
      };


      const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
      const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

      downloadSubtitleFile('sample srt', 'subs.srt');

      expect((globalThis as any).document.createElement).toHaveBeenCalledWith('a');
      expect(appendChildMock).toHaveBeenCalledWith(mockElement);
      expect(clickMock).toHaveBeenCalled();
      expect(createObjectURLSpy).toHaveBeenCalled();
      expect(revokeObjectURLSpy).toBeDefined();
    });
  });
});
