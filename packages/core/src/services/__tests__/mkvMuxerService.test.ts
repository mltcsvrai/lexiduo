import { describe, it, expect } from 'vitest';
import {
  muxSubtitlesIntoMkv,
  encodeVint,
  ebmlUint,
  ebmlString,
  toIso639_2,
  type SubtitleTrackExport
} from '../mkvMuxerService';

function createMockMp4Buffer(): Uint8Array {
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
  mvhd[8] = 0;
  mvView.setUint32(12 + 8, 1000); // timescale
  mvView.setUint32(16 + 8, 10000); // duration = 10s
  mvView.setUint32(96 + 8, 3); // nextTrackId = 3

  // Helper box
  function box(type: string, payload: Uint8Array): Uint8Array {
    const out = new Uint8Array(8 + payload.length);
    new DataView(out.buffer).setUint32(0, 8 + payload.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(payload, 8);
    return out;
  }

  // tkhd (92 bytes)
  const tkhd = new Uint8Array(92);
  const tkhdView = new DataView(tkhd.buffer);
  tkhdView.setUint32(0, 92);
  tkhd[4] = 116; tkhd[5] = 107; tkhd[6] = 104; tkhd[7] = 100; // 'tkhd'
  tkhdView.setUint32(20, 1); // trackId = 1
  tkhdView.setUint32(84, 1280 << 16); // width 1280
  tkhdView.setUint32(88, 720 << 16); // height 720

  // hdlr (vide)
  const hdlr = new Uint8Array(24);
  hdlr[4] = 104; hdlr[5] = 100; hdlr[6] = 108; hdlr[7] = 114; // 'hdlr'
  hdlr[16] = 118; hdlr[17] = 105; hdlr[18] = 100; hdlr[19] = 101; // 'vide'

  // mdhd
  const mdhd = new Uint8Array(32);
  const mdhdView = new DataView(mdhd.buffer);
  mdhdView.setUint32(0, 32);
  mdhd[4] = 109; mdhd[5] = 100; mdhd[6] = 104; mdhd[7] = 100; // 'mdhd'
  mdhdView.setUint32(20, 1000); // timescale
  mdhdView.setUint32(24, 10000);

  // stsd with avc1 and avcC
  const avcC = box('avcC', new Uint8Array([1, 0x64, 0x00, 0x1f, 0xff, 0xe1, 0, 1, 0x67, 1, 0, 1, 0x68]));
  const avc1Payload = new Uint8Array(78 + avcC.length);
  avc1Payload.set(avcC, 78);
  const avc1 = box('avc1', avc1Payload);
  const stsdPayload = new Uint8Array(8 + avc1.length);
  new DataView(stsdPayload.buffer).setUint32(4, 1);
  stsdPayload.set(avc1, 8);
  const stsd = box('stsd', stsdPayload);

  // stts (1 entry, 1 sample, delta 1000)
  const sttsPayload = new Uint8Array(16);
  const sttsView = new DataView(sttsPayload.buffer);
  sttsView.setUint32(4, 1);
  sttsView.setUint32(8, 1);
  sttsView.setUint32(12, 1000);
  const stts = box('stts', sttsPayload);

  // stsz (1 sample, size 24)
  const stszPayload = new Uint8Array(16);
  const stszView = new DataView(stszPayload.buffer);
  stszView.setUint32(4, 0); // defaultSize 0
  stszView.setUint32(8, 1); // count 1
  stszView.setUint32(12, 24);
  const stsz = box('stsz', stszPayload);

  // stco (1 chunk at offset 224)
  const stcoPayload = new Uint8Array(12);
  const stcoView = new DataView(stcoPayload.buffer);
  stcoView.setUint32(4, 1);
  stcoView.setUint32(8, 224);
  const stco = box('stco', stcoPayload);

  // stsc (1 chunk, 1 sample)
  const stscPayload = new Uint8Array(16);
  const stscView = new DataView(stscPayload.buffer);
  stscView.setUint32(4, 1);
  stscView.setUint32(8, 1);
  stscView.setUint32(12, 1);
  const stsc = box('stsc', stscPayload);

  const stbl = box('stbl', new Uint8Array([...stsd, ...stts, ...stsz, ...stsc, ...stco]));
  const minf = box('minf', stbl);
  const mdia = box('mdia', new Uint8Array([...mdhd, ...hdlr, ...minf]));
  const trak = box('trak', new Uint8Array([...tkhd, ...mdia]));

  const moovPayload = new Uint8Array(mvhd.length + trak.length);
  moovPayload.set(mvhd, 0);
  moovPayload.set(trak, mvhd.length);
  const moov = box('moov', moovPayload);

  // mdat (24 bytes)
  const mdat = box('mdat', new Uint8Array(24).fill(0xAA));

  const total = ftyp.length + moov.length + mdat.length;
  const res = new Uint8Array(total);
  res.set(ftyp, 0);
  res.set(moov, ftyp.length);
  res.set(mdat, ftyp.length + moov.length);
  return res;
}

describe('mkvMuxerService - Matroska Soft Subtitle Multiplexing', () => {
  it('correctly encodes EBML VINTs and primitive types', () => {
    // VINT 1-byte
    expect(encodeVint(1)).toEqual(new Uint8Array([0x81]));
    expect(encodeVint(126)).toEqual(new Uint8Array([0xFE]));

    // VINT 2-bytes
    const v2 = encodeVint(300);
    expect(v2.length).toBe(2);
    expect(v2[0] & 0x40).toBe(0x40);

    // EBML Uint
    const uintEl = ebmlUint([0xD7], 3);
    expect(uintEl[0]).toBe(0xD7);
    expect(uintEl[1]).toBe(0x81); // size 1
    expect(uintEl[2]).toBe(3);

    // EBML String
    const strEl = ebmlString([0x86], 'S_TEXT/UTF8');
    expect(strEl[0]).toBe(0x86);
    expect(strEl[1]).toBe(0x80 | 11); // size 11
  });

  it('correctly maps ISO-639-1 language codes to ISO-639-2 3-letter codes', () => {
    expect(toIso639_2('es')).toBe('spa');
    expect(toIso639_2('de')).toBe('deu');
    expect(toIso639_2('tr')).toBe('tur');
    expect(toIso639_2('en')).toBe('eng');
    expect(toIso639_2('fr')).toBe('fra');
    expect(toIso639_2('unknown')).toBe('und');
  });

  it('muxes MP4 video with Spanish and German subtitles into a valid Matroska MKV container', async () => {
    const mockMp4 = createMockMp4Buffer();
    const videoBlob = new Blob([mockMp4 as unknown as BlobPart], { type: 'video/mp4' });

    const tracks: SubtitleTrackExport[] = [
      {
        language: 'es',
        title: 'Spanish Subtitles',
        cues: [
          { id: '1', start: 0.5, end: 2.5, sourceText: 'Merhaba nasılsınız', targetText: 'Hola cómo estás' },
          { id: '2', start: 3.0, end: 5.0, sourceText: 'İyi günler', targetText: 'Buenos días' }
        ],
        mode: 'target'
      },
      {
        language: 'de',
        title: 'German Subtitles',
        cues: [
          { id: '1', start: 0.5, end: 2.5, sourceText: 'Merhaba nasılsınız', targetText: 'Hallo wie geht es dir' },
          { id: '2', start: 3.0, end: 5.0, sourceText: 'İyi günler', targetText: 'Guten Tag' }
        ],
        mode: 'target'
      }
    ];

    const mkvBlob = await muxSubtitlesIntoMkv(videoBlob, tracks);
    expect(mkvBlob.type).toBe('video/x-matroska');
    expect(mkvBlob.size).toBeGreaterThan(0);

    const buf = new Uint8Array(await mkvBlob.arrayBuffer());

    // 1. Check EBML Header signature: 0x1A 0x45 0xDF 0xA3
    expect(buf[0]).toBe(0x1A);
    expect(buf[1]).toBe(0x45);
    expect(buf[2]).toBe(0xDF);
    expect(buf[3]).toBe(0xA3);

    const textContent = new TextDecoder().decode(buf);

    // 2. Check DocType is matroska
    expect(textContent).toContain('matroska');

    // 3. Check Subtitle Codec ID
    expect(textContent).toContain('S_TEXT/UTF8');

    // 4. Check Language codes (spa and deu)
    expect(textContent).toContain('spa');
    expect(textContent).toContain('deu');

    // 5. Check Track Titles
    expect(textContent).toContain('Spanish Subtitles');
    expect(textContent).toContain('German Subtitles');

    // 6. Check that target translations exist in the subtitle blocks
    expect(textContent).toContain('Hola cómo estás');
    expect(textContent).toContain('Buenos días');
    expect(textContent).toContain('Hallo wie geht es dir');
    expect(textContent).toContain('Guten Tag');

    // 7. In 'target' mode, source text should NOT be present in subtitle blocks
    expect(textContent).not.toContain('Merhaba nasılsınız');
    expect(textContent).not.toContain('İyi günler');
  });

  it('supports dual mode subtitles containing both source and target lines', async () => {
    const mockMp4 = createMockMp4Buffer();
    const videoBlob = new Blob([mockMp4 as unknown as BlobPart], { type: 'video/mp4' });

    const tracks: SubtitleTrackExport[] = [
      {
        language: 'es',
        title: 'Spanish Dual',
        cues: [
          { id: '1', start: 0.5, end: 2.5, sourceText: 'Görüşürüz', targetText: 'Hasta luego' }
        ],
        mode: 'dual'
      }
    ];

    const mkvBlob = await muxSubtitlesIntoMkv(videoBlob, tracks);
    const buf = new Uint8Array(await mkvBlob.arrayBuffer());
    const textContent = new TextDecoder().decode(buf);

    // In 'dual' mode, both lines must be present
    expect(textContent).toContain('Görüşürüz');
    expect(textContent).toContain('Hasta luego');
  });

  it('normalizes locale and auto-generated language codes in toIso639_2', () => {
    expect(toIso639_2('es-ES')).toBe('spa');
    expect(toIso639_2('a.de')).toBe('deu');
    expect(toIso639_2('a.tr')).toBe('tur');
    expect(toIso639_2('pt-BR')).toBe('por');
  });

  it('preserves trailing subtitle cues beyond media samples in MKV clusters', async () => {
    const mockMp4 = createMockMp4Buffer(); // sample is at 0.224s, duration 10s
    const videoBlob = new Blob([mockMp4 as unknown as BlobPart], { type: 'video/mp4' });

    const tracks: SubtitleTrackExport[] = [
      {
        language: 'es',
        title: 'Spanish Late',
        cues: [
          { id: '1', start: 12.0, end: 14.5, sourceText: 'Son Altyazı', targetText: 'Subtítulo Final' }
        ],
        mode: 'target'
      }
    ];

    const mkvBlob = await muxSubtitlesIntoMkv(videoBlob, tracks);
    const buf = new Uint8Array(await mkvBlob.arrayBuffer());
    const textContent = new TextDecoder().decode(buf);

    expect(textContent).toContain('Subtítulo Final');
  });

  it('safely handles unbounded/infinite cue timestamps without hanging or OOM (DEF-001)', async () => {
    const mockMp4 = createMockMp4Buffer();
    const videoBlob = new Blob([mockMp4 as unknown as BlobPart], { type: 'video/mp4' });

    const tracks: SubtitleTrackExport[] = [
      {
        language: 'en',
        title: 'Infinite Subtitle',
        cues: [
          { id: '1', start: 0, end: Infinity, sourceText: 'Infinite End', targetText: 'Sonsuz Bitiş' }
        ],
        mode: 'target'
      }
    ];

    const mkvBlob = await muxSubtitlesIntoMkv(videoBlob, tracks);
    expect(mkvBlob.size).toBeGreaterThan(150);
    const buf = new Uint8Array(await mkvBlob.arrayBuffer());
    const textContent = new TextDecoder().decode(buf);
    expect(textContent).toContain('Sonsuz Bitiş');
  });

  it('safely handles NaN cue timestamps without dropping clusters or producing empty 150-byte containers (DEF-002)', async () => {
    const mockMp4 = createMockMp4Buffer();
    const videoBlob = new Blob([mockMp4 as unknown as BlobPart], { type: 'video/mp4' });

    const tracks: SubtitleTrackExport[] = [
      {
        language: 'tr',
        title: 'NaN Subtitle',
        cues: [
          { id: '1', start: 0, end: NaN, sourceText: 'NaN End', targetText: 'Geçersiz Bitiş' }
        ],
        mode: 'target'
      }
    ];

    const mkvBlob = await muxSubtitlesIntoMkv(videoBlob, tracks);
    expect(mkvBlob.size).toBeGreaterThan(150);
    const buf = new Uint8Array(await mkvBlob.arrayBuffer());
    const textContent = new TextDecoder().decode(buf);
    expect(textContent).toContain('Geçersiz Bitiş');
  });
});
