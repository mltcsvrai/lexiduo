package com.lexiduo.app.services;

import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.SystemClock;
import android.util.DisplayMetrics;
import android.util.Log;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.View;
import android.view.WindowManager;
import android.widget.TextView;

import androidx.annotation.Nullable;

import com.lexiduo.app.MainActivity;
import com.lexiduo.app.R;
import com.lexiduo.app.models.SubtitleCue;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Foreground service that renders a floating overlay over YouTube and
 * synchronizes bilingual subtitles with 100ms precision and ad freeze protection.
 */
public class FloatingOverlayService extends Service {
    private static final String TAG = "FloatingOverlayService";
    public static final String ACTION_STOP_SERVICE = "com.lexiduo.app.action.STOP_SERVICE";
    private static final String CHANNEL_ID = FloatingOverlayNotificationHelper.CHANNEL_ID;
    private static final int NOTIFICATION_ID = 1001;
    private static final long TICK_INTERVAL_MS = 100L;
    private static final long DRIFT_THRESHOLD_MS = 120L;
    private static final long PINNED_PROTECTION_DURATION_MS = 25000L;

    private static volatile FloatingOverlayService sInstance = null;
    private static final List<SubtitleCue> sPendingCues = new CopyOnWriteArrayList<>();
    private static volatile boolean sIsPinned = false;
    private static volatile String sPinnedVideoId = null;
    private static volatile long sPinnedTimestampMs = 0L;
    private static Integer sCustomSourceColor = null, sCustomTargetColor = null, sCustomBgColor = null;
    private static Float sCustomBgOpacity = null, sCustomFontSize = null;
    private static Boolean sShowBackground = true;
    private static String sBgWidthMode = "dynamic";

    private WindowManager windowManager;
    private View overlayView;
    private WindowManager.LayoutParams windowParams;

    private TextView tvTargetSubtitle, tvSourceSubtitle, tvLangBadge;
    private TextView btnBubble;
    private View statusIndicator, contentContainer, cardContainer, bubbleContainer, aiFallbackLayout;
    private OverlayTouchHandler overlayTouchHandler;
    private boolean isBubbleMode = false;
    private int savedCardWidth = 0;

    private float currentScale = 1.0f;
    private float currentAlpha = 1.0f;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private boolean isServiceRunning = false;

    // Subtitle cues & sync state
    private final List<SubtitleCue> cuesList = new CopyOnWriteArrayList<>();
    private volatile boolean isPlaying = false, isAccessibilityAdDetected = false, isNotificationAdAnomaly = false, isAdActive = false;
    private volatile long lastKnownPositionMs = 0L, lastPositionTimestampMs = 0L;
    private volatile float playbackSpeed = 1.0f;
    private volatile boolean isAutoLoading = false;
    private volatile String autoLoadingTitle = "";
    private Runnable autoLoadingTimeoutRunnable = null;

    // Tick Engine
    private final Runnable tickRunnable = new Runnable() {
        @Override
        public void run() {
            if (!isServiceRunning) return;
            updateUiForCurrentTime();
            mainHandler.postDelayed(this, TICK_INTERVAL_MS);
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        sInstance = this;
        isServiceRunning = true;
        startForegroundServiceNotification();

        // Load any pending cues queued before service startup
        if (!sPendingCues.isEmpty()) handleLoadCues(sPendingCues);

        initOverlayView();
        startTickEngine();
        Log.i(TAG, "FloatingOverlayService initialized and overlay rendered.");
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP_SERVICE.equals(intent.getAction())) {
            AutoYouTubeDetector.getInstance().setAutoModeEnabled(false);
            stopSelf();
            return START_NOT_STICKY;
        }
        startForegroundServiceNotification();
        return START_STICKY;
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        isServiceRunning = false;
        sInstance = null;
        sIsPinned = false;
        sPinnedVideoId = null;
        stopTickEngine();
        removeOverlayView();
        if (autoLoadingTimeoutRunnable != null) {
            mainHandler.removeCallbacks(autoLoadingTimeoutRunnable);
            autoLoadingTimeoutRunnable = null;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) stopForeground(STOP_FOREGROUND_REMOVE);
        else stopForeground(true);
        Log.i(TAG, "FloatingOverlayService stopped.");
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        if (windowManager == null || overlayView == null || windowParams == null) return;
        applyScaleUi();
    }

