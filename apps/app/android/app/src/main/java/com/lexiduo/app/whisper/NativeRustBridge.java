package com.lexiduo.app.whisper;

import android.util.Log;

/**
 * NativeRustBridge provides high-performance JNI bindings to liblexiduo_rust.so,
 * executing 64-bit ARM NEON accelerated audio DSP, Real-FFT Log-Mel spectrogram extraction,
 * and BPE token decoding.
 * 
 * Backward compatibility:
 * If the native library cannot be loaded (such as in host JVM JUnit test environments),
 * sIsLoaded remains false and calling modules transparently fall back to pure Java implementations.
 */
public final class NativeRustBridge {
    private static final String TAG = "NativeRustBridge";
    private static final boolean sIsLoaded;

    static {
        boolean loaded = false;
        try {
            System.loadLibrary("lexiduo_rust");
            loaded = isAvailable();
            Log.i(TAG, "Successfully loaded liblexiduo_rust.so (64-bit ARM NEON accelerated)");
        } catch (Throwable t) {
            Log.w(TAG, "liblexiduo_rust.so unavailable (falling back to pure Java): " + t.getMessage());
            loaded = false;
        }
        sIsLoaded = loaded;
    }

    private NativeRustBridge() {
        // Utility class, no instantiation
    }

    /**
     * Returns true if liblexiduo_rust.so was successfully loaded and is available for native acceleration.
     */
    public static boolean isLoaded() {
        return sIsLoaded;
    }

    /**
     * Native ping to confirm JNI symbols are linked properly.
     */
    public static native boolean isAvailable();

    /**
     * Computes 80 or 128 channel Log-Mel Spectrogram features for normalized 16kHz audio samples.
     * Returns a flat 1D float array of length nMels * 3000.
     *
     * @param audio float array of normalized audio samples [-1.0, 1.0]
     * @param nMels number of Mel bins (80 or 128)
     * @return flat float array of shape [nMels * 3000]
     */
    public static native float[] extractMelFeaturesFlat(float[] audio, int nMels);

    /**
     * Combined Zero-Copy Fast Path:
     * Reads a WAV chunk from disk, performs energy-based VAD.
     * If energy < vadThreshold, returns null (or empty) to skip inference entirely.
     * If speech is present, computes RealFFT Log-Mel spectrogram and returns flat 1D float array of length nMels * 3000.
     *
     * @param wavPath absolute path to the 16kHz mono WAV file
     * @param startSample starting sample offset
     * @param numSamples number of samples to process (e.g. 25 seconds = 400,000 samples)
     * @param nMels number of Mel bins (80 or 128)
     * @param vadThreshold mean squared energy threshold (typically 0.00015f)
     * @return flat float array [nMels * 3000] or null if chunk is silent
     */
    public static native float[] extractMelFromWavChunk(String wavPath, int startSample, int numSamples, int nMels, float vadThreshold);

    /**
     * Downmixes multi-channel PCM to mono and linearly resamples to targetSampleRate (typically 16000 Hz).
     *
     * @param inputPcm raw 16-bit PCM samples
     * @param inputChannels channel count (1, 2, etc.)
     * @param inputSampleRate source sample rate in Hz
     * @param targetSampleRate destination sample rate in Hz (16000)
     * @param resampleState double array of length >= 2 holding [resamplePhase, lastInputSample] which will be updated in-place
     * @return little-endian 16-bit PCM bytes ready to stream directly to FileOutputStream
     */
    public static native byte[] downmixAndResamplePcm(short[] inputPcm, int inputChannels, int inputSampleRate, int targetSampleRate, double[] resampleState);

    /**
     * Loads tokenizer vocabulary from tokenizer.json content into the native Rust tokenizer cache.
     *
     * @param jsonContent raw text content of tokenizer.json
     * @return true if successfully parsed and cached
     */
    public static native boolean loadTokenizerJson(String jsonContent);

    /**
     * Decodes an array of token IDs into human-readable text in native Rust,
     * filtering control tokens and converting BPE characters.
     *
     * @param tokenIds array of generated token IDs
     * @return decoded String
     */
    public static native String decodeTokens(long[] tokenIds);
}
