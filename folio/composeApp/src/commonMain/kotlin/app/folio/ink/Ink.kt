package app.folio.ink

import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.PointerId
import androidx.compose.ui.input.pointer.PointerInputChange
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChange
import androidx.compose.ui.unit.dp
import app.folio.data.BoardStyle
import app.folio.data.InkPrefs
import app.folio.data.InkStroke
import app.folio.data.InkTool
import app.folio.data.PaperNotes
import kotlin.math.hypot

enum class Tool { PEN, HIGHLIGHTER, ERASER }

val PenColors = listOf(0xFF1B1B1FL, 0xFF2457D6L, 0xFFD93A2BL, 0xFF1E8E5AL, 0xFF7B4BC4L, 0xFFF26B3AL)
val HighlighterColors = listOf(0xFFFFE14DL, 0xFF8FE388L, 0xFFFF9BC8L, 0xFF8CD3FFL, 0xFFFFBE6BL)

/** Pen size presets and the slider's range, as fractions of page width. */
val PenPresets = listOf(0.0022f, 0.0042f, 0.0075f, 0.012f)
val PenSizeRange = 0.0012f..0.02f
val HighlighterPresets = listOf(0.012f, 0.02f, 0.032f)
val HighlighterSizeRange = 0.008f..0.05f
val EraserSizeRange = 6f..48f

/** Tool choices, shared by every paper and the whiteboard, and saved between launches. */
@Stable
class InkSettings(prefs: InkPrefs = InkPrefs()) {
    var tool by mutableStateOf(Tool.PEN)
    var penColor by mutableStateOf(prefs.penColor)
    var highlighterColor by mutableStateOf(prefs.highlighterColor)
    var penSize by mutableStateOf(prefs.penSize.coerceIn(PenSizeRange))
    var highlighterSize by mutableStateOf(prefs.highlighterSize.coerceIn(HighlighterSizeRange))

    /** 0 = constant width, 1 = width follows pen pressure fully. */
    var pressure by mutableStateOf(prefs.pressure.coerceIn(0f, 1f))

    /** Off: only the stylus writes, fingers and mouse scroll. On: fingers and mouse write too. */
    var touchDraws by mutableStateOf(prefs.touchDraws)

    /** Eraser reach in dp. */
    var eraserSize by mutableStateOf(prefs.eraserSize.coerceIn(EraserSizeRange))

    /** Set once a real stylus has been seen, to stop suggesting "draw with touch". */
    var stylusSeen by mutableStateOf(false)

    fun toPrefs() = InkPrefs(penColor, highlighterColor, penSize, highlighterSize, pressure, touchDraws, eraserSize)
}

/** Strokes, whiteboard and typed notes for one open paper, with one shared undo history. */
@Stable
class InkSession(initial: PaperNotes) {
    val strokes = mutableStateListOf<InkStroke>().apply { addAll(initial.strokes) }
    var text by mutableStateOf(initial.text)
    var boardSheets by mutableIntStateOf(maxOf(1, initial.boardSheets, (initial.strokes.filter { it.board }.maxOfOrNull { it.page } ?: -1) + 1))
        private set
    var boardStyle by mutableStateOf(initial.boardStyle)
        private set

    /** Whiteboard zoom (1 = sheet fits the width) and ruler; per open paper, not saved. */
    var boardZoom by mutableStateOf(1f)
    val ruler = RulerState()

    /** The stroke being drawn right now. */
    var livePage by mutableIntStateOf(-1)
    var liveBoard by mutableStateOf(false)
    val livePoints = mutableStateListOf<Float>()
    var liveTool by mutableStateOf(InkTool.PEN)
    var liveColor by mutableStateOf(0L)
    var liveWidth by mutableStateOf(0f)
    var livePressure by mutableStateOf(1f)

    /** Bumped on every change so the screen knows to save. */
    var version by mutableIntStateOf(0)
        private set

    private sealed interface Edit {
        data class Added(val stroke: InkStroke) : Edit
        data class Erased(val strokes: List<InkStroke>) : Edit
    }

    private val undoStack = ArrayDeque<Edit>()
    private val redoStack = ArrayDeque<Edit>()
    var canUndo by mutableStateOf(false)
        private set
    var canRedo by mutableStateOf(false)
        private set

    private fun changed() {
        canUndo = undoStack.isNotEmpty(); canRedo = redoStack.isNotEmpty(); version++
    }

    fun textChanged(value: String) {
        text = value; version++
    }

    fun strokesOn(page: Int, board: Boolean): List<InkStroke> = strokes.filter { it.page == page && it.board == board }

    fun add(stroke: InkStroke) {
        strokes += stroke
        undoStack.addLast(Edit.Added(stroke)); redoStack.clear(); changed()
    }

