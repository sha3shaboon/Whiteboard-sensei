package app.folio.ink

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.pointer.PointerInputChange
import kotlinx.coroutines.flow.Flow
import androidx.compose.ui.input.pointer.PointerType

/** What touched the screen, as far as the platform can tell. */
enum class InputKind { STYLUS, STYLUS_ERASER, FINGER, MOUSE }

data class PointerSample(val kind: InputKind, val pressure: Float)

/**
 * Turns pointer events into "stylus / eraser / finger / mouse" plus pressure. Android reports this
 * directly; Windows needs help because Java sees the Surface Pen as a mouse (see WindowsPen).
 */
/**
 * One step of a two-finger pinch reported by the platform (Windows, where Compose doesn't see
 * multi-touch). [centroid] is in window pixels; [scale] is this step's change in finger distance.
 */
data class Pinch(val scale: Float, val centroid: Offset, val pan: Offset)

interface PenInput {
    fun classify(change: PointerInputChange): PointerSample

    /** True where touch drags don't scroll lists by themselves (desktop), so the reader pans manually. */
    val manualTouchScroll: Boolean get() = false

    /** Pinches the platform detects outside Compose's own pointer events, if any. */
    val pinches: Flow<Pinch>? get() = null

    /** True while two or more fingers are down (as seen by the platform), to pause one-finger panning. */
    val multiTouchActive: Boolean get() = false
}

/** Uses what Compose reports: right on Android, everything looks like a mouse on desktop. */
object ComposePenInput : PenInput {
    override fun classify(change: PointerInputChange): PointerSample = when (change.type) {
        PointerType.Stylus -> PointerSample(InputKind.STYLUS, change.pressure.takeIf { it > 0f } ?: 1f)
        PointerType.Eraser -> PointerSample(InputKind.STYLUS_ERASER, 1f)
        PointerType.Touch -> PointerSample(InputKind.FINGER, 1f)
        else -> PointerSample(InputKind.MOUSE, 1f)
    }
}
