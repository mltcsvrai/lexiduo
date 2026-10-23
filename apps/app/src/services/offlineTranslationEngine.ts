import { get, set, del } from 'idb-keyval';
import { translateTextSecure, withBackgroundTask } from '@lexiduo/core';
import { 
  getCachedHardwareProfile, 
  getDeviceHardwareProfile, 
  type DeviceHardwareProfile,
  isNativeWhisperAvailable,
  isNativeModelDownloaded,
  downloadNativeModelTier,
  deleteNativeModelTier
} from './nativeWhisperBridge';
import { translateWithMarian } from './marianTranslationEngine';

export type WhisperTierKey = 'tiny' | 'base' | 'small' | 'large-v3-turbo';

export interface WhisperTierConfig {
  id: WhisperTierKey;
  name: string;
  modelId: string;
  dtype: 'q8' | 'q4';
  sizeMB: number;
  hardwareLoad: number; // 1 to 5
  minRam: string;
  recRam: string;
  taglineTr: string;
  taglineEn: string;
  descTr: string;
  descEn: string;
  recommendedDevice?: string;
  isFlagshipRecommended?: boolean;
  isStudioRecommended?: boolean;
}

export const WHISPER_TIERS: Record<WhisperTierKey, WhisperTierConfig> = {
  tiny: {
    id: 'tiny',
    name: 'Whisper Tiny',
    modelId: 'onnx-community/whisper-tiny',
    dtype: 'q8',
    sizeMB: 39,
    hardwareLoad: 1,
    minRam: '2 GB',
    recRam: '3-4 GB',
    taglineTr: 'En Hızlı & Ultra Hafif (C++ & ARM NEON)',
    taglineEn: 'Fastest & Ultra Light (C++ & ARM NEON)',
    descTr: 'Temel Seviye',
    descEn: 'Entry Level'
  },
  base: {
    id: 'base',
    name: 'Whisper Base',
    modelId: 'onnx-community/whisper-base',
    dtype: 'q8',
    sizeMB: 85,
    hardwareLoad: 2,
    minRam: '3-4 GB',
    recRam: '6 GB',
    taglineTr: 'Dengeli & Hızlı (C++ Hızlandırmalı)',
    taglineEn: 'Balanced & Fast (C++ Accelerated)',
    descTr: "Whisper Tiny'ye Göre 2x Doğruluk",
    descEn: '2x Accuracy vs Whisper Tiny'
  },
  small: {
    id: 'small',
    name: 'Whisper Small',
    modelId: 'onnx-community/whisper-small',
    dtype: 'q4',
    sizeMB: 240,
    hardwareLoad: 3,
    minRam: '6 GB',
    recRam: '8 GB',
    taglineTr: 'Stüdyo Kalite (C++ & KV-Cache)',
    taglineEn: 'Studio Quality (C++ & KV-Cache)',
    descTr: 'Yüksek Hassasiyet',
    descEn: 'High Precision',
    recommendedDevice: 'Snapdragon 7+/8 Gen 1/2',
    isStudioRecommended: true,
    isFlagshipRecommended: false
  },
  'large-v3-turbo': {
    id: 'large-v3-turbo',
    name: 'Whisper Large v3 Turbo',
    modelId: 'onnx-community/whisper-large-v3-turbo',
    dtype: 'q4',
    sizeMB: 800,
    hardwareLoad: 5,
    minRam: '8 GB',
    recRam: '12 GB+',
    taglineTr: 'Zirve Hassasiyet (Galaxy S25 & C++ 64-Bit Donanım Hızlandırmalı)',
    taglineEn: 'Peak Precision (Galaxy S25 & C++ 64-Bit Hardware Accelerated)',
    descTr: 'Kusursuz Tanıma (Galaxy S25, Tab S9+, 8 Elite)',
    descEn: 'Flawless Recognition (Galaxy S25, Tab S9+, 8 Elite)',
    recommendedDevice: 'Galaxy S25 / Snapdragon 8 Elite',
    isFlagshipRecommended: true
  }
};