    /** Removes whole strokes near (x, y); coordinates are page-width units. */
    fun eraseAt(page: Int, board: Boolean, x: Float, y: Float, radius: Float): Boolean {
        val hit = strokes.filter { s ->
            s.page == page && s.board == board && run {
                val reach = radius + s.width / 2
                val p = s.points
                if (p.size < 6) return@run p.size >= 2 && hypot(p[0] - x, p[1] - y) <= reach
                // Distance to each segment, not just each sample, so fast sparse strokes erase too.
                var i = 0
                var found = false
                while (i + 4 < p.size && !found) {
                    found = segmentDistance(x, y, p[i], p[i + 1], p[i + 3], p[i + 4]) <= reach
                    i += 3
                }
                found
            }
        }
        if (hit.isEmpty()) return false
        strokes.removeAll(hit)
        undoStack.addLast(Edit.Erased(hit)); redoStack.clear(); changed()
        return true
    }

    /** Wipes one whiteboard sheet; undo brings it back. */
    fun clearSheet(sheet: Int) {
        val hit = strokesOn(sheet, board = true)
        if (hit.isEmpty()) return
        strokes.removeAll(hit)
        undoStack.addLast(Edit.Erased(hit)); redoStack.clear(); changed()
    }

    fun addSheet() {
        boardSheets++; version++
    }

    fun setStyle(style: BoardStyle) {
        boardStyle = style; version++
    }

    fun undo() {
        val edit = undoStack.removeLastOrNull() ?: return
        when (edit) {
            is Edit.Added -> strokes.remove(edit.stroke)
            is Edit.Erased -> strokes.addAll(edit.strokes)
        }
        redoStack.addLast(edit); changed()
    }

    fun redo() {
        val edit = redoStack.removeLastOrNull() ?: return
        when (edit) {
            is Edit.Added -> strokes.add(edit.stroke)
            is Edit.Erased -> strokes.removeAll(edit.strokes)
        }
        undoStack.addLast(edit); changed()
    }

    fun snapshot(now: Long) = PaperNotes(strokes.toList(), text, now, boardSheets, boardStyle)
}

private fun segmentDistance(px: Float, py: Float, ax: Float, ay: Float, bx: Float, by: Float): Float {
    val dx = bx - ax
    val dy = by - ay
    val len2 = dx * dx + dy * dy
    val t = if (len2 == 0f) 0f else (((px - ax) * dx + (py - ay) * dy) / len2).coerceIn(0f, 1f)
    return hypot(px - (ax + t * dx), py - (ay + t * dy))
}

private sealed interface Action {
    data object None : Action
    data object Pan : Action
    data object Erase : Action
    data class Draw(val tool: InkTool) : Action
}

/**
 * Pointer handling for one PDF page or whiteboard sheet: stylus writes, the stylus eraser end
 * (or the eraser tool) erases, and fingers/mouse either scroll or write depending on
 * [InkSettings.touchDraws].
 */
@OptIn(androidx.compose.ui.ExperimentalComposeUiApi::class)
fun Modifier.inkInput(
    page: Int,
    board: Boolean,
    session: InkSession,
    settings: InkSettings,
    pen: PenInput,
    onPan: (Offset) -> Unit,
    onInkingChange: (Boolean) -> Unit,
    onInk: () -> Unit,
    /** Given where a stroke starts (local coordinates), a function that bends its points onto a ruler, or null. */
    snapFor: ((Offset) -> ((Offset) -> Offset)?)? = null,
): Modifier = pointerInput(page, board, session, settings, pen, snapFor) {
    awaitEachGesture {
        val down = awaitFirstDown(requireUnconsumed = false)
        val sample = pen.classify(down)
        if (sample.kind == InputKind.STYLUS || sample.kind == InputKind.STYLUS_ERASER) settings.stylusSeen = true
        val toolAction = when (settings.tool) {
            Tool.ERASER -> Action.Erase
            Tool.HIGHLIGHTER -> Action.Draw(InkTool.HIGHLIGHTER)
            Tool.PEN -> Action.Draw(InkTool.PEN)
        }
        val action = when (sample.kind) {
            InputKind.STYLUS -> toolAction
            InputKind.STYLUS_ERASER -> Action.Erase
            InputKind.FINGER -> if (settings.touchDraws) toolAction else if (pen.manualTouchScroll) Action.Pan else Action.None
            InputKind.MOUSE -> if (settings.touchDraws) toolAction else Action.None
        }
        if (action == Action.None) return@awaitEachGesture

        val w = size.width.toFloat().coerceAtLeast(1f)
        val id = down.id
        down.consume()

        when (action) {
            Action.Pan -> trackPointer(id) { change -> if (!pen.multiTouchActive) onPan(change.positionChange()) }
            Action.Erase -> {
                onInkingChange(true)
                val radius = settings.eraserSize.dp.toPx() / w
                session.eraseAt(page, board, down.position.x / w, down.position.y / w, radius)
                trackPointer(id) { change -> session.eraseAt(page, board, change.position.x / w, change.position.y / w, radius) }
                onInkingChange(false)
            }
            is Action.Draw -> {
                onInkingChange(true)
                // Highlighter and pen both follow the ruler when started against it.
                val snap = snapFor?.invoke(down.position)
                fun at(p: Offset) = snap?.invoke(p) ?: p
                val isPen = action.tool == InkTool.PEN
                session.livePage = page
                session.liveBoard = board
                session.liveTool = action.tool
                session.liveColor = if (isPen) settings.penColor else settings.highlighterColor
                session.liveWidth = if (isPen) settings.penSize else settings.highlighterSize
                session.livePressure = if (isPen) settings.pressure else 0f
                session.livePoints.clear()
                val first = at(down.position)
                session.livePoints.addAll(listOf(first.x / w, first.y / w, sample.pressure))
                val completed = trackPointer(id) { change ->
                    val p = pen.classify(change).pressure
                    // Include the samples the system batched between frames, for smooth curves.
                    change.historical.forEach { h -> val q = at(h.position); session.livePoints.addAll(listOf(q.x / w, q.y / w, p)) }
                    val q = at(change.position)
                    session.livePoints.addAll(listOf(q.x / w, q.y / w, p))
                }
                if (!completed) {
                    // A second finger turned this into a pinch: drop the half-drawn stroke.
                    session.livePoints.clear(); session.livePage = -1; onInkingChange(false)
                    return@awaitEachGesture
                }
                val pts = session.livePoints.toMutableList()
                if (pts.size == 3) pts.addAll(listOf(pts[0] + 0.0005f, pts[1] + 0.0005f, pts[2])) // a tap leaves a dot
                session.add(InkStroke(page, session.liveTool, session.liveColor, session.liveWidth, pts, board = board, pressure = session.livePressure))
                session.livePoints.clear()
                session.livePage = -1
                onInkingChange(false)
                onInk()
            }
            Action.None -> Unit
        }
    }
}

