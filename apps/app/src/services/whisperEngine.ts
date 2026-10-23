import type { SubtitleCue, TranslationKey } from '@lexiduo/core';
import { aggregateSentenceCues, distributeTargetTextToWindows, smartFetch, translateWithGeminiAI, GEMINI_MODEL_HIERARCHY, useAppStore, withBackgroundTask } from '@lexiduo/core';
import { 
  translateStudioText, 
  getLocalWhisperPipeline, 
  downloadWhisperTier,
  getActiveWhisperTier,
  WHISPER_TIERS,
  type WhisperTierKey
} from './offlineTranslationEngine';
import { isNativeWhisperAvailable, transcribeNativeAudio, loadNativeWavAudio } from './nativeWhisperBridge';
import { getLastCachedAudioPath, setLastCachedAudioPath } from './youtubeAudioService';

export type WhisperStage = 
  | 'extracting'
  | 'warming_up'
  | 'transcribing'
  | 'segmenting'
  | 'translating'
  | 'ready';

export interface WhisperProgress {
  stage?: WhisperStage;
  status?: 'loading_model' | 'transcribing' | 'segmenting' | 'translating' | 'ready' | string;
  progress: number; // 0 - 100
  percent?: number; // alias for progress
  detail?: string;
  processedSeconds?: number;
  totalSeconds?: number;
  etaSeconds?: number;
  speedFactor?: number;
  currentChunk?: number;
  totalChunks?: number;
}

