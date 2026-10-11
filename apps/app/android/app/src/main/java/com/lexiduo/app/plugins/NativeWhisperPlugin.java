package com.lexiduo.app.plugins;

import android.app.Activity;
import android.app.ActivityManager;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Process;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.util.Log;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.lexiduo.app.audio.NativeAudioExtractor;
import com.lexiduo.app.services.BackgroundTaskService;
import com.lexiduo.app.whisper.NativeWhisperEngine;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Capacitor plugin bridging native Android 64-bit hardware profiling,
 * zero-copy MediaCodec audio extraction, native disk model management,
 * and 64-bit ARM NEON Whisper ONNX execution.
 */
@CapacitorPlugin(name = "NativeWhisper")
public class NativeWhisperPlugin extends Plugin {
    private static final String TAG = "NativeWhisperPlugin";
    private static final Set<String> ALLOWED_TIER_IDS = Collections.unmodifiableSet(
            new HashSet<>(Arrays.asList("tiny", "base", "small", "large-v3-turbo"))
    );

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final AtomicBoolean isExtractionCancelled = new AtomicBoolean(false);
    private NativeWhisperEngine whisperEngine;

    @Override
    public void load() {
        super.load();
        whisperEngine = new NativeWhisperEngine(getContext());
        BackgroundTaskService.setTerminationListener(this::cancelTranscriptionInternal);
    }

    private void cancelTranscriptionInternal() {
        isExtractionCancelled.set(true);
        if (whisperEngine != null) {
            whisperEngine.cancel();
            whisperEngine.close();
        }
    }

