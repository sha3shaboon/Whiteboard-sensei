package com.folio.papers.data.sources

import android.util.Xml
import com.folio.papers.data.Paper
import com.folio.papers.data.Source
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import org.xmlpull.v1.XmlPullParser
import java.io.StringReader

/** arXiv's Atom API: preprints in physics, maths, CS, quantitative biology, stats and economics. */
class ArxivSource(private val http: OkHttpClient) : PaperSource {
    override val source = Source.ARXIV

    override fun covers(request: SourceRequest) =
        request.mode == Mode.RELEVANCE || request.arxivQuery != null

    override suspend fun fetch(request: SourceRequest, pageToken: String?): SourcePage {
        val start = pageToken?.toIntOrNull() ?: 0
        val searchQuery = when {
            request.mode == Mode.LATEST && request.arxivQuery != null -> request.arxivQuery
            else -> request.query.trim().split(Regex("\\s+")).joinToString(" AND ") { "all:$it" }
        }
        val url = "https://export.arxiv.org/api/query".toHttpUrl().newBuilder()
            .addQueryParameter("search_query", searchQuery)
            .addQueryParameter("start", start.toString())
            .addQueryParameter("max_results", request.pageSize.toString())
            .addQueryParameter("sortBy", if (request.mode == Mode.LATEST) "submittedDate" else "relevance")
            .addQueryParameter("sortOrder", "descending")
            .build()
        val papers = parse(http.getString(url.toString()))
        return SourcePage(papers, next = if (papers.size < request.pageSize) null else (start + papers.size).toString())
    }

    internal fun parse(xml: String, parser: XmlPullParser = Xml.newPullParser()): List<Paper> {
        parser.setFeature(XmlPullParser.FEATURE_PROCESS_NAMESPACES, true)
        parser.setInput(StringReader(xml))

        val out = mutableListOf<Paper>()
        var inEntry = false
        var inAuthor = false
        var id = ""; var title = ""; var summary = ""; var published = ""; var doi: String? = null
        var journal: String? = null; var pdf: String? = null; var landing = ""
        val authors = mutableListOf<String>(); val tags = mutableListOf<String>()

        while (parser.next() != XmlPullParser.END_DOCUMENT) {
            when (parser.eventType) {
                XmlPullParser.START_TAG -> when {
                    parser.name == "entry" -> {
                        inEntry = true
                        id = ""; title = ""; summary = ""; published = ""; doi = null; journal = null; pdf = null; landing = ""
                        authors.clear(); tags.clear()
                    }
                    !inEntry -> Unit
                    parser.name == "author" -> inAuthor = true
                    parser.name == "name" && inAuthor -> authors += parser.nextText().trim()
                    parser.name == "id" -> id = parser.nextText().trim()
                    parser.name == "title" -> title = parser.nextText()
                    parser.name == "summary" -> summary = parser.nextText()
                    parser.name == "published" -> published = parser.nextText().take(10)
                    parser.name == "doi" -> doi = parser.nextText().trim()
                    parser.name == "journal_ref" -> journal = parser.nextText().trim()
                    parser.name == "category" -> parser.getAttributeValue(null, "term")?.let { tags += it }
                    parser.name == "link" -> {
                        val href = parser.getAttributeValue(null, "href")
                        when {
                            parser.getAttributeValue(null, "title") == "pdf" -> pdf = href
                            parser.getAttributeValue(null, "rel") == "alternate" -> landing = href
                        }
                    }
                }
                XmlPullParser.END_TAG -> when (parser.name) {
                    "author" -> inAuthor = false
                    "entry" -> {
                        inEntry = false
                        val arxivId = id.substringAfter("/abs/").substringBeforeLast('v')
                        if (arxivId.isNotBlank() && title.isNotBlank()) {
                            out += Paper(
                                id = "arxiv:$arxivId",
                                source = Source.ARXIV,
                                title = cleanText(title),
                                authors = authors.toList(),
                                abstract = cleanText(summary),
                                published = published,
                                venue = journal ?: "arXiv preprint",
                                doi = doi,
                                landingUrl = landing.ifBlank { "https://arxiv.org/abs/$arxivId" },
                                pdfUrl = pdf,
                                tags = tags.distinct(),
                            )
                        }
                    }
                }
            }
        }
        return out
    }
}