export interface TranscriptionOptions {
  sourceLang?: string;
  targetLang?: string;
  apiKey?: string;
  forceEngine?: 'whisper' | 'gemini';
  videoUri?: string;
  audioPath?: string;
  onProgress?: (progress: WhisperProgress) => void;
  t?: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

import {
  yieldToMain,
  calculateEnergy,
  encodeWav,
  arrayBufferToBase64,
  splitTextIntoSentenceCues
} from './audioBufferUtils';

export { yieldToMain, splitTextIntoSentenceCues };

/**
 * Transcribe local 16kHz mono audio samples into synchronized SubtitleCue segments.
 */
export async function transcribeAudioBuffer(
  audioData: Float32Array,
  options: TranscriptionOptions = {}
): Promise<SubtitleCue[]> {
  const { sourceLang = 'auto', targetLang = 'tr', apiKey, forceEngine } = options;
  const sampleRate = 16000;
  let totalDuration = (audioData as any)?.duration || (audioData.length / sampleRate);

  const taskId = 'whisper_transcription';
  const taskTitle = options.t ? options.t('transcribingWhisper') : 'Whisper AI Transkripsiyon';

  return await withBackgroundTask(taskId, taskTitle, async (updateBg) => {
    const onProgress = (p: WhisperProgress) => {
      options.onProgress?.(p);
      if (p.detail || typeof p.progress === 'number') {
        updateBg(p.detail || (options.t ? options.t('transcribingWhisper') : 'Transcribing...'), p.progress);
      }
    };

    onProgress({
      status: 'loading_model',
      progress: 15,
      percent: 15,
      detail: options.t ? options.t('modelPreparing') : 'Preparing AI model...'
    });

  // 1. Check for active Whisper tier and cached local pipeline
  const activeTierId = await getActiveWhisperTier();
  const tierConfig = WHISPER_TIERS[activeTierId as WhisperTierKey] || WHISPER_TIERS.tiny;

  let nativeWavPath: string | undefined = undefined;

  // Two-Tier Smart Hybrid: Route all tiers to Native Whisper on Android when available
  if (forceEngine !== 'gemini' && isNativeWhisperAvailable()) {
    let cleanLang = (sourceLang || 'auto').replace(/^a\./, '').split('-')[0];
    if (!cleanLang || cleanLang === 'auto') {
      cleanLang = targetLang === 'tr' ? 'tr' : (typeof navigator !== 'undefined' && navigator.language ? navigator.language.slice(0, 2) : 'tr');
    }
    useAppStore.getState().setDetectedSourceLang(cleanLang);

    onProgress({
      stage: 'transcribing',
      status: 'transcribing',
      progress: 30,
      percent: 30,
      detail: options.t ? options.t('nativeTranscribing') : 'Native 64-Bit Whisper Transcription...'
    });

    try {
      let audioBase64: string | undefined = undefined;
      const targetAudioPath = options.audioPath || (audioData as any)?.audioPath || (audioData as any)?.cachedAudioPath || getLastCachedAudioPath();

      if (!options.videoUri && !targetAudioPath && audioData.length > 0) {
        const wavBuffer = encodeWav(audioData, 16000);
        audioBase64 = arrayBufferToBase64(wavBuffer);
      }

      const nativeRes = await transcribeNativeAudio({
        audioPath: targetAudioPath || undefined,
        videoUri: options.videoUri,
        audioBase64,
        modelTier: activeTierId,
        language: cleanLang,
        onProgress: (p) => {
          onProgress({
            stage: p.stage || 'transcribing',
            status: 'transcribing',
            progress: p.progress || 50,
            percent: p.progress || 50,
            detail: p.detail,
            currentChunk: p.currentChunk,
            totalChunks: p.totalChunks,
            processedSeconds: p.processedMs ? Number((p.processedMs / 1000).toFixed(1)) : undefined,
            totalSeconds: p.totalMs ? Number((p.totalMs / 1000).toFixed(1)) : (totalDuration > 0 ? totalDuration : undefined)
          });
        }
      });

      if (nativeRes?.wavPath) {
        nativeWavPath = nativeRes.wavPath;
      }

      // Only accept native result if actual speech was recognized (not empty dummy cues)
      if (nativeRes?.cues && nativeRes.cues.length > 0 && nativeRes.cues.some(c => c.sourceText && c.sourceText.trim() !== '')) {
        setLastCachedAudioPath(null);
        const effectiveDuration = totalDuration > 0 ? totalDuration : (nativeRes.durationMs / 1000);
        return processAndTranslateCues(nativeRes.cues, cleanLang, targetLang, effectiveDuration, onProgress, apiKey, options.t);
      } else if (nativeRes && Array.isArray(nativeRes.cues)) {
        setLastCachedAudioPath(null);
        // Native completed successfully without error; audio has no speech (silence/music)
        onProgress({
          stage: 'ready',
          status: 'ready',
          progress: 100,
          percent: 100,
          detail: options.t ? options.t('subtitlesReady') : 'Subtitles ready!'
        });
        const emptyText = options.t ? `[${options.t('noSpeechDetected')}]` : '[No speech detected]';
        return [{ id: '1', start: 0, end: Math.max(2, totalDuration), sourceText: emptyText, targetText: emptyText }];
      }
    } catch (nativeErr) {
      console.warn('Native Whisper execution fallback notice:', nativeErr);
      if (activeTierId === 'large-v3-turbo') {
        throw new Error((nativeErr as any)?.message || 'Whisper Large v3 Turbo execution error');
      }
    } finally {
      setLastCachedAudioPath(null);
    }
  }

  // If audioData was empty (due to zero-copy video URI routing), recover the 16kHz PCM samples from extracted WAV
  if (audioData.length === 0 && (nativeWavPath || options.videoUri) && isNativeWhisperAvailable()) {
    try {
      if (!nativeWavPath && options.videoUri) {
        const { extractNativeAudio } = await import('./nativeWhisperBridge');
        const ext = await extractNativeAudio(options.videoUri, (pct) => {
          onProgress({
            stage: 'extracting',
            status: 'extracting',
            progress: Math.round(pct * 0.2),
            percent: Math.round(pct * 0.2),
            detail: options.t ? options.t('nativeAudioExtracting') : 'Extracting audio...'
          });
        });
        nativeWavPath = ext.wavPath;
      }
      if (nativeWavPath) {
        audioData = await loadNativeWavAudio(nativeWavPath);
        totalDuration = audioData.length / sampleRate;
      }
    } catch (err) {
      console.warn('Could not recover 16kHz audio samples from native WAV for WASM fallback:', err);
    }
  }

  // Fallback: If native extraction was unavailable or yielded 0 samples, extract via Web Audio API
  if (audioData.length === 0 && options.videoUri) {
    try {
      const { extractAudioFromVideo } = await import('./audioExtractor');
      audioData = await extractAudioFromVideo(options.videoUri as any, (p) => {
        onProgress({
          stage: 'extracting',
          status: 'extracting',
          progress: Math.round(p.percent * 0.2),
          percent: Math.round(p.percent * 0.2),
          detail: options.t ? options.t('nativeAudioExtracting') : 'Extracting audio...'
        });
      });
      totalDuration = audioData.length / sampleRate;
    } catch (fallbackErr) {
      console.warn('Fallback Web Audio extraction notice:', fallbackErr);
    }
  }

  if (totalDuration <= 0 && audioData.length > 0) {
    totalDuration = audioData.length / sampleRate;
  }

  if (audioData.length === 0) {
    onProgress({
      stage: 'ready',
      status: 'ready',
      progress: 100,
      percent: 100,
      detail: options.t ? options.t('subtitlesReady') : 'Subtitles ready!'
    });
    const emptyText = options.t ? `[${options.t('noSpeechDetected')}]` : '[No speech detected]';
    return [{ id: '1', start: 0, end: 2, sourceText: emptyText, targetText: emptyText }];
  }

  const fallbackTierId = activeTierId === 'large-v3-turbo' ? 'small' : activeTierId;
  const fallbackConfig = WHISPER_TIERS[fallbackTierId as WhisperTierKey] || WHISPER_TIERS.tiny;
  let transcriber = forceEngine === 'gemini' ? null : await getLocalWhisperPipeline(fallbackTierId);

  // If local model is not downloaded yet and no Gemini API key, attempt auto-download if online
  if (forceEngine !== 'gemini' && !transcriber && (!apiKey || apiKey.trim().length < 10 || forceEngine === 'whisper')) {
    onProgress?.({
      status: 'loading_model',
      progress: 15,
      percent: 15,
      detail: `${fallbackConfig.name} (~${fallbackConfig.sizeMB} MB)...`
    });
    const downloaded = await downloadWhisperTier(fallbackTierId, (p) => {
      const scaled = Math.min(24, 15 + Math.round(p * 0.09));
      onProgress?.({
        status: 'loading_model',
        progress: scaled,
        percent: scaled,
        detail: `${fallbackConfig.name} (${p}%)...`
      });
    });
    if (downloaded) {
      transcriber = await getLocalWhisperPipeline(fallbackTierId);
    }
  }

  // 2. Perform speech recognition using local Whisper WASM / WebGPU pipeline with cooperative chunking
  if (transcriber && forceEngine !== 'gemini') {
    let cleanLang = (sourceLang || 'auto').replace(/^a\./, '').split('-')[0];
    if (!cleanLang || cleanLang === 'auto') {
      cleanLang = targetLang === 'tr' ? 'tr' : (typeof navigator !== 'undefined' && navigator.language ? navigator.language.slice(0, 2) : 'tr');
    }
    useAppStore.getState().setDetectedSourceLang(cleanLang);

    // Step A: Engine Warmup (shader / JIT pre-compilation)
    onProgress?.({
      stage: 'warming_up',
      status: 'loading_model',
      progress: 25,
      percent: 25,
      detail: options.t ? `${tierConfig.name} - ${options.t('modelPreparing')}` : `${tierConfig.name} engine warming up...`,
      processedSeconds: 0,
      totalSeconds: totalDuration,
      etaSeconds: undefined
    });

    try {
      const dummyAudio = new Float32Array(8000); // 0.5s @ 16kHz
      const warmupPromise = transcriber(dummyAudio, {
        chunk_length_s: 1,
        return_timestamps: false,
        task: 'transcribe',
        language: cleanLang
      });
      const warmupTimeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Whisper warmup timed out')), 8000)
      );
      await Promise.race([warmupPromise, warmupTimeout]);
    } catch (warmupErr) {
      console.warn('Whisper warmup non-fatal notice:', warmupErr);
    }
    await yieldToMain();

    // Step B: Cooperative Chunking with VAD & dynamic ETA
    const windowDuration = 25;
    const stepDuration = 23;
    const windowSize = Math.floor(windowDuration * sampleRate);
    const stepSize = Math.floor(stepDuration * sampleRate);
    const totalSteps = Math.max(1, Math.ceil(audioData.length / stepSize));
    const rawCues: SubtitleCue[] = [];
    let cueId = 1;
    const startTime = performance.now();
    let completedChunks = 0;
    let lastEta: number | undefined = undefined;
    let lastSpeed: number | undefined = undefined;

    try {
      for (let step = 0; step < totalSteps; step++) {
        const startSample = step * stepSize;
        const endSample = Math.min(audioData.length, startSample + windowSize);
        const chunkStartTime = startSample / sampleRate;
        const chunkEndTime = endSample / sampleRate;
        const processedDuration = Math.min(totalDuration, chunkEndTime);

        const progressPct = totalDuration > 0
          ? Math.min(85, Math.max(25, 25 + Math.round((processedDuration / totalDuration) * 60)))
          : 25;

        onProgress?.({
          stage: 'transcribing',
          status: 'transcribing',
          progress: progressPct,
          percent: progressPct,
          detail: `${options.t ? options.t('analyzingAudioWaves') : 'Analyzing audio waveforms...'} (${Math.round(processedDuration)}s / ${Math.round(totalDuration)}s)...`,
          processedSeconds: Number(processedDuration.toFixed(1)),
          totalSeconds: Number(totalDuration.toFixed(1)),
          etaSeconds: lastEta,
          speedFactor: lastSpeed,
          currentChunk: step + 1,
          totalChunks: totalSteps
        });

        // Energy-based Voice Activity Detection (VAD)
        const energy = calculateEnergy(audioData, startSample, endSample);
        if (energy >= 0.00006) {
          const slice = audioData.subarray(startSample, endSample);
          // Allow UI event loop to paint progress update before heavy computation
          await yieldToMain();

          let output: any = null;
          try {
            const outputPromise = transcriber(slice, {
              return_timestamps: true,
              task: 'transcribe',
              language: cleanLang,
              max_new_tokens: 80,
              temperature: 0.0
            });
            const chunkTimeoutMs = activeTierId === 'large-v3-turbo' ? 120000 : activeTierId === 'small' ? 75000 : 45000;
            const timeoutPromise = new Promise<{ text: string }>((_, reject) =>
              setTimeout(() => reject(new Error(`Whisper chunk processing timeout (${chunkTimeoutMs / 1000}s)`)), chunkTimeoutMs)
            );
            output = await Promise.race([outputPromise, timeoutPromise]);
          } catch (chunkErr) {
            console.warn(`Chunk ${step + 1}/${totalSteps} recognition warning:`, chunkErr);
          }

          if (output?.chunks && Array.isArray(output.chunks) && output.chunks.length > 0) {
            for (const chunk of output.chunks) {
              const text = (chunk.text || '').trim();
              if (!text) continue;
              const relStart = Math.max(0, Number(chunk.timestamp?.[0] ?? 0));
              const absStart = chunkStartTime + relStart;
              let relEnd = chunk.timestamp?.[1] != null 
                ? Number(chunk.timestamp[1]) 
                : Math.min(chunkEndTime - chunkStartTime, relStart + Math.max(2.5, text.length * 0.08));
              let absEnd = chunkStartTime + relEnd;
              if (absEnd <= absStart) absEnd = Math.min(totalDuration, absStart + 2);

              rawCues.push({
                id: String(cueId++),
                start: Number(absStart.toFixed(2)),
                end: Number(absEnd.toFixed(2)),
                sourceText: text,
                targetText: ''
              });
            }
          } else if (output?.text && output.text.trim()) {
            const split = splitTextIntoSentenceCues(output.text.trim(), chunkStartTime, chunkEndTime, cueId);
            rawCues.push(...split.cues);
            cueId = split.nextId;
          }
        }

        completedChunks++;
        const elapsedSec = Math.max(0.5, (performance.now() - startTime) / 1000);
        const currentSpeed = processedDuration / elapsedSec;
        lastSpeed = Number(currentSpeed.toFixed(1));
        const remainingDuration = Math.max(0, totalDuration - processedDuration);
        lastEta = currentSpeed > 0 ? Math.round(remainingDuration / currentSpeed) : undefined;

        await yieldToMain();
      }

      if (rawCues.length > 0) {
        return processAndTranslateCues(rawCues, cleanLang, targetLang, totalDuration, onProgress, apiKey, options.t);
      }
    } catch (err) {
      console.warn('Local Whisper execution error:', err);
    }
  }

  // 3. Fallback: Gemini cloud API if API key is provided
  if (apiKey && apiKey.trim().length > 10) {
    const chunkDuration = 10;
    const stepDuration = 9.5;
    const chunkSize = chunkDuration * sampleRate;
    const stepSize = Math.floor(stepDuration * sampleRate);
    const rawCues: SubtitleCue[] = [];
    let cueId = 1;
    const totalSteps = Math.max(1, Math.ceil(audioData.length / stepSize));

    for (let step = 0; step < totalSteps; step++) {
      const startSample = step * stepSize;
      const endSample = Math.min(audioData.length, startSample + chunkSize);
      const chunkTimeStart = startSample / sampleRate;
      const chunkTimeEnd = endSample / sampleRate;

      const progressPercent = Math.min(75, Math.round(15 + (step / totalSteps) * 60));
      onProgress?.({
        stage: 'transcribing',
        status: 'transcribing',
        progress: progressPercent,
        detail: `${options.t ? options.t('transcribingSpeech') : 'Transcribing speech...'} (${Math.round(chunkTimeStart)}s / ${Math.round(totalDuration)}s)...`,
        processedSeconds: Number(chunkTimeEnd.toFixed(1)),
        totalSeconds: Number(totalDuration.toFixed(1))
      });

      const energy = calculateEnergy(audioData, startSample, endSample);
      if (energy < 0.00002) continue;

      const slice = audioData.subarray(startSample, endSample);
      const segmentText = await processAudioSlice(slice, sourceLang, apiKey);
      if (segmentText && segmentText.trim().length > 0) {
        const split = splitTextIntoSentenceCues(segmentText.trim(), chunkTimeStart, chunkTimeEnd, cueId);
        rawCues.push(...split.cues);
        cueId = split.nextId;
      }
      await yieldToMain();
    }

    if (rawCues.length > 0) {
      return processAndTranslateCues(rawCues, sourceLang, targetLang, totalDuration, onProgress, apiKey, options.t);
    }
  }

  // 4. If neither Whisper model was available nor Gemini returned speech:
  onProgress?.({
    stage: 'ready',
    status: 'ready',
    progress: 100,
    detail: options.t ? options.t('subtitlesReady') : 'Subtitles ready!'
  });

    const emptyText = options.t ? `[${options.t('noSpeechDetected')}]` : '[No speech detected]';
    return [
      {
        id: '1',
        start: 0,
        end: Number(Math.max(2, totalDuration).toFixed(2)),
        sourceText: emptyText,
        targetText: emptyText
      }
    ];
  });
}

