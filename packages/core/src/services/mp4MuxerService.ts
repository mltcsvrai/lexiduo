import type { SubtitleCue } from '../types';
import { getCueTextForExport, type SubtitleExportMode } from './subtitleExportService';

export interface SubtitleTrackExport {
  language: string;
  title: string;
  cues: SubtitleCue[];
  mode?: SubtitleExportMode;
}

const ISO_639_2_MAP: Record<string, string> = {
  tr: 'tur', en: 'eng', de: 'deu', es: 'spa', fr: 'fra', it: 'ita',
  pt: 'por', ru: 'rus', zh: 'zho', ja: 'jpn', ko: 'kor', ar: 'ara',
  hi: 'hin', nl: 'nld', pl: 'pol', uk: 'ukr', sv: 'swe', no: 'nor',
  da: 'dan', fi: 'fin', el: 'ell', cs: 'ces', ro: 'ron', hu: 'hun',
  id: 'ind', vi: 'vie', th: 'tha', he: 'heb', fa: 'fas', az: 'aze',
  bg: 'bul', sr: 'srp', sk: 'slk', hr: 'hrv', bn: 'ben'
};

export function packIso639Language(lang: string): number {
  const clean = (lang || '').toLowerCase().replace(/^a\./, '').split('-')[0];
  const code = (ISO_639_2_MAP[clean] || (clean.length === 3 ? clean : 'und')).padEnd(3, ' ');
  const c1 = Math.max(1, Math.min(26, code.charCodeAt(0) - 0x60));
  const c2 = Math.max(1, Math.min(26, code.charCodeAt(1) - 0x60));
  const c3 = Math.max(1, Math.min(26, code.charCodeAt(2) - 0x60));
  return ((c1 & 0x1F) << 10) | ((c2 & 0x1F) << 5) | (c3 & 0x1F);
}

export function concatBuffers(buffers: Uint8Array[]): Uint8Array {
  const total = buffers.reduce((acc, b) => acc + b.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const b of buffers) { out.set(b, offset); offset += b.length; }
  return out;
}

export function mp4Box(type: string, payload: Uint8Array): Uint8Array {
  const header = new Uint8Array(8);
  new DataView(header.buffer).setUint32(0, 8 + payload.length);
  for (let i = 0; i < 4; i++) header[4 + i] = type.charCodeAt(i);
  const out = new Uint8Array(8 + payload.length);
  out.set(header, 0);
  out.set(payload, 8);
  return out;
}

export function buildTkhd(
  trackId: number,
  duration: number,
  width: number = 640,
  height: number = 360,
  isDefaultTrack: boolean = true
): Uint8Array {
  const buf = new Uint8Array(92);
  const v = new DataView(buf.buffer);
  v.setUint32(0, 92);
  buf[4] = 116; buf[5] = 107; buf[6] = 104; buf[7] = 100; // 'tkhd'
  buf[8] = 0; // version 0
  // flags: track_enabled (1) | track_in_movie (2). Default track is enabled; alternate tracks are in movie but disabled by default
  buf[9] = 0; buf[10] = 0; buf[11] = isDefaultTrack ? 3 : 2;
  v.setUint32(20, trackId);
  v.setUint32(28, Math.round(duration));
  v.setUint16(42, 2); // alternate_group = 2 (groups soft subtitle language tracks together)
  v.setInt32(48, 0x00010000); // 1.0 (16.16)
  v.setInt32(64, 0x00010000); // 1.0 (16.16)
  v.setInt32(80, 0x40000000); // 1.0 (2.30)
  v.setUint32(84, (width & 0xFFFF) << 16); // track width (16.16 fixed point)
  v.setUint32(88, (height & 0xFFFF) << 16); // track height (16.16 fixed point)
  return buf;
}

export function buildTx3gBox(width: number = 640, height: number = 360): Uint8Array {
  const buf = new Uint8Array([
    0, 0, 0, 84, 116, 120, 51, 103, // size 84, 'tx3g'
    0, 0, 0, 0, 0, 0, 0, 1, // reserved(6) + data_ref_idx(2)
    0, 0, 0, 0, 1, 255, 0, 0, 0, 0, // flags, h-center(1), v-bottom(255), bgRGBA(0,0,0,0 transparent)
    0, 0, 0, 0, 0, 0, 0, 0, // defaultBox (top, left, bottom, right)
    0, 0, 0, 0, 0, 1, 0, 16, // start/endChar, fontID(1), faceStyle(0), fontSize(16)
    255, 255, 255, 255, // fontColorRGBA (white)
    0, 0, 0, 18, 102, 116, 97, 98, 0, 1, 0, 1, 5, 65, 114, 105, 97, 108, // 'ftab' Arial
    0, 0, 0, 20, 98, 116, 114, 116, 0, 0, 0, 0, 0, 0, 0, 106, 0, 0, 0, 106 // 'btrt'
  ]);
  const v = new DataView(buf.buffer);
  v.setInt16(26, 0); // top
  v.setInt16(28, 0); // left
  v.setInt16(30, Math.min(32767, Math.round(height))); // bottom
  v.setInt16(32, Math.min(32767, Math.round(width))); // right
  return buf;
}

