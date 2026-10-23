import { get, set, del } from 'idb-keyval';
import { withBackgroundTask } from '@lexiduo/core';

export interface MarianModelPair {
  id: string; // e.g. 'en-tr'
  sourceLang: string;
  targetLang: string;
  sourceName: string;
  targetName: string;
  sourceFlag: string;
  targetFlag: string;
  modelId: string;
  sizeMB: number;
  targetGroup: 'tr' | 'en';
}

export const MARIAN_MODEL_PAIRS: MarianModelPair[] = [
  // Hedef Türkçe Modelleri (~40-45 MB)
  {
    id: 'en-tr',
    sourceLang: 'en',
    targetLang: 'tr',
    sourceName: 'İngilizce / English',
    targetName: 'Türkçe',
    sourceFlag: '🇬🇧',
    targetFlag: '🇹🇷',
    modelId: 'Xenova/opus-mt-en-tr',
    sizeMB: 42,
    targetGroup: 'tr'
  },
  {
    id: 'de-tr',
    sourceLang: 'de',
    targetLang: 'tr',
    sourceName: 'Almanca / Deutsch',
    targetName: 'Türkçe',
    sourceFlag: '🇩🇪',
    targetFlag: '🇹🇷',
    modelId: 'Xenova/opus-mt-de-tr',
    sizeMB: 43,
    targetGroup: 'tr'
  },
  {
    id: 'fr-tr',
    sourceLang: 'fr',
    targetLang: 'tr',
    sourceName: 'Fransızca / Français',
    targetName: 'Türkçe',
    sourceFlag: '🇫🇷',
    targetFlag: '🇹🇷',
    modelId: 'Xenova/opus-mt-fr-tr',
    sizeMB: 43,
    targetGroup: 'tr'
  },
  {
    id: 'es-tr',
    sourceLang: 'es',
    targetLang: 'tr',
    sourceName: 'İspanyolca / Español',
    targetName: 'Türkçe',
    sourceFlag: '🇪🇸',
    targetFlag: '🇹🇷',
    modelId: 'Xenova/opus-mt-es-tr',
    sizeMB: 43,
    targetGroup: 'tr'
  },
  {
    id: 'ru-tr',
    sourceLang: 'ru',
    targetLang: 'tr',
    sourceName: 'Rusça / Русский',
    targetName: 'Türkçe',
    sourceFlag: '🇷🇺',
    targetFlag: '🇹🇷',
    modelId: 'Xenova/opus-mt-ru-tr',
    sizeMB: 45,
    targetGroup: 'tr'
  },
  {
    id: 'it-tr',
    sourceLang: 'it',
    targetLang: 'tr',
    sourceName: 'İtalyanca / Italiano',
    targetName: 'Türkçe',
    sourceFlag: '🇮🇹',
    targetFlag: '🇹🇷',
    modelId: 'Xenova/opus-mt-it-tr',
    sizeMB: 42,
    targetGroup: 'tr'
  },
  {
    id: 'ar-tr',
    sourceLang: 'ar',
    targetLang: 'tr',
    sourceName: 'Arapça / العربية',
    targetName: 'Türkçe',
    sourceFlag: '🇸🇦',
    targetFlag: '🇹🇷',
    modelId: 'Xenova/opus-mt-ar-tr',
    sizeMB: 44,
    targetGroup: 'tr'
  },

  // Hedef İngilizce Modelleri (~38-46 MB)
  {
    id: 'tr-en',
    sourceLang: 'tr',
    targetLang: 'en',
    sourceName: 'Türkçe',
    targetName: 'İngilizce / English',
    sourceFlag: '🇹🇷',
    targetFlag: '🇬🇧',
    modelId: 'Xenova/opus-mt-tr-en',
    sizeMB: 42,
    targetGroup: 'en'
  },
  {
    id: 'es-en',
    sourceLang: 'es',
    targetLang: 'en',
    sourceName: 'İspanyolca / Español',
    targetName: 'İngilizce / English',
    sourceFlag: '🇪🇸',
    targetFlag: '🇬🇧',
    modelId: 'Xenova/opus-mt-es-en',
    sizeMB: 40,
    targetGroup: 'en'
  },
  {
    id: 'de-en',
    sourceLang: 'de',
    targetLang: 'en',
    sourceName: 'Almanca / Deutsch',
    targetName: 'İngilizce / English',
    sourceFlag: '🇩🇪',
    targetFlag: '🇬🇧',
    modelId: 'Xenova/opus-mt-de-en',
    sizeMB: 41,
    targetGroup: 'en'
  },
  {
    id: 'fr-en',
    sourceLang: 'fr',
    targetLang: 'en',
    sourceName: 'Fransızca / Français',
    targetName: 'İngilizce / English',
    sourceFlag: '🇫🇷',
    targetFlag: '🇬🇧',
    modelId: 'Xenova/opus-mt-fr-en',
    sizeMB: 41,
    targetGroup: 'en'
  },
  {
    id: 'ru-en',
    sourceLang: 'ru',
    targetLang: 'en',
    sourceName: 'Rusça / Русский',
    targetName: 'İngilizce / English',
    sourceFlag: '🇷🇺',
    targetFlag: '🇬🇧',
    modelId: 'Xenova/opus-mt-ru-en',
    sizeMB: 44,
    targetGroup: 'en'
  },
  {
    id: 'zh-en',
    sourceLang: 'zh',
    targetLang: 'en',
    sourceName: 'Çince / 中文',
    targetName: 'İngilizce / English',
    sourceFlag: '🇨🇳',
    targetFlag: '🇬🇧',
    modelId: 'Xenova/opus-mt-zh-en',
    sizeMB: 46,
    targetGroup: 'en'
  },
  {
    id: 'ja-en',
    sourceLang: 'ja',
    targetLang: 'en',
    sourceName: 'Japonca / 日本語',
    targetName: 'İngilizce / English',
    sourceFlag: '🇯🇵',
    targetFlag: '🇬🇧',
    modelId: 'Xenova/opus-mt-ja-en',
    sizeMB: 46,
    targetGroup: 'en'
  }
];

