package com.lexiduo.app.services;

import android.animation.ValueAnimator;
import android.os.Build;
import android.os.SystemClock;
import android.util.DisplayMetrics;
import android.view.MotionEvent;
import android.view.ScaleGestureDetector;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.WindowManager;
import android.view.animation.DecelerateInterpolator;

/**
 * Handles smooth dragging, multi-touch pointer resolution (ACTION_POINTER_UP fix),
 * VSYNC-aligned layout updates, tap-to-expand detection, and edge snapping for floating overlay card and bubble.
 */
public class OverlayTouchHandler {
    private final View overlayView;
    private final WindowManager.LayoutParams windowParams;
    private final WindowManager windowManager;
    private final OnScaleListener scaleListener;
    private OnTapListener tapListener;

    private int initialX, initialY;
    private float initialTouchX, initialTouchY;
    private float downRawX, downRawY;
    private long downTimeMs;
    private boolean isDragging = false;
    private int activePointerId = MotionEvent.INVALID_POINTER_ID;
    private boolean isLayoutUpdatePending = false;
    private boolean isBubbleMode = false;

    public interface OnScaleListener {
        void onScale(float scaleFactor);
    }

    public interface OnTapListener {
        void onTap();
    }

    public OverlayTouchHandler(
            View overlayView,
            WindowManager.LayoutParams windowParams,
            WindowManager windowManager,
            OnScaleListener scaleListener
    ) {
        this.overlayView = overlayView;
        this.windowParams = windowParams;
        this.windowManager = windowManager;
        this.scaleListener = scaleListener;
    }

    public void setBubbleMode(boolean bubbleMode) {
        this.isBubbleMode = bubbleMode;
    }

    public void setupDragAndScale(View... dragViews) {
        ScaleGestureDetector scaleDetector = new ScaleGestureDetector(
                overlayView.getContext(),
                new ScaleGestureDetector.SimpleOnScaleGestureListener() {
                    @Override
                    public boolean onScaleBegin(ScaleGestureDetector detector) {
                        isDragging = false;
                        return true;
                    }

                    @Override
                    public boolean onScale(ScaleGestureDetector detector) {
                        if (!isBubbleMode && scaleListener != null) {
                            scaleListener.onScale(detector.getScaleFactor());
                            return true;
                        }
                        return false;
                    }

                    @Override
                    public void onScaleEnd(ScaleGestureDetector detector) {
                        isDragging = false;
                        initialX = windowParams.x;
                        initialY = windowParams.y;
                    }
                }
        );

        int touchSlop = ViewConfiguration.get(overlayView.getContext()).getScaledTouchSlop();

        View.OnTouchListener touchListener = (v, event) -> {
            scaleDetector.onTouchEvent(event);
            if (scaleDetector.isInProgress()) return true;

            int actionMasked = event.getActionMasked();
            switch (actionMasked) {
                case MotionEvent.ACTION_DOWN: {
                    activePointerId = event.getPointerId(0);
                    initialX = windowParams.x;
                    initialY = windowParams.y;
                    float rawX = getPointerRawX(event, 0, v);
                    float rawY = getPointerRawY(event, 0, v);
                    initialTouchX = rawX;
                    initialTouchY = rawY;
                    downRawX = rawX;
                    downRawY = rawY;
                    downTimeMs = SystemClock.uptimeMillis();
                    isDragging = false;
                    return true;
                }

                case MotionEvent.ACTION_MOVE: {
                    if (activePointerId == MotionEvent.INVALID_POINTER_ID) {
                        return false;
                    }
                    int pointerIndex = event.findPointerIndex(activePointerId);
                    if (pointerIndex < 0) {
                        return false;
                    }

                    float currentRawX = getPointerRawX(event, pointerIndex, v);
                    float currentRawY = getPointerRawY(event, pointerIndex, v);

                    float dx = currentRawX - downRawX;
                    float dy = currentRawY - downRawY;
                    if (!isDragging && Math.hypot(dx, dy) > touchSlop) {
                        isDragging = true;
                    }

                    if (isDragging) {
                        int newX = initialX + (int) (currentRawX - initialTouchX);
                        int newY = initialY + (int) (currentRawY - initialTouchY);

                        windowParams.x = newX;
                        windowParams.y = newY;
                        clampWindowPosition(overlayView.getResources().getDisplayMetrics());
                        scheduleVsyncUpdate();
                    }
                    return true;
                }

                case MotionEvent.ACTION_POINTER_UP: {
                    int pointerIndex = event.getActionIndex();
                    int pointerId = event.getPointerId(pointerIndex);
                    if (pointerId == activePointerId) {
                        // Re-anchor to the remaining active pointer with true screen coordinates
                        int newPointerIndex = (pointerIndex == 0) ? 1 : 0;
                        if (newPointerIndex < event.getPointerCount()) {
                            activePointerId = event.getPointerId(newPointerIndex);
                            initialTouchX = getPointerRawX(event, newPointerIndex, v);
                            initialTouchY = getPointerRawY(event, newPointerIndex, v);
                            initialX = windowParams.x;
                            initialY = windowParams.y;
                        }
                    }
                    return true;
                }

                case MotionEvent.ACTION_CANCEL:
                case MotionEvent.ACTION_UP: {
                    int pointerIndex = (activePointerId != MotionEvent.INVALID_POINTER_ID)
                            ? event.findPointerIndex(activePointerId)
                            : 0;
                    float upX = (pointerIndex >= 0 && pointerIndex < event.getPointerCount())
                            ? getPointerRawX(event, pointerIndex, v)
                            : downRawX;
                    float upY = (pointerIndex >= 0 && pointerIndex < event.getPointerCount())
                            ? getPointerRawY(event, pointerIndex, v)
                            : downRawY;
                    long upDuration = SystemClock.uptimeMillis() - downTimeMs;
                    boolean isTap = !isDragging && Math.hypot(upX - downRawX, upY - downRawY) <= touchSlop && upDuration < 400;

                    activePointerId = MotionEvent.INVALID_POINTER_ID;
                    isDragging = false;

                    if (isTap) {
                        if (isBubbleMode && tapListener != null) {
                            tapListener.onTap();
                            return true;
                        }
                        v.performClick();
                        return true;
                    }

                    DisplayMetrics metrics = overlayView.getResources().getDisplayMetrics();
                    clampWindowPosition(metrics);
                    snapToEdgeIfNeeded(metrics);
                    scheduleVsyncUpdate();
                    return true;
                }
            }
            return false;
        };

        for (View view : dragViews) {
            if (view != null) {
                view.setOnTouchListener(touchListener);
            }
        }
    }