/**
 * Checks whether a given Whisper tier can be safely run on the current device.
 * Flagship Tier 1 devices (e.g. Galaxy S25 FE, Galaxy Tab S9+) run Whisper Large v3 Turbo
 * natively without the 2 GB WebAssembly linear memory ceiling.
 */
export function isTierSupportedOnCurrentDevice(
  tierId: string,
  profileOverride?: DeviceHardwareProfile | null
): { supported: boolean; reasonKey?: string; message?: string } {
  const profile = profileOverride !== undefined ? profileOverride : getCachedHardwareProfile();

  if (tierId === 'large-v3-turbo') {
    // Flagship Tier 1 devices natively support Large v3 Turbo
    if (profile?.tier === 1) {
      return { supported: true };
    }

    const isMobile = typeof navigator !== 'undefined' && (/android|iphone|ipad|ipod/i.test(navigator.userAgent));
    if ((profile && profile.tier >= 3) || (!profile && isMobile)) {
      return {
        supported: false,
        reasonKey: 'largeModelNotSupportedOnMobile',
        message: 'Whisper Large v3 Turbo en az 8 GB RAM ve amiral gemisi işlemci gerektirir. Cihazınızda akıcı deneyim için Whisper Small veya Cloud Gemini motorunu kullanın.'
      };
    }
  }
  return { supported: true };
}

export const ACTIVE_WHISPER_TIER_KEY = 'lexiduo_active_whisper_tier';
export const LEGACY_ACTIVE_WHISPER_TIER_KEY = 'yt_studio_active_whisper_tier';
export const WHISPER_TIER_CHANGED_EVENT = 'lexiduo_whisper_tier_changed';
export const LEGACY_WHISPER_TIER_CHANGED_EVENT = 'yt_studio_whisper_tier_changed';
export const OFFLINE_MODEL_STORAGE_KEY = 'lexiduo_offline_whisper_v1';
export const LEGACY_OFFLINE_MODEL_STORAGE_KEY = 'yt_studio_offline_whisper_v1';
export const OFFLINE_WHISPER_MODEL_ID = 'onnx-community/whisper-tiny';
export const OFFLINE_MODEL_ESTIMATED_SIZE_MB = 39;
export const DEFAULT_WHISPER_TIER: WhisperTierKey = 'tiny';

export function getTierStorageKey(tierId: string): string {
  return `yt_studio_offline_whisper_${tierId}`;
}

export function getLexiduoTierStorageKey(tierId: string): string {
  return `lexiduo_offline_whisper_${tierId}`;
}

export interface OfflineModelStatus {
  isDownloaded: boolean;
  downloadDate?: string;
  sizeBytes?: number;
  modelName: string;
  tierId?: string;
  isActive?: boolean;
}

const cachedWhisperPipelines = new Map<string, any>();

/**
 * Gets the currently active Whisper tier from IndexedDB.
 */
export async function getActiveWhisperTier(): Promise<string> {
  try {
    const saved = (await get<string>(ACTIVE_WHISPER_TIER_KEY)) || (await get<string>(LEGACY_ACTIVE_WHISPER_TIER_KEY));
    if (saved && (saved in WHISPER_TIERS)) {
      return saved;
    }
    // Backward compatibility: If legacy tiny was downloaded
    const legacy = (await get<{ timestamp: number; sizeBytes: number }>(OFFLINE_MODEL_STORAGE_KEY)) ||
                   (await get<{ timestamp: number; sizeBytes: number }>(LEGACY_OFFLINE_MODEL_STORAGE_KEY));
    if (legacy && legacy.sizeBytes > 0) {
      return 'tiny';
    }
  } catch (err) {
    console.warn('Failed to get active Whisper tier:', err);
  }
  return DEFAULT_WHISPER_TIER;
}

/**
 * Sets the active Whisper tier in IndexedDB and broadcasts change.
 */
