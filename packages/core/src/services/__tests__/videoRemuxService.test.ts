import { describe, it, expect } from 'vitest';
import { muxSubtitlesIntoMp4, exportVideoWithSoftSubtitles, type SubtitleTrackExport } from '../videoRemuxService';

function createMockMp4Buffer(moovInFront = true): Uint8Array {
  // ftyp box (24 bytes)
  const ftyp = new Uint8Array([
    0, 0, 0, 24,
    102, 116, 121, 112, // 'ftyp'
    109, 112, 52, 50,   // 'mp42'
    0, 0, 0, 0,
    105, 115, 111, 109, // 'isom'
    109, 112, 52, 50    // 'mp42'
  ]);

  // mvhd inside moov (108 bytes)
  const mvhd = new Uint8Array(108);
  const mvView = new DataView(mvhd.buffer);
  mvView.setUint32(0, 108);
  mvhd[4] = 109; mvhd[5] = 118; mvhd[6] = 104; mvhd[7] = 100; // 'mvhd'
  mvhd[8] = 0; // version 0
  mvView.setUint32(12 + 8, 1000); // timescale
  mvView.setUint32(16 + 8, 10000); // duration = 10s
  mvView.setUint32(96 + 8, 3); // nextTrackId = 3

  // video trak with stco pointing to mdat
  // stco box: 20 bytes (size 20, 'stco', version 0, count 1, offset 224)
  const stco = new Uint8Array(20);
  const stcoView = new DataView(stco.buffer);
  stcoView.setUint32(0, 20);
  stco[4] = 115; stco[5] = 116; stco[6] = 99; stco[7] = 111; // 'stco'
  stcoView.setUint32(12, 1); // count = 1
  const initialOffset = moovInFront ? 224 : 32; // if moov in front, offset is 24 (ftyp) + moov_size (200) = 224
  stcoView.setUint32(16, initialOffset);

  // wrap stco inside stbl, minf, mdia, trak
  function box(type: string, payload: Uint8Array): Uint8Array {
    const out = new Uint8Array(8 + payload.length);
    new DataView(out.buffer).setUint32(0, 8 + payload.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(payload, 8);
    return out;
  }

  const stbl = box('stbl', stco);
  const minf = box('minf', stbl);
  const mdia = box('mdia', minf);
  const trak = box('trak', mdia);

  // moov box: 8 + 108 + trak.length = 200 bytes
  const moovPayload = new Uint8Array(mvhd.length + trak.length);
  moovPayload.set(mvhd, 0);
  moovPayload.set(trak, mvhd.length);
  const moov = box('moov', moovPayload);

  // mdat box: 32 bytes
  const mdatPayload = new Uint8Array(24);
  mdatPayload.fill(0xAA);
  const mdat = box('mdat', mdatPayload);

  // combine
  if (moovInFront) {
    const total = ftyp.length + moov.length + mdat.length;
    const res = new Uint8Array(total);
    res.set(ftyp, 0);
    res.set(moov, ftyp.length);
    res.set(mdat, ftyp.length + moov.length);
    return res;
  } else {
    const total = ftyp.length + mdat.length + moov.length;
    const res = new Uint8Array(total);
    res.set(ftyp, 0);
    res.set(mdat, ftyp.length);
    res.set(moov, ftyp.length + mdat.length);
    return res;
  }
}

describe('videoRemuxService - MP4 Soft Subtitle Remuxing', () => {
  it('correctly shifts stco chunk offsets when moov is originally in front of mdat', async () => {
    const mockMp4 = createMockMp4Buffer(true);
    const blob = new Blob([mockMp4 as unknown as BlobPart], { type: 'video/mp4' });

    const tracks: SubtitleTrackExport[] = [
      {
        language: 'tr',
        title: 'Turkish Subtitles',
        cues: [
          { id: '1', start: 1, end: 3, sourceText: 'Merhaba Dünya', targetText: 'Hello World' }
        ],
        mode: 'dual'
      }
    ];

    const outBlob = await muxSubtitlesIntoMp4(blob, tracks);
    expect(outBlob.size).toBeGreaterThan(blob.size);

    const outBuf = new Uint8Array(await outBlob.arrayBuffer());
    const outView = new DataView(outBuf.buffer);

    // Verify top-level boxes: ftyp at 0, mdat at 24, sub_mdat at 56, moov at end
    const b0Size = outView.getUint32(0);
    const b0Type = String.fromCharCode(...outBuf.subarray(4, 8));
    expect(b0Type).toBe('ftyp');
    expect(b0Size).toBe(24);

    const b1Size = outView.getUint32(24);
    const b1Type = String.fromCharCode(...outBuf.subarray(28, 32));
    expect(b1Type).toBe('mdat');
    expect(b1Size).toBe(32);

    // Find original stco in moov and verify it was shifted from 224 to 24
    let stcoPos = -1;
    for (let i = 0; i < outBuf.length - 8; i++) {
      if (
        outBuf[i] === 115 && // 's'
        outBuf[i + 1] === 116 && // 't'
        outBuf[i + 2] === 99 && // 'c'
        outBuf[i + 3] === 111 // 'o'
      ) {
        stcoPos = i - 4;
        break;
      }
    }
    expect(stcoPos).toBeGreaterThan(0);

    // Old offset was 224. Moov size was 168 (8 + 108 mvhd + 52 trak).
    // 224 - 168 = 56.
    const shiftedOffset = outView.getUint32(stcoPos + 16);
    expect(shiftedOffset).toBe(56);
  });

  it('handles multiple subtitle tracks with distinct track IDs, tx3g sample tables, and valid dimensions', async () => {
    const mockMp4 = createMockMp4Buffer(true);
    const blob = new Blob([mockMp4 as unknown as BlobPart], { type: 'video/mp4' });

    const tracks: SubtitleTrackExport[] = [
      {
        language: 'tr',
        title: 'Turkish',
        cues: [{ id: '1', start: 0, end: 2, sourceText: 'Bir', targetText: 'One' }],
        mode: 'dual'
      },
      {
        language: 'en',
        title: 'English',
        cues: [{ id: '2', start: 0, end: 2, sourceText: 'İki', targetText: 'Two' }],
        mode: 'target'
      }
    ];

    const outBlob = await muxSubtitlesIntoMp4(blob, tracks);
    const outBuf = new Uint8Array(await outBlob.arrayBuffer());
    const outView = new DataView(outBuf.buffer);

    // Count tx3g occurrences and verify defaultBox dimensions
    let tx3gCount = 0;
    for (let i = 0; i < outBuf.length - 4; i++) {
      if (
        outBuf[i] === 116 && // 't'
        outBuf[i + 1] === 120 && // 'x'
        outBuf[i + 2] === 51 && // '3'
        outBuf[i + 3] === 103 // 'g'
      ) {
        tx3gCount++;
        // tx3g box starts at i - 4. defaultBox bottom is at offset 30, right at offset 32
        const tx3gBoxStart = i - 4;
        const bottom = outView.getInt16(tx3gBoxStart + 30);
        const right = outView.getInt16(tx3gBoxStart + 32);
        expect(bottom).toBeGreaterThan(0);
        expect(right).toBeGreaterThan(0);
      }
    }
    expect(tx3gCount).toBe(2);

    // Verify subtitle tkhd boxes have alternate_group = 2 and non-zero dimensions
    let subtitleTkhdCount = 0;
    for (let i = 0; i < outBuf.length - 8; i++) {
      if (
        outBuf[i] === 116 && // 't'
        outBuf[i + 1] === 107 && // 'k'
        outBuf[i + 2] === 104 && // 'h'
        outBuf[i + 3] === 100 // 'd'
      ) {
        const tkhdStart = i - 4;
        const sz = outView.getUint32(tkhdStart);
        if (sz === 92) {
          const altGroup = outView.getUint16(tkhdStart + 42);
          if (altGroup === 2) {
            subtitleTkhdCount++;
            const width = outView.getUint32(tkhdStart + 84) >>> 16;
            const height = outView.getUint32(tkhdStart + 88) >>> 16;
            expect(width).toBeGreaterThan(0);
            expect(height).toBeGreaterThan(0);
          }
        }
      }
    }
    expect(subtitleTkhdCount).toBe(2);
  });

  it('exportVideoWithSoftSubtitles exports with MKV container and triggers completion progress', async () => {
    const mockMp4 = createMockMp4Buffer(true);
    const blob = new Blob([mockMp4 as unknown as BlobPart], { type: 'video/mp4' });

    const progressReports: string[] = [];
    const tracks: SubtitleTrackExport[] = [
      {
        language: 'es',
        title: 'Spanish',
        cues: [{ id: '1', start: 0, end: 2, sourceText: 'Merhaba', targetText: 'Hola' }],
        mode: 'target'
      }
    ];

    await exportVideoWithSoftSubtitles({
      videoBlob: blob,
      videoTitle: 'Test Video',
      container: 'mkv',
      customTracks: tracks,
      onProgress: (p) => progressReports.push(p.stage)
    });

    expect(progressReports).toContain('muxing');
    expect(progressReports).toContain('completed');
  });

  it('exportVideoWithSoftSubtitles exports with MP4 container and triggers completion progress', async () => {
    const mockMp4 = createMockMp4Buffer(true);
    const blob = new Blob([mockMp4 as unknown as BlobPart], { type: 'video/mp4' });

    const progressReports: string[] = [];
    const tracks: SubtitleTrackExport[] = [
      {
        language: 'de',
        title: 'German',
        cues: [{ id: '1', start: 0, end: 2, sourceText: 'Merhaba', targetText: 'Hallo' }],
        mode: 'target'
      }
    ];

    await exportVideoWithSoftSubtitles({
      videoBlob: blob,
      videoTitle: 'Test Video',
      container: 'mp4',
      customTracks: tracks,
      onProgress: (p) => progressReports.push(p.stage)
    });

    expect(progressReports).toContain('muxing');
    expect(progressReports).toContain('completed');
  });

  it('includes udta name atoms for MP4 subtitle tracks and defaults to target mode when undefined', async () => {
    const mockMp4 = createMockMp4Buffer(true);
    const blob = new Blob([mockMp4 as unknown as BlobPart], { type: 'video/mp4' });

    const tracks: SubtitleTrackExport[] = [
      {
        language: 'es',
        title: 'Spanish Subtitles',
        cues: [{ id: '1', start: 0, end: 2, sourceText: 'Merhaba Dünya', targetText: 'Hola Mundo' }]
        // mode intentionally omitted
      },
      {
        language: 'de',
        title: 'German Subtitles',
        cues: [{ id: '2', start: 0, end: 2, sourceText: 'Merhaba Dünya', targetText: 'Hallo Welt' }]
        // mode intentionally omitted
      }
    ];

    const outBlob = await muxSubtitlesIntoMp4(blob, tracks);
    const outBuf = new Uint8Array(await outBlob.arrayBuffer());
    const textContent = new TextDecoder().decode(outBuf);

    // udta name box must contain the track titles
    expect(textContent).toContain('Spanish Subtitles');
    expect(textContent).toContain('German Subtitles');

    // Default mode must be 'target', so Spanish and German translated text are present
    expect(textContent).toContain('Hola Mundo');
    expect(textContent).toContain('Hallo Welt');

    // Untranslated Turkish source text must NOT appear when mode is defaulted to target
    expect(textContent).not.toContain('Merhaba Dünya');
  });

  it('safely handles NaN and non-finite timestamps without corrupting stts table with zero-duration frames (DEF-003)', async () => {
    const mockMp4 = createMockMp4Buffer(true);
    const blob = new Blob([mockMp4 as unknown as BlobPart], { type: 'video/mp4' });

    const tracks: SubtitleTrackExport[] = [
      {
        language: 'tr',
        title: 'Turkish NaN',
        cues: [
          { id: '1', start: NaN, end: NaN, sourceText: 'Kaynak', targetText: 'Hedef' },
          { id: '2', start: 2.0, end: Infinity, sourceText: 'Kaynak 2', targetText: 'Hedef 2' }
        ],
        mode: 'target'
      }
    ];

    const outBlob = await muxSubtitlesIntoMp4(blob, tracks);
    expect(outBlob.size).toBeGreaterThan(blob.size);

    const outBuf = new Uint8Array(await outBlob.arrayBuffer());
    // Find all 'stts' boxes and verify no sample entry has duration 0
    let checkedStts = false;
    for (let i = 0; i < outBuf.length - 16; i++) {
      if (outBuf[i] === 0x73 && outBuf[i+1] === 0x74 && outBuf[i+2] === 0x74 && outBuf[i+3] === 0x73) {
        const view = new DataView(outBuf.buffer, outBuf.byteOffset + i, outBuf.length - i);
        const entryCount = view.getUint32(8);
        for (let e = 0; e < entryCount; e++) {
          const delta = view.getUint32(16 + e * 8);
          expect(delta).toBeGreaterThanOrEqual(100);
          checkedStts = true;
        }
      }
    }
    expect(checkedStts).toBe(true);
  });
});
