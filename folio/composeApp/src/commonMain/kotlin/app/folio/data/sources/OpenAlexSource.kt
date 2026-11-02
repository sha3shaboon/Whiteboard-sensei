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
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * OpenAlex: an open index of works across every field. Requests without a key draw from a small
 * free budget shared per IP address; a free key (Settings) gives each reader their own.
 */
class OpenAlexSource(
    private val http: HttpClient,
    private val json: Json,
    private val apiKey: () -> String?,
) : PaperSource {
    override val source = Source.OPENALEX

    override suspend fun fetch(request: SourceRequest, pageToken: String?): SourcePage {
        val page = pageToken?.toIntOrNull() ?: 1
        val today = Clock.System.todayIn(TimeZone.currentSystemDefault())
        val filter = buildString {
            append("is_oa:true,has_abstract:true,type:article|preprint|review")
            if (request.mode == Mode.LATEST) append(",from_publication_date:${today.minus(60, DateTimeUnit.DAY)},to_publication_date:$today")
        }
        val url = URLBuilder("https://api.openalex.org/works").apply {
            parameters.append("search", request.query)
            parameters.append("filter", filter)
            parameters.append("sort", if (request.mode == Mode.LATEST) "publication_date:desc" else "relevance_score:desc")
            parameters.append("per-page", request.pageSize.toString())
            parameters.append("page", page.toString())
            parameters.append("select", SELECT)
            apiKey()?.takeIf { it.isNotBlank() }?.let { parameters.append("api_key", it.trim()) }
        }.buildString()

        val body = http.getText(url)
        val papers = withContext(Dispatchers.Default) { parse(body) }
        return SourcePage(papers, next = if (papers.size < request.pageSize) null else (page + 1).toString())
    }

    fun parse(body: String): List<Paper> =
        json.parseToJsonElement(body).jsonObject.arr("results").orEmpty().mapNotNull { (it as? JsonObject)?.let(::toPaper) }

    private fun toPaper(w: JsonObject): Paper? {
        val id = w.str("id")?.substringAfterLast('/') ?: return null
        val title = w.str("display_name")?.let(::cleanText)?.takeIf { it.isNotBlank() } ?: return null
        val primary = w.obj("primary_location")
        val bestOa = w.obj("best_oa_location")
        val doi = w.str("doi")?.removePrefix("https://doi.org/")
        val landing = primary?.str("landing_page_url")
            ?: w.obj("open_access")?.str("oa_url")
            ?: doi?.let { "https://doi.org/$it" }
            ?: "https://openalex.org/$id"
        return Paper(
            id = "openalex:$id",
            source = Source.OPENALEX,
            title = title,
            authors = w.arr("authorships").orEmpty().mapNotNull { it.asObj()?.obj("author")?.str("display_name") },
            abstract = w.obj("abstract_inverted_index")?.let(::rebuildAbstract).orEmpty(),
            published = w.str("publication_date").orEmpty(),
            venue = primary?.obj("source")?.str("display_name"),
            doi = doi,
            landingUrl = landing,
            pdfUrl = bestOa?.str("pdf_url") ?: primary?.str("pdf_url"),
            tags = listOfNotNull(
                w.obj("primary_topic")?.str("display_name"),
                w.obj("primary_topic")?.obj("field")?.str("display_name"),
            ),
            citations = w["cited_by_count"]?.jsonPrimitive?.intOrNull,
        )
    }

    /** OpenAlex ships abstracts as word -> positions; put the words back in order. */
    private fun rebuildAbstract(index: JsonObject): String {
        val words = HashMap<Int, String>()
        for ((word, positions) in index) {
            for (p in positions.jsonArray) p.jsonPrimitive.intOrNull?.let { words[it] = word }
        }
        return cleanText(words.keys.sorted().joinToString(" ") { words.getValue(it) })
    }

    companion object {
        const val SELECT =
            "id,doi,display_name,publication_date,authorships,primary_location,best_oa_location,open_access,cited_by_count,abstract_inverted_index,primary_topic"
    }
}
