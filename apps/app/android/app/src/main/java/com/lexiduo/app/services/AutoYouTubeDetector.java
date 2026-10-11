package com.lexiduo.app.services;

import android.content.Context;
import android.util.Log;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Singleton manager coordinating automatic YouTube video detection
 * for the background floating subtitle assistant.
 */
public class AutoYouTubeDetector {
    private static final String TAG = "AutoYouTubeDetector";
    private static final AutoYouTubeDetector INSTANCE = new AutoYouTubeDetector();

    public interface VideoDetectionListener {
        void onVideoDetected(String title, String artist, String videoId, String sourceLang, String targetLang);
    }

    private final List<VideoDetectionListener> listeners = new CopyOnWriteArrayList<>();

    private Context appContext;
    private volatile boolean autoModeEnabled = false;
    private volatile String sourceLang = "en";
    private volatile String targetLang = "tr";
    private volatile String currentVideoTitle = null;
    private volatile String currentVideoArtist = null;
    private volatile String currentVideoId = null;
    private volatile boolean isCardDismissedForCurrentVideo = false;

    private AutoYouTubeDetector() {}

    public static AutoYouTubeDetector getInstance() {
        return INSTANCE;
    }

    public synchronized void setContext(Context context) {
        if (context != null) {
            this.appContext = context.getApplicationContext();
        }
    }

    public boolean isAutoModeEnabled() {
        return autoModeEnabled;
    }

    public synchronized void setAutoModeEnabled(boolean enabled) {
        Log.i(TAG, "setAutoModeEnabled: " + enabled);
        this.autoModeEnabled = enabled;
        if (!enabled) {
            currentVideoTitle = null;
            currentVideoArtist = null;
            currentVideoId = null;
            isCardDismissedForCurrentVideo = false;
        }
    }

    public synchronized void clearCurrentVideo() {
        this.currentVideoTitle = null;
        this.currentVideoArtist = null;
        this.currentVideoId = null;
        this.isCardDismissedForCurrentVideo = false;
    }

    public synchronized void stop() {
        Log.i(TAG, "Stopping AutoYouTubeDetector and background assistant");
        setAutoModeEnabled(false);
        if (appContext != null) {
            FloatingOverlayService.stopService(appContext);
        }
    }

    public synchronized void setLanguages(String source, String target) {
        if (source != null && !source.trim().isEmpty()) {
            this.sourceLang = source.trim();
        }
        if (target != null && !target.trim().isEmpty()) {
            this.targetLang = target.trim();
        }
        FloatingOverlayService.updateLanguageBadge(this.sourceLang, this.targetLang);
    }

    public String getSourceLang() {
        return sourceLang;
    }

    public String getTargetLang() {
        return targetLang;
    }

    public String getCurrentVideoTitle() {
        return currentVideoTitle;
    }

    public String getCurrentVideoArtist() {
        return currentVideoArtist;
    }

    public String getCurrentVideoId() {
        return currentVideoId;
    }

    public void dismissCurrentVideoCard() {
        this.isCardDismissedForCurrentVideo = true;
    }

    public boolean isCardDismissedForCurrentVideo() {
        return this.isCardDismissedForCurrentVideo;
    }

    public void addListener(VideoDetectionListener listener) {
        if (listener != null && !listeners.contains(listener)) {
            listeners.add(listener);
        }
    }

    public void removeListener(VideoDetectionListener listener) {
        if (listener != null) {
            listeners.remove(listener);
        }
    }

    /**
     * Handles metadata updates from YouTube notification and media controller.
     */
    public synchronized void onMetadataChanged(String title, String artist, boolean isAdAnomaly) {
        onMetadataChanged(title, artist, null, isAdAnomaly);
    }

    public synchronized void onMetadataChanged(String title, String artist, String videoId, boolean isAdAnomaly) {
        if (!autoModeEnabled) return;

        if (isAdAnomaly) {
            Log.d(TAG, "Ad anomaly active, skipping auto video detection.");
            return;
        }

        if (title == null || title.trim().isEmpty()) return;

        String trimmedTitle = title.trim();
        if (isAdOrGenericTitle(trimmedTitle)) {
            Log.d(TAG, "Detected ad/generic title: " + trimmedTitle);
            return;
        }

        boolean sameTitle = trimmedTitle.equals(currentVideoTitle);
        boolean hasVideoId = videoId != null && !videoId.trim().isEmpty();
        boolean isNewVideoId = hasVideoId && (currentVideoId == null || !currentVideoId.equals(videoId.trim()));
        boolean overlayNeedsCues = !FloatingOverlayService.hasCues();

        // If title hasn't changed, cues are already active, and no new videoId, skip redundant event
        if (sameTitle && !isNewVideoId && !overlayNeedsCues) {
            return;
        }

        Log.i(TAG, "New YouTube video detected: \"" + trimmedTitle + "\" by \"" + artist + "\" (id=" + videoId + ")");
        currentVideoTitle = trimmedTitle;
        currentVideoArtist = (artist != null) ? artist.trim() : "";
        if (hasVideoId) {
            currentVideoId = videoId.trim();
        }
        isCardDismissedForCurrentVideo = false;

        // Ensure FloatingOverlayService is active
        if (!FloatingOverlayService.isRunning() && appContext != null) {
            FloatingOverlayService.startService(appContext);
        }

        // Show loading state on overlay: "Altyazılar Yükleniyor... [Title]"
        FloatingOverlayService.showAutoLoading(currentVideoTitle, sourceLang, targetLang);

        // Notify listeners (Capacitor plugin / JS bridge)
        for (VideoDetectionListener listener : listeners) {
            try {
                listener.onVideoDetected(currentVideoTitle, currentVideoArtist, currentVideoId, sourceLang, targetLang);
            } catch (Exception e) {
                Log.e(TAG, "Error notifying VideoDetectionListener", e);
            }
        }
    }

    private boolean isAdOrGenericTitle(String title) {
        String lower = title.toLowerCase();
        return lower.equals("ad")
                || lower.equals("advertisement")
                || lower.equals("reklam")
                || lower.equals("sponsorlu")
                || lower.equals("sponsored")
                || lower.equals("youtube");
    }
}
