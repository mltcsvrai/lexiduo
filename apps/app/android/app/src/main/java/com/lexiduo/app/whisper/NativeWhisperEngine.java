package com.lexiduo.app.whisper;

import android.app.ActivityManager;
import android.content.Context;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.lexiduo.app.models.SubtitleCue;
import com.lexiduo.app.services.BackgroundTaskService;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;
import java.nio.LongBuffer;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtSession;

/**
 * NativeWhisperEngine coordinates on-device 64-bit ARM NEON Whisper execution
 * using Microsoft ONNX Runtime (com.microsoft.onnxruntime:onnxruntime-android).
 * Runs completely in a background thread with zero WebView RAM impact.
 */
public class NativeWhisperEngine {
    private static final String TAG = "NativeWhisperEngine";
    private static final int SAMPLE_RATE = 16000;
    private static final int CHUNK_SECONDS = 25;
    private static final int STEP_SECONDS = 23;
    private static final int CHUNK_SAMPLES = CHUNK_SECONDS * SAMPLE_RATE;
    private static final int STEP_SAMPLES = STEP_SECONDS * SAMPLE_RATE;

    private final Context context;
    private final AtomicBoolean isCancelled = new AtomicBoolean(false);
    private final WhisperFeatureExtractor featureExtractor = new WhisperFeatureExtractor();
    private final WhisperTokenizer tokenizer = new WhisperTokenizer();

    private OrtEnvironment ortEnv;
    private OrtSession currentEncoderSession;
    private OrtSession currentDecoderSession;
    private String loadedModelTier = null;

    public interface ProgressListener {
        void onProgress(int progressPct, @NonNull String detail, int currentChunk, int totalChunks, long processedMs, long totalMs);
    }

    public static class TranscriptionResult {
        public final List<SubtitleCue> cues;
        public final long durationMs;
        public final String modelTier;

        public TranscriptionResult(List<SubtitleCue> cues, long durationMs, String modelTier) {
            this.cues = cues;
            this.durationMs = durationMs;
            this.modelTier = modelTier;
        }

        public JSONArray toJSONArray() {
            JSONArray arr = new JSONArray();
            for (int i = 0; i < cues.size(); i++) {
                SubtitleCue cue = cues.get(i);
                try {
                    JSONObject obj = new JSONObject();
                    obj.put("id", String.valueOf(i + 1));
                    obj.put("start", cue.startMs / 1000.0);
                    obj.put("end", cue.endMs / 1000.0);
                    obj.put("sourceText", cue.sourceText);
                    obj.put("targetText", cue.targetText);
                    arr.put(obj);
                } catch (Exception e) {
                    Log.w(TAG, "Error serializing cue", e);
                }
            }
            return arr;
        }
    }

    public NativeWhisperEngine(@NonNull Context context) {
        this.context = context.getApplicationContext();
        try {
            this.ortEnv = OrtEnvironment.getEnvironment();
            Log.i(TAG, "Initialized Microsoft ONNX Runtime environment (64-Bit ARM NEON enabled)");
        } catch (Throwable t) {
            Log.e(TAG, "Failed initializing OrtEnvironment", t);
        }
    }

    public void cancel() {
        isCancelled.set(true);
    }

    public boolean isCancelled() {
        return isCancelled.get();
    }

