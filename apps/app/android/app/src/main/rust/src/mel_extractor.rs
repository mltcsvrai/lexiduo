use realfft::{RealFftPlanner, RealToComplex};
use std::sync::{Arc, OnceLock};

pub const SAMPLE_RATE: usize = 16000;
pub const N_FFT: usize = 400; // 25ms frame
pub const HOP_LENGTH: usize = 160; // 10ms step
pub const NUM_FREQS: usize = N_FFT / 2 + 1; // 201 frequency bins
pub const TARGET_FRAMES: usize = 3000; // 30 seconds of audio
pub const TARGET_SAMPLES: usize = TARGET_FRAMES * HOP_LENGTH; // 480,000 samples

static HANN_WINDOW: OnceLock<Vec<f32>> = OnceLock::new();
static MEL_FILTERS_80: OnceLock<Vec<f32>> = OnceLock::new();
static MEL_FILTERS_128: OnceLock<Vec<f32>> = OnceLock::new();
static FFT_FORWARD: OnceLock<Arc<dyn RealToComplex<f32>>> = OnceLock::new();

/// Precomputes and caches the 400-point periodic Hann window.
pub fn get_hann_window() -> &'static [f32] {
    HANN_WINDOW.get_or_init(|| {
        let mut window = Vec::with_capacity(N_FFT);
        for n in 0..N_FFT {
            let val = 0.5 * (1.0 - (2.0 * std::f64::consts::PI * (n as f64) / (N_FFT as f64)).cos());
            window.push(val as f32);
        }
        window
    })
}

/// Precomputes and caches the 400-point real-to-complex FFT forward planner.
pub fn get_fft_plan() -> &'static Arc<dyn RealToComplex<f32>> {
    FFT_FORWARD.get_or_init(|| {
        let mut planner = RealFftPlanner::<f32>::new();
        planner.plan_fft_forward(N_FFT)
    })
}

/// Converts frequency in Hertz to Slaney Mel scale.
pub fn hz_to_mel_slaney(hz: f64) -> f64 {
    let f_sp = 200.0 / 3.0;
    let min_log_hz = 1000.0;
    let min_log_mel = 15.0; // min_log_hz / f_sp = 1000.0 / (200.0 / 3.0)
    let logstep = (6.4_f64).ln() / 27.0;

    if hz < min_log_hz {
        hz / f_sp
    } else {
        min_log_mel + (hz / min_log_hz).ln() / logstep
    }
}

/// Converts Slaney Mel scale to frequency in Hertz.
pub fn mel_to_hz_slaney(mel: f64) -> f64 {
    let f_sp = 200.0 / 3.0;
    let min_log_mel = 15.0;
    let min_log_hz = 1000.0;
    let logstep = (6.4_f64).ln() / 27.0;

    if mel < min_log_mel {
        f_sp * mel
    } else {
        min_log_hz * (logstep * (mel - min_log_mel)).exp()
    }
}

/// Computes Slaney Mel filterbank weights in row-major layout [n_mels x 201].
pub fn compute_slaney_mel_filters(n_mels: usize) -> Vec<f32> {
    let mut weights = vec![0.0f32; n_mels * NUM_FREQS];
    let min_mel = hz_to_mel_slaney(0.0);
    let max_mel = hz_to_mel_slaney(SAMPLE_RATE as f64 / 2.0);

    let mut mel_points = vec![0.0f64; n_mels + 2];
    for i in 0..(n_mels + 2) {
        mel_points[i] = min_mel + (max_mel - min_mel) * (i as f64) / ((n_mels + 1) as f64);
    }

    let mut hz_points = vec![0.0f64; n_mels + 2];
    for i in 0..(n_mels + 2) {
        hz_points[i] = mel_to_hz_slaney(mel_points[i]);
    }

    let mut fft_freqs = vec![0.0f64; NUM_FREQS];
    for k in 0..NUM_FREQS {
        fft_freqs[k] = (SAMPLE_RATE as f64 / 2.0) * (k as f64) / ((NUM_FREQS - 1) as f64);
    }

    for m in 0..n_mels {
        let left_hz = hz_points[m];
        let center_hz = hz_points[m + 1];
        let right_hz = hz_points[m + 2];

        let left_diff = center_hz - left_hz;
        let right_diff = right_hz - center_hz;
        let enorm = 2.0 / (right_hz - left_hz);

        for k in 0..NUM_FREQS {
            let f = fft_freqs[k];
            if f >= left_hz && f <= center_hz && left_diff > 0.0 {
                weights[m * NUM_FREQS + k] = (((f - left_hz) / left_diff) * enorm) as f32;
            } else if f >= center_hz && f <= right_hz && right_diff > 0.0 {
                weights[m * NUM_FREQS + k] = (((right_hz - f) / right_diff) * enorm) as f32;
            } else {
                weights[m * NUM_FREQS + k] = 0.0;
            }
        }
    }

    weights
}

