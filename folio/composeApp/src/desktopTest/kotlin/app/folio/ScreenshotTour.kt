package app.folio

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.graphics.toAwtImage
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performMouseInput
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.click
import androidx.compose.ui.test.runDesktopComposeUiTest
import androidx.compose.ui.unit.Density
import app.folio.data.ThemeMode
import app.folio.data.Topic
import app.folio.data.Topics
import app.folio.ui.Screen
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import okio.Path.Companion.toPath
import org.junit.Assume.assumeTrue
import org.junit.FixMethodOrder
import org.junit.runners.MethodSorters
import java.io.File
import java.nio.file.Files
import javax.imageio.ImageIO
import kotlin.test.Test

/**
 * Drives the real app against the live APIs and saves screenshots of each screen at phone and
 * desktop sizes: ./gradlew desktopTest -Dlive=true -DshotsDir=/some/folder
 */
@OptIn(ExperimentalTestApi::class)
@FixMethodOrder(MethodSorters.NAME_ASCENDING)
class ScreenshotTour {
    private val out = System.getProperty("shotsDir")?.let(::File)

    companion object {
        /** Height of the reader's top bar plus the whiteboard bar, in dp, at the tour's phone size. */
        const val TOUR_BOARD_TOP_DP = 112f

        /** The paper downloaded in c_, reused by the ink tests. */
        var readPaperId: String? = null
        private val dataDir = Files.createTempDirectory("folio-tour").toString().toPath()
        private val graph by lazy {
            AppGraph(DesktopPlatform(dataDir), CoroutineScope(SupervisorJob() + Dispatchers.Default)).apply {
                store.setInterests(
                    listOfNotNull(Topics.preset("quantum"), Topics.preset("ml"), Topics.preset("neuro"), Topics.preset("microbiome")) +
                        Topic.custom("Coral reefs"),
                )
            }
        }
    }

    private fun shot(name: String, widthDp: Int, heightDp: Int, scale: Float = 2f, start: Screen? = null, ready: () -> Boolean = { true }, settle: Long = 1500) {
        assumeTrue(out != null && System.getProperty("live") == "true")
        out!!.mkdirs()
        runDesktopComposeUiTest((widthDp * scale).toInt(), (heightDp * scale).toInt()) {
            setContent {
                CompositionLocalProvider(LocalDensity provides Density(scale)) { App(graph, start) }
            }
            runCatching { waitUntil(timeoutMillis = 90_000) { ready() } }
            // Keep frames flowing while background work (page renders, images) lands.
            repeat((settle / 250).toInt().coerceAtLeast(1)) {
                Thread.sleep(250)
                mainClock.advanceTimeBy(250)
                waitForIdle()
            }
            val image = onRoot().captureToImage().toAwtImage()
            ImageIO.write(image, "png", File(out, "$name.png"))
            println("saved $name.png")
        }
    }

    private fun homeReady() = graph.home.feed.state.value.let { it.papers.size >= 12 || (it.started && !it.loading && it.problems.isNotEmpty()) } &&
        graph.home.curiosity.value.let { !it.loading || it.picks.size >= 6 }

    @Test fun a_desktopHome() = shot("desktop-home", 1360, 860, scale = 1.5f, ready = ::homeReady)

    @Test fun b_phoneHome() {
        shot("phone-home", 400, 860, ready = ::homeReady)
        shot("phone-home-full", 400, 2600, scale = 1f, ready = ::homeReady)
    }

    @Test fun c_phonePaper() {
        val paper = graph.home.feed.state.value.papers.firstOrNull { it.pdfUrl?.contains("arxiv") == true } ?: return
        graph.store.save(paper)
        graph.downloads.fetch(paper, keep = true)
        readPaperId = paper.id
        shot("phone-paper", 400, 860, start = Screen.PaperDetail(paper.id), ready = { graph.store.entry(paper.id)?.downloaded == true }, settle = 800)
        shot("desktop-paper", 1360, 860, scale = 1.5f, start = Screen.PaperDetail(paper.id))
        renderFirstPage(paper.id)
        shot("phone-reader", 400, 860, start = Screen.Reader(paper.id), settle = 8000)
        shot("desktop-reader", 1360, 860, scale = 1.5f, start = Screen.Reader(paper.id), settle = 8000)
    }

    /** Renders page 1 of the downloaded PDF straight through the platform, outside the UI. */
    private fun renderFirstPage(id: String) = kotlinx.coroutines.runBlocking {
        val doc = graph.platform.openPdf(graph.downloads.fileFor(id)) ?: error("PDF didn't open")
        println("pdf pages=${doc.pageCount} ratio=${doc.aspectRatio(0)}")
        ImageIO.write(doc.render(0, 900).toAwtImage(), "png", File(out, "pdf-page1.png"))
        doc.close()
    }