export const MARIAN_MODEL_CHANGED_EVENT = 'lexiduo_marian_model_changed';
const STORAGE_PREFIX = 'marian_model_downloaded_';
const ACTIVE_PAIR_KEY = 'marian_active_pair';

// In-memory cache for loaded pipelines
const cachedMarianPipelines = new Map<string, any>();

export interface MarianModelMetadata {
  pairId: string;
  modelId: string;
  sizeMB: number;
  downloadedAt: number;
}

/**
 * Checks if a specific MarianMT model pair is downloaded.
 */
export async function isMarianModelDownloaded(pairId: string): Promise<boolean> {
  try {
    const meta = await get<MarianModelMetadata>(`${STORAGE_PREFIX}${pairId}`);
    return !!meta && !!meta.downloadedAt;
  } catch {
    return false;
  }
}

/**
 * Returns a list of all downloaded MarianMT pair IDs.
 */
export async function getDownloadedMarianModels(): Promise<string[]> {
  const downloaded: string[] = [];
  await Promise.all(
    MARIAN_MODEL_PAIRS.map(async (pair) => {
      const isDownloaded = await isMarianModelDownloaded(pair.id);
      if (isDownloaded) {
        downloaded.push(pair.id);
      }
    })
  );
  return downloaded;
}

/**
 * Gets the currently active MarianMT model pair ID.
 */
export async function getActiveMarianModel(): Promise<string | null> {
  try {
    const active = await get<string>(ACTIVE_PAIR_KEY);
    if (active && (await isMarianModelDownloaded(active))) {
      return active;
    }
    const downloaded = await getDownloadedMarianModels();
    return downloaded[0] || null;
  } catch {
    return null;
  }
}

/**
 * Sets the active MarianMT model pair ID.
 */
export async function setActiveMarianModel(pairId: string | null): Promise<void> {
  try {
    if (pairId) {
      await set(ACTIVE_PAIR_KEY, pairId);
    } else {
      await del(ACTIVE_PAIR_KEY);
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(MARIAN_MODEL_CHANGED_EVENT, { detail: { activePairId: pairId } }));
    }
  } catch (err) {
    console.warn('Failed to set active Marian model:', err);
  }
}

/**
 * Downloads a MarianMT model pair from HuggingFace via Transformers.js pipeline.
 */
export async function downloadMarianModel(
  pairId: string,
  onProgress?: (pct: number) => void
): Promise<boolean> {
  const pair = MARIAN_MODEL_PAIRS.find((p) => p.id === pairId);
  if (!pair) {
    throw new Error(`MarianMT model pair "${pairId}" not found`);
  }

  const taskId = `download_marian_${pairId}`;
  const taskTitle = `Marian AI (${pair.id.toUpperCase()})`;

  return await withBackgroundTask(taskId, taskTitle, async (updateBg) => {
    updateBg('Hazırlanıyor...', 0);
    try {
      const { env, pipeline } = await import('@huggingface/transformers');
      env.allowLocalModels = false;
      env.useBrowserCache = true;

      if (env.backends?.onnx?.wasm) {
        const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';
        if (hasSharedArrayBuffer) {
          const cores = typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 4;
          env.backends.onnx.wasm.numThreads = Math.min(4, Math.max(2, Math.floor(cores / 2)));
          env.backends.onnx.wasm.proxy = true;
        } else {
          env.backends.onnx.wasm.numThreads = 1;
        }
      }

      let lastReportedProgress = 0;
      const progress_callback = (item: any) => {
        if ((item.status === 'progress_total' || item.status === 'progress') && typeof item.progress === 'number') {
          const pct = Math.min(99, Math.max(lastReportedProgress, Math.round(item.progress)));
          lastReportedProgress = pct;
          onProgress?.(pct);
          updateBg(`%${pct} indirildi`, pct);
        } else if (item.status === 'done') {
          lastReportedProgress = Math.max(lastReportedProgress, 99);
          onProgress?.(lastReportedProgress);
          updateBg('%99 tamamlandı', lastReportedProgress);
        }
      };

      const translator = await pipeline('translation', pair.modelId, {
        dtype: 'q8',
        device: 'wasm',
        progress_callback
      });

      // Cache pipeline in memory for instant reuse
      cachedMarianPipelines.set(pair.id, translator);

      const meta: MarianModelMetadata = {
        pairId: pair.id,
        modelId: pair.modelId,
        sizeMB: pair.sizeMB,
        downloadedAt: Date.now()
      };
      await set(`${STORAGE_PREFIX}${pair.id}`, meta);

      const currentActive = await get<string>(ACTIVE_PAIR_KEY);
      if (!currentActive) {
        await set(ACTIVE_PAIR_KEY, pair.id);
      }

      onProgress?.(100);
      updateBg('%100 tamamlandı', 100);

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(MARIAN_MODEL_CHANGED_EVENT, { detail: { pairId: pair.id } }));
      }
      return true;
    } catch (err: any) {
      console.error(`Failed to download Marian model ${pairId}:`, err);
      throw err;
    }
  });
}

