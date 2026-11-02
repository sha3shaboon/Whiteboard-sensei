import org.jetbrains.compose.desktop.application.dsl.TargetFormat
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("org.jetbrains.kotlin.multiplatform")
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
    id("org.jetbrains.compose")
}

val ktor = "3.0.3"

kotlin {
    androidTarget {
        compilerOptions { jvmTarget.set(JvmTarget.JVM_17) }
    }
    jvm("desktop")
    // iOS: add iosArm64()/iosSimulatorArm64() here and ktor-client-darwin; shared code has no JVM-only APIs.

    sourceSets {
        val desktopMain by getting
        val desktopTest by getting

        commonMain.dependencies {
            implementation(compose.runtime)
            implementation(compose.foundation)
            implementation(compose.material3)
            implementation(compose.materialIconsExtended)
            implementation(compose.ui)
            implementation(compose.components.resources)
            implementation("io.ktor:ktor-client-core:$ktor")
            implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
            implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.9.0")
            implementation("org.jetbrains.kotlinx:kotlinx-datetime:0.6.1")
            implementation("com.squareup.okio:okio:3.9.1")
        }
        androidMain.dependencies {
            implementation("androidx.activity:activity-compose:1.9.3")
            implementation("androidx.core:core-splashscreen:1.0.1")
            implementation("androidx.browser:browser:1.8.0")
            implementation("io.ktor:ktor-client-okhttp:$ktor")
            implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
        }
        desktopMain.dependencies {
            implementation(compose.desktop.currentOs)
            implementation("io.ktor:ktor-client-okhttp:$ktor")
            implementation("org.jetbrains.kotlinx:kotlinx-coroutines-swing:1.9.0")
            implementation("org.apache.pdfbox:pdfbox:3.0.3")
        }
        desktopTest.dependencies {
            implementation(kotlin("test"))
            implementation(compose.desktop.uiTestJUnit4)
        }
    }
}

android {
    namespace = "app.folio"
    compileSdk = 35

    defaultConfig {
        applicationId = "app.folio"
        minSdk = 26
        targetSdk = 35
        versionCode = 2
        versionName = "0.2.0"
    }
    sourceSets["main"].manifest.srcFile("src/androidMain/AndroidManifest.xml")
    sourceSets["main"].res.srcDirs("src/androidMain/res")

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            // Signed with the debug key so the release APK installs for testing; use a real key before publishing.
            signingConfig = signingConfigs.getByName("debug")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    packaging {
        resources.excludes += setOf("/META-INF/{AL2.0,LGPL2.1}", "/META-INF/versions/9/OSGI-INF/MANIFEST.MF")
    }
}

compose.desktop {
    application {
        mainClass = "app.folio.MainKt"
        nativeDistributions {
            targetFormats(TargetFormat.Dmg, TargetFormat.Msi, TargetFormat.Deb)
            packageName = "Folio"
            packageVersion = "1.0.2"
            description = "A library of new open-access research papers"
        }
    }
}

tasks.withType<Test>().configureEach {
    systemProperty("live", System.getProperty("live") ?: "false")
    System.getProperty("openalexKey")?.let { systemProperty("openalexKey", it) }
    System.getProperty("shotsDir")?.let { systemProperty("shotsDir", it) }
    testLogging { showStandardStreams = true }
}

compose.resources {
    packageOfResClass = "app.folio.resources"
}
