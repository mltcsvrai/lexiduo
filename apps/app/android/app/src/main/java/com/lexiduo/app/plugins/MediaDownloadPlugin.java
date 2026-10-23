package com.lexiduo.app.plugins;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.media.MediaMuxer;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.ByteBuffer;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Capacitor plugin providing Scoped Storage compliant MediaStore file saving
 * and hardware-accelerated MediaMuxer video+audio merging for Lexiduo.
 */
@CapacitorPlugin(name = "MediaDownload")
public class MediaDownloadPlugin extends Plugin {
    private static final String TAG = "MediaDownloadPlugin";
    private static final int BUFFER_SIZE = 64 * 1024; // 64 KB for file copy
    private static final int DEFAULT_MUXER_BUFFER = 1024 * 1024; // 1 MB for muxing samples

    private final ExecutorService executor = Executors.newCachedThreadPool();

    /**
     * Resolves a raw file path or URI into an existing File object.
     * Supports relative cache paths, file:// URIs, and absolute filesystem paths.
     */
    private File resolvePath(String rawPath) {
        if (rawPath == null || rawPath.trim().isEmpty()) {
            return null;
        }
        String cleanPath = rawPath.trim();
        if (cleanPath.startsWith("file://")) {
            try {
                Uri parsedUri = Uri.parse(cleanPath);
                if (parsedUri.getPath() != null) {
                    cleanPath = parsedUri.getPath();
                }
            } catch (Exception e) {
                Log.w(TAG, "Failed parsing file URI: " + cleanPath, e);
            }
        }
        if (cleanPath.startsWith("/_capacitor_file_")) {
            cleanPath = cleanPath.substring("/_capacitor_file_".length());
        }

        File file = new File(cleanPath);
        if (!file.isAbsolute()) {
            File cacheFile = new File(getContext().getCacheDir(), cleanPath);
            if (cacheFile.exists()) {
                return cacheFile;
            }
            File filesDirFile = new File(getContext().getFilesDir(), cleanPath);
            if (filesDirFile.exists()) {
                return filesDirFile;
            }
            return cacheFile;
        }
        return file;
    }

    /**
     * Copies a cached video or audio file into the public Downloads directory
     * via Android MediaStore (Scoped Storage compliant) and triggers media scan.
     */
    @PluginMethod
    public void saveToDownloads(PluginCall call) {
        executor.execute(() -> {
            String path = call.getString("cacheFilePath");
            if (path == null || path.trim().isEmpty()) {
                path = call.getString("filePath");
            }
            if (path == null || path.trim().isEmpty()) {
                call.reject("cacheFilePath or filePath is required");
                return;
            }

            File cacheFile = resolvePath(path);
            if (cacheFile == null || !cacheFile.exists()) {
                call.reject("File not found: " + path);
                return;
            }

            String fileName = call.getString("fileName");
            if (fileName == null || fileName.trim().isEmpty()) {
                fileName = cacheFile.getName();
            }

            String mimeType = call.getString("mimeType");
            if (mimeType == null || mimeType.trim().isEmpty()) {
                mimeType = "video/mp4";
            }

            String subfolder = call.getString("subfolder", "Lexiduo");
            if (subfolder == null || subfolder.trim().isEmpty()) {
                subfolder = "Lexiduo";
            }

            ContentResolver resolver = getContext().getContentResolver();
            ContentValues values = new ContentValues();
            values.put(MediaStore.Downloads.DISPLAY_NAME, fileName);
            values.put(MediaStore.Downloads.MIME_TYPE, mimeType);
            values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/" + subfolder);
            values.put(MediaStore.Downloads.IS_PENDING, 1);

            Uri uri = null;
            try {
                uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (uri == null) {
                    call.reject("Failed to create MediaStore entry for: " + fileName);
                    return;
                }

                try (OutputStream out = resolver.openOutputStream(uri);
                     InputStream in = new FileInputStream(cacheFile)) {
                    if (out == null) {
                        throw new IOException("Failed to open output stream for URI: " + uri);
                    }
                    byte[] buffer = new byte[BUFFER_SIZE];
                    int bytesRead;
                    while ((bytesRead = in.read(buffer)) != -1) {
                        out.write(buffer, 0, bytesRead);
                    }
                    out.flush();
                }

                // Mark file as complete in MediaStore
                values.clear();
                values.put(MediaStore.Downloads.IS_PENDING, 0);
                resolver.update(uri, values, null, null);

                // Immediate MediaScanner index
                try {
                    String publicPath = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
                            + "/" + subfolder + "/" + fileName;
                    MediaScannerConnection.scanFile(getContext(), new String[]{publicPath}, new String[]{mimeType}, null);
                } catch (Exception e) {
                    Log.w(TAG, "MediaScanner scan warning: " + e.getMessage());
                }

                // Delete temporary cache file
                if (cacheFile.exists()) {
                    boolean deleted = cacheFile.delete();
                    if (!deleted) {
                        Log.w(TAG, "Could not delete temporary cache file: " + cacheFile.getAbsolutePath());
                    }
                }

                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("uri", uri.toString());
                ret.put("path", "Download/" + subfolder + "/" + fileName);
                call.resolve(ret);

            } catch (Exception e) {
                Log.e(TAG, "saveToDownloads error: " + e.getMessage(), e);
                if (uri != null) {
                    try {
                        resolver.delete(uri, null, null);
                    } catch (Exception ignored) {
                    }
                }
                call.reject(e.getMessage());
            }
        });
    }

