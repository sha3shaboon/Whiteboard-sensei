package app.folio

import app.folio.data.Paper
import app.folio.data.sources.ArxivSource
import app.folio.data.sources.EuropePmcSource
import app.folio.data.sources.HttpException
import app.folio.data.sources.Mode
import app.folio.data.sources.OpenAlexSource
import app.folio.data.sources.SourceRequest
import io.ktor.client.HttpClient
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import org.junit.Assume.assumeTrue
import kotlin.test.Test
import kotlin.test.assertTrue

/** Hits the real APIs, so it only runs when asked: ./gradlew desktopTest -Dlive=true */
class LiveSourcesTest {
    private val http = HttpClient { install(io.ktor.client.plugins.HttpTimeout) { socketTimeoutMillis = 30_000; requestTimeoutMillis = 90_000 } }
    private val json = Json { ignoreUnknownKeys = true }
    private val live = System.getProperty("live") == "true"

    private fun check(label: String, papers: List<Paper>) {
        println("── $label: ${papers.size} papers")
        papers.take(3).forEach { println("   ${it.published}  ${it.title.take(70)}  | ${it.authors.size} authors | pdf=${it.pdfUrl != null} | abstract=${it.abstract.length} | tags=${it.tags.take(2)}") }
        assertTrue(papers.isNotEmpty(), "$label returned nothing")
        assertTrue(papers.all { it.title.isNotBlank() }, "$label: missing titles")
        assertTrue(papers.count { it.abstract.length > 100 } >= papers.size / 2, "$label: most abstracts empty")
    }

    @Test
    fun arxiv() = runBlocking {
        assumeTrue(live)
        val source = ArxivSource(http)
        check("arXiv latest (categories + custom phrase)", source.fetch(SourceRequest("", Mode.LATEST, arxivQuery = "(cat:quant-ph) OR (all:\"octopus\")"), null).papers)
        check("arXiv search", source.fetch(SourceRequest("sparse autoencoders", Mode.RELEVANCE), null).papers)
    }

    @Test
    fun europePmc() = runBlocking {
        assumeTrue(live)
        val source = EuropePmcSource(http, json)
        val page = source.fetch(SourceRequest("\"microbiome\" OR \"immunology\"", Mode.LATEST), null)
        check("Europe PMC latest", page.papers)
        val second = source.fetch(SourceRequest("\"microbiome\" OR \"immunology\"", Mode.LATEST), page.next)
        check("Europe PMC page 2", second.papers)
        assertTrue(second.papers.none { p -> page.papers.any { it.id == p.id } }, "page 2 repeats page 1")
    }

    @Test
    fun openAlex() = runBlocking {
        assumeTrue(live)
        val source = OpenAlexSource(http, json, apiKey = { System.getProperty("openalexKey") })
        try {
            check("OpenAlex search", source.fetch(SourceRequest("graph neural networks", Mode.RELEVANCE), null).papers)
        } catch (e: HttpException) {
            // Without a key OpenAlex rate-limits per IP (429) and sometimes pauses anonymous search (503).
            assumeTrue("OpenAlex unavailable without a key (${e.code})", e.code != 429 && e.code != 503)
            throw e
        }
    }
}