    /**
     * Executes native Whisper transcription for the specified 16kHz mono WAV file.
     */
    public TranscriptionResult transcribe(
            @NonNull File wavFile,
            @NonNull String modelTier,
            @NonNull String language,
            @Nullable ProgressListener progressListener
    ) throws Exception {
        isCancelled.set(false);
        String bgTaskId = "native_whisper_" + System.currentTimeMillis();

        BackgroundTaskService.startTask(
                context,
                bgTaskId,
                "Whisper AI (" + modelTier + ")",
                "İşleniyor...",
                5
        );

        try {
            // 1. Ensure model sessions are loaded from disk
            ensureModelLoaded(modelTier);

            // 2. Read WAV header and calculate total samples and duration
            long fileLength = wavFile.length();
            if (fileLength <= 44) {
                return new TranscriptionResult(new ArrayList<>(), 0, modelTier);
            }
            long totalPcmBytes = fileLength - 44;
            long totalSamples = totalPcmBytes / 2;
            long totalDurationMs = (totalSamples * 1000L) / SAMPLE_RATE;

            if (totalSamples == 0) {
                return new TranscriptionResult(new ArrayList<>(), 0, modelTier);
            }

            if (progressListener != null) {
                progressListener.onProgress(10, "Ses dalgaları analiz ediliyor...", 0, 1, 0, totalDurationMs);
            }
            BackgroundTaskService.updateTask(context, bgTaskId, "Ses dalgaları analiz ediliyor...", 10);

            int nMels = "large-v3-turbo".equals(modelTier) ? 128 : 80;
            int totalSteps = Math.max(1, (int) Math.ceil((double) totalSamples / STEP_SAMPLES));
            List<SubtitleCue> cues = new ArrayList<>();

            for (int step = 0; step < totalSteps; step++) {
                if (isCancelled.get() || !BackgroundTaskService.isTaskRunning(bgTaskId)) {
                    Log.i(TAG, "Transcription cancelled or service stopped at step " + step);
                    break;
                }

                int startSample = step * STEP_SAMPLES;
                int endSample = Math.min((int) totalSamples, startSample + CHUNK_SAMPLES);
                int chunkSampleCount = endSample - startSample;
                if (chunkSampleCount <= 0) break;

                long chunkStartMs = (startSample * 1000L) / SAMPLE_RATE;
                long chunkEndMs = (endSample * 1000L) / SAMPLE_RATE;

                int progressPct = Math.min(95, 12 + (int) (((double) endSample / totalSamples) * 78));
                String detail = "Deşifre ediliyor: " + (chunkEndMs / 1000) + "s / " + (totalDurationMs / 1000) + "s";

                if (progressListener != null) {
                    progressListener.onProgress(progressPct, detail, step + 1, totalSteps, chunkEndMs, totalDurationMs);
                }
                BackgroundTaskService.updateTask(context, bgTaskId, detail, progressPct);

                // High-performance combined Rust fast path or pure Java fallback
                if (NativeRustBridge.isLoaded()) {
                    float[] flatFeatures = NativeRustBridge.extractMelFromWavChunk(
                            wavFile.getAbsolutePath(),
                            startSample,
                            chunkSampleCount,
                            nMels,
                            0.00015f
                    );
                    if (flatFeatures != null && flatFeatures.length > 0) {
                        String recognizedText = inferChunkWithFlatFeatures(flatFeatures, nMels, language, modelTier);
                        if (recognizedText != null && !recognizedText.trim().isEmpty()) {
                            List<SubtitleCue> splitCues = splitSentenceCues(
                                    recognizedText.trim(),
                                    chunkStartMs,
                                    chunkEndMs
                            );
                            cues.addAll(splitCues);
                        }
                    }
                } else {
                    // Fallback: on-demand chunk streaming and Java VAD
                    float[] chunkSlice = readWavChunk(wavFile, startSample, chunkSampleCount);
                    double energy = calculateEnergy(chunkSlice);
                    if (energy >= 0.00015) {
                        String recognizedText = inferChunkWithOnnx(chunkSlice, nMels, language, modelTier);
                        if (recognizedText != null && !recognizedText.trim().isEmpty()) {
                            List<SubtitleCue> splitCues = splitSentenceCues(
                                    recognizedText.trim(),
                                    chunkStartMs,
                                    chunkEndMs
                            );
                            cues.addAll(splitCues);
                        }
                    }
                }
            }

            if (progressListener != null) {
                progressListener.onProgress(100, "Tamamlandı", totalSteps, totalSteps, totalDurationMs, totalDurationMs);
            }

            return new TranscriptionResult(cues, totalDurationMs, modelTier);
        } finally {
            BackgroundTaskService.finishTask(context, bgTaskId);
            if ("large-v3-turbo".equals(modelTier)) {
                closeSessions();
                System.gc();
            }
        }
    }

