import { Preferences } from '@capacitor/preferences';
import { get, set } from 'idb-keyval';

export const PRIMARY_KEY_NAME = 'lexiduo_gemini_key';
export const LEGACY_KEY_NAME = 'yt_ceviri_gemini_key';
export const OLDEST_KEY_NAME = 'gemini_api_key';

const ALL_STORAGE_KEYS = [PRIMARY_KEY_NAME, LEGACY_KEY_NAME, OLDEST_KEY_NAME];

/**
 * Persists Gemini API key across all three storage layers:
 * 1. Native Android SharedPreferences (Survives app updates & process restarts)
 * 2. Web localStorage (Synchronous, resilient browser storage)
 * 3. IndexedDB via idb-keyval (Async web database)
 */
export async function persistApiKey(rawKey: string): Promise<void> {
  const cleanKey = (rawKey || '').trim();

  // 1. Native SharedPreferences via @capacitor/preferences
  try {
    for (const k of ALL_STORAGE_KEYS) {
      await Preferences.set({ key: k, value: cleanKey });
    }
  } catch (err) {
    console.warn('[apiKeyStorage] Preferences.set warning:', err);
  }

  // 2. Web localStorage
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      if (cleanKey) {
        for (const k of ALL_STORAGE_KEYS) {
          localStorage.setItem(k, cleanKey);
        }
      } else {
        for (const k of ALL_STORAGE_KEYS) {
          localStorage.removeItem(k);
        }
      }
    } catch (err) {
      console.warn('[apiKeyStorage] localStorage.setItem warning:', err);
    }
  }

  // 3. IndexedDB
  try {
    for (const k of ALL_STORAGE_KEYS) {
      await set(k, cleanKey);
    }
  } catch (err) {
    console.warn('[apiKeyStorage] idb-keyval set warning:', err);
  }
}

/**
 * Self-healing retrieval of Gemini API key from the most durable available layer:
 * Hierarchy: Preferences -> localStorage -> IndexedDB.
 * If found in any lower tier, automatically self-heals upper tiers.
 */
export async function retrieveApiKey(): Promise<string> {
  let resolvedKey = '';

  // 1. Try Native SharedPreferences (highest durability, survives APK updates)
  try {
    for (const k of ALL_STORAGE_KEYS) {
      const prefResult = await Preferences.get({ key: k });
      if (prefResult?.value && prefResult.value.trim().length > 0) {
        resolvedKey = prefResult.value.trim();
        break;
      }
    }
  } catch (err) {
    console.warn('[apiKeyStorage] Preferences.get warning:', err);
  }

  // 2. Try localStorage if not found yet
  if (!resolvedKey && typeof window !== 'undefined' && window.localStorage) {
    try {
      for (const k of ALL_STORAGE_KEYS) {
        const localVal = localStorage.getItem(k);
        if (localVal && localVal.trim().length > 0) {
          resolvedKey = localVal.trim();
          break;
        }
      }
    } catch (err) {
      console.warn('[apiKeyStorage] localStorage.getItem warning:', err);
    }
  }

  // 3. Try IndexedDB if not found yet
  if (!resolvedKey) {
    try {
      for (const k of ALL_STORAGE_KEYS) {
        const idbVal = await get<string>(k);
        if (idbVal && idbVal.trim().length > 0) {
          resolvedKey = idbVal.trim();
          break;
        }
      }
    } catch (err) {
      console.warn('[apiKeyStorage] idb-keyval get warning:', err);
    }
  }

  // Self-heal: If found in any layer, replicate to all layers immediately
  if (resolvedKey) {
    persistApiKey(resolvedKey).catch(() => {});
  }

  return resolvedKey;
}
