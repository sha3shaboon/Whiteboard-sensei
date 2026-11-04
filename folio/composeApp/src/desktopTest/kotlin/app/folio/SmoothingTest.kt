package app.folio

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toAwtImage
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.runDesktopComposeUiTest
import app.folio.data.InkTool
import app.folio.ink.drawStroke
import app.folio.ink.smoothLine
import java.io.File
import javax.imageio.ImageIO
import kotlin.math.hypot
import kotlin.math.sin
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class SmoothingTest {
    private val w = 1000f

    /** Sparse, whole-pixel samples of a curve, like a fast stroke through Java's mouse events. */
    private fun jaggedWave(): List<Float> = buildList {
        for (i in 0..18) {
            val x = (100 + i * 45).toFloat()
            val y = (300 + 120 * sin(i / 3f)).toInt().toFloat() // whole pixels
            addAll(listOf(x / w, y / w, 0.3f + 0.6f * (i % 5) / 4f))
        }
    }

    @Test
    fun theTipNeverLags() {
        val raw = jaggedWave()
        val line = smoothLine(raw, w)
        assertEquals(raw[raw.size - 3] * w, line[line.size - 3], 0.001f, "last x is exactly the pen's")
        assertEquals(raw[raw.size - 2] * w, line[line.size - 2], 0.001f, "last y is exactly the pen's")
        assertEquals(raw[0] * w, line[0], 0.001f)
    }

    @Test
    fun gapsAreFilledDensely() {
        val line = smoothLine(jaggedWave(), w)
        var worst = 0f
        var i = 3
        while (i + 1 < line.size) { worst = maxOf(worst, hypot(line[i] - line[i - 3], line[i + 1] - line[i - 2])); i += 3 }
        assertTrue(worst < 4.5f, "45px gaps become steps of at most ~3px, not $worst")
    }

    @Test
    fun straightLinesStayStraight() {
        val raw = buildList { for (i in 0..10) addAll(listOf((100f + i * 30) / w, 200f / w, 1f)) }
        val line = smoothLine(raw, w)
        val ys = line.filterIndexed { i, _ -> i % 3 == 1 }
        assertTrue(ys.all { kotlin.math.abs(it - 200f) < 0.01f })
    }

    /** Renders a few strokes to an image for a visual check: ./gradlew desktopTest -DshotsDir=... */
    @OptIn(ExperimentalTestApi::class)
    @Test
    fun renderSample() {
        val out = System.getProperty("shotsDir")?.let(::File) ?: return
        out.mkdirs()
        val wave = jaggedWave()
        val hand = buildList {
            // A quick handwritten loop with whole-pixel jitter and changing pressure.
            for (i in 0..60) {
                val t = i / 60f * 6.6f
                val x = (520 + 160 * t / 6.6f * 2 + 40 * kotlin.math.cos(t * 2)).toInt().toFloat()
                val y = (560 + 60 * sin(t * 2)).toInt().toFloat()
                addAll(listOf(x / w, y / w, 0.25f + 0.75f * sin(t / 6.6f * 3.1f).coerceAtLeast(0f)))
            }
        }
        runDesktopComposeUiTest(1000, 760) {
            setContent {
                Canvas(Modifier.fillMaxSize().background(Color.White)) {
                    drawStroke(InkTool.PEN, 0xFF1B1B1F, 0.006f, wave, 1f)
                    drawStroke(InkTool.PEN, 0xFF2457D6, 0.0042f, hand, 0.8f)
                    drawStroke(InkTool.PEN, 0xFFD93A2B, 0.003f, wave.mapIndexed { i, v -> if (i % 3 == 1) v + 0.25f else if (i % 3 == 2) 1f else v }, 0f)
                }
            }
            waitForIdle()
            ImageIO.write(onRoot().captureToImage().toAwtImage(), "png", File(out, "smooth-strokes.png"))
        }
    }
}