    // =========================================================================
    // Static API for External Interaction
    // =========================================================================

    public static boolean isRunning() {
        return sInstance != null && sInstance.isServiceRunning;
    }

    public static void startService(Context context) {
        Intent intent = new Intent(context, FloatingOverlayService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent);
        else context.startService(intent);
    }

    public static void stopService(Context context) {
        context.stopService(new Intent(context, FloatingOverlayService.class));
    }

    public static void updatePlaybackState(boolean playing, long positionMs, float speed) {
        FloatingOverlayService instance = sInstance;
        if (instance != null) instance.handlePlaybackUpdate(playing, positionMs, speed);
    }

    public static void setAdActive(boolean active) {
        FloatingOverlayService instance = sInstance;
        if (instance != null) instance.handleAccessibilityAdChange(active);
    }

    public static void reportAdAnomaly(boolean isAnomaly, long durationMs) {
        Log.d(TAG, "Ad duration anomaly reported: isAnomaly=" + isAnomaly + ", duration=" + durationMs);
        FloatingOverlayService instance = sInstance;
        if (instance != null) instance.handleNotificationAdAnomalyChange(isAnomaly);
    }

    public static void loadCues(List<SubtitleCue> cues, boolean pinned, String videoId) {
        sIsPinned = pinned;
        sPinnedVideoId = videoId;
        sPinnedTimestampMs = SystemClock.elapsedRealtime();
        loadCues(cues);
    }

    public static void loadCues(List<SubtitleCue> cues) {
        sPendingCues.clear();
        if (cues != null && !cues.isEmpty()) sPendingCues.addAll(cues);
        FloatingOverlayService instance = sInstance;
        if (instance != null) instance.handleLoadCues(cues);
    }

    public static synchronized boolean isPinnedActive(@Nullable String incomingVideoId) {
        if (!sIsPinned) return false;
        long now = SystemClock.elapsedRealtime();
        if (now - sPinnedTimestampMs > PINNED_PROTECTION_DURATION_MS) {
            sIsPinned = false;
            sPinnedVideoId = null;
            return false;
        }
        if (incomingVideoId != null && sPinnedVideoId != null && !sPinnedVideoId.isEmpty() && !incomingVideoId.equals(sPinnedVideoId)) {
            sIsPinned = false;
            sPinnedVideoId = null;
            return false;
        }
        return true;
    }

    public static boolean isPinned() { return isPinnedActive(null); }

    public static void clearCues(boolean force) {
        if (!force && isPinnedActive(null)) {
            Log.d(TAG, "clearCues skipped: pinned shield active");
            return;
        }
        if (force) {
            sIsPinned = false;
            sPinnedVideoId = null;
        }
        sPendingCues.clear();
        FloatingOverlayService instance = sInstance;
        if (instance != null) instance.handleClearCues();
    }

    public static void clearCues() { clearCues(false); }

    public static long getMaxCueDurationMs() {
        long max = 0L;
        for (SubtitleCue cue : sPendingCues) { if (cue.endMs > max) max = cue.endMs; }
        return max;
    }

    public static boolean hasCues() {
        FloatingOverlayService instance = sInstance;
        return instance != null && !instance.cuesList.isEmpty();
    }

    public static void updateOverlayScale(float scale) {
        FloatingOverlayService instance = sInstance;
        if (instance != null) instance.mainHandler.post(() -> instance.setOverlayScale(scale));
    }

