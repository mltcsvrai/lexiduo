package com.ytceviri.app.services;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.graphics.Rect;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.Looper;
import android.util.Log;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Accessibility scanner that inspects the YouTube UI in real-time using a 4-layer
 * detection strategy to freeze/resume subtitles during ad breaks.
 */
public class YouTubeAccessibilityScanner extends AccessibilityService {
    private static final String TAG = "YTAccessibilityScanner";
    private static final String YOUTUBE_PACKAGE = "com.google.android.youtube";

    private static final int MAX_DEPTH = 15;
    private static final int MAX_NODES = 250;
    private static final long UNFREEZE_DEBOUNCE_MS = 600L;

    // Layer 1: Resource ID Whitelist for YouTube Ads
    private static final Set<String> AD_RESOURCE_IDS = new HashSet<>(Arrays.asList(
            "com.google.android.youtube:id/skip_ad_button",
            "com.google.android.youtube:id/skip_ad_button_text",
            "com.google.android.youtube:id/modern_skip_ad_button",
            "com.google.android.youtube:id/ad_progress_text",
            "com.google.android.youtube:id/ad_countdown",
            "com.google.android.youtube:id/ad_badge",
            "com.google.android.youtube:id/ad_action_badge",
            "com.google.android.youtube:id/player_ad_layout",
            "com.google.android.youtube:id/ad_duration"
    ));

    // Layer 2: Regex Patterns for Text & Content Description
    private static final Pattern PATTERN_AD_HEADER =
            Pattern.compile("^(?i)(reklam|ad|advertisement|sponsored|sponsorlu)(\\s*([·•\\-:]|\\d+).*|)$");
    private static final Pattern PATTERN_AD_SKIP =
            Pattern.compile("(?i)(reklamı atla|reklamı geç|skip ad|skip ads|reklam bitince oynatılacak)");
    private static final Pattern PATTERN_AD_COUNTDOWN =
            Pattern.compile("(?i)(reklam|ad)\\s*(\\d+/\\d+|\\d+\\s*s|\\d+:\\d+)");

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private HandlerThread scannerThread;
    private Handler backgroundHandler;
    private final Runnable scanRunnable = this::performAdScan;

    private boolean isAdActive = false;
    private Runnable pendingUnfreezeRunnable = null;

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        Log.i(TAG, "YouTubeAccessibilityScanner connected.");

        scannerThread = new HandlerThread("YTAdScannerThread", android.os.Process.THREAD_PRIORITY_BACKGROUND);
        scannerThread.start();
        backgroundHandler = new Handler(scannerThread.getLooper());

