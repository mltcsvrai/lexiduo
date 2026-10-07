package com.ytceviri.app.whisper;

import java.util.Arrays;

/**
 * WhisperFeatureExtractor converts 16kHz mono audio samples into 80-channel
 * (or 128-channel) Log-Mel Spectrogram features matching OpenAI Whisper
 * and Hugging Face Transformers.js specifications.
 */
public class WhisperFeatureExtractor {
    public static final int SAMPLE_RATE = 16000;
    public static final int N_FFT = 400; // 25ms frame
    public static final int HOP_LENGTH = 160; // 10ms step
    public static final int NUM_FREQS = N_FFT / 2 + 1; // 201 frequency bins
    public static final int TARGET_FRAMES = 3000; // 30 seconds of audio
    public static final int TARGET_SAMPLES = TARGET_FRAMES * HOP_LENGTH; // 480,000 samples

    private final float[] hannWindow = new float[N_FFT];
    private final float[][] cosTable = new float[NUM_FREQS][N_FFT];
    private final float[][] sinTable = new float[NUM_FREQS][N_FFT];

    private static volatile float[][] sMelFilters80 = null;
    private static volatile float[][] sMelFilters128 = null;

    public WhisperFeatureExtractor() {
        // Pre-compute Hann window: 0.5 * (1 - cos(2 * PI * n / N_FFT))
        for (int n = 0; n < N_FFT; n++) {
            hannWindow[n] = (float) (0.5 * (1.0 - Math.cos((2.0 * Math.PI * n) / N_FFT)));
        }

        // Pre-compute DFT cosine and sine lookup tables for 201 frequency bins
        for (int k = 0; k < NUM_FREQS; k++) {
            double angleStep = (-2.0 * Math.PI * k) / N_FFT;
            for (int n = 0; n < N_FFT; n++) {
                double angle = angleStep * n;
                cosTable[k][n] = (float) Math.cos(angle);
                sinTable[k][n] = (float) Math.sin(angle);
            }
        }
    }

    /**
     * Extracts normalized Log-Mel Spectrogram features with shape [1][nMels][3000].
     *
     * @param audio Normalized float audio samples [-1.0f, 1.0f]
     * @param nMels 80 (tiny/base/small) or 128 (large-v3-turbo)
     * @return 3D float array with shape [1][nMels][3000] ready for ONNX tensor creation
     */
    public float[][][] extractFeatures(float[] audio, int nMels) {
        float[][] melFilters = getMelFilters(nMels);

        // 1. Pad or truncate audio to exactly TARGET_SAMPLES (480,000)
        float[] padded = new float[TARGET_SAMPLES];
        if (audio != null && audio.length > 0) {
            int copyLen = Math.min(audio.length, TARGET_SAMPLES);
            System.arraycopy(audio, 0, padded, 0, copyLen);
        }

        // 2. Compute Power Spectrogram across 3000 frames: [201][3000]
        float[][] powerSpec = new float[NUM_FREQS][TARGET_FRAMES];
        float[] frameBuffer = new float[N_FFT];

        for (int frame = 0; frame < TARGET_FRAMES; frame++) {
            int offset = frame * HOP_LENGTH;
            int samplesAvailable = Math.min(N_FFT, TARGET_SAMPLES - offset);

            for (int n = 0; n < samplesAvailable; n++) {
                frameBuffer[n] = padded[offset + n] * hannWindow[n];
            }
            if (samplesAvailable < N_FFT) {
                Arrays.fill(frameBuffer, samplesAvailable, N_FFT, 0.0f);
            }

            for (int k = 0; k < NUM_FREQS; k++) {
                float real = 0.0f;
                float imag = 0.0f;
                float[] cosRow = cosTable[k];
                float[] sinRow = sinTable[k];

                for (int n = 0; n < N_FFT; n++) {
                    float s = frameBuffer[n];
                    real += s * cosRow[n];
                    imag += s * sinRow[n];
                }

                powerSpec[k][frame] = real * real + imag * imag;
            }
        }

        // 3. Apply Mel Filterbank: melSpec[m][frame] = sum_k(melFilters[m][k] * powerSpec[k][frame])
        float[][] melSpec = new float[nMels][TARGET_FRAMES];
        for (int m = 0; m < nMels; m++) {
            float[] filterRow = melFilters[m];
            for (int frame = 0; frame < TARGET_FRAMES; frame++) {
                float sum = 0.0f;
                for (int k = 0; k < NUM_FREQS; k++) {
                    sum += filterRow[k] * powerSpec[k][frame];
                }
                melSpec[m][frame] = sum;
            }
        }

        // 4. Log10 and Dynamic Range Normalization
        float maxVal = -Float.MAX_VALUE;
        for (int m = 0; m < nMels; m++) {
            for (int frame = 0; frame < TARGET_FRAMES; frame++) {
                float val = (float) Math.log10(Math.max(melSpec[m][frame], 1e-5f));
                melSpec[m][frame] = val;
                if (val > maxVal) {
                    maxVal = val;
                }
            }
        }

        float clampMin = maxVal - 8.0f;
        float[][][] result = new float[1][nMels][TARGET_FRAMES];
        for (int m = 0; m < nMels; m++) {
            for (int frame = 0; frame < TARGET_FRAMES; frame++) {
                float val = Math.max(melSpec[m][frame], clampMin);
                result[0][m][frame] = (val + 4.0f) / 4.0f;
            }
        }

        return result;
    }