    public static void updateOverlayAlpha(float alpha) {
        FloatingOverlayService instance = sInstance;
        if (instance == null) return;
        instance.mainHandler.post(() -> {
            instance.currentAlpha = Math.max(0.2f, Math.min(1.0f, alpha));
            FloatingOverlayPreferences.setAlpha(instance, instance.currentAlpha);
            if (instance.windowParams != null) instance.windowParams.alpha = instance.currentAlpha;
            if (instance.windowManager != null && instance.overlayView != null) {
                try { instance.windowManager.updateViewLayout(instance.overlayView, instance.windowParams); } catch (Exception ignored) {}
            }
        });
    }

    public static void showAutoLoading(String title, String srcLang, String dstLang) {
        FloatingOverlayService instance = sInstance;
        if (instance != null) instance.handleShowAutoLoading(title, srcLang, dstLang);
    }

    public static void updateLanguageBadge(String srcLang, String dstLang) {
        FloatingOverlayService instance = sInstance;
        if (instance == null) return;
        instance.mainHandler.post(() -> {
            if (instance.tvLangBadge == null) return;
            boolean hasLangs = srcLang != null && dstLang != null && !srcLang.isEmpty() && !dstLang.isEmpty();
            FloatingOverlayStyleHelper.setViewVisible(instance.tvLangBadge, hasLangs);
            if (hasLangs) instance.tvLangBadge.setText(srcLang.toUpperCase() + " ➔ " + dstLang.toUpperCase());
        });
    }

    public static void showAiFallback(boolean show) {
        FloatingOverlayService instance = sInstance;
        if (instance != null) {
            instance.mainHandler.post(() -> {
                if (show) {
                    instance.isAutoLoading = false;
                    instance.autoLoadingTitle = "";
                    if (instance.autoLoadingTimeoutRunnable != null) {
                        instance.mainHandler.removeCallbacks(instance.autoLoadingTimeoutRunnable);
                        instance.autoLoadingTimeoutRunnable = null;
                    }
                    instance.updateUiForCurrentTime();
                }
                FloatingOverlayStyleHelper.setViewVisible(instance.aiFallbackLayout, show);
            });
        }
    }

    public static void updateStyle(String sourceColor, String targetColor, String bgColor, Double bgOpacity, Double fontSize) {
        updateStyle(sourceColor, targetColor, bgColor, bgOpacity, fontSize, null, null);
    }

    public static void updateStyle(String sourceColor, String targetColor, String bgColor, Double bgOpacity, Double fontSize, Boolean showBg, String bgWidth) {
        try {
            if (sourceColor != null && !sourceColor.trim().isEmpty()) sCustomSourceColor = android.graphics.Color.parseColor(sourceColor.trim());
            if (targetColor != null && !targetColor.trim().isEmpty()) sCustomTargetColor = android.graphics.Color.parseColor(targetColor.trim());
            if (bgColor != null && !bgColor.trim().isEmpty()) sCustomBgColor = android.graphics.Color.parseColor(bgColor.trim());
            if (bgOpacity != null) sCustomBgOpacity = (float) (bgOpacity / 100.0);
            if (fontSize != null) sCustomFontSize = fontSize.floatValue();
            if (showBg != null) sShowBackground = showBg;
            if (bgWidth != null && !bgWidth.trim().isEmpty()) sBgWidthMode = bgWidth.trim();
        } catch (Exception e) {
            Log.w(TAG, "Failed parsing custom style colors", e);
        }
        FloatingOverlayService instance = sInstance;
        if (instance != null) instance.mainHandler.post(instance::applyCustomStyle);
    }

    // =========================================================================
    // State & Synchronization Logic
    // =========================================================================

