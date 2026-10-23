package com.lexiduo.app.plugins;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.Log;

import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.lexiduo.app.models.SubtitleCue;
import com.lexiduo.app.services.AutoYouTubeDetector;
import com.lexiduo.app.services.FloatingOverlayService;
import com.lexiduo.app.services.YouTubeAccessibilityScanner;
import com.lexiduo.app.services.YouTubeNotificationListenerService;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Capacitor plugin bridging web frontends with native Android floating overlay,
 * media session playback synchronization, and accessibility ad scanner.
 */
@CapacitorPlugin(name = "FloatingSubtitle")
public class FloatingSubtitlePlugin extends Plugin {
    private static final String TAG = "FloatingSubtitlePlugin";
    private static volatile FloatingSubtitlePlugin sInstance = null;

    @Override
    public void load() {
        super.load();
        sInstance = this;
        Context ctx = getContext();
        AutoYouTubeDetector detector = AutoYouTubeDetector.getInstance();
        detector.setContext(ctx);
        detector.addListener((title, artist, videoId, sourceLang, targetLang) -> {
            JSObject data = new JSObject();
            data.put("title", title);
            data.put("artist", artist);
            data.put("videoId", videoId != null ? videoId : "");
            data.put("sourceLang", sourceLang);
            data.put("targetLang", targetLang);
            notifyListeners("onYouTubeVideoDetected", data, true);
            notifyListeners("autoAssistantVideoDetected", data, true);
        });
    }

    public static void notifyAssistantStopped() {
        FloatingSubtitlePlugin plugin = sInstance;
        if (plugin != null) {
            JSObject data = new JSObject();
            data.put("active", false);
            data.put("enabled", false);
            data.put("stopped", true);
            plugin.notifyListeners("onAutoAssistantStopped", data);
            plugin.notifyListeners("autoAssistantStatusChanged", data);
        }
    }

