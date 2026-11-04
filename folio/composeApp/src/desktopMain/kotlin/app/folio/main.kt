package app.folio

import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.isAltPressed
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.type
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Window
import androidx.compose.ui.window.application
import androidx.compose.ui.window.rememberWindowState
import app.folio.ui.BackBus
import java.awt.Dimension

@Suppress("DEPRECATION")
fun main() = application {
    val state = rememberWindowState(width = 1320.dp, height = 860.dp)
    Window(
        onCloseRequest = ::exitApplication,
        state = state,
        title = "Waraq",
        icon = painterResource("folio-icon.png"),
        onPreviewKeyEvent = { e ->
            // Esc (or Alt+Left) goes back, like the system back on a phone.
            val back = e.type == KeyEventType.KeyDown && (e.key == Key.Escape || (e.isAltPressed && e.key == Key.DirectionLeft))
            if (back) BackBus.handler?.invoke() ?: false else false
        },
    ) {
        window.minimumSize = Dimension(420, 640)
        // Hook the pen once the window (and Compose's drawing surface) exists.
        LaunchedEffect(Unit) { WindowsPen.install(window) }
        App(DesktopPlatform())
    }
}
