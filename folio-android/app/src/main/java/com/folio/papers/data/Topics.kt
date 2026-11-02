package com.folio.papers.data

/**
 * A topic a reader can follow. [arxiv] is an arXiv category query (null when arXiv does not
 * cover the field); [query] is the keyword search sent to Europe PMC and OpenAlex.
 */
data class Topic(
    val id: String,
    val name: String,
    val field: String,
    val query: String,
    val arxiv: String? = null,
    val biomedical: Boolean = false,
)

object Topics {
    val all: List<Topic> = listOf(
        Topic("ml", "Machine Learning", "Computing", "machine learning", arxiv = "cat:cs.LG OR cat:stat.ML"),
        Topic("nlp", "Language Models", "Computing", "large language models", arxiv = "cat:cs.CL"),
        Topic("cv", "Computer Vision", "Computing", "computer vision", arxiv = "cat:cs.CV"),
        Topic("robotics", "Robotics", "Computing", "robotics", arxiv = "cat:cs.RO"),
        Topic("security", "Security & Privacy", "Computing", "cybersecurity", arxiv = "cat:cs.CR"),
        Topic("quantum", "Quantum Computing", "Physics", "quantum computing", arxiv = "cat:quant-ph"),
        Topic("astro", "Astrophysics", "Physics", "astrophysics", arxiv = "cat:astro-ph.GA OR cat:astro-ph.CO"),
        Topic("exoplanets", "Exoplanets", "Physics", "exoplanets", arxiv = "cat:astro-ph.EP"),
        Topic("condensed", "Condensed Matter", "Physics", "condensed matter", arxiv = "cat:cond-mat.str-el OR cat:cond-mat.supr-con"),
        Topic("hep", "Particle Physics", "Physics", "particle physics", arxiv = "cat:hep-ph OR cat:hep-ex"),
        Topic("math", "Pure Mathematics", "Mathematics", "mathematics", arxiv = "cat:math.NT OR cat:math.AG OR cat:math.CO"),
        Topic("stats", "Statistics", "Mathematics", "statistical methods", arxiv = "cat:stat.ME"),
        Topic("neuro", "Neuroscience", "Life sciences", "neuroscience", arxiv = "cat:q-bio.NC", biomedical = true),
        Topic("genomics", "Genomics", "Life sciences", "genomics", arxiv = "cat:q-bio.GN", biomedical = true),
        Topic("microbiome", "Microbiome", "Life sciences", "microbiome", biomedical = true),
        Topic("immunology", "Immunology", "Life sciences", "immunology", biomedical = true),
        Topic("cancer", "Cancer Research", "Medicine", "cancer", biomedical = true),
        Topic("publichealth", "Public Health", "Medicine", "public health", biomedical = true),
        Topic("climate", "Climate Science", "Earth & environment", "climate change", arxiv = "cat:physics.ao-ph"),
        Topic("energy", "Clean Energy", "Earth & environment", "renewable energy"),
        Topic("materials", "Materials Science", "Engineering", "materials science", arxiv = "cat:cond-mat.mtrl-sci"),
        Topic("econ", "Economics", "Social sciences", "economics", arxiv = "cat:econ.GN OR cat:econ.EM"),
        Topic("psych", "Psychology", "Social sciences", "psychology", biomedical = true),
    )

    private val byId = all.associateBy { it.id }

    fun get(id: String): Topic? = byId[id]

    val fields: List<String> = all.map { it.field }.distinct()
}
