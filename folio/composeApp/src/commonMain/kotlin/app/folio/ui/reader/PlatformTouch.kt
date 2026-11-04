package app.folio.ui.reader

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.layout.LayoutCoordinates
import app.folio.ink.GesturePhase
import app.folio.ink.PenInput
import app.folio.ink.TouchGesture

/** A platform touch gesture, already mapped into one surface's own coordinates. */
data class LocalTouch(val gesture: TouchGesture, val start: Offset, val centroid: Offset)

/**
 * Feeds this surface the platform's touch gestures (Windows) that start inside it.
 * [coordinates] gives the surface's layout coordinates; a gesture is claimed at START if it
 * begins within the surface's bounds, and followed until END wherever the fingers go.
 */
@Composable
fun PlatformTouch(pen: PenInput, coordinates: () -> LayoutCoordinates?, onTouch: (LocalTouch) -> Unit) {
    val handler by rememberUpdatedState(onTouch)
    LaunchedEffect(pen) {
        var claimed = -1
        pen.touchGestures?.collect { g ->
            val c = coordinates()?.takeIf { it.isAttached } ?: return@collect
            val start = c.windowToLocal(g.start)
            if (g.phase == GesturePhase.START) {
                val size = c.size
                claimed = if (start.x in 0f..size.width.toFloat() && start.y in 0f..size.height.toFloat()) g.id else -1
            }
            if (g.id != claimed) return@collect
            handler(LocalTouch(g, start, c.windowToLocal(g.centroid)))
            if (g.phase == GesturePhase.END) claimed = -1
        }
    }
}
