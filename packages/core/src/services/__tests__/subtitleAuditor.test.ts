import { describe, it, expect } from 'vitest';
import { isCueUntranslated, auditAndRepairCues } from '../subtitleAuditor';
import type { SubtitleCue } from '../../types';

describe('SubtitleAuditor - isCueUntranslated', () => {
  it('should flag cue as untranslated if targetText is empty', () => {
    const cue: SubtitleCue = {
      id: '1',
      start: 0,
      end: 2,
      sourceText: 'Hello world',
      targetText: ''
    };
    expect(isCueUntranslated(cue, 'en', 'tr')).toBe(true);
  });

  it('should NOT flag cue if it is already translated into Turkish', () => {
    const cue: SubtitleCue = {
      id: '2',
      start: 2,
      end: 4,
      sourceText: 'Hello world',
      targetText: 'Merhaba dünya'
    };
    expect(isCueUntranslated(cue, 'en', 'tr')).toBe(false);
  });

  it('should flag cue as untranslated if multi-word targetText exactly equals sourceText', () => {
    const cue: SubtitleCue = {
      id: '3',
      start: 4,
      end: 6,
      sourceText: 'Welcome to our channel',
      targetText: 'Welcome to our channel'
    };
    expect(isCueUntranslated(cue, 'en', 'tr')).toBe(true);
  });

  it('should NOT flag pure numbers, symbols or punctuation', () => {
    const numCue: SubtitleCue = {
      id: '4',
      start: 6,
      end: 8,
      sourceText: '1995',
      targetText: '1995'
    };
    expect(isCueUntranslated(numCue, 'en', 'tr')).toBe(false);
  });

  it('should NOT flag if sourceLang is the same as targetLang', () => {
    const sameLangCue: SubtitleCue = {
      id: '5',
      start: 8,
      end: 10,
      sourceText: 'English text here',
      targetText: 'English text here'
    };
    expect(isCueUntranslated(sameLangCue, 'en', 'en')).toBe(false);
  });

  it('should flag English text left behind when target is Turkish via stopword heuristic', () => {
    const englishLeftCue: SubtitleCue = {
      id: '6',
      start: 10,
      end: 12,
      sourceText: 'Here is the way with them',
      targetText: 'Here is the way with them'
    };
    expect(isCueUntranslated(englishLeftCue, 'en', 'tr')).toBe(true);
  });
});

describe('SubtitleAuditor - auditAndRepairCues', () => {
  const mockTranslate = async (text: string) => {
    if (text.includes('\n')) {
      return text.split('\n').map(line => `[TR] ${line}`).join('\n');
    }
    return `[TR] ${text}`;
  };

  it('should leave all cues intact if all are already translated', async () => {
    const cues: SubtitleCue[] = [
      { id: '1', start: 0, end: 2, sourceText: 'Good morning', targetText: 'Günaydın' },
      { id: '2', start: 2, end: 4, sourceText: 'How are you', targetText: 'Nasılsınız' }
    ];

    const result = await auditAndRepairCues(cues, 'en', 'tr', mockTranslate);
    expect(result.repairedCount).toBe(0);
    expect(result.repairedCues[0].targetText).toBe('Günaydın');
    expect(result.repairedCues[1].targetText).toBe('Nasılsınız');
  });

  it('should surgically repair ONLY untranslated cues without mutating translated ones', async () => {
    const cues: SubtitleCue[] = [
      { id: '1', start: 0, end: 2, sourceText: 'Hello', targetText: 'Merhaba' },
      { id: '2', start: 2, end: 4, sourceText: 'This is great news', targetText: '' }, // EMPTY -> NEEDS REPAIR
      { id: '3', start: 4, end: 6, sourceText: 'Thank you', targetText: 'Teşekkürler' },
      { id: '4', start: 6, end: 8, sourceText: 'See you next time', targetText: 'See you next time' } // IDENTICAL -> NEEDS REPAIR
    ];

    const result = await auditAndRepairCues(cues, 'en', 'tr', mockTranslate);
    
    expect(result.repairedCount).toBe(2);
    // Unchanged items
    expect(result.repairedCues[0].targetText).toBe('Merhaba');
    expect(result.repairedCues[2].targetText).toBe('Teşekkürler');
    // Repaired items
    expect(result.repairedCues[1].targetText).toBe('[TR] This is great news');
    expect(result.repairedCues[3].targetText).toBe('[TR] See you next time');
  });
});