export async function setActiveWhisperTier(tierId: string): Promise<void> {
  if (!(tierId in WHISPER_TIERS)) {
    console.warn(`Attempted to set invalid Whisper tier: ${tierId}`);
    return;
  }
  await set(ACTIVE_WHISPER_TIER_KEY, tierId);
  await set(LEGACY_ACTIVE_WHISPER_TIER_KEY, tierId);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(WHISPER_TIER_CHANGED_EVENT, { detail: { tierId } }));
    window.dispatchEvent(new CustomEvent(LEGACY_WHISPER_TIER_CHANGED_EVENT, { detail: { tierId } }));
  }
}

/**
 * Checks the download and active status for a specific tier.
 */
export async function getWhisperTierStatus(tierId: string): Promise<OfflineModelStatus> {
  const tier = WHISPER_TIERS[tierId as WhisperTierKey] || WHISPER_TIERS.tiny;
  const storageKey = getTierStorageKey(tierId);
  try {
    if (isNativeWhisperAvailable()) {
      const nativeStatus = await isNativeModelDownloaded(tierId);
      const activeTier = await getActiveWhisperTier();
      const isActive = activeTier === tierId;
      if (nativeStatus.isDownloaded) {
        return {
          isDownloaded: true,
          downloadDate: 'Cihaz Belleği',
          sizeBytes: nativeStatus.sizeBytes,
          modelName: `${tier.name} (~${tier.sizeMB} MB)`,
          tierId,
          isActive
        };
      }
    }

    let record = await get<{ timestamp: number; sizeBytes: number; modelId?: string }>(getLexiduoTierStorageKey(tierId));
    if (!record || !record.sizeBytes) {
      record = await get<{ timestamp: number; sizeBytes: number; modelId?: string }>(storageKey);
    }
    if ((!record || !record.sizeBytes) && tierId === 'tiny') {
      record = (await get<{ timestamp: number; sizeBytes: number; modelId?: string }>(OFFLINE_MODEL_STORAGE_KEY)) ||
               (await get<{ timestamp: number; sizeBytes: number; modelId?: string }>(LEGACY_OFFLINE_MODEL_STORAGE_KEY));
    }
    const activeTier = await getActiveWhisperTier();
    const isActive = activeTier === tierId;

    if (record && record.sizeBytes > 0) {
      return {
        isDownloaded: true,
        downloadDate: new Date(record.timestamp).toLocaleDateString(),
        sizeBytes: record.sizeBytes,
        modelName: `${tier.name} (~${tier.sizeMB} MB)`,
        tierId,
        isActive
      };
    }
    return {
      isDownloaded: false,
      modelName: `${tier.name} (~${tier.sizeMB} MB)`,
      tierId,
      isActive
    };
  } catch (err) {
    console.warn(`Failed to query status for tier ${tierId}:`, err);
    return {
      isDownloaded: false,
      modelName: `${tier.name} (~${tier.sizeMB} MB)`,
      tierId,
      isActive: false
    };
  }
}

/**
 * Configures Transformers.js environment with WebGPU detection and optimal WASM SIMD threading.
 */
export async function configureWhisperEnvironment(): Promise<{ device: 'webgpu' | 'wasm' }> {
  const { env } = await import('@huggingface/transformers');
  env.allowLocalModels = false;
  env.useBrowserCache = true;

  let device: 'webgpu' | 'wasm' = 'wasm';

  // 1. Try detecting WebGPU availability for flagship mobile GPUs (e.g. S25 FE Exynos 2400e / Tab S9+ Adreno 740)
  if (typeof navigator !== 'undefined' && 'gpu' in navigator && (navigator as any).gpu) {
    try {
      const adapter = await (navigator as any).gpu.requestAdapter();
      if (adapter) {
        device = 'webgpu';
      }
    } catch {
      device = 'wasm';
    }
  }

  // 2. Configure optimal WASM multi-threading
  if (env.backends?.onnx?.wasm) {
    const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';
    if (hasSharedArrayBuffer) {
      const cores = typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 4;
      // Utilize 2-4 threads on multi-core mobile processors instead of locking to 1
      env.backends.onnx.wasm.numThreads = Math.min(4, Math.max(2, Math.floor(cores / 2)));
      env.backends.onnx.wasm.proxy = true;
    } else {
      console.warn('SharedArrayBuffer not available in current WebView/browser; falling back to single-threaded WASM without proxy');
      env.backends.onnx.wasm.numThreads = 1;
      env.backends.onnx.wasm.proxy = false;
    }
  }

  return { device };
}

