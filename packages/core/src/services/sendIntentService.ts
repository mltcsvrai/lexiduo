import { registerPlugin, Capacitor, type PluginListenerHandle } from '@capacitor/core';

export interface SendIntentResult {
  title?: string;
  description?: string;
  type?: string;
  url?: string;
  extras?: Record<string, any>;
}

export interface SendIntentPlugin {
  checkSendIntentReceived(): Promise<SendIntentResult>;
  addListener(
    eventName: 'appSendActionIntent',
    listenerFunc: (data: SendIntentResult) => void
  ): Promise<PluginListenerHandle> & PluginListenerHandle;
  removeAllListeners(): Promise<void>;
}

// Register native Capacitor plugin with graceful WebPlugin fallback
export const SendIntent = registerPlugin<SendIntentPlugin>('SendIntent', {
  web: () => ({
    async checkSendIntentReceived(): Promise<SendIntentResult> {
      return {};
    },
    addListener() {
      return Promise.resolve({
        remove: async () => {}
      }) as any;
    },
    async removeAllListeners(): Promise<void> {}
  })
});

/**
 * Extracts candidate text, URL, or media stream URI from SendIntent payload
 */
export function extractTextFromIntentPayload(data?: SendIntentResult | null): string | null {
  if (!data) return null;

  if (data.url && typeof data.url === 'string' && data.url.trim().length > 0) {
    return data.url.trim();
  }

  if (data.title && typeof data.title === 'string' && data.title.trim().length > 0) {
    return data.title.trim();
  }

  if (data.extras) {
    const extraStream = data.extras['android.intent.extra.STREAM'] || data.extras.stream;
    if (extraStream) {
      if (typeof extraStream === 'string' && extraStream.trim().length > 0) {
        return extraStream.trim();
      }
      if (typeof extraStream === 'object' && extraStream.value) {
        return String(extraStream.value).trim();
      }
    }

    const extraText = data.extras['android.intent.extra.TEXT'] || data.extras.url || data.extras.title;
    if (extraText && typeof extraText === 'string' && extraText.trim().length > 0) {
      return extraText.trim();
    }
  }

  return null;
}

/**
 * Converts a content:// or file:// URI into a File object for offline AI processing
 */
export async function uriToFile(uri: string, defaultName: string = 'shared_video.mp4'): Promise<File | null> {
  try {
    const cleanName = uri.split('/').pop()?.split('?')[0] || defaultName;
    if (Capacitor.isNativePlatform()) {
      // On native Android, do NOT load multi-gigabyte video into WebView memory via fetch/blob
      const file = new File([], cleanName, { type: 'video/mp4' });
      (file as any).uri = uri;
      (file as any).path = uri;
      return file;
    }
    const webSrc = uri;
    const res = await fetch(webSrc);
    if (!res.ok) return null;
    const blob = await res.blob();
    return new File([blob], cleanName, { type: blob.type || 'video/mp4' });
  } catch (err) {
    console.warn('[SendIntent] Failed to resolve URI to File:', err);
    return null;
  }
}

/**
 * Initializes listeners for both Cold Start (app launch) and Warm Start (background resume)
 * shared links from Android OS (ACTION_SEND).
 * Returns an unsubscribe cleanup function.
 */
export async function listenToSharedLinks(
  onVideoFound: (rawText: string) => void
): Promise<() => void> {
  if (!Capacitor.isNativePlatform()) {
    return () => {};
  }

  let listenerHandle: PluginListenerHandle | null = null;
  let isCleanedUp = false;

  // 1. Cold Start: Check if app was opened via SEND intent
  try {
    const coldStartData = await SendIntent.checkSendIntentReceived();
    const extractedText = extractTextFromIntentPayload(coldStartData);
    if (extractedText && !isCleanedUp) {
      onVideoFound(extractedText);
    }
  } catch {
    // Normal case when app is launched normally without a SEND intent
  }

  // 2. Warm Start: Listen for intents while app is active or in background
  try {
    listenerHandle = await SendIntent.addListener('appSendActionIntent', (data: SendIntentResult) => {
      const extractedText = extractTextFromIntentPayload(data);
      if (extractedText && !isCleanedUp) {
        onVideoFound(extractedText);
      }
    });
  } catch (err) {
    console.warn('[SendIntent] Failed to register appSendActionIntent listener:', err);
  }

  // Cleanup handler
  return () => {
    isCleanedUp = true;
    if (listenerHandle) {
      listenerHandle.remove();
      listenerHandle = null;
    }
  };
}
