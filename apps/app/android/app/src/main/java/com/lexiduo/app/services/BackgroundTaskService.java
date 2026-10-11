package com.lexiduo.app.services;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import com.lexiduo.app.MainActivity;
import com.lexiduo.app.R;

import java.util.concurrent.ConcurrentHashMap;

/**
 * Foreground service that keeps background tasks (Whisper model download, transcription, etc.)
 * alive with a low-importance persistent notification, PowerManager WakeLock, and concurrent task management.
 */
public class BackgroundTaskService extends Service {
    private static final String TAG = "BackgroundTaskService";
    private static final String CHANNEL_ID = "yt_translator_bg_channel";
    private static final int NOTIFICATION_ID = 2001;

    public static final String ACTION_START_TASK = "com.lexiduo.app.action.START_TASK";
    public static final String ACTION_UPDATE_TASK = "com.lexiduo.app.action.UPDATE_TASK";
    public static final String ACTION_FINISH_TASK = "com.lexiduo.app.action.FINISH_TASK";
    public static final String ACTION_STOP_SERVICE = "com.lexiduo.app.action.STOP_BG_SERVICE";

    public static final String EXTRA_TASK_ID = "task_id";
    public static final String EXTRA_TASK_TITLE = "task_title";
    public static final String EXTRA_TASK_MESSAGE = "task_message";
    public static final String EXTRA_TASK_PROGRESS = "task_progress";

    private static volatile BackgroundTaskService sInstance = null;
    private static final ConcurrentHashMap<String, TaskInfo> activeTasks = new ConcurrentHashMap<>();

    public interface TerminationListener {
        void onTasksTerminated();
    }
    private static volatile TerminationListener sTerminationListener = null;

    public static void setTerminationListener(TerminationListener listener) {
        sTerminationListener = listener;
    }

    private PowerManager.WakeLock wakeLock;
    private boolean isForegroundStarted = false;

    /**
     * Information model for a managed background task.
     */
    public static class TaskInfo {
        public final String id;
        public String title;
        public String message;
        public int progress; // 0..100 or -1 for indeterminate
        public long timestamp;

        public TaskInfo(String id, String title, String message, int progress) {
            this.id = id;
            this.title = (title != null && !title.trim().isEmpty()) ? title : "Lexiduo";
            this.message = (message != null) ? message : "";
            this.progress = progress;
            this.timestamp = System.currentTimeMillis();
        }
    }

    // =========================================================================
    // Static API for Task Operations
    // =========================================================================

    /**
     * Starts or updates a task and ensures the foreground service is active.
     */
    public static void startTask(Context ctx, String id, String title, String message, int progress) {
        if (ctx == null || id == null || id.trim().isEmpty()) {
            Log.w(TAG, "startTask called with invalid arguments");
            return;
        }

        TaskInfo existing = activeTasks.get(id);
        if (existing == null) {
            activeTasks.put(id, new TaskInfo(id, title, message, progress));
        } else {
            existing.title = (title != null && !title.trim().isEmpty()) ? title : existing.title;
            existing.message = (message != null) ? message : existing.message;
            existing.progress = progress;
            existing.timestamp = System.currentTimeMillis();
        }

        Intent intent = new Intent(ctx, BackgroundTaskService.class);
        intent.setAction(ACTION_START_TASK);
        intent.putExtra(EXTRA_TASK_ID, id);
        intent.putExtra(EXTRA_TASK_TITLE, title);
        intent.putExtra(EXTRA_TASK_MESSAGE, message);
        intent.putExtra(EXTRA_TASK_PROGRESS, progress);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ContextCompat.startForegroundService(ctx, intent);
        } else {
            ctx.startService(intent);
        }