    private synchronized void handlePlaybackUpdate(boolean playing, long positionMs, float speed) {
        if (positionMs < 0) {
            isPlaying = playing;
            playbackSpeed = speed > 0f ? speed : 1.0f;
            mainHandler.post(this::updateUiForCurrentTime);
            return;
        }

        long currentEstimated = calculateCurrentPosition();
        long drift = Math.abs(currentEstimated - positionMs);
        if (drift > DRIFT_THRESHOLD_MS) {
            Log.d(TAG, "Hard seek triggered: drift=" + drift + "ms -> target=" + positionMs);
            lastKnownPositionMs = positionMs;
            lastPositionTimestampMs = SystemClock.elapsedRealtime();
        } else if (!isPlaying && playing || !playing) {
            lastKnownPositionMs = positionMs;
            lastPositionTimestampMs = SystemClock.elapsedRealtime();
        }

        isPlaying = playing;
        playbackSpeed = speed > 0f ? speed : 1.0f;
        mainHandler.post(this::updateUiForCurrentTime);
    }

    private synchronized void handleAccessibilityAdChange(boolean active) {
        this.isAccessibilityAdDetected = active;
        evaluateAdState();
    }

    private synchronized void handleNotificationAdAnomalyChange(boolean isAnomaly) {
        this.isNotificationAdAnomaly = isAnomaly;
        evaluateAdState();
    }

    private synchronized void evaluateAdState() {
        boolean combinedAdActive = isAccessibilityAdDetected || isNotificationAdAnomaly;
        if (this.isAdActive == combinedAdActive) return;

        Log.i(TAG, "Ad active state changed: " + combinedAdActive + " (AD_BREAK_FREEZE: a11y="
                + isAccessibilityAdDetected + ", notif=" + isNotificationAdAnomaly + ")");
        if (combinedAdActive) {
            lastKnownPositionMs = calculateCurrentPosition();
            lastPositionTimestampMs = SystemClock.elapsedRealtime();
            this.isAdActive = true;
        } else {
            lastPositionTimestampMs = SystemClock.elapsedRealtime();
            this.isAdActive = false;
        }

        mainHandler.post(this::updateUiForCurrentTime);
    }

    private synchronized void handleShowAutoLoading(String title, String srcLang, String dstLang) {
        String cleanTitle = (title != null && !title.trim().isEmpty()) ? title.trim() : "";
        boolean isSameTitle = !cleanTitle.isEmpty() && cleanTitle.equalsIgnoreCase(autoLoadingTitle) && !cuesList.isEmpty();
        if (!isSameTitle) {
            if (!isPinnedActive(null)) {
                cuesList.clear();
            }
        }
        if (!isPinnedActive(null) || cuesList.isEmpty()) {
            isAutoLoading = true;
        }
        autoLoadingTitle = cleanTitle;
        if (autoLoadingTimeoutRunnable != null) mainHandler.removeCallbacks(autoLoadingTimeoutRunnable);
        autoLoadingTimeoutRunnable = () -> {
            isAutoLoading = false;
            if (cuesList.isEmpty() && AutoYouTubeDetector.getInstance().isAutoModeEnabled()) {
                FloatingOverlayStyleHelper.setViewVisible(aiFallbackLayout, true);
                updateUiForCurrentTime();
            }
        };
        mainHandler.postDelayed(autoLoadingTimeoutRunnable, 15000L);

        mainHandler.post(() -> {
            FloatingOverlayStyleHelper.setViewVisible(cardContainer, true);
            FloatingOverlayStyleHelper.setViewVisible(contentContainer, true);
            if (tvLangBadge != null) {
                boolean hasLangs = srcLang != null && dstLang != null && !srcLang.isEmpty() && !dstLang.isEmpty();
                FloatingOverlayStyleHelper.setViewVisible(tvLangBadge, hasLangs);
                if (hasLangs) tvLangBadge.setText(srcLang.toUpperCase() + " ➔ " + dstLang.toUpperCase());
            }
            if (cuesList.isEmpty()) {
                if (tvTargetSubtitle != null) {
                    tvTargetSubtitle.setTextColor(0xFF80D8FF);
                    tvTargetSubtitle.setText(getString(R.string.overlay_subtitles_loading) + autoLoadingTitle);
                }
                if (tvSourceSubtitle != null) {
                    tvSourceSubtitle.setText("");
                    FloatingOverlayStyleHelper.setViewVisible(tvSourceSubtitle, false);
                }
            } else {
                updateUiForCurrentTime();
            }
            FloatingOverlayStyleHelper.setViewVisible(aiFallbackLayout, false);
        });
    }

