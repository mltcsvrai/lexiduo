import { registerPlugin, Capacitor, type PluginListenerHandle } from '@capacitor/core';
import type { SubtitleCue } from '@lexiduo/core';

export type HardwareTierLevel = 1 | 2 | 3 | 4;
export type HardwareTierName = 'flagship' | 'balanced' | 'low_memory' | 'cloud_recommended';

export interface DeviceHardwareProfile {
  tier: HardwareTierLevel;
  tierName: HardwareTierName;
  totalRamMb: number;
  availRamMb: number;
  is64Bit: boolean;
  cpuCores: number;
  deviceModel: string;
  supportedModels: string[];
  recommendedModel: string;
}

export interface NativeAudioExtractionResult {
  wavPath: string;
  durationMs: number;
  sampleRate: number;
  channels: number;
  totalSamples: number;
}

export interface NativeTranscriptionProgress {
  stage?: 'extracting' | 'transcribing' | 'ready';
  progress?: number;
  percent?: number;
  detail?: string;
  currentChunk?: number;
  totalChunks?: number;
  processedMs?: number;
  totalMs?: number;
}

export interface NativeTranscriptionResult {
  cues: SubtitleCue[];
  durationMs: number;
  modelTier: string;
  wavPath?: string;
}

export interface NativeWhisperPlugin {
  getDeviceProfile(): Promise<DeviceHardwareProfile>;
  extractAudio(options: { videoUri: string }): Promise<NativeAudioExtractionResult>;
  saveAudioBuffer(options: { base64: string }): Promise<{ audioPath: string; sizeBytes: number }>;
  isModelDownloaded(options: { tierId: string }): Promise<{ isDownloaded: boolean; sizeBytes: number; tierId: string }>;
  downloadModelTier(options: { tierId: string; preferGgml?: boolean }): Promise<{ success: boolean; tierId: string; modelPath: string }>;
  deleteModelTier(options: { tierId: string }): Promise<{ deleted: boolean; tierId: string }>;
  transcribe(options: {
    audioPath?: string;
    audioBase64?: string;
    videoUri?: string;
    modelTier?: string;
    language?: string;
  }): Promise<NativeTranscriptionResult>;
  cancelTranscription(): Promise<{ cancelled: boolean }>;
  pickVideo(): Promise<{ uri: string; name: string; size: number }>;
}

let cachedProfile: DeviceHardwareProfile | null = null;
let mockTranscriptionHandler: ((options: any) => Promise<NativeTranscriptionResult>) | null = null;
let mockExtractionHandler: ((options: any) => Promise<NativeAudioExtractionResult>) | null = null;

export function setNativeWhisperMockHandlers(handlers: {
  transcribe?: ((options: any) => Promise<NativeTranscriptionResult>) | null;
  extractAudio?: ((options: any) => Promise<NativeAudioExtractionResult>) | null;
}): void {
  if (handlers.transcribe !== undefined) mockTranscriptionHandler = handlers.transcribe;
  if (handlers.extractAudio !== undefined) mockExtractionHandler = handlers.extractAudio;
}

