#include <jni.h>
#include <android/log.h>
#include <string>
#include <vector>
#include <atomic>
#include "whisper.h"
#include "ggml.h"

#define TAG "WhisperJNI"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, TAG, __VA_ARGS__)
#define LOGW(...) __android_log_print(ANDROID_LOG_WARN, TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, TAG, __VA_ARGS__)

static std::atomic<bool> g_abort(false);

extern "C" {

JNIEXPORT void JNICALL
Java_com_lexiduo_app_whisper_WhisperCppEngine_nativeAbort(JNIEnv *env, jclass clazz) {
    LOGI("nativeAbort requested");
    g_abort.store(true);
}

JNIEXPORT jboolean JNICALL
Java_com_lexiduo_app_whisper_WhisperCppEngine_nativeIsAvailable(JNIEnv *env, jclass clazz) {
    return JNI_TRUE;
}

JNIEXPORT jstring JNICALL
Java_com_lexiduo_app_whisper_WhisperCppEngine_nativeGetSystemInfo(JNIEnv *env, jclass clazz) {
    const char *sys_info = whisper_print_system_info();
    return env->NewStringUTF(sys_info ? sys_info : "whisper.cpp ARM NEON");
}

JNIEXPORT jlong JNICALL
Java_com_lexiduo_app_whisper_WhisperCppEngine_nativeInitContext(JNIEnv *env, jclass clazz, jstring model_path_jstr) {
    if (!model_path_jstr) {
        LOGE("nativeInitContext: model_path is null");
        return 0;
    }

    const char *model_path = env->GetStringUTFChars(model_path_jstr, nullptr);
    struct whisper_context_params cparams = whisper_context_default_params();
    cparams.use_gpu = false; // CPU NEON by default for mobile stability

    LOGI("Loading GGML Whisper model from: %s", model_path);
    struct whisper_context *ctx = whisper_init_from_file_with_params(model_path, cparams);
    env->ReleaseStringUTFChars(model_path_jstr, model_path);

    if (!ctx) {
        LOGE("Failed to load GGML Whisper context");
        return 0;
    }

    LOGI("Successfully loaded GGML Whisper context (%p)", ctx);
    return reinterpret_cast<jlong>(ctx);
}

JNIEXPORT void JNICALL
Java_com_lexiduo_app_whisper_WhisperCppEngine_nativeFreeContext(JNIEnv *env, jclass clazz, jlong context_ptr) {
    if (context_ptr == 0) return;
    auto *ctx = reinterpret_cast<struct whisper_context *>(context_ptr);
    whisper_free(ctx);
    LOGI("Freed GGML Whisper context (%p)", ctx);
}

JNIEXPORT jint JNICALL
Java_com_lexiduo_app_whisper_WhisperCppEngine_nativeFullTranscribe(
        JNIEnv *env, jclass clazz, jlong context_ptr, jfloatArray audio_data_jarr,
        jstring language_jstr, jint num_threads) {
    if (context_ptr == 0 || !audio_data_jarr) {
        return -1;
    }

    g_abort.store(false);

    auto *ctx = reinterpret_cast<struct whisper_context *>(context_ptr);
    jsize n_samples = env->GetArrayLength(audio_data_jarr);
    jfloat *audio_samples = env->GetFloatArrayElements(audio_data_jarr, nullptr);
    if (!audio_samples) {
        LOGE("nativeFullTranscribe: failed to get float array elements (OOM)");
        return -2;
    }

    struct whisper_full_params params = whisper_full_default_params(WHISPER_SAMPLING_GREEDY);
    params.print_realtime = false;
    params.print_progress = false;
    params.print_timestamps = true;
    params.print_special = false;
    params.translate = false;
    params.n_threads = num_threads > 0 ? num_threads : 4;
    params.offset_ms = 0;
    params.no_context = true;
    params.single_segment = false;
    params.abort_callback = [](void *user_data) -> bool {
        return g_abort.load();
    };
    params.abort_callback_user_data = nullptr;

    std::string lang = "auto";
    if (language_jstr) {
        const char *lang_chars = env->GetStringUTFChars(language_jstr, nullptr);
        if (lang_chars) {
            lang = lang_chars;
            env->ReleaseStringUTFChars(language_jstr, lang_chars);
        }
    }
    params.language = lang.c_str();

    whisper_reset_timings(ctx);
    int result = whisper_full(ctx, params, audio_samples, n_samples);

    env->ReleaseFloatArrayElements(audio_data_jarr, audio_samples, JNI_ABORT);
    return result;
}

JNIEXPORT jint JNICALL
Java_com_lexiduo_app_whisper_WhisperCppEngine_nativeGetSegmentCount(JNIEnv *env, jclass clazz, jlong context_ptr) {
    if (context_ptr == 0) return 0;
    auto *ctx = reinterpret_cast<struct whisper_context *>(context_ptr);
    return whisper_full_n_segments(ctx);
}

JNIEXPORT jstring JNICALL
Java_com_lexiduo_app_whisper_WhisperCppEngine_nativeGetSegmentText(JNIEnv *env, jclass clazz, jlong context_ptr, jint index) {
    if (context_ptr == 0) return env->NewStringUTF("");
    auto *ctx = reinterpret_cast<struct whisper_context *>(context_ptr);
    const char *text = whisper_full_get_segment_text(ctx, index);
    return env->NewStringUTF(text ? text : "");
}

JNIEXPORT jlong JNICALL
Java_com_lexiduo_app_whisper_WhisperCppEngine_nativeGetSegmentT0(JNIEnv *env, jclass clazz, jlong context_ptr, jint index) {
    if (context_ptr == 0) return 0;
    auto *ctx = reinterpret_cast<struct whisper_context *>(context_ptr);
    // whisper centiseconds (10ms) to milliseconds
    return static_cast<jlong>(whisper_full_get_segment_t0(ctx, index)) * 10;
}

JNIEXPORT jlong JNICALL
Java_com_lexiduo_app_whisper_WhisperCppEngine_nativeGetSegmentT1(JNIEnv *env, jclass clazz, jlong context_ptr, jint index) {
    if (context_ptr == 0) return 0;
    auto *ctx = reinterpret_cast<struct whisper_context *>(context_ptr);
    // whisper centiseconds (10ms) to milliseconds
    return static_cast<jlong>(whisper_full_get_segment_t1(ctx, index)) * 10;
}

} // extern "C"