    private synchronized void handleLoadCues(List<SubtitleCue> cues) {
        cuesList.clear();
        isAutoLoading = false;
        if (autoLoadingTimeoutRunnable != null) {
            mainHandler.removeCallbacks(autoLoadingTimeoutRunnable);
            autoLoadingTimeoutRunnable = null;
        }
        boolean hasCues = cues != null && !cues.isEmpty();
        if (hasCues) {
            List<SubtitleCue> sorted = new ArrayList<>(cues);
            Collections.sort(sorted, (a, b) -> Long.compare(a.startMs, b.startMs));
            cuesList.addAll(sorted);
        }
        Log.i(TAG, "Loaded " + cuesList.size() + " subtitle cues.");
        mainHandler.post(() -> {
            FloatingOverlayStyleHelper.setViewVisible(aiFallbackLayout, !hasCues && AutoYouTubeDetector.getInstance().isAutoModeEnabled());
            updateUiForCurrentTime();
        });
    }

    private synchronized void handleClearCues() {
        cuesList.clear();
        isAutoLoading = false;
        autoLoadingTitle = "";
        if (autoLoadingTimeoutRunnable != null) {
            mainHandler.removeCallbacks(autoLoadingTimeoutRunnable);
            autoLoadingTimeoutRunnable = null;
        }
        mainHandler.post(() -> {
            FloatingOverlayStyleHelper.setViewVisible(aiFallbackLayout, false);
            if (tvTargetSubtitle != null) tvTargetSubtitle.setText("");
            if (tvSourceSubtitle != null) {
                tvSourceSubtitle.setText("");
                FloatingOverlayStyleHelper.setViewVisible(tvSourceSubtitle, false);
            }
            updateUiForCurrentTime();
        });
    }

    public synchronized long calculateCurrentPosition() {
        if (!isPlaying || isAdActive) {
            return lastKnownPositionMs;
        }
        long now = SystemClock.elapsedRealtime();
        long elapsed = now - lastPositionTimestampMs;
        if (elapsed < 0) elapsed = 0;
        return lastKnownPositionMs + (long) (elapsed * playbackSpeed);
    }

    @Nullable
    private SubtitleCue findMatchingCue(long timeMs) {
        return FloatingOverlayCueMatcher.findMatchingCue(cuesList, timeMs);
    }

    // =========================================================================
    // UI & Window Management
    // =========================================================================