// Capacitor Native Plugin Registration with Web Fallback
export const NativeWhisper = registerPlugin<NativeWhisperPlugin>('NativeWhisper', {
  web: () => ({
    async getDeviceProfile(): Promise<DeviceHardwareProfile> {
      const devMemGb = (navigator as any).deviceMemory || 4;
      const cores = navigator.hardwareConcurrency || 4;
      const totalRamMb = devMemGb * 1024;
      const is64Bit = true;
      const userAgent = navigator.userAgent;
      const isMobile = /android|iphone|ipad|ipod/i.test(userAgent);

      let tier: HardwareTierLevel = 2;
      let tierName: HardwareTierName = 'balanced';
      let recommendedModel = 'base';
      let supportedModels = ['base', 'tiny'];

      if (!isMobile && devMemGb >= 8) {
        tier = 1;
        tierName = 'flagship';
        recommendedModel = 'large-v3-turbo';
        supportedModels = ['large-v3-turbo', 'small', 'base', 'tiny'];
      } else if (devMemGb >= 6) {
        tier = 2;
        tierName = 'balanced';
        recommendedModel = 'small';
        supportedModels = ['small', 'base', 'tiny'];
      } else if (devMemGb >= 3) {
        tier = 3;
        tierName = 'low_memory';
        recommendedModel = 'tiny';
        supportedModels = ['base', 'tiny'];
      } else {
        tier = 4;
        tierName = 'cloud_recommended';
        recommendedModel = 'tiny';
        supportedModels = ['tiny'];
      }

      return {
        tier,
        tierName,
        totalRamMb,
        availRamMb: Math.round(totalRamMb * 0.6),
        is64Bit,
        cpuCores: cores,
        deviceModel: 'Web Browser / WASM',
        supportedModels,
        recommendedModel
      };
    },

    async extractAudio(options: { videoUri: string }): Promise<NativeAudioExtractionResult> {
      if (mockExtractionHandler) {
        return await mockExtractionHandler(options);
      }
      throw new Error('Native audio extraction is only available on native Android runtime.');
    },

    async saveAudioBuffer(): Promise<{ audioPath: string; sizeBytes: number }> {
      throw new Error('Native audio buffer saving is only available on native Android runtime.');
    },

    async isModelDownloaded(): Promise<{ isDownloaded: boolean; sizeBytes: number; tierId: string }> {
      return { isDownloaded: false, sizeBytes: 0, tierId: 'tiny' };
    },

    async downloadModelTier(options: { tierId: string }): Promise<{ success: boolean; tierId: string; modelPath: string }> {
      return { success: false, tierId: options.tierId, modelPath: '' };
    },

    async deleteModelTier(options: { tierId: string }): Promise<{ deleted: boolean; tierId: string }> {
      return { deleted: true, tierId: options.tierId };
    },

    async transcribe(options: any): Promise<NativeTranscriptionResult> {
      if (mockTranscriptionHandler) {
        return await mockTranscriptionHandler(options);
      }
      throw new Error('Native Whisper execution is only available on native Android runtime.');
    },

    async cancelTranscription(): Promise<{ cancelled: boolean }> {
      return { cancelled: true };
    },

    async pickVideo(): Promise<{ uri: string; name: string; size: number }> {
      throw new Error('Native video picker is only available on native Android runtime.');
    }
  })
});

/**
 * Checks whether native Android Whisper plugin is present and supported.
 */