export function parseVideoDimensions(moovData: Uint8Array, headerSize: number): { width: number; height: number } {
  const view = new DataView(moovData.buffer, moovData.byteOffset, moovData.byteLength);
  let pos = headerSize;
  const end = moovData.length;

  while (pos + 8 <= end) {
    let sz = view.getUint32(pos);
    let hsz = 8;
    if (sz === 1 && pos + 16 <= end) {
      hsz = 16;
      sz = view.getUint32(pos + 8) * 4294967296 + view.getUint32(pos + 12);
    } else if (sz === 0) {
      sz = end - pos;
    }
    if (sz < hsz || pos + sz > end) break;

    const type = String.fromCharCode(moovData[pos + 4], moovData[pos + 5], moovData[pos + 6], moovData[pos + 7]);
    if (type === 'trak') {
      let trakScan = pos + hsz;
      const trakEnd = pos + sz;
      let isVideo = false;
      let trackWidth = 0;
      let trackHeight = 0;

      while (trakScan + 8 <= trakEnd) {
        let childSz = view.getUint32(trakScan);
        let childHsz = 8;
        if (childSz === 1 && trakScan + 16 <= trakEnd) {
          childHsz = 16;
          childSz = view.getUint32(trakScan + 8) * 4294967296 + view.getUint32(trakScan + 12);
        } else if (childSz === 0) {
          childSz = trakEnd - trakScan;
        }
        if (childSz < childHsz || trakScan + childSz > trakEnd) break;

        const childType = String.fromCharCode(moovData[trakScan + 4], moovData[trakScan + 5], moovData[trakScan + 6], moovData[trakScan + 7]);
        if (childType === 'tkhd' && childSz >= 92) {
          trackWidth = view.getUint32(trakScan + 84) >>> 16;
          trackHeight = view.getUint32(trakScan + 88) >>> 16;
        } else if (childType === 'mdia') {
          let mdiaScan = trakScan + childHsz;
          const mdiaEnd = trakScan + childSz;
          while (mdiaScan + 8 <= mdiaEnd) {
            let mSz = view.getUint32(mdiaScan);
            if (mSz < 8 || mdiaScan + mSz > mdiaEnd) break;
            const mType = String.fromCharCode(moovData[mdiaScan + 4], moovData[mdiaScan + 5], moovData[mdiaScan + 6], moovData[mdiaScan + 7]);
            if (mType === 'hdlr' && mSz >= 20) {
              const handlerType = String.fromCharCode(moovData[mdiaScan + 16], moovData[mdiaScan + 17], moovData[mdiaScan + 18], moovData[mdiaScan + 19]);
              if (handlerType === 'vide') {
                isVideo = true;
              }
            }
            mdiaScan += mSz;
          }
        }
        trakScan += childSz;
      }

      if (isVideo && trackWidth > 0 && trackHeight > 0) {
        return { width: trackWidth, height: trackHeight };
      }
    }
    pos += sz;
  }
  return { width: 1280, height: 720 };
}

export function updateOriginalChunkOffsets(
  view: DataView,
  bytes: Uint8Array,
  start: number,
  end: number,
  adjustOff: (off: number) => number,
  moovOffset: number,
  moovSize: number
): void {
  let pos = start;
  const moovOffBig = BigInt(moovOffset);
  const moovSizeBig = BigInt(moovSize);

  while (pos + 8 <= end) {
    let bsize = view.getUint32(pos);
    let bheader = 8;
    if (bsize === 1) {
      bheader = 16;
      const hi = view.getUint32(pos + 8);
      const lo = view.getUint32(pos + 12);
      bsize = hi * 4294967296 + lo;
    } else if (bsize === 0) {
      bsize = end - pos;
    }
    if (bsize < bheader || pos + bsize > end) break;

    const btype = String.fromCharCode(bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7]);

    if (btype === 'stco') {
      const count = view.getUint32(pos + 12);
      for (let i = 0; i < count; i++) {
        const offPos = pos + 16 + i * 4;
        if (offPos + 4 <= pos + bsize) {
          const oldOff = view.getUint32(offPos);
          view.setUint32(offPos, adjustOff(oldOff));
        }
      }
    } else if (btype === 'co64') {
      const count = view.getUint32(pos + 12);
      for (let i = 0; i < count; i++) {
        const offPos = pos + 16 + i * 8;
        if (offPos + 8 <= pos + bsize) {
          const oldOff = view.getBigUint64(offPos);
          const newOff = oldOff > moovOffBig ? oldOff - moovSizeBig : oldOff;
          view.setBigUint64(offPos, newOff);
        }
      }
    } else if (['trak', 'mdia', 'minf', 'stbl', 'edts'].includes(btype)) {
      updateOriginalChunkOffsets(view, bytes, pos + bheader, pos + bsize, adjustOff, moovOffset, moovSize);
    }

    pos += bsize;
  }
}