    public void setupBubbleTap(View bubbleView, OnTapListener tapListener) {
        this.tapListener = tapListener;
        if (bubbleView == null) return;
        bubbleView.setOnClickListener(v -> {
            if (this.tapListener != null) {
                this.tapListener.onTap();
            }
        });
    }

    private float getPointerRawX(MotionEvent event, int pointerIndex, View v) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            return event.getRawX(pointerIndex);
        }
        int[] loc = new int[2];
        v.getLocationOnScreen(loc);
        return event.getX(pointerIndex) + loc[0];
    }

    private float getPointerRawY(MotionEvent event, int pointerIndex, View v) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            return event.getRawY(pointerIndex);
        }
        int[] loc = new int[2];
        v.getLocationOnScreen(loc);
        return event.getY(pointerIndex) + loc[1];
    }

    private void scheduleVsyncUpdate() {
        if (isLayoutUpdatePending || overlayView == null) return;
        isLayoutUpdatePending = true;
        overlayView.postOnAnimation(() -> {
            isLayoutUpdatePending = false;
            try {
                if (windowManager != null && overlayView != null && overlayView.isAttachedToWindow()) {
                    windowManager.updateViewLayout(overlayView, windowParams);
                }
            } catch (Exception ignored) {}
        });
    }

    public void clampWindowPosition(DisplayMetrics metrics) {
        if (metrics == null || windowParams == null) return;
        int screenWidth = metrics.widthPixels;
        int screenHeight = metrics.heightPixels;

        // In card mode, allow user to freely drag across screen with margin
        int minVisibleMargin = isBubbleMode ? 0 : dpToPx(56);
        int minX = isBubbleMode ? 0 : -windowParams.width + minVisibleMargin;
        int maxX = isBubbleMode ? Math.max(0, screenWidth - windowParams.width) : (screenWidth - minVisibleMargin);

        if (windowParams.x < minX) windowParams.x = minX;
        if (windowParams.x > maxX) windowParams.x = maxX;

        int minY = dpToPx(30);
        int maxY = Math.max(minY, screenHeight - dpToPx(80));
        if (windowParams.y < minY) windowParams.y = minY;
        if (windowParams.y > maxY) windowParams.y = maxY;
    }

    private void snapToEdgeIfNeeded(DisplayMetrics metrics) {
        if (metrics == null || windowParams == null) return;
        int screenWidth = metrics.widthPixels;
        int maxX = Math.max(0, screenWidth - windowParams.width);

        // In bubble mode, snap smoothly to closest left or right edge
        if (isBubbleMode) {
            int targetX = (windowParams.x + windowParams.width / 2 < screenWidth / 2) ? dpToPx(12) : (maxX - dpToPx(12));
            animateToX(targetX);
        } else {
            // In card mode, if dragged partially offscreen, snap back into view
            if (windowParams.x < 0) {
                animateToX(dpToPx(8));
            } else if (windowParams.x > maxX) {
                animateToX(Math.max(0, maxX - dpToPx(8)));
            } else {
                // Subtle edge snapping within 24dp threshold
                int snapThreshold = dpToPx(24);
                if (windowParams.x < snapThreshold) {
                    animateToX(dpToPx(8));
                } else if (windowParams.x > maxX - snapThreshold) {
                    animateToX(Math.max(0, maxX - dpToPx(8)));
                }
            }
        }
    }

    private void animateToX(int targetX) {
        if (windowParams == null || windowManager == null || overlayView == null) return;
        int startX = windowParams.x;
        if (startX == targetX) return;

        ValueAnimator animator = ValueAnimator.ofInt(startX, targetX);
        animator.setDuration(220);
        animator.setInterpolator(new DecelerateInterpolator());
        animator.addUpdateListener(animation -> {
            windowParams.x = (int) animation.getAnimatedValue();
            try {
                if (windowManager != null && overlayView != null && overlayView.isAttachedToWindow()) {
                    windowManager.updateViewLayout(overlayView, windowParams);
                }
            } catch (Exception ignored) {}
        });
        animator.start();
    }

    private int dpToPx(int dp) {
        if (overlayView == null) return dp;
        return Math.round(dp * overlayView.getResources().getDisplayMetrics().density);
    }
}
