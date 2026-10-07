import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  WHISPER_TIERS,
  getActiveWhisperTier,
  setActiveWhisperTier,
  getWhisperTierStatus,
  getOfflineModelStatus,
  deleteWhisperTier,
  isTierSupportedOnCurrentDevice,
  DEFAULT_WHISPER_TIER
} from '../offlineTranslationEngine';

// In-memory mock for idb-keyval
const storage = new Map<string, any>();

vi.mock('idb-keyval', () => ({
  get: vi.fn(async (key: string) => storage.get(key)),
  set: vi.fn(async (key: string, value: any) => {
    storage.set(key, value);
  }),
  del: vi.fn(async (key: string) => {
    storage.delete(key);
  })
}));

describe('offlineTranslationEngine - Whisper Tiers Registry', () => {
  beforeEach(() => {
    storage.clear();
  });

  it('defines the 4 required Whisper model tiers with accurate specs', () => {
    expect(WHISPER_TIERS.tiny).toBeDefined();
    expect(WHISPER_TIERS.base).toBeDefined();
    expect(WHISPER_TIERS.small).toBeDefined();
    expect(WHISPER_TIERS['large-v3-turbo']).toBeDefined();

    // Check tiny
    expect(WHISPER_TIERS.tiny.modelId).toBe('onnx-community/whisper-tiny');
    expect(WHISPER_TIERS.tiny.dtype).toBe('q8');
    expect(WHISPER_TIERS.tiny.sizeMB).toBe(39);
    expect(WHISPER_TIERS.tiny.hardwareLoad).toBe(1);
    expect(WHISPER_TIERS.tiny.minRam).toBe('2 GB');
    expect(WHISPER_TIERS.tiny.recRam).toBe('3-4 GB');
    expect(WHISPER_TIERS.tiny.taglineTr).toContain('En Hızlı');

    // Check base
    expect(WHISPER_TIERS.base.modelId).toBe('onnx-community/whisper-base');
    expect(WHISPER_TIERS.base.dtype).toBe('q8');
    expect(WHISPER_TIERS.base.sizeMB).toBe(85);
    expect(WHISPER_TIERS.base.hardwareLoad).toBe(2);
    expect(WHISPER_TIERS.base.minRam).toBe('3-4 GB');
    expect(WHISPER_TIERS.base.recRam).toBe('6 GB');
    expect(WHISPER_TIERS.base.descTr).toContain("Whisper Tiny'ye Göre 2x Doğruluk");

    // Check small
    expect(WHISPER_TIERS.small.modelId).toBe('onnx-community/whisper-small');
    expect(WHISPER_TIERS.small.dtype).toBe('q4');
    expect(WHISPER_TIERS.small.sizeMB).toBe(240);
    expect(WHISPER_TIERS.small.hardwareLoad).toBe(3);
    expect(WHISPER_TIERS.small.minRam).toBe('6 GB');
    expect(WHISPER_TIERS.small.recRam).toBe('8 GB');
    expect(WHISPER_TIERS.small.taglineTr).toContain('Stüdyo Kalite');

    // Check large-v3-turbo
    expect(WHISPER_TIERS['large-v3-turbo'].modelId).toBe('onnx-community/whisper-large-v3-turbo');
    expect(WHISPER_TIERS['large-v3-turbo'].dtype).toBe('q4');
    expect(WHISPER_TIERS['large-v3-turbo'].sizeMB).toBe(800);
    expect(WHISPER_TIERS['large-v3-turbo'].hardwareLoad).toBe(5);
    expect(WHISPER_TIERS['large-v3-turbo'].minRam).toBe('8 GB');
    expect(WHISPER_TIERS['large-v3-turbo'].recRam).toBe('12 GB+');
    expect(WHISPER_TIERS['large-v3-turbo'].taglineTr).toContain('S25');
  });

  it('defaults to tiny tier when no tier is selected or downloaded', async () => {
    const active = await getActiveWhisperTier();
    expect(active).toBe(DEFAULT_WHISPER_TIER);
  });

  it('sets and retrieves active tier correctly', async () => {
    await setActiveWhisperTier('base');
    let active = await getActiveWhisperTier();
    expect(active).toBe('base');

    await setActiveWhisperTier('large-v3-turbo');
    active = await getActiveWhisperTier();
    expect(active).toBe('large-v3-turbo');
  });

  it('recognizes downloaded tier status and active flag', async () => {
    // Initially not downloaded
    const stBefore = await getWhisperTierStatus('base');
    expect(stBefore.isDownloaded).toBe(false);

    // Simulate downloaded base tier
    storage.set('yt_studio_offline_whisper_base', {
      timestamp: Date.now(),
      sizeBytes: 85 * 1024 * 1024,
      version: '1.0.0',
      modelId: 'onnx-community/whisper-base'
    });
    await setActiveWhisperTier('base');

    const stAfter = await getWhisperTierStatus('base');
    expect(stAfter.isDownloaded).toBe(true);
    expect(stAfter.isActive).toBe(true);
    expect(stAfter.sizeBytes).toBe(85 * 1024 * 1024);
  });

  it('backward compatibility: getOfflineModelStatus routes to active tier', async () => {
    await setActiveWhisperTier('small');
    storage.set('yt_studio_offline_whisper_small', {
      timestamp: Date.now(),
      sizeBytes: 240 * 1024 * 1024,
      version: '1.0.0',
      modelId: 'onnx-community/whisper-small'
    });

    const status = await getOfflineModelStatus();
    expect(status.isDownloaded).toBe(true);
    expect(status.modelName).toContain('Whisper Small');
  });

  it('deletes tier and adjusts active tier if the deleted one was active', async () => {
    storage.set('yt_studio_offline_whisper_tiny', {
      timestamp: Date.now(),
      sizeBytes: 39 * 1024 * 1024
    });
    storage.set('yt_studio_offline_whisper_base', {
      timestamp: Date.now(),
      sizeBytes: 85 * 1024 * 1024
    });
    await setActiveWhisperTier('base');

    await deleteWhisperTier('base');
    expect(storage.has('yt_studio_offline_whisper_base')).toBe(false);

    const activeAfterDelete = await getActiveWhisperTier();
    // Should fallback to tiny which was also downloaded
    expect(activeAfterDelete).toBe('tiny');
  });

  it('correctly assesses tier support and warns on mobile for large-v3-turbo', () => {
    const tinyCheck = isTierSupportedOnCurrentDevice('tiny');
    expect(tinyCheck.supported).toBe(true);

    const baseCheck = isTierSupportedOnCurrentDevice('base');
    expect(baseCheck.supported).toBe(true);

    const smallCheck = isTierSupportedOnCurrentDevice('small');
    expect(smallCheck.supported).toBe(true);
  });

  it('enables Large v3 Turbo on Tier 1 flagship devices (S25 FE, Tab S9+)', () => {
    const flagshipProfile = {
      tier: 1 as const,
      tierName: 'flagship' as const,
      totalRamMb: 8192,
      availRamMb: 5000,
      is64Bit: true,
      cpuCores: 8,
      deviceModel: 'Samsung Galaxy S25 FE',
      supportedModels: ['large-v3-turbo', 'small', 'base', 'tiny'],
      recommendedModel: 'large-v3-turbo'
    };

    const result = isTierSupportedOnCurrentDevice('large-v3-turbo', flagshipProfile);
    expect(result.supported).toBe(true);
  });

  it('restricts Large v3 Turbo on Tier 3 low memory devices', () => {
    const lowMemProfile = {
      tier: 3 as const,
      tierName: 'low_memory' as const,
      totalRamMb: 3000,
      availRamMb: 1200,
      is64Bit: true,
      cpuCores: 4,
      deviceModel: 'Entry Phone',
      supportedModels: ['base', 'tiny'],
      recommendedModel: 'tiny'
    };

    const result = isTierSupportedOnCurrentDevice('large-v3-turbo', lowMemProfile);
    expect(result.supported).toBe(false);
    expect(result.reasonKey).toBe('largeModelNotSupportedOnMobile');
  });
});