    /**
     * Loads ONNX encoder and decoder sessions from internal disk storage.
     */
    private synchronized void ensureModelLoaded(String modelTier) throws Exception {
        if (modelTier.equals(loadedModelTier) && currentEncoderSession != null && currentDecoderSession != null) {
            return;
        }

        File modelDir = new File(context.getFilesDir(), "whisper_models/" + modelTier);
        if (!modelDir.exists() || !modelDir.isDirectory()) {
            throw new FileNotFoundException("Whisper model '" + modelTier + "' is not downloaded. Expected directory: " + modelDir.getAbsolutePath());
        }

        File encoderFile = findModelFile(modelDir, "encoder");
        File decoderFile = findModelFile(modelDir, "decoder");
        File tokenizerFile = new File(modelDir, "tokenizer.json");

        if (encoderFile == null || !encoderFile.exists()) {
            throw new FileNotFoundException("Encoder model ONNX file not found in " + modelDir.getAbsolutePath());
        }
        if (decoderFile == null || !decoderFile.exists()) {
            throw new FileNotFoundException("Decoder model ONNX file not found in " + modelDir.getAbsolutePath());
        }

        // Load tokenizer vocabulary
        if (tokenizerFile.exists()) {
            tokenizer.load(tokenizerFile);
        }

        closeSessions();

        if ("large-v3-turbo".equals(modelTier)) {
            ActivityManager actManager = (ActivityManager) context.getSystemService(Context.ACTIVITY_SERVICE);
            if (actManager != null) {
                ActivityManager.MemoryInfo memInfo = new ActivityManager.MemoryInfo();
                actManager.getMemoryInfo(memInfo);
                long availMb = memInfo.availMem / (1024 * 1024);
                if (availMb < 1000 || memInfo.lowMemory) {
                    System.gc();
                    actManager.getMemoryInfo(memInfo);
                    availMb = memInfo.availMem / (1024 * 1024);
                    if (availMb < 750 || memInfo.lowMemory) {
                        throw new IllegalStateException("Cihazınızda yeterli boş RAM bulunmuyor (" + availMb + " MB boş). Whisper Large v3 Turbo en az 1.5 GB boş RAM gerektirir. Lütfen Whisper Small modelini tercih edin.");
                    }
                }
            }
        }

        if (ortEnv == null) {
            ortEnv = OrtEnvironment.getEnvironment();
        }

        OrtSession.SessionOptions options = new OrtSession.SessionOptions();
        options.setOptimizationLevel(OrtSession.SessionOptions.OptLevel.BASIC_OPT);
        int cpuCores = Runtime.getRuntime().availableProcessors();
        // Optimize threads: bound between 2 and 4 cores to avoid thermal throttling and UI/OS starvation
        int optimalThreads = Math.min(4, Math.max(2, cpuCores <= 4 ? cpuCores : 4));
        options.setIntraOpNumThreads(optimalThreads);
        options.setInterOpNumThreads(1);
        options.setMemoryPatternOptimization(true);

        try {
            options.addNnapi();
        } catch (Throwable ignored) {
            // Safe CPU fallback if NNAPI execution provider is unavailable
        }

        Log.i(TAG, "Loading ONNX encoder from: " + encoderFile.getName() + " with " + optimalThreads + " threads");
        currentEncoderSession = ortEnv.createSession(encoderFile.getAbsolutePath(), options);

        Log.i(TAG, "Loading ONNX decoder from: " + decoderFile.getName() + " with " + optimalThreads + " threads");
        currentDecoderSession = ortEnv.createSession(decoderFile.getAbsolutePath(), options);

        loadedModelTier = modelTier;
        Log.i(TAG, "Whisper model '" + modelTier + "' loaded successfully into 64-bit ONNX Runtime.");
    }

    private File findModelFile(File modelDir, String prefix) {
        File[] files = modelDir.listFiles();
        if (files == null) return null;

        // Prioritize unmerged decoder without KV-cache for robust standalone inference
        if ("decoder".equalsIgnoreCase(prefix)) {
            for (File f : files) {
                String name = f.getName().toLowerCase();
                if (name.startsWith("decoder") && name.endsWith(".onnx") && !name.contains("merged") && !name.contains("with_past") && f.length() > 0) {
                    return f;
                }
            }
        }

        for (File f : files) {
            String name = f.getName().toLowerCase();
            if (name.startsWith(prefix) && name.endsWith(".onnx") && f.length() > 0) {
                return f;
            }
        }
        return null;
    }

