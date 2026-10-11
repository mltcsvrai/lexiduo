package com.lexiduo.app.audio;

import android.content.Context;
import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.net.Uri;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.UUID;

/**
 * NativeAudioExtractor decodes audio tracks directly from video files (content:// or file://)
 * using Android's hardware/platform MediaExtractor and MediaCodec into 16,000 Hz Mono 16-bit PCM WAV.
 * 
 * Crucially, decoding runs completely on native threads and streams samples straight to disk,
 * maintaining zero memory footprint inside the Android WebView.
 */
public class NativeAudioExtractor {
    private static final String TAG = "NativeAudioExtractor";
    public static final int TARGET_SAMPLE_RATE = 16000;
    public static final int TARGET_CHANNELS = 1;
    private static final long TIMEOUT_US = 10000;

    public interface ProgressCallback {
        void onProgress(int percent);
    }

    public interface CancelCheck {
        boolean isCancelled();
    }

    public static class ExtractionResult {
        public final File wavFile;
        public final long durationMs;
        public final int sampleRate;
        public final int channels;
        public final long totalSamples;

        public ExtractionResult(File wavFile, long durationMs, int sampleRate, int channels, long totalSamples) {
            this.wavFile = wavFile;
            this.durationMs = durationMs;
            this.sampleRate = sampleRate;
            this.channels = channels;
            this.totalSamples = totalSamples;
        }
    }

    /**
     * Extracts and resamples audio from a video Uri into a standard 16kHz mono WAV file in cache.
     */
    public static ExtractionResult extractToWav(
            @NonNull Context context,
            @NonNull Uri videoUri,
            @Nullable ProgressCallback callback
    ) throws IOException {
        return extractToWav(context, videoUri, callback, null);
    }

