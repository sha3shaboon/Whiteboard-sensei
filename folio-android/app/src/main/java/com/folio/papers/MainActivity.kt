package com.folio.papers

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.getValue
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.remember
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.folio.papers.ui.FolioRoot
import com.folio.papers.ui.theme.FolioTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        val splash = installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val container = (application as FolioApp).container
        var ready = false
        splash.setKeepOnScreenCondition { !ready }

        setContent {
            val onboarded by container.library.onboarded.collectAsState(initial = null)
            FolioTheme {
                // Only the first value matters: it picks the start screen. Later changes come from
                // finishing onboarding, which navigates on its own.
                val start = onboarded ?: return@FolioTheme
                val startOnboarded = remember { start }
                ready = true
                FolioRoot(container, onboarded = startOnboarded)
            }
        }
    }
}
