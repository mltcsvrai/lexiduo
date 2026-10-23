package com.lexiduo.app.whisper;

import android.util.Log;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.lexiduo.app.models.SubtitleCue;

import java.io.File;
import java.util.ArrayList;
import java.util.List;

/**
 * High-performance on-device C++ Whisper speech recognition engine
 * utilizing Georgi Gerganov's whisper.cpp with native ARM NEON SIMD acceleration.
 */
public class WhisperCppEngine implements AutoCloseable {
    private static final String TAG = "WhisperCppEngine";
    private static boolean sIsLoaded = false;

    static {
        try {
            System.loadLibrary("whisper_jni");
            sIsLoaded = true;
            Log.i(TAG, "Native whisper_jni library loaded successfully. Hardware: " + nativeGetSystemInfo());
        } catch (Throwable t) {
            Log.w(TAG, "whisper_jni library not available on this platform: " + t.getMessage());
            sIsLoaded = false;
        }
    }

    private long contextPtr = 0;
    private final String modelPath;

    public WhisperCppEngine(@NonNull String modelPath) {
        this.modelPath = modelPath;
        if (sIsLoaded && new File(modelPath).exists()) {
            this.contextPtr = nativeInitContext(modelPath);
            if (this.contextPtr == 0) {
                Log.e(TAG, "Failed initializing whisper.cpp context from: " + modelPath);
            }
        }
    }

    public static boolean isAvailable() {
        return sIsLoaded;
    }

    public boolean isLoaded() {
        return contextPtr != 0;
    }

    /**
     * Transcribes normalized 16kHz mono audio float samples with full native C++ execution.
     */
    @NonNull
    public List<SubtitleCue> transcribe(@NonNull float[] samples, @Nullable String language, int numThreads) {
        List<SubtitleCue> cues = new ArrayList<>();
        if (contextPtr == 0 || samples.length == 0) {
            return cues;
        }

        String targetLang = (language == null || language.trim().isEmpty()) ? "auto" : language.toLowerCase().trim().split("[-_]")[0];
        int threads = numThreads > 0 ? numThreads : 4;

        long startTime = System.currentTimeMillis();
        int res = nativeFullTranscribe(contextPtr, samples, targetLang, threads);
        long elapsed = System.currentTimeMillis() - startTime;

        if (res != 0) {
            Log.e(TAG, "whisper_full failed with code " + res);
            return cues;
        }

        int nSegments = nativeGetSegmentCount(contextPtr);
        Log.i(TAG, "whisper.cpp finished in " + elapsed + " ms, produced " + nSegments + " segments.");

        for (int i = 0; i < nSegments; i++) {
            String text = nativeGetSegmentText(contextPtr, i);
            long t0 = nativeGetSegmentT0(contextPtr, i);
            long t1 = nativeGetSegmentT1(contextPtr, i);

            if (text != null && !text.trim().isEmpty()) {
                cues.add(new SubtitleCue(t0, Math.max(t0 + 200, t1), "", text.trim()));
            }
        }

        return cues;
    }

    public void cancel() {
        nativeAbort();
    }

    @Override
    public synchronized void close() {
        cancel();
        if (contextPtr != 0) {
            nativeFreeContext(contextPtr);
            contextPtr = 0;
        }
    }

    // Native declarations matching whisper_jni.cpp
    private static native boolean nativeIsAvailable();
    private static native String nativeGetSystemInfo();
    private static native void nativeAbort();
    private static native long nativeInitContext(String modelPath);
    private static native void nativeFreeContext(long contextPtr);
    private static native int nativeFullTranscribe(long contextPtr, float[] audioData, String language, int numThreads);
    private static native int nativeGetSegmentCount(long contextPtr);
    private static native String nativeGetSegmentText(long contextPtr, int index);
    private static native long nativeGetSegmentT0(long contextPtr, int index);
    private static native long nativeGetSegmentT1(long contextPtr, int index);
}
