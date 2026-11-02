package app.folio.ink

import androidx.compose.ui.input.pointer.PointerInputChange
import androidx.compose.ui.input.pointer.PointerType

/** What touched the screen, as far as the platform can tell. */
enum class InputKind { STYLUS, STYLUS_ERASER, FINGER, MOUSE }

data class PointerSample(val kind: InputKind, val pressure: Float)

/**
 * Turns pointer events into "stylus / eraser / finger / mouse" plus pressure. Android reports this
 * directly; Windows needs help because Java sees the Surface Pen as a mouse (see WindowsPen).
 */
interface PenInput {
    fun classify(change: PointerInputChange): PointerSample

    /** True where touch drags don't scroll lists by themselves (desktop), so the reader pans manually. */
    val manualTouchScroll: Boolean get() = false
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