export async function muxSubtitlesIntoMp4(videoBlob: Blob, tracks: SubtitleTrackExport[]): Promise<Blob> {
  const buf = new Uint8Array(await videoBlob.arrayBuffer());
  let offset = 0;
  let moovBox: { offset: number; size: number; headerSize: number; data: Uint8Array } | null = null;
  const nonMoovBoxes: Uint8Array[] = [];

  while (offset + 8 <= buf.length) {
    let size = new DataView(buf.buffer, buf.byteOffset + offset, 4).getUint32(0);
    const type = String.fromCharCode(...buf.subarray(offset + 4, offset + 8));
    let headerSize = 8;
    if (size === 1) {
      headerSize = 16;
      const hi = new DataView(buf.buffer, buf.byteOffset + offset + 8, 4).getUint32(0);
      const lo = new DataView(buf.buffer, buf.byteOffset + offset + 12, 4).getUint32(0);
      size = hi * 4294967296 + lo;
    } else if (size === 0) {
      size = buf.length - offset;
    }
    if (size < headerSize || offset + size > buf.length) break;

    const boxBytes = buf.subarray(offset, offset + size);
    if (type === 'moov') {
      moovBox = { offset, size, headerSize, data: boxBytes };
    } else {
      nonMoovBoxes.push(boxBytes);
    }
    offset += size;
  }
  if (!moovBox || tracks.length === 0) return videoBlob;

  const baseFile = concatBuffers(nonMoovBoxes);
  const subMdatStart = baseFile.length;

  const moovData = moovBox.data.slice();
  const moovView = new DataView(moovData.buffer, moovData.byteOffset, moovData.byteLength);
  const moovOffset = moovBox.offset;
  const moovSize = moovBox.size;
  const adjustOff = (oldOff: number) => (oldOff > moovOffset ? oldOff - moovSize : oldOff);

  const moovHeaderSize = moovBox.headerSize;
  updateOriginalChunkOffsets(moovView, moovData, moovHeaderSize, moovData.length, adjustOff, moovOffset, moovSize);
  const { width: videoWidth, height: videoHeight } = parseVideoDimensions(moovData, moovHeaderSize);

  let mvhdPos = -1;
  let scan = moovHeaderSize;
  while (scan + 8 <= moovData.length) {
    const sz = moovView.getUint32(scan);
    const type = String.fromCharCode(moovData[scan + 4], moovData[scan + 5], moovData[scan + 6], moovData[scan + 7]);
    if (type === 'mvhd') { mvhdPos = scan; break; }
    if (sz < 8 || scan + sz > moovData.length) break;
    scan += sz;
  }

  let movieTimescale = 1000;
  let movieDuration = 60000;
  let nextTrackId = 3;
  if (mvhdPos !== -1) {
    const v = moovData[mvhdPos + 8];
    if (v === 0) {
      movieTimescale = moovView.getUint32(mvhdPos + 8 + 12) || 1000;
      movieDuration = moovView.getUint32(mvhdPos + 8 + 16) || 60000;
      nextTrackId = moovView.getUint32(mvhdPos + 8 + 96) || 3;
    } else {
      movieTimescale = moovView.getUint32(mvhdPos + 8 + 20) || 1000;
      movieDuration = Number(moovView.getBigUint64(mvhdPos + 8 + 24)) || 60000;
      nextTrackId = moovView.getUint32(mvhdPos + 8 + 108) || 3;
    }
  }
  const movieDurationSec = movieDuration / movieTimescale;

  let subPayloadOffset = 0;
  const allPayloads: Uint8Array[] = [];
  const newTraks: Uint8Array[] = [];
  let isFirstSubTrack = true;

  for (const track of tracks) {
    const trackId = nextTrackId++;
    const sortedCues = [...track.cues].sort((a, b) => a.start - b.start);
    let curTimeSec = 0;
    const samples: { durationMs: number; size: number; offset: number }[] = [];

    for (const cue of sortedCues) {
      const rawStart = Number.isFinite(cue.start) && cue.start >= 0 ? cue.start : curTimeSec;
      const cueStart = Math.max(curTimeSec, rawStart);
      const rawEnd = Number.isFinite(cue.end) && cue.end > cueStart ? cue.end : cueStart + 2.0;
      const cueEnd = Math.max(cueStart + 0.1, rawEnd);

      if (cueStart > curTimeSec) {
        const gapMs = Math.round((cueStart - curTimeSec) * 1000);
        if (gapMs > 0) {
          const off = subMdatStart + 8 + subPayloadOffset;
          allPayloads.push(new Uint8Array([0, 0]));
          samples.push({ durationMs: gapMs, size: 2, offset: off });
          subPayloadOffset += 2;
        }
      }

      const durMs = Math.max(100, Math.round((cueEnd - cueStart) * 1000));
      const text = getCueTextForExport(cue, track.mode || 'target');
      const utf8 = new TextEncoder().encode(text);
      const p = new Uint8Array(2 + utf8.length);
      p[0] = (utf8.length >> 8) & 0xFF;
      p[1] = utf8.length & 0xFF;
      p.set(utf8, 2);

      const off = subMdatStart + 8 + subPayloadOffset;
      allPayloads.push(p);
      samples.push({ durationMs: durMs, size: p.length, offset: off });
      subPayloadOffset += p.length;
      curTimeSec = cueStart + (durMs / 1000);
    }

    if (curTimeSec < movieDurationSec) {
      const trailMs = Math.round((movieDurationSec - curTimeSec) * 1000);
      if (trailMs > 0) {
        const off = subMdatStart + 8 + subPayloadOffset;
        allPayloads.push(new Uint8Array([0, 0]));
        samples.push({ durationMs: trailMs, size: 2, offset: off });
        subPayloadOffset += 2;
      }
    }

    const tkhd = buildTkhd(trackId, movieDuration, videoWidth, videoHeight, isFirstSubTrack);
    isFirstSubTrack = false;

    const mdhd = new Uint8Array(24);
    const mv = new DataView(mdhd.buffer);
    mv.setUint32(12, 1000);
    mv.setUint32(16, samples.reduce((a, s) => a + s.durationMs, 0));
    mv.setUint16(20, packIso639Language(track.language));

    const hdlrPre = new Uint8Array([
      0, 0, 0, 0, 0, 0, 0, 0,
      115, 98, 116, 108,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    ]);
    const hdlr = mp4Box('hdlr', concatBuffers([hdlrPre, new TextEncoder().encode(`${track.title}\0`)]));

    const dref = mp4Box('dref', concatBuffers([
      new Uint8Array([0, 0, 0, 0, 0, 0, 0, 1]),
      mp4Box('url ', new Uint8Array([0, 0, 0, 1]))
    ]));

    const stsd = mp4Box('stsd', concatBuffers([
      new Uint8Array([0, 0, 0, 0, 0, 0, 0, 1]),
      buildTx3gBox(videoWidth, videoHeight)
    ]));

    const stts = new Uint8Array(8 + samples.length * 8);
    const sttsv = new DataView(stts.buffer);
    sttsv.setUint32(4, samples.length);
    samples.forEach((s, i) => { sttsv.setUint32(8 + i * 8, 1); sttsv.setUint32(12 + i * 8, s.durationMs); });

    const stsc = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
    const stsz = new Uint8Array(12 + samples.length * 4);
    const stszv = new DataView(stsz.buffer);
    stszv.setUint32(8, samples.length);
    samples.forEach((s, i) => stszv.setUint32(12 + i * 4, s.size));

    const stco = new Uint8Array(8 + samples.length * 4);
    const stcov = new DataView(stco.buffer);
    stcov.setUint32(4, samples.length);
    samples.forEach((s, i) => stcov.setUint32(8 + i * 4, s.offset));

    const stbl = mp4Box('stbl', concatBuffers([stsd, mp4Box('stts', stts), mp4Box('stsc', stsc), mp4Box('stsz', stsz), mp4Box('stco', stco)]));
    const minf = mp4Box('minf', concatBuffers([mp4Box('nmhd', new Uint8Array(4)), mp4Box('dinf', concatBuffers([dref])), stbl]));
    const udta = mp4Box('udta', mp4Box('name', new TextEncoder().encode(`${track.title}\0`)));
    newTraks.push(mp4Box('trak', concatBuffers([tkhd, mp4Box('mdia', concatBuffers([mp4Box('mdhd', mdhd), hdlr, minf])), udta])));
  }

  if (mvhdPos !== -1) {
    const v = moovData[mvhdPos + 8];
    if (v === 0) moovView.setUint32(mvhdPos + 8 + 96, nextTrackId);
    else moovView.setUint32(mvhdPos + 8 + 108, nextTrackId);
  }

  const updatedMoovPayload = concatBuffers([moovData.subarray(moovHeaderSize), ...newTraks]);
  return new Blob([
    baseFile as BlobPart,
    mp4Box('mdat', concatBuffers(allPayloads)) as BlobPart,
    mp4Box('moov', updatedMoovPayload) as BlobPart
  ], { type: 'video/mp4' });
}
