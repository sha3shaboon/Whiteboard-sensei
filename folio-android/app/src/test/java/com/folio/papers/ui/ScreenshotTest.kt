package com.folio.papers.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.Paparazzi
import com.android.resources.NightMode
import com.folio.papers.data.Paper
import com.folio.papers.data.Source
import com.folio.papers.data.Topics
import com.folio.papers.ui.components.FeedUiState
import com.folio.papers.ui.detail.PaperDetailContent
import com.folio.papers.ui.discover.DiscoverContent
import com.folio.papers.ui.theme.FolioTheme
import com.folio.papers.ui.topics.TopicsContent
import org.junit.Rule
import org.junit.Test
import java.time.LocalDate

/** Renders the main screens with sample papers: ./gradlew recordPaparazziDebug */
class ScreenshotTest {
    @get:Rule
    val paparazzi = Paparazzi(deviceConfig = DeviceConfig.PIXEL_6.copy(nightMode = NightMode.NIGHT, softButtons = false))

    // Paper dates are relative to now so their labels ("Today", "2 days ago") stay stable; the
    // header date is pinned so the screenshots don't change from day to day.
    private val today = LocalDate.now()
    private val headerDate = LocalDate.of(2026, 11, 2)
    private val papers = listOf(
        Paper(
            id = "arxiv:1", source = Source.ARXIV,
            title = "Reconstructing hidden observables via quantum snapshot thermometry",
            authors = listOf("A. Okafor", "L. Brandt", "M. Ishikawa", "R. Sato", "P. Novak"),
            abstract = "We show that the temperature of a many-body quantum system can be inferred from randomized single-qubit snapshots alone, and use the same estimator to recover observables that are never measured directly.",
            published = today.toString(), venue = "arXiv preprint", landingUrl = "https://arxiv.org", pdfUrl = "https://arxiv.org/pdf/1",
            tags = listOf("quant-ph", "cond-mat.stat-mech"),
        ),
        Paper(
            id = "epmc:2", source = Source.EUROPE_PMC,
            title = "The immune–microbe–metal triad: a vicious cycle driving biomaterial corrosion",
            authors = listOf("Chen Y", "Alvarez R", "Moreau T", "Haddad S"),
            abstract = "Implant failure is often attributed to mechanical wear, yet growing evidence points to a feedback loop between host immunity, colonising microbes and metal ion release that accelerates corrosion in vivo.",
            published = today.minusDays(2).toString(), venue = "Bioactive Materials", landingUrl = "https://europepmc.org",
            pdfUrl = "https://europepmc.org/pdf", citations = 4,
        ),
        Paper(
            id = "openalex:3", source = Source.OPENALEX,
            title = "Sparse autoencoders find interpretable features in protein language models",
            authors = listOf("J. Lindqvist", "S. Mehta"),
            abstract = "Applying dictionary learning to the residual stream of a protein language model yields thousands of features aligned with secondary structure, binding sites and evolutionary families.",
            published = today.minusDays(4).toString(), venue = "Nature Methods", landingUrl = "https://openalex.org", citations = 31,
        ),
    )

    @Composable
    private fun Frame(content: @Composable () -> Unit) = FolioTheme(dark = true) {
        Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) { content() }
    }

    @Test
    fun discover() = paparazzi.snapshot {
        Frame {
            DiscoverContent(
                state = FeedUiState(papers = papers, started = true),
                topics = listOf("quantum", "ml", "microbiome", "neuro").mapNotNull(Topics::get),
                selected = null,
                savedIds = setOf("epmc:2"),
                onSelect = {}, onRefresh = {}, onLoadMore = {}, onOpen = {}, onToggleSave = {}, onEditTopics = {},
                contentPadding = PaddingValues(top = 24.dp),
                today = headerDate,
            )
        }
    }

    @Test
    fun discoverLoading() = paparazzi.snapshot {
        Frame {
            DiscoverContent(
                state = FeedUiState(loading = true, started = true),
                topics = listOf("quantum", "ml").mapNotNull(Topics::get), selected = "ml", savedIds = emptySet(),
                onSelect = {}, onRefresh = {}, onLoadMore = {}, onOpen = {}, onToggleSave = {}, onEditTopics = {},
                contentPadding = PaddingValues(top = 24.dp), today = headerDate,
            )
        }
    }

    @Test
    fun detail() = paparazzi.snapshot {
        Frame {
            PaperDetailContent(
                paper = papers[1], loaded = true, saved = true, read = false,
                onBack = {}, onShare = {}, onToggleSave = {}, onToggleRead = {}, onOpenPdf = {}, onOpenPage = {}, onSearch = {},
            )
        }
    }

    @Test
    fun onboarding() = paparazzi.snapshot {
        Frame {
            TopicsContent(picked = setOf("ml", "quantum", "neuro"), firstRun = true, onToggle = {}, onConfirm = {}, onBack = {})
        }
    }
}
