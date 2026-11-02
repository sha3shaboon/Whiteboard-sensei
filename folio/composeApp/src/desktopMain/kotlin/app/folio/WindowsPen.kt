package app.folio

import androidx.compose.ui.input.pointer.PointerInputChange
import androidx.compose.ui.input.pointer.PointerType
import app.folio.ink.InputKind
import app.folio.ink.PenInput
import app.folio.ink.PointerSample
import com.sun.jna.Native
import com.sun.jna.Pointer
import com.sun.jna.Structure
import com.sun.jna.CallbackReference
import com.sun.jna.platform.win32.User32
import com.sun.jna.platform.win32.WinDef.HWND
import com.sun.jna.platform.win32.WinDef.LPARAM
import com.sun.jna.platform.win32.WinDef.LRESULT
import com.sun.jna.platform.win32.WinDef.POINT
import com.sun.jna.platform.win32.WinDef.WPARAM
import com.sun.jna.platform.win32.WinNT.HANDLE
import com.sun.jna.platform.win32.WinUser
import com.sun.jna.ptr.IntByReference
import com.sun.jna.win32.StdCallLibrary
import com.sun.jna.win32.W32APIOptions

/**
 * Surface Pen (and other Windows Ink pens) for the desktop app.
 *
 * Java on Windows only sees the pen as a mouse: no pressure, no eraser end, no way to tell pen
 * from finger. Windows does send richer WM_POINTER messages first, so this listens to those on the
 * app's window (by chaining its window procedure), records what the pointer is and how hard it's
 * pressed, then lets every message carry on unchanged. The reader asks [classify] about each
 * Compose pointer event and gets the pen's real state.
 *
 * It also switches off press-and-hold right-click and flicks on the window, which otherwise get in
 * the way of handwriting.
 *
 * Everything is best effort: if any call fails, the pen keeps working as a plain mouse.
 */
object WindowsPen : PenInput {
    private data class State(val kind: InputKind, val pressure: Float, val inRange: Boolean, val time: Long)

    @Volatile
    private var state: State? = null

    @Volatile
    var installed = false
        private set

    // Callbacks must stay reachable or the JVM collects them while Windows still calls them.
    private val keepAlive = mutableListOf<Any>()

    override val manualTouchScroll: Boolean = true

    override fun classify(change: PointerInputChange): PointerSample {
        val s = state
        val fresh = s != null && s.inRange && System.currentTimeMillis() - s.time < 250
        return when {
            fresh && s!!.kind == InputKind.STYLUS -> PointerSample(InputKind.STYLUS, s.pressure.coerceIn(0.05f, 1f))
            fresh && s!!.kind == InputKind.STYLUS_ERASER -> PointerSample(InputKind.STYLUS_ERASER, 1f)
            fresh && s!!.kind == InputKind.FINGER -> PointerSample(InputKind.FINGER, 1f)
            change.type == PointerType.Stylus -> PointerSample(InputKind.STYLUS, change.pressure.takeIf { it > 0f } ?: 1f)
            change.type == PointerType.Eraser -> PointerSample(InputKind.STYLUS_ERASER, 1f)
            change.type == PointerType.Touch -> PointerSample(InputKind.FINGER, 1f)
            else -> PointerSample(InputKind.MOUSE, 1f)
        }
    }

    /** Raw PEN_FLAGS from the last pen message, for diagnostics and tests. */
    @Volatile
    var lastPenFlags: Int = 0
        private set

    /** The most recent pen/touch reading from Windows, for diagnostics and tests. */
    fun lastReading(): PointerSample? = state?.let { PointerSample(it.kind, it.pressure) }

    /** Hooks the window and its child windows (Compose draws into a child canvas). Call once shown. */
    fun install(window: java.awt.Window) {
        if (installed || !System.getProperty("os.name").lowercase().contains("win")) return
        try {
            val top = HWND(Native.getComponentPointer(window))
            val targets = mutableListOf(top)
            User32.INSTANCE.EnumChildWindows(top, { child, _ -> targets += child; true }, null)
            targets.forEach(::hook)
            installed = true
            println("Folio: Windows pen input enabled on ${targets.size} window(s)")
        } catch (t: Throwable) {
            println("Folio: Windows pen input unavailable (${t.message}); the pen will act as a mouse")
        }
    }

    private fun hook(hwnd: HWND) {
        val user32 = User32.INSTANCE
        // Read the current window procedure first, so the hook can always hand messages on.
        val previous = Pointer(user32.GetWindowLongPtr(hwnd, WinUser.GWL_WNDPROC).toLong())
        if (Pointer.nativeValue(previous) == 0L) return
        val proc = object : WinUser.WindowProc {
            override fun callback(h: HWND, msg: Int, w: WPARAM, l: LPARAM): LRESULT {
                if (msg in WM_POINTERUPDATE..WM_POINTERCAPTURECHANGED) runCatching { onPointer(msg, w) }
                return user32.CallWindowProc(previous, h, msg, w, l)
            }
        }
        keepAlive += proc
        user32.SetWindowLongPtr(hwnd, WinUser.GWL_WNDPROC, CallbackReference.getFunctionPointer(proc))
        // Pen feedback off: no press-and-hold right-click ring, no flicks, no tap ripples.
        runCatching {
            Win32.INSTANCE.SetPropW(hwnd, "MicrosoftTabletPenServiceProperty", HANDLE(Pointer.createConstant(TABLET_FLAGS)))
        }
    }

