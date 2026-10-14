# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.

# Keep line numbers for stack traces
-keepattributes SourceFile,LineNumberTable

# Capacitor & JavaScript Interface Rules
-keep public class * extends com.getcapacitor.Plugin { *; }
-keepclassmembers class * extends com.getcapacitor.Plugin { public *; }
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keepclassmembers class * {
    @com.getcapacitor.PluginMethod public *;
}
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Cordova compatibility classes
-keep class org.apache.cordova.** { *; }

# Lexiduo Application Classes & Plugins
-keep class com.lexiduo.app.** { *; }
-keepclassmembers class com.lexiduo.app.** { *; }

# ONNX Runtime JNI bindings
-keep class ai.onnxruntime.** { *; }
-keepclassmembers class ai.onnxruntime.** { *; }

# Lexiduo Rust NDK Native Bridge Protection
-keepclasseswithmembernames class * {
    native <methods>;
}
-keep class com.lexiduo.app.whisper.NativeRustBridge { *; }

# Security Hardening (CWE-532): Strip all logging from release builds
-assumenosideeffects class android.util.Log {
    public static boolean isLoggable(java.lang.String, int);
    public static int v(...);
    public static int d(...);
    public static int i(...);
    public static int w(...);
    public static int e(...);
    public static int println(...);
}
