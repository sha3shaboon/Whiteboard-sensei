package app.folio

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.graphics.toAwtImage
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.onRoot
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
        graph.downloads.start(paper)
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
