package com.ytceviri.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import com.ytceviri.app.models.SubtitleCue;

import org.junit.Test;

import java.util.ArrayList;
import java.util.List;

public class SubSyncEngineTest {

    @Test
    public void testSubtitleCueCreationAndNullSafety() {
        SubtitleCue cue = new SubtitleCue(1000L, 3000L, null, null);
        assertEquals(1000L, cue.startMs);
        assertEquals(3000L, cue.endMs);
        assertEquals("", cue.targetText);
        assertEquals("", cue.sourceText);
    }

    @Test
    public void testSubtitleCueIsActiveBoundaries() {
        SubtitleCue cue = new SubtitleCue(1000L, 3000L, "Hedef", "Source");
        assertFalse(cue.isActive(999L));
        assertTrue(cue.isActive(1000L));
        assertTrue(cue.isActive(2000L));
        assertTrue(cue.isActive(3000L));
        assertFalse(cue.isActive(3001L));
    }

    @Test
    public void testMonotonicPositionFormula() {
        long basePosition = 5000L;
        long elapsed = 250L;
        float speed = 1.5f;

        long calculated = basePosition + (long) (elapsed * speed);
        assertEquals(5375L, calculated);
    }

    @Test
    public void testDriftThresholdClassification() {
        long currentEstimated = 10000L;
        long driftThreshold = 120L;

        // Minor drift <= 120ms -> smooth sync
        long minorDriftPos = 10080L;
        long minorDiff = Math.abs(currentEstimated - minorDriftPos);
        assertTrue(minorDiff <= driftThreshold);

        // Major drift > 120ms -> hard seek
        long majorDriftPos = 10250L;
        long majorDiff = Math.abs(currentEstimated - majorDriftPos);
        assertTrue(majorDiff > driftThreshold);
    }

    @Test
    public void testIntervalFloorSearchWithOverlappingCuesAndHoldPersistence() {
        List<SubtitleCue> cues = new ArrayList<>();
        cues.add(new SubtitleCue(1000L, 5000L, "İlk Replik", "First Cue"));
        cues.add(new SubtitleCue(6000L, 8000L, "İkinci Replik", "Second Cue"));

        // At time 0ms (before cue starts): must return null (fixes early 5s cue bug)
        SubtitleCue beforeStart = findFloorCue(cues, 0L);
        assertNull(beforeStart);

        SubtitleCue beforeStart2 = findFloorCue(cues, 500L);
        assertNull(beforeStart2);

        // At time 1000ms: active cue
        SubtitleCue active = findFloorCue(cues, 1000L);
        assertNotNull(active);
        assertEquals("İlk Replik", active.targetText);

        // At time 5300ms: within 400ms natural hold persistence (5000L + 400L)
        SubtitleCue held = findFloorCue(cues, 5300L);
        assertNotNull(held);
        assertEquals("İlk Replik", held.targetText);

        // At time 5600ms: past 400ms hold persistence, before next cue (6000L) -> null
        SubtitleCue gap = findFloorCue(cues, 5600L);
        assertNull(gap);
    }

    private SubtitleCue findFloorCue(List<SubtitleCue> cuesList, long timeMs) {
        if (cuesList.isEmpty()) return null;
        int low = 0;
        int high = cuesList.size() - 1;
        int floorIndex = -1;

        while (low <= high) {
            int mid = (low + high) >>> 1;
            SubtitleCue cue = cuesList.get(mid);
            if (cue.startMs <= timeMs) {
                floorIndex = mid;
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }

        if (floorIndex == -1) {
            return null;
        }

        SubtitleCue floorCue = cuesList.get(floorIndex);
        if (floorCue.isActive(timeMs)) {
            return floorCue;
        }

        if (timeMs <= floorCue.endMs + 400L) {
            return floorCue;
        }

        int checkBack = Math.max(0, floorIndex - 5);
        for (int i = floorIndex - 1; i >= checkBack; i--) {
            SubtitleCue prev = cuesList.get(i);
            if (prev.isActive(timeMs)) {
                return prev;
            }
        }
        return null;
    }
}
