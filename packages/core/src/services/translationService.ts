import { CapacitorHttp } from '@capacitor/core';

// Fail-safe fetch wrapper with strict timeout limit
export async function smartFetch(
  url: string, 
  options?: { method?: string; headers?: any; body?: string, responseType?: 'text' | 'json' | 'arraybuffer' | 'blob' }, 
  timeoutMs = 4000
): Promise<{ ok: boolean; status: number; text: () => Promise<string>; json: () => Promise<any>; arrayBuffer: () => Promise<ArrayBuffer> }> {
  const isNative = typeof window !== 'undefined' && typeof (window as any).Capacitor !== 'undefined' && Boolean((window as any).Capacitor.isNativePlatform?.());

  const tryParseJson = (val: string) => {
    try {
      return JSON.parse(val);
    } catch {
      return val;
    }
  };

  const fetchPromise = (async () => {
    if (isNative) {
      const response = await CapacitorHttp.request({
        url,
        method: options?.method || 'GET',
        headers: options?.headers || { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14)' },
        data: options?.body ? (typeof options.body === 'string' ? tryParseJson(options.body) : options.body) : undefined,
        responseType: options?.responseType
      });
      const rawData = response.data;
      return {
        ok: response.status >= 200 && response.status < 300,
        status: response.status,
        text: async () => (typeof rawData === 'string' ? rawData : JSON.stringify(rawData)),
        json: async () => (typeof rawData === 'object' ? rawData : tryParseJson(typeof rawData === 'string' ? rawData : JSON.stringify(rawData))),
        arrayBuffer: async () => {
          if (typeof rawData === 'string') {
            const binaryString = atob(rawData);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            return bytes.buffer;
          }
          throw new Error('Native response data is not a base64 string for arrayBuffer');
        }
      };
    } else {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(url, {
        method: options?.method || 'GET',
        headers: options?.headers,
        body: options?.body,
        signal: controller.signal
      });

      clearTimeout(timer);

      return {
        ok: res.ok,
        status: res.status,
        text: () => res.text(),
        json: () => res.json(),
        arrayBuffer: () => res.arrayBuffer()
      };
    }
  })();

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)
  );

  return Promise.race([fetchPromise, timeoutPromise]);
}

// Secure client-level translator using Google Chrome extension API & multi-provider fallbacks
export async function translateTextSecure(text: string, fromLang: string, toLang: string): Promise<string> {
  if (!text || !text.trim()) return text;
  const cleanFrom = fromLang ? fromLang.replace(/^a\./, '').split('-')[0] : 'auto';
  let cleanTo = toLang ? toLang.replace(/^a\./, '').split('-')[0] : 'tr';
  if (cleanTo === 'auto') {
    cleanTo = cleanFrom === 'tr' ? 'en' : 'tr';
  }

  if (cleanFrom !== 'auto' && cleanFrom === cleanTo) {
    return text;
  }

  // 1. Primary: Google Chrome Extension official endpoint (Clean JSON array, no bot 429 page)
  try {
    const url = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=${cleanFrom}&tl=${cleanTo}&q=${encodeURIComponent(text)}`;
    const res = await smartFetch(url, undefined, 7000);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        if (Array.isArray(data[0])) {
          const combined = data
            .map((chunk: any) => (Array.isArray(chunk) && typeof chunk[0] === 'string' ? chunk[0] : ''))
            .filter(Boolean)
            .join('\n')
            .trim();
          if (combined && combined.length > 0) return combined;
        } else if (typeof data[0] === 'string') {
          const tr = data[0].trim();
          if (tr && tr.length > 0) return tr;
        }
      }
    }
  } catch {
    // Continue to fallback
  }

  // 2. Secondary: Google WebApp endpoint
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=webapp&sl=${cleanFrom}&tl=${cleanTo}&dt=t&q=${encodeURIComponent(text)}`;
    const res = await smartFetch(url, undefined, 7000);
    if (res.ok) {
      const json = await res.json();
      if (json && Array.isArray(json[0])) {
        const fullTr = json[0].map((chunk: any) => chunk[0]).join('').trim();
        if (fullTr && fullTr !== text) return fullTr;
      }
    }
  } catch {
    // Continue to fallback
  }

  // 3. Tertiary: MyMemory Translation API
  try {
    const langpair = `${cleanFrom === 'auto' ? 'en' : cleanFrom}|${cleanTo}`;
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${langpair}`;
    const res = await smartFetch(url, undefined, 6000);
    if (res.ok) {
      const json = await res.json();
      if (json?.responseData?.translatedText) {
        return json.responseData.translatedText.trim();
      }
    }
  } catch {
    // All fallbacks exhausted
  }

  return text;
}