/**
 * Follows one pointer until it lifts. Returns false if something earlier in the chain (the
 * board's pinch or ruler handling) claimed the gesture first.
 */
private suspend fun androidx.compose.ui.input.pointer.AwaitPointerEventScope.trackPointer(id: PointerId, onMove: (PointerInputChange) -> Unit): Boolean {
    while (true) {
        val event = awaitPointerEvent()
        val change = event.changes.firstOrNull { it.id == id } ?: return true
        if (change.isConsumed) return false
        if (!change.pressed) {
            change.consume(); return true
        }
        if (change.positionChange() != Offset.Zero) onMove(change)
        change.consume()
    }
}

/** Draws finished strokes. Highlighter multiplies onto the page like real ink. */
fun DrawScope.drawStrokes(strokes: List<InkStroke>) {
    strokes.forEach { drawStroke(it.tool, it.color, it.width, it.points, it.pressure) }
}

/**
 * Draws one stroke. With [sensitivity] > 0 and real pressure samples, the width follows the pen:
 * at full sensitivity a light touch is about a third of the set width and a firm one about 1.25×.
 */
fun DrawScope.drawStroke(tool: InkTool, color: Long, width: Float, points: List<Float>, sensitivity: Float = 1f) {
    val w = size.width
    if (points.size < 6) return
    if (tool == InkTool.HIGHLIGHTER) {
        val path = Path().apply {
            moveTo(points[0] * w, points[1] * w)
            var i = 3
            while (i + 1 < points.size) { lineTo(points[i] * w, points[i + 1] * w); i += 3 }
        }
        drawPath(path, Color(color).copy(alpha = 0.55f), style = Stroke(width * w, cap = StrokeCap.Square, join = StrokeJoin.Round), blendMode = BlendMode.Multiply)
        return
    }
    val base = width * w
    val c = Color(color)
    val uniform = sensitivity <= 0.01f || (2 until points.size step 3).all { points[it] >= 0.99f }
    if (uniform) {
        // Constant width (mouse, pressure off): one smooth path through midpoints.
        val path = Path().apply {
            moveTo(points[0] * w, points[1] * w)
            var i = 3
            while (i + 4 < points.size) {
                val mx = (points[i] + points[i + 3]) / 2 * w
                val my = (points[i + 1] + points[i + 4]) / 2 * w
                quadraticTo(points[i] * w, points[i + 1] * w, mx, my)
                i += 3
            }
            lineTo(points[points.size - 3] * w, points[points.size - 2] * w)
        }
        drawPath(path, c, style = Stroke(base, cap = StrokeCap.Round, join = StrokeJoin.Round))
    } else {
        var i = 0
        while (i + 5 < points.size) {
            val p = (points[i + 2] + points[i + 5]) / 2
            val factor = (1f - sensitivity) + sensitivity * (0.35f + 0.9f * p)
            drawLine(
                c, Offset(points[i] * w, points[i + 1] * w), Offset(points[i + 3] * w, points[i + 4] * w),
                strokeWidth = base * factor, cap = StrokeCap.Round,
            )
            i += 3
        }
    }
}
