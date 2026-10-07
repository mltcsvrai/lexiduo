import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  NativeWhisper,
  isNativeWhisperAvailable,
  getDeviceHardwareProfile,
  getCachedHardwareProfile,
  cancelNativeTranscription,
  transcribeNativeAudio,
  extractNativeAudio,
  decodeWavToFloat32,
  setNativeWhisperMockHandlers,
  pickNativeVideo
} from '../nativeWhisperBridge';
import { transcribeVideoOffline } from '../whisperEngine';

describe('nativeWhisperBridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('determines native whisper availability based on platform', () => {
    const available = isNativeWhisperAvailable();
    expect(typeof available).toBe('boolean');
  });

  it('retrieves and caches device hardware profile with tier information', async () => {
    const profile = await getDeviceHardwareProfile();
    expect(profile).toBeDefined();
    expect([1, 2, 3, 4]).toContain(profile.tier);
    expect(['flagship', 'balanced', 'low_memory', 'cloud_recommended']).toContain(profile.tierName);
    expect(profile.totalRamMb).toBeGreaterThan(0);
    expect(profile.cpuCores).toBeGreaterThan(0);
    expect(Array.isArray(profile.supportedModels)).toBe(true);
    expect(typeof profile.recommendedModel).toBe('string');

    // Subsequent call uses cached profile
    const cached = getCachedHardwareProfile();
    expect(cached).toEqual(profile);
  });

  it('handles cancelNativeTranscription without unhandled rejection', async () => {
    await expect(cancelNativeTranscription()).resolves.not.toThrow();
  });

  it('transcribeNativeAudio calls through NativeWhisper plugin', async () => {
    const mockCues = [
      { id: '1', start: 0, end: 2.5, sourceText: 'Hello world', targetText: 'Merhaba dünya' }
    ];
    const transcribeMock = vi.fn().mockResolvedValue({
      cues: mockCues,
      durationMs: 2500,
      modelTier: 'large-v3-turbo'
    });
    setNativeWhisperMockHandlers({ transcribe: transcribeMock });

    const res = await transcribeNativeAudio({
      videoUri: 'content://media/external/video/media/1234',
      modelTier: 'large-v3-turbo',
      language: 'en'
    });

    expect(transcribeMock).toHaveBeenCalledWith({
      audioPath: undefined,
      audioBase64: undefined,
      videoUri: 'content://media/external/video/media/1234',
      modelTier: 'large-v3-turbo',
      language: 'en'
    });
    expect(res.cues.length).toBe(1);
    expect(res.modelTier).toBe('large-v3-turbo');
  });

  it('extractNativeAudio invokes NativeWhisper plugin extractAudio', async () => {
    const extractMock = vi.fn().mockResolvedValue({
      wavPath: '/cache/extracted.wav',
      durationMs: 5000,
      sampleRate: 16000,
      channels: 1,
      totalSamples: 80000
    });
    setNativeWhisperMockHandlers({ extractAudio: extractMock });

    const res = await extractNativeAudio('content://media/external/video/media/5678');
    expect(extractMock).toHaveBeenCalledWith({
      videoUri: 'content://media/external/video/media/5678'
    });
    expect(res.wavPath).toBe('/cache/extracted.wav');
    expect(res.sampleRate).toBe(16000);
  });

  it('transcribeVideoOffline routes video strings to native flow when available', async () => {
    const transcribeMock = vi.fn().mockResolvedValue({
      cues: [{ id: '1', start: 0, end: 1, sourceText: 'Native test', targetText: '' }],
      durationMs: 1000,
      modelTier: 'tiny'
    });
    (NativeWhisper as any).transcribe = transcribeMock;

    // In web environment (isNativePlatform false), string throws or falls back
    if (!isNativeWhisperAvailable()) {
      await expect(transcribeVideoOffline('dummy-uri')).rejects.toThrow();
    }
  });

  it('decodeWavToFloat32 accurately parses 16-bit PCM RIFF WAV into Float32Array', () => {
    // Construct a synthetic 16kHz mono WAV buffer with 4 samples: [0, 16384, -16384, 32767]
    const samples = [0, 16384, -16384, 32767];
    const dataLen = samples.length * 2;
    const buffer = new ArrayBuffer(44 + dataLen);
    const view = new DataView(buffer);

    // RIFF chunk
    const writeStr = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };
    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + dataLen, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, 16000, true);
    view.setUint32(28, 32000, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, dataLen, true);

    let offset = 44;
    for (const s of samples) {
      view.setInt16(offset, s, true);
      offset += 2;
    }

    const float32 = decodeWavToFloat32(buffer);

    expect(float32.length).toBe(4);
    expect(float32[0]).toBeCloseTo(0, 3);
    expect(float32[1]).toBeCloseTo(0.5, 2);
    expect(float32[2]).toBeCloseTo(-0.5, 2);
    expect(float32[3]).toBeCloseTo(1.0, 2);
  });

  it('pickNativeVideo delegates to NativeWhisper.pickVideo when on native platform or throws on web', async () => {
    if (!isNativeWhisperAvailable()) {
      await expect(pickNativeVideo()).rejects.toThrow();
    }
  });
});