    /** Writes on the page with injected pointer input, then checks the strokes were saved. */
    @Test fun ca_ink() {
        val id = readPaperId ?: return
        assumeTrue(out != null && System.getProperty("live") == "true")
        // A handwritten-looking note with pen pressure, as a Surface Pen would leave it.
        val wave = buildList {
            for (i in 0..60) {
                val t = i / 60f
                addAll(listOf(0.12f + t * 0.42f, 0.385f + 0.012f * kotlin.math.sin(t * 25f), 0.3f + 0.7f * kotlin.math.sin(t * 3.1f).coerceAtLeast(0f)))
            }
        }
        graph.notes.save(
            id,
            app.folio.data.PaperNotes(
                listOf(
                    app.folio.data.InkStroke(0, app.folio.data.InkTool.HIGHLIGHTER, app.folio.ink.HighlighterColors[0], 0.02f, listOf(0.17f, 0.335f, 1f, 0.84f, 0.335f, 1f)),
                    app.folio.data.InkStroke(0, app.folio.data.InkTool.PEN, app.folio.ink.PenColors[2], 0.0042f, wave),
                ),
                text = "Key idea: the recipient is chosen *after* the shares go out.\n\nQ: how does this compare to quantum secret sharing of states?",
            ),
        )
        Thread.sleep(300)
        graph.ink.touchDraws = true
        graph.ink.tool = app.folio.ink.Tool.PEN
        graph.ink.penColor = app.folio.ink.PenColors[1]
        runDesktopComposeUiTest(800, 1720) {
            setContent { CompositionLocalProvider(LocalDensity provides Density(2f)) { App(graph, Screen.Reader(id)) } }
            repeat(24) { Thread.sleep(250); mainClock.advanceTimeBy(250); waitForIdle() }
            // Circle something on page 1 with the "mouse".
            onRoot().performMouseInput {
                val cx = 560f; val cy = 900f
                moveTo(androidx.compose.ui.geometry.Offset(cx + 120f, cy)); press()
                for (i in 1..40) {
                    val a = i / 40f * 6.6f
                    moveTo(androidx.compose.ui.geometry.Offset(cx + 120f * kotlin.math.cos(a), cy + 45f * kotlin.math.sin(a)))
                }
                release()
            }
            repeat(8) { Thread.sleep(250); mainClock.advanceTimeBy(250); waitForIdle() }
        }
        Thread.sleep(1200)
        val saved = graph.notes.load(id)
        println("ink strokes saved: ${saved.strokes.size} (expected 3)")
        kotlin.test.assertEquals(3, saved.strokes.size, "the mouse stroke should be saved with the seeded ones")
        graph.ink.touchDraws = false
        shot("phone-reader-ink", 400, 860, start = Screen.Reader(id), settle = 6000)
        shot("phone-reader-notes", 400, 860, start = Screen.Reader(id, notesOpen = true), settle = 6000)
        shot("desktop-reader-ink", 1360, 860, scale = 1.5f, start = Screen.Reader(id, notesOpen = true), settle = 6000)
        shot("phone-paper-notes", 400, 860, start = Screen.PaperDetail(id), settle = 800)
    }

