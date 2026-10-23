export interface Fmp4SampleInfo {
  trackNumber: number;
  offset: number;
  size: number;
  timeMs: number;
  dtsMs: number;
  isKeyframe: boolean;
}

/**
 * Parses fragmented MP4 (fMP4) movie fragments (moof -> traf -> tfhd/tfdt/trun)
 * and extracts all media samples with their byte offsets and timestamps.
 */
export function parseFmp4Samples(
  buf: Uint8Array,
  trackTimescales: Map<number, number>,
  trackTypeMap: Map<number, 'video' | 'audio'>
): Map<number, Fmp4SampleInfo[]> {
  const samplesByTrack = new Map<number, Fmp4SampleInfo[]>();
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let offset = 0;

  while (offset + 8 <= buf.length) {
    let size = view.getUint32(offset);
    let headerSize = 8;
    if (size === 1 && offset + 16 <= buf.length) {
      headerSize = 16;
      size = view.getUint32(offset + 8) * 4294967296 + view.getUint32(offset + 12);
    } else if (size === 0) {
      size = buf.length - offset;
    }
    if (size < headerSize || offset + size > buf.length) break;

    const type = String.fromCharCode(...buf.subarray(offset + 4, offset + 8));

    if (type === 'moof') {
      const moofOffset = offset;
      const moofEnd = offset + size;
      let scan = offset + headerSize;

      while (scan + 8 <= moofEnd) {
        let childSize = view.getUint32(scan);
        let childHdrSize = 8;
        if (childSize === 1 && scan + 16 <= moofEnd) {
          childHdrSize = 16;
          childSize = view.getUint32(scan + 8) * 4294967296 + view.getUint32(scan + 12);
        } else if (childSize === 0) {
          childSize = moofEnd - scan;
        }
        if (childSize < childHdrSize || scan + childSize > moofEnd) break;

        const childType = String.fromCharCode(...buf.subarray(scan + 4, scan + 8));

        if (childType === 'traf') {
          parseTrafBox(
            buf,
            view,
            scan,
            childSize,
            moofOffset,
            trackTimescales,
            trackTypeMap,
            samplesByTrack
          );
        }

        scan += childSize;
      }
    }

    offset += size;
  }

  return samplesByTrack;
}

