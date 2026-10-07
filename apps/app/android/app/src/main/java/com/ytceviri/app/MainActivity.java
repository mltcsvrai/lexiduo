package com.ytceviri.app;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.ytceviri.app.plugins.BackgroundTaskPlugin;
import com.ytceviri.app.plugins.FloatingSubtitlePlugin;
import com.ytceviri.app.plugins.NativeWhisperPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FloatingSubtitlePlugin.class);
        registerPlugin(BackgroundTaskPlugin.class);
        registerPlugin(NativeWhisperPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
    }
}