    /**
     * Muxes separate video and audio streams into a single MP4 container using
     * Android hardware-accelerated MediaExtractor and MediaMuxer.
     */
    @PluginMethod
    public void muxVideoAndAudio(PluginCall call) {
        executor.execute(() -> {
            String videoPath = call.getString("videoPath");
            String audioPath = call.getString("audioPath");

            if (videoPath == null || videoPath.trim().isEmpty()) {
                call.reject("videoPath is required");
                return;
            }
            if (audioPath == null || audioPath.trim().isEmpty()) {
                call.reject("audioPath is required");
                return;
            }

            File videoFile = resolvePath(videoPath);
            if (videoFile == null || !videoFile.exists()) {
                call.reject("Video file not found: " + videoPath);
                return;
            }

            File audioFile = resolvePath(audioPath);
            if (audioFile == null || !audioFile.exists()) {
                call.reject("Audio file not found: " + audioPath);
                return;
            }

            String outputPath = call.getString("outputPath");
            if (outputPath == null || outputPath.trim().isEmpty()) {
                String outputFileName = call.getString("outputFileName");
                if (outputFileName != null && !outputFileName.trim().isEmpty()) {
                    outputPath = new File(getContext().getCacheDir(), outputFileName.trim()).getAbsolutePath();
                } else {
                    outputPath = new File(getContext().getCacheDir(), "muxed_" + System.currentTimeMillis() + ".mp4").getAbsolutePath();
                }
            }

            File outputFile;
            if (outputPath.contains(File.separator) || outputPath.startsWith("/")) {
                outputFile = new File(outputPath);
            } else {
                outputFile = new File(getContext().getCacheDir(), outputPath);
            }

            if (outputFile.getParentFile() != null && !outputFile.getParentFile().exists()) {
                outputFile.getParentFile().mkdirs();
            }

            MediaExtractor videoExtractor = null;
            MediaExtractor audioExtractor = null;
            MediaMuxer muxer = null;
            boolean muxerStarted = false;

            try {
                videoExtractor = new MediaExtractor();
                videoExtractor.setDataSource(videoFile.getAbsolutePath());

                audioExtractor = new MediaExtractor();
                audioExtractor.setDataSource(audioFile.getAbsolutePath());

                muxer = new MediaMuxer(outputFile.getAbsolutePath(), MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);

                // Find and add video track
                int videoTrackIndex = -1;
                int muxerVideoTrackIndex = -1;
                int videoMaxInputSize = -1;

                for (int i = 0; i < videoExtractor.getTrackCount(); i++) {
                    MediaFormat format = videoExtractor.getTrackFormat(i);
                    String mime = format.getString(MediaFormat.KEY_MIME);
                    if (mime != null && mime.startsWith("video/")) {
                        videoTrackIndex = i;
                        muxerVideoTrackIndex = muxer.addTrack(format);
                        if (format.containsKey(MediaFormat.KEY_MAX_INPUT_SIZE)) {
                            videoMaxInputSize = format.getInteger(MediaFormat.KEY_MAX_INPUT_SIZE);
                        }
                        break;
                    }
                }

                if (videoTrackIndex == -1) {
                    call.reject("No video track found in " + videoFile.getName());
                    return;
                }

                // Find and add audio track
                int audioTrackIndex = -1;
                int muxerAudioTrackIndex = -1;
                int audioMaxInputSize = -1;

                for (int i = 0; i < audioExtractor.getTrackCount(); i++) {
                    MediaFormat format = audioExtractor.getTrackFormat(i);
                    String mime = format.getString(MediaFormat.KEY_MIME);
                    if (mime != null && mime.startsWith("audio/")) {
                        audioTrackIndex = i;
                        muxerAudioTrackIndex = muxer.addTrack(format);
                        if (format.containsKey(MediaFormat.KEY_MAX_INPUT_SIZE)) {
                            audioMaxInputSize = format.getInteger(MediaFormat.KEY_MAX_INPUT_SIZE);
                        }
                        break;
                    }
                }

                if (audioTrackIndex == -1) {
                    call.reject("No audio track found in " + audioFile.getName());
                    return;
                }

                videoExtractor.selectTrack(videoTrackIndex);
                audioExtractor.selectTrack(audioTrackIndex);

                muxer.start();
                muxerStarted = true;

                int maxBufferSize = Math.max(DEFAULT_MUXER_BUFFER, Math.max(videoMaxInputSize, audioMaxInputSize));
                ByteBuffer buffer = ByteBuffer.allocate(maxBufferSize);
                MediaCodec.BufferInfo bufferInfo = new MediaCodec.BufferInfo();

                // Interleaved sample writing by presentation timestamp for optimal MP4 streaming
                boolean videoDone = false;
                boolean audioDone = false;

                while (!videoDone || !audioDone) {
                    long videoTime = videoDone ? Long.MAX_VALUE : videoExtractor.getSampleTime();
                    long audioTime = audioDone ? Long.MAX_VALUE : audioExtractor.getSampleTime();

                    if (videoTime < 0) {
                        videoDone = true;
                        videoTime = Long.MAX_VALUE;
                    }
                    if (audioTime < 0) {
                        audioDone = true;
                        audioTime = Long.MAX_VALUE;
                    }

                    if (videoDone && audioDone) {
                        break;
                    }

                    if (!videoDone && (audioDone || videoTime <= audioTime)) {
                        buffer.clear();
                        int sampleSize = videoExtractor.readSampleData(buffer, 0);
                        if (sampleSize < 0) {
                            videoDone = true;
                        } else {
                            bufferInfo.offset = 0;
                            bufferInfo.size = sampleSize;
                            bufferInfo.presentationTimeUs = videoTime;
                            bufferInfo.flags = videoExtractor.getSampleFlags();
                            muxer.writeSampleData(muxerVideoTrackIndex, buffer, bufferInfo);
                            videoExtractor.advance();
                        }
                    } else if (!audioDone) {
                        buffer.clear();
                        int sampleSize = audioExtractor.readSampleData(buffer, 0);
                        if (sampleSize < 0) {
                            audioDone = true;
                        } else {
                            bufferInfo.offset = 0;
                            bufferInfo.size = sampleSize;
                            bufferInfo.presentationTimeUs = audioTime;
                            bufferInfo.flags = audioExtractor.getSampleFlags();
                            muxer.writeSampleData(muxerAudioTrackIndex, buffer, bufferInfo);
                            audioExtractor.advance();
                        }
                    }
                }

                muxer.stop();
                muxerStarted = false;

                // Clean up input cache files
                if (videoFile.exists()) {
                    videoFile.delete();
                }
                if (audioFile.exists() && !audioFile.getAbsolutePath().equals(videoFile.getAbsolutePath())) {
                    audioFile.delete();
                }

                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("outputPath", outputFile.getAbsolutePath());
                call.resolve(ret);

            } catch (Exception e) {
                Log.e(TAG, "muxVideoAndAudio error: " + e.getMessage(), e);
                if (outputFile.exists()) {
                    outputFile.delete();
                }
                call.reject(e.getMessage());
            } finally {
                if (muxer != null) {
                    try {
                        if (muxerStarted) {
                            muxer.stop();
                        }
                    } catch (Exception ignored) {
                    }
                    try {
                        muxer.release();
                    } catch (Exception ignored) {
                    }
                }
                if (videoExtractor != null) {
                    try {
                        videoExtractor.release();
                    } catch (Exception ignored) {
                    }
                }
                if (audioExtractor != null) {
                    try {
                        audioExtractor.release();
                    } catch (Exception ignored) {
                    }
                }
            }
        });
    }