    private void initOverlayView() {
        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
        if (windowManager == null) return;

        currentScale = FloatingOverlayPreferences.getScale(this);
        currentAlpha = FloatingOverlayPreferences.getAlpha(this);

        DisplayMetrics metrics = getResources().getDisplayMetrics();
        int targetWidth = FloatingOverlayStyleHelper.getBaseCardWidth(this);
        savedCardWidth = targetWidth;

        int layoutType = (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_PHONE;

        windowParams = new WindowManager.LayoutParams(
                targetWidth, WindowManager.LayoutParams.WRAP_CONTENT, layoutType,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                        | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                        | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
                PixelFormat.TRANSLUCENT
        );
        windowParams.gravity = Gravity.TOP | Gravity.START;
        windowParams.alpha = currentAlpha;
        windowParams.x = Math.max(0, (metrics.widthPixels - targetWidth) / 2);
        windowParams.y = 140;

        overlayView = LayoutInflater.from(this).inflate(R.layout.overlay_floating_subtitle, null);

        cardContainer = overlayView.findViewById(R.id.card_container);
        bubbleContainer = overlayView.findViewById(R.id.bubble_container);
        tvTargetSubtitle = overlayView.findViewById(R.id.tv_target_subtitle);
        tvSourceSubtitle = overlayView.findViewById(R.id.tv_source_subtitle);
        tvLangBadge = overlayView.findViewById(R.id.tv_lang_badge);
        aiFallbackLayout = overlayView.findViewById(R.id.ai_fallback_layout);
        statusIndicator = overlayView.findViewById(R.id.status_indicator);
        contentContainer = overlayView.findViewById(R.id.content_container);
        btnBubble = overlayView.findViewById(R.id.btn_bubble);
        View btnClose = overlayView.findViewById(R.id.btn_close);

        if (aiFallbackLayout != null) {
            aiFallbackLayout.setOnClickListener(v -> {
                try {
                    startActivity(new Intent(this, MainActivity.class)
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP));
                } catch (Exception ignored) {}
            });
        }

        if (tvLangBadge != null && AutoYouTubeDetector.getInstance().isAutoModeEnabled()) {
            String src = AutoYouTubeDetector.getInstance().getSourceLang();
            String dst = AutoYouTubeDetector.getInstance().getTargetLang();
            FloatingOverlayStyleHelper.setViewVisible(tvLangBadge, true);
            tvLangBadge.setText(src.toUpperCase() + " ➔ " + dst.toUpperCase());
        }

        // Close Action: completely stop assistant and background service, notify TypeScript plugin, and stop service
        if (btnClose != null) {
            btnClose.setOnClickListener(v -> {
                AutoYouTubeDetector.getInstance().stop();
                com.lexiduo.app.plugins.FloatingSubtitlePlugin.notifyAssistantStopped();
                stopSelf();
            });
        }
        if (btnBubble != null) btnBubble.setOnClickListener(v -> toggleBubbleMode());

        // Apply scale & padding
        applyScaleUi();

        // Drag & Scale via OverlayTouchHandler (VSYNC-buffered, pointer-aware, edge snapping)
        overlayTouchHandler = new OverlayTouchHandler(overlayView, windowParams, windowManager, factor -> {
            setOverlayScale(currentScale * factor);
        });
        overlayTouchHandler.setupDragAndScale(cardContainer, contentContainer, bubbleContainer);
        overlayTouchHandler.setupBubbleTap(bubbleContainer, this::toggleBubbleMode);

        try {
            windowManager.addView(overlayView, windowParams);
        } catch (Exception e) {
            Log.e(TAG, "Failed to add floating overlay to WindowManager", e);
            stopSelf();
        }
    }

    private void toggleBubbleMode() {
        if (overlayView == null || windowParams == null || windowManager == null) return;
        isBubbleMode = !isBubbleMode;
        if (overlayTouchHandler != null) {
            overlayTouchHandler.setBubbleMode(isBubbleMode);
        }

        if (isBubbleMode) {
            FloatingOverlayStyleHelper.setViewVisible(cardContainer, false);
            FloatingOverlayStyleHelper.setViewVisible(bubbleContainer, true);
            savedCardWidth = windowParams.width;
            windowParams.width = dpToPx(48);
            windowParams.height = dpToPx(48);
        } else {
            FloatingOverlayStyleHelper.setViewVisible(bubbleContainer, false);
            FloatingOverlayStyleHelper.setViewVisible(cardContainer, true);
            windowParams.width = Math.max(savedCardWidth, dpToPx(280));
            windowParams.height = WindowManager.LayoutParams.WRAP_CONTENT;
        }

        DisplayMetrics metrics = getResources().getDisplayMetrics();
        if (overlayTouchHandler != null) {
            overlayTouchHandler.clampWindowPosition(metrics);
        }

        try {
            windowManager.updateViewLayout(overlayView, windowParams);
        } catch (Exception ignored) {}
    }