export function isNativeWhisperAvailable(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Retrieves the device hardware profile, caching the result in memory.
 */
export async function getDeviceHardwareProfile(): Promise<DeviceHardwareProfile> {
  if (cachedProfile) {
    return cachedProfile;
  }

  try {
    const profile = await NativeWhisper.getDeviceProfile();
    cachedProfile = profile;
    return profile;
  } catch (err) {
    console.warn('[NativeWhisper] Failed to fetch hardware profile, using fallback:', err);
    const fallback: DeviceHardwareProfile = {
      tier: 2,
      tierName: 'balanced',
      totalRamMb: 4096,
      availRamMb: 2048,
      is64Bit: true,
      cpuCores: 4,
      deviceModel: 'Generic Device',
      supportedModels: ['small', 'base', 'tiny'],
      recommendedModel: 'base'
    };
    cachedProfile = fallback;
    return fallback;
  }
}

/**
 * Synchronous accessor for currently cached profile if already loaded.
 */
export function getCachedHardwareProfile(): DeviceHardwareProfile | null {
  return cachedProfile;
}

/**
 * Extracts 16kHz mono audio from video Uri natively without WebView memory usage.
 */
export async function extractNativeAudio(
  videoUri: string,
  onProgress?: (percent: number) => void
): Promise<NativeAudioExtractionResult> {
  let listenerHandle: PluginListenerHandle | null = null;
  if (onProgress && isNativeWhisperAvailable()) {
    try {
      listenerHandle = await (NativeWhisper as any).addListener(
        'extractionProgress',
        (info: { percent: number }) => {
          onProgress(info.percent);
        }
      );
    } catch (e) {
      console.warn('[NativeWhisper] Could not attach extractionProgress listener:', e);
    }
  }

  try {
    return await NativeWhisper.extractAudio({ videoUri });
  } finally {
    if (listenerHandle) {
      await listenerHandle.remove();
    }
  }
}

/**
 * Transcribes audio via native Android Whisper service.
 */
export async function transcribeNativeAudio(options: {
  audioPath?: string;
  audioBase64?: string;
  videoUri?: string;
  modelTier?: string;
  language?: string;
  onProgress?: (progress: NativeTranscriptionProgress) => void;
}): Promise<NativeTranscriptionResult> {
  let listenerHandle: PluginListenerHandle | null = null;
  if (options.onProgress && isNativeWhisperAvailable()) {
    try {
      listenerHandle = await (NativeWhisper as any).addListener(
        'transcriptionProgress',
        (p: NativeTranscriptionProgress) => {
          options.onProgress?.(p);
        }
      );
    } catch (e) {
      console.warn('[NativeWhisper] Could not attach transcriptionProgress listener:', e);
    }
  }

  try {
    return await NativeWhisper.transcribe({
      audioPath: options.audioPath,
      audioBase64: options.audioBase64,
      videoUri: options.videoUri,
      modelTier: options.modelTier,
      language: options.language
    });
  } finally {
    if (listenerHandle) {
      await listenerHandle.remove();
    }
  }
}

/**
 * Saves a base64-encoded WAV buffer directly to native disk cache and returns its file path.
 */
export async function saveNativeAudioBuffer(base64: string): Promise<string> {
  if (!isNativeWhisperAvailable()) {
    throw new Error('Native audio buffer saving is only supported on Android runtime.');
  }
  const res = await NativeWhisper.saveAudioBuffer({ base64 });
  return res.audioPath;
}

/**
 * Opens native Android video picker returning { uri, name, size } with zero WebView RAM.
 */
export async function pickNativeVideo(): Promise<{ uri: string; name: string; size: number }> {
  if (!isNativeWhisperAvailable()) {
    throw new Error('Native video picker is only available on native Android.');
  }
  return await NativeWhisper.pickVideo();
}

/**
 * Checks if a specific Whisper tier is stored on disk in native storage.
 */
export async function isNativeModelDownloaded(tierId: string): Promise<{ isDownloaded: boolean; sizeBytes: number }> {
  if (!isNativeWhisperAvailable()) {
    return { isDownloaded: false, sizeBytes: 0 };
  }
  try {
    const res = await NativeWhisper.isModelDownloaded({ tierId });
    return { isDownloaded: res.isDownloaded, sizeBytes: res.sizeBytes };
  } catch (err) {
    console.warn('[NativeWhisper] isModelDownloaded failed:', err);
    return { isDownloaded: false, sizeBytes: 0 };
  }
}

/**
 * Downloads Whisper model tier files directly to native disk storage with progress callbacks.
 */
export async function downloadNativeModelTier(
  tierId: string,
  onProgress?: (percent: number) => void,
  preferGgml: boolean = true
): Promise<boolean> {
  if (!isNativeWhisperAvailable()) {
    return false;
  }
  let listenerHandle: PluginListenerHandle | null = null;
  if (onProgress) {
    try {
      listenerHandle = await (NativeWhisper as any).addListener(
        'downloadProgress',
        (info: { percent: number; tierId: string }) => {
          if (info.tierId === tierId) {
            onProgress(info.percent);
          }
        }
      );
    } catch (e) {
      console.warn('[NativeWhisper] Could not attach downloadProgress listener:', e);
    }
  }

  try {
    const res = await NativeWhisper.downloadModelTier({ tierId, preferGgml });
    return res.success;
  } catch (err) {
    console.error('[NativeWhisper] downloadModelTier failed:', err);
    return false;
  } finally {
    if (listenerHandle) {
      await listenerHandle.remove();
    }
  }
}

/**
 * Deletes downloaded model tier from native disk storage.
 */
export async function deleteNativeModelTier(tierId: string): Promise<boolean> {
  if (!isNativeWhisperAvailable()) {
    return true;
  }
  try {
    const res = await NativeWhisper.deleteModelTier({ tierId });
    return res.deleted;
  } catch (err) {
    console.warn('[NativeWhisper] deleteModelTier failed:', err);
    return false;
  }
}

/**
 * Cancels active native Whisper task.
 */
export async function cancelNativeTranscription(): Promise<void> {
  try {
    await NativeWhisper.cancelTranscription();
  } catch (err) {
    console.warn('[NativeWhisper] Cancel error:', err);
  }
}

/**
 * Parses a standard 16-bit PCM RIFF WAV ArrayBuffer into normalized [-1.0, 1.0] Float32Array samples.
 */
export function decodeWavToFloat32(arrayBuffer: ArrayBuffer): Float32Array {
  const view = new DataView(arrayBuffer);
  // Find 'data' chunk
  let pos = 12;
  while (pos < view.byteLength - 8) {
    const chunkId = String.fromCharCode(
      view.getUint8(pos),
      view.getUint8(pos + 1),
      view.getUint8(pos + 2),
      view.getUint8(pos + 3)
    );
    const chunkSize = view.getUint32(pos + 4, true);
    if (chunkId === 'data') {
      const dataOffset = pos + 8;
      const sampleCount = Math.floor(Math.min(chunkSize, view.byteLength - dataOffset) / 2);
      const float32 = new Float32Array(sampleCount);
      for (let i = 0; i < sampleCount; i++) {
        const int16 = view.getInt16(dataOffset + i * 2, true);
        float32[i] = int16 < 0 ? int16 / 32768 : int16 / 32767;
      }
      return float32;
    }
    pos += 8 + chunkSize;
  }

  // Fallback: assume standard 44-byte WAV header
  const sampleCount = Math.floor((view.byteLength - 44) / 2);
  const float32 = new Float32Array(Math.max(0, sampleCount));
  for (let i = 0; i < float32.length; i++) {
    const int16 = view.getInt16(44 + i * 2, true);
    float32[i] = int16 < 0 ? int16 / 32768 : int16 / 32767;
  }
  return float32;
}

/**
 * Loads a native 16kHz mono WAV file from device cache/storage into Float32Array
 * using Capacitor file URL resolution.
 */
export async function loadNativeWavAudio(wavPath: string): Promise<Float32Array> {
  try {
    const src = Capacitor.isNativePlatform() ? Capacitor.convertFileSrc(wavPath) : wavPath;
    const res = await fetch(src);
    if (res.ok) {
      const buffer = await res.arrayBuffer();
      return decodeWavToFloat32(buffer);
    }
    console.warn(`[loadNativeWavAudio] fetch HTTP ${res.status} for ${src}, falling back to Filesystem plugin...`);
  } catch (fetchErr) {
    console.warn(`[loadNativeWavAudio] fetch failed for ${wavPath}:`, fetchErr);
  }

  // Fallback: read directly via @capacitor/filesystem
  try {
    const { Filesystem } = await import('@capacitor/filesystem');
    const readFileRes = await Filesystem.readFile({ path: wavPath });
    if (readFileRes?.data) {
      if (typeof readFileRes.data === 'string') {
        const binary = atob(readFileRes.data);
        const len = binary.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        return decodeWavToFloat32(bytes.buffer);
      } else if (readFileRes.data instanceof Blob) {
        const buffer = await readFileRes.data.arrayBuffer();
        return decodeWavToFloat32(buffer);
      }
    }
  } catch (fsErr) {
    console.warn(`[loadNativeWavAudio] Filesystem.readFile failed for ${wavPath}:`, fsErr);
  }

  throw new Error(`Failed to read native WAV file at ${wavPath}`);
}

// Eager hardware profile warmup on startup
if (typeof window !== 'undefined') {
  getDeviceHardwareProfile().catch(() => {});
}
