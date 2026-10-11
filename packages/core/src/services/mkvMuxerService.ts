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

export function toIso639_2(lang: string): string {
  const clean = (lang || '').toLowerCase().replace(/^a\./, '').split('-')[0];
  return ISO_639_2_MAP[clean] || (clean.length === 3 ? clean : 'und');
}

/**
 * EBML Variable-length Integer (VINT) encoder.
 */
export function encodeVint(val: number): Uint8Array {
  if (val < 0x7F) {
    return new Uint8Array([0x80 | val]);
  } else if (val < 0x3FFF) {
    return new Uint8Array([0x40 | (val >> 8), val & 0xFF]);
  } else if (val < 0x1FFFFF) {
    return new Uint8Array([0x20 | (val >> 16), (val >> 8) & 0xFF, val & 0xFF]);
  } else if (val < 0x0FFFFFFF) {
    return new Uint8Array([0x10 | (val >> 24), (val >> 16) & 0xFF, (val >> 8) & 0xFF, val & 0xFF]);
  } else {
    const hi = Math.floor(val / 0x100000000);
    const lo = val >>> 0;
    return new Uint8Array([
      0x01, (hi >> 16) & 0xFF, (hi >> 8) & 0xFF, hi & 0xFF,
      (lo >> 24) & 0xFF, (lo >> 16) & 0xFF, (lo >> 8) & 0xFF, lo & 0xFF
    ]);
  }
}

function ebmlElement(id: number[], payload: Uint8Array): Uint8Array {
  const sizeBytes = encodeVint(payload.length);
  const out = new Uint8Array(id.length + sizeBytes.length + payload.length);
  out.set(id, 0);
  out.set(sizeBytes, id.length);
  out.set(payload, id.length + sizeBytes.length);
  return out;
}

export function ebmlUint(id: number[], val: number): Uint8Array {
  const safeVal = Math.max(0, Math.floor(val));
  let bytes: number[];
  if (safeVal <= 0xFF) bytes = [safeVal];
  else if (safeVal <= 0xFFFF) bytes = [(safeVal >> 8) & 0xFF, safeVal & 0xFF];
  else if (safeVal <= 0xFFFFFF) bytes = [(safeVal >> 16) & 0xFF, (safeVal >> 8) & 0xFF, safeVal & 0xFF];
  else bytes = [(safeVal >> 24) & 0xFF, (safeVal >> 16) & 0xFF, (safeVal >> 8) & 0xFF, safeVal & 0xFF];
  return ebmlElement(id, new Uint8Array(bytes));
}

export function ebmlString(id: number[], str: string): Uint8Array {
  return ebmlElement(id, new TextEncoder().encode(str));
}

function ebmlFloat64(id: number[], val: number): Uint8Array {
  const buf = new Uint8Array(8);
  new DataView(buf.buffer).setFloat64(0, val, false);
  return ebmlElement(id, buf);
}

function concatBuffers(buffers: Uint8Array[]): Uint8Array {
  const total = buffers.reduce((acc, b) => acc + b.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const b of buffers) {
    out.set(b, offset);
    offset += b.length;
  }
  return out;
}

const AAC_SAMPLE_RATES = [
  96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350
];

function generateAacAudioSpecificConfig(sampleRate: number, channels: number): Uint8Array {
  const rateIdx = AAC_SAMPLE_RATES.indexOf(sampleRate);
  const freqIndex = rateIdx !== -1 ? rateIdx : 4;
  const chanConfig = Math.max(1, Math.min(8, channels || 2));
  const byte1 = (2 << 3) | ((freqIndex >> 1) & 0x07);
  const byte2 = ((freqIndex & 0x01) << 7) | ((chanConfig & 0x0F) << 3);
  return new Uint8Array([byte1, byte2]);
}

