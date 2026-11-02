package app.folio.data

import kotlinx.serialization.Serializable

@Serializable
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
    /** ISO date, yyyy-MM-dd (sometimes only yyyy). */
    val published: String,
    val venue: String? = null,
    val doi: String? = null,
    val landingUrl: String,
    val pdfUrl: String? = null,
    /** Source categories / keywords, e.g. arXiv "quant-ph". */
    val tags: List<String> = emptyList(),
    val citations: Int? = null,
) {
    val year: String get() = published.take(4)
}

@Serializable
data class SavedPaper(
    val paper: Paper,
    val savedAt: Long,
    val read: Boolean = false,
    /** True once the PDF is stored on the device. */
    val downloaded: Boolean = false,
    val lastPage: Int = 0,
)

/** Key used to drop the same paper arriving from two sources. */
fun Paper.dedupeKey(): String =
    doi?.lowercase()?.removePrefix("https://doi.org/")
        ?: title.lowercase().filter { it.isLetterOrDigit() }.take(80)