    /** Whiteboard beside the paper: write on it, check it lands on the board, and capture the layouts. */
    @Test fun cb_board() {
        val id = readPaperId ?: return
        assumeTrue(out != null && System.getProperty("live") == "true")
        val before = graph.notes.load(id)
        // A worked example on the board: axes, a curve, and a boxed result, drawn like a pen would.
        fun line(x0: Float, y0: Float, x1: Float, y1: Float, n: Int = 20) = buildList {
            for (i in 0..n) { val t = i / n.toFloat(); addAll(listOf(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 0.6f + 0.3f * kotlin.math.sin(t * 3f))) }
        }
        val curve = buildList {
            for (i in 0..60) { val t = i / 60f; val x = 0.12f + t * 0.7f; addAll(listOf(x, 0.62f - 0.42f * (t - 0.5f) * (t - 0.5f) * 4f * 0.5f - 0.05f * t, 0.4f + 0.6f * t)) }
        }
        val ink = app.folio.data.InkTool.PEN
        val black = app.folio.ink.PenColors[0]
        val blue = app.folio.ink.PenColors[1]
        val board = listOf(
            app.folio.data.InkStroke(0, ink, black, 0.003f, line(0.1f, 0.7f, 0.9f, 0.7f), board = true),
            app.folio.data.InkStroke(0, ink, black, 0.003f, line(0.12f, 0.72f, 0.12f, 0.12f), board = true),
            app.folio.data.InkStroke(0, ink, blue, 0.005f, curve, board = true),
            app.folio.data.InkStroke(0, app.folio.data.InkTool.HIGHLIGHTER, app.folio.ink.HighlighterColors[1], 0.03f, listOf(0.2f, 0.85f, 1f, 0.75f, 0.85f, 1f), board = true, pressure = 0f),
        )
        graph.notes.save(id, before.copy(strokes = before.strokes + board, boardStyle = app.folio.data.BoardStyle.GRID, boardSheets = 2))
        Thread.sleep(300)

        // Write on the board (bottom half in portrait split) with the "mouse".
        graph.ink.touchDraws = true
        graph.ink.tool = app.folio.ink.Tool.PEN
        graph.ink.penColor = app.folio.ink.PenColors[2]
        runDesktopComposeUiTest(800, 1720) {
            setContent { CompositionLocalProvider(LocalDensity provides Density(2f)) { App(graph, Screen.Reader(id, board = app.folio.ui.reader.BoardMode.SPLIT)) } }
            repeat(16) { Thread.sleep(250); mainClock.advanceTimeBy(250); waitForIdle() }
            onRoot().performMouseInput {
                moveTo(androidx.compose.ui.geometry.Offset(200f, 1400f)); press()
                for (i in 1..30) moveTo(androidx.compose.ui.geometry.Offset(200f + i * 12f, 1400f + 40f * kotlin.math.sin(i / 4f)))
                release()
            }
            repeat(8) { Thread.sleep(250); mainClock.advanceTimeBy(250); waitForIdle() }
        }
        Thread.sleep(1200)
        val saved = graph.notes.load(id)
        val boardCount = saved.strokes.count { it.board }
        println("board strokes saved: $boardCount (expected ${board.size + 1}), paper strokes: ${saved.strokes.count { !it.board }}")
        kotlin.test.assertEquals(board.size + 1, boardCount, "the drawn stroke should land on the whiteboard")
        kotlin.test.assertEquals(before.strokes.count { !it.board }, saved.strokes.count { !it.board }, "the paper's ink is untouched")
        graph.ink.touchDraws = false

        shot("phone-board-split", 400, 860, start = Screen.Reader(id, board = app.folio.ui.reader.BoardMode.SPLIT), settle = 5000)
        shot("phone-board-full", 400, 860, start = Screen.Reader(id, board = app.folio.ui.reader.BoardMode.FULL), settle = 2000)
        shot("desktop-board-split", 1360, 860, scale = 1.5f, start = Screen.Reader(id, board = app.folio.ui.reader.BoardMode.SPLIT), settle = 5000)

        // Ruler: draw a wobbly line starting just above its top edge; it must save as a straight line.
        graph.ink.touchDraws = true
        graph.ink.penColor = app.folio.ink.PenColors[1]
        val beforeRuler = graph.notes.load(id).strokes.size
        runDesktopComposeUiTest(800, 1720) {
            setContent { CompositionLocalProvider(LocalDensity provides Density(2f)) { App(graph, Screen.Reader(id, board = app.folio.ui.reader.BoardMode.FULL)) } }
            repeat(8) { Thread.sleep(250); mainClock.advanceTimeBy(250); waitForIdle() }
            onNodeWithContentDescription("Show ruler").performClick()
            repeat(4) { Thread.sleep(150); mainClock.advanceTimeBy(150); waitForIdle() }
            // Board viewport starts under the two bars; the ruler sits at 40% of it, 76dp thick.
            onRoot().performMouseInput {
                val y0 = 2f * (TOUR_BOARD_TOP_DP + 0.4f * (860f - TOUR_BOARD_TOP_DP) - 38f - 8f)
                moveTo(androidx.compose.ui.geometry.Offset(160f, y0)); press()
                for (i in 1..40) moveTo(androidx.compose.ui.geometry.Offset(160f + i * 12f, y0 + 14f * kotlin.math.sin(i / 3f)))
                release()
            }
            repeat(8) { Thread.sleep(250); mainClock.advanceTimeBy(250); waitForIdle() }
        }
        Thread.sleep(1200)
        val afterRuler = graph.notes.load(id).strokes
        kotlin.test.assertEquals(beforeRuler + 1, afterRuler.size, "the ruler stroke is saved")
        val ys = afterRuler.last().points.filterIndexed { i, _ -> i % 3 == 1 }
        println("ruler stroke: ${ys.size} points, y spread ${ys.max() - ys.min()} (page widths)")
        kotlin.test.assertTrue(ys.max() - ys.min() < 0.001f, "a wobbly stroke along the ruler must come out straight")
        graph.ink.touchDraws = false

        // Pinch with two fingers to zoom, then tap the ruler's angle badge to turn it to 45°.
        runDesktopComposeUiTest(800, 1720) {
            setContent { CompositionLocalProvider(LocalDensity provides Density(2f)) { App(graph, Screen.Reader(id, board = app.folio.ui.reader.BoardMode.FULL)) } }
            repeat(8) { Thread.sleep(250); mainClock.advanceTimeBy(250); waitForIdle() }
            onNodeWithContentDescription("Show ruler").performClick()
            repeat(2) { Thread.sleep(150); mainClock.advanceTimeBy(150); waitForIdle() }
            val cy = 2f * (TOUR_BOARD_TOP_DP + 0.62f * (860f - TOUR_BOARD_TOP_DP))
            onRoot().performTouchInput {
                down(0, androidx.compose.ui.geometry.Offset(330f, cy)); down(1, androidx.compose.ui.geometry.Offset(470f, cy))
                for (i in 1..12) {
                    moveTo(0, androidx.compose.ui.geometry.Offset(330f - i * 10f, cy - i * 4f)); moveTo(1, androidx.compose.ui.geometry.Offset(470f + i * 10f, cy + i * 4f))
                }
                up(0); up(1)
            }
            repeat(4) { Thread.sleep(150); mainClock.advanceTimeBy(150); waitForIdle() }
            onRoot().performMouseInput { click(androidx.compose.ui.geometry.Offset(400f, 2f * (TOUR_BOARD_TOP_DP + 0.4f * (860f - TOUR_BOARD_TOP_DP)))) }
            repeat(6) { Thread.sleep(200); mainClock.advanceTimeBy(200); waitForIdle() }
            ImageIO.write(onRoot().captureToImage().toAwtImage(), "png", File(out, "phone-board-ruler-zoom.png"))
            println("saved phone-board-ruler-zoom.png")
        }
        shot("desktop-board-full", 1360, 860, scale = 1.5f, start = Screen.Reader(id, board = app.folio.ui.reader.BoardMode.FULL), settle = 1500)

        // The pen settings panel, opened through its real button.
        graph.ink.penSize = 0.0075f
        runDesktopComposeUiTest(800, 1720) {
            setContent { CompositionLocalProvider(LocalDensity provides Density(2f)) { App(graph, Screen.Reader(id)) } }
            repeat(16) { Thread.sleep(250); mainClock.advanceTimeBy(250); waitForIdle() }
            onNodeWithContentDescription("Pen settings: colour, thickness, pressure").performClick()
            repeat(4) { Thread.sleep(250); mainClock.advanceTimeBy(250); waitForIdle() }
            ImageIO.write(onRoot().captureToImage().toAwtImage(), "png", File(out, "phone-pen-settings.png"))
            println("saved phone-pen-settings.png")
        }
        graph.ink.penSize = 0.0042f
    }

