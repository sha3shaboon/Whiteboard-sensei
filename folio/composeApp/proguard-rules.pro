# kotlinx.serialization
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt
-keepclassmembers class kotlinx.serialization.json.** { *** Companion; }
-keepclasseswithmembers class kotlinx.serialization.json.** { kotlinx.serialization.KSerializer serializer(...); }
-keep,includedescriptorclasses class app.folio.**$$serializer { *; }
-keepclassmembers class app.folio.** { *** Companion; }
-keepclasseswithmembers class app.folio.** { kotlinx.serialization.KSerializer serializer(...); }
# Ktor / OkHttp
-dontwarn org.slf4j.**
-dontwarn okhttp3.internal.platform.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**
-dontwarn java.lang.management.**
-keep class io.ktor.client.engine.okhttp.OkHttpEngineContainer { *; }