/**
 * Downloads a specific Whisper model tier using Transformers.js.
 */
export async function downloadWhisperTier(
  tierId: string,
  onProgress?: (progress: number) => void
): Promise<boolean> {
  let profile = getCachedHardwareProfile();
  if (!profile) {
    try {
      profile = await getDeviceHardwareProfile();
    } catch {}
  }
  const check = isTierSupportedOnCurrentDevice(tierId, profile);
  if (!check.supported) {
    console.warn(`Tier ${tierId} cannot be run safely on this device:`, check.message);
    throw new Error(check.message);
  }

  const tier = WHISPER_TIERS[tierId as WhisperTierKey] || WHISPER_TIERS.tiny;
  const taskId = `whisper_download_${tierId}`;
  const taskTitle = `${tier.name} (~${tier.sizeMB} MB)`;

  if (isNativeWhisperAvailable()) {
    return await withBackgroundTask(taskId, taskTitle, async (updateBg) => {
      updateBg('İndiriliyor...', 5);
      const success = await downloadNativeModelTier(tierId, (p) => {
        onProgress?.(p);
        updateBg(`%${p} indirildi`, p);
      });
      if (success) {
        const storageKey = getTierStorageKey(tierId);
        const meta = {
          timestamp: Date.now(),
          sizeBytes: tier.sizeMB * 1024 * 1024,
          version: '1.0.0',
          modelId: tier.modelId,
          tierId
        };
        await set(storageKey, meta);
        if (tierId === 'tiny') {
          await set(OFFLINE_MODEL_STORAGE_KEY, meta);
        }
        await setActiveWhisperTier(tierId);
        onProgress?.(100);
        updateBg('%100 tamamlandı', 100);
        return true;
      }
      return false;
    });
  }

  return await withBackgroundTask(taskId, taskTitle, async (updateBg) => {
    updateBg('Hazırlanıyor...', 0);
    try {
      const { pipeline } = await import('@huggingface/transformers');
      const { device } = await configureWhisperEnvironment();

      let lastReportedProgress = 0;
      const progress_callback = (item: any) => {
        if (item.status === 'progress_total' && typeof item.progress === 'number') {
          const pct = Math.min(99, Math.max(lastReportedProgress, Math.round(item.progress)));
          lastReportedProgress = pct;
          onProgress?.(pct);
          updateBg(`%${pct} indirildi`, pct);
        } else if (item.status === 'progress' && typeof item.progress === 'number') {
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

      let transcriber: any = null;
      if (device === 'webgpu') {
        try {
          transcriber = await pipeline('automatic-speech-recognition', tier.modelId, {
            dtype: tier.dtype,
            device: 'webgpu',
            progress_callback
          });
        } catch (gpuErr) {
          console.warn('WebGPU download pipeline failed, falling back to WASM:', gpuErr);
        }
      }

      if (!transcriber) {
        try {
          transcriber = await pipeline('automatic-speech-recognition', tier.modelId, {
            dtype: tier.dtype,
            device: 'wasm',
            progress_callback
          });
        } catch (wasmErr) {
          if (tier.dtype === 'q4') {
            console.warn(`WASM with dtype ${tier.dtype} failed during download, trying fallback to q8:`, wasmErr);
            transcriber = await pipeline('automatic-speech-recognition', tier.modelId, {
              dtype: 'q8',
              device: 'wasm',
              progress_callback
            });
          } else {
            throw wasmErr;
          }
        }
      }

      cachedWhisperPipelines.set(tierId, transcriber);

      const storageKey = getTierStorageKey(tierId);
      const meta = {
        timestamp: Date.now(),
        sizeBytes: tier.sizeMB * 1024 * 1024,
        version: '1.0.0',
        modelId: tier.modelId,
        tierId
      };
      await set(storageKey, meta);
      await set(getLexiduoTierStorageKey(tierId), meta);
      if (tierId === 'tiny') {
        await set(OFFLINE_MODEL_STORAGE_KEY, meta);
        await set(LEGACY_OFFLINE_MODEL_STORAGE_KEY, meta);
      }

      await setActiveWhisperTier(tierId);
      onProgress?.(100);
      updateBg('%100 tamamlandı', 100);
      return true;
    } catch (err) {
      console.error(`Failed to download Whisper tier ${tierId}:`, err);
      return false;
    }
  });
}

/**
 * Deletes a downloaded tier from IndexedDB and memory.
 */
export async function deleteWhisperTier(tierId: string): Promise<void> {
  if (isNativeWhisperAvailable()) {
    try {
      await deleteNativeModelTier(tierId);
    } catch (e) {
      console.warn('Failed deleting native model tier:', e);
    }
  }

  const storageKey = getTierStorageKey(tierId);
  await del(storageKey);
  await del(getLexiduoTierStorageKey(tierId));
  if (tierId === 'tiny') {
    await del(OFFLINE_MODEL_STORAGE_KEY);
    await del(LEGACY_OFFLINE_MODEL_STORAGE_KEY);
  }
  cachedWhisperPipelines.delete(tierId);

  const activeTier = await getActiveWhisperTier();
  if (activeTier === tierId) {
    const keys = Object.keys(WHISPER_TIERS) as WhisperTierKey[];
    let nextTier: string = DEFAULT_WHISPER_TIER;
    for (const k of keys) {
      if (k !== tierId) {
        const st = await getWhisperTierStatus(k);
        if (st.isDownloaded) {
          nextTier = k;
          break;
        }
      }
    }
    await setActiveWhisperTier(nextTier);
  } else {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(WHISPER_TIER_CHANGED_EVENT, { detail: { tierId } }));
    }
  }

  const tier = WHISPER_TIERS[tierId as WhisperTierKey];
  if (typeof window !== 'undefined' && 'caches' in window && tier) {
    try {
      const cache = await window.caches.open('transformers-cache');
      const requests = await cache.keys();
      for (const req of requests) {
        if (req.url.includes(tier.modelId)) {
          await cache.delete(req);
        }
      }
    } catch (cacheErr) {
      console.warn('Failed to clean model from transformers-cache:', cacheErr);
    }
  }
}