function extractAacAudioSpecificConfig(payload: Uint8Array, fallbackRate: number, fallbackChannels: number): Uint8Array {
  try {
    let p = 0;
    while (p < payload.length) {
      if (payload[p] === 0x05) {
        let offset = p + 1;
        let len = 0;
        let count = 0;
        while (offset < payload.length && count < 4) {
          const b = payload[offset++];
          len = (len << 7) | (b & 0x7F);
          count++;
          if ((b & 0x80) === 0) break;
        }
        if (len > 0 && offset + len <= payload.length) {
          return payload.subarray(offset, offset + len);
        }
      }
      p++;
    }
  } catch {}
  return generateAacAudioSpecificConfig(fallbackRate, fallbackChannels);
}

interface Mp4SampleInfo {
  trackNumber: number;
  offset: number;
  size: number;
  timeMs: number;
  isKeyframe: boolean;
}

interface ParsedMp4Track {
  trackId: number;
  type: 'video' | 'audio';
  timescale: number;
  durationMs: number;
  width?: number;
  height?: number;
  sampleRate?: number;
  channels?: number;
  codecPrivate?: Uint8Array;
  samples: Mp4SampleInfo[];
}

function parseMp4Tracks(buf: Uint8Array): { durationMs: number; tracks: ParsedMp4Track[] } {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let moovOffset = -1;
  let moovSize = 0;
  let offset = 0;

  while (offset + 8 <= buf.length) {
    let size = view.getUint32(offset);
    const type = String.fromCharCode(...buf.subarray(offset + 4, offset + 8));
    let headerSize = 8;
    if (size === 1 && offset + 16 <= buf.length) {
      headerSize = 16;
      size = view.getUint32(offset + 8) * 4294967296 + view.getUint32(offset + 12);
    } else if (size === 0) {
      size = buf.length - offset;
    }
    if (size < headerSize || offset + size > buf.length) break;

    if (type === 'moov') {
      moovOffset = offset;
      moovSize = size;
      break;
    }
    offset += size;
  }

  if (moovOffset === -1) {
    return { durationMs: 0, tracks: [] };
  }

  let movieDurationMs = 0;
  const tracks: ParsedMp4Track[] = [];

  // Parse mvhd for movie timescale and duration
  let scan = moovOffset + 8;
  const moovEnd = moovOffset + moovSize;

  while (scan + 8 <= moovEnd) {
    const boxSize = view.getUint32(scan);
    const boxType = String.fromCharCode(...buf.subarray(scan + 4, scan + 8));
    if (boxSize < 8 || scan + boxSize > moovEnd) break;

    if (boxType === 'mvhd') {
      const v = buf[scan + 8];
      const timescale = v === 0 ? view.getUint32(scan + 8 + 12) : view.getUint32(scan + 8 + 20);
      const duration = v === 0 ? view.getUint32(scan + 8 + 16) : Number(view.getBigUint64(scan + 8 + 24));
      if (timescale > 0) {
        movieDurationMs = (duration / timescale) * 1000;
      }
    } else if (boxType === 'trak') {
      try {
        const parsedTrak = parseTrakBox(buf, scan, boxSize);
        if (parsedTrak) {
          tracks.push(parsedTrak);
        }
      } catch (err) {
        console.debug('Skip trak parse error:', err);
      }
    }
    scan += boxSize;
  }

  return { durationMs: movieDurationMs, tracks };
}

