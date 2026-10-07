import { describe, it, expect, vi, beforeEach } from 'vitest';
import { lookupWord } from '../dictionaryService';
import * as translationService from '../translationService';

describe('dictionaryService - Bidirectional Word Lookup', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('translates source word into target language (Turkish -> Spanish)', async () => {
    const spy = vi.spyOn(translationService, 'translateTextSecure').mockResolvedValue('hola');

    const result = await lookupWord('merhaba', 'auto', 'es', false, undefined, 'tr');

    expect(spy).toHaveBeenCalledWith('merhaba', 'auto', 'es');
    expect(result.translation).toBe('hola');
    expect(result.partOfSpeech).toBe('ES');
    expect(result.isTargetWord).toBe(false);
  });

  it('translates target word into detected source language (Spanish -> Turkish, NOT English)', async () => {
    const spy = vi.spyOn(translationService, 'translateTextSecure').mockResolvedValue('merhaba');

    const result = await lookupWord('hola', 'auto', 'es', true, undefined, 'tr');

    // Crucial check: sl must be 'es', tl must be 'tr' (NEVER 'auto' or 'en')
    expect(spy).toHaveBeenCalledWith('hola', 'es', 'tr');
    expect(result.translation).toBe('merhaba');
    expect(result.partOfSpeech).toBe('TR');
    expect(result.isTargetWord).toBe(true);
  });

  it('falls back to Turkish when sourceLang is auto and target is Spanish without detectedLang', async () => {
    const spy = vi.spyOn(translationService, 'translateTextSecure').mockResolvedValue('kelime');

    const result = await lookupWord('palabra', 'auto', 'es', true);

    expect(spy).toHaveBeenCalledWith('palabra', 'es', 'tr');
    expect(result.translation).toBe('kelime');
    expect(result.partOfSpeech).toBe('TR');
  });

  it('falls back to English when targetLang is Turkish and source is auto', async () => {
    const spy = vi.spyOn(translationService, 'translateTextSecure').mockResolvedValue('word');

    const result = await lookupWord('kelime', 'auto', 'tr', true);

    expect(spy).toHaveBeenCalledWith('kelime', 'tr', 'en');
    expect(result.translation).toBe('word');
    expect(result.partOfSpeech).toBe('EN');
  });

  it('respects explicit sourceLang when user configures non-auto language', async () => {
    const spy = vi.spyOn(translationService, 'translateTextSecure').mockResolvedValue('gut');

    const result = await lookupWord('bien', 'es', 'de', false);

    expect(spy).toHaveBeenCalledWith('bien', 'es', 'de');
    expect(result.translation).toBe('gut');
    expect(result.partOfSpeech).toBe('DE');
  });

  it('handles empty or symbol-only words without network calls', async () => {
    const spy = vi.spyOn(translationService, 'translateTextSecure');

    const result = await lookupWord('...!!!', 'auto', 'es', true, undefined, 'tr');

    expect(spy).not.toHaveBeenCalled();
    expect(result.word).toBe('...!!!');
    expect(result.translation).toBe('');
    expect(result.partOfSpeech).toBe('TR');
  });

  it('defensively sanitizes toLang in translateTextSecure if auto is passed', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '["merhaba"]',
      json: async () => ['merhaba'],
      arrayBuffer: async () => new ArrayBuffer(0)
    } as any);

    const res = await translationService.translateTextSecure('hola', 'es', 'auto');

    expect(res).toBe('merhaba');
    expect(fetchSpy).toHaveBeenCalled();
    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain('tl=tr');
    expect(calledUrl).not.toContain('tl=auto');
  });
});
