package com.folio.papers.data

import kotlinx.serialization.Serializable

enum class Source(val label: String) {
    ARXIV("arXiv"),
    EUROPE_PMC("Europe PMC"),
    OPENALEX("OpenAlex"),
}

@Serializable
data class Paper(
    /** Stable id, prefixed by source: "arxiv:2610.40654", "epmc:MED:42831006", "openalex:W123". */
    val id: String,
    val source: Source,
    val title: String,
    val authors: List<String>,
    val abstract: String,
    /** ISO date, yyyy-MM-dd. */
    val published: String,
    val venue: String? = null,
    val doi: String? = null,
    val landingUrl: String,
    val pdfUrl: String? = null,
    val tags: List<String> = emptyList(),
    val citations: Int? = null,
)

@Serializable
data class SavedPaper(
    val paper: Paper,
    val savedAt: Long,
    val read: Boolean = false,
)

/** Key used to drop the same paper arriving from two sources. */
fun Paper.dedupeKey(): String =
    doi?.lowercase()?.removePrefix("https://doi.org/")
        ?: title.lowercase().filter { it.isLetterOrDigit() }.take(80)
