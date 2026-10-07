import { Preferences } from '@capacitor/preferences';
import { get, set } from 'idb-keyval';

export const PRIMARY_KEY_NAME = 'yt_ceviri_gemini_key';
export const LEGACY_KEY_NAME = 'gemini_api_key';

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
    await Preferences.set({ key: PRIMARY_KEY_NAME, value: cleanKey });
    await Preferences.set({ key: LEGACY_KEY_NAME, value: cleanKey });
  } catch (err) {
    console.warn('[apiKeyStorage] Preferences.set warning:', err);
  }

  // 2. Web localStorage
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      if (cleanKey) {
        localStorage.setItem(PRIMARY_KEY_NAME, cleanKey);
        localStorage.setItem(LEGACY_KEY_NAME, cleanKey);
      } else {
        localStorage.removeItem(PRIMARY_KEY_NAME);
        localStorage.removeItem(LEGACY_KEY_NAME);
      }
    } catch (err) {
      console.warn('[apiKeyStorage] localStorage.setItem warning:', err);
    }
  }

  // 3. IndexedDB
  try {
    await set(PRIMARY_KEY_NAME, cleanKey);
    await set(LEGACY_KEY_NAME, cleanKey);
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
    const prefResult = await Preferences.get({ key: PRIMARY_KEY_NAME });
    if (prefResult?.value && prefResult.value.trim().length > 0) {
      resolvedKey = prefResult.value.trim();
    } else {
      const legacyPref = await Preferences.get({ key: LEGACY_KEY_NAME });
      if (legacyPref?.value && legacyPref.value.trim().length > 0) {
        resolvedKey = legacyPref.value.trim();
      }
    }
  } catch (err) {
    console.warn('[apiKeyStorage] Preferences.get warning:', err);
  }

  // 2. Try localStorage if not found yet
  if (!resolvedKey && typeof window !== 'undefined' && window.localStorage) {
    try {
      const localVal = localStorage.getItem(PRIMARY_KEY_NAME) || localStorage.getItem(LEGACY_KEY_NAME);
      if (localVal && localVal.trim().length > 0) {
        resolvedKey = localVal.trim();
      }
    } catch (err) {
      console.warn('[apiKeyStorage] localStorage.getItem warning:', err);
    }
  }

  // 3. Try IndexedDB if not found yet
  if (!resolvedKey) {
    try {
      const idbVal1 = await get<string>(PRIMARY_KEY_NAME);
      const idbVal2 = await get<string>(LEGACY_KEY_NAME);
      const idbVal = (idbVal1 && idbVal1.trim()) || (idbVal2 && idbVal2.trim());
      if (idbVal) {
        resolvedKey = idbVal;
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
