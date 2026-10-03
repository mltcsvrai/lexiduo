import { describe, it, expect } from 'vitest';
import {
  aggregateSentenceCues,
  distributeTargetTextToWindows,
  type SentenceGroup
} from '../sentenceSegmentation';
import type { SubtitleCue } from '../../types';

describe('SentenceSegmentation - aggregateSentenceCues', () => {
  it('combines YouTube ASR 3-part speech fragment into a single sentence group', () => {
    const cues: SubtitleCue[] = [
      { id: 'c1', start: 0.0, end: 2.1, sourceText: 'so gemini models tend to be quite' },
      { id: 'c2', start: 2.1, end: 4.2, sourceText: 'efficent in terms of or at least well' },
      { id: 'c3', start: 4.2, end: 6.4, sourceText: 'priced and it does make the parade to' }
    ];

    const groups = aggregateSentenceCues(cues);
    expect(groups).toHaveLength(1);
    expect(groups[0].cues).toHaveLength(3);
    expect(groups[0].start).toBe(0.0);
    expect(groups[0].end).toBe(6.4);
    expect(groups[0].fullSourceText).toBe(
      'so gemini models tend to be quite efficent in terms of or at least well priced and it does make the parade to'
    );
  });

  it('splits into a new group when cue ends with sentence punctuation (.)', () => {
    const cues: SubtitleCue[] = [
      { id: 'c1', start: 0.0, end: 2.0, sourceText: 'This is the first sentence.' },
      { id: 'c2', start: 2.1, end: 4.0, sourceText: 'And this is the second sentence' }
    ];

    const groups = aggregateSentenceCues(cues);
    expect(groups).toHaveLength(2);
    expect(groups[0].cues).toHaveLength(1);
    expect(groups[0].fullSourceText).toBe('This is the first sentence.');
    expect(groups[1].cues).toHaveLength(1);
    expect(groups[1].fullSourceText).toBe('And this is the second sentence');
  });

  it('splits into a new group when speaker silence gap is >= 0.75 seconds', () => {
    const cues: SubtitleCue[] = [
      { id: 'c1', start: 0.0, end: 2.0, sourceText: 'First segment of speech' },
      { id: 'c2', start: 2.8, end: 4.5, sourceText: 'Second segment after 0.8s silence' }
    ];

    const groups = aggregateSentenceCues(cues);
    expect(groups).toHaveLength(2);
    expect(groups[0].end).toBe(2.0);
    expect(groups[1].start).toBe(2.8);
    expect(groups[0].fullSourceText).toBe('First segment of speech');
    expect(groups[1].fullSourceText).toBe('Second segment after 0.8s silence');
  });

  it('splits into a new group when duration reaches ceiling limit (>= 7.5s)', () => {
    const cues: SubtitleCue[] = [
      { id: 'c1', start: 0.0, end: 4.0, sourceText: 'Continuous speech block one' },
      { id: 'c2', start: 4.0, end: 8.0, sourceText: 'Continuous speech block two pushing over ceiling' },
      { id: 'c3', start: 8.0, end: 10.0, sourceText: 'Third speech block' }
    ];

    const groups = aggregateSentenceCues(cues);
    expect(groups).toHaveLength(2);
    expect(groups[0].cues).toHaveLength(2);
    expect(groups[0].start).toBe(0.0);
    expect(groups[0].end).toBe(8.0);
    expect(groups[1].cues).toHaveLength(1);
    expect(groups[1].start).toBe(8.0);
    expect(groups[1].end).toBe(10.0);
  });

  it('handles multilingual punctuation marks including Japanese and Arabic', () => {
    const cues: SubtitleCue[] = [
      { id: 'c1', start: 0.0, end: 2.0, sourceText: 'こんにちは。' },
      { id: 'c2', start: 2.0, end: 4.0, sourceText: '元気ですか？' },
      { id: 'c3', start: 4.0, end: 6.0, sourceText: 'هل أنت متأكد؟' },
      { id: 'c4', start: 6.0, end: 8.0, sourceText: 'نعم بالتأكيد' }
    ];

    const groups = aggregateSentenceCues(cues);
    expect(groups).toHaveLength(4);
    expect(groups[0].fullSourceText).toBe('こんにちは。');
    expect(groups[1].fullSourceText).toBe('元気ですか？');
    expect(groups[2].fullSourceText).toBe('هل أنت متأكد؟');
    expect(groups[3].fullSourceText).toBe('نعم بالتأكيد');
  });

  it('handles empty cues and single cue gracefully', () => {
    expect(aggregateSentenceCues([])).toEqual([]);

    const singleCue: SubtitleCue[] = [
      { id: 's1', start: 1.5, end: 3.5, sourceText: 'Only one cue here' }
    ];
    const groups = aggregateSentenceCues(singleCue);
    expect(groups).toHaveLength(1);
    expect(groups[0].start).toBe(1.5);
    expect(groups[0].end).toBe(3.5);
    expect(groups[0].fullSourceText).toBe('Only one cue here');
  });
});

