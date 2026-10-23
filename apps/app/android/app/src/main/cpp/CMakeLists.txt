cmake_minimum_required(VERSION 3.18.1)
project(whisper_jni LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_C_STANDARD 11)

set(WHISPER_DIR ${CMAKE_CURRENT_SOURCE_DIR}/whisper)

include_directories(
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${WHISPER_DIR}/include
    ${WHISPER_DIR}/src
    ${WHISPER_DIR}/ggml/include
    ${WHISPER_DIR}/ggml/src
    ${WHISPER_DIR}/ggml/src/ggml-cpu
)

# GGML core and CPU sources
file(GLOB GGML_SOURCES
    ${WHISPER_DIR}/ggml/src/*.c
    ${WHISPER_DIR}/ggml/src/*.cpp
    ${WHISPER_DIR}/ggml/src/ggml-cpu/*.c
    ${WHISPER_DIR}/ggml/src/ggml-cpu/*.cpp
    ${WHISPER_DIR}/ggml/src/ggml-cpu/tiled/*.cpp
    ${WHISPER_DIR}/ggml/src/ggml-cpu/llamafile/*.cpp
)

# Whisper core sources and our JNI bridge
set(WHISPER_SOURCES
    ${WHISPER_DIR}/src/whisper.cpp
    ${WHISPER_DIR}/src/aneforge/whisper-aneforge.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/whisper_jni.cpp
)

# Arch-specific GGML sources
set(ARCH_SOURCES "")
if (${ANDROID_ABI} MATCHES "^arm")
    list(APPEND ARCH_SOURCES
        ${WHISPER_DIR}/ggml/src/ggml-cpu/arch/arm/quants.c
        ${WHISPER_DIR}/ggml/src/ggml-cpu/arch/arm/repack.cpp
    )
elseif (${ANDROID_ABI} MATCHES "^x86")
    list(APPEND ARCH_SOURCES
        ${WHISPER_DIR}/ggml/src/ggml-cpu/arch/x86/quants.c
        ${WHISPER_DIR}/ggml/src/ggml-cpu/arch/x86/repack.cpp
    )
endif()

add_library(whisper_jni SHARED
    ${GGML_SOURCES}
    ${ARCH_SOURCES}
    ${WHISPER_SOURCES}
)

target_compile_definitions(whisper_jni PUBLIC
    GGML_USE_CPU
    _GNU_SOURCE
    NDEBUG
    WHISPER_VERSION="1.7.1"
)

if (${ANDROID_ABI} STREQUAL "arm64-v8a")
    target_compile_options(whisper_jni PRIVATE
        -march=armv8.2-a+fp16+dotprod
        -O3
        -fno-finite-math-only
    )
else()
    target_compile_options(whisper_jni PRIVATE
        -O3
        -fno-finite-math-only
    )
endif()

find_library(LOG_LIB log)
find_library(ANDROID_LIB android)

target_link_libraries(whisper_jni
    ${LOG_LIB}
    ${ANDROID_LIB}
)