/**
 * Retrieves the local Whisper pipeline instance for the specified (or active) tier.
 */
export async function getLocalWhisperPipeline(tierId?: string): Promise<any> {
  const resolvedTierId = tierId || (await getActiveWhisperTier());
  if (cachedWhisperPipelines.has(resolvedTierId)) {
    return cachedWhisperPipelines.get(resolvedTierId);
  }

  let profile = getCachedHardwareProfile();
  if (!profile) {
    try {
      profile = await getDeviceHardwareProfile();
    } catch {}
  }
  const check = isTierSupportedOnCurrentDevice(resolvedTierId, profile);
  if (!check.supported) {
    console.warn(`Tier ${resolvedTierId} cannot be run safely on this device:`, check.message);
    return null;
  }

  if (resolvedTierId === 'large-v3-turbo') {
    // Large v3 Turbo is exclusively supported via 64-bit native Android ONNX Runtime.
    // In WebAssembly / browser, the 2GB linear memory ceiling causes renderer OOM crashes.
    console.warn('Whisper Large v3 Turbo is exclusively supported via 64-bit native Android engine.');
    return null;
  }

  const status = await getWhisperTierStatus(resolvedTierId);
  if (!status.isDownloaded) return null;

  const tier = WHISPER_TIERS[resolvedTierId as WhisperTierKey] || WHISPER_TIERS.tiny;

  try {
    const { pipeline } = await import('@huggingface/transformers');
    const { device } = await configureWhisperEnvironment();

    let transcriber: any = null;
    if (device === 'webgpu') {
      try {
        transcriber = await pipeline('automatic-speech-recognition', tier.modelId, {
          dtype: tier.dtype,
          device: 'webgpu'
        });
      } catch (gpuErr) {
        console.warn('WebGPU execution pipeline failed, falling back to WASM:', gpuErr);
      }
    }

    if (!transcriber) {
      try {
        transcriber = await pipeline('automatic-speech-recognition', tier.modelId, {
          dtype: tier.dtype,
          device: 'wasm'
        });
      } catch (wasmErr) {
        if (tier.dtype === 'q4') {
          console.warn(`WASM with dtype ${tier.dtype} failed, trying fallback to q8:`, wasmErr);
          transcriber = await pipeline('automatic-speech-recognition', tier.modelId, {
            dtype: 'q8',
            device: 'wasm'
          });
        } else {
          throw wasmErr;
        }
      }
    }

    cachedWhisperPipelines.set(resolvedTierId, transcriber);
    return transcriber;
  } catch (err) {
    console.error(`Failed to load local Whisper pipeline for ${resolvedTierId}:`, err);
    return null;
  }
}

