package com.lexiduo.app.whisper;

import android.content.Context;
import android.util.Log;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

/**
 * Handles Whisper model storage paths, validation, downloading (ONNX merged & GGML),
 * integrity verification, and deletion with zero impact on UI thread.
 */
public class WhisperModelDownloader {
    private static final String TAG = "WhisperModelDownloader";

    public static final Set<String> ALLOWED_TIER_IDS = Collections.unmodifiableSet(
            new HashSet<>(Arrays.asList("tiny", "base", "small", "large-v3-turbo"))
    );

    public interface ProgressListener {
        void onProgress(String tierId, int fileIndex, int totalFiles, int percent, String fileName);
    }

    public static class ModelStatus {
        public final boolean isDownloaded;
        public final long sizeBytes;
        public final String tierId;
        public final boolean hasGgml;
        public final boolean hasMergedDecoder;

        public ModelStatus(boolean isDownloaded, long sizeBytes, String tierId, boolean hasGgml, boolean hasMergedDecoder) {
            this.isDownloaded = isDownloaded;
            this.sizeBytes = sizeBytes;
            this.tierId = tierId;
            this.hasGgml = hasGgml;
            this.hasMergedDecoder = hasMergedDecoder;
        }
    }

    public static File getSafeModelDir(Context ctx, String rawTierId) throws IllegalArgumentException, IOException {
        if (rawTierId == null || rawTierId.trim().isEmpty()) {
            throw new IllegalArgumentException("Model tier cannot be empty");
        }
        String cleanTier = rawTierId.trim();
        if (!cleanTier.matches("^[a-zA-Z0-9_-]{3,20}$") || !ALLOWED_TIER_IDS.contains(cleanTier)) {
            throw new IllegalArgumentException("Disallowed or invalid Whisper model tier: " + cleanTier);
        }
        File baseDir = new File(ctx.getFilesDir(), "whisper_models");
        if (!baseDir.exists() && !baseDir.mkdirs()) {
            Log.w(TAG, "Failed creating whisper_models base directory");
        }
        File modelDir = new File(baseDir, cleanTier);
        if (!modelDir.getCanonicalPath().startsWith(baseDir.getCanonicalPath())) {
            throw new SecurityException("Directory traversal attempt detected in tierId: " + cleanTier);
        }
        return modelDir;
    }

    public static ModelStatus checkModelStatus(Context ctx, String tierId) {
        try {
            File modelDir = getSafeModelDir(ctx, tierId);
            boolean downloaded = false;
            long totalSize = 0;
            boolean hasEncoder = false;
            boolean hasDecoder = false;
            boolean hasMergedDecoder = false;
            boolean hasTokenizer = false;
            boolean hasGgml = false;

            if (modelDir.exists() && modelDir.isDirectory()) {
                File[] files = modelDir.listFiles();
                if (files != null) {
                    for (File f : files) {
                        String name = f.getName().toLowerCase();
                        if (name.startsWith("encoder") && name.endsWith(".onnx") && f.length() > 0) hasEncoder = true;
                        if (name.startsWith("decoder") && name.endsWith(".onnx") && f.length() > 0) {
                            hasDecoder = true;
                            if (name.contains("merged")) hasMergedDecoder = true;
                        }
                        if (name.equals("tokenizer.json") && f.length() > 0) hasTokenizer = true;
                        if ((name.equals("ggml-model.bin") || name.startsWith("ggml-")) && name.endsWith(".bin") && f.length() > 1024 * 1024) {
                            hasGgml = true;
                        }
                        totalSize += f.length();
                    }
                }
                downloaded = hasGgml || (hasEncoder && hasDecoder && hasTokenizer);
            }

            return new ModelStatus(downloaded, totalSize, tierId, hasGgml, hasMergedDecoder);
        } catch (Exception e) {
            Log.e(TAG, "Error checking model status for tier: " + tierId, e);
            return new ModelStatus(false, 0, tierId, false, false);
        }
    }

    public static void downloadOnnxModel(Context ctx, String tierId, ProgressListener listener) throws Exception {
        File modelDir = getSafeModelDir(ctx, tierId);
        if (!modelDir.exists() && !modelDir.mkdirs()) {
            throw new IOException("Failed creating model directory: " + modelDir.getAbsolutePath());
        }

        String repoName = "onnx-community/whisper-" + tierId;
        // Prioritize decoder_model_merged_q4.onnx for KV-cache acceleration
        String[] filesToDownload = new String[]{
                "onnx/encoder_model_q4.onnx",
                "onnx/decoder_model_merged_q4.onnx",
                "tokenizer.json"
        };

        for (int i = 0; i < filesToDownload.length; i++) {
            String relPath = filesToDownload[i];
            String fileName = relPath.substring(relPath.lastIndexOf('/') + 1);
            File destFile = new File(modelDir, fileName);

            if (destFile.exists() && destFile.length() > 1024) {
                continue; // Already downloaded
            }

            String urlStr = "https://huggingface.co/" + repoName + "/resolve/main/" + relPath;
            try {
                downloadFileWithProgress(urlStr, destFile, tierId, i + 1, filesToDownload.length, listener);
            } catch (Exception e) {
                // Fallback for decoder_model_merged_q4 if not present on HF
                if (fileName.contains("merged")) {
                    Log.w(TAG, "Merged decoder not found, falling back to standard decoder_model_q4.onnx");
                    String fallbackPath = "onnx/decoder_model_q4.onnx";
                    File fallbackFile = new File(modelDir, "decoder_model_q4.onnx");
                    String fallbackUrl = "https://huggingface.co/" + repoName + "/resolve/main/" + fallbackPath;
                    downloadFileWithProgress(fallbackUrl, fallbackFile, tierId, i + 1, filesToDownload.length, listener);
                } else {
                    throw e;
                }
            }
        }
    }