        BackgroundTaskService instance = sInstance;
        if (instance != null) {
            instance.acquireWakeLock();
            instance.updateNotification();
        }
    }

    /**
     * Updates notification text and progress for an existing task.
     */
    public static void updateTask(Context ctx, String id, String message, int progress) {
        if (id == null || id.trim().isEmpty()) return;

        TaskInfo existing = activeTasks.get(id);
        if (existing != null) {
            existing.message = (message != null) ? message : existing.message;
            existing.progress = progress;
            existing.timestamp = System.currentTimeMillis();
        }

        BackgroundTaskService instance = sInstance;
        if (instance != null) {
            instance.updateNotification();
        } else if (ctx != null && !activeTasks.isEmpty()) {
            Intent intent = new Intent(ctx, BackgroundTaskService.class);
            intent.setAction(ACTION_UPDATE_TASK);
            intent.putExtra(EXTRA_TASK_ID, id);
            intent.putExtra(EXTRA_TASK_MESSAGE, message);
            intent.putExtra(EXTRA_TASK_PROGRESS, progress);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ContextCompat.startForegroundService(ctx, intent);
            } else {
                ctx.startService(intent);
            }
        }
    }

    /**
     * Finishes a task. If all tasks are completed, stops the foreground notification and service.
     */
    public static void finishTask(Context ctx, String id) {
        if (id == null) return;
        activeTasks.remove(id);

        BackgroundTaskService instance = sInstance;
        if (instance != null) {
            if (activeTasks.isEmpty()) {
                instance.stopForegroundAndSelf();
            } else {
                instance.updateNotification();
            }
        } else if (activeTasks.isEmpty() && ctx != null) {
            try {
                ctx.stopService(new Intent(ctx, BackgroundTaskService.class));
            } catch (Exception ignored) {}
        }
    }

    /**
     * Checks if a specific task ID is currently registered and running.
     */
    public static boolean isTaskRunning(String id) {
        return id != null && activeTasks.containsKey(id);
    }

    /**
     * Returns the count of currently active background tasks.
     */
    public static int getActiveTaskCount() {
        return activeTasks.size();
    }

    // =========================================================================
    // Lifecycle Methods
    // =========================================================================

    @Override
    public void onCreate() {
        super.onCreate();
        sInstance = this;
        createNotificationChannel();
        acquireWakeLock();
        startForegroundServiceInternal();
        isForegroundStarted = true;
        Log.i(TAG, "BackgroundTaskService created and foreground started.");
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            String action = intent.getAction();
            if (ACTION_STOP_SERVICE.equals(action)) {
                activeTasks.clear();
                stopForegroundAndSelf();
                return START_NOT_STICKY;
            }
        }

        if (activeTasks.isEmpty()) {
            stopForegroundAndSelf();
            return START_NOT_STICKY;
        }

        acquireWakeLock();
        updateNotification();
        return START_NOT_STICKY;
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        super.onTaskRemoved(rootIntent);
        Log.i(TAG, "App task removed from recent apps. Terminating background operations and releasing resources.");
        activeTasks.clear();
        stopForegroundAndSelf();
        if (sTerminationListener != null) {
            try {
                sTerminationListener.onTasksTerminated();
            } catch (Exception e) {
                Log.w(TAG, "Error invoking termination listener", e);
            }
        }
        // Force clean kill so no lingering native ONNX threads or memory blocks reopening
        android.os.Process.killProcess(android.os.Process.myPid());
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        activeTasks.clear();
        releaseWakeLock();
        if (sTerminationListener != null) {
            try {
                sTerminationListener.onTasksTerminated();
            } catch (Exception ignored) {}
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE);
        } else {
            stopForeground(true);
        }
        sInstance = null;
        isForegroundStarted = false;
        Log.i(TAG, "BackgroundTaskService destroyed.");
    }

    // =========================================================================
    // WakeLock & Foreground Notification Management
    // =========================================================================

    private synchronized void acquireWakeLock() {
        try {
            if (wakeLock == null) {
                PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                if (pm != null) {
                    wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Lexiduo:BackgroundTaskLock");
                    wakeLock.setReferenceCounted(false);
                }
            }
            if (wakeLock != null) {
                // Acquire with a 5-minute watchdog timeout per task step
                wakeLock.acquire(5 * 60 * 1000L);
                Log.d(TAG, "WakeLock acquired/refreshed with 5-minute watchdog timeout.");
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to acquire WakeLock", e);
        }
    }

    private synchronized void releaseWakeLock() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) {
                wakeLock.release();
                Log.d(TAG, "WakeLock safely released.");
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to release WakeLock", e);
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                NotificationChannel channel = new NotificationChannel(
                        CHANNEL_ID,
                        "Background Operations",
                        NotificationManager.IMPORTANCE_LOW
                );
                channel.setDescription("Background tasks and operations");
                channel.setShowBadge(false);
                channel.enableLights(false);
                channel.enableVibration(false);
                channel.setSound(null, null);
                nm.createNotificationChannel(channel);
            }
        }
    }

    private void startForegroundServiceInternal() {
        Notification notification = buildNotification();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private void updateNotification() {
        if (!isForegroundStarted) {
            startForegroundServiceInternal();
            isForegroundStarted = true;
            return;
        }

        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.notify(NOTIFICATION_ID, buildNotification());
        }
    }

    private Notification buildNotification() {
        Intent appIntent = new Intent(this, MainActivity.class);
        appIntent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            pendingFlags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pendingIntent = PendingIntent.getActivity(this, 0, appIntent, pendingFlags);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentIntent(pendingIntent)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setCategory(NotificationCompat.CATEGORY_SERVICE);

        int count = activeTasks.size();
        if (count == 0) {
            builder.setContentTitle("Lexiduo")
                    .setContentText("İşlemler tamamlandı")
                    .setProgress(0, 0, false);
        } else if (count == 1) {
            TaskInfo task = activeTasks.values().iterator().next();
            builder.setContentTitle(task.title != null && !task.title.isEmpty() ? task.title : "Lexiduo");
            builder.setContentText(task.message != null ? task.message : "");
            if (task.progress >= 0 && task.progress <= 100) {
                builder.setProgress(100, task.progress, false);
            } else {
                builder.setProgress(0, 0, true);
            }
        } else {
            // Find the most recently active/updated task
            TaskInfo latest = null;
            for (TaskInfo t : activeTasks.values()) {
                if (latest == null || t.timestamp > latest.timestamp) {
                    latest = t;
                }
            }
            builder.setContentTitle("Lexiduo (" + count + " aktif işlem)");
            if (latest != null) {
                String summary = latest.title + ": " + latest.message;
                builder.setContentText(summary);
                if (latest.progress >= 0 && latest.progress <= 100) {
                    builder.setProgress(100, latest.progress, false);
                } else {
                    builder.setProgress(0, 0, true);
                }
            }
        }

        return builder.build();
    }

    private void stopForegroundAndSelf() {
        Log.i(TAG, "All background tasks completed. Stopping foreground service.");
        releaseWakeLock();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE);
        } else {
            stopForeground(true);
        }
        stopSelf();
    }
}
