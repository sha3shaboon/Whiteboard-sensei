package app.folio.data.sources

import app.folio.data.Paper
import app.folio.data.Source
import io.ktor.client.HttpClient
import io.ktor.http.URLBuilder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.datetime.Clock

/** arXiv's Atom API: preprints in physics, maths, CS, quantitative biology, stats and economics. */
class ArxivSource(private val http: HttpClient) : PaperSource {
    override val source = Source.ARXIV

    // arXiv asks clients to space requests out; queue ours at least this far apart.
    private val gate = Mutex()
    private var lastCall = 0L
    private val minGapMs = 1_200L

    override suspend fun fetch(request: SourceRequest, pageToken: String?): SourcePage {
        val start = pageToken?.toIntOrNull() ?: 0
        val searchQuery = when (request.mode) {
            Mode.LATEST -> request.arxivQuery ?: request.query
            Mode.RELEVANCE -> request.query.trim().split(Regex("\\s+")).joinToString(" AND ") { "all:${it.replace("\"", "")}" }
        }
        val url = URLBuilder("https://export.arxiv.org/api/query").apply {
            parameters.append("search_query", searchQuery)
            parameters.append("start", start.toString())
            parameters.append("max_results", request.pageSize.toString())
            parameters.append("sortBy", if (request.mode == Mode.LATEST) "submittedDate" else "relevance")
            parameters.append("sortOrder", "descending")
        }.buildString()

        val xml = gate.withLock {
            val wait = lastCall + minGapMs - Clock.System.now().toEpochMilliseconds()
            if (wait > 0) delay(wait)
            try {
                http.getText(url)
            } finally {
                lastCall = Clock.System.now().toEpochMilliseconds()
            }
        }
        val papers = withContext(Dispatchers.Default) { parse(xml) }
        return SourcePage(papers, next = if (papers.size < request.pageSize) null else (start + papers.size).toString())
    }

    companion object {
        private val entryRe = Regex("<entry>(.*?)</entry>", RegexOption.DOT_MATCHES_ALL)
        private fun tag(name: String) = Regex("<$name[^>]*>(.*?)</$name>", RegexOption.DOT_MATCHES_ALL)
        private val idRe = tag("id")
        private val titleRe = tag("title")
        private val summaryRe = tag("summary")
        private val publishedRe = tag("published")
        private val doiRe = tag("arxiv:doi")
        private val journalRe = tag("arxiv:journal_ref")
        private val nameRe = tag("name")
        private val categoryRe = Regex("<category[^>]*term=\"([^\"]+)\"")
        private val pdfRe = Regex("<link[^>]*title=\"pdf\"[^>]*href=\"([^\"]+)\"|<link[^>]*href=\"([^\"]+)\"[^>]*title=\"pdf\"")

        /** A small Atom reader: arXiv entries are flat and regular enough not to need an XML library. */
        fun parse(xml: String): List<Paper> = entryRe.findAll(xml).mapNotNull { m ->
            val e = m.groupValues[1]
            val rawId = idRe.find(e)?.groupValues?.get(1)?.trim() ?: return@mapNotNull null
            val arxivId = rawId.substringAfter("/abs/").replace(Regex("v\\d+$"), "")
            val title = titleRe.find(e)?.groupValues?.get(1)?.let(::cleanText).orEmpty()
            if (arxivId.isBlank() || title.isBlank()) return@mapNotNull null
            val pdf = pdfRe.find(e)?.let { it.groupValues[1].ifBlank { it.groupValues[2] } }
            Paper(
                id = "arxiv:$arxivId",
                source = Source.ARXIV,
                title = title,
                authors = nameRe.findAll(e).map { cleanText(it.groupValues[1]) }.toList(),
                abstract = summaryRe.find(e)?.groupValues?.get(1)?.let(::cleanText).orEmpty(),
                published = publishedRe.find(e)?.groupValues?.get(1)?.trim()?.take(10).orEmpty(),
                venue = journalRe.find(e)?.groupValues?.get(1)?.let(::cleanText) ?: "arXiv preprint",
                doi = doiRe.find(e)?.groupValues?.get(1)?.trim(),
                landingUrl = "https://arxiv.org/abs/$arxivId",
                pdfUrl = pdf ?: "https://arxiv.org/pdf/$arxivId",
                tags = categoryRe.findAll(e).map { it.groupValues[1] }.distinct().toList(),
            )
        }.toList()
    }
}
