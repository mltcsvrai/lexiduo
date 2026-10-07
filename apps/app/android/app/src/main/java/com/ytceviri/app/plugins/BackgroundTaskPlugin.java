package com.ytceviri.app.plugins;

import android.content.Context;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.ytceviri.app.services.BackgroundTaskService;

/**
 * Capacitor plugin bridging web operations (Whisper download, transcription, etc.)
 * with Android BackgroundTaskService foreground execution and WakeLock guarantees.
 */
@CapacitorPlugin(name = "BackgroundTask")
public class BackgroundTaskPlugin extends Plugin {

    @PluginMethod
    public void startTask(PluginCall call) {
        String id = call.getString("id");
        if (id == null || id.trim().isEmpty()) {
            call.reject("Task 'id' is required");
            return;
        }

        String title = call.getString("title", "YT Translator");
        String message = call.getString("message", "");
        Integer progressVal = call.getInt("progress", -1);
        int progress = (progressVal != null) ? progressVal : -1;

        Context ctx = getContext();
        BackgroundTaskService.startTask(ctx, id, title, message, progress);
        call.resolve();
    }

    @PluginMethod
    public void updateTask(PluginCall call) {
        String id = call.getString("id");
        if (id == null || id.trim().isEmpty()) {
            call.reject("Task 'id' is required");
            return;
        }

        String message = call.getString("message", "");
        Integer progressVal = call.getInt("progress", -1);
        int progress = (progressVal != null) ? progressVal : -1;

        Context ctx = getContext();
        BackgroundTaskService.updateTask(ctx, id, message, progress);
        call.resolve();
    }

    @PluginMethod
    public void finishTask(PluginCall call) {
        String id = call.getString("id");
        if (id == null || id.trim().isEmpty()) {
            call.reject("Task 'id' is required");
            return;
        }

        Context ctx = getContext();
        BackgroundTaskService.finishTask(ctx, id);
        call.resolve();
    }

    @PluginMethod
    public void isTaskRunning(PluginCall call) {
        String id = call.getString("id");
        if (id == null || id.trim().isEmpty()) {
            call.reject("Task 'id' is required");
            return;
        }

        boolean running = BackgroundTaskService.isTaskRunning(id);
        JSObject ret = new JSObject();
        ret.put("running", running);
        ret.put("isRunning", running);
        ret.put("activeCount", BackgroundTaskService.getActiveTaskCount());
        call.resolve(ret);
    }
}
