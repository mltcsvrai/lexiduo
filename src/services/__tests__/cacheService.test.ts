import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCachedTranscript, cacheTranscript } from '../cacheService';
import * as idbKeyval from 'idb-keyval';

vi.mock('idb-keyval', () => ({
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn()
}));

describe('cacheService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(idbKeyval.get).mockResolvedValue(undefined);
    vi.mocked(idbKeyval.set).mockResolvedValue(undefined);
  });

  it('should return null if cache is empty', async () => {
    vi.mocked(idbKeyval.get).mockResolvedValueOnce(undefined);
    const result = await getCachedTranscript('test-video-id', 'en', 'tr');
    expect(result).toBeNull();
    expect(idbKeyval.get).toHaveBeenCalledWith('transcript_test-video-id_en_tr');
  });

  it('should return transcript if cached', async () => {
    const mockData = { cues: [{ id: '1', start: 0, end: 1, sourceText: 'Hello', targetText: 'Merhaba' }], isAiTranslated: true };
    vi.mocked(idbKeyval.get).mockResolvedValueOnce(mockData);
    
    const result = await getCachedTranscript('test-video-id', 'en', 'tr');
    expect(result).toEqual(mockData);
  });

  it('should save transcript to cache', async () => {
    const mockCues = [
      { id: '1', start: 0, end: 1, sourceText: 'hello', targetText: 'merhaba' }
    ];
    await cacheTranscript('test-video-id', 'en', 'tr', mockCues, true);
    
    expect(idbKeyval.set).toHaveBeenCalledWith('transcript_test-video-id_en_tr', {
      cues: mockCues,
      isAiTranslated: true
    });
  });

  it('should not cache if cues are empty', async () => {
    await cacheTranscript('test-video-id', 'en', 'tr', [], true);
    expect(idbKeyval.set).not.toHaveBeenCalled();
  });
});
