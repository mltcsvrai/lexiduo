package com.lexiduo.app.whisper;

import android.util.Log;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;

/**
 * WhisperTokenizer manages token-to-text decoding for Whisper models.
 * It parses standard Hugging Face tokenizer.json vocabulary tables
 * and handles byte-level BPE tokens (e.g. 'Ġ' -> space).
 */
public class WhisperTokenizer {
    private static final String TAG = "WhisperTokenizer";

    // Standard Whisper special token IDs (v1 / v2 / tiny / base / small)
    public static final int TOKEN_END_OF_TRANSCRIPT = 50257;
    public static final int TOKEN_START_OF_TRANSCRIPT = 50258;
    public static final int TOKEN_TRANSCRIBE = 50359;
    public static final int TOKEN_TRANSLATE = 50358;
    public static final int TOKEN_NO_TIMESTAMPS = 50363;

    // Whisper Large v3 / Large v3 Turbo special token IDs
    public static final int TOKEN_LARGE_V3_TRANSCRIBE = 50360;
    public static final int TOKEN_LARGE_V3_TRANSLATE = 50359;
    public static final int TOKEN_LARGE_V3_NO_TIMESTAMPS = 50364;

    // Common language token IDs for tiny / base / small
    private static final Map<String, Integer> STANDARD_LANGUAGE_TOKENS = new HashMap<>();
    static {
        STANDARD_LANGUAGE_TOKENS.put("en", 50259);
        STANDARD_LANGUAGE_TOKENS.put("zh", 50260);
        STANDARD_LANGUAGE_TOKENS.put("de", 50261);
        STANDARD_LANGUAGE_TOKENS.put("es", 50262);
        STANDARD_LANGUAGE_TOKENS.put("ru", 50263);
        STANDARD_LANGUAGE_TOKENS.put("ko", 50264);
        STANDARD_LANGUAGE_TOKENS.put("fr", 50265);
        STANDARD_LANGUAGE_TOKENS.put("ja", 50266);
        STANDARD_LANGUAGE_TOKENS.put("pt", 50267);
        STANDARD_LANGUAGE_TOKENS.put("tr", 50314);
        STANDARD_LANGUAGE_TOKENS.put("ar", 50272);
        STANDARD_LANGUAGE_TOKENS.put("it", 50274);
    }

    // Common language token IDs for large-v3 / large-v3-turbo
    private static final Map<String, Integer> LARGE_V3_LANGUAGE_TOKENS = new HashMap<>();
    static {
        LARGE_V3_LANGUAGE_TOKENS.put("en", 50259);
        LARGE_V3_LANGUAGE_TOKENS.put("zh", 50260);
        LARGE_V3_LANGUAGE_TOKENS.put("de", 50261);
        LARGE_V3_LANGUAGE_TOKENS.put("es", 50262);
        LARGE_V3_LANGUAGE_TOKENS.put("ru", 50263);
        LARGE_V3_LANGUAGE_TOKENS.put("ko", 50264);
        LARGE_V3_LANGUAGE_TOKENS.put("fr", 50265);
        LARGE_V3_LANGUAGE_TOKENS.put("ja", 50266);
        LARGE_V3_LANGUAGE_TOKENS.put("pt", 50267);
        LARGE_V3_LANGUAGE_TOKENS.put("tr", 50268); // tr is 50268 in Large-v3/Turbo
        LARGE_V3_LANGUAGE_TOKENS.put("ar", 50272);
        LARGE_V3_LANGUAGE_TOKENS.put("it", 50274);
    }

    private final Map<Integer, String> idToToken = new HashMap<>();
    private final Map<String, Integer> tokenToId = new HashMap<>();
    private boolean isLoaded = false;

    public WhisperTokenizer() {}