    public static void downloadGgmlModel(Context ctx, String tierId, ProgressListener listener) throws Exception {
        File modelDir = getSafeModelDir(ctx, tierId);
        if (!modelDir.exists() && !modelDir.mkdirs()) {
            throw new IOException("Failed creating model directory: " + modelDir.getAbsolutePath());
        }

        String quantType = "large-v3-turbo".equals(tierId) ? "q5_0" : "q5_1";
        String ggmlFileName = "ggml-" + tierId + "-" + quantType + ".bin";
        File destFile = new File(modelDir, "ggml-model.bin");

        if (destFile.exists() && destFile.length() > 1024 * 1024) {
            return; // Already present
        }

        String urlStr = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/" + ggmlFileName;
        downloadFileWithProgress(urlStr, destFile, tierId, 1, 1, listener);
    }

    private static void downloadFileWithProgress(String urlStr, File destFile, String tierId,
                                                int fileIndex, int totalFiles, ProgressListener listener) throws Exception {
        HttpURLConnection conn = null;
        int redirects = 0;
        String currentUrl = urlStr;

        while (redirects < 5) {
            URL url = new URL(currentUrl);
            conn = (HttpURLConnection) url.openConnection();
            conn.setInstanceFollowRedirects(true);
            conn.setConnectTimeout(30000);
            conn.setReadTimeout(60000);

            int responseCode = conn.getResponseCode();
            if (responseCode == HttpURLConnection.HTTP_MOVED_PERM ||
                    responseCode == HttpURLConnection.HTTP_MOVED_TEMP ||
                    responseCode == HttpURLConnection.HTTP_SEE_OTHER ||
                    responseCode == 307 || responseCode == 308) {
                String newUrl = conn.getHeaderField("Location");
                if (newUrl != null && !newUrl.trim().isEmpty()) {
                    conn.disconnect();
                    currentUrl = newUrl.trim();
                    redirects++;
                    continue;
                }
            }
            if (responseCode != HttpURLConnection.HTTP_OK) {
                throw new IOException("HTTP error " + responseCode + " when downloading from " + currentUrl);
            }
            break;
        }

        if (conn == null) {
            throw new IOException("Failed establishing HTTP connection for " + urlStr);
        }

        long fileLength = conn.getContentLengthLong();
        File tempFile = new File(destFile.getAbsolutePath() + ".tmp");
        boolean completed = false;

        try {
            try (InputStream in = new BufferedInputStream(conn.getInputStream());
                 FileOutputStream out = new FileOutputStream(tempFile)) {

                byte[] buffer = new byte[32768];
                long totalRead = 0;
                int bytesRead;
                long lastNotifyTime = 0;

                while ((bytesRead = in.read(buffer)) != -1) {
                    out.write(buffer, 0, bytesRead);
                    totalRead += bytesRead;

                    long now = System.currentTimeMillis();
                    if (now - lastNotifyTime > 300 && listener != null) {
                        lastNotifyTime = now;
                        int filePct = fileLength > 0 ? (int) ((totalRead * 100) / fileLength) : 0;
                        int overallPct = (int) ((((fileIndex - 1) + (filePct / 100.0)) / totalFiles) * 100);
                        listener.onProgress(tierId, fileIndex, totalFiles, Math.min(99, overallPct), destFile.getName());
                    }
                }
            }

            if (tempFile.renameTo(destFile)) {
                Log.i(TAG, "Successfully downloaded " + destFile.getName() + " (" + destFile.length() + " bytes)");
                completed = true;
            } else {
                throw new IOException("Failed renaming temp download file to: " + destFile.getAbsolutePath());
            }
        } finally {
            try {
                conn.disconnect();
            } catch (Exception ignored) {}
            if (!completed && tempFile.exists()) {
                tempFile.delete();
            }
        }
    }

    public static boolean deleteModelDir(Context ctx, String tierId) {
        try {
            File modelDir = getSafeModelDir(ctx, tierId);
            return deleteRecursive(modelDir);
        } catch (Exception e) {
            Log.e(TAG, "Failed deleting model directory for tier: " + tierId, e);
            return false;
        }
    }

    private static boolean deleteRecursive(File fileOrDir) {
        if (fileOrDir.isDirectory()) {
            File[] children = fileOrDir.listFiles();
            if (children != null) {
                for (File child : children) {
                    deleteRecursive(child);
                }
            }
        }
        return fileOrDir.delete();
    }
}