/// Retrieves cached Slaney Mel filterbank weights for 80 or 128 mel bins.
pub fn get_mel_filters(n_mels: usize) -> &'static [f32] {
    match n_mels {
        80 => MEL_FILTERS_80.get_or_init(|| compute_slaney_mel_filters(80)),
        128 => MEL_FILTERS_128.get_or_init(|| compute_slaney_mel_filters(128)),
        _ => panic!("Unsupported n_mels: {}, expected 80 or 128", n_mels),
    }
}

/// Extracts normalized Log-Mel Spectrogram features matching OpenAI Whisper specification.
/// Output is a flat `Vec<f32>` with length `n_mels * 3000`, structured row-major [n_mels][3000].
pub fn extract_mel_features(audio: &[f32], n_mels: usize) -> Vec<f32> {
    let mel_filters = get_mel_filters(n_mels);
    let hann_window = get_hann_window();
    let r2c = get_fft_plan();

    // 1. Pad or truncate audio to exactly TARGET_SAMPLES (480,000 samples / 30 seconds)
    let mut padded = vec![0.0f32; TARGET_SAMPLES];
    let copy_len = audio.len().min(TARGET_SAMPLES);
    padded[..copy_len].copy_from_slice(&audio[..copy_len]);

    // Calculate active frames containing audio data to avoid redundant FFTs on zero padding
    let active_frames = if copy_len > 0 {
        ((copy_len + HOP_LENGTH - 1) / HOP_LENGTH).min(TARGET_FRAMES)
    } else {
        0
    };

    // 2. Compute Power Spectrogram across 3000 frames: [NUM_FREQS][TARGET_FRAMES]
    // Layout: power_spec[k * TARGET_FRAMES + frame] for optimal vectorization stride
    let mut power_spec = vec![0.0f32; NUM_FREQS * TARGET_FRAMES];
    let mut frame_buf = r2c.make_input_vec();
    let mut fft_out = r2c.make_output_vec();
    let mut scratch = r2c.make_scratch_vec();

    for frame in 0..active_frames {
        let offset = frame * HOP_LENGTH;
        let samples_available = (TARGET_SAMPLES - offset).min(N_FFT);

        for n in 0..samples_available {
            frame_buf[n] = padded[offset + n] * hann_window[n];
        }
        if samples_available < N_FFT {
            frame_buf[samples_available..N_FFT].fill(0.0);
        }

        r2c.process_with_scratch(&mut frame_buf, &mut fft_out, &mut scratch)
            .expect("FFT forward transformation failed");

        for k in 0..NUM_FREQS {
            let re = fft_out[k].re;
            let im = fft_out[k].im;
            power_spec[k * TARGET_FRAMES + frame] = re * re + im * im;
        }
    }
    // Tail frames (active_frames..TARGET_FRAMES) remain 0.0 without running FFTs

    // 3. Row-major multiplication of mel filters with power spectrogram: [n_mels][TARGET_FRAMES]
    let mut mel_spec = vec![0.0f32; n_mels * TARGET_FRAMES];
    for m in 0..n_mels {
        let filter_row = &mel_filters[m * NUM_FREQS..(m + 1) * NUM_FREQS];
        let mel_row = &mut mel_spec[m * TARGET_FRAMES..(m + 1) * TARGET_FRAMES];

        for (k, &w) in filter_row.iter().enumerate() {
            if w > 0.0 {
                let power_row = &power_spec[k * TARGET_FRAMES..(k + 1) * TARGET_FRAMES];
                for frame in 0..TARGET_FRAMES {
                    mel_row[frame] += w * power_row[frame];
                }
            }
        }
    }

    // 4. Log10 and Dynamic Range Normalization
    let mut max_val = f32::NEG_INFINITY;
    for val in mel_spec.iter_mut() {
        let log_val = (*val).max(1e-5).log10();
        *val = log_val;
        if log_val > max_val {
            max_val = log_val;
        }
    }

    let clamp_min = max_val - 8.0;
    for val in mel_spec.iter_mut() {
        *val = ((*val).max(clamp_min) + 4.0) / 4.0;
    }

    mel_spec
}
