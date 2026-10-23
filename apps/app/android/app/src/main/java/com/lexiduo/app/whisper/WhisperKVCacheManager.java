package com.lexiduo.app.whisper;

import android.util.Log;

import java.nio.FloatBuffer;
import java.util.HashMap;
import java.util.Map;

import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtException;
import ai.onnxruntime.OrtSession;

/**
 * Manages Key-Value (KV) cache tensors for Whisper merged decoder inference,
 * reducing autoregressive decoder complexity from O(N^2) to O(N).
 * Handles dynamic attention head dimensions, persistent cross-attention caching,
 * and deterministic C++ tensor deallocation.
 */
public class WhisperKVCacheManager implements AutoCloseable {
    private static final String TAG = "WhisperKVCacheManager";

    private final OrtEnvironment ortEnv;
    private final int numLayers;
    private final int numHeads;
    private final int headDim;

    private Map<String, OnnxTensor> currentCache = new HashMap<>();

    public WhisperKVCacheManager(OrtEnvironment ortEnv, String modelTier) {
        this.ortEnv = ortEnv;

        // Configure architecture hyperparameters per Whisper tier
        switch (modelTier.toLowerCase()) {
            case "tiny":
                this.numLayers = 4;
                this.numHeads = 6;
                this.headDim = 64;
                break;
            case "base":
                this.numLayers = 6;
                this.numHeads = 8;
                this.headDim = 64;
                break;
            case "large-v3-turbo":
                // Whisper Large v3 Turbo prunes text decoder to 4 layers while keeping 20 heads
                this.numLayers = 4;
                this.numHeads = 20;
                this.headDim = 64;
                break;
            case "small":
            default:
                this.numLayers = 12;
                this.numHeads = 12;
                this.headDim = 64;
                break;
        }

        Log.i(TAG, "Initialized KV-cache for tier '" + modelTier + "': " + numLayers + " layers, " + numHeads + " heads, dim " + headDim);
    }

    public int getNumLayers() {
        return numLayers;
    }

    public int getNumHeads() {
        return numHeads;
    }

    public int getHeadDim() {
        return headDim;
    }

    /**
     * Creates empty dummy tensors with sequence_length = 0 for step 0 (use_cache_branch = false).
     */
    public Map<String, OnnxTensor> createInitialPastInputs() throws OrtException {
        close(); // Clear any previous cache
        currentCache = new HashMap<>();

        long[] emptyShape = new long[]{1L, (long) numHeads, 0L, (long) headDim};
        for (int i = 0; i < numLayers; i++) {
            FloatBuffer emptyBuf1 = FloatBuffer.allocate(0);
            FloatBuffer emptyBuf2 = FloatBuffer.allocate(0);
            FloatBuffer emptyBuf3 = FloatBuffer.allocate(0);
            FloatBuffer emptyBuf4 = FloatBuffer.allocate(0);

            currentCache.put("past_key_values." + i + ".decoder.key",
                    OnnxTensor.createTensor(ortEnv, emptyBuf1, emptyShape));
            currentCache.put("past_key_values." + i + ".decoder.value",
                    OnnxTensor.createTensor(ortEnv, emptyBuf2, emptyShape));
            currentCache.put("past_key_values." + i + ".encoder.key",
                    OnnxTensor.createTensor(ortEnv, emptyBuf3, emptyShape));
            currentCache.put("past_key_values." + i + ".encoder.value",
                    OnnxTensor.createTensor(ortEnv, emptyBuf4, emptyShape));
        }

        return currentCache;
    }

    /**
     * Updates KV-cache for the next step: extracts 'present' outputs,
     * retains static encoder cross-attention, and frees superseded tensors.
     */
    public Map<String, OnnxTensor> updateCacheFromResults(OrtSession.Result result, boolean isFirstStep) throws OrtException {
        Map<String, OnnxTensor> newCache = new HashMap<>();

        for (int i = 0; i < numLayers; i++) {
            // Self-attention cache updates on every step
            OnnxTensor presDecKey = (OnnxTensor) result.get("present." + i + ".decoder.key").orElse(null);
            OnnxTensor presDecVal = (OnnxTensor) result.get("present." + i + ".decoder.value").orElse(null);

            if (presDecKey != null && presDecVal != null) {
                newCache.put("past_key_values." + i + ".decoder.key", presDecKey);
                newCache.put("past_key_values." + i + ".decoder.value", presDecVal);
            }

            // Cross-attention cache remains constant after step 0
            if (isFirstStep) {
                OnnxTensor presEncKey = (OnnxTensor) result.get("present." + i + ".encoder.key").orElse(null);
                OnnxTensor presEncVal = (OnnxTensor) result.get("present." + i + ".encoder.value").orElse(null);
                if (presEncKey != null && presEncVal != null) {
                    newCache.put("past_key_values." + i + ".encoder.key", presEncKey);
                    newCache.put("past_key_values." + i + ".encoder.value", presEncVal);
                }
            } else {
                newCache.put("past_key_values." + i + ".encoder.key", currentCache.get("past_key_values." + i + ".encoder.key"));
                newCache.put("past_key_values." + i + ".encoder.value", currentCache.get("past_key_values." + i + ".encoder.value"));
            }
        }

        // Close superseded self-attention decoder tensors to prevent C++ native memory leaks
        if (!isFirstStep) {
            for (int i = 0; i < numLayers; i++) {
                safeCloseTensor(currentCache.get("past_key_values." + i + ".decoder.key"));
                safeCloseTensor(currentCache.get("past_key_values." + i + ".decoder.value"));
            }
        } else {
            // Close initial dummy tensors from step 0
            for (int i = 0; i < numLayers; i++) {
                safeCloseTensor(currentCache.get("past_key_values." + i + ".decoder.key"));
                safeCloseTensor(currentCache.get("past_key_values." + i + ".decoder.value"));
                safeCloseTensor(currentCache.get("past_key_values." + i + ".encoder.key"));
                safeCloseTensor(currentCache.get("past_key_values." + i + ".encoder.value"));
            }
        }

        currentCache = newCache;
        return currentCache;
    }

    public Map<String, OnnxTensor> getCurrentCache() {
        return currentCache;
    }

    private void safeCloseTensor(OnnxTensor tensor) {
        if (tensor != null) {
            try {
                tensor.close();
            } catch (Exception ignored) {}
        }
    }

    @Override
    public void close() {
        if (currentCache != null) {
            for (OnnxTensor tensor : currentCache.values()) {
                safeCloseTensor(tensor);
            }
            currentCache.clear();
        }
    }
}