    /**
     * Inspects device RAM, CPU cores, 64-bit architecture, and determines adaptive hardware tier.
     */
    @PluginMethod
    public void getDeviceProfile(PluginCall call) {
        try {
            Context ctx = getContext();
            ActivityManager actManager = (ActivityManager) ctx.getSystemService(Context.ACTIVITY_SERVICE);
            ActivityManager.MemoryInfo memInfo = new ActivityManager.MemoryInfo();
            if (actManager != null) {
                actManager.getMemoryInfo(memInfo);
            }

            long totalMemBytes = memInfo.totalMem;
            long availMemBytes = memInfo.availMem;
            long totalMemMb = totalMemBytes / (1024 * 1024);
            long availMemMb = availMemBytes / (1024 * 1024);

            int cpuCores = Runtime.getRuntime().availableProcessors();
            boolean is64Bit = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && Process.is64Bit();
            String deviceModel = Build.MANUFACTURER + " " + Build.MODEL;

            int tier;
            String tierName;
            String recommendedModel;
            JSArray supportedModels = new JSArray();

            if (totalMemMb >= 11000 && is64Bit) {
                tier = 1;
                tierName = "flagship";
                recommendedModel = "large-v3-turbo";
                supportedModels.put("large-v3-turbo");
                supportedModels.put("small");
                supportedModels.put("base");
                supportedModels.put("tiny");
            } else if (totalMemMb >= 7500 && is64Bit) {
                tier = 1;
                tierName = "flagship";
                // On 8GB devices, Large v3 Turbo is supported, but Small is recommended for peak battery & thermal stability
                recommendedModel = "small";
                supportedModels.put("large-v3-turbo");
                supportedModels.put("small");
                supportedModels.put("base");
                supportedModels.put("tiny");
            } else if (totalMemMb >= 3800) {
                tier = 2;
                tierName = "balanced";
                recommendedModel = "small";
                supportedModels.put("small");
                supportedModels.put("base");
                supportedModels.put("tiny");
            } else if (totalMemMb >= 2000) {
                tier = 3;
                tierName = "low_memory";
                recommendedModel = "tiny";
                supportedModels.put("base");
                supportedModels.put("tiny");
            } else {
                tier = 4;
                tierName = "cloud_recommended";
                recommendedModel = "tiny";
                supportedModels.put("tiny");
            }

            JSObject ret = new JSObject();
            ret.put("tier", tier);
            ret.put("tierName", tierName);
            ret.put("totalRamMb", totalMemMb);
            ret.put("availRamMb", availMemMb);
            ret.put("is64Bit", is64Bit);
            ret.put("cpuCores", cpuCores);
            ret.put("deviceModel", deviceModel);
            ret.put("supportedModels", supportedModels);
            ret.put("recommendedModel", recommendedModel);

            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "Error calculating device profile", e);
            call.reject("Failed to retrieve device profile: " + e.getMessage());
        }
    }

    /**
     * Decodes video audio track directly to 16kHz mono WAV on disk via MediaCodec with zero WebView RAM.
     */
    @PluginMethod
    public void extractAudio(PluginCall call) {
        String videoUriStr = call.getString("videoUri");
        if (videoUriStr == null || videoUriStr.trim().isEmpty()) {
            call.reject("Argument 'videoUri' is required");
            return;
        }

        executor.execute(() -> {
            try {
                Context ctx = getContext();
                Uri videoUri;
                if (videoUriStr.startsWith("content://") || videoUriStr.startsWith("file://")) {
                    videoUri = Uri.parse(videoUriStr);
                } else {
                    videoUri = Uri.fromFile(new File(videoUriStr));
                }

                isExtractionCancelled.set(false);
                NativeAudioExtractor.ExtractionResult result = NativeAudioExtractor.extractToWav(
                        ctx,
                        videoUri,
                        percent -> {
                            JSObject progressObj = new JSObject();
                            progressObj.put("percent", percent);
                            notifyListeners("extractionProgress", progressObj);
                        },
                        () -> isExtractionCancelled.get()
                );

                JSObject ret = new JSObject();
                ret.put("wavPath", result.wavFile.getAbsolutePath());
                ret.put("durationMs", result.durationMs);
                ret.put("sampleRate", result.sampleRate);
                ret.put("channels", result.channels);
                ret.put("totalSamples", result.totalSamples);

                call.resolve(ret);
            } catch (Exception e) {
                Log.e(TAG, "Failed extracting audio from video URI", e);
                call.reject("Audio extraction failed: " + e.getMessage());
            }
        });
    }

    /**
     * Saves base64-encoded WAV buffer from WebView directly to internal cache on disk.
     */
    @PluginMethod
    public void saveAudioBuffer(PluginCall call) {
        String base64Data = call.getString("base64");
        if (base64Data == null || base64Data.trim().isEmpty()) {
            call.reject("Parameter 'base64' is required");
            return;
        }

        executor.execute(() -> {
            try {
                Context ctx = getContext();
                File cacheDir = new File(ctx.getCacheDir(), "whisper_audio");
                if (!cacheDir.exists()) {
                    cacheDir.mkdirs();
                }

                File wavFile = new File(cacheDir, "input_" + System.currentTimeMillis() + ".wav");
                byte[] decodedBytes = Base64.decode(base64Data, Base64.DEFAULT);

                try (FileOutputStream fos = new FileOutputStream(wavFile)) {
                    fos.write(decodedBytes);
                }

                JSObject ret = new JSObject();
                ret.put("audioPath", wavFile.getAbsolutePath());
                ret.put("sizeBytes", wavFile.length());
                call.resolve(ret);
            } catch (Exception e) {
                Log.e(TAG, "Error saving audio buffer to disk", e);
                call.reject("Failed saving audio buffer: " + e.getMessage());
            }
        });
    }

    /**
     * Resolves and validates local model directory path against traversal attacks.
     */
    private File getSafeModelDir(String rawTierId) throws IllegalArgumentException, IOException {
        if (rawTierId == null || rawTierId.trim().isEmpty()) {
            throw new IllegalArgumentException("Model tier cannot be empty");
        }
        String cleanTier = rawTierId.trim();
        if (!cleanTier.matches("^[a-zA-Z0-9_-]{3,20}$") || !ALLOWED_TIER_IDS.contains(cleanTier)) {
            throw new IllegalArgumentException("Disallowed or invalid Whisper model tier: " + cleanTier);
        }
        File baseDir = new File(getContext().getFilesDir(), "whisper_models");
        if (!baseDir.exists() && !baseDir.mkdirs()) {
            Log.w(TAG, "Failed creating whisper_models base directory");
        }
        File modelDir = new File(baseDir, cleanTier);
        if (!modelDir.getCanonicalPath().startsWith(baseDir.getCanonicalPath())) {
            throw new SecurityException("Directory traversal attempt detected in tierId: " + cleanTier);
        }
        return modelDir;
    }

    /**
     * Checks whether a Whisper model tier is downloaded and stored on internal disk.
     */
    @PluginMethod
    public void isModelDownloaded(PluginCall call) {
        String tierId = call.getString("tierId", "tiny");
        try {
            File modelDir = getSafeModelDir(tierId);

            boolean downloaded = false;
            long totalSize = 0;

            if (modelDir.exists() && modelDir.isDirectory()) {
                File[] files = modelDir.listFiles();
                boolean hasEncoder = false;
                boolean hasDecoder = false;
                boolean hasTokenizer = false;

                if (files != null) {
                    for (File f : files) {
                        String name = f.getName().toLowerCase();
                        if (name.startsWith("encoder") && name.endsWith(".onnx") && f.length() > 0) hasEncoder = true;
                        if (name.startsWith("decoder") && name.endsWith(".onnx") && !name.contains("merged") && !name.contains("with_past") && f.length() > 0) hasDecoder = true;
                        if (name.equals("tokenizer.json") && f.length() > 0) hasTokenizer = true;
                        totalSize += f.length();
                    }
                }
                downloaded = hasEncoder && hasDecoder && hasTokenizer;
            }

            JSObject ret = new JSObject();
            ret.put("isDownloaded", downloaded);
            ret.put("sizeBytes", totalSize);
            ret.put("tierId", tierId);
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "Error checking model status: " + tierId, e);
            call.reject("Failed checking model status: " + e.getMessage());
        }
    }

    /**
     * Downloads Whisper ONNX model files directly to internal storage from Hugging Face CDN.
     */
    @PluginMethod
    public void downloadModelTier(PluginCall call) {
        String tierId = call.getString("tierId", "tiny");

        executor.execute(() -> {
            try {
                File modelDir = getSafeModelDir(tierId);
                if (!modelDir.exists()) {
                    modelDir.mkdirs();
                }

                String repoName = "onnx-community/whisper-" + tierId;
                String[] filesToDownload = new String[]{
                        "onnx/encoder_model_q4.onnx",
                        "onnx/decoder_model_q4.onnx",
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
                    downloadFileWithProgress(urlStr, destFile, tierId, i + 1, filesToDownload.length);
                }

                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("tierId", tierId);
                ret.put("modelPath", modelDir.getAbsolutePath());
                call.resolve(ret);

            } catch (Exception e) {
                Log.e(TAG, "Error downloading model tier " + tierId, e);
                call.reject("Download failed: " + e.getMessage());
            }
        });
    }

    private void downloadFileWithProgress(String urlStr, File destFile, String tierId, int fileIndex, int totalFiles) throws Exception {
        URL url = new URL(urlStr);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setInstanceFollowRedirects(true);
        conn.setConnectTimeout(30000);
        conn.setReadTimeout(60000);

        int responseCode = conn.getResponseCode();
        if (responseCode == HttpURLConnection.HTTP_MOVED_PERM || responseCode == HttpURLConnection.HTTP_MOVED_TEMP) {
            String newUrl = conn.getHeaderField("Location");
            conn = (HttpURLConnection) new URL(newUrl).openConnection();
            conn.setConnectTimeout(30000);
            conn.setReadTimeout(60000);
        }

        long fileLength = conn.getContentLengthLong();
        File tempFile = new File(destFile.getAbsolutePath() + ".tmp");
        boolean completed = false;

        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            try (InputStream in = new BufferedInputStream(conn.getInputStream());
                 FileOutputStream out = new FileOutputStream(tempFile)) {

                byte[] buffer = new byte[32768];
                long totalRead = 0;
                int bytesRead;

                long lastNotifyTime = 0;
                while ((bytesRead = in.read(buffer)) != -1) {
                    out.write(buffer, 0, bytesRead);
                    digest.update(buffer, 0, bytesRead);
                    totalRead += bytesRead;

                    long now = System.currentTimeMillis();
                    if (now - lastNotifyTime > 300) {
                        lastNotifyTime = now;
                        int filePct = fileLength > 0 ? (int) ((totalRead * 100) / fileLength) : 0;
                        int overallPct = (int) ((((fileIndex - 1) + (filePct / 100.0)) / totalFiles) * 100);

                        JSObject p = new JSObject();
                        p.put("tierId", tierId);
                        p.put("fileIndex", fileIndex);
                        p.put("totalFiles", totalFiles);
                        p.put("percent", Math.min(99, overallPct));
                        p.put("fileName", destFile.getName());
                        notifyListeners("downloadProgress", p);
                    }
                }
            }

            if (tempFile.renameTo(destFile)) {
                Log.i(TAG, "Successfully downloaded " + destFile.getName() + " (" + destFile.length() + " bytes)");
                completed = true;
            } else {
                throw new IOException("Failed to rename temporary file to destination: " + destFile.getAbsolutePath());
            }
        } finally {
            if (!completed && tempFile.exists()) {
                tempFile.delete();
            }
        }
    }

    /**
     * Deletes a downloaded Whisper model tier from internal storage.
     */
    @PluginMethod
    public void deleteModelTier(PluginCall call) {
        String tierId = call.getString("tierId", "tiny");
        try {
            File modelDir = getSafeModelDir(tierId);
            boolean deleted = deleteRecursive(modelDir);

            JSObject ret = new JSObject();
            ret.put("deleted", deleted);
            ret.put("tierId", tierId);
            call.resolve(ret);
        } catch (IllegalArgumentException | SecurityException | IOException e) {
            Log.e(TAG, "Failed deleting model tier: " + tierId, e);
            call.reject("Failed deleting model tier: " + e.getMessage());
        }
    }

    private boolean deleteRecursive(File fileOrDir) {
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

    /**
     * Transcribes audio using native Whisper engine with foreground execution.
     */
    @PluginMethod
    public void transcribe(PluginCall call) {
        String audioPath = call.getString("audioPath");
        String audioBase64 = call.getString("audioBase64");
        String videoUriStr = call.getString("videoUri");
        String modelTier = call.getString("modelTier", "tiny");
        String language = call.getString("language", "auto");

        // Auto-decode base64 if provided and audioPath missing
        if ((audioPath == null || audioPath.trim().isEmpty()) && audioBase64 != null && !audioBase64.trim().isEmpty()) {
            try {
                Context ctx = getContext();
                File cacheDir = new File(ctx.getCacheDir(), "whisper_audio");
                if (!cacheDir.exists()) cacheDir.mkdirs();
                File tempWav = new File(cacheDir, "input_" + System.currentTimeMillis() + ".wav");
                byte[] decodedBytes = Base64.decode(audioBase64, Base64.DEFAULT);
                try (FileOutputStream fos = new FileOutputStream(tempWav)) {
                    fos.write(decodedBytes);
                }
                audioPath = tempWav.getAbsolutePath();
            } catch (Exception e) {
                Log.w(TAG, "Failed auto-decoding audioBase64", e);
            }
        }

        if ((audioPath == null || audioPath.trim().isEmpty()) && (videoUriStr == null || videoUriStr.trim().isEmpty())) {
            call.reject("Either 'audioPath', 'audioBase64', or 'videoUri' is required");
            return;
        }

        final String finalAudioPath = audioPath;
        executor.execute(() -> {
            try {
                Context ctx = getContext();
                File wavFile;

                if (finalAudioPath != null && !finalAudioPath.trim().isEmpty()) {
                    wavFile = new File(finalAudioPath);
                } else {
                    // Extract first
                    Uri videoUri = (videoUriStr.startsWith("content://") || videoUriStr.startsWith("file://"))
                            ? Uri.parse(videoUriStr)
                            : Uri.fromFile(new File(videoUriStr));

                    NativeAudioExtractor.ExtractionResult ext = NativeAudioExtractor.extractToWav(
                            ctx,
                            videoUri,
                            percent -> {
                                JSObject p = new JSObject();
                                p.put("stage", "extracting");
                                p.put("percent", percent);
                                notifyListeners("transcriptionProgress", p);
                            },
                            () -> (whisperEngine != null && whisperEngine.isCancelled())
                    );
                    wavFile = ext.wavFile;
                }

                if (!wavFile.exists() || wavFile.length() == 0) {
                    call.reject("Audio file not found or empty: " + wavFile.getAbsolutePath());
                    return;
                }

                NativeWhisperEngine.TranscriptionResult res = whisperEngine.transcribe(
                        wavFile,
                        modelTier,
                        language,
                        (progressPct, detail, currentChunk, totalChunks, processedMs, totalMs) -> {
                            JSObject p = new JSObject();
                            p.put("stage", "transcribing");
                            p.put("progress", progressPct);
                            p.put("detail", detail);
                            p.put("currentChunk", currentChunk);
                            p.put("totalChunks", totalChunks);
                            p.put("processedMs", processedMs);
                            p.put("totalMs", totalMs);
                            notifyListeners("transcriptionProgress", p);
                        }
                );

                JSObject ret = new JSObject();
                ret.put("cues", res.toJSONArray());
                ret.put("durationMs", res.durationMs);
                ret.put("modelTier", res.modelTier);
                ret.put("wavPath", wavFile.getAbsolutePath());
                call.resolve(ret);

            } catch (Throwable e) {
                Log.e(TAG, "Native Whisper transcription error", e);
                call.reject("Transcription failed: " + (e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName()));
            }
        });
    }

    /**
     * Opens system document picker to select local video with zero WebView RAM impact.
     */
    @PluginMethod
    public void pickVideo(PluginCall call) {
        try {
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("video/*");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
            startActivityForResult(call, intent, "pickVideoResult");
        } catch (Exception e) {
            try {
                Intent fallback = new Intent(Intent.ACTION_GET_CONTENT);
                fallback.setType("video/*");
                fallback.addCategory(Intent.CATEGORY_OPENABLE);
                startActivityForResult(call, fallback, "pickVideoResult");
            } catch (Exception ex) {
                Log.e(TAG, "Failed to launch video picker", ex);
                call.reject("Failed to open video picker: " + ex.getMessage());
            }
        }
    }

    @ActivityCallback
    private void pickVideoResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() == Activity.RESULT_OK && result.getData() != null) {
            Intent data = result.getData();
            Uri uri = data.getData();
            if (uri != null) {
                try {
                    getContext().getContentResolver().takePersistableUriPermission(
                            uri,
                            Intent.FLAG_GRANT_READ_URI_PERMISSION
                    );
                } catch (Exception ignored) {}

                String name = "local_video.mp4";
                long size = 0;
                try (Cursor cursor = getContext().getContentResolver().query(uri, null, null, null, null)) {
                    if (cursor != null && cursor.moveToFirst()) {
                        int nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                        int sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE);
                        if (nameIndex != -1) name = cursor.getString(nameIndex);
                        if (sizeIndex != -1) size = cursor.getLong(sizeIndex);
                    }
                } catch (Exception ignored) {}

                JSObject ret = new JSObject();
                ret.put("uri", uri.toString());
                ret.put("name", name);
                ret.put("size", size);
                call.resolve(ret);
                return;
            }
        }
        call.reject("User cancelled video selection");
    }

    /**
     * Cancels any running transcription task.
     */
    @PluginMethod
    public void cancelTranscription(PluginCall call) {
        cancelTranscriptionInternal();
        JSObject ret = new JSObject();
        ret.put("cancelled", true);
        call.resolve(ret);
    }

    @Override
    protected void handleOnDestroy() {
        cancelTranscriptionInternal();
        super.handleOnDestroy();
    }
}
