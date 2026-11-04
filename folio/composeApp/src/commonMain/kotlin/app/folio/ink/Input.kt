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
enum class GesturePhase { START, MOVE, END }

/**
 * Touch gestures the platform recognises itself, outside Compose's pointer events (Windows, where
 * Java sees neither touch drags nor multi-touch). Positions are in window pixels.
 *
 * One finger pans; two fingers pinch (scale), twist (rotation) and pan together. [id] ties the
 * steps of one gesture together, so a surface can claim it at START and follow it to END.
 */
data class TouchGesture(
    val id: Int,
    val phase: GesturePhase,
    val fingers: Int,
    val start: Offset,
    val centroid: Offset,
    val pan: Offset = Offset.Zero,
    val scale: Float = 1f,
    val rotation: Float = 0f,
)

/** A precise pen position (window pixels, sub-pixel) and pressure, straight from the platform. */
data class PenSample(val position: Offset, val pressure: Float)

interface PenInput {
    fun classify(change: PointerInputChange): PointerSample

    /** True where touch drags don't scroll lists by themselves and nothing else handles them. */
    val manualTouchScroll: Boolean get() = false

    /** Touch gestures recognised by the platform, if it does that (see [TouchGesture]). */
    val touchGestures: Flow<TouchGesture>? get() = null

    /**
     * Precise pen samples received since the last call, oldest first, or null if the platform
     * doesn't provide them (then Compose's own positions are used).
     */
    fun drainPenSamples(): List<PenSample>? = null
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