function parseTrafBox(
  buf: Uint8Array,
  view: DataView,
  trafOffset: number,
  trafSize: number,
  moofOffset: number,
  trackTimescales: Map<number, number>,
  trackTypeMap: Map<number, 'video' | 'audio'>,
  outSamples: Map<number, Fmp4SampleInfo[]>
): void {
  const trafEnd = trafOffset + trafSize;
  let p = trafOffset + 8;

  let trackId = 1;
  let baseDataOffset = moofOffset;
  let defaultSampleDuration = 1000;
  let defaultSampleSize = 0;
  let defaultSampleFlags = 0;
  let baseMediaDecodeTime = 0;

  interface TrunBox {
    pos: number;
    size: number;
  }
  const truns: TrunBox[] = [];

  while (p + 8 <= trafEnd) {
    const boxSize = view.getUint32(p);
    const boxType = String.fromCharCode(...buf.subarray(p + 4, p + 8));
    if (boxSize < 8 || p + boxSize > trafEnd) break;

    if (boxType === 'tfhd' && boxSize >= 16) {
      const versionAndFlags = view.getUint32(p + 8);
      const flags = versionAndFlags & 0x00FFFFFF;
      trackId = view.getUint32(p + 12);

      let cur = p + 16;
      if ((flags & 0x000001) !== 0 && cur + 8 <= p + boxSize) {
        // base-data-offset-present
        const hi = view.getUint32(cur);
        const lo = view.getUint32(cur + 4);
        baseDataOffset = hi * 4294967296 + lo;
        cur += 8;
      }
      if ((flags & 0x000002) !== 0 && cur + 4 <= p + boxSize) {
        // sample-description-index-present
        cur += 4;
      }
      if ((flags & 0x000008) !== 0 && cur + 4 <= p + boxSize) {
        defaultSampleDuration = view.getUint32(cur);
        cur += 4;
      }
      if ((flags & 0x000010) !== 0 && cur + 4 <= p + boxSize) {
        defaultSampleSize = view.getUint32(cur);
        cur += 4;
      }
      if ((flags & 0x000020) !== 0 && cur + 4 <= p + boxSize) {
        defaultSampleFlags = view.getUint32(cur);
        cur += 4;
      }
    } else if (boxType === 'tfdt' && boxSize >= 16) {
      const v = buf[p + 8];
      if (v === 1 && boxSize >= 20) {
        const hi = view.getUint32(p + 12);
        const lo = view.getUint32(p + 16);
        baseMediaDecodeTime = hi * 4294967296 + lo;
      } else {
        baseMediaDecodeTime = view.getUint32(p + 12);
      }
    } else if (boxType === 'trun') {
      truns.push({ pos: p, size: boxSize });
    }

    p += boxSize;
  }

  const timescale = trackTimescales.get(trackId) || 1000;
  const trackType = trackTypeMap.get(trackId) || 'video';
  const trackNumber = trackType === 'video' ? 1 : 2;

  let currentDts = baseMediaDecodeTime;

  for (const trun of truns) {
    const tPos = trun.pos;
    const vAndFlags = view.getUint32(tPos + 8);
    const version = (vAndFlags >>> 24) & 0xFF;
    const flags = vAndFlags & 0x00FFFFFF;
    const sampleCount = view.getUint32(tPos + 12);

    let cur = tPos + 16;
    let dataOffset = 0;
    if ((flags & 0x000001) !== 0 && cur + 4 <= tPos + trun.size) {
      dataOffset = view.getInt32(cur);
      cur += 4;
    }

    let firstSampleFlags = defaultSampleFlags;
    if ((flags & 0x000004) !== 0 && cur + 4 <= tPos + trun.size) {
      firstSampleFlags = view.getUint32(cur);
      cur += 4;
    }

    const hasDuration = (flags & 0x000100) !== 0;
    const hasSize = (flags & 0x000200) !== 0;
    const hasFlags = (flags & 0x000400) !== 0;
    const hasCts = (flags & 0x000800) !== 0;

    let samplePayloadOffset = baseDataOffset + dataOffset;
    if (dataOffset === 0) {
      // Default fallback if data_offset is relative to moof
      samplePayloadOffset = moofOffset + trun.size;
    }

    let list = outSamples.get(trackId);
    if (!list) {
      list = [];
      outSamples.set(trackId, list);
    }

    for (let i = 0; i < sampleCount && cur <= tPos + trun.size; i++) {
      const dur = hasDuration ? view.getUint32(cur) : defaultSampleDuration;
      if (hasDuration) cur += 4;

      const sz = hasSize ? view.getUint32(cur) : defaultSampleSize;
      if (hasSize) cur += 4;

      const sFlags = hasFlags
        ? view.getUint32(cur)
        : (i === 0 && (flags & 0x000004) !== 0 ? firstSampleFlags : defaultSampleFlags);
      if (hasFlags) cur += 4;

      let ctsOffset = 0;
      if (hasCts) {
        ctsOffset = version === 0 ? view.getUint32(cur) : view.getInt32(cur);
        cur += 4;
      }

      // In MP4 sample flags: bit 16 is sample_is_non_sync_sample (0x00010000)
      const isNonSync = (sFlags & 0x00010000) !== 0;
      const isKey = !isNonSync;

      const pts = currentDts + ctsOffset;
      const timeMs = (pts / timescale) * 1000;
      const dtsMs = (currentDts / timescale) * 1000;

      list.push({
        trackNumber,
        offset: samplePayloadOffset,
        size: sz,
        timeMs,
        dtsMs,
        isKeyframe: isKey
      });

      samplePayloadOffset += sz;
      currentDts += dur;
    }
  }
}
