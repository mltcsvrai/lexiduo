use std::fs::File;
use std::io::{Read, Seek, SeekFrom};

/// Downmixes multi-channel 16-bit PCM to mono and resamples to target sample rate using
/// linear interpolation with sub-sample phase continuity.
/// Returns little-endian 16-bit PCM bytes ready for WAV serialization or streaming.
pub fn downmix_and_resample_i16(
    raw: &[i16],
    input_channels: usize,
    input_sample_rate: usize,
    target_sample_rate: usize,
    phase: &mut f64,
    last_sample: &mut i16,
) -> Vec<u8> {
    let channels = input_channels.max(1);
    let mono_frame_count = raw.len() / channels;
    if mono_frame_count == 0 {
        return Vec::new();
    }

    // 1. Downmix multi-channel to mono
    let mut mono_samples = Vec::with_capacity(mono_frame_count);
    if channels == 1 {
        mono_samples.extend_from_slice(&raw[..mono_frame_count]);
    } else {
        for frame in 0..mono_frame_count {
            let offset = frame * channels;
            let mut sum: i32 = 0;
            for ch in 0..channels {
                sum += raw[offset + ch] as i32;
            }
            mono_samples.push((sum / channels as i32) as i16);
        }
    }

    // 2. Identity fast path if sample rates match
    if input_sample_rate == target_sample_rate {
        let mut pcm_bytes = Vec::with_capacity(mono_frame_count * 2);
        for &s in &mono_samples {
            pcm_bytes.extend_from_slice(&s.to_le_bytes());
        }
        if mono_frame_count > 0 {
            *last_sample = mono_samples[mono_frame_count - 1];
        }
        *phase = 0.0;
        return pcm_bytes;
    }

    // 3. High-precision linear interpolation streaming resampler
    let target_rate = target_sample_rate.max(1) as f64;
    let resample_ratio = (input_sample_rate as f64) / target_rate;
    let out_estimated = ((mono_frame_count as f64 / resample_ratio.max(0.01)).ceil() as usize) + 16;
    let mut resampled: Vec<i16> = Vec::with_capacity(out_estimated);

    let mut pos = *phase;
    let mono_len = mono_frame_count as f64;
    while pos < mono_len {
        let idx0 = pos.floor() as isize;
        let idx1 = idx0 + 1;
        let frac = pos - pos.floor();

        let s0 = if idx0 >= 0 && (idx0 as usize) < mono_frame_count {
            mono_samples[idx0 as usize] as f64
        } else {
            *last_sample as f64
        };

        let s1 = if idx1 >= 0 && (idx1 as usize) < mono_frame_count {
            mono_samples[idx1 as usize] as f64
        } else {
            s0
        };

        let interp = (s0 + frac * (s1 - s0)).round();
        let clamped = interp.clamp(i16::MIN as f64, i16::MAX as f64) as i16;
        resampled.push(clamped);
        pos += resample_ratio;
    }

    *phase = pos - mono_len;
    if mono_frame_count > 0 {
        *last_sample = mono_samples[mono_frame_count - 1];
    }

    let mut pcm_bytes = Vec::with_capacity(resampled.len() * 2);
    for s in resampled {
        pcm_bytes.extend_from_slice(&s.to_le_bytes());
    }
    pcm_bytes
}

/// Reads a PCM chunk directly from a standard WAV file starting at `44 + start_sample * 2`,
/// converts 16-bit little-endian samples to normalized f32 `[-1.0, 1.0]`,
/// and calculates mean squared energy `sum(s^2) / N`.
pub fn read_wav_chunk_and_energy(
    wav_path: &str,
    start_sample: usize,
    num_samples: usize,
) -> std::io::Result<(Vec<f32>, f32)> {
    if num_samples == 0 {
        return Ok((Vec::new(), 0.0));
    }

    let mut file = File::open(wav_path)?;
    let byte_offset = 44u64 + (start_sample as u64) * 2;
    let file_len = file.metadata()?.len();

    if byte_offset >= file_len {
        return Ok((Vec::new(), 0.0));
    }

    file.seek(SeekFrom::Start(byte_offset))?;

    let max_readable_bytes = (file_len - byte_offset) as usize;
    let bytes_to_read = (num_samples * 2).min(max_readable_bytes);
    let mut buffer = vec![0u8; bytes_to_read];
    file.read_exact(&mut buffer)?;

    let sample_count = buffer.len() / 2;
    let mut samples = Vec::with_capacity(sample_count);
    let mut sum_energy = 0.0f64;

    for i in 0..sample_count {
        let b0 = buffer[i * 2];
        let b1 = buffer[i * 2 + 1];
        let raw_sample = i16::from_le_bytes([b0, b1]);
        let normalized = (raw_sample as f32 / 32768.0).clamp(-1.0, 1.0);
        sum_energy += (normalized as f64) * (normalized as f64);
        samples.push(normalized);
    }

    let energy = if sample_count > 0 {
        (sum_energy / sample_count as f64) as f32
    } else {
        0.0
    };

    Ok((samples, energy))
}

/// Zero-copy fast path: reads a WAV chunk from disk, performs Voice Activity Detection (VAD)
/// energy threshold check in Rust, and extracts Whisper Log-Mel features if non-silent.
/// Returns None if chunk is silent (`energy < vad_threshold`) or file is unreadable.
pub fn extract_mel_from_wav_chunk(
    wav_path: &str,
    start_sample: usize,
    num_samples: usize,
    n_mels: usize,
    vad_threshold: f32,
) -> Option<Vec<f32>> {
    let (samples, energy) = read_wav_chunk_and_energy(wav_path, start_sample, num_samples).ok()?;
    if samples.is_empty() || energy < vad_threshold {
        return None;
    }
    Some(crate::mel_extractor::extract_mel_features(&samples, n_mels))
}
