use std::collections::HashMap;
use std::path::Path;
use std::sync::RwLock;

static GLOBAL_VOCAB: RwLock<Option<HashMap<i32, String>>> = RwLock::new(None);

/// Parses Hugging Face `tokenizer.json` content and returns an ID -> Token string vocabulary map.
pub fn parse_tokenizer_json(json_str: &str) -> Result<HashMap<i32, String>, serde_json::Error> {
    let root: serde_json::Value = serde_json::from_str(json_str)?;
    let mut vocab = HashMap::new();

    let vocab_map = root
        .get("model")
        .and_then(|m| m.get("vocab"))
        .or_else(|| root.get("vocab"))
        .and_then(|v| v.as_object());

    if let Some(map) = vocab_map {
        vocab.reserve(map.len());
        for (token_str, id_val) in map {
            if let Some(id) = id_val.as_i64() {
                vocab.insert(id as i32, token_str.clone());
            }
        }
    }

    Ok(vocab)
}

/// Decodes an array of 64-bit token IDs into human-readable text.
/// - Skips Whisper special and timestamp control tokens (`id >= 50257`).
/// - Replaces Byte-Level BPE whitespace `\u{0120}` ('Ġ') with `" "`.
/// - Replaces Byte-Level BPE newline `\u{010A}` ('Ċ') with `"\n"`.
/// - Returns trimmed UTF-8 string matching standard Whisper output format.
pub fn decode_tokens(vocab: &HashMap<i32, String>, token_ids: &[i64]) -> String {
    let mut output = String::new();
    for &id in token_ids {
        let int_id = id as i32;
        if int_id >= 50257 {
            // Skip Whisper control and timestamp tokens
            continue;
        }
        if let Some(token_str) = vocab.get(&int_id) {
            let replaced = token_str.replace('\u{0120}', " ").replace('\u{010A}', "\n");
            output.push_str(&replaced);
        }
    }
    output.trim().to_string()
}

/// Loads vocabulary from either a filesystem path or raw JSON string into the global cache.
pub fn load_global_tokenizer(path_or_json: &str) -> Result<usize, String> {
    let json_content = if Path::new(path_or_json).is_file() {
        std::fs::read_to_string(path_or_json)
            .map_err(|e| format!("Failed to read tokenizer file {}: {}", path_or_json, e))?
    } else {
        path_or_json.to_string()
    };

    let vocab = parse_tokenizer_json(&json_content)
        .map_err(|e| format!("Failed to parse tokenizer JSON: {}", e))?;
    let count = vocab.len();

    let mut lock = GLOBAL_VOCAB
        .write()
        .map_err(|e| format!("RwLock write poison error: {}", e))?;
    *lock = Some(vocab);
    Ok(count)
}

/// Decodes token IDs using the globally cached tokenizer instance.
pub fn decode_global_tokens(token_ids: &[i64]) -> String {
    if let Ok(guard) = GLOBAL_VOCAB.read() {
        if let Some(ref vocab) = *guard {
            return decode_tokens(vocab, token_ids);
        }
    }
    String::new()
}

/// Checks if the global tokenizer has been successfully initialized.
pub fn is_global_tokenizer_loaded() -> bool {
    GLOBAL_VOCAB.read().map(|g| g.is_some()).unwrap_or(false)
}