    /**
     * High-speed ONNX inference using flat 1D features from Rust wrapped in a zero-copy FloatBuffer.
     */
    private String inferChunkWithFlatFeatures(float[] flatFeatures, int nMels, String language, String modelTier) {
        if (currentEncoderSession == null || currentDecoderSession == null || ortEnv == null || flatFeatures == null) {
            return "";
        }

        try {
            FloatBuffer featureBuffer = FloatBuffer.wrap(flatFeatures);
            long[] tensorShape = new long[]{1L, (long) nMels, 3000L};
            try (OnnxTensor inputFeaturesTensor = OnnxTensor.createTensor(ortEnv, featureBuffer, tensorShape)) {
                return runEncoderAndDecoder(inputFeaturesTensor, language, modelTier);
            }
        } catch (Throwable t) {
            Log.w(TAG, "ONNX flat features inference notice: " + t.getMessage());
            return "";
        }
    }

    /**
     * Executes ONNX Runtime encoder and autoregressive greedy decoder for an audio chunk (Pure Java Fallback).
     */
    private String inferChunkWithOnnx(float[] chunkAudio, int nMels, String language, String modelTier) {
        if (currentEncoderSession == null || currentDecoderSession == null || ortEnv == null) {
            return "";
        }

        try {
            // 1. Extract Log-Mel Spectrogram features: float[1][nMels][3000]
            float[][][] features = featureExtractor.extractFeatures(chunkAudio, nMels);

            try (OnnxTensor inputFeaturesTensor = OnnxTensor.createTensor(ortEnv, features)) {
                return runEncoderAndDecoder(inputFeaturesTensor, language, modelTier);
            }
        } catch (Throwable t) {
            Log.w(TAG, "ONNX inference chunk notice: " + t.getMessage());
            return "";
        }
    }

    private String runEncoderAndDecoder(OnnxTensor inputFeaturesTensor, String language, String modelTier) throws Exception {
        // Run Encoder Session
        Map<String, OnnxTensor> encoderInputs = Collections.singletonMap("input_features", inputFeaturesTensor);
        try (OrtSession.Result encoderOutput = currentEncoderSession.run(encoderInputs)) {
            OnnxTensor hiddenStates = (OnnxTensor) encoderOutput.get(0);

                    // 3. Autoregressive Greedy Search Loop
                    long[] promptTokens = tokenizer.getInitialPromptTokens(language, modelTier);
                    List<Long> generatedTokens = new ArrayList<>();
                    for (long t : promptTokens) {
                        generatedTokens.add(t);
                    }

                    boolean hasUseCacheBranch = currentDecoderSession.getInputNames().contains("use_cache_branch");
                    OnnxTensor branchTensor = null;
                    if (hasUseCacheBranch) {
                        branchTensor = OnnxTensor.createTensor(ortEnv, new boolean[]{false});
                    }

                    try {
                        int maxNewTokens = ("large-v3-turbo".equals(modelTier) || "small".equals(modelTier)) ? 60 : 80;
                        int repeatCount = 0;
                        long lastToken = -1;

                        for (int step = 0; step < maxNewTokens; step++) {
                            if (isCancelled.get()) break;

                            int currentLen = generatedTokens.size();
                            long[][] inputIds = new long[1][currentLen];
                            for (int i = 0; i < currentLen; i++) {
                                inputIds[0][i] = generatedTokens.get(i);
                            }

                            try (OnnxTensor inputIdsTensor = OnnxTensor.createTensor(ortEnv, inputIds)) {
                                Map<String, OnnxTensor> decoderInputs = new HashMap<>();
                                decoderInputs.put("input_ids", inputIdsTensor);
                                decoderInputs.put("encoder_hidden_states", hiddenStates);
                                if (branchTensor != null) {
                                    decoderInputs.put("use_cache_branch", branchTensor);
                                }

                                try (OrtSession.Result decoderOutput = currentDecoderSession.run(decoderInputs)) {
                                    OnnxTensor logitsTensor = (OnnxTensor) decoderOutput.get(0);
                                    FloatBuffer fb = logitsTensor.getFloatBuffer();
                                    long[] shape = logitsTensor.getInfo().getShape();
                                    int vocabSize = (int) shape[shape.length - 1];
                                    int offset = (currentLen - 1) * vocabSize;

                                    // Argmax using direct native FloatBuffer (zero-copy, zero GC allocation)
                                    int bestToken = 0;
                                    float maxLogit = -Float.MAX_VALUE;
                                    for (int v = 0; v < vocabSize; v++) {
                                        float val = fb.get(offset + v);
                                        if (val > maxLogit) {
                                            maxLogit = val;
                                            bestToken = v;
                                        }
                                    }

                                    if (bestToken == tokenizer.getEndOfTranscriptToken(modelTier)) {
                                        break;
                                    }

                                    // Hallucination and repetition protection: early stop on 3 consecutive identical tokens
                                    if (bestToken == lastToken) {
                                        repeatCount++;
                                        if (repeatCount >= 3) {
                                            Log.d(TAG, "Early stop: detected 3 consecutive identical tokens (" + bestToken + ")");
                                            break;
                                        }
                                    } else {
                                        lastToken = bestToken;
                                        repeatCount = 1;
                                    }

                                    generatedTokens.add((long) bestToken);
                                }
                            }
                        }
                    } finally {
                        if (branchTensor != null) {
                            try { branchTensor.close(); } catch (Exception ignored) {}
                        }
                    }

                    // Convert generated tokens to text
                    long[] finalTokens = new long[generatedTokens.size()];
                    for (int i = 0; i < generatedTokens.size(); i++) {
                        finalTokens[i] = generatedTokens.get(i);
                    }

                    return tokenizer.decode(finalTokens);
                }
    }

