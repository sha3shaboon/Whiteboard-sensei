package app.folio

import androidx.compose.ui.geometry.Offset
import app.folio.ink.RulerState
import app.folio.ink.zoomScroll
import kotlin.math.abs
import kotlin.math.sqrt
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class RulerTest {
    private fun ruler(angle: Float = 0f) = RulerState().apply {
        visible = true; center = Offset(500f, 400f); length = 1000f; thickness = 80f; turnTo(angle)
    }

    @Test
    fun strokeNearTheTopEdgeBecomesStraightAlongIt() {
        val r = ruler()
        val snap = assertNotNull(r.snapperFor(Offset(300f, 352f), snapDistance = 20f), "8px above the top edge should snap")
        // A wobbly hand-drawn line ends up exactly on the edge (y = 400 - 40).
        listOf(Offset(300f, 352f), Offset(400f, 345f), Offset(500f, 358f), Offset(650f, 349f)).forEach {
            val p = snap(it)
            assertEquals(360f, p.y, 0.01f)
            assertEquals(it.x, p.x, 0.01f, "movement along the ruler is kept")
        }
    }

    @Test
    fun picksTheNearerEdgeAndIgnoresFarStrokes() {
        val r = ruler()
        assertEquals(440f, r.snapperFor(Offset(200f, 450f), 20f)!!(Offset(250f, 470f)).y, 0.01f)
        assertNull(r.snapperFor(Offset(200f, 300f), 20f), "60px away: draw freely")
        assertNull(r.snapperFor(Offset(1200f, 360f), 20f), "beyond the ends: draw freely")
        r.visible = false
        assertNull(r.snapperFor(Offset(300f, 352f), 20f), "hidden ruler never snaps")
    }

    @Test
    fun rotatedRulerProjectsAlongItsAngle() {
        val r = ruler(45f)
        val start = r.center + r.normal * (-45f) // just outside the top edge
        val snap = assertNotNull(r.snapperFor(start, 20f))
        val far = snap(start + r.direction * 200f + Offset(7f, -3f))
        // On the edge: its distance across the ruler is exactly half the thickness.
        assertEquals(-40f, r.local(far).y, 0.01f)
        // And the line from the first point is at 45°.
        val a = snap(start)
        val d = far - a
        assertEquals(1f, abs(d.x / d.y), 0.001f)
        assertTrue(sqrt(d.x * d.x + d.y * d.y) > 150f)
    }

    @Test
    fun anglesSnapToFifteenDegreesAndWrap() {
        assertEquals(45f, RulerState.snapAngle(46.8f))
        assertEquals(50f, RulerState.snapAngle(50f))
        assertEquals(0f, RulerState.snapAngle(178.5f), "close to 180 is 0: a ruler is symmetric")
        val r = ruler()
        r.cycleAngle(); assertEquals(45f, r.angle)
        r.cycleAngle(); assertEquals(90f, r.angle)
        r.cycleAngle(); r.cycleAngle(); assertEquals(0f, r.angle)
    }

    @Test
    fun hitTesting() {
        val r = ruler(90f) // vertical now
        assertTrue(r.hitsBody(Offset(500f, 100f)))
        assertTrue(r.hitsBody(Offset(530f, 700f)))
        assertTrue(!r.hitsBody(Offset(600f, 400f)))
        assertTrue(r.hitsLabel(Offset(500f, 410f), 48f))
    }

    @Test
    fun zoomKeepsThePointUnderTheFingers() {
        // Content point under the fingers: scroll + focus. After zooming 2x it must still be under them.
        val scroll = 120f; val focus = 300f
        val after = zoomScroll(scroll, focus, 2f)
        assertEquals((scroll + focus) * 2f, after + focus, 0.01f)
        // Moving the fingers together pans by the same amount.
        assertEquals(after - 25f, zoomScroll(scroll, focus, 2f, pan = 25f), 0.01f)
        assertEquals(0f, zoomScroll(2f, 300f, 0.5f), "never scrolls before the start")
    }
}