    /**
     * Downloads an HTTP media stream at full network line-rate (~10-20 MB/s)
     * by bypassing YouTube Google Video Server playback throttling via 5 MB range chunks.
     */
    @PluginMethod
    public void fastDownload(PluginCall call) {
        executor.execute(() -> {
            String urlString = call.getString("url");
            String outputFileName = call.getString("outputFileName");
            if (urlString == null || urlString.trim().isEmpty() || outputFileName == null || outputFileName.trim().isEmpty()) {
                call.reject("url and outputFileName are required");
                return;
            }

            File outputFile = new File(getContext().getCacheDir(), outputFileName);
            if (outputFile.exists()) {
                outputFile.delete();
            }

            try {
                // 1. Probe total content length using HEAD or clen parameter
                long totalBytes = -1;
                try {
                    HttpURLConnection headConn = (HttpURLConnection) new URL(urlString).openConnection();
                    headConn.setRequestMethod("HEAD");
                    headConn.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 14)");
                    headConn.setConnectTimeout(8000);
                    headConn.setReadTimeout(8000);
                    totalBytes = headConn.getContentLengthLong();
                    headConn.disconnect();
                } catch (Exception headErr) {
                    Log.w(TAG, "HEAD probe failed, will attempt fallback range check", headErr);
                }

                if (totalBytes <= 0) {
                    try {
                        Uri parsed = Uri.parse(urlString);
                        String clen = parsed.getQueryParameter("clen");
                        if (clen != null && !clen.isEmpty()) {
                            totalBytes = Long.parseLong(clen);
                        }
                    } catch (Exception ignored) {}
                }

                byte[] buffer = new byte[BUFFER_SIZE];

                // If totalBytes is unknown or small (<= 2MB), download in standard single stream
                if (totalBytes <= 2 * 1024 * 1024) {
                    HttpURLConnection conn = (HttpURLConnection) new URL(urlString).openConnection();
                    conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 14)");
                    conn.setConnectTimeout(10000);
                    conn.setReadTimeout(15000);
                    try (InputStream in = conn.getInputStream(); FileOutputStream fos = new FileOutputStream(outputFile)) {
                        int read;
                        while ((read = in.read(buffer)) != -1) {
                            fos.write(buffer, 0, read);
                        }
                    } finally {
                        conn.disconnect();
                    }
                } else {
                    // Fast chunked Range download: 5 MB chunks to break YouTube GVS 200 KB/s playback throttle
                    long chunkSize = 5 * 1024 * 1024; // 5 MB
                    long downloaded = 0;
                    try (FileOutputStream fos = new FileOutputStream(outputFile)) {
                        while (downloaded < totalBytes) {
                            long end = Math.min(downloaded + chunkSize - 1, totalBytes - 1);
                            String chunkUrl = urlString + (urlString.contains("?") ? "&" : "?") + "range=" + downloaded + "-" + end;
                            HttpURLConnection chunkConn = (HttpURLConnection) new URL(chunkUrl).openConnection();
                            chunkConn.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 14)");
                            chunkConn.setConnectTimeout(10000);
                            chunkConn.setReadTimeout(20000);

                            try (InputStream in = chunkConn.getInputStream()) {
                                int read;
                                while ((read = in.read(buffer)) != -1) {
                                    fos.write(buffer, 0, read);
                                    downloaded += read;
                                }
                            } finally {
                                chunkConn.disconnect();
                            }
                        }
                    }
                }

                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("path", outputFile.getAbsolutePath());
                ret.put("size", outputFile.length());
                call.resolve(ret);
            } catch (Exception e) {
                Log.e(TAG, "fastDownload failed: " + e.getMessage(), e);
                if (outputFile.exists()) {
                    outputFile.delete();
                }
                call.reject("Fast download failed: " + e.getMessage());
            }
        });
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        executor.shutdown();
    }
}
