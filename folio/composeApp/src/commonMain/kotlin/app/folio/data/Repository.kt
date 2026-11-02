package app.folio.data

import app.folio.data.sources.HttpException
import app.folio.data.sources.Mode
import app.folio.data.sources.PaperSource
import app.folio.data.sources.SourceRequest
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope

data class FeedPage(
    val papers: List<Paper>,
    /** Sources that failed on this page, e.g. "OpenAlex: rate limit reached, try later". */
    val problems: List<String>,
    val endReached: Boolean,
)

/**
 * A paged stream of papers merged from several sources. Each [loadMore] asks every source that
 * still has results for its next page, in parallel, and drops papers already shown.
 */
class Feed internal constructor(
    private val legs: List<Pair<PaperSource, SourceRequest>>,
    private val mode: Mode,
    private val remember: (List<Paper>) -> Unit,
) {
    private val tokens = HashMap<PaperSource, String?>()
    private val finished = HashSet<PaperSource>()
    private val seen = HashSet<String>()

    suspend fun loadMore(): FeedPage = coroutineScope {
        val active = legs.filter { it.first !in finished }
        val results = active.map { (source, request) ->
            async {
                source to try {
                    Result.success(source.fetch(request, tokens[source]))
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    Result.failure(e)
                }
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
            // Interleave so one fast-publishing source (usually arXiv) doesn't crowd out the others;
            // each source's own page is already newest-first.
            Mode.LATEST -> interleave(perSource.map { list -> list.sortedByDescending { it.published } })
            Mode.RELEVANCE -> interleave(perSource)
        }.filter { seen.add(it.dedupeKey()) }

        remember(merged)
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
        else -> "offline or unreachable"
    }
}

class PaperRepository(private val sources: List<PaperSource>) {
    private val cache = HashMap<String, Paper>()

    fun cached(id: String): Paper? = cache[id]

    private fun remember(papers: List<Paper>) {
        papers.forEach { cache[it.id] = it }
    }

    /** Newest papers across the given topics. */
    fun latest(topics: List<Topic>): Feed {
        val quoted = topics.joinToString(" OR ") { "\"${it.query}\"" }
        val arxiv = topics.joinToString(" OR ") { "(${it.arxivQuery()})" }
        val bio = topics.filter { it.biomedical }
        val legs = sources.mapNotNull { source ->
            when (source.source) {
                Source.ARXIV -> source to SourceRequest(quoted, Mode.LATEST, arxivQuery = arxiv)
                Source.EUROPE_PMC -> if (bio.isEmpty()) null
                else source to SourceRequest(bio.joinToString(" OR ") { "\"${it.query}\"" }, Mode.LATEST)
                Source.OPENALEX -> source to SourceRequest(quoted, Mode.LATEST)
            }
        }
        return Feed(legs, Mode.LATEST, ::remember)
    }

    /** Best matches for free text, optionally from one source only. */
    fun search(query: String, only: Source? = null, pageSize: Int = 15): Feed {
        val request = SourceRequest(query.trim(), Mode.RELEVANCE, pageSize = pageSize)
        val legs = sources.filter { only == null || it.source == only }.map { it to request }
        return Feed(legs, Mode.RELEVANCE, ::remember)
    }
}
