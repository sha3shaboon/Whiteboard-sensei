package com.folio.papers.data

import com.folio.papers.data.sources.HttpException
import com.folio.papers.data.sources.Mode
import com.folio.papers.data.sources.PaperSource
import com.folio.papers.data.sources.SourceRequest
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import java.io.IOException
import java.util.concurrent.ConcurrentHashMap

data class FeedPage(
    val papers: List<Paper>,
    /** Sources that failed on this page, with a short reason, e.g. "OpenAlex: daily limit reached". */
    val problems: List<String>,
    val endReached: Boolean,
)

/**
 * A paged stream of papers merged from several sources. Each call to [loadMore] asks every
 * source that still has results for its next page, in parallel, and drops papers already shown.
 */
class Feed internal constructor(
    private val legs: List<Pair<PaperSource, SourceRequest>>,
    private val mode: Mode,
    private val cache: MutableMap<String, Paper>,
) {
    private val tokens = HashMap<PaperSource, String?>()
    private val finished = HashSet<PaperSource>()
    private val seen = HashSet<String>()

    suspend fun loadMore(): FeedPage = coroutineScope {
        val active = legs.filter { it.first !in finished }
        val results = active.map { (source, request) ->
            async {
                source to runCatching { source.fetch(request, tokens[source]) }
            }
        }.awaitAll()

        val problems = mutableListOf<String>()
        val perSource = mutableListOf<List<Paper>>()
        for ((source, result) in results) {
            result.fold(
                onSuccess = { page ->
                    tokens[source] = page.next
                    if (page.next == null) finished += source
                    perSource += page.papers
                },
                onFailure = { error ->
                    // A failing source is retried on the next page unless it is out of budget.
                    if (error is HttpException && error.code == 429) finished += source
                    problems += "${source.source.label}: ${describe(error)}"
                },
            )
        }

        val merged = when (mode) {
            Mode.LATEST -> perSource.flatten().sortedByDescending { it.published }
            Mode.RELEVANCE -> interleave(perSource)
        }.filter { seen.add(it.dedupeKey()) }

        merged.forEach { cache[it.id] = it }
        FeedPage(merged, problems, endReached = finished.size == legs.size)
    }

    private fun interleave(lists: List<List<Paper>>): List<Paper> {
        val out = mutableListOf<Paper>()
        val max = lists.maxOfOrNull { it.size } ?: 0
        for (i in 0 until max) for (list in lists) list.getOrNull(i)?.let(out::add)
        return out
    }

    private fun describe(error: Throwable): String = when {
        error is HttpException && error.code == 429 -> "rate limit reached, try later"
        error is HttpException && error.code == 503 -> "busy right now, try again shortly"
        error is HttpException -> "server error ${error.code}"
        error is IOException -> "offline or unreachable"
        else -> "couldn't read results"
    }
}

class PaperRepository(private val sources: List<PaperSource>) {
    private val cache = ConcurrentHashMap<String, Paper>()

    fun cached(id: String): Paper? = cache[id]

    /** Newest papers across the given topics. */
    fun latest(topics: List<Topic>): Feed {
        val quoted = topics.joinToString(" OR ") { "\"${it.query}\"" }
        val arxiv = topics.mapNotNull { it.arxiv }.takeIf { it.isNotEmpty() }?.joinToString(" OR ") { "($it)" }
        val bio = topics.filter { it.biomedical }
        val legs = sources.mapNotNull { source ->
            val request = when (source.source) {
                Source.ARXIV -> SourceRequest(quoted, Mode.LATEST, arxivQuery = arxiv)
                Source.EUROPE_PMC -> SourceRequest(
                    bio.joinToString(" OR ") { "\"${it.query}\"" }, Mode.LATEST, biomedical = bio.isNotEmpty(),
                )
                Source.OPENALEX -> SourceRequest(quoted, Mode.LATEST)
            }
            (source to request).takeIf { source.covers(request) }
        }
        return Feed(legs, Mode.LATEST, cache)
    }

    /** Best matches for free text across every source. */
    fun search(query: String): Feed {
        val request = SourceRequest(query.trim(), Mode.RELEVANCE)
        return Feed(sources.filter { it.covers(request) }.map { it to request }, Mode.RELEVANCE, cache)
    }
}