/**
 * Backward compatibility: Checks whether the active offline Whisper model is installed.
 */
export async function getOfflineModelStatus(): Promise<OfflineModelStatus> {
  const activeTier = await getActiveWhisperTier();
  return getWhisperTierStatus(activeTier);
}

/**
 * Backward compatibility: Downloads the active offline Whisper model.
 */
export async function downloadOfflineTranslationModel(
  onProgress?: (progress: number) => void
): Promise<boolean> {
  const activeTier = await getActiveWhisperTier();
  return downloadWhisperTier(activeTier, onProgress);
}

/**
 * Backward compatibility: Removes the active offline model.
 */
export async function deleteOfflineTranslationModel(): Promise<void> {
  const activeTier = await getActiveWhisperTier();
  return deleteWhisperTier(activeTier);
}

const COMMON_OFFLINE_DICT: Record<string, string> = {
  // Selamlaşma ve Nezaket
  'hello': 'merhaba',
  'hi': 'selam',
  'hey': 'hey',
  'yes': 'evet',
  'no': 'hayır',
  'yeah': 'evet',
  'sure': 'elbette',
  'thanks': 'teşekkürler',
  'thank you': 'teşekkür ederim',
  'good morning': 'günaydın',
  'good evening': 'iyi akşamlar',
  'good night': 'iyi geceler',
  'goodbye': 'hoşça kal',
  'bye': 'hoşça kal',
  'see you': 'görüşmek üzere',
  'welcome': 'hoş geldiniz',
  'you are welcome': 'rica ederim',
  'please': 'lütfen',
  'sorry': 'özür dilerim',
  'excuse me': 'afedersiniz',
  'okay': 'tamam',
  'ok': 'tamam',
  'alright': 'pekala',
  'help': 'yardım',
  'world': 'dünya',

  // Soru Kelimeleri ve Zamirler
  'what': 'ne',
  'who': 'kim',
  'where': 'nerede',
  'when': 'ne zaman',
  'why': 'neden',
  'how': 'nasıl',
  'which': 'hangi',
  'i': 'ben',
  'you': 'sen',
  'he': 'o',
  'she': 'o',
  'it': 'o',
  'we': 'biz',
  'they': 'onlar',
  'this': 'bu',
  'that': 'şu',
  'these': 'bunlar',
  'those': 'şunlar',
  'my': 'benim',
  'your': 'senin',
  'our': 'bizim',
  'their': 'onların',

  // Yaygın Fiiller
  'is': 'dır',
  'are': 'dırlar',
  'was': 'idi',
  'were': 'idiler',
  'do': 'yapmak',
  'did': 'yaptı',
  'have': 'sahip olmak',
  'had': 'sahipti',
  'go': 'gitmek',
  'went': 'gitti',
  'come': 'gelmek',
  'came': 'geldi',
  'see': 'görmek',
  'saw': 'gördü',
  'look': 'bakmak',
  'listen': 'dinlemek',
  'speak': 'konuşmak',
  'talk': 'konuşmak',
  'say': 'söylemek',
  'tell': 'anlatmak',
  'know': 'bilmek',
  'think': 'düşünmek',
  'understand': 'anlamak',
  'like': 'beğenmek',
  'love': 'sevmek',
  'want': 'istemek',
  'need': 'ihtiyaç duymak',
  'can': 'yapabilmek',
  'will': 'olacak',

  // Zaman ve Durum
  'now': 'şimdi',
  'today': 'bugün',
  'tomorrow': 'yarın',
  'yesterday': 'dün',
  'good': 'iyi',
  'bad': 'kötü',
  'great': 'harika',
  'new': 'yeni',
  'old': 'eski',
  'big': 'büyük',
  'small': 'küçük',
  'easy': 'kolay',
  'hard': 'zor',
  'fast': 'hızlı',
  'slow': 'yavaş',
  'stop': 'dur',
  'start': 'başla',
  'ready': 'hazır'
};