function parseTrakBox(buf: Uint8Array, trakOffset: number, trakSize: number): ParsedMp4Track | null {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const trakEnd = trakOffset + trakSize;
  let scan = trakOffset + 8;

  let trackId = 1;
  let width = 1280;
  let height = 720;
  let handlerType = '';
  let timescale = 1000;
  let durationMs = 0;
  let sampleRate = 44100;
  let channels = 2;
  let codecPrivate: Uint8Array | undefined;

  let sttsTable: { count: number; delta: number }[] = [];
  let stszTable: number[] = [];
  let stcoTable: number[] = [];
  let stscTable: { firstChunk: number; samplesPerChunk: number }[] = [];
  const stssSet = new Set<number>();
  let cttsTable: number[] = [];

  function walk(pos: number, end: number) {
    let p = pos;
    while (p + 8 <= end) {
      let sz = view.getUint32(p);
      let hsz = 8;
      if (sz === 1 && p + 16 <= end) {
        hsz = 16;
        sz = view.getUint32(p + 8) * 4294967296 + view.getUint32(p + 12);
      } else if (sz === 0) {
        sz = end - p;
      }
      if (sz < hsz || p + sz > end) break;
      const type = String.fromCharCode(...buf.subarray(p + 4, p + 8));

      if (type === 'tkhd' && sz >= 92) {
        trackId = view.getUint32(p + 20);
        width = view.getUint32(p + 84) >>> 16;
        height = view.getUint32(p + 88) >>> 16;
      } else if (type === 'mdhd' && sz >= 24) {
        const v = buf[p + 8];
        timescale = v === 0 ? view.getUint32(p + 20) : view.getUint32(p + 28);
        const dur = v === 0 ? view.getUint32(p + 24) : Number(view.getBigUint64(p + 32));
        if (timescale > 0) durationMs = (dur / timescale) * 1000;
      } else if (type === 'hdlr' && sz >= 20) {
        handlerType = String.fromCharCode(...buf.subarray(p + 16, p + 20));
      } else if (type === 'stsd' && sz >= 16) {
        // Sample description table
        const entryCount = view.getUint32(p + 12);
        let entryPos = p + 16;
        for (let i = 0; i < entryCount && entryPos + 8 <= p + sz; i++) {
          const entrySz = view.getUint32(entryPos);
          const entryFmt = String.fromCharCode(...buf.subarray(entryPos + 4, entryPos + 8));
          if ((entryFmt === 'avc1' || entryFmt === 'avc3') && entrySz >= 86) {
            // Locate avcC box inside avc1 or avc3
            let avcScan = entryPos + 86;
            const avcEnd = entryPos + entrySz;
            while (avcScan + 8 <= avcEnd) {
              const childSz = view.getUint32(avcScan);
              const childType = String.fromCharCode(...buf.subarray(avcScan + 4, avcScan + 8));
              if (childType === 'avcC' && childSz >= 8 && avcScan + childSz <= avcEnd) {
                codecPrivate = buf.subarray(avcScan + 8, avcScan + childSz);
                break;
              }
              if (childSz < 8) break;
              avcScan += childSz;
            }
          } else if (entryFmt === 'mp4a' && entrySz >= 36) {
            channels = view.getUint16(entryPos + 24);
            sampleRate = view.getUint32(entryPos + 32) >>> 16;
            // Locate esds inside mp4a
            let aScan = entryPos + 36;
            const aEnd = entryPos + entrySz;
            while (aScan + 8 <= aEnd) {
              const cSz = view.getUint32(aScan);
              const cType = String.fromCharCode(...buf.subarray(aScan + 4, aScan + 8));
              if (cType === 'esds' && cSz >= 12 && aScan + cSz <= aEnd) {
                const esdsPayload = buf.subarray(aScan + 12, aScan + cSz);
                codecPrivate = extractAacAudioSpecificConfig(esdsPayload, sampleRate, channels);
                break;
              }
              if (cSz < 8) break;
              aScan += cSz;
            }
            if (!codecPrivate) {
              codecPrivate = generateAacAudioSpecificConfig(sampleRate, channels);
            }
          }
          if (entrySz < 8) break;
          entryPos += entrySz;
        }
      } else if (type === 'stts' && sz >= 16) {
        const count = view.getUint32(p + 12);
        let ptr = p + 16;
        for (let i = 0; i < count && ptr + 8 <= p + sz; i++) {
          sttsTable.push({ count: view.getUint32(ptr), delta: view.getUint32(ptr + 4) });
          ptr += 8;
        }
      } else if (type === 'stsz' && sz >= 20) {
        const defaultSize = view.getUint32(p + 12);
        const sampleCount = view.getUint32(p + 16);
        if (defaultSize > 0) {
          stszTable = new Array(sampleCount).fill(defaultSize);
        } else {
          let ptr = p + 20;
          for (let i = 0; i < sampleCount && ptr + 4 <= p + sz; i++) {
            stszTable.push(view.getUint32(ptr));
            ptr += 4;
          }
        }
      } else if (type === 'stco' && sz >= 16) {
        const count = view.getUint32(p + 12);
        let ptr = p + 16;
        for (let i = 0; i < count && ptr + 4 <= p + sz; i++) {
          stcoTable.push(view.getUint32(ptr));
          ptr += 4;
        }
      } else if (type === 'co64' && sz >= 16) {
        const count = view.getUint32(p + 12);
        let ptr = p + 16;
        for (let i = 0; i < count && ptr + 8 <= p + sz; i++) {
          stcoTable.push(Number(view.getBigUint64(ptr)));
          ptr += 8;
        }
      } else if (type === 'stsc' && sz >= 16) {
        const count = view.getUint32(p + 12);
        let ptr = p + 16;
        for (let i = 0; i < count && ptr + 12 <= p + sz; i++) {
          stscTable.push({ firstChunk: view.getUint32(ptr), samplesPerChunk: view.getUint32(ptr + 4) });
          ptr += 12;
        }
      } else if (type === 'stss' && sz >= 16) {
        const count = view.getUint32(p + 12);
        let ptr = p + 16;
        for (let i = 0; i < count && ptr + 4 <= p + sz; i++) {
          stssSet.add(view.getUint32(ptr));
          ptr += 4;
        }
      } else if (type === 'ctts' && sz >= 16) {
        const count = view.getUint32(p + 12);
        let ptr = p + 16;
        for (let i = 0; i < count && ptr + 8 <= p + sz; i++) {
          const sampleCount = view.getUint32(ptr);
          const offsetVal = view.getUint32(ptr + 4);
          for (let j = 0; j < sampleCount; j++) cttsTable.push(offsetVal);
          ptr += 8;
        }
      } else if (['mdia', 'minf', 'stbl'].includes(type)) {
        walk(p + hsz, p + sz);
      }

      p += sz;
    }
  }

  walk(scan, trakEnd);

  if (handlerType !== 'vide' && handlerType !== 'soun') {
    return null;
  }

  // Build samples from tables
  const samples: Mp4SampleInfo[] = [];
  if (stszTable.length > 0 && stcoTable.length > 0) {
    let currentSampleIdx = 0;
    let currentDts = 0;
    let sttsEntryIdx = 0;
    let sttsConsumedInEntry = 0;

    for (let chunkIdx = 0; chunkIdx < stcoTable.length; chunkIdx++) {
      const chunkNumber = chunkIdx + 1;
      let samplesInThisChunk = 1;
      for (let s = 0; s < stscTable.length; s++) {
        if (chunkNumber >= stscTable[s].firstChunk) {
          samplesInThisChunk = stscTable[s].samplesPerChunk;
        }
      }

      let chunkOffsetRunning = stcoTable[chunkIdx];
      for (let sInChunk = 0; sInChunk < samplesInThisChunk && currentSampleIdx < stszTable.length; sInChunk++) {
        const sampleSize = stszTable[currentSampleIdx];
        const isKey = stssSet.size > 0 ? stssSet.has(currentSampleIdx + 1) : true;
        const pts = currentDts + (cttsTable[currentSampleIdx] || 0);
        const timeMs = timescale > 0 ? (pts / timescale) * 1000 : 0;

        samples.push({
          trackNumber: handlerType === 'vide' ? 1 : 2,
          offset: chunkOffsetRunning,
          size: sampleSize,
          timeMs,
          isKeyframe: isKey
        });

        chunkOffsetRunning += sampleSize;
        if (sttsTable[sttsEntryIdx]) {
          currentDts += sttsTable[sttsEntryIdx].delta;
          sttsConsumedInEntry++;
          if (sttsConsumedInEntry >= sttsTable[sttsEntryIdx].count) {
            sttsEntryIdx++;
            sttsConsumedInEntry = 0;
          }
        }
        currentSampleIdx++;
      }
    }
  }

  return {
    trackId,
    type: handlerType === 'vide' ? 'video' : 'audio',
    timescale,
    durationMs,
    width,
    height,
    sampleRate,
    channels,
    codecPrivate,
    samples
  };
}

