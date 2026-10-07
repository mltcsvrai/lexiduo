package com.ytceviri.app.models;

import androidx.annotation.NonNull;

/**
 * Model representing a single subtitle cue for floating overlay rendering.
 */
public class SubtitleCue {
    public final long startMs;
    public final long endMs;
    @NonNull
    public final String targetText;
    @NonNull
    public final String sourceText;

    public SubtitleCue(long startMs, long endMs, String targetText, String sourceText) {
        this.startMs = startMs;
        this.endMs = endMs;
        this.targetText = targetText != null ? targetText : "";
        this.sourceText = sourceText != null ? sourceText : "";
    }

    public boolean isActive(long timeMs) {
        return timeMs >= startMs && timeMs <= endMs;
    }

    @NonNull
    @Override
    public String toString() {
        return "SubtitleCue{" +
                "startMs=" + startMs +
                ", endMs=" + endMs +
                ", targetText='" + targetText + '\'' +
                ", sourceText='" + sourceText + '\'' +
                '}';
    }
}
