package com.lexiduo.app;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.lexiduo.app.plugins.BackgroundTaskPlugin;
import com.lexiduo.app.plugins.FloatingSubtitlePlugin;
import com.lexiduo.app.plugins.MediaDownloadPlugin;
import com.lexiduo.app.plugins.NativeWhisperPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FloatingSubtitlePlugin.class);
        registerPlugin(BackgroundTaskPlugin.class);
        registerPlugin(NativeWhisperPlugin.class);
        registerPlugin(MediaDownloadPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
    }

    @Override
    public void onResume() {
        super.onResume();
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().onResume();
            bridge.getWebView().resumeTimers();
            bridge.getWebView().invalidate();
            bridge.getWebView().requestLayout();
        }
    }

    @Override
    public void onPause() {
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().onPause();
            bridge.getWebView().pauseTimers();
        }
        super.onPause();
    }
}
