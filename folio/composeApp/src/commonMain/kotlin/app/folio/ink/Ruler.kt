package app.folio.ink

import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.geometry.Offset
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.sin

/**
 * A straight edge laid over the whiteboard. It lives in the board's viewport (screen pixels), so
 * it stays put while the sheets scroll and zoom underneath, like a real ruler on paper.
 *
 * Pen strokes that start near either long edge are projected onto that edge, giving a perfectly
 * straight line along it.
 */
@Stable
class RulerState {
    var visible by mutableStateOf(false)

    /** Centre in viewport pixels; Offset.Unspecified until first placed. */
    var center by mutableStateOf(Offset.Unspecified)

    /** Angle shown to the reader, in degrees (snapped to 15° steps when close). */
    var angle by mutableFloatStateOf(0f)
        private set

    /** The un-snapped angle while twisting, so small motions still accumulate. */
    private var rawAngle = 0f

    /** Long side and short side, in pixels; set from the viewport size and density. */
    var length = 0f
    var thickness = 0f

    fun placeIfNeeded(viewportWidth: Float, viewportHeight: Float) {
        if (center == Offset.Unspecified) center = Offset(viewportWidth / 2, viewportHeight * 0.4f)
    }

    fun moveBy(delta: Offset) {
        center += delta
    }

    fun rotateBy(degrees: Float) {
        rawAngle = normalize(rawAngle + degrees)
        angle = snapAngle(rawAngle)
    }

    fun turnTo(degrees: Float) {
        rawAngle = normalize(degrees); angle = rawAngle
    }

    /** Steps through 0°, 45°, 90° and 135°, for a quick tap on the angle label. */
    fun cycleAngle() = turnTo(((angle / 45f).roundToInt() + 1) * 45f % 180f)

    private val radians get() = angle * PI.toFloat() / 180f

    /** Unit vector along the ruler. */
    val direction: Offset get() = Offset(cos(radians), sin(radians))

    /** Unit vector across the ruler. */
    val normal: Offset get() = Offset(-sin(radians), cos(radians))

    /** (along, across) of [p] relative to the ruler's centre. */
    fun local(p: Offset): Offset {
        val d = p - center
        return Offset(d.x * direction.x + d.y * direction.y, d.x * normal.x + d.y * normal.y)
    }

    /** True when [p] is on the ruler's body (where touches move it rather than draw). */
    fun hitsBody(p: Offset): Boolean {
        if (!visible || center == Offset.Unspecified) return false
        val l = local(p)
        return abs(l.x) <= length / 2 && abs(l.y) <= thickness / 2
    }

    /** True when [p] is on the angle label in the middle of the ruler. */
    fun hitsLabel(p: Offset, labelHalfWidth: Float): Boolean {
        val l = local(p)
        return hitsBody(p) && abs(l.x) <= labelHalfWidth && abs(l.y) <= thickness / 3
    }

    /**
     * For a stroke starting at [start], a function that moves each point onto the nearer long edge,
     * or null if the stroke doesn't start close enough to the ruler to follow it.
     */
    fun snapperFor(start: Offset, snapDistance: Float): ((Offset) -> Offset)? {
        if (!visible || center == Offset.Unspecified) return null
        val s = local(start)
        if (abs(s.x) > length / 2 + snapDistance || abs(s.y) > thickness / 2 + snapDistance) return null
        val edge = if (s.y >= 0) thickness / 2 else -thickness / 2
        val n = normal
        return { q ->
            val across = local(q).y
            q - n * (across - edge)
        }
    }

    companion object {
        /** Snap to the nearest 15° when within 2.5°, so 0°, 45° and 90° are easy to hit. */
        fun snapAngle(raw: Float): Float {
            val nearest = (raw / 15f).roundToInt() * 15f
            return normalize(if (abs(nearest - raw) <= 2.5f) nearest else raw)
        }

        /** Angles are kept in [0, 180): a ruler looks the same turned half a turn. */
        fun normalize(deg: Float): Float {
            var a = deg % 180f
            if (a < 0) a += 180f
            return a
        }
    }
}

/** Board zoom limits. */
const val BOARD_MIN_ZOOM = 1f
const val BOARD_MAX_ZOOM = 4f

/**
 * Where to scroll so the point under the fingers stays under them after zooming by [factor].
 * [scroll] is the current scroll offset along one axis, [focus] the pinch centre in the viewport,
 * [pan] how far the fingers moved together this step.
 */
fun zoomScroll(scroll: Float, focus: Float, factor: Float, pan: Float = 0f): Float =
    ((scroll + focus) * factor - focus - pan).coerceAtLeast(0f)
