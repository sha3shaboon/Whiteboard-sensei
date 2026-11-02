package app.folio

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.graphics.toAwtImage
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performMouseInput
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
                    app.folio.data.InkStroke(0, app.folio.data.InkTool.HIGHLIGHTER, app.folio.ink.HighlighterColors[0], app.folio.ink.HIGHLIGHTER_WIDTH, listOf(0.17f, 0.335f, 1f, 0.84f, 0.335f, 1f)),
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
