package com.ytceviri.app.services;

import android.content.ComponentName;
import android.content.Context;
import android.media.MediaMetadata;
import android.media.session.MediaController;
import android.media.session.MediaSessionManager;
import android.media.session.PlaybackState;
import android.os.SystemClock;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;

import java.util.List;

/**
 * Listens to YouTube playback notifications and media sessions to provide
 * monotonic time estimation and playback state synchronization to FloatingOverlayService.
 */
public class YouTubeNotificationListenerService extends NotificationListenerService
        implements MediaSessionManager.OnActiveSessionsChangedListener {

    private static final String TAG = "YTNotifListenerService";
    private static final String YOUTUBE_PACKAGE = "com.google.android.youtube";

    private MediaSessionManager mediaSessionManager;
    private ComponentName componentName;
    private MediaController currentYouTubeController;

    private final MediaController.Callback mediaCallback = new MediaController.Callback() {
        @Override
        public void onPlaybackStateChanged(PlaybackState state) {
            handlePlaybackStateChanged(state);
        }

        @Override
        public void onMetadataChanged(MediaMetadata metadata) {
            handleMetadataChanged(metadata);
        }

        @Override
        public void onSessionDestroyed() {
            handleSessionDestroyed();
        }
    };

    @Override
    public void onListenerConnected() {
        super.onListenerConnected();
        Log.i(TAG, "NotificationListenerService connected.");
        initMediaSessionMonitoring();
    }

    @Override
    public void onListenerDisconnected() {
        super.onListenerDisconnected();
        Log.i(TAG, "NotificationListenerService disconnected.");
        cleanupSessionListener();
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        cleanupSessionListener();
    }

    @Override
    public void onActiveSessionsChanged(List<MediaController> controllers) {
        Log.d(TAG, "Active media sessions changed: count=" + (controllers != null ? controllers.size() : 0));
        updateYouTubeController(controllers);
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn != null && YOUTUBE_PACKAGE.equals(sbn.getPackageName())) {
            refreshControllers();
        }
    }

    @Override
    public void onNotificationRemoved(StatusBarNotification sbn) {
        if (sbn != null && YOUTUBE_PACKAGE.equals(sbn.getPackageName())) {
            refreshControllers();
        }
    }

    private void initMediaSessionMonitoring() {
        try {
            mediaSessionManager = (MediaSessionManager) getSystemService(Context.MEDIA_SESSION_SERVICE);
            componentName = new ComponentName(this, YouTubeNotificationListenerService.class);
            if (mediaSessionManager != null) {
                mediaSessionManager.addOnActiveSessionsChangedListener(this, componentName);
                List<MediaController> controllers = mediaSessionManager.getActiveSessions(componentName);
                updateYouTubeController(controllers);
            }
        } catch (SecurityException se) {
            Log.e(TAG, "SecurityException: Notification listener permission not granted yet", se);
        } catch (Exception e) {
            Log.e(TAG, "Error initializing MediaSessionManager monitoring", e);
        }
    }

    private void refreshControllers() {
        if (mediaSessionManager != null && componentName != null) {
            try {
                List<MediaController> controllers = mediaSessionManager.getActiveSessions(componentName);
                updateYouTubeController(controllers);
            } catch (Exception e) {
                Log.e(TAG, "Error refreshing controllers", e);
            }
        }
    }

    private synchronized void updateYouTubeController(List<MediaController> controllers) {
        MediaController newController = null;
        if (controllers != null) {
            for (MediaController controller : controllers) {
                if (controller != null && YOUTUBE_PACKAGE.equals(controller.getPackageName())) {
                    newController = controller;
                    break;
                }
            }
        }

        if (currentYouTubeController != newController) {
            if (currentYouTubeController != null) {
                try {
                    currentYouTubeController.unregisterCallback(mediaCallback);
                } catch (Exception ignored) {}
            }
            currentYouTubeController = newController;
            if (currentYouTubeController != null) {
                Log.i(TAG, "Attached to active YouTube MediaController.");
                try {
                    currentYouTubeController.registerCallback(mediaCallback);
                    handlePlaybackStateChanged(currentYouTubeController.getPlaybackState());
                    handleMetadataChanged(currentYouTubeController.getMetadata());
                } catch (Exception e) {
                    Log.e(TAG, "Error registering MediaController callback", e);
                }
            } else {
                Log.i(TAG, "YouTube MediaController detached.");
                AutoYouTubeDetector.getInstance().clearCurrentVideo();
                FloatingOverlayService.clearCues();
                FloatingOverlayService.updatePlaybackState(false, 0L, 1.0f);
            }
        } else if (currentYouTubeController != null) {
            // Re-query current playback state & metadata on refreshed session
            try {
                handlePlaybackStateChanged(currentYouTubeController.getPlaybackState());
                handleMetadataChanged(currentYouTubeController.getMetadata());
            } catch (Exception ignored) {}
        }
    }

    private void handlePlaybackStateChanged(PlaybackState state) {
        if (state == null) {
            FloatingOverlayService.updatePlaybackState(false, 0L, 1.0f);
            return;
        }

        if (state.getState() == PlaybackState.STATE_STOPPED || state.getState() == PlaybackState.STATE_NONE) {
            AutoYouTubeDetector.getInstance().clearCurrentVideo();
            FloatingOverlayService.clearCues();
            FloatingOverlayService.updatePlaybackState(false, 0L, 1.0f);
            return;
        }

        boolean isPlaying = (state.getState() == PlaybackState.STATE_PLAYING);
        long position = state.getPosition();
        if (position < 0) {
            position = 0;
        }
        float speed = state.getPlaybackSpeed();
        if (speed <= 0f) speed = 1.0f;

        // Monotonic time calculation: pos + (now - updated) * speed
        if (isPlaying) {
            long updateTime = state.getLastPositionUpdateTime();
            if (updateTime > 0) {
                long delta = SystemClock.elapsedRealtime() - updateTime;
                if (delta > 0) {
                    position += (long) (delta * speed);
                }
            }
        }

        FloatingOverlayService.updatePlaybackState(isPlaying, position, speed);
    }

    private void handleMetadataChanged(MediaMetadata metadata) {
        if (metadata == null) {
            FloatingOverlayService.reportAdAnomaly(false, 0L);
            return;
        }

        long duration = metadata.getLong(MediaMetadata.METADATA_KEY_DURATION);
        String title = metadata.getString(MediaMetadata.METADATA_KEY_TITLE);

        boolean isAdAnomaly = false;

        // Anomaly check 1: Exact ad indicator in metadata title
        if (title != null) {
            String trimmedTitle = title.trim();
            if (trimmedTitle.equalsIgnoreCase("Ad")
                    || trimmedTitle.equalsIgnoreCase("Advertisement")
                    || trimmedTitle.equalsIgnoreCase("Reklam")
                    || trimmedTitle.equalsIgnoreCase("Sponsorlu")
                    || trimmedTitle.equalsIgnoreCase("Sponsored")) {
                isAdAnomaly = true;
            }
        }

        // Anomaly check 2: Short duration anomaly (<= 35s) while main video cues span > 60s
        if (!isAdAnomaly && duration > 0 && duration <= 35000) {
            long maxCueMs = FloatingOverlayService.getMaxCueDurationMs();
            if (maxCueMs > 60000) {
                // Primary video subtitles exceed 1 min, but session duration reports <= 35s -> ad swap
                isAdAnomaly = true;
            }
        }

        FloatingOverlayService.reportAdAnomaly(isAdAnomaly, duration);

        String artist = metadata.getString(MediaMetadata.METADATA_KEY_ARTIST);
        if (artist == null) {
            artist = metadata.getString(MediaMetadata.METADATA_KEY_AUTHOR);
        }
        String videoId = extractVideoIdFromMetadata(metadata);
        AutoYouTubeDetector.getInstance().setContext(this);
        AutoYouTubeDetector.getInstance().onMetadataChanged(title, artist, videoId, isAdAnomaly);
    }

    private String extractVideoIdFromMetadata(MediaMetadata metadata) {
        if (metadata == null) return null;
        java.util.regex.Pattern pattern = java.util.regex.Pattern.compile("(?:v=|vi/|vi=|/vi/|youtu\\.be/|shorts/)([a-zA-Z0-9_-]{11})");
        String[] uriKeys = {
                MediaMetadata.METADATA_KEY_ALBUM_ART_URI,
                MediaMetadata.METADATA_KEY_ART_URI,
                MediaMetadata.METADATA_KEY_DISPLAY_ICON_URI,
                MediaMetadata.METADATA_KEY_MEDIA_URI
        };
        for (String key : uriKeys) {
            try {
                String uri = metadata.getString(key);
                if (uri != null) {
                    java.util.regex.Matcher m = pattern.matcher(uri);
                    if (m.find()) return m.group(1);
                }
            } catch (Exception ignored) {}
        }
        try {
            android.media.MediaDescription desc = metadata.getDescription();
            if (desc != null) {
                if (desc.getMediaId() != null && desc.getMediaId().matches("^[a-zA-Z0-9_-]{11}$")) {
                    return desc.getMediaId();
                }
                if (desc.getMediaUri() != null) {
                    java.util.regex.Matcher m = pattern.matcher(desc.getMediaUri().toString());
                    if (m.find()) return m.group(1);
                }
                if (desc.getIconUri() != null) {
                    java.util.regex.Matcher m = pattern.matcher(desc.getIconUri().toString());
                    if (m.find()) return m.group(1);
                }
            }
        } catch (Exception ignored) {}
        try {
            String mediaId = metadata.getString(MediaMetadata.METADATA_KEY_MEDIA_ID);
            if (mediaId != null && mediaId.matches("^[a-zA-Z0-9_-]{11}$")) return mediaId;
        } catch (Exception ignored) {}
        return null;
    }

    private void handleSessionDestroyed() {
        Log.i(TAG, "YouTube MediaSession destroyed.");
        AutoYouTubeDetector.getInstance().clearCurrentVideo();
        FloatingOverlayService.clearCues();
        FloatingOverlayService.updatePlaybackState(false, 0L, 1.0f);
    }

    private synchronized void cleanupSessionListener() {
        if (currentYouTubeController != null) {
            try {
                currentYouTubeController.unregisterCallback(mediaCallback);
            } catch (Exception ignored) {}
            currentYouTubeController = null;
        }
        AutoYouTubeDetector.getInstance().clearCurrentVideo();
        FloatingOverlayService.clearCues();
        FloatingOverlayService.updatePlaybackState(false, 0L, 1.0f);
        if (mediaSessionManager != null) {
            try {
                mediaSessionManager.removeOnActiveSessionsChangedListener(this);
            } catch (Exception ignored) {}
        }
    }
}
