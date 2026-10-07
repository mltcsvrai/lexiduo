package com.ytceviri.app.services;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * Lightweight helper to persist and read floating overlay user preferences:
 * font/card scale, window transparency (alpha), and theme style.
 */
public final class FloatingOverlayPreferences {
    private static final String PREF_NAME = "yt_floating_overlay_prefs";

    public static final String KEY_SCALE = "overlay_scale";
    public static final String KEY_ALPHA = "overlay_alpha";
    public static final String KEY_THEME = "overlay_theme";

    public static final float DEFAULT_SCALE = 1.0f;
    public static final float MIN_SCALE = 0.6f;
    public static final float MAX_SCALE = 2.0f;

    public static final float DEFAULT_ALPHA = 1.0f;
    public static final String DEFAULT_THEME = "default";

    private FloatingOverlayPreferences() {
        // Utility class
    }

    private static SharedPreferences getPrefs(Context context) {
        return context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
    }

    public static float getScale(Context context) {
        if (context == null) return DEFAULT_SCALE;
        float scale = getPrefs(context).getFloat(KEY_SCALE, DEFAULT_SCALE);
        return clampScale(scale);
    }

    public static void setScale(Context context, float scale) {
        if (context == null) return;
        float clamped = clampScale(scale);
        getPrefs(context).edit().putFloat(KEY_SCALE, clamped).apply();
    }

    public static float clampScale(float scale) {
        if (scale < MIN_SCALE) return MIN_SCALE;
        if (scale > MAX_SCALE) return MAX_SCALE;
        return scale;
    }

    public static float getAlpha(Context context) {
        if (context == null) return DEFAULT_ALPHA;
        return getPrefs(context).getFloat(KEY_ALPHA, DEFAULT_ALPHA);
    }

    public static void setAlpha(Context context, float alpha) {
        if (context == null) return;
        float clamped = Math.max(0.2f, Math.min(1.0f, alpha));
        getPrefs(context).edit().putFloat(KEY_ALPHA, clamped).apply();
    }

    /**
     * Cycles alpha between 1.0f (100%), 0.75f (75%), and 0.50f (50%).
     */
    public static float cycleAlpha(Context context) {
        float current = getAlpha(context);
        float next;
        if (current >= 0.95f) {
            next = 0.75f;
        } else if (current >= 0.70f) {
            next = 0.50f;
        } else {
            next = 1.0f;
        }
        setAlpha(context, next);
        return next;
    }

    public static String getTheme(Context context) {
        if (context == null) return DEFAULT_THEME;
        return getPrefs(context).getString(KEY_THEME, DEFAULT_THEME);
    }

    public static void setTheme(Context context, String theme) {
        if (context == null) return;
        getPrefs(context).edit().putString(KEY_THEME, theme != null ? theme : DEFAULT_THEME).apply();
    }
}
