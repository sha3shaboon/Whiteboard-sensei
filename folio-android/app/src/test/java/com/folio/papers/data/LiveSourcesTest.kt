package com.folio.papers.data

import com.folio.papers.data.sources.ArxivSource
import com.folio.papers.data.sources.EuropePmcSource
import com.folio.papers.data.sources.HttpException
import com.folio.papers.data.sources.Mode
import com.folio.papers.data.sources.OpenAlexSource
import com.folio.papers.data.sources.SourceRequest
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import okhttp3.Request
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.kxml2.io.KXmlParser
import org.junit.Assert.assertTrue

/**
 * Hits the real APIs, so it only runs when asked: ./gradlew test -Dlive=true
 * Checks that each source still parses into usable papers.
 */
class LiveSourcesTest {
    private val http = OkHttpClient()
    private val json = Json { ignoreUnknownKeys = true }
    private val live = System.getProperty("live") == "true"

    private fun check(label: String, papers: List<Paper>) {
        println("── $label: ${papers.size} papers")
        papers.take(3).forEach { println("   ${it.published}  ${it.title.take(70)}  | ${it.authors.size} authors | pdf=${it.pdfUrl != null} | abstract=${it.abstract.length}") }
        assertTrue("$label returned nothing", papers.isNotEmpty())
        assertTrue("$label: missing titles", papers.all { it.title.isNotBlank() })
        assertTrue("$label: most abstracts empty", papers.count { it.abstract.length > 100 } >= papers.size / 2)
    }

    @Test
    fun arxivLatestAndSearch() = runBlocking {
        assumeTrue(live)
        val source = ArxivSource(http)
        val xml = http.newCall(
            Request.Builder().url("https://export.arxiv.org/api/query?search_query=cat:quant-ph&sortBy=submittedDate&sortOrder=descending&max_results=10").build(),
        ).execute().body!!.string()
        check("arXiv latest quant-ph", source.parse(xml, KXmlParser()))
    }

    @Test
    fun europePmcLatest() = runBlocking {
        assumeTrue(live)
        val source = EuropePmcSource(http, json)
        val page = source.fetch(SourceRequest("\"microbiome\" OR \"immunology\"", Mode.LATEST, biomedical = true), null)
        check("Europe PMC latest", page.papers)
        assertTrue("no cursor", page.next != null)
        val second = source.fetch(SourceRequest("\"microbiome\" OR \"immunology\"", Mode.LATEST, biomedical = true), page.next)
        check("Europe PMC page 2", second.papers)
        assertTrue("page 2 repeats page 1", second.papers.none { p -> page.papers.any { it.id == p.id } })
    }

    @Test
    fun openAlexSearch() = runBlocking {
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

    /** Filter-only request (no full-text search) so the parser can be checked when search is throttled. */
    @Test
    fun openAlexParser() = runBlocking {
        assumeTrue(live)
        val source = OpenAlexSource(http, json, apiKey = { null })
        val body = http.newCall(
            Request.Builder().url(
                "https://api.openalex.org/works?filter=is_oa:true,has_abstract:true,from_publication_date:2026-09-01,primary_topic.field.id:17" +
                    "&sort=cited_by_count:desc&per-page=10&select=id,doi,display_name,publication_date,authorships,primary_location,best_oa_location,open_access,cited_by_count,abstract_inverted_index,primary_topic",
            ).build(),
        ).execute().body!!.string()
        check("OpenAlex parser (computer science, filter only)", source.parse(body))
    }
}
