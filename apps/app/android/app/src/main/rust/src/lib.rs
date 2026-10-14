pub mod audio_dsp;
pub mod mel_extractor;
pub mod tokenizer;

use jni::objects::{JClass, JDoubleArray, JFloatArray, JLongArray, JShortArray, JString};
use jni::sys::{
    jboolean, jbyteArray, jfloat, jfloatArray, jint, jstring, JNI_FALSE, JNI_TRUE,
};
use jni::JNIEnv;
use std::panic::{catch_unwind, AssertUnwindSafe};

/// Health check indicator returning JNI_TRUE to confirm native library is loaded and operational.
#[no_mangle]
pub extern "system" fn Java_com_lexiduo_app_whisper_NativeRustBridge_isAvailable(
    _env: JNIEnv,
    _class: JClass,
) -> jboolean {
    let result = catch_unwind(AssertUnwindSafe(|| JNI_TRUE));
    result.unwrap_or(JNI_FALSE)
}

/// Extracts Log-Mel Spectrogram features for standard 30-second audio windows.
/// Returns a flat float array of length `n_mels * 3000` (80 x 3000 or 128 x 3000).
#[no_mangle]
pub extern "system" fn Java_com_lexiduo_app_whisper_NativeRustBridge_extractMelFeaturesFlat(
    env: JNIEnv,
    _class: JClass,
    audio: JFloatArray,
    n_mels: jint,
) -> jfloatArray {
    let result = catch_unwind(AssertUnwindSafe(|| {
        let n_mels_usize = n_mels as usize;
        if n_mels_usize != 80 && n_mels_usize != 128 {
            return std::ptr::null_mut();
        }

        let audio_len = match env.get_array_length(&audio) {
            Ok(len) => len as usize,
            Err(_) => return std::ptr::null_mut(),
        };

        let mut audio_buf = vec![0.0f32; audio_len];
        if audio_len > 0 {
            if env.get_float_array_region(&audio, 0, &mut audio_buf).is_err() {
                return std::ptr::null_mut();
            }
        }

        let features = mel_extractor::extract_mel_features(&audio_buf, n_mels_usize);

        match env.new_float_array(features.len() as i32) {
            Ok(output_array) => {
                if env.set_float_array_region(&output_array, 0, &features).is_ok() {
                    output_array.into_raw()
                } else {
                    std::ptr::null_mut()
                }
            }
            Err(_) => std::ptr::null_mut(),
        }
    }));

    result.unwrap_or(std::ptr::null_mut())
}

/// Zero-copy fast path: reads a WAV chunk from disk, performs VAD energy threshold check,
/// and extracts Mel features if speech is detected. Returns null if silent or file unreadable.
#[no_mangle]
pub extern "system" fn Java_com_lexiduo_app_whisper_NativeRustBridge_extractMelFromWavChunk(
    mut env: JNIEnv,
    _class: JClass,
    wav_path: JString,
    start_sample: jint,
    num_samples: jint,
    n_mels: jint,
    vad_threshold: jfloat,
) -> jfloatArray {
    let result = catch_unwind(AssertUnwindSafe(|| {
        let n_mels_usize = n_mels as usize;
        if n_mels_usize != 80 && n_mels_usize != 128 {
            return std::ptr::null_mut();
        }

        let path_str: String = match env.get_string(&wav_path) {
            Ok(js) => js.into(),
            Err(_) => return std::ptr::null_mut(),
        };

        let features_opt = audio_dsp::extract_mel_from_wav_chunk(
            &path_str,
            start_sample.max(0) as usize,
            num_samples.max(0) as usize,
            n_mels_usize,
            vad_threshold,
        );

        match features_opt {
            Some(features) => match env.new_float_array(features.len() as i32) {
                Ok(output_array) => {
                    if env.set_float_array_region(&output_array, 0, &features).is_ok() {
                        output_array.into_raw()
                    } else {
                        std::ptr::null_mut()
                    }
                }
                Err(_) => std::ptr::null_mut(),
            },
            None => std::ptr::null_mut(),
        }
    }));

    result.unwrap_or(std::ptr::null_mut())
}

