package com.folio.papers.data.sources

import com.folio.papers.data.Paper
import com.folio.papers.data.Source
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import java.time.LocalDate

/** Europe PMC: open-access life-science and biomedical literature, including preprints. */
class EuropePmcSource(private val http: OkHttpClient, private val json: Json) : PaperSource {
    override val source = Source.EUROPE_PMC

    override fun covers(request: SourceRequest) = request.mode == Mode.RELEVANCE || request.biomedical

    override suspend fun fetch(request: SourceRequest, pageToken: String?): SourcePage {
        val today = LocalDate.now()
        val query = buildString {
            append("(").append(request.query).append(") AND OPEN_ACCESS:y AND HAS_ABSTRACT:y")
            if (request.mode == Mode.LATEST) append(" AND FIRST_PDATE:[${today.minusDays(60)} TO $today]")
        }
        val url = "https://www.ebi.ac.uk/europepmc/webservices/rest/search".toHttpUrl().newBuilder()
            .addQueryParameter("query", query)
            .addQueryParameter("format", "json")
            .addQueryParameter("resultType", "core")
            .addQueryParameter("pageSize", request.pageSize.toString())
            .addQueryParameter("cursorMark", pageToken ?: "*")
            .apply { if (request.mode == Mode.LATEST) addQueryParameter("sort", "P_PDATE_D desc") }
            .build()

        val root = json.parseToJsonElement(http.getString(url.toString())).jsonObject
        val results = root.obj("resultList")?.arr("result").orEmpty()
        val papers = results.mapNotNull { (it as? JsonObject)?.let(::toPaper) }
        val next = root.str("nextCursorMark")?.takeIf { it != pageToken && papers.isNotEmpty() }
        return SourcePage(papers, next)
    }

    private fun toPaper(r: JsonObject): Paper? {
        val id = r.str("id") ?: return null
        val src = r.str("source") ?: "MED"
        val title = r.str("title")?.let(::cleanText)?.trimEnd('.') ?: return null
        val pmcid = r.str("pmcid")
        val urls = r.obj("fullTextUrlList")?.arr("fullTextUrl").orEmpty().mapNotNull { it as? JsonObject }
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

internal fun JsonObject.obj(key: String): JsonObject? = this[key] as? JsonObject
internal fun JsonObject.arr(key: String): JsonArray? = this[key] as? JsonArray
internal fun JsonObject.str(key: String): String? = (this[key] as? kotlinx.serialization.json.JsonPrimitive)?.contentOrNull
internal fun JsonElement?.asObj(): JsonObject? = this as? JsonObject