/**
 * Translates text:
 * 1. If offline model is downloaded -> uses offline dictionary & model lookup
 * 2. If offline result is unmodified -> falls back to secure online translation
 * 3. Fallback -> dictionary lookup or original text
 */
export async function translateStudioText(
  text: string,
  fromLang: string = 'auto',
  toLang: string = 'tr'
): Promise<string> {
  if (!text || !text.trim()) return text;
  const cleanFrom = (fromLang || 'auto').replace(/^a\./, '').split('-')[0];
  const cleanTo = (toLang || 'tr').replace(/^a\./, '').split('-')[0];

  if (cleanFrom !== 'auto' && cleanFrom === cleanTo) {
    return text;
  }

  // 1. Primary: Online hybrid translation via translateTextSecure (supports all 35 languages)
  try {
    const onlineResult = await translateTextSecure(text, cleanFrom, cleanTo);
    if (onlineResult && onlineResult.trim().toLowerCase() !== text.trim().toLowerCase()) {
      return onlineResult;
    }
  } catch {
    // ignore network errors
  }

  // 2. Offline Marian NMT (Opus-MT on-device neural translation)
  try {
    const marianResult = await translateWithMarian(text, cleanFrom, cleanTo);
    if (marianResult && marianResult.trim().toLowerCase() !== text.trim().toLowerCase()) {
      return marianResult;
    }
  } catch {
    // fallback to dictionary
  }

  // 3. Offline fallback (common vocabulary)
  const localFallback = translateWithOfflineModel(text, cleanFrom, cleanTo);
  if (localFallback && localFallback.trim().toLowerCase() !== text.trim().toLowerCase()) {
    return localFallback;
  }
  return text;
}

function translateWithOfflineModel(text: string, from: string, to: string): string {
  if ((from === 'auto' || from === 'en') && to === 'tr') {
    const clean = text.trim().toLowerCase().replace(/[.,!?;:]/g, '');
    if (COMMON_OFFLINE_DICT[clean]) {
      return COMMON_OFFLINE_DICT[clean];
    }
    const words = clean.split(/\s+/);
    if (words.length > 1 && words.some(w => COMMON_OFFLINE_DICT[w])) {
      return words.map(w => COMMON_OFFLINE_DICT[w] || w).join(' ');
    }
  }
  return text;
}
