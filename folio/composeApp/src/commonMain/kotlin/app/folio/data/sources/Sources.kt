package app.folio.data.sources

import app.folio.data.Paper
import app.folio.data.Source
import io.ktor.client.HttpClient
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.statement.bodyAsText
import io.ktor.http.URLBuilder
import io.ktor.http.isSuccess
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

/** One page of results plus the token that fetches the next page (null when exhausted). */
data class SourcePage(val papers: List<Paper>, val next: String?)

enum class Mode {
    /** Newest papers on a topic. */
    LATEST,

    /** Best matches for a free-text search. */
    RELEVANCE,
}

/**
 * What to look for. [query] is free text (search or topic keywords, OR-ed); [arxivQuery] is the
 * arXiv search_query used when present.
 */
data class SourceRequest(
    val query: String,
    val mode: Mode,
    val arxivQuery: String? = null,
    val pageSize: Int = 15,
)

interface PaperSource {
    val source: Source
    suspend fun fetch(request: SourceRequest, pageToken: String?): SourcePage
}

class HttpException(val code: Int, message: String) : Exception(message)

internal suspend fun HttpClient.getText(url: String): String {
    val response = get(url) { header("User-Agent", "Folio/0.2 (open papers reader)") }
    if (!response.status.isSuccess()) {
        throw HttpException(response.status.value, "HTTP ${response.status.value} from ${URLBuilder(url).host}")
    }
    return response.bodyAsText()
}

/** Only things shaped like HTML tags, so text such as "p < 0.05" survives. */
private val tagRegex = Regex("</?[a-zA-Z][a-zA-Z0-9]*(\\s[^<>]*)?/?>")
private val latexCommand = Regex("""\\(emph|textit|textbf|mathrm|mathbf|texttt|mathcal)\{([^}]*)\}""")
private val whitespace = Regex("\\s+")

/** Removes HTML tags, entities and the most common inline LaTeX so text reads cleanly. */
internal fun cleanText(raw: String): String = raw
    // Decode escaped tags first: some titles arrive as "&lt;i&gt;Acropora&lt;/i&gt;".
    .replace("&lt;", "<").replace("&gt;", ">")
    .replace(tagRegex, "")
    .replace(latexCommand, "$2")
    .replace("&amp;", "&").replace("&quot;", "\"").replace("&#39;", "'").replace("&apos;", "'").replace("&nbsp;", " ")
    .replace(whitespace, " ")
    .trim()

internal fun JsonObject.obj(key: String): JsonObject? = this[key] as? JsonObject
internal fun JsonObject.arr(key: String): JsonArray? = this[key] as? JsonArray
internal fun JsonObject.str(key: String): String? = (this[key] as? JsonPrimitive)?.contentOrNull
internal fun JsonElement?.asObj(): JsonObject? = this as? JsonObject
