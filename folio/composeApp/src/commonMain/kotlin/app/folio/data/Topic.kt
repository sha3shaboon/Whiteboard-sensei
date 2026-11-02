package app.folio.data

import kotlinx.serialization.Serializable

/**
 * Something a reader follows. Presets carry an arXiv category expression; anything a reader types
 * becomes a [custom] topic searched by keyword everywhere.
 */
@Serializable
data class Topic(
    val id: String,
    val name: String,
    /** Keyword search sent to Europe PMC and OpenAlex (and arXiv when [arxiv] is null). */
    val query: String,
    val group: String = "Your own",
    /** arXiv category expression such as "cat:cs.LG OR cat:stat.ML". */
    val arxiv: String? = null,
    /** Worth asking Europe PMC (life sciences and medicine) about. */
    val biomedical: Boolean = false,
    val custom: Boolean = false,
) {
    /** arXiv search_query for the newest papers on this topic. */
    fun arxivQuery(): String = arxiv ?: phraseQuery(query)

    companion object {
        fun custom(text: String): Topic {
            val name = text.trim().replace(Regex("\\s+"), " ")
            return Topic(
                id = "custom:" + name.lowercase(),
                name = name.replaceFirstChar { it.uppercase() },
                query = name,
                custom = true,
                biomedical = true, // unknown field: let Europe PMC try too
            )
        }
    }
}

/** arXiv phrase search over all fields: all:"dark matter". */
internal fun phraseQuery(text: String): String {
    val words = text.trim().replace("\"", "").split(Regex("\\s+")).filter { it.isNotBlank() }
    return if (words.size == 1) "all:${words[0]}" else "all:\"${words.joinToString(" ")}\""
}

object Topics {
    val presets: List<Topic> = listOf(
        Topic("ml", "Machine Learning", "machine learning", "Computing", arxiv = "cat:cs.LG OR cat:stat.ML"),
        Topic("nlp", "Language Models", "large language models", "Computing", arxiv = "cat:cs.CL"),
        Topic("cv", "Computer Vision", "computer vision", "Computing", arxiv = "cat:cs.CV"),
        Topic("robotics", "Robotics", "robotics", "Computing", arxiv = "cat:cs.RO"),
        Topic("security", "Security & Privacy", "cybersecurity", "Computing", arxiv = "cat:cs.CR"),
        Topic("quantum", "Quantum Computing", "quantum computing", "Physics & space", arxiv = "cat:quant-ph"),
        Topic("astro", "Astrophysics", "astrophysics", "Physics & space", arxiv = "cat:astro-ph.GA OR cat:astro-ph.CO"),
        Topic("exoplanets", "Exoplanets", "exoplanets", "Physics & space", arxiv = "cat:astro-ph.EP"),
        Topic("condensed", "Condensed Matter", "condensed matter", "Physics & space", arxiv = "cat:cond-mat.str-el OR cat:cond-mat.supr-con"),
        Topic("hep", "Particle Physics", "particle physics", "Physics & space", arxiv = "cat:hep-ph OR cat:hep-ex"),
        Topic("math", "Pure Mathematics", "mathematics", "Mathematics", arxiv = "cat:math.NT OR cat:math.AG OR cat:math.CO"),
        Topic("stats", "Statistics", "statistical methods", "Mathematics", arxiv = "cat:stat.ME"),
        Topic("neuro", "Neuroscience", "neuroscience", "Life & health", arxiv = "cat:q-bio.NC", biomedical = true),
        Topic("genomics", "Genomics", "genomics", "Life & health", arxiv = "cat:q-bio.GN", biomedical = true),
        Topic("microbiome", "Microbiome", "microbiome", "Life & health", biomedical = true),
        Topic("immunology", "Immunology", "immunology", "Life & health", biomedical = true),
        Topic("cancer", "Cancer Research", "cancer", "Life & health", biomedical = true),
        Topic("publichealth", "Public Health", "public health", "Life & health", biomedical = true),
        Topic("climate", "Climate Science", "climate change", "Earth & energy", arxiv = "cat:physics.ao-ph"),
        Topic("energy", "Clean Energy", "renewable energy", "Earth & energy"),
        Topic("materials", "Materials Science", "materials science", "Earth & energy", arxiv = "cat:cond-mat.mtrl-sci"),
        Topic("econ", "Economics", "economics", "Society & mind", arxiv = "cat:econ.GN OR cat:econ.EM"),
        Topic("psych", "Psychology", "psychology", "Society & mind", biomedical = true),
    )

    val groups: List<String> = presets.map { it.group }.distinct()

    fun preset(id: String): Topic? = presets.firstOrNull { it.id == id }
}