    /**
     * Lazily computes and caches Slaney Mel filterbank weights.
     */
    public static synchronized float[][] getMelFilters(int nMels) {
        if (nMels == 128) {
            if (sMelFilters128 == null) {
                sMelFilters128 = computeSlaneyMelFilters(128);
            }
            return sMelFilters128;
        } else {
            if (sMelFilters80 == null) {
                sMelFilters80 = computeSlaneyMelFilters(80);
            }
            return sMelFilters80;
        }
    }

    private static float[][] computeSlaneyMelFilters(int nMels) {
        float[][] weights = new float[nMels][NUM_FREQS];
        double minMel = hzToMelSlaney(0.0);
        double maxMel = hzToMelSlaney(SAMPLE_RATE / 2.0);

        double[] melPoints = new double[nMels + 2];
        for (int i = 0; i < nMels + 2; i++) {
            melPoints[i] = minMel + (maxMel - minMel) * i / (nMels + 1);
        }

        double[] hzPoints = new double[nMels + 2];
        for (int i = 0; i < nMels + 2; i++) {
            hzPoints[i] = melToHzSlaney(melPoints[i]);
        }

        double[] fftFreqs = new double[NUM_FREQS];
        for (int k = 0; k < NUM_FREQS; k++) {
            fftFreqs[k] = (SAMPLE_RATE / 2.0) * k / (NUM_FREQS - 1);
        }

        for (int m = 0; m < nMels; m++) {
            double leftHz = hzPoints[m];
            double centerHz = hzPoints[m + 1];
            double rightHz = hzPoints[m + 2];

            double leftDiff = centerHz - leftHz;
            double rightDiff = rightHz - centerHz;
            double enorm = 2.0 / (rightHz - leftHz);

            for (int k = 0; k < NUM_FREQS; k++) {
                double f = fftFreqs[k];
                if (f >= leftHz && f <= centerHz && leftDiff > 0) {
                    weights[m][k] = (float) (((f - leftHz) / leftDiff) * enorm);
                } else if (f >= centerHz && f <= rightHz && rightDiff > 0) {
                    weights[m][k] = (float) (((rightHz - f) / rightDiff) * enorm);
                } else {
                    weights[m][k] = 0.0f;
                }
            }
        }

        return weights;
    }

    private static double hzToMelSlaney(double hz) {
        double fSp = 200.0 / 3.0;
        double minLogHz = 1000.0;
        double minLogMel = minLogHz / fSp; // 15.0
        double logstep = Math.log(6.4) / 27.0;

        if (hz < minLogHz) {
            return hz / fSp;
        } else {
            return minLogMel + Math.log(hz / minLogHz) / logstep;
        }
    }

    private static double melToHzSlaney(double mel) {
        double fSp = 200.0 / 3.0;
        double minLogMel = 15.0;
        double minLogHz = 1000.0;
        double logstep = Math.log(6.4) / 27.0;

        if (mel < minLogMel) {
            return fSp * mel;
        } else {
            return minLogHz * Math.exp(logstep * (mel - minLogMel));
        }
    }
}