    /**
     * Loads vocabulary from tokenizer.json in the model directory.
     */
    public boolean load(@NonNull File tokenizerJsonFile) {
        if (!tokenizerJsonFile.exists() || tokenizerJsonFile.length() == 0) {
            Log.w(TAG, "tokenizer.json not found at: " + tokenizerJsonFile.getAbsolutePath());
            return false;
        }

        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(new FileInputStream(tokenizerJsonFile), StandardCharsets.UTF_8))) {
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line);
            }

            String jsonContent = sb.toString();
            if (NativeRustBridge.isLoaded()) {
                try {
                    NativeRustBridge.loadTokenizerJson(jsonContent);
                } catch (Throwable t) {
                    Log.w(TAG, "Native tokenizer load notice: " + t.getMessage());
                }
            }

            JSONObject root = new JSONObject(jsonContent);
            JSONObject model = root.optJSONObject("model");
            JSONObject vocab = model != null ? model.optJSONObject("vocab") : root.optJSONObject("vocab");

            if (vocab != null) {
                idToToken.clear();
                tokenToId.clear();
                Iterator<String> keys = vocab.keys();
                while (keys.hasNext()) {
                    String tokenStr = keys.next();
                    int id = vocab.getInt(tokenStr);
                    idToToken.put(id, tokenStr);
                    tokenToId.put(tokenStr, id);
                }
                isLoaded = true;
                Log.i(TAG, "Loaded " + idToToken.size() + " tokens from " + tokenizerJsonFile.getName());
                return true;
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to load tokenizer.json", e);
        }
        return false;
    }

    public boolean isLoaded() {
        return isLoaded;
    }

    public static boolean isLargeV3Tier(@Nullable String modelTier) {
        return modelTier != null && (modelTier.contains("large-v3") || modelTier.contains("turbo"));
    }

    public int getEndOfTranscriptToken(@Nullable String modelTier) {
        if (tokenToId.containsKey("<|endoftranscript|>")) {
            return tokenToId.get("<|endoftranscript|>");
        }
        return TOKEN_END_OF_TRANSCRIPT;
    }

    /**
     * Resolves initial decoder prompt token IDs for the specified language.
     */
    public long[] getInitialPromptTokens(@Nullable String language) {
        return getInitialPromptTokens(language, null);
    }

    /**
     * Resolves initial decoder prompt token IDs taking model tier into account.
     */
    public long[] getInitialPromptTokens(@Nullable String language, @Nullable String modelTier) {
        boolean isLargeV3 = isLargeV3Tier(modelTier);

        int sotToken = TOKEN_START_OF_TRANSCRIPT;
        if (tokenToId.containsKey("<|startoftranscript|>")) {
            sotToken = tokenToId.get("<|startoftranscript|>");
        }

        int transcribeToken = isLargeV3 ? TOKEN_LARGE_V3_TRANSCRIBE : TOKEN_TRANSCRIBE;
        if (tokenToId.containsKey("<|transcribe|>")) {
            transcribeToken = tokenToId.get("<|transcribe|>");
        }

        int noTimestampsToken = isLargeV3 ? TOKEN_LARGE_V3_NO_TIMESTAMPS : TOKEN_NO_TIMESTAMPS;
        if (tokenToId.containsKey("<|notimestamps|>")) {
            noTimestampsToken = tokenToId.get("<|notimestamps|>");
        }

        int langToken = 50259; // Default English
        if (language != null) {
            String clean = language.trim().toLowerCase();
            String langTag = "<|" + clean + "|>";
            if (tokenToId.containsKey(langTag)) {
                langToken = tokenToId.get(langTag);
            } else if (isLargeV3 && LARGE_V3_LANGUAGE_TOKENS.containsKey(clean)) {
                langToken = LARGE_V3_LANGUAGE_TOKENS.get(clean);
            } else if (STANDARD_LANGUAGE_TOKENS.containsKey(clean)) {
                langToken = STANDARD_LANGUAGE_TOKENS.get(clean);
            }
        }

        return new long[]{
                sotToken,
                langToken,
                transcribeToken,
                noTimestampsToken
        };
    }

    /**
     * Decodes an array of token IDs into clean human-readable text.
     */
    public String decode(@NonNull long[] tokenIds) {
        if (NativeRustBridge.isLoaded()) {
            try {
                String nativeDecoded = NativeRustBridge.decodeTokens(tokenIds);
                if (nativeDecoded != null) {
                    return nativeDecoded;
                }
            } catch (Throwable t) {
                Log.w(TAG, "Native decodeTokens error, falling back to Java: " + t.getMessage());
            }
        }

        StringBuilder sb = new StringBuilder();
        for (long id : tokenIds) {
            int intId = (int) id;
            if (intId >= 50257) {
                // Skip Whisper control and timestamp tokens
                continue;
            }

            String tokenStr = idToToken.get(intId);
            if (tokenStr != null) {
                // Handle byte-level BPE character replacements:
                // 'Ġ' (U+0120) represents a leading space
                // 'Ċ' (U+010A) represents a newline
                tokenStr = tokenStr.replace("\u0120", " ").replace("\u010A", "\n");
                sb.append(tokenStr);
            }
        }
        return sb.toString().trim();
    }
}
