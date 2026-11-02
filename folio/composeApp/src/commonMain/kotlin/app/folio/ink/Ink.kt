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
import app.folio.data.InkStroke
import app.folio.data.InkTool
import app.folio.data.PaperNotes
import androidx.compose.ui.unit.dp
import kotlin.math.hypot

enum class Tool { PEN, HIGHLIGHTER, ERASER }

val PenColors = listOf(0xFF1B1B1FL, 0xFF2457D6L, 0xFFD93A2BL, 0xFF1E8E5AL, 0xFF7B4BC4L, 0xFFF26B3AL)
val HighlighterColors = listOf(0xFFFFE14DL, 0xFF8FE388L, 0xFFFF9BC8L, 0xFF8CD3FFL, 0xFFFFBE6BL)

/** Pen widths as a fraction of page width (thin, medium, thick). */
val PenWidths = listOf(0.0025f, 0.0042f, 0.0075f)
const val HIGHLIGHTER_WIDTH = 0.02f

/** Tool choices; kept for the whole session so each paper opens with your last pen. */
@Stable
class InkSettings {
    var tool by mutableStateOf(Tool.PEN)
    var penColor by mutableStateOf(PenColors[0])
    var highlighterColor by mutableStateOf(HighlighterColors[0])
    var penWidth by mutableIntStateOf(1)

    /** Off: only the stylus writes, fingers and mouse scroll. On: fingers and mouse write too. */
    var touchDraws by mutableStateOf(false)

    /** Set once a real stylus has been seen, to stop suggesting "draw with touch". */
    var stylusSeen by mutableStateOf(false)
}

/** Strokes and typed notes for one open paper, with undo/redo. */
@Stable
class InkSession(initial: PaperNotes) {
    val strokes = mutableStateListOf<InkStroke>().apply { addAll(initial.strokes) }
    var text by mutableStateOf(initial.text)

    /** The stroke being drawn right now. */
    var livePage by mutableIntStateOf(-1)
    val livePoints = mutableStateListOf<Float>()
    var liveTool by mutableStateOf(InkTool.PEN)
    var liveColor by mutableStateOf(0L)
    var liveWidth by mutableStateOf(0f)

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

    fun add(stroke: InkStroke) {
        strokes += stroke
        undoStack.addLast(Edit.Added(stroke)); redoStack.clear(); changed()
    }

    /** Removes whole strokes near (x, y) on [page]; coordinates are page-width units. */
    fun eraseAt(page: Int, x: Float, y: Float, radius: Float): Boolean {
        val hit = strokes.filter { s ->
            s.page == page && run {
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

    fun snapshot(now: Long) = PaperNotes(strokes.toList(), text, now)
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
 * Pointer handling for one PDF page: stylus writes, the stylus eraser end (or the eraser tool)
 * erases, and fingers/mouse either scroll or write depending on [InkSettings.touchDraws].
 */
@OptIn(androidx.compose.ui.ExperimentalComposeUiApi::class)
fun Modifier.inkInput(
    page: Int,
    session: InkSession,
    settings: InkSettings,
    pen: PenInput,
    onPan: (Offset) -> Unit,
    onInkingChange: (Boolean) -> Unit,
    onInk: () -> Unit,
): Modifier = pointerInput(page, session, settings, pen) {
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
            Action.Pan -> trackPointer(id) { change -> onPan(change.positionChange()) }
            Action.Erase -> {
                onInkingChange(true)
                val radius = 14.dp.toPx() / w
                session.eraseAt(page, down.position.x / w, down.position.y / w, radius)
                trackPointer(id) { change -> session.eraseAt(page, change.position.x / w, change.position.y / w, radius) }
                onInkingChange(false)
            }
            is Action.Draw -> {
                onInkingChange(true)
                session.livePage = page
                session.liveTool = action.tool
                session.liveColor = if (action.tool == InkTool.PEN) settings.penColor else settings.highlighterColor
                session.liveWidth = if (action.tool == InkTool.PEN) PenWidths[settings.penWidth] else HIGHLIGHTER_WIDTH
                session.livePoints.clear()
                session.livePoints.addAll(listOf(down.position.x / w, down.position.y / w, sample.pressure))
                trackPointer(id) { change ->
                    val p = pen.classify(change).pressure
                    // Include the samples the system batched between frames, for smooth curves.
                    change.historical.forEach { h -> session.livePoints.addAll(listOf(h.position.x / w, h.position.y / w, p)) }
                    session.livePoints.addAll(listOf(change.position.x / w, change.position.y / w, p))
                }
                val pts = session.livePoints.toMutableList()
                if (pts.size == 3) pts.addAll(listOf(pts[0] + 0.0005f, pts[1] + 0.0005f, pts[2])) // a tap leaves a dot
                session.add(InkStroke(page, session.liveTool, session.liveColor, session.liveWidth, pts))
                session.livePoints.clear()
                session.livePage = -1
                onInkingChange(false)
                onInk()
            }
            Action.None -> Unit
        }
    }
}

private suspend fun androidx.compose.ui.input.pointer.AwaitPointerEventScope.trackPointer(id: PointerId, onMove: (PointerInputChange) -> Unit) {
    while (true) {
        val event = awaitPointerEvent()
        val change = event.changes.firstOrNull { it.id == id } ?: break
        if (!change.pressed) {
            change.consume(); break
        }
        if (change.positionChange() != Offset.Zero) onMove(change)
        change.consume()
    }
}

/** Draws finished strokes for one page. Highlighter multiplies onto the page like real ink. */
fun DrawScope.drawStrokes(strokes: List<InkStroke>) {
    strokes.forEach { drawStroke(it.tool, it.color, it.width, it.points) }
}

fun DrawScope.drawStroke(tool: InkTool, color: Long, width: Float, points: List<Float>) {
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
    val uniform = (2 until points.size step 3).all { points[it] >= 0.99f }
    if (uniform) {
        // Mouse or pressure-less pen: one smooth path through midpoints.
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
        // Pressure-sensitive: width follows the pen, segment by segment.
        var i = 0
        while (i + 5 < points.size) {
            val p = (points[i + 2] + points[i + 5]) / 2
            drawLine(
                c, Offset(points[i] * w, points[i + 1] * w), Offset(points[i + 3] * w, points[i + 4] * w),
                strokeWidth = base * (0.35f + 0.9f * p), cap = StrokeCap.Round,
            )
            i += 3
        }
    }
}
