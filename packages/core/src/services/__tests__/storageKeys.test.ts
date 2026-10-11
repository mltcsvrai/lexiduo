import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as idbKeyval from 'idb-keyval';
import {
  STORAGE_KEYS,
  getCompatItem,
  setCompatItem,
  delCompatItem,
  loadAppPreferences
} from '../storageKeys';
import * as apiKeyStorage from '../apiKeyStorage';

vi.mock('idb-keyval', () => {
  const store = new Map<string, any>();
  return {
    get: vi.fn(async (key: string) => store.get(key)),
    set: vi.fn(async (key: string, val: any) => {
      store.set(key, val);
    }),
    del: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    _store: store
  };
});

describe('storageKeys service', () => {
  const mockStore = (idbKeyval as any)._store as Map<string, any>;

  beforeEach(() => {
    mockStore.clear();
    vi.clearAllMocks();
  });

  it('defines STORAGE_KEYS correctly with primary and legacy names', () => {
    expect(STORAGE_KEYS.VIDEO_ID.primary).toBe('lexiduo_video_id');
    expect(STORAGE_KEYS.VIDEO_ID.legacy).toBe('yt_ceviri_video_id');
    expect(STORAGE_KEYS.HISTORY_LIST.primary).toBe('lexiduo_history_list');
    expect(STORAGE_KEYS.HISTORY_LIST.legacy).toBe('yt_ceviri_history_list');
  });

  it('reads from primary key if present in getCompatItem', async () => {
    mockStore.set('lexiduo_history_list', [{ videoId: 'abc' }]);
    mockStore.set('yt_ceviri_history_list', [{ videoId: 'legacy' }]);

    const result = await getCompatItem<any[]>('lexiduo_history_list', 'yt_ceviri_history_list');
    expect(result).toEqual([{ videoId: 'abc' }]);
  });

  it('falls back to legacy key if primary is missing in getCompatItem', async () => {
    mockStore.set('yt_ceviri_history_list', [{ videoId: 'legacy' }]);

    const result = await getCompatItem<any[]>('lexiduo_history_list', 'yt_ceviri_history_list');
    expect(result).toEqual([{ videoId: 'legacy' }]);
  });

  it('writes to both primary and legacy key in setCompatItem', async () => {
    await setCompatItem('lexiduo_test', 'yt_ceviri_test', 'value123');
    expect(mockStore.get('lexiduo_test')).toBe('value123');
    expect(mockStore.get('yt_ceviri_test')).toBe('value123');
  });

  it('deletes both primary and legacy key in delCompatItem', async () => {
    mockStore.set('lexiduo_test', 'val');
    mockStore.set('yt_ceviri_test', 'val');

    await delCompatItem('lexiduo_test', 'yt_ceviri_test');
    expect(mockStore.has('lexiduo_test')).toBe(false);
    expect(mockStore.has('yt_ceviri_test')).toBe(false);
  });

  it('loads preferences with backward compatibility fallback in loadAppPreferences', async () => {
    vi.spyOn(apiKeyStorage, 'retrieveApiKey').mockResolvedValue('test-api-key');
    mockStore.set('yt_ceviri_video_id', 'legacyVid123');
    mockStore.set('lexiduo_subtitle_bg', false);
    mockStore.set('yt_ceviri_history_limit', 15);

    const prefs = await loadAppPreferences();
    expect(prefs.apiKey).toBe('test-api-key');
    expect(prefs.videoId).toBe('legacyVid123');
    expect(prefs.subtitleBg).toBe(false);
    expect(prefs.historyLimit).toBe(15);
  });
});