/**
 * Encodes a SimpleBlock for video or audio frame.
 */
function createSimpleBlock(trackNumber: number, relativeTimeMs: number, isKeyframe: boolean, frameData: Uint8Array): Uint8Array {
  const trackNumVint = encodeVint(trackNumber);
  const header = new Uint8Array(trackNumVint.length + 3);
  header.set(trackNumVint, 0);

  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  const clampedRelTime = Math.max(-32768, Math.min(32767, Math.round(relativeTimeMs)));
  view.setInt16(trackNumVint.length, clampedRelTime, false);
  header[trackNumVint.length + 2] = isKeyframe ? 0x80 : 0x00;

  const payload = new Uint8Array(header.length + frameData.length);
  payload.set(header, 0);
  payload.set(frameData, header.length);

  return ebmlElement([0xA3], payload);
}

/**
 * Encodes a BlockGroup containing a subtitle Block and BlockDuration.
 */
function createSubtitleBlockGroup(trackNumber: number, relativeTimeMs: number, durationMs: number, text: string): Uint8Array {
  const trackNumVint = encodeVint(trackNumber);
  const textBytes = new TextEncoder().encode(text);

  const blockHeader = new Uint8Array(trackNumVint.length + 3);
  blockHeader.set(trackNumVint, 0);
  const view = new DataView(blockHeader.buffer, blockHeader.byteOffset, blockHeader.byteLength);
  const clampedRelTime = Math.max(-32768, Math.min(32767, Math.round(relativeTimeMs)));
  view.setInt16(trackNumVint.length, clampedRelTime, false);
  blockHeader[trackNumVint.length + 2] = 0x00;

  const blockPayload = new Uint8Array(blockHeader.length + textBytes.length);
  blockPayload.set(blockHeader, 0);
  blockPayload.set(textBytes, blockHeader.length);
  const blockEl = ebmlElement([0xA1], blockPayload);

  const durationEl = ebmlUint([0x9B], Math.max(1, Math.round(durationMs)));
  return ebmlElement([0xA0], concatBuffers([blockEl, durationEl]));
}