describe('SentenceSegmentation - distributeTargetTextToWindows', () => {
  it('distributes Turkish full sentence words proportionally across windows without breaking words', () => {
    const group: SentenceGroup = {
      id: 'sg-1',
      start: 0.0,
      end: 6.0,
      fullSourceText: 'so gemini models tend to be quite efficent in terms of or at least well priced',
      cues: [
        { id: 'c1', start: 0.0, end: 2.0, sourceText: 'so gemini models tend to be quite' },
        { id: 'c2', start: 2.0, end: 4.0, sourceText: 'efficent in terms of or at least' },
        { id: 'c3', start: 4.0, end: 6.0, sourceText: 'well priced' }
      ]
    };

    const targetText = 'Gemini modelleri oldukça verimli veya en azından uygun fiyatlı olma eğilimindedir';
    const distributed = distributeTargetTextToWindows(group, targetText);

    expect(distributed).toHaveLength(3);
    expect(distributed.every(c => c.isAiTranslated === true)).toBe(true);

    // Verify all original words are intact and ordered
    const combinedTarget = distributed.map(c => c.targetText).join(' ');
    expect(combinedTarget).toBe(targetText);

    // Verify each window received meaningful text without cutting
    expect(distributed[0].targetText).toBe('Gemini modelleri oldukça verimli');
    expect(distributed[1].targetText).toBe('veya en azından');
    expect(distributed[2].targetText).toBe('uygun fiyatlı olma eğilimindedir');
  });

  it('applies -1 rule: merges micro parts (< 0.6s) with next or previous window', () => {
    // 1. Initial micro part merged with next
    const groupWithInitialMicro: SentenceGroup = {
      id: 'sg-micro-1',
      start: 0.0,
      end: 2.5,
      fullSourceText: 'ok let us begin',
      cues: [
        { id: 'm1', start: 0.0, end: 0.4, sourceText: 'ok' },
        { id: 'm2', start: 0.4, end: 2.5, sourceText: 'let us begin' }
      ]
    };

    const res1 = distributeTargetTextToWindows(groupWithInitialMicro, 'Tamam başlayalım');
    expect(res1).toHaveLength(1);
    expect(res1[0].start).toBe(0.0);
    expect(res1[0].end).toBe(2.5);
    expect(res1[0].sourceText).toBe('ok let us begin');
    expect(res1[0].targetText).toBe('Tamam başlayalım');

    // 2. Trailing micro part merged with previous
    const groupWithTrailingMicro: SentenceGroup = {
      id: 'sg-micro-2',
      start: 0.0,
      end: 2.4,
      fullSourceText: 'see you next time bye',
      cues: [
        { id: 'm1', start: 0.0, end: 2.0, sourceText: 'see you next time' },
        { id: 'm2', start: 2.0, end: 2.4, sourceText: 'bye' }
      ]
    };

    const res2 = distributeTargetTextToWindows(groupWithTrailingMicro, 'Görüşmek üzere hoşça kalın');
    expect(res2).toHaveLength(1);
    expect(res2[0].start).toBe(0.0);
    expect(res2[0].end).toBe(2.4);
    expect(res2[0].sourceText).toBe('see you next time bye');
    expect(res2[0].targetText).toBe('Görüşmek üzere hoşça kalın');
  });

  it('applies +1 rule: splits excessively long parts (> 3.8s) into two equal windows', () => {
    const group: SentenceGroup = {
      id: 'sg-long',
      start: 0.0,
      end: 5.0,
      fullSourceText: 'this is a continuous and very long explanation of the architecture',
      cues: [
        {
          id: 'c_long',
          start: 0.0,
          end: 5.0,
          sourceText: 'this is a continuous and very long explanation of the architecture'
        }
      ]
    };

    const targetText = 'Bu mimarinin kesintisiz ve çok uzun bir açıklamasıdır';
    const distributed = distributeTargetTextToWindows(group, targetText);

    expect(distributed).toHaveLength(2);
    expect(distributed[0].start).toBe(0.0);
    expect(distributed[0].end).toBe(2.5);
    expect(distributed[1].start).toBe(2.5);
    expect(distributed[1].end).toBe(5.0);
    expect(distributed[0].isAiTranslated).toBe(true);
    expect(distributed[1].isAiTranslated).toBe(true);
    expect(`${distributed[0].targetText} ${distributed[1].targetText}`).toBe(targetText);
  });

  it('handles edge-cases: empty group, single words, and empty targetText safely without crashing', () => {
    // Empty cues in group
    const emptyGroup: SentenceGroup = {
      id: 'empty',
      start: 0,
      end: 0,
      fullSourceText: '',
      cues: []
    };
    expect(distributeTargetTextToWindows(emptyGroup, '')).toEqual([]);

    // Single cue and single target word
    const singleWordGroup: SentenceGroup = {
      id: 'sg-single',
      start: 1.0,
      end: 2.5,
      fullSourceText: 'Hello',
      cues: [{ id: 'c1', start: 1.0, end: 2.5, sourceText: 'Hello' }]
    };
    const resSingle = distributeTargetTextToWindows(singleWordGroup, 'Merhaba');
    expect(resSingle).toHaveLength(1);
    expect(resSingle[0].start).toBe(1.0);
    expect(resSingle[0].end).toBe(2.5);
    expect(resSingle[0].targetText).toBe('Merhaba');

    // Empty target text should not throw
    const resEmptyText = distributeTargetTextToWindows(singleWordGroup, '');
    expect(resEmptyText).toHaveLength(1);
    expect(resEmptyText[0].targetText).toBe('');
  });
});
