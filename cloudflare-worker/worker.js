/**
 * Cloudflare Worker for YT Çeviri App
 * 1. Proxy YouTube InnerTube Subtitle Extraction (/api/transcript?v=VIDEO_ID)
 * 2. Serve Live App Updates & Version Manifest (/version.json)
 * 3. Serve Live App Download Landing Page (/download)
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Endpoint 1: App Version & Live Update Manifest
    // Now served statically via Cloudflare Assets from the /public directory!

    // Security Token Check for APIs
    if (url.pathname.startsWith('/api/')) {
      const token = url.searchParams.get('app_token');
      if (token !== 'ytceviri_secure_2026') {
        return new Response(JSON.stringify({ error: 'Unauthorized Access' }), { status: 401, headers: corsHeaders });
      }
    }

    // Endpoint 2: Download Landing Page
    if (url.pathname === '/download') {
      const html = `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>YT Çeviri - Canlı Güncelleme</title>
  <style>
    body { background-color: #020617; color: #f8fafc; font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; text-align: center; }
    .card { background: #0f172a; border: 1px solid rgba(255,255,255,0.1); padding: 32px; border-radius: 24px; max-width: 480px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); }
    h1 { color: #ef4444; margin-bottom: 8px; }
    .badge { background: rgba(16,185,129,0.2); color: #34d399; padding: 4px 12px; border-radius: 999px; font-weight: bold; font-size: 14px; }
    p { color: #94a3b8; font-size: 14px; line-height: 1.6; }
    .btn { display: inline-block; background: #ef4444; color: white; text-decoration: none; padding: 12px 24px; border-radius: 12px; font-weight: bold; margin-top: 16px; transition: 0.2s; }
    .btn:hover { background: #dc2626; }
  </style>
</head>
<body>
  <div class="card">
    <h1>YT Çeviri</h1>
    <span class="badge">Sürüm v1.0.2 Canlıda</span>
    <p>Canlı Güncelleme Servisi Aktif! Uygulamanız yeni özellikleri otomatik olarak Cloudflare üzerinden yüklemiştir.</p>
    <a href="/" class="btn" onclick="window.close(); return false;">Uygulamaya Dön</a>
  </div>
</body>
</html>`;
      return new Response(html, {
        headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=UTF-8' }
      });
    }

    // Endpoint 2.5: YouTube Audio Stream Proxy
    if (url.pathname === '/api/audio') {
      const videoId = url.searchParams.get('v');
      if (!videoId) {
        return new Response(JSON.stringify({ error: 'Missing videoId' }), { status: 400, headers: corsHeaders });
      }

      try {
        const watchRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        let apiKey = '';
        if (watchRes.body) {
          const reader = watchRes.body.getReader();
          const decoder = new TextDecoder();
          let chunk = '';
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunk += decoder.decode(value, { stream: true });
            const keyMatch = chunk.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
            if (keyMatch) {
              apiKey = keyMatch[1];
              await reader.cancel();
              break;
            }
            if (chunk.length > 2000) chunk = chunk.slice(-1000);
          }
        }

        const playerRes = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
          body: JSON.stringify({
            context: { client: { clientName: 'IOS', clientVersion: '19.28.1', osName: 'iOS', osVersion: '17.5.1' } },
            videoId
          })
        });
        
        if (!playerRes.ok) {
          const errText = await playerRes.text();
          return new Response(JSON.stringify({ 
            error: `YouTube API returned ${playerRes.status}`, 
            details: errText.slice(0, 200) 
          }), { status: playerRes.status, headers: corsHeaders });
        }

        const playerData = await playerRes.json();
        const adaptiveFormats = playerData?.streamingData?.adaptiveFormats || [];
        const basicFormats = playerData?.streamingData?.formats || [];
        const allFormats = [...adaptiveFormats, ...basicFormats];

        // Find best audio format (webm or mp4, prioritizing audio-only with a reasonable bitrate)
        let audioFormat = allFormats.find(f => f.mimeType && f.mimeType.includes('audio/webm'));
        if (!audioFormat) {
          audioFormat = allFormats.find(f => f.mimeType && f.mimeType.includes('audio/mp4'));
        }
        if (!audioFormat) {
          audioFormat = allFormats.find(f => f.mimeType && (f.mimeType.includes('audio/') || f.mimeType.includes('video/mp4')));
        }

        if (!audioFormat || !audioFormat.url) {
          return new Response(JSON.stringify({ 
            error: 'No streamable audio format found. Video might be ciphered or restricted.',
            playability: playerData?.playabilityStatus,
            hasAdaptive: adaptiveFormats.length,
            hasBasic: basicFormats.length
          }), { status: 404, headers: corsHeaders });
        }

        // Fetch the actual audio stream and proxy it
        const audioRes = await fetch(audioFormat.url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });

        const responseHeaders = new Headers(corsHeaders);
        responseHeaders.set('Content-Type', audioFormat.mimeType);
        
        return new Response(audioRes.body, {
          status: audioRes.status,
          headers: responseHeaders
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
      }
    }

    // Endpoint 3: YouTube Transcript Extraction
    if (url.pathname === '/api/transcript') {
      const videoId = url.searchParams.get('v');
      const sourceLang = url.searchParams.get('lang') || 'auto';
      if (!videoId) {
        return new Response(JSON.stringify({ error: 'Missing videoId' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      try {
        const watchRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        let apiKey = '';
        if (watchRes.body) {
          const reader = watchRes.body.getReader();
          const decoder = new TextDecoder();
          let chunk = '';
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunk += decoder.decode(value, { stream: true });
            const keyMatch = chunk.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
            if (keyMatch) {
              apiKey = keyMatch[1];
              await reader.cancel();
              break;
            }
            if (chunk.length > 2000) chunk = chunk.slice(-1000);
          }
        }

        const playerRes = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
          body: JSON.stringify({
            context: { client: { clientName: 'ANDROID', clientVersion: '20.10.38' } },
            videoId
          })
        });

        if (!playerRes.ok) {
          const errText = await playerRes.text();
          return new Response(JSON.stringify({ 
            error: `YouTube API returned ${playerRes.status}`, 
            details: errText.slice(0, 200) 
          }), { status: playerRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const playerData = await playerRes.json();
        const captionTracks = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];

        if (captionTracks.length === 0) {
          return new Response(JSON.stringify({ cues: [], lang: 'en' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        let selectedTrack = captionTracks[0];
        if (sourceLang !== 'auto') {
          selectedTrack = captionTracks.find((t) => t.languageCode === sourceLang || t.languageCode?.startsWith(sourceLang)) || captionTracks[0];
        } else {
          selectedTrack = captionTracks.find((t) => t.languageCode === 'en' || t.languageCode?.startsWith('en')) || captionTracks[0];
        }

        const trackLang = selectedTrack.languageCode?.split('-')[0] || 'en';
        let baseUrl = selectedTrack.baseUrl;
        if (!baseUrl.includes('&fmt=')) {
          baseUrl += '&fmt=srv3';
        }

        const xmlRes = await fetch(baseUrl);
        const xmlData = await xmlRes.text();

        const lines = [];
        const pRegex = /<p t="(\d+)" d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;
        let m;
        let idx = 1;

        while ((m = pRegex.exec(xmlData)) !== null) {
          const startMs = parseInt(m[1]);
          const durMs = parseInt(m[2]);
          const innerHtml = m[3];
          const text = innerHtml.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\n/g, ' ').trim();
          if (text) {
            lines.push({ id: String(idx++), start: startMs / 1000, end: (startMs + durMs) / 1000, text });
          }
        }

        if (lines.length === 0) {
          const textRegex = /<text\s+start="([^"]+)"\s+dur="([^"]+)"[^>]*>([\s\S]*?)<\/text>/g;
          while ((m = textRegex.exec(xmlData)) !== null) {
            const start = parseFloat(m[1]);
            const dur = parseFloat(m[2]);
            const text = m[3].replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\n/g, ' ').trim();
            if (text) {
              lines.push({ id: String(idx++), start, end: start + dur, text });
            }
          }
        }

        return new Response(JSON.stringify({ cues: lines, lang: trackLang }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: String(err) }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    return new Response('YT Çeviri Cloudflare Worker Operational', { headers: corsHeaders });
  }
};