/// Downmixes multi-channel PCM to mono and resamples using sub-sample phase continuity.
/// Returns little-endian 16-bit PCM bytes.
#[no_mangle]
pub extern "system" fn Java_com_lexiduo_app_whisper_NativeRustBridge_downmixAndResamplePcm(
    env: JNIEnv,
    _class: JClass,
    pcm_shorts: JShortArray,
    channels: jint,
    sample_rate: jint,
    target_sample_rate: jint,
    state: JDoubleArray,
) -> jbyteArray {
    let result = catch_unwind(AssertUnwindSafe(|| {
        let raw_len = match env.get_array_length(&pcm_shorts) {
            Ok(len) => len as usize,
            Err(_) => return std::ptr::null_mut(),
        };

        let mut shorts_buf = vec![0i16; raw_len];
        if raw_len > 0 {
            if env.get_short_array_region(&pcm_shorts, 0, &mut shorts_buf).is_err() {
                return std::ptr::null_mut();
            }
        }

        let mut phase = 0.0f64;
        let mut last_sample = 0i16;
        let mut has_state = false;

        if !state.is_null() {
            if let Ok(state_len) = env.get_array_length(&state) {
                if state_len >= 2 {
                    let mut s = [0.0f64; 2];
                    if env.get_double_array_region(&state, 0, &mut s).is_ok() {
                        phase = s[0];
                        last_sample = s[1] as i16;
                        has_state = true;
                    }
                }
            }
        }

        let pcm_bytes = audio_dsp::downmix_and_resample_i16(
            &shorts_buf,
            channels.max(1) as usize,
            sample_rate.max(1) as usize,
            target_sample_rate.max(1) as usize,
            &mut phase,
            &mut last_sample,
        );

        if has_state {
            let s = [phase, last_sample as f64];
            let _ = env.set_double_array_region(&state, 0, &s);
        }

        match env.new_byte_array(pcm_bytes.len() as i32) {
            Ok(byte_array) => {
                let i8_slice = unsafe {
                    std::slice::from_raw_parts(pcm_bytes.as_ptr() as *const i8, pcm_bytes.len())
                };
                if env.set_byte_array_region(&byte_array, 0, i8_slice).is_ok() {
                    byte_array.into_raw()
                } else {
                    std::ptr::null_mut()
                }
            }
            Err(_) => std::ptr::null_mut(),
        }
    }));

    result.unwrap_or(std::ptr::null_mut())
}

/// Loads vocabulary from tokenizer.json file path or direct JSON content into global cache.
#[no_mangle]
pub extern "system" fn Java_com_lexiduo_app_whisper_NativeRustBridge_loadTokenizerJson(
    mut env: JNIEnv,
    _class: JClass,
    json_path_or_content: JString,
) -> jboolean {
    let result = catch_unwind(AssertUnwindSafe(|| {
        let text: String = match env.get_string(&json_path_or_content) {
            Ok(js) => js.into(),
            Err(_) => return JNI_FALSE,
        };

        match tokenizer::load_global_tokenizer(&text) {
            Ok(_) => JNI_TRUE,
            Err(_) => JNI_FALSE,
        }
    }));

    result.unwrap_or(JNI_FALSE)
}