async function processAndTranslateCues(
  rawCues: SubtitleCue[],
  sourceLang: string,
  targetLang: string,
  totalDuration: number,
  onProgress?: (progress: WhisperProgress) => void,
  apiKey?: string,
  t?: (key: TranslationKey, params?: Record<string, string | number>) => string
): Promise<SubtitleCue[]> {
  const sentenceGroups = aggregateSentenceCues(rawCues);
  const fastCues: SubtitleCue[] = [];
  const totalGroups = sentenceGroups.length;

  onProgress?.({
    stage: 'segmenting',
    status: 'segmenting',
    progress: 88,
    detail: t ? t('segmentingSentences') : 'Segmenting sentences into blocks...',
    processedSeconds: totalDuration,
    totalSeconds: totalDuration,
    etaSeconds: Math.max(1, Math.round(totalGroups * 0.1))
  });
  await yieldToMain();

  for (let i = 0; i < totalGroups; i++) {
    const group = sentenceGroups[i];
    let targetSentence = group.fullSourceText;
    if (group.fullSourceText && !group.fullSourceText.startsWith('[')) {
      try {
        const tr = await translateStudioText(group.fullSourceText, sourceLang, targetLang);
        if (tr) targetSentence = tr;
      } catch {
        // Fallback to source text
      }
    }
    const distributed = distributeTargetTextToWindows(group, targetSentence);
    fastCues.push(...distributed);

    if (i % 3 === 0 || i === totalGroups - 1) {
      const p = Math.min(96, 88 + Math.round(((i + 1) / totalGroups) * 8));
      const remainingItems = totalGroups - (i + 1);
      onProgress?.({
        stage: 'translating',
        status: 'translating',
        progress: p,
        detail: `${t ? t('translatingSubtitles') : 'Translating subtitles...'} (${i + 1}/${totalGroups})...`,
        processedSeconds: totalDuration,
        totalSeconds: totalDuration,
        etaSeconds: Math.max(0, Math.round(remainingItems * 0.08))
      });
      await yieldToMain();
    }
  }

  let finalCues = fastCues.length > 0 ? fastCues : rawCues;

  // Contextual AI translation with Gemini when API key is provided
  if (apiKey && apiKey.trim().length > 10) {
    onProgress?.({
      stage: 'translating',
      status: 'translating',
      progress: 98,
      detail: t ? t('contextualAiTranslation') : 'Enhancing translation with AI...',
      processedSeconds: totalDuration,
      totalSeconds: totalDuration,
      etaSeconds: 1
    });
    try {
      const geminiCues = await translateWithGeminiAI(
        finalCues,
        sourceLang,
        targetLang,
        apiKey.trim()
      );
      if (geminiCues && geminiCues.length > 0 && geminiCues.some(c => c.targetText && c.targetText.trim() !== '')) {
        finalCues = geminiCues;
      }
    } catch (geminiErr) {
      console.warn('Gemini contextual translation failed, keeping fast cues fallback:', geminiErr);
    }
  }

  onProgress?.({
    stage: 'ready',
    status: 'ready',
    progress: 100,
    detail: t ? t('subtitlesReady') : 'Subtitles ready!',
    processedSeconds: totalDuration,
    totalSeconds: totalDuration,
    etaSeconds: 0
  });

  return finalCues;
}


