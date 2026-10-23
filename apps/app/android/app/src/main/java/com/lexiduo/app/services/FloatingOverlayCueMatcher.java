package com.lexiduo.app.services;

import androidx.annotation.Nullable;
import com.lexiduo.app.models.SubtitleCue;
import java.util.List;

/**
 * High-performance binary search cue matcher with 100ms precision,
 * overlap tolerance, and natural pause hold support.
 */
public final class FloatingOverlayCueMatcher {
    public static final long EARLY_LEAD_MS = 100L;

    private FloatingOverlayCueMatcher() {}

    @Nullable
    public static SubtitleCue findMatchingCue(List<SubtitleCue> cuesList, long timeMs) {
        if (cuesList == null || cuesList.isEmpty()) return null;

        int size = cuesList.size();
        int low = 0;
        int high = size - 1;
        int floorIndex = -1;
        long effectiveSearchTime = timeMs + EARLY_LEAD_MS;

        // Find the cue with the latest startMs <= effectiveSearchTime
        while (low <= high) {
            int mid = (low + high) >>> 1;
            SubtitleCue cue = cuesList.get(mid);
            if (cue.startMs <= effectiveSearchTime) {
                floorIndex = mid;
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }

        // 1. Playback before first cue has reached early lead window: no cue yet
        if (floorIndex == -1) {
            return null;
        }

        // 2. Active cue: taking 100ms early lead-in into account
        SubtitleCue floorCue = cuesList.get(floorIndex);
        if (timeMs + EARLY_LEAD_MS >= floorCue.startMs && timeMs <= floorCue.endMs) {
            return floorCue;
        }

        boolean nextNotStarted = (floorIndex >= size - 1) || (effectiveSearchTime < cuesList.get(floorIndex + 1).startMs);
        if (nextNotStarted && timeMs <= floorCue.endMs + 400L) {
            return floorCue;
        }

        // Check recent overlapping cues
        int checkBack = Math.max(0, floorIndex - 5);
        for (int i = floorIndex - 1; i >= checkBack; i--) {
            SubtitleCue prev = cuesList.get(i);
            if (timeMs + EARLY_LEAD_MS >= prev.startMs && timeMs <= prev.endMs) {
                return prev;
            }
        }
        return null;
    }
}