    private int dpToPx(int dp) {
        return FloatingOverlayStyleHelper.dpToPx(this, dp);
    }

    private void setOverlayScale(float scale) {
        currentScale = FloatingOverlayPreferences.clampScale(scale);
        FloatingOverlayPreferences.setScale(this, currentScale);
        applyScaleUi();
    }

    private void applyScaleUi() {
        FloatingOverlayStyleHelper.applyScaleAndDimensions(
                this,
                tvTargetSubtitle,
                tvSourceSubtitle,
                cardContainer,
                windowParams,
                windowManager,
                overlayView,
                overlayTouchHandler,
                currentScale,
                sCustomFontSize,
                sBgWidthMode,
                isBubbleMode
        );
        if (windowParams != null) {
            savedCardWidth = windowParams.width;
        }
    }

    private void updateUiForCurrentTime() {
        if (overlayView == null) return;

        if (AutoYouTubeDetector.getInstance().isCardDismissedForCurrentVideo()) {
            FloatingOverlayStyleHelper.setViewVisible(cardContainer, false);
            return;
        }

        // Ad Active Case
        if (isAdActive) {
            if (statusIndicator != null) statusIndicator.setBackgroundResource(R.drawable.bg_status_dot_ad);
            if (tvTargetSubtitle != null) {
                tvTargetSubtitle.setTextColor(0xFFFFFFFF);
                tvTargetSubtitle.setText(getString(R.string.overlay_ad_frozen));
            }
            if (tvSourceSubtitle != null) {
                tvSourceSubtitle.setText(getString(R.string.overlay_ad_waiting));
                FloatingOverlayStyleHelper.setViewVisible(tvSourceSubtitle, true);
            }
            return;
        }

        // Normal Playback Case
        if (statusIndicator != null) {
            statusIndicator.setBackgroundResource(
                    isPlaying ? R.drawable.bg_status_dot_active : R.drawable.bg_status_dot_paused
            );
        }

        if (cuesList.isEmpty()) {
            if (tvTargetSubtitle != null) {
                if (isAutoLoading) {
                    tvTargetSubtitle.setTextColor(0xFF80D8FF);
                    tvTargetSubtitle.setText(getString(R.string.overlay_subtitles_loading) + autoLoadingTitle);
                } else if (AutoYouTubeDetector.getInstance().isAutoModeEnabled()
                        && AutoYouTubeDetector.getInstance().getCurrentVideoTitle() != null) {
                    tvTargetSubtitle.setTextColor(0xFF9E9E9E);
                    tvTargetSubtitle.setText("● " + AutoYouTubeDetector.getInstance().getCurrentVideoTitle());
                } else {
                    tvTargetSubtitle.setTextColor(0xFF9E9E9E);
                    tvTargetSubtitle.setText(getString(R.string.overlay_waiting_subtitles));
                }
            }
            if (tvSourceSubtitle != null) {
                tvSourceSubtitle.setText("");
                FloatingOverlayStyleHelper.setViewVisible(tvSourceSubtitle, false);
            }
            return;
        }

        long currentMs = calculateCurrentPosition();
        SubtitleCue activeCue = findMatchingCue(currentMs);

        if (activeCue != null) {
            String target = activeCue.targetText;
            String source = activeCue.sourceText;

            boolean hasTarget = !target.isEmpty();
            boolean hasSource = !source.isEmpty();
            boolean isIdentical = target.equalsIgnoreCase(source);

            String currentSrcLang = AutoYouTubeDetector.getInstance().getSourceLang();
            String currentDstLang = AutoYouTubeDetector.getInstance().getTargetLang();
            boolean expectTranslation = currentDstLang != null && !currentDstLang.equalsIgnoreCase(currentSrcLang);

            if (!hasTarget && hasSource) {
                // In-flight translation: show source subtitle immediately in primary slot
                if (tvTargetSubtitle != null) {
                    tvTargetSubtitle.setTextColor(sCustomTargetColor != null ? sCustomTargetColor : 0xFFFFFFFF);
                    tvTargetSubtitle.setText(source);
                }
                if (tvSourceSubtitle != null) {
                    tvSourceSubtitle.setTextColor(0xFF80D8FF);
                    tvSourceSubtitle.setText(getString(R.string.overlay_subtitles_translating));
                    FloatingOverlayStyleHelper.setViewVisible(tvSourceSubtitle, true);
                }
            } else if (hasTarget && hasSource && (!isIdentical || !expectTranslation)) {
                // Bilingual: translated target in primary, original source in secondary
                if (tvTargetSubtitle != null) {
                    tvTargetSubtitle.setTextColor(sCustomTargetColor != null ? sCustomTargetColor : 0xFFFFFFFF);
                    tvTargetSubtitle.setText(target);
                }
                if (tvSourceSubtitle != null) {
                    tvSourceSubtitle.setTextColor(sCustomSourceColor != null ? sCustomSourceColor : 0xFFB0BEC5);
                    tvSourceSubtitle.setText(source);
                    FloatingOverlayStyleHelper.setViewVisible(tvSourceSubtitle, true);
                }
            } else if (hasTarget && hasSource && isIdentical && expectTranslation) {
                // Untranslated identical fallback: keep source visible, show translating badge
                if (tvTargetSubtitle != null) {
                    tvTargetSubtitle.setTextColor(sCustomTargetColor != null ? sCustomTargetColor : 0xFFFFFFFF);
                    tvTargetSubtitle.setText(source);
                }
                if (tvSourceSubtitle != null) {
                    tvSourceSubtitle.setTextColor(0xFF80D8FF);
                    tvSourceSubtitle.setText(getString(R.string.overlay_subtitles_translating));
                    FloatingOverlayStyleHelper.setViewVisible(tvSourceSubtitle, true);
                }
            } else {
                String singleText = hasTarget ? target : source;
                if (tvTargetSubtitle != null) {
                    tvTargetSubtitle.setTextColor(sCustomTargetColor != null ? sCustomTargetColor : 0xFFFFFFFF);
                    tvTargetSubtitle.setText(singleText);
                }
                if (tvSourceSubtitle != null) {
                    tvSourceSubtitle.setText("");
                    FloatingOverlayStyleHelper.setViewVisible(tvSourceSubtitle, false);
                }
            }
            FloatingOverlayStyleHelper.setViewVisible(aiFallbackLayout, false);
        } else {
            if (tvTargetSubtitle != null) {
                tvTargetSubtitle.setTextColor(0xFF9E9E9E);
                tvTargetSubtitle.setText(getString(isPlaying ? R.string.overlay_waiting_speech : R.string.overlay_paused));
            }
            if (tvSourceSubtitle != null) {
                tvSourceSubtitle.setText("");
                FloatingOverlayStyleHelper.setViewVisible(tvSourceSubtitle, false);
            }
        }
    }

    private void applyCustomStyle() {
        FloatingOverlayStyleHelper.applyCustomColorsAndBackground(
                tvTargetSubtitle,
                tvSourceSubtitle,
                cardContainer,
                sCustomTargetColor,
                sCustomSourceColor,
                sShowBackground,
                sCustomBgColor,
                sCustomBgOpacity
        );
        applyScaleUi();
    }

    private void removeOverlayView() {
        if (windowManager != null && overlayView != null) {
            try {
                windowManager.removeView(overlayView);
            } catch (Exception e) {
                Log.e(TAG, "Error removing overlay view", e);
            }
            overlayView = null;
        }
    }

    // =========================================================================
    // Foreground Service & Tick Engine
    // =========================================================================

    private void startTickEngine() { mainHandler.post(tickRunnable); }
    private void stopTickEngine() { mainHandler.removeCallbacks(tickRunnable); }
    private void startForegroundServiceNotification() { FloatingOverlayNotificationHelper.startForeground(this); }
}