/// Decodes an array of token IDs into text using the globally loaded vocabulary.
#[no_mangle]
pub extern "system" fn Java_com_lexiduo_app_whisper_NativeRustBridge_decodeTokens(
    env: JNIEnv,
    _class: JClass,
    token_ids: JLongArray,
) -> jstring {
    let result = catch_unwind(AssertUnwindSafe(|| {
        let len = match env.get_array_length(&token_ids) {
            Ok(l) => l as usize,
            Err(_) => return std::ptr::null_mut(),
        };

        let mut ids = vec![0i64; len];
        if len > 0 {
            if env.get_long_array_region(&token_ids, 0, &mut ids).is_err() {
                return std::ptr::null_mut();
            }
        }

        let decoded = tokenizer::decode_global_tokens(&ids);
        match env.new_string(decoded) {
            Ok(js) => js.into_raw(),
            Err(_) => std::ptr::null_mut(),
        }
    }));

    result.unwrap_or(std::ptr::null_mut())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn test_slaney_mel_filter_dimensions_and_normalization() {
        let filters80 = mel_extractor::get_mel_filters(80);
        assert_eq!(filters80.len(), 80 * mel_extractor::NUM_FREQS);
        assert_eq!(mel_extractor::NUM_FREQS, 201);

        for m in 0..80 {
            let row = &filters80[m * 201..(m + 1) * 201];
            let row_sum: f32 = row.iter().sum();
            assert!(row_sum > 0.0, "Mel filter row {} must have positive area", m);
            for &w in row {
                assert!(w >= 0.0, "Mel filter weights must be non-negative");
            }
        }

        let filters128 = mel_extractor::get_mel_filters(128);
        assert_eq!(filters128.len(), 128 * mel_extractor::NUM_FREQS);
        for m in 0..128 {
            let row = &filters128[m * 201..(m + 1) * 201];
            let row_sum: f32 = row.iter().sum();
            assert!(row_sum > 0.0, "Mel filter row {} must have positive area", m);
            for &w in row {
                assert!(w >= 0.0, "Mel filter weights must be non-negative");
            }
        }

        // Test frequency conversion invertibility
        let test_freqs = [0.0, 100.0, 500.0, 1000.0, 2000.0, 4000.0, 8000.0];
        for &hz in &test_freqs {
            let mel = mel_extractor::hz_to_mel_slaney(hz);
            let reconstructed_hz = mel_extractor::mel_to_hz_slaney(mel);
            assert!(
                (hz - reconstructed_hz).abs() < 1e-4,
                "Invertibility failed for {} Hz: got {}",
                hz,
                reconstructed_hz
            );
        }
    }

    #[test]
    fn test_extract_mel_features_dimensions_and_finite_values() {
        let silence = vec![0.0f32; 16000]; // 1 second of silence
        let mel80 = mel_extractor::extract_mel_features(&silence, 80);
        assert_eq!(mel80.len(), 80 * mel_extractor::TARGET_FRAMES);
        assert_eq!(mel80.len(), 80 * 3000);
        for &val in &mel80 {
            assert!(!val.is_nan(), "Mel output must not be NaN");
            assert!(!val.is_infinite(), "Mel output must not be Infinite");
        }

        let mel128 = mel_extractor::extract_mel_features(&silence, 128);
        assert_eq!(mel128.len(), 128 * mel_extractor::TARGET_FRAMES);
        assert_eq!(mel128.len(), 128 * 3000);
        for &val in &mel128 {
            assert!(!val.is_nan(), "Mel output must not be NaN");
            assert!(!val.is_infinite(), "Mel output must not be Infinite");
        }

        // 440 Hz tone test
        let mut tone = vec![0.0f32; 32000]; // 2 seconds
        for i in 0..tone.len() {
            tone[i] = (2.0 * std::f32::consts::PI * 440.0 * (i as f32) / 16000.0).sin() * 0.5;
        }
        let tone_mel = mel_extractor::extract_mel_features(&tone, 80);
        assert_eq!(tone_mel.len(), 80 * 3000);
        for &val in &tone_mel {
            assert!(!val.is_nan());
            assert!(!val.is_infinite());
        }
    }

    #[test]
    fn test_downmix_and_resample_sample_count_accuracy() {
        // 1 second of stereo 48,000 Hz audio = 48,000 frames = 96,000 samples
        let stereo_48k = vec![1000i16; 96000];
        let mut phase = 0.0f64;
        let mut last_sample = 0i16;

        let pcm_bytes = audio_dsp::downmix_and_resample_i16(
            &stereo_48k,
            2,
            48000,
            16000,
            &mut phase,
            &mut last_sample,
        );

        // 16,000 mono 16-bit samples = 32,000 bytes
        assert_eq!(pcm_bytes.len(), 16000 * 2);
        assert_eq!(last_sample, 1000);
        assert!(phase.abs() < 1e-4, "Phase should complete a cycle for integer ratio");

        // Streaming continuity across chunks: 2 chunks of 24,000 stereo frames
        let chunk1 = vec![500i16; 48000];
        let chunk2 = vec![500i16; 48000];
        let mut stream_phase = 0.0f64;
        let mut stream_last = 0i16;

        let out1 = audio_dsp::downmix_and_resample_i16(
            &chunk1,
            2,
            48000,
            16000,
            &mut stream_phase,
            &mut stream_last,
        );
        let out2 = audio_dsp::downmix_and_resample_i16(
            &chunk2,
            2,
            48000,
            16000,
            &mut stream_phase,
            &mut stream_last,
        );

        assert_eq!(out1.len(), 8000 * 2);
        assert_eq!(out2.len(), 8000 * 2);
        assert_eq!(out1.len() + out2.len(), 16000 * 2);

        // Identity fast path: 16,000 mono to 16,000 mono
        let mono_16k = vec![300i16; 16000];
        let mut id_phase = 0.0f64;
        let mut id_last = 0i16;
        let id_bytes = audio_dsp::downmix_and_resample_i16(
            &mono_16k,
            1,
            16000,
            16000,
            &mut id_phase,
            &mut id_last,
        );
        assert_eq!(id_bytes.len(), 16000 * 2);
    }

    #[test]
    fn test_bpe_token_decoding_and_control_filtering() {
        let mut vocab = HashMap::new();
        vocab.insert(1, "Hello".to_string());
        vocab.insert(2, "\u{0120}world".to_string()); // 'Ġworld'
        vocab.insert(3, "\u{0120}from".to_string());  // 'Ġfrom'
        vocab.insert(4, "\u{0120}Lexiduo".to_string()); // 'ĠLexiduo'
        vocab.insert(5, "\u{010A}".to_string());      // 'Ċ' (newline)
        vocab.insert(6, "\u{0120}Rust".to_string());
        vocab.insert(50257, "<|endoftext|>".to_string());
        vocab.insert(50258, "<|startoftranscript|>".to_string());
        vocab.insert(50359, "<|transcribe|>".to_string());

        let tokens = [50258, 50359, 1, 2, 3, 4, 5, 6, 50257];
        let decoded = tokenizer::decode_tokens(&vocab, &tokens);
        assert_eq!(decoded, "Hello world from Lexiduo\n Rust");

        // Test tokenizer JSON parser and global cache
        let sample_json = r#"{
            "version": "1.0",
            "model": {
                "vocab": {
                    "Hello": 1,
                    "Ġworld": 2,
                    "<|endoftext|>": 50257
                }
            }
        }"#;

        let parsed_vocab = tokenizer::parse_tokenizer_json(sample_json).expect("Parse JSON");
        assert_eq!(parsed_vocab.get(&1).map(|s| s.as_str()), Some("Hello"));
        assert_eq!(parsed_vocab.get(&2).map(|s| s.as_str()), Some("Ġworld"));

        let loaded = tokenizer::load_global_tokenizer(sample_json).expect("Load global tokenizer");
        assert_eq!(loaded, 3);
        assert!(tokenizer::is_global_tokenizer_loaded());

        let global_decoded = tokenizer::decode_global_tokens(&[1, 2, 50257]);
        assert_eq!(global_decoded, "Hello world");
    }

    #[test]
    fn test_wav_chunk_reading_and_vad_threshold() {
        let temp_dir = std::env::temp_dir();
        let test_wav_path = temp_dir.join("lexiduo_test_audio.wav");

        // Generate synthetic 16kHz mono WAV with 44-byte header and 16000 samples
        let mut wav_bytes = Vec::new();
        // RIFF header
        wav_bytes.extend_from_slice(b"RIFF");
        let chunk_size = (36 + 16000 * 2) as u32;
        wav_bytes.extend_from_slice(&chunk_size.to_le_bytes());
        wav_bytes.extend_from_slice(b"WAVE");
        // fmt chunk
        wav_bytes.extend_from_slice(b"fmt ");
        wav_bytes.extend_from_slice(&16u32.to_le_bytes()); // subchunk1size = 16
        wav_bytes.extend_from_slice(&1u16.to_le_bytes());  // PCM = 1
        wav_bytes.extend_from_slice(&1u16.to_le_bytes());  // mono = 1
        wav_bytes.extend_from_slice(&16000u32.to_le_bytes()); // sample rate = 16000
        wav_bytes.extend_from_slice(&32000u32.to_le_bytes()); // byte rate = 32000
        wav_bytes.extend_from_slice(&2u16.to_le_bytes());  // block align = 2
        wav_bytes.extend_from_slice(&16u16.to_le_bytes()); // bits per sample = 16
        // data chunk
        wav_bytes.extend_from_slice(b"data");
        let data_size = (16000 * 2) as u32;
        wav_bytes.extend_from_slice(&data_size.to_le_bytes());

        // Audio payload: half silence (energy 0), half 440Hz tone (energy > 0)
        for _ in 0..8000 {
            let s: i16 = 0;
            wav_bytes.extend_from_slice(&s.to_le_bytes());
        }
        for i in 0..8000 {
            let s: i16 = ((2.0 * std::f32::consts::PI * 440.0 * (i as f32) / 16000.0).sin() * 10000.0) as i16;
            wav_bytes.extend_from_slice(&s.to_le_bytes());
        }

        std::fs::write(&test_wav_path, &wav_bytes).expect("Write test WAV file");

        let path_str = test_wav_path.to_str().unwrap();

        // Silence chunk: should have 0 energy and be skipped by VAD threshold 0.00015
        let (silence_samples, silence_energy) =
            audio_dsp::read_wav_chunk_and_energy(path_str, 0, 4000).expect("Read silence");
        assert_eq!(silence_samples.len(), 4000);
        assert_eq!(silence_energy, 0.0);

        let silence_mel = audio_dsp::extract_mel_from_wav_chunk(path_str, 0, 4000, 80, 0.00015);
        assert!(silence_mel.is_none(), "Silence should be skipped by VAD");

        // Speech/tone chunk: should have high energy and extract mel features
        let (tone_samples, tone_energy) =
            audio_dsp::read_wav_chunk_and_energy(path_str, 8000, 4000).expect("Read tone");
        assert_eq!(tone_samples.len(), 4000);
        assert!(tone_energy > 0.01, "Tone energy should be well above threshold");

        let tone_mel = audio_dsp::extract_mel_from_wav_chunk(path_str, 8000, 4000, 80, 0.00015);
        assert!(tone_mel.is_some(), "Tone chunk should pass VAD and extract features");
        let mel_vec = tone_mel.unwrap();
        assert_eq!(mel_vec.len(), 80 * 3000);

        let _ = std::fs::remove_file(test_wav_path);
    }
}