/**
 * Speech Recognition Slice Processor:
 * Transcribes audio slice using Gemini audio API when API key is provided,
 * or gracefully returns empty string for offline silence filtering.
 */
async function processAudioSlice(
  slice: Float32Array,
  sourceLang: string,
  apiKey?: string
): Promise<string> {
  if (apiKey && apiKey.trim().length > 10) {
    const models = GEMINI_MODEL_HIERARCHY;
    const wav = encodeWav(slice, 16000);
    const base64Audio = arrayBufferToBase64(wav);
    const langPrompt = sourceLang && sourceLang !== 'auto' ? ` in ${sourceLang}` : '';

    for (const model of models) {
      try {
        const res = await smartFetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey.trim()}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { text: `Transcribe the speech${langPrompt} in this audio clip verbatim. Return ONLY the transcribed text. If there is no discernible speech, return nothing.` },
                  { inlineData: { mimeType: 'audio/wav', data: base64Audio } }
                ]
              }]
            })
          },
          12000
        );
        if (res.ok) {
          const data = await res.json();
          const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
          if (text) return text;
        }
      } catch (e) {
        console.warn(`AI audio transcription with ${model} notice:`, e);
      }
    }
  }

  return '';
}

/**
 * Transcribes video file or URI with adaptive two-tier routing:
 * On native Android, passes video URI directly to NativeAudioExtractor & NativeWhisper (0 MB RAM).
 * In web / fallback mode, decodes audio with Web Audio API and runs WASM/Gemini.
 */
export async function transcribeVideoOffline(
  videoSource: File | Blob | string,
  options: TranscriptionOptions = {}
): Promise<SubtitleCue[]> {
  const nativeUri = typeof videoSource === 'string'
    ? videoSource
    : ((videoSource as any)?.path || (videoSource as any)?.uri || (videoSource as any)?.webPath);

  if (nativeUri && isNativeWhisperAvailable()) {
    return transcribeAudioBuffer(new Float32Array(0), {
      ...options,
      videoUri: nativeUri
    });
  }

  const { extractAudioFromVideo } = await import('./audioExtractor');
  const samples = await extractAudioFromVideo(
    videoSource as File | Blob,
    options.onProgress ? (p) => {
      options.onProgress?.({
        stage: 'extracting',
        status: 'extracting',
        progress: Math.round(p.percent * 0.2),
        percent: Math.round(p.percent * 0.2),
        detail: options.t ? options.t('nativeAudioExtracting') : 'Extracting audio...'
      });
    } : undefined
  );

  return transcribeAudioBuffer(samples, options);
}
