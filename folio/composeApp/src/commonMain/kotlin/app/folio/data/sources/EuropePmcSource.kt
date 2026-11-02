package app.folio.data.sources

import app.folio.data.Paper
import app.folio.data.Source
import io.ktor.client.HttpClient
import io.ktor.http.URLBuilder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.datetime.Clock
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.TimeZone
import kotlinx.datetime.minus
import kotlinx.datetime.todayIn
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/** Europe PMC: open-access life-science and biomedical literature, including preprints. */
class EuropePmcSource(private val http: HttpClient, private val json: Json) : PaperSource {
    override val source = Source.EUROPE_PMC

    override suspend fun fetch(request: SourceRequest, pageToken: String?): SourcePage {
        val today = Clock.System.todayIn(TimeZone.currentSystemDefault())
        val query = buildString {
            append("(").append(request.query).append(") AND OPEN_ACCESS:y AND HAS_ABSTRACT:y")
            if (request.mode == Mode.LATEST) append(" AND FIRST_PDATE:[${today.minus(60, DateTimeUnit.DAY)} TO $today]")
        }
        val url = URLBuilder("https://www.ebi.ac.uk/europepmc/webservices/rest/search").apply {
            parameters.append("query", query)
            parameters.append("format", "json")
            parameters.append("resultType", "core")
            parameters.append("pageSize", request.pageSize.toString())
            parameters.append("cursorMark", pageToken ?: "*")
            if (request.mode == Mode.LATEST) parameters.append("sort", "P_PDATE_D desc")
        }.buildString()

        val body = http.getText(url)
        return withContext(Dispatchers.Default) {
            val root = json.parseToJsonElement(body).jsonObject
            val papers = parseResults(root)
            val next = root.str("nextCursorMark")?.takeIf { it != pageToken && papers.isNotEmpty() }
            SourcePage(papers, next)
        }
    }

    internal fun parseResults(root: JsonObject): List<Paper> =
        root.obj("resultList")?.arr("result").orEmpty().mapNotNull { (it as? JsonObject)?.let(::toPaper) }

    private fun toPaper(r: JsonObject): Paper? {
        val id = r.str("id") ?: return null
        val src = r.str("source") ?: "MED"
        val title = r.str("title")?.let(::cleanText)?.trimEnd('.') ?: return null
        val pmcid = r.str("pmcid")
        val urls = r.obj("fullTextUrlList")?.arr("fullTextUrl").orEmpty().mapNotNull { it as? JsonObject }
        // Prefer the publisher's open-access PDF; Europe PMC's own renderer is the fallback.
        val pdf = urls.firstOrNull { it.str("documentStyle") == "pdf" && it.str("availabilityCode") in setOf("OA", "F") }?.str("url")
            ?: pmcid?.let { "https://europepmc.org/articles/$it?pdf=render" }
        val journal = r.obj("journalInfo")?.obj("journal")?.str("title")
            ?: r.obj("bookOrReportDetails")?.str("publisher")
            ?: if (src == "PPR") "Preprint" else null
        return Paper(
            id = "epmc:$src:$id",
            source = Source.EUROPE_PMC,
            title = title,
            authors = r.str("authorString")?.trimEnd('.')?.split(", ")?.filter { it.isNotBlank() }.orEmpty(),
            abstract = cleanText(r.str("abstractText").orEmpty()),
            published = r.str("firstPublicationDate") ?: r.str("pubYear").orEmpty(),
            venue = journal,
            doi = r.str("doi"),
            landingUrl = if (pmcid != null) "https://europepmc.org/article/PMC/$pmcid" else "https://europepmc.org/article/$src/$id",
            pdfUrl = pdf,
            tags = r.obj("keywordList")?.arr("keyword").orEmpty().mapNotNull { it.jsonPrimitive.contentOrNull }.take(6),
            citations = r["citedByCount"]?.jsonPrimitive?.intOrNull,
        )
    }
}
