package app.folio

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.pointer.PointerInputChange
import androidx.compose.ui.input.pointer.PointerType
import app.folio.ink.GesturePhase
import app.folio.ink.InputKind
import app.folio.ink.PenInput
import app.folio.ink.PenSample
import app.folio.ink.PointerSample
import app.folio.ink.TouchGesture
import com.sun.jna.CallbackReference
import com.sun.jna.Native
import com.sun.jna.Pointer
import com.sun.jna.Structure
import com.sun.jna.platform.win32.User32
import com.sun.jna.platform.win32.WinDef.HWND
import com.sun.jna.platform.win32.WinDef.LPARAM
import com.sun.jna.platform.win32.WinDef.LRESULT
import com.sun.jna.platform.win32.WinDef.POINT
import com.sun.jna.platform.win32.WinDef.RECT
import com.sun.jna.platform.win32.WinDef.WPARAM
import com.sun.jna.platform.win32.WinNT.HANDLE
import com.sun.jna.platform.win32.WinUser
import com.sun.jna.ptr.IntByReference
import com.sun.jna.win32.StdCallLibrary
import com.sun.jna.win32.W32APIOptions
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ConcurrentLinkedQueue
import kotlin.math.atan2
import kotlin.math.hypot

/**
 * Pen and touch for the Windows desktop app (Surface Pro and other Windows Ink devices).
 *
 * Java on Windows sees the pen only as a mouse at whole-pixel positions (no pressure, no eraser
 * end), and doesn't see touch drags or multi-touch at all. Windows does send richer WM_POINTER
 * messages first, so this listens to those on the app's windows (by chaining the window
 * procedure) and lets every message carry on unchanged. From them it provides:
 *
 * - pen kind, pressure, eraser end and barrel button, for [classify];
 * - precise pen positions (sub-pixel, including the samples Windows batches between frames), for
 *   smooth strokes, via [drainPenSamples];
 * - touch gestures (one-finger pan, two-finger pinch / twist), via [touchGestures]. Touch is
 *   ignored while the pen is near the screen, so a resting palm doesn't move the page.
 *
 * It also turns off press-and-hold right-click and flicks on the window.
 * Everything is best effort: if a call fails, the pen keeps working as a plain mouse.
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

    /** Window handles already hooked, so installing again only adds new windows. */
    private val hooked = HashSet<Long>()

    /** The window Compose draws into; positions are reported relative to its client area. */
    @Volatile
    private var surface: HWND? = null

    /** Raw PEN_FLAGS from the last pen message, for diagnostics and tests. */
    @Volatile
    var lastPenFlags: Int = 0
        private set

    // Touch drags are handled here, so nothing else needs to pan manually once hooked.
    override val manualTouchScroll: Boolean get() = !installed

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

    /** The most recent pen/touch reading from Windows, for diagnostics and tests. */
    fun lastReading(): PointerSample? = state?.let { PointerSample(it.kind, it.pressure) }

    // ---- Precise pen samples

    private val penSamples = ConcurrentLinkedQueue<PenSample>()
    private var lastFrame = -1
    private val deviceRects = ConcurrentHashMap<Long, Pair<RECT, RECT>?>()

    override fun drainPenSamples(): List<PenSample>? {
        if (!installed) return null
        val out = ArrayList<PenSample>()
        while (true) out += penSamples.poll() ?: break
        return out
    }

    // ---- Touch gestures

    private val touches = ConcurrentHashMap<Int, Offset>()
    private val _gestures = MutableSharedFlow<TouchGesture>(extraBufferCapacity = 256)
    override val touchGestures: Flow<TouchGesture> = _gestures

    private enum class Mode { IDLE, WAITING, PAN, PINCH, BLOCKED }

    private var mode = Mode.IDLE
    private var gestureId = 0
    private var startPoint = Offset.Zero
    private var lastPoint = Offset.Zero
    private var lastPair: Pair<Offset, Offset>? = null
    private var pairIds: Pair<Int, Int>? = null

    /** True while two or more fingers are down. */
    val multiTouchActive: Boolean get() = touches.size >= 2

    /** Product of pinch steps in the current pinch, for diagnostics and tests. */
    @Volatile
    var pinchScaleTotal: Float = 1f
        private set

    /** Sum of pan steps in the current one-finger pan, for diagnostics and tests. */
    @Volatile
    var panTotal: Offset = Offset.Zero
        private set

    /**
     * The pen counts as near (blocking touch, for palm rejection) until it leaves range, or at
     * most [PEN_NEAR_MS] after its last message, so a missed "left range" can't block touch forever.
     */
    @Volatile
    private var penInRange = false

    @Volatile
    private var penLastSeen = 0L

    private val penNear: Boolean get() = penInRange && System.currentTimeMillis() - penLastSeen < PEN_NEAR_MS

    // ---- Installation

    /**
     * Hooks the window and its child windows. [surface] is the component Compose draws into
     * (positions are reported relative to it); by default the first heavyweight canvas inside
     * the window, or the window itself. Calling again only hooks what's new.
     */
    @Synchronized
    fun install(window: java.awt.Window, surface: java.awt.Component? = null) {
        if (!System.getProperty("os.name").lowercase().contains("win")) return
        try {
            val top = HWND(Native.getComponentPointer(window))
            val targets = mutableListOf(top)
            User32.INSTANCE.EnumChildWindows(top, { child, _ -> targets += child; true }, null)
            val fresh = targets.filter { hooked.add(Pointer.nativeValue(it.pointer)) }
            fresh.forEach(::hook)
            val drawing = surface ?: findCanvas(window) ?: window
            this.surface = HWND(Native.getComponentPointer(drawing))
            installed = hooked.isNotEmpty()
            if (fresh.isNotEmpty()) println("Waraq: Windows pen and touch input enabled on ${fresh.size} window(s)")
        } catch (t: Throwable) {
            println("Waraq: Windows pen input unavailable (${t.message}); the pen will act as a mouse")
        }
    }

    private fun findCanvas(c: java.awt.Component): java.awt.Component? {
        if (c is java.awt.Canvas && c.isDisplayable) return c
        if (c is java.awt.Container) for (child in c.components) findCanvas(child)?.let { return it }
        return null
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

    // ---- Message handling

    private fun onPointer(msg: Int, w: WPARAM) {
        val id = (w.toLong() and 0xFFFF).toInt()
        val type = IntByReference()
        if (!Win32.INSTANCE.GetPointerType(id, type)) return
        val now = System.currentTimeMillis()
        val ending = msg == WM_POINTERLEAVE || msg == WM_POINTERCAPTURECHANGED
        when (type.value) {
            PT_PEN -> onPen(id, msg, ending, now)
            PT_TOUCH -> {
                state = State(InputKind.FINGER, 1f, inRange = !ending, time = now)
                onTouch(id, msg)
            }
            else -> if (ending) state = null
        }
    }

    private fun onPen(id: Int, msg: Int, ending: Boolean, now: Long) {
        val info = PointerPenInfo()
        if (!Win32.INSTANCE.GetPointerPenInfo(id, info)) return
        lastPenFlags = info.penFlags
        val eraser = info.penFlags and (PEN_FLAG_ERASER or PEN_FLAG_INVERTED) != 0
        // The barrel button also erases while held, like most note apps.
        val barrel = info.penFlags and PEN_FLAG_BARREL != 0
        val kind = if (eraser || barrel) InputKind.STYLUS_ERASER else InputKind.STYLUS
        val pressure = pressureOf(info)
        // Keep the state "in range" through pen-up so the trailing mouse-up still reads as pen.
        state = State(kind, pressure, inRange = !ending, time = now)
        penInRange = !ending
        penLastSeen = now
        if (penNear && mode != Mode.IDLE && mode != Mode.BLOCKED) endGesture()

        // Precise samples while touching: every batched frame since the last message, in order.
        if (info.pointerInfo.pointerFlags and POINTER_FLAG_INCONTACT != 0 && msg != WM_POINTERUP) {
            val count = info.pointerInfo.historyCount.coerceIn(1, 32)
            val history = if (count > 1) penHistory(id, count) else listOf(info)
            for (h in history.asReversed()) {
                if (h.pointerInfo.frameId == lastFrame) continue
                if (lastFrame != -1 && h.pointerInfo.frameId < lastFrame && lastFrame - h.pointerInfo.frameId < 1000) continue
                lastFrame = h.pointerInfo.frameId
                penSamples += PenSample(toSurface(h.pointerInfo), pressureOf(h))
            }
            while (penSamples.size > 512) penSamples.poll()
        } else if (msg == WM_POINTERUP || ending) {
            lastFrame = -1
        }
    }

    private fun pressureOf(info: PointerPenInfo) =
        if (info.penMask and PEN_MASK_PRESSURE != 0) info.pressure / 1024f else 1f

    private fun penHistory(id: Int, count: Int): List<PointerPenInfo> {
        @Suppress("UNCHECKED_CAST")
        val array = PointerPenInfo().toArray(count) as Array<PointerPenInfo>
        val n = IntByReference(count)
        if (!Win32.INSTANCE.GetPointerPenInfoHistory(id, n, array[0])) return emptyList()
        return (0 until n.value.coerceAtMost(count)).map { array[it].also { s -> s.read() } }
    }

    /**
     * A pointer's position in the drawing surface's client pixels, with sub-pixel precision when
     * the device's high-resolution (HIMETRIC) position can be mapped to the screen.
     */
    private fun toSurface(p: PointerInfo): Offset {
        val origin = POINT(0, 0)
        surface?.let { Win32.INSTANCE.ScreenToClient(it, origin) }
        var sx = p.ptPixelLocation.x.toFloat()
        var sy = p.ptPixelLocation.y.toFloat()
        val device = p.sourceDevice?.let { Pointer.nativeValue(it) } ?: 0L
        val rects = if (device == 0L) null else deviceRects.getOrPut(device) {
            val dev = RECT(); val disp = RECT()
            if (Win32.INSTANCE.GetPointerDeviceRects(HANDLE(p.sourceDevice), dev, disp) && dev.right > dev.left && dev.bottom > dev.top) dev to disp else null
        }
        if (rects != null) {
            val (dev, disp) = rects
            val hx = disp.left + (p.ptHimetricLocation.x - dev.left).toFloat() * (disp.right - disp.left) / (dev.right - dev.left)
            val hy = disp.top + (p.ptHimetricLocation.y - dev.top).toFloat() * (disp.bottom - disp.top) / (dev.bottom - dev.top)
            // Trust the precise position only if it agrees with the pixel one.
            if (kotlin.math.abs(hx - sx) < 3f && kotlin.math.abs(hy - sy) < 3f) { sx = hx; sy = hy }
        }
        return Offset(sx + origin.x, sy + origin.y)
    }

    /**
     * Touch contacts to gestures: one finger pans once it has moved a little (a tap stays a tap,
     * which Windows turns into a click); two fingers pinch, twist and pan. While the pen is near
     * the screen, touches are ignored.
     */
    @Synchronized
    private fun onTouch(id: Int, msg: Int) {
        val info = PointerInfo()
        val up = msg == WM_POINTERUP || msg == WM_POINTERLEAVE || msg == WM_POINTERCAPTURECHANGED
        if (!up && Win32.INSTANCE.GetPointerInfo(id, info) && info.pointerFlags and POINTER_FLAG_INCONTACT != 0) {
            touches[id] = toSurface(info)
        } else {
            touches.remove(id)
        }
        val ids = touches.keys.sorted()
        if (ids.isEmpty()) {
            if (mode != Mode.IDLE) endGesture()
            mode = Mode.IDLE
            return
        }
        if (penNear) {
            if (mode == Mode.PAN || mode == Mode.PINCH) endGesture()
            mode = Mode.BLOCKED
            return
        }
        if (mode == Mode.BLOCKED) return
        if (ids.size >= 2) {
            val pair = ids[0] to ids[1]
            val a = touches[pair.first] ?: return
            val b = touches[pair.second] ?: return
            if (mode != Mode.PINCH || pair != pairIds) {
                if (mode == Mode.PAN) endGesture()
                mode = Mode.PINCH; pairIds = pair; lastPair = a to b; pinchScaleTotal = 1f
                emit(GesturePhase.START, 2, (a + b) / 2f, start = (a + b) / 2f, newId = true)
                return
            }
            val (pa, pb) = lastPair ?: (a to b)
            val before = hypot(pb.x - pa.x, pb.y - pa.y).coerceAtLeast(1f)
            val now = hypot(b.x - a.x, b.y - a.y).coerceAtLeast(1f)
            val turn = (atan2(b.y - a.y, b.x - a.x) - atan2(pb.y - pa.y, pb.x - pa.x)) * 180f / kotlin.math.PI.toFloat()
            val c = (a + b) / 2f
            lastPair = a to b
            pinchScaleTotal *= now / before
            emit(GesturePhase.MOVE, 2, c, pan = c - (pa + pb) / 2f, scale = now / before, rotation = turn)
            return
        }
        // One finger.
        val p = touches[ids[0]] ?: return
        when (mode) {
            Mode.IDLE -> { mode = Mode.WAITING; startPoint = p; lastPoint = p; panTotal = Offset.Zero }
            Mode.WAITING -> if ((p - startPoint).getDistance() > TOUCH_SLOP) {
                mode = Mode.PAN
                emit(GesturePhase.START, 1, startPoint, start = startPoint, newId = true)
                val d = p - startPoint
                panTotal = d
                emit(GesturePhase.MOVE, 1, p, pan = d)
                lastPoint = p
            }
            Mode.PAN -> {
                val d = p - lastPoint
                lastPoint = p
                panTotal += d
                emit(GesturePhase.MOVE, 1, p, pan = d)
            }
            // After a pinch, wait for all fingers to lift before panning again (no jumps).
            Mode.PINCH, Mode.BLOCKED -> Unit
        }
    }

    private fun emit(
        phase: GesturePhase, fingers: Int, centroid: Offset, start: Offset = startPoint,
        pan: Offset = Offset.Zero, scale: Float = 1f, rotation: Float = 0f, newId: Boolean = false,
    ) {
        if (newId) { gestureId++; startPoint = start }
        _gestures.tryEmit(TouchGesture(gestureId, phase, fingers, startPoint, centroid, pan, scale, rotation))
    }

    private fun endGesture() {
        if (mode == Mode.PAN || mode == Mode.PINCH) _gestures.tryEmit(TouchGesture(gestureId, GesturePhase.END, 0, startPoint, lastPoint))
        pairIds = null; lastPair = null
        mode = if (touches.isEmpty()) Mode.IDLE else Mode.BLOCKED
    }

    // Win32 constants
    private const val WM_POINTERUPDATE = 0x0245
    private const val WM_POINTERUP = 0x0247
    private const val WM_POINTERLEAVE = 0x024A
    private const val WM_POINTERCAPTURECHANGED = 0x024C
    private const val POINTER_FLAG_INCONTACT = 0x4
    private const val PT_TOUCH = 2
    private const val PT_PEN = 3
    private const val PEN_FLAG_BARREL = 0x1
    private const val PEN_FLAG_INVERTED = 0x2
    private const val PEN_FLAG_ERASER = 0x4
    private const val PEN_MASK_PRESSURE = 0x1
    private const val TABLET_FLAGS = 0x00000001L or 0x00000008L or 0x00000010L or 0x00010000L
    private const val TOUCH_SLOP = 10f
    private const val PEN_NEAR_MS = 1000L

    @Suppress("FunctionName")
    private interface Win32 : StdCallLibrary {
        fun GetPointerType(pointerId: Int, pointerType: IntByReference): Boolean
        fun GetPointerPenInfo(pointerId: Int, penInfo: PointerPenInfo): Boolean
        fun GetPointerPenInfoHistory(pointerId: Int, entriesCount: IntByReference, penInfo: PointerPenInfo): Boolean
        fun GetPointerInfo(pointerId: Int, info: PointerInfo): Boolean
        fun GetPointerDeviceRects(device: HANDLE, pointerDeviceRect: RECT, displayRect: RECT): Boolean
        fun ScreenToClient(hwnd: HWND, point: POINT): Boolean
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