/**
 * Deletes a downloaded MarianMT model pair from Cache API and local storage.
 */
export async function deleteMarianModel(pairId: string): Promise<void> {
  const pair = MARIAN_MODEL_PAIRS.find((p) => p.id === pairId);
  if (!pair) return;

  cachedMarianPipelines.delete(pair.id);
  await del(`${STORAGE_PREFIX}${pair.id}`);

  // Delete weights from Transformers Cache API
  if (typeof window !== 'undefined' && 'caches' in window) {
    try {
      const cache = await window.caches.open('transformers-cache');
      const requests = await cache.keys();
      for (const req of requests) {
        if (req.url.includes(pair.modelId)) {
          await cache.delete(req);
        }
      }
    } catch (cacheErr) {
      console.warn('Failed to clean Marian model from cache:', cacheErr);
    }
  }

  // Update active model if needed
  const active = await get<string>(ACTIVE_PAIR_KEY);
  if (active === pair.id) {
    const downloaded = await getDownloadedMarianModels();
    const next = downloaded.find((id) => id !== pair.id) || null;
    await setActiveMarianModel(next);
  } else {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(MARIAN_MODEL_CHANGED_EVENT, { detail: { pairId } }));
    }
  }
}

/**
 * Translates text using downloaded MarianMT neural machine translation pipeline.
 */
export async function translateWithMarian(
  text: string,
  fromLang: string = 'auto',
  toLang: string = 'tr'
): Promise<string> {
  if (!text || !text.trim()) return text;

  const cleanFrom = (fromLang || 'auto').replace(/^a\./, '').split('-')[0].toLowerCase();
  const cleanTo = (toLang || 'tr').replace(/^a\./, '').split('-')[0].toLowerCase();

  // 1. Find matching model pair
  let targetPair: MarianModelPair | undefined;
  if (cleanFrom !== 'auto') {
    targetPair = MARIAN_MODEL_PAIRS.find(
      (p) => p.sourceLang === cleanFrom && p.targetLang === cleanTo
    );
  } else {
    // If 'auto', prefer the active model if its target matches, else any downloaded pair for target
    const activeId = await getActiveMarianModel();
    if (activeId) {
      const activePair = MARIAN_MODEL_PAIRS.find((p) => p.id === activeId);
      if (activePair && activePair.targetLang === cleanTo) {
        targetPair = activePair;
      }
    }
    if (!targetPair) {
      const downloaded = await getDownloadedMarianModels();
      for (const dId of downloaded) {
        const p = MARIAN_MODEL_PAIRS.find((item) => item.id === dId);
        if (p && p.targetLang === cleanTo) {
          targetPair = p;
          break;
        }
      }
    }
  }

  if (!targetPair) {
    return text;
  }

  const isDownloaded = await isMarianModelDownloaded(targetPair.id);
  if (!isDownloaded) {
    return text;
  }

  // 2. Load or reuse cached pipeline
  let translator = cachedMarianPipelines.get(targetPair.id);
  if (!translator) {
    const { env, pipeline } = await import('@huggingface/transformers');
    env.allowLocalModels = false;
    env.useBrowserCache = true;

    if (env.backends?.onnx?.wasm) {
      const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';
      if (hasSharedArrayBuffer) {
        const cores = typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 4;
        env.backends.onnx.wasm.numThreads = Math.min(4, Math.max(2, Math.floor(cores / 2)));
        env.backends.onnx.wasm.proxy = true;
      } else {
        env.backends.onnx.wasm.numThreads = 1;
      }
    }

    translator = await pipeline('translation', targetPair.modelId, {
      dtype: 'q8',
      device: 'wasm'
    });
    cachedMarianPipelines.set(targetPair.id, translator);
  }

  // 3. Perform inference
  try {
    const output = await translator(text);
    let result = '';
    if (Array.isArray(output) && output.length > 0) {
      result = output[0]?.translation_text || output[0]?.generated_text || '';
    } else if (output && typeof output === 'object') {
      result = (output as any).translation_text || (output as any).generated_text || '';
    } else if (typeof output === 'string') {
      result = output;
    }

    return result && result.trim() ? result.trim() : text;
  } catch (err) {
    console.warn(`MarianMT translation failed for ${targetPair.id}:`, err);
    return text;
  }
}