    private fun onPointer(msg: Int, w: WPARAM) {
        val id = (w.toLong() and 0xFFFF).toInt()
        val type = IntByReference()
        if (!Win32.INSTANCE.GetPointerType(id, type)) return
        val now = System.currentTimeMillis()
        val ending = msg == WM_POINTERLEAVE || msg == WM_POINTERCAPTURECHANGED
        when (type.value) {
            PT_PEN -> {
                val info = PointerPenInfo()
                if (!Win32.INSTANCE.GetPointerPenInfo(id, info)) return
                lastPenFlags = info.penFlags
                val eraser = info.penFlags and (PEN_FLAG_ERASER or PEN_FLAG_INVERTED) != 0
                // The barrel button also erases while held, like most note apps.
                val barrel = info.penFlags and PEN_FLAG_BARREL != 0
                val kind = if (eraser || barrel) InputKind.STYLUS_ERASER else InputKind.STYLUS
                val pressure = if (info.penMask and PEN_MASK_PRESSURE != 0) info.pressure / 1024f else 1f
                // Keep the state "in range" through pen-up so the trailing mouse-up still reads as pen.
                state = State(kind, pressure, inRange = !ending, time = now)
            }
            PT_TOUCH -> state = State(InputKind.FINGER, 1f, inRange = !ending, time = now)
            else -> if (ending) state = null
        }
    }

    // Win32 constants
    private const val WM_POINTERUPDATE = 0x0245
    private const val WM_POINTERLEAVE = 0x024A
    private const val WM_POINTERCAPTURECHANGED = 0x024C
    private const val PT_TOUCH = 2
    private const val PT_PEN = 3
    private const val PEN_FLAG_BARREL = 0x1
    private const val PEN_FLAG_INVERTED = 0x2
    private const val PEN_FLAG_ERASER = 0x4
    private const val PEN_MASK_PRESSURE = 0x1
    private const val TABLET_FLAGS = 0x00000001L or 0x00000008L or 0x00000010L or 0x00010000L

    @Suppress("FunctionName")
    private interface Win32 : StdCallLibrary {
        fun GetPointerType(pointerId: Int, pointerType: IntByReference): Boolean
        fun GetPointerPenInfo(pointerId: Int, penInfo: PointerPenInfo): Boolean
        fun SetPropW(hwnd: HWND, name: String, data: HANDLE): Boolean

        companion object {
            val INSTANCE: Win32 by lazy { Native.load("user32", Win32::class.java, W32APIOptions.UNICODE_OPTIONS) }
        }
    }
}

/** Win32 POINTER_INFO. */
@Structure.FieldOrder(
    "pointerType", "pointerId", "frameId", "pointerFlags", "sourceDevice", "hwndTarget",
    "ptPixelLocation", "ptHimetricLocation", "ptPixelLocationRaw", "ptHimetricLocationRaw",
    "dwTime", "historyCount", "inputData", "dwKeyStates", "performanceCount", "buttonChangeType",
)
open class PointerInfo : Structure() {
    @JvmField var pointerType: Int = 0
    @JvmField var pointerId: Int = 0
    @JvmField var frameId: Int = 0
    @JvmField var pointerFlags: Int = 0
    @JvmField var sourceDevice: Pointer? = null
    @JvmField var hwndTarget: Pointer? = null
    @JvmField var ptPixelLocation: POINT = POINT()
    @JvmField var ptHimetricLocation: POINT = POINT()
    @JvmField var ptPixelLocationRaw: POINT = POINT()
    @JvmField var ptHimetricLocationRaw: POINT = POINT()
    @JvmField var dwTime: Int = 0
    @JvmField var historyCount: Int = 0
    @JvmField var inputData: Int = 0
    @JvmField var dwKeyStates: Int = 0
    @JvmField var performanceCount: Long = 0
    @JvmField var buttonChangeType: Int = 0
}

/** Win32 POINTER_PEN_INFO. */
@Structure.FieldOrder("pointerInfo", "penFlags", "penMask", "pressure", "rotation", "tiltX", "tiltY")
class PointerPenInfo : Structure() {
    @JvmField var pointerInfo: PointerInfo = PointerInfo()
    @JvmField var penFlags: Int = 0
    @JvmField var penMask: Int = 0
    @JvmField var pressure: Int = 0
    @JvmField var rotation: Int = 0
    @JvmField var tiltX: Int = 0
    @JvmField var tiltY: Int = 0
}
