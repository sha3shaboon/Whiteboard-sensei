package com.folio.papers.data.sources

import com.folio.papers.data.Paper
import com.folio.papers.data.Source
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import okhttp3.Call
import okhttp3.Callback
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import java.io.IOException
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/** One page of results plus the token that fetches the next page (null when exhausted). */
data class SourcePage(val papers: List<Paper>, val next: String?)

enum class Mode {
    /** Newest papers on a topic. */
    LATEST,

    /** Best matches for a free-text search. */
    RELEVANCE,
}

interface PaperSource {
    val source: Source

    /** Whether this source has anything useful for the given request. */
    fun covers(request: SourceRequest): Boolean = true

    suspend fun fetch(request: SourceRequest, pageToken: String?): SourcePage
}

/**
 * What to look for. [query] is free text (search or topic keywords); [arxivQuery] is an arXiv
 * category expression used only by the arXiv source when present.
 */
data class SourceRequest(
    val query: String,
    val mode: Mode,
    val arxivQuery: String? = null,
    val biomedical: Boolean = false,
    val pageSize: Int = 15,
)

class HttpException(val code: Int, message: String) : IOException(message)

internal suspend fun OkHttpClient.getString(url: String): String = withContext(Dispatchers.IO) {
    val request = Request.Builder()
        .url(url)
        .header("User-Agent", "Folio/0.1 (Android paper reader)")
        .build()
    val call = newCall(request)
    suspendCancellableCoroutine { cont ->
        cont.invokeOnCancellation { call.cancel() }
        call.enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                if (cont.isActive) cont.resumeWithException(e)
            }

            override fun onResponse(call: Call, response: Response) {
                response.use {
                    if (!it.isSuccessful) {
                        cont.resumeWithException(HttpException(it.code, "HTTP ${it.code} from ${request.url.host}"))
                    } else {
                        cont.resume(it.body?.string().orEmpty())
                    }
                }
            }
        })
    }
}

private val tagRegex = Regex("<[^>]+>")
private val latexCommand = Regex("""\\(emph|textit|textbf|mathrm|mathbf|texttt)\{([^}]*)\}""")
private val whitespace = Regex("\\s+")

/** Removes HTML tags and the most common inline LaTeX so abstracts read cleanly. */
internal fun cleanText(raw: String): String = raw
    .replace(tagRegex, " ")
    .replace(latexCommand, "$2")
    .replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&#39;", "'")
    .replace(whitespace, " ")
    .trim()
