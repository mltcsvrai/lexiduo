package com.ytceviri.app.services;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;

import androidx.core.app.NotificationCompat;

import com.ytceviri.app.MainActivity;
import com.ytceviri.app.R;

public class FloatingOverlayNotificationHelper {
    public static final String CHANNEL_ID = "yt_translator_overlay_channel";
    public static final int NOTIFICATION_ID = 1001;
    public static final String ACTION_STOP_SERVICE = "com.ytceviri.app.action.STOP_SERVICE";

    public static void startForeground(Service service) {
        NotificationManager notificationManager = (NotificationManager) service.getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "YT Translator Yüzen Altyazı",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("YouTube ile senkronize yüzen altyazı servisi");
            if (notificationManager != null) {
                notificationManager.createNotificationChannel(channel);
            }
        }

        Intent appIntent = new Intent(service, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                service, 0, appIntent,
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0
        );

        Intent stopIntent = new Intent(service, FloatingOverlayService.class);
        stopIntent.setAction(ACTION_STOP_SERVICE);
        PendingIntent stopPendingIntent = PendingIntent.getService(
                service, 1, stopIntent,
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                        ? PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
                        : PendingIntent.FLAG_UPDATE_CURRENT
        );

        Notification notification = new NotificationCompat.Builder(service, CHANNEL_ID)
                .setContentTitle(service.getString(R.string.overlay_notification_title))
                .setContentText(service.getString(R.string.overlay_notification_text))
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentIntent(pendingIntent)
                .setOngoing(true)
                .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Durdur", stopPendingIntent)
                .build();

        if (Build.VERSION.SDK_INT >= 34) {
            service.startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        } else {
            service.startForeground(NOTIFICATION_ID, notification);
        }
    }
}