/**
 * Builds Matroska Tracks Element (0x1654AE6B).
 */
function buildTracksElement(
  hasVideo: boolean,
  hasAudio: boolean,
  videoWidth: number,
  videoHeight: number,
  audioSampleRate: number,
  audioChannels: number,
  videoCodecPrivate?: Uint8Array,
  audioCodecPrivate?: Uint8Array,
  subtitleTracks: SubtitleTrackExport[] = []
): Uint8Array {
  const entries: Uint8Array[] = [];

  // Track 1: Video
  if (hasVideo) {
    const videoSettings = concatBuffers([
      ebmlUint([0xB0], videoWidth || 1280),
      ebmlUint([0xBA], videoHeight || 720)
    ]);
    const trackPayload: Uint8Array[] = [
      ebmlUint([0xD7], 1), // TrackNumber
      ebmlUint([0x73, 0xC5], 1), // TrackUID
      ebmlUint([0x83], 1), // TrackType: Video
      ebmlUint([0x88], 1), // FlagDefault: 1
      ebmlString([0x86], 'V_MPEG4/ISO/AVC'),
      ebmlElement([0xE0], videoSettings)
    ];
    if (videoCodecPrivate && videoCodecPrivate.length > 0) {
      trackPayload.push(ebmlElement([0x63, 0xA2], videoCodecPrivate));
    }
    entries.push(ebmlElement([0xAE], concatBuffers(trackPayload)));
  }

  // Track 2: Audio
  if (hasAudio) {
    const audioSettings = concatBuffers([
      ebmlFloat64([0xB5], audioSampleRate || 44100),
      ebmlUint([0x9F], audioChannels || 2)
    ]);
    const audioPayload: Uint8Array[] = [
      ebmlUint([0xD7], 2),
      ebmlUint([0x73, 0xC5], 2),
      ebmlUint([0x83], 2), // TrackType: Audio
      ebmlUint([0x88], 1),
      ebmlString([0x86], 'A_AAC'),
      ebmlElement([0xE1], audioSettings)
    ];
    if (audioCodecPrivate && audioCodecPrivate.length > 0) {
      audioPayload.push(ebmlElement([0x63, 0xA2], audioCodecPrivate));
    }
    entries.push(ebmlElement([0xAE], concatBuffers(audioPayload)));
  }

  // Track 3..N: Subtitles
  subtitleTracks.forEach((st, idx) => {
    const trackNum = 3 + idx;
    const isoCode = toIso639_2(st.language);
    const subPayload: Uint8Array[] = [
      ebmlUint([0xD7], trackNum),
      ebmlUint([0x73, 0xC5], trackNum),
      ebmlUint([0x83], 0x11), // TrackType: Subtitle (17)
      ebmlUint([0x88], idx === 0 ? 1 : 0), // FlagDefault: first subtitle track active
      ebmlString([0x86], 'S_TEXT/UTF8'),
      ebmlString([0x53, 0x6E], st.title || `${st.language.toUpperCase()} Subtitles`),
      ebmlString([0x22, 0xB5, 0x9C], isoCode)
    ];
    entries.push(ebmlElement([0xAE], concatBuffers(subPayload)));
  });

  return ebmlElement([0x16, 0x54, 0xAE, 0x6B], concatBuffers(entries));
}