    @Test fun d_library() {
        graph.home.feed.state.value.papers.drop(1).take(5).forEach { graph.store.save(it) }
        graph.home.curiosity.value.picks.take(2).forEach { graph.store.save(it.paper) }
        shot("phone-library", 400, 860, start = Screen.Library())
        shot("desktop-library", 1360, 860, scale = 1.5f, start = Screen.Library())
    }

    @Test fun e_interests() = shot("phone-interests", 400, 860, start = Screen.Interests)

    @Test fun f_search() {
        graph.search.submit("octopus")
        shot("phone-search", 400, 860, start = Screen.Search, ready = { graph.search.feed.state.value.let { !it.loading && it.papers.isNotEmpty() } })
    }

    @Test fun g_topic() {
        val topic = Topic.custom("Coral reefs")
        graph.topicFeed(topic)
        shot("phone-topic", 400, 860, start = Screen.TopicFeed(topic), ready = { graph.topicFeed(topic).state.value.let { !it.loading } })
    }

    @Test fun h_dark() {
        graph.store.setTheme(ThemeMode.DARK)
        shot("phone-home-dark", 400, 860, ready = ::homeReady)
        shot("desktop-home-dark", 1360, 860, scale = 1.5f, ready = ::homeReady)
        graph.store.setTheme(ThemeMode.LIGHT)
    }

    @Test fun i_onboarding() {
        val fresh = AppGraph(DesktopPlatform(Files.createTempDirectory("folio-new").toString().toPath()), CoroutineScope(SupervisorJob() + Dispatchers.Default))
        fresh.store.follow(Topics.preset("astro")!!)
        fresh.store.follow(Topic.custom("Sourdough microbes"))
        assumeTrue(out != null && System.getProperty("live") == "true")
        runDesktopComposeUiTest(800, 1720) {
            setContent { CompositionLocalProvider(LocalDensity provides Density(2f)) { App(fresh) } }
            waitForIdle()
            ImageIO.write(onRoot().captureToImage().toAwtImage(), "png", File(out, "phone-onboarding.png"))
        }
    }
}