    @PluginMethod
    public void checkPermissions(PluginCall call) {
        Context ctx = getContext();
        boolean overlayGranted = Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(ctx);

        // Check Notification Listener Access via ComponentName string
        boolean notificationGranted = false;
        ComponentName notifCn = new ComponentName(ctx, YouTubeNotificationListenerService.class);
        String flatListeners = Settings.Secure.getString(ctx.getContentResolver(), "enabled_notification_listeners");
        if (flatListeners != null && (flatListeners.contains(notifCn.flattenToString()) || flatListeners.contains(notifCn.flattenToShortString()))) {
            notificationGranted = true;
        }

        // Check Accessibility Access via ComponentName string
        boolean accessibilityGranted = false;
        ComponentName a11yCn = new ComponentName(ctx, YouTubeAccessibilityScanner.class);
        String flatA11y = Settings.Secure.getString(ctx.getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        if (flatA11y != null && (flatA11y.contains(a11yCn.flattenToString()) || flatA11y.contains(a11yCn.flattenToShortString()))) {
            accessibilityGranted = true;
        }

        // Check POST_NOTIFICATIONS permission (Android 13+ / API 33+)
        boolean postNotificationsGranted = Build.VERSION.SDK_INT < 33 || NotificationManagerCompat.from(ctx).areNotificationsEnabled();

        // Check Battery Optimization status
        boolean batteryOptimizationIgnored = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
            batteryOptimizationIgnored = pm != null && pm.isIgnoringBatteryOptimizations(ctx.getPackageName());
        }

        JSObject ret = new JSObject();
        ret.put("overlay", overlayGranted);
        ret.put("notification", notificationGranted);
        ret.put("accessibility", accessibilityGranted);
        ret.put("postNotifications", postNotificationsGranted);
        ret.put("batteryOptimization", batteryOptimizationIgnored);
        ret.put("allGranted", overlayGranted && notificationGranted && accessibilityGranted && postNotificationsGranted && batteryOptimizationIgnored);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestOverlayPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                Intent intent = new Intent(
                        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                        Uri.parse("package:" + getContext().getPackageName())
                );
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
            } catch (Exception e) {
                // Fallback for OEM ROMs (MIUI, EMUI) that disallow package URI scheme
                try {
                    Intent fallback = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION);
                    fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    getContext().startActivity(fallback);
                } catch (Exception ex) {
                    call.reject("Cannot open overlay settings: " + ex.getMessage());
                    return;
                }
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void requestNotificationAccess(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Cannot open notification settings: " + e.getMessage());
        }
    }

    @PluginMethod
    public void requestAccessibility(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Cannot open accessibility settings: " + e.getMessage());
        }
    }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        try {
            Context ctx = getContext();
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(Uri.parse("package:" + ctx.getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Cannot open app settings: " + e.getMessage());
        }
    }

    @PluginMethod
    public void requestBatteryOptimization(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Context ctx = getContext();
            try {
                Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                intent.setData(Uri.parse("package:" + ctx.getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(intent);
            } catch (Exception e) {
                try {
                    Intent fallback = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                    fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    ctx.startActivity(fallback);
                } catch (Exception ex) {
                    call.reject("Cannot open battery optimization settings: " + ex.getMessage());
                    return;
                }
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33) {
            Context ctx = getContext();
            try {
                Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                intent.putExtra(Settings.EXTRA_APP_PACKAGE, ctx.getPackageName());
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(intent);
            } catch (Exception e) {
                openAppSettings(call);
                return;
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void startOverlay(PluginCall call) {
        Context ctx = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(ctx)) {
            call.reject("SYSTEM_ALERT_WINDOW permission is required to display floating overlay.");
            return;
        }

        String videoId = call.getString("videoId");

        // Cache cues into pending memory FIRST to avoid race conditions on service startup
        JSArray cuesArray = call.getArray("cues");
        if (cuesArray != null && cuesArray.length() > 0) {
            List<SubtitleCue> cues = parseCuesArray(cuesArray);
            FloatingOverlayService.loadCues(cues, true, videoId);
        }

        AutoYouTubeDetector.getInstance().setAutoModeEnabled(true);

        FloatingOverlayService.startService(ctx);

        // Open YouTube video directly if videoId is provided (Kusur 4.4)
        if (videoId != null && !videoId.trim().isEmpty()) {
            openYouTubeVideo(videoId.trim());
        }

        JSObject ret = new JSObject();
        ret.put("started", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void openYouTube(PluginCall call) {
        String videoId = call.getString("videoId");
        if (videoId == null || videoId.trim().isEmpty()) {
            call.reject("videoId is required");
            return;
        }
        String cleanId = videoId.trim();
        if (!cleanId.matches("^[a-zA-Z0-9_-]{11}$")) {
            call.reject("Invalid videoId format");
            return;
        }
        openYouTubeVideo(cleanId);
        JSObject ret = new JSObject();
        ret.put("opened", true);
        call.resolve(ret);
    }

    private void openYouTubeVideo(String videoId) {
        if (videoId == null || !videoId.matches("^[a-zA-Z0-9_-]{11}$")) {
            Log.w(TAG, "Rejected invalid or unsafe YouTube videoId: " + videoId);
            return;
        }
        Context ctx = getContext();
        try {
            Intent appIntent = new Intent(Intent.ACTION_VIEW, Uri.parse("vnd.youtube:" + videoId));
            appIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(appIntent);
        } catch (Exception e) {
            try {
                Intent webIntent = new Intent(Intent.ACTION_VIEW, Uri.parse("https://www.youtube.com/watch?v=" + videoId));
                webIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(webIntent);
            } catch (Exception ex) {
                Log.e(TAG, "Failed to launch YouTube video: " + videoId, ex);
            }
        }
    }

    @PluginMethod
    public void stopOverlay(PluginCall call) {
        FloatingOverlayService.stopService(getContext());
        JSObject ret = new JSObject();
        ret.put("stopped", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void loadCues(PluginCall call) {
        JSArray cuesArray = call.getArray("cues");
        List<SubtitleCue> cues = parseCuesArray(cuesArray);
        FloatingOverlayService.loadCues(cues);

        JSObject ret = new JSObject();
        ret.put("count", cues.size());
        call.resolve(ret);
    }

    @PluginMethod
    public void clearCues(PluginCall call) {
        boolean force = Boolean.TRUE.equals(call.getBoolean("force", true));
        FloatingOverlayService.clearCues(force);
        JSObject ret = new JSObject();
        ret.put("cleared", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void isOverlayRunning(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("running", FloatingOverlayService.isRunning());
        call.resolve(ret);
    }

    @PluginMethod
    public void startAutoAssistant(PluginCall call) {
        Context ctx = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(ctx)) {
            call.reject("SYSTEM_ALERT_WINDOW permission is required to start Auto Assistant.");
            return;
        }

        String sourceLang = call.getString("sourceLang", "en");
        String targetLang = call.getString("targetLang", "tr");

        AutoYouTubeDetector detector = AutoYouTubeDetector.getInstance();
        detector.setContext(ctx);
        detector.setLanguages(sourceLang, targetLang);
        detector.setAutoModeEnabled(true);

        FloatingOverlayService.startService(ctx);
        FloatingOverlayService.updateLanguageBadge(sourceLang, targetLang);

        JSObject ret = new JSObject();
        ret.put("started", true);
        ret.put("enabled", true);
        ret.put("active", true);
        ret.put("sourceLang", detector.getSourceLang());
        ret.put("targetLang", detector.getTargetLang());
        call.resolve(ret);
    }

    @PluginMethod
    public void stopAutoAssistant(PluginCall call) {
        AutoYouTubeDetector.getInstance().setAutoModeEnabled(false);
        FloatingOverlayService.stopService(getContext());

        JSObject ret = new JSObject();
        ret.put("stopped", true);
        ret.put("enabled", false);
        ret.put("active", false);
        call.resolve(ret);
    }

    @PluginMethod
    public void getAutoAssistantStatus(PluginCall call) {
        AutoYouTubeDetector detector = AutoYouTubeDetector.getInstance();
        JSObject ret = new JSObject();
        ret.put("active", detector.isAutoModeEnabled());
        ret.put("enabled", detector.isAutoModeEnabled());
        ret.put("sourceLang", detector.getSourceLang());
        ret.put("targetLang", detector.getTargetLang());
        ret.put("currentTitle", detector.getCurrentVideoTitle());
        ret.put("currentArtist", detector.getCurrentVideoArtist());
        ret.put("currentVideoId", detector.getCurrentVideoId() != null ? detector.getCurrentVideoId() : "");
        ret.put("isOverlayRunning", FloatingOverlayService.isRunning());
        call.resolve(ret);
    }

    @PluginMethod
    public void updateAssistantLanguages(PluginCall call) {
        String sourceLang = call.getString("sourceLang");
        String targetLang = call.getString("targetLang");
        AutoYouTubeDetector detector = AutoYouTubeDetector.getInstance();
        detector.setLanguages(sourceLang, targetLang);

        JSObject ret = new JSObject();
        ret.put("sourceLang", detector.getSourceLang());
        ret.put("targetLang", detector.getTargetLang());
        call.resolve(ret);
    }

    @PluginMethod
    public void showAiFallback(PluginCall call) {
        boolean show = call.getBoolean("show", true);
        FloatingOverlayService.showAiFallback(show);
        JSObject ret = new JSObject();
        ret.put("shown", show);
        call.resolve(ret);
    }

    @PluginMethod
    public void updateStyle(PluginCall call) {
        String sourceColor = call.getString("sourceTextColor");
        String targetColor = call.getString("targetTextColor");
        String bgColor = call.getString("bgColor");
        Double bgOpacity = call.getDouble("bgOpacity");
        Double fontSize = call.getDouble("fontSize");
        Boolean showSubtitleBg = call.getBoolean("showSubtitleBg", true);
        String bgWidthMode = call.getString("bgWidthMode", "dynamic");
        String subtitleMode = call.getString("subtitleMode", "DUAL");
        String fontFamily = call.getString("fontFamily", "sans");
        String fontWeight = call.getString("fontWeight", "normal");
        String textOutline = call.getString("textOutline", "none");
        FloatingOverlayService.updateStyle(
                sourceColor, targetColor, bgColor, bgOpacity, fontSize,
                showSubtitleBg, bgWidthMode, subtitleMode,
                fontFamily, fontWeight, textOutline
        );
        JSObject ret = new JSObject();
        ret.put("updated", true);
        call.resolve(ret);
    }

    private List<SubtitleCue> parseCuesArray(JSArray array) {
        List<SubtitleCue> list = new ArrayList<>();
        if (array == null) return list;

        for (int i = 0; i < array.length(); i++) {
            try {
                JSONObject item = array.getJSONObject(i);

                long startMs = 0L;
                if (item.has("startMs")) {
                    startMs = item.optLong("startMs", 0L);
                } else if (item.has("start")) {
                    double startSec = item.optDouble("start", 0.0);
                    startMs = startSec > 100000.0 ? (long) startSec : Math.round(startSec * 1000.0);
                }

                long endMs = 0L;
                if (item.has("endMs")) {
                    endMs = item.optLong("endMs", 0L);
                } else if (item.has("end")) {
                    double endSec = item.optDouble("end", 0.0);
                    endMs = endSec > 100000.0 ? (long) endSec : Math.round(endSec * 1000.0);
                }

                String target = item.optString("targetText", item.optString("text", ""));
                String source = item.optString("sourceText", item.optString("source", ""));
                list.add(new SubtitleCue(startMs, endMs, target, source));
            } catch (JSONException e) {
                Log.w(TAG, "Error parsing cue at index " + i, e);
            }
        }
        return list;
    }
}