/**
 * Muxes video blob and subtitle tracks into a genuine Matroska (.mkv) container.
 */
export async function muxSubtitlesIntoMkv(videoBlob: Blob, tracks: SubtitleTrackExport[]): Promise<Blob> {
  const buf = new Uint8Array(await videoBlob.arrayBuffer());

  try {
    const { durationMs, tracks: mp4Tracks } = parseMp4Tracks(buf);
    const videoTrack = mp4Tracks.find(t => t.type === 'video');
    const audioTrack = mp4Tracks.find(t => t.type === 'audio');

    // EBML Header
    const ebmlHeader = ebmlElement([0x1A, 0x45, 0xDF, 0xA3], concatBuffers([
      ebmlUint([0x42, 0x86], 1),
      ebmlUint([0x42, 0xF7], 1),
      ebmlUint([0x42, 0xF2], 4),
      ebmlUint([0x42, 0xF3], 8),
      ebmlString([0x42, 0x82], 'matroska'),
      ebmlUint([0x42, 0x87], 4),
      ebmlUint([0x42, 0x85], 2)
    ]));

    const effectiveDurationMs = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 60000;

    // Segment Info (0x1549A966)
    const segmentInfo = ebmlElement([0x15, 0x49, 0xA9, 0x66], concatBuffers([
      ebmlUint([0x2A, 0xD7, 0xB1], 1000000), // TimecodeScale = 1ms
      ebmlString([0x4D, 0x80], 'Lexiduo'),
      ebmlString([0x57, 0x41], 'Lexiduo'),
      ebmlFloat64([0x44, 0x89], effectiveDurationMs)
    ]));

    // Tracks element
    const tracksElement = buildTracksElement(
      Boolean(videoTrack),
      Boolean(audioTrack),
      videoTrack?.width || 1280,
      videoTrack?.height || 720,
      audioTrack?.sampleRate || 44100,
      audioTrack?.channels || 2,
      videoTrack?.codecPrivate,
      audioTrack?.codecPrivate,
      tracks
    );

    // Collect and sort all media samples
    const allSamples: Mp4SampleInfo[] = [];
    if (videoTrack) allSamples.push(...videoTrack.samples);
    if (audioTrack) allSamples.push(...audioTrack.samples);
    allSamples.sort((a, b) => a.timeMs - b.timeMs);

    // Build subtitle cues map per track
    const subCuesByTrack = tracks.map((t, idx) => ({
      trackNumber: 3 + idx,
      cues: t.cues.map(c => ({
        ...c,
        text: getCueTextForExport(c, t.mode || 'target')
      }))
    }));

    // Cluster generation: split into ~2000ms clusters
    const clusters: Uint8Array[] = [];
    const CLUSTER_WINDOW_MS = 2000;
    let sampleIdx = 0;
    let currentClusterTime = 0;

    let maxTimeMs = effectiveDurationMs;
    if (allSamples.length > 0) {
      const lastSampleTime = allSamples[allSamples.length - 1].timeMs;
      if (Number.isFinite(lastSampleTime) && lastSampleTime > 0) {
        maxTimeMs = Math.max(maxTimeMs, lastSampleTime);
      }
    }
    for (const st of subCuesByTrack) {
      for (const cue of st.cues) {
        const rawEnd = Number.isFinite(cue.end) && cue.end >= 0
          ? cue.end
          : (Number.isFinite(cue.start) && cue.start >= 0 ? cue.start + 2.0 : 2.0);
        maxTimeMs = Math.max(maxTimeMs, rawEnd * 1000);
      }
    }

    while (currentClusterTime <= maxTimeMs || sampleIdx < allSamples.length) {
      const clusterEnd = currentClusterTime + CLUSTER_WINDOW_MS;
      const clusterBlocks: Uint8Array[] = [
        ebmlUint([0xE7], Math.round(currentClusterTime)) // Cluster Timestamp
      ];

      // Add media samples falling in this window
      while (sampleIdx < allSamples.length && allSamples[sampleIdx].timeMs < clusterEnd) {
        const s = allSamples[sampleIdx];
        const frameData = buf.subarray(s.offset, s.offset + s.size);
        const relTime = s.timeMs - currentClusterTime;
        clusterBlocks.push(createSimpleBlock(s.trackNumber, relTime, s.isKeyframe, frameData));
        sampleIdx++;
      }

      // Add subtitle cues starting in this window
      for (const st of subCuesByTrack) {
        for (const cue of st.cues) {
          const rawStart = Number.isFinite(cue.start) && cue.start >= 0 ? cue.start : 0;
          const cueStartMs = rawStart * 1000;
          if (cueStartMs >= currentClusterTime && cueStartMs < clusterEnd && cue.text) {
            const relTime = cueStartMs - currentClusterTime;
            const rawEnd = Number.isFinite(cue.end) && cue.end > rawStart ? cue.end : rawStart + 2.0;
            const durMs = Math.max(100, Math.round((rawEnd - rawStart) * 1000));
            clusterBlocks.push(createSubtitleBlockGroup(st.trackNumber, relTime, durMs, cue.text));
          }
        }
      }

      clusters.push(ebmlElement([0x1F, 0x43, 0xB6, 0x75], concatBuffers(clusterBlocks)));
      currentClusterTime += CLUSTER_WINDOW_MS;
    }

    // Segment wrapper (0x18538067)
    const segmentPayload = concatBuffers([segmentInfo, tracksElement, ...clusters]);
    const segmentElement = ebmlElement([0x18, 0x53, 0x80, 0x67], segmentPayload);

    return new Blob([ebmlHeader as BlobPart, segmentElement as BlobPart], { type: 'video/x-matroska' });
  } catch (err) {
    console.warn('MKV native remux error:', err);
    throw err;
  }
}