    public synchronized void close() {
        closeSessions();
    }

    private void closeSessions() {
        if (currentEncoderSession != null) {
            try { currentEncoderSession.close(); } catch (Exception ignored) {}
            currentEncoderSession = null;
        }
        if (currentDecoderSession != null) {
            try { currentDecoderSession.close(); } catch (Exception ignored) {}
            currentDecoderSession = null;
        }
        loadedModelTier = null;
    }

    private float[] readWavChunk(File wavFile, int startSample, int numSamples) throws IOException {
        if (numSamples <= 0) return new float[0];
        long byteOffset = 44L + ((long) startSample * 2L);
        int bytesToRead = numSamples * 2;
        byte[] buffer = new byte[bytesToRead];

        try (RandomAccessFile raf = new RandomAccessFile(wavFile, "r")) {
            raf.seek(byteOffset);
            int totalRead = 0;
            while (totalRead < bytesToRead) {
                int r = raf.read(buffer, totalRead, bytesToRead - totalRead);
                if (r < 0) break;
                totalRead += r;
            }

            int sampleCount = totalRead / 2;
            float[] samples = new float[sampleCount];
            ByteBuffer bb = ByteBuffer.wrap(buffer, 0, totalRead).order(ByteOrder.LITTLE_ENDIAN);
            for (int i = 0; i < sampleCount; i++) {
                short s = bb.getShort();
                samples[i] = Math.max(-1.0f, Math.min(1.0f, s / 32768.0f));
            }
            return samples;
        }
    }

    private double calculateEnergy(float[] samples) {
        if (samples == null || samples.length == 0) return 0.0;
        double sum = 0.0;
        for (float s : samples) {
            sum += s * s;
        }
        return sum / samples.length;
    }

    private List<SubtitleCue> splitSentenceCues(String text, long startMs, long endMs) {
        List<SubtitleCue> list = new ArrayList<>();
        String[] parts = text.split("(?<=[.?!。؟！？])\\s+");
        if (parts.length <= 1) {
            list.add(new SubtitleCue(startMs, endMs, "", text));
            return list;
        }

        long totalDur = Math.max(100, endMs - startMs);
        int totalChars = 0;
        for (String p : parts) totalChars += Math.max(1, p.length());

        long curStart = startMs;
        for (int i = 0; i < parts.length; i++) {
            String p = parts[i].trim();
            if (p.isEmpty()) continue;
            boolean isLast = (i == parts.length - 1);
            long dur = (p.length() * totalDur) / Math.max(1, totalChars);
            long curEnd = isLast ? endMs : curStart + dur;
            list.add(new SubtitleCue(curStart, curEnd, "", p));
            curStart = curEnd;
        }
        return list;
    }
}
