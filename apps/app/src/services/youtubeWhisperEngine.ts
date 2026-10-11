import type { SubtitleCue } from '@lexiduo/core';
import { cacheTranscript, useAppStore, withBackgroundTask } from '@lexiduo/core';
import { downloadAndExtractYouTubeAudio } from './youtubeAudioService';
import { transcribeAudioBuffer, type WhisperProgress } from './whisperEngine';

export interface ProcessYouTubeWhisperOptions {
  videoId: string;
  sourceLang?: string;
  targetLang: string;
  apiKey?: string;
  activeWhisperTierName?: string;
  forceEngine?: 'whisper' | 'gemini';
  t: (key: any) => string;
  onProgress?: (status: string, percent: number, details?: WhisperProgress) => void;
  signal?: AbortSignal;
}

/**
 * Downloads YouTube audio stream, decodes into 16kHz mono PCM,
 * transcribes using Whisper on-device (or fallback Gemini), and caches into IDB.
 */
export async function processYouTubeWhisper(
  options: ProcessYouTubeWhisperOptions
): Promise<SubtitleCue[]> {
  const {
    videoId,
    sourceLang = 'auto',
    targetLang,
    apiKey,
    activeWhisperTierName = 'Whisper AI',
    forceEngine = 'whisper',
    t,
    onProgress,
    signal
  } = options;

  const taskId = `yt_whisper_${videoId}`;
  const taskTitle = `${activeWhisperTierName} - YouTube`;

  return await withBackgroundTask(taskId, taskTitle, async (updateBg) => {
    let maxProgress = 0;
    const safeProgress = (status: string, p: number, details?: WhisperProgress) => {
      maxProgress = Math.max(maxProgress, Math.min(100, Math.round(p)));
      onProgress?.(status, maxProgress, {
        ...details,
        progress: maxProgress,
        percent: maxProgress
      });
      updateBg(status, maxProgress);
    };

    safeProgress(t('downloadingYoutubeAudio'), 5, {
      stage: 'extracting',
      progress: 5,
      detail: t('downloadingYoutubeAudio')
    });

    // 1. Download stream and convert to 16kHz mono Float32Array PCM (0% to 25%)
    const audioSamples = await downloadAndExtractYouTubeAudio(
      videoId,
      (stage, percent) => {
        let stageText = t('downloadingYoutubeAudio');
        if (stage === 'decoding') stageText = t('decodingAudio');
        if (stage === 'resampling') stageText = t('resamplingAudio');
        const overall = Math.min(25, Math.round(percent * 0.25));
        safeProgress(stageText, overall, {
          stage: 'extracting',
          progress: overall,
          detail: stageText
        });
      },
      signal
    );

    if (signal?.aborted) {
      throw new Error('Aborted');
    }

    // 2. Transcribe via Whisper WASM / WebGPU pipeline or Cloud Gemini (25% to 98%)
    const initialStatus = forceEngine === 'gemini'
      ? t('transcribingGemini')
      : `${activeWhisperTierName} ${t('transcribingWhisper')}`;

    safeProgress(initialStatus, 25, {
      stage: 'warming_up',
      progress: 25,
      detail: forceEngine === 'gemini'
        ? t('transcribingGemini')
        : `${activeWhisperTierName} ${t('stageWarmingUp')}`
    });

    const cues = await transcribeAudioBuffer(audioSamples, {
      sourceLang,
      targetLang,
      apiKey,
      forceEngine,
      onProgress: (w) => {
        const scaledProgress = Math.min(98, Math.max(25, 25 + Math.round(((w.progress || 0) / 100) * 73)));
        const defaultStatus = forceEngine === 'gemini' ? t('transcribingGemini') : t('transcribingWhisper');
        safeProgress(w.detail || defaultStatus, scaledProgress, {
          ...w,
          progress: scaledProgress
        });
      }
    });

    // 3. Cache into IndexedDB for instant reload on next playback
    if (cues && cues.length > 0) {
      const detected = useAppStore.getState().detectedSourceLang || (sourceLang !== 'auto' ? sourceLang : 'tr');
      await cacheTranscript(videoId, sourceLang, targetLang, cues, true, detected).catch(() => {});
    }

    safeProgress(t('processingComplete'), 100, {
      stage: 'ready',
      progress: 100,
      detail: t('processingComplete')
    });
    return cues;
  });
}