    public static ExtractionResult extractToWav(
            @NonNull Context context,
            @NonNull Uri videoUri,
            @Nullable ProgressCallback callback,
            @Nullable CancelCheck cancelCheck
    ) throws IOException {
        MediaExtractor extractor = new MediaExtractor();
        MediaCodec decoder = null;
        File outputFile = null;
        FileOutputStream fos = null;
        boolean isCompletedSuccessfully = false;

        try {
            // 1. Initialize data source
            extractor.setDataSource(context, videoUri, null);

            // 2. Locate audio track
            int audioTrackIndex = -1;
            MediaFormat inputFormat = null;
            long trackDurationUs = 0;

            int trackCount = extractor.getTrackCount();
            for (int i = 0; i < trackCount; i++) {
                MediaFormat format = extractor.getTrackFormat(i);
                String mime = format.getString(MediaFormat.KEY_MIME);
                if (mime != null && mime.startsWith("audio/")) {
                    audioTrackIndex = i;
                    inputFormat = format;
                    if (format.containsKey(MediaFormat.KEY_DURATION)) {
                        trackDurationUs = format.getLong(MediaFormat.KEY_DURATION);
                    }
                    break;
                }
            }

            if (audioTrackIndex < 0 || inputFormat == null) {
                throw new IOException("No audio track found in selected media file");
            }

            extractor.selectTrack(audioTrackIndex);
            String mime = inputFormat.getString(MediaFormat.KEY_MIME);
            if (mime == null) {
                throw new IOException("Missing audio track MIME type");
            }

            // 3. Prepare MediaCodec decoder
            decoder = MediaCodec.createDecoderByType(mime);
            decoder.configure(inputFormat, null, null, 0);
            decoder.start();

            // 4. Prepare temporary WAV destination file in filesDir (accessible by WebView via _capacitor_file_)
            File audioDir = new File(context.getFilesDir(), "whisper_audio");
            if (!audioDir.exists() && !audioDir.mkdirs()) {
                Log.w(TAG, "Failed to create directory " + audioDir.getAbsolutePath());
            }

            // Cleanup stale audio files older than 10 minutes to prevent storage buildup
            try {
                File[] oldFiles = audioDir.listFiles();
                if (oldFiles != null) {
                    long now = System.currentTimeMillis();
                    for (File f : oldFiles) {
                        if (now - f.lastModified() > 10 * 60 * 1000) {
                            f.delete();
                        }
                    }
                }
            } catch (Exception ignored) {}

            outputFile = new File(audioDir, "extracted_" + UUID.randomUUID().toString().substring(0, 8) + ".wav");
            fos = new FileOutputStream(outputFile);

            // Write temporary 44-byte WAV header placeholder
            byte[] headerPlaceholder = new byte[44];
            fos.write(headerPlaceholder);

            // Decoding state
            MediaCodec.BufferInfo bufferInfo = new MediaCodec.BufferInfo();
            boolean sawInputEOS = false;
            boolean sawOutputEOS = false;

            int inputSampleRate = inputFormat.containsKey(MediaFormat.KEY_SAMPLE_RATE)
                    ? inputFormat.getInteger(MediaFormat.KEY_SAMPLE_RATE)
                    : 44100;
            int inputChannels = inputFormat.containsKey(MediaFormat.KEY_CHANNEL_COUNT)
                    ? inputFormat.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
                    : 2;

            if (inputSampleRate <= 0) inputSampleRate = 44100;
            if (inputChannels <= 0) inputChannels = 2;

            long totalMonoSamplesWritten = 0;
            double resampleRatio = (double) inputSampleRate / (double) TARGET_SAMPLE_RATE;
            double resamplePhase = 0.0;
            short lastInputSample = 0;

            int lastReportedPercent = -1;

            while (!sawOutputEOS) {
                if (cancelCheck != null && cancelCheck.isCancelled()) {
                    throw new IOException("Audio extraction cancelled by user");
                }

                // Feed input buffers to decoder
                if (!sawInputEOS) {
                    int inputBufferIndex = decoder.dequeueInputBuffer(TIMEOUT_US);
                    if (inputBufferIndex >= 0) {
                        ByteBuffer inputBuffer = decoder.getInputBuffer(inputBufferIndex);
                        if (inputBuffer != null) {
                            int sampleSize = extractor.readSampleData(inputBuffer, 0);
                            if (sampleSize < 0) {
                                decoder.queueInputBuffer(inputBufferIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM);
                                sawInputEOS = true;
                            } else {
                                long presentationTimeUs = extractor.getSampleTime();
                                decoder.queueInputBuffer(inputBufferIndex, 0, sampleSize, presentationTimeUs, 0);
                                extractor.advance();

                                if (trackDurationUs > 0 && callback != null) {
                                    int pct = (int) Math.min(95, (presentationTimeUs * 95) / trackDurationUs);
                                    if (pct > lastReportedPercent && pct % 5 == 0) {
                                        lastReportedPercent = pct;
                                        callback.onProgress(pct);
                                    }
                                }
                            }
                        }
                    }
                }

                // Drain decoded PCM buffers from decoder
                int outputBufferIndex = decoder.dequeueOutputBuffer(bufferInfo, TIMEOUT_US);
                if (outputBufferIndex >= 0) {
                    if ((bufferInfo.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) {
                        sawOutputEOS = true;
                    }

                    ByteBuffer outputBuffer = decoder.getOutputBuffer(outputBufferIndex);
                    if (outputBuffer != null && bufferInfo.size > 0) {
                        outputBuffer.position(bufferInfo.offset);
                        outputBuffer.limit(bufferInfo.offset + bufferInfo.size);
                        outputBuffer.order(ByteOrder.LITTLE_ENDIAN);

                        // Process 16-bit PCM samples
                        int shortCount = bufferInfo.size / 2;
                        short[] rawShorts = new short[shortCount];
                        outputBuffer.asShortBuffer().get(rawShorts);

                        // 1. Downmix multi-channel to mono
                        int monoFrameCount = shortCount / Math.max(1, inputChannels);
                        short[] monoSamples = new short[monoFrameCount];
                        for (int frame = 0; frame < monoFrameCount; frame++) {
                            int sum = 0;
                            int frameOffset = frame * inputChannels;
                            for (int ch = 0; ch < inputChannels; ch++) {
                                sum += rawShorts[frameOffset + ch];
                            }
                            monoSamples[frame] = (short) (sum / inputChannels);
                        }

                        // 2. Resample mono to 16,000 Hz if needed
                        if (inputSampleRate == TARGET_SAMPLE_RATE) {
                            byte[] pcmBytes = shortArrayToByteArray(monoSamples);
                            fos.write(pcmBytes);
                            totalMonoSamplesWritten += monoSamples.length;
                        } else {
                            // High-speed linear interpolation streaming resampler
                            int outEstimated = (int) Math.ceil(monoFrameCount / Math.max(0.01, resampleRatio)) + 16;
                            short[] resampled = new short[outEstimated];
                            int outCount = 0;

                            double pos = resamplePhase;
                            while (pos < monoFrameCount) {
                                int idx0 = (int) Math.floor(pos);
                                int idx1 = idx0 + 1;
                                double frac = pos - idx0;

                                short s0 = (idx0 >= 0) ? monoSamples[idx0] : lastInputSample;
                                short s1 = (idx1 < monoFrameCount) ? monoSamples[idx1] : s0;

                                short interp = (short) Math.round(s0 + frac * (s1 - s0));
                                if (outCount >= resampled.length) {
                                    resampled = java.util.Arrays.copyOf(resampled, resampled.length * 2);
                                }
                                resampled[outCount++] = interp;
                                pos += resampleRatio;
                            }

                            resamplePhase = pos - monoFrameCount;
                            if (monoFrameCount > 0) {
                                lastInputSample = monoSamples[monoFrameCount - 1];
                            }

                            if (outCount > 0) {
                                byte[] pcmBytes = shortArrayToByteArray(resampled, outCount);
                                fos.write(pcmBytes);
                                totalMonoSamplesWritten += outCount;
                            }
                        }
                    }

                    decoder.releaseOutputBuffer(outputBufferIndex, false);
                } else if (outputBufferIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                    MediaFormat newFormat = decoder.getOutputFormat();
                    if (newFormat.containsKey(MediaFormat.KEY_SAMPLE_RATE)) {
                        inputSampleRate = newFormat.getInteger(MediaFormat.KEY_SAMPLE_RATE);
                    }
                    if (newFormat.containsKey(MediaFormat.KEY_CHANNEL_COUNT)) {
                        inputChannels = newFormat.getInteger(MediaFormat.KEY_CHANNEL_COUNT);
                    }
                    if (inputSampleRate <= 0) inputSampleRate = 44100;
                    if (inputChannels <= 0) inputChannels = 2;
                    resampleRatio = (double) inputSampleRate / (double) TARGET_SAMPLE_RATE;
                    Log.i(TAG, "Audio decoder output format changed: " + inputSampleRate + " Hz, " + inputChannels + " ch");
                }
            }

            fos.flush();
            fos.close();
            fos = null;

            // 5. Write true WAV RIFF Header
            long pcmDataLength = totalMonoSamplesWritten * 2;
            writeWavHeader(outputFile, pcmDataLength, TARGET_SAMPLE_RATE, TARGET_CHANNELS);

            if (callback != null) {
                callback.onProgress(100);
            }

            isCompletedSuccessfully = true;
            long calculatedDurationMs = (totalMonoSamplesWritten * 1000L) / TARGET_SAMPLE_RATE;
            return new ExtractionResult(
                    outputFile,
                    calculatedDurationMs,
                    TARGET_SAMPLE_RATE,
                    TARGET_CHANNELS,
                    totalMonoSamplesWritten
            );

        } finally {
            if (fos != null) {
                try {
                    fos.close();
                } catch (Exception ignored) {}
            }
            if (decoder != null) {
                try {
                    decoder.stop();
                    decoder.release();
                } catch (Exception ignored) {}
            }
            try {
                extractor.release();
            } catch (Exception ignored) {}

            if (!isCompletedSuccessfully && outputFile != null && outputFile.exists()) {
                try {
                    outputFile.delete();
                } catch (Exception ignored) {}
            }
        }
    }

    private static byte[] shortArrayToByteArray(short[] shorts) {
        return shortArrayToByteArray(shorts, shorts.length);
    }

    private static byte[] shortArrayToByteArray(short[] shorts, int count) {
        byte[] bytes = new byte[count * 2];
        for (int i = 0; i < count; i++) {
            short s = shorts[i];
            bytes[i * 2] = (byte) (s & 0xff);
            bytes[i * 2 + 1] = (byte) ((s >> 8) & 0xff);
        }
        return bytes;
    }

    /**
     * Rewrites standard 44-byte WAV header at byte 0 of target file.
     */
    private static void writeWavHeader(File wavFile, long pcmDataLength, int sampleRate, int channels) throws IOException {
        long totalDataLen = pcmDataLength + 36;
        long byteRate = (long) sampleRate * channels * 2;

        try (RandomAccessFile raf = new RandomAccessFile(wavFile, "rw")) {
            raf.seek(0);
            byte[] header = new byte[44];

            // RIFF chunk
            header[0] = 'R'; header[1] = 'I'; header[2] = 'F'; header[3] = 'F';
            header[4] = (byte) (totalDataLen & 0xff);
            header[5] = (byte) ((totalDataLen >> 8) & 0xff);
            header[6] = (byte) ((totalDataLen >> 16) & 0xff);
            header[7] = (byte) ((totalDataLen >> 24) & 0xff);
            header[8] = 'W'; header[9] = 'A'; header[10] = 'V'; header[11] = 'E';

            // fmt sub-chunk
            header[12] = 'f'; header[13] = 'm'; header[14] = 't'; header[15] = ' ';
            header[16] = 16; header[17] = 0; header[18] = 0; header[19] = 0; // SubChunk1Size (16 for PCM)
            header[20] = 1; header[21] = 0; // AudioFormat (1 = PCM)
            header[22] = (byte) channels; header[23] = 0;
            header[24] = (byte) (sampleRate & 0xff);
            header[25] = (byte) ((sampleRate >> 8) & 0xff);
            header[26] = (byte) ((sampleRate >> 16) & 0xff);
            header[27] = (byte) ((sampleRate >> 24) & 0xff);
            header[28] = (byte) (byteRate & 0xff);
            header[29] = (byte) ((byteRate >> 8) & 0xff);
            header[30] = (byte) ((byteRate >> 16) & 0xff);
            header[31] = (byte) ((byteRate >> 24) & 0xff);
            header[32] = (byte) (channels * 2); header[33] = 0; // BlockAlign
            header[34] = 16; header[35] = 0; // BitsPerSample (16 bits)

            // data sub-chunk
            header[36] = 'd'; header[37] = 'a'; header[38] = 't'; header[39] = 'a';
            header[40] = (byte) (pcmDataLength & 0xff);
            header[41] = (byte) ((pcmDataLength >> 8) & 0xff);
            header[42] = (byte) ((pcmDataLength >> 16) & 0xff);
            header[43] = (byte) ((pcmDataLength >> 24) & 0xff);

            raf.write(header);
        }
    }
}