        AccessibilityServiceInfo info = getServiceInfo();
        if (info == null) {
            info = new AccessibilityServiceInfo();
        }
        info.eventTypes = AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED
                | AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
                | AccessibilityEvent.TYPE_VIEW_CLICKED
                | AccessibilityEvent.TYPE_WINDOWS_CHANGED;
        info.feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC;
        info.flags = AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS
                | AccessibilityServiceInfo.FLAG_INCLUDE_NOT_IMPORTANT_VIEWS
                | AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS;
        info.packageNames = new String[]{YOUTUBE_PACKAGE};
        info.notificationTimeout = 100;
        setServiceInfo(info);
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null) return;

        CharSequence packageName = event.getPackageName();
        if (packageName == null || !YOUTUBE_PACKAGE.contentEquals(packageName)) {
            return;
        }

        if (backgroundHandler != null) {
            backgroundHandler.removeCallbacks(scanRunnable);
            backgroundHandler.postDelayed(scanRunnable, 60L);
        }
    }

    @Override
    public void onInterrupt() {
        Log.w(TAG, "YouTubeAccessibilityScanner interrupted.");
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (backgroundHandler != null) {
            backgroundHandler.removeCallbacksAndMessages(null);
        }
        if (scannerThread != null) {
            scannerThread.quitSafely();
            scannerThread = null;
        }
        if (pendingUnfreezeRunnable != null) {
            mainHandler.removeCallbacks(pendingUnfreezeRunnable);
        }
        if (isAdActive) {
            FloatingOverlayService.setAdActive(false);
            isAdActive = false;
        }
        Log.i(TAG, "YouTubeAccessibilityScanner destroyed.");
    }

    private void performAdScan() {
        AccessibilityNodeInfo rootNode = getRootInActiveWindow();
        if (rootNode == null) return;

        try {
            int[] nodeCount = new int[]{0};
            boolean adDetected = scanNodeHierarchy(rootNode, 0, nodeCount);
            mainHandler.post(() -> updateAdState(adDetected));
        } finally {
            if (Build.VERSION.SDK_INT < 34) {
                rootNode.recycle();
            }
        }
    }

    /**
     * Traverses node tree with 4-layer inspection:
     * 1. Resource ID
     * 2. Text / Regex
     * 3. Geometric bounds
     * 4. Structural sanity & recursion limits
     */
    private boolean scanNodeHierarchy(AccessibilityNodeInfo node, int depth, int[] nodeCount) {
        if (node == null || depth > MAX_DEPTH || nodeCount[0] > MAX_NODES) {
            return false;
        }
        nodeCount[0]++;

        // Check Layer 1: Resource ID
        String viewId = node.getViewIdResourceName();
        if (viewId != null) {
            // Guard against video title, channel, or comments falsely matching ads
            if (viewId.contains("title") || viewId.contains("channel") || viewId.contains("comment")) {
                return false;
            }
            if (AD_RESOURCE_IDS.contains(viewId) || viewId.endsWith("/skip_ad_button") || viewId.endsWith("/modern_skip_ad_button")) {
                if (verifyGeometry(node)) {
                    return true;
                }
            }
        }

        // Check Layer 2: Text / Content Description Regex
        CharSequence text = node.getText();
        CharSequence desc = node.getContentDescription();

        if (matchesAdPattern(text, viewId) || matchesAdPattern(desc, viewId)) {
            if (verifyGeometry(node)) {
                return true;
            }
        }

        // Layer 4: Recurse through children with node recycling
        int childCount = node.getChildCount();
        for (int i = 0; i < childCount; i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            if (child != null) {
                try {
                    if (scanNodeHierarchy(child, depth + 1, nodeCount)) {
                        return true;
                    }
                } finally {
                    if (Build.VERSION.SDK_INT < 34) {
                        child.recycle();
                    }
                }
            }
        }

        return false;
    }

    private boolean matchesAdPattern(CharSequence sequence, String viewId) {
        if (sequence == null) return false;
        String str = sequence.toString().trim();
        if (str.isEmpty()) return false;

        // Long sentences or video titles (> 40 chars) are never ad badges
        if (str.length() > 40) return false;
        if (viewId != null && (viewId.contains("title") || viewId.contains("channel") || viewId.contains("comment"))) {
            return false;
        }

        if (PATTERN_AD_SKIP.matcher(str).find() || PATTERN_AD_COUNTDOWN.matcher(str).find()) {
            return true;
        }

        // Header pattern must match short badge format (<= 25 chars)
        return str.length() <= 25 && PATTERN_AD_HEADER.matcher(str).matches();
    }

    /**
     * Layer 3: Geometry & bounds verification.
     * Ensures node is visible and within valid dimensions on screen.
     */
    private boolean verifyGeometry(AccessibilityNodeInfo node) {
        if (!node.isVisibleToUser()) {
            return false;
        }

        Rect bounds = new Rect();
        node.getBoundsInScreen(bounds);

        // Discard empty or collapsed 0x0 bounds
        if (bounds.width() <= 0 || bounds.height() <= 0) {
            return false;
        }

        // Verify valid coordinates on screen
        return bounds.left >= 0 && bounds.top >= 0;
    }

    private void updateAdState(boolean adDetected) {
        if (adDetected) {
            if (pendingUnfreezeRunnable != null) {
                mainHandler.removeCallbacks(pendingUnfreezeRunnable);
                pendingUnfreezeRunnable = null;
            }

            if (!isAdActive) {
                isAdActive = true;
                Log.i(TAG, "Ad detected -> AD_BREAK_FREEZE activated");
                FloatingOverlayService.setAdActive(true);
            }
        } else {
            if (isAdActive && pendingUnfreezeRunnable == null) {
                // Debounce unfreeze to avoid flickering during short UI rebuilds
                pendingUnfreezeRunnable = () -> {
                    isAdActive = false;
                    pendingUnfreezeRunnable = null;
                    Log.i(TAG, "Ad ended -> resuming subtitle synchronization");
                    FloatingOverlayService.setAdActive(false);
                };
                mainHandler.postDelayed(pendingUnfreezeRunnable, UNFREEZE_DEBOUNCE_MS);
            }
        }
    }
}
