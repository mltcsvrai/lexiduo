/**
 * AudioExtractor: Uses Web Audio API OfflineAudioContext to decode 
 * audio from video Files/Blobs into 16,000 Hz Mono Float32Array PCM samples.
 */

import { isNativeWhisperAvailable, extractNativeAudio, loadNativeWavAudio } from './nativeWhisperBridge';

export interface AudioExtractionProgress {
  stage: 'reading' | 'decoding' | 'resampling' | 'done';
  percent: number;
}

export async function extractAudioFromVideo(
  videoFile: File | Blob | string,
  onProgress?: (progress: AudioExtractionProgress) => void
): Promise<Float32Array> {
  const nativeUri = typeof videoFile === 'string'
    ? videoFile
    : ((videoFile as any)?.path || (videoFile as any)?.uri || (videoFile as any)?.webPath);

  if (nativeUri && isNativeWhisperAvailable()) {
    onProgress?.({ stage: 'decoding', percent: 20 });
    const res = await extractNativeAudio(nativeUri, (pct) => {
      onProgress?.({ stage: 'decoding', percent: Math.max(20, Math.min(95, pct)) });
    });
    onProgress?.({ stage: 'resampling', percent: 96 });
    const samples = await loadNativeWavAudio(res.wavPath);
    onProgress?.({ stage: 'done', percent: 100 });
    return samples;
  }

  if (typeof videoFile === 'string') {
    throw new Error('Video URI string extraction is only supported on native platforms.');
  }

  onProgress?.({ stage: 'reading', percent: 10 });

  // 1. Read file as ArrayBuffer
  const arrayBuffer = await videoFile.arrayBuffer();
  onProgress?.({ stage: 'decoding', percent: 40 });

  // 2. Decode audio with AudioContext
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
    sampleRate: 16000
  });

  let decodedBuffer: AudioBuffer;
  try {
    decodedBuffer = await audioContext.decodeAudioData(arrayBuffer);
  } finally {
    if (audioContext.state !== 'closed') {
      await audioContext.close();
    }
  }

  onProgress?.({ stage: 'resampling', percent: 70 });

  // 3. Render into 16kHz mono using OfflineAudioContext
  const targetSampleRate = 16000;
  const numChannels = 1;
  const totalLength = Math.ceil(decodedBuffer.duration * targetSampleRate);

  const offlineContext = new OfflineAudioContext(numChannels, totalLength, targetSampleRate);
  const source = offlineContext.createBufferSource();
  source.buffer = decodedBuffer;
  source.connect(offlineContext.destination);
  source.start(0);

  const renderedBuffer = await offlineContext.startRendering();
  const channelData = renderedBuffer.getChannelData(0);

  onProgress?.({ stage: 'done', percent: 100 });
  return channelData;
}
