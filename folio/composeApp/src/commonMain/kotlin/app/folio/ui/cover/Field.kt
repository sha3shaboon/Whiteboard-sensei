package app.folio.ui.cover

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AutoGraph
import androidx.compose.material.icons.outlined.Biotech
import androidx.compose.material.icons.outlined.Calculate
import androidx.compose.material.icons.outlined.Diversity3
import androidx.compose.material.icons.outlined.Eco
import androidx.compose.material.icons.outlined.Hub
import androidx.compose.material.icons.outlined.Language
import androidx.compose.material.icons.outlined.MonitorHeart
import androidx.compose.material.icons.outlined.Psychology
import androidx.compose.material.icons.outlined.Public
import androidx.compose.material.icons.outlined.RocketLaunch
import androidx.compose.material.icons.outlined.Science
import androidx.compose.material.icons.outlined.Waves
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import app.folio.data.Paper
import app.folio.data.Topic

/** Background, ink (text) and accent colours for one cover. */
data class Palette(val background: Color, val ink: Color, val accent: Color, val soft: Color)

enum class Motif { NETWORK, WAVES, ORBITS, GEOMETRY, CELLS, PULSE, CONTOURS, LATTICE, BARS, BRANCHES, STRATA }

/**
 * Broad research areas. Each has its own look so a paper's subject reads at a glance from its
 * cover: colours, a generative motif and an icon.
 */
enum class Field(
    val label: String,
    val icon: ImageVector,
    val motif: Motif,
    val palettes: List<Palette>,
    private val arxivPrefixes: List<String>,
    private val keywords: List<String>,
) {
    AI(
        "AI & Computing", Icons.Outlined.Hub, Motif.NETWORK,
        listOf(
            Palette(Color(0xFF1D3557), Color(0xFFF7F4EC), Color(0xFF7FD3FF), Color(0xFF2C4A72)),
            Palette(Color(0xFFDDE8F5), Color(0xFF14243A), Color(0xFF2F6FDE), Color(0xFFC3D6EE)),
        ),
        listOf("cs.", "stat.ML", "eess."),
        listOf("neural", "learning", "language model", "llm", "transformer", "algorithm", "comput", "robot", "software",
            "network", "vision", "dataset", "security", "privacy", "agent", "artificial intelligence", "deep "),
    ),
    QUANTUM(
        "Physics", Icons.Outlined.Waves, Motif.WAVES,
        listOf(
            Palette(Color(0xFF2E1F55), Color(0xFFF6F1FF), Color(0xFFC8A8FF), Color(0xFF3E2C6E)),
            Palette(Color(0xFFEDE5FF), Color(0xFF261A47), Color(0xFF7448D6), Color(0xFFDCCEFB)),
        ),
        listOf("quant-ph", "hep-", "cond-mat", "physics.", "nucl-", "gr-qc", "nlin."),
        listOf("quantum", "particle", "qubit", "photon", "laser", "superconduct", "magnetic", "spin", "plasma",
            "optic", "boson", "physics", "entangle", "field theory"),
    ),
    SPACE(
        "Space", Icons.Outlined.RocketLaunch, Motif.ORBITS,
        listOf(
            Palette(Color(0xFF0F1B2D), Color(0xFFF8F3E6), Color(0xFFFFCF6B), Color(0xFF1E2F4A)),
            Palette(Color(0xFF1B1430), Color(0xFFF7EFFF), Color(0xFFFF9B71), Color(0xFF2B2148)),
        ),
        listOf("astro-ph"),
        listOf("galax", "star", "planet", "cosmo", "black hole", "telescope", "solar", "orbit", "mars", "asteroid",
            "supernova", "exoplanet", "universe", "dark matter", "gravitational"),
    ),
    MATH(
        "Mathematics", Icons.Outlined.Calculate, Motif.GEOMETRY,
        listOf(
            Palette(Color(0xFFF3EAD7), Color(0xFF1B1A17), Color(0xFFE4572E), Color(0xFFE6D9BD)),
            Palette(Color(0xFF22262B), Color(0xFFF4EFE4), Color(0xFFF2C14E), Color(0xFF30353B)),
        ),
        listOf("math.", "math-ph", "stat."),
        listOf("theorem", "proof", "algebra", "geometr", "topolog", "prime", "graph", "equation", "statistic",
            "probabilit", "conjecture", "manifold", "knot", "number theory"),
    ),
    LIFE(
        "Life sciences", Icons.Outlined.Biotech, Motif.CELLS,
        listOf(
            Palette(Color(0xFFDDEFD9), Color(0xFF15301E), Color(0xFF2F9A5A), Color(0xFFC5E4BF)),
            Palette(Color(0xFF16352A), Color(0xFFEFF8EE), Color(0xFF9BE3A7), Color(0xFF214838)),
        ),
        listOf("q-bio."),
        listOf("cell", "gene", "protein", "microb", "bacteri", "species", "evolution", "plant", "dna", "rna", "genom",
            "enzyme", "ecolog", "animal", "insect", "bird", "octopus", "virus", "biolog", "coral", "reef", "marine",
            "fish", "whale", "dolphin", "bee", "tardigrade", "fung", "sourdough", "ferment"),
    ),
    HEALTH(
        "Health & medicine", Icons.Outlined.MonitorHeart, Motif.PULSE,
        listOf(
            Palette(Color(0xFFFBE1DD), Color(0xFF3E1310), Color(0xFFE0453F), Color(0xFFF5CBC5)),
            Palette(Color(0xFF3A1416), Color(0xFFFFF0EE), Color(0xFFFF8C7F), Color(0xFF4E1D20)),
        ),
        listOf(),
        listOf("patient", "clinical", "disease", "cancer", "tumor", "therapy", "treatment", "hospital", "health",
            "infection", "drug", "vaccine", "diabet", "cardio", "surgery", "mortality", "medicine", "immun", "trial"),
    ),
    MIND(
        "Mind & brain", Icons.Outlined.Psychology, Motif.BRANCHES,
        listOf(
            Palette(Color(0xFFF1DDF6), Color(0xFF2E1238), Color(0xFFA24BC6), Color(0xFFE6C8EF)),
            Palette(Color(0xFF2A1733), Color(0xFFFBF0FF), Color(0xFFE2A6F5), Color(0xFF3A2245)),
        ),
        listOf("q-bio.NC"),
        listOf("brain", "neuro", "cognit", "memory", "sleep", "psych", "emotion", "behavio", "conscious", "dream",
            "mental", "depress", "anxiety", "perception", "attention", "learning in children"),
    ),
    EARTH(
        "Earth & climate", Icons.Outlined.Public, Motif.CONTOURS,
        listOf(
            Palette(Color(0xFFD4E9EF), Color(0xFF0E2E37), Color(0xFF1C7D92), Color(0xFFBCDCE5)),
            Palette(Color(0xFF123139), Color(0xFFEAF6F8), Color(0xFF7DD3E0), Color(0xFF1B414B)),
        ),
        listOf("physics.ao-ph", "physics.geo-ph"),
        listOf("climate", "ocean", "carbon", "earthquake", "volcan", "glacier", "weather", "atmospher", "soil",
            "forest", "rainfall", "drought", "sea level", "wildfire", "ecosystem"),
    ),
    MATTER(
        "Materials & energy", Icons.Outlined.Science, Motif.LATTICE,
        listOf(
            Palette(Color(0xFFFFEAB6), Color(0xFF2B2100), Color(0xFFD9901A), Color(0xFFF7DB98)),
            Palette(Color(0xFF2E2614), Color(0xFFFFF6DE), Color(0xFFFFC75A), Color(0xFF3E3420)),
        ),
        listOf("cond-mat.mtrl-sci", "physics.chem-ph", "physics.app-ph"),
        listOf("material", "battery", "catalys", "chemi", "polymer", "alloy", "crystal", "solar cell", "energy",
            "hydrogen", "semiconductor", "graphene", "molecul", "concrete", "silk"),
    ),
    SOCIETY(
        "Society & economics", Icons.Outlined.Diversity3, Motif.BARS,
        listOf(
            Palette(Color(0xFFEAE2D2), Color(0xFF2A221B), Color(0xFFC2552C), Color(0xFFDCD1BC)),
            Palette(Color(0xFF2C251F), Color(0xFFF7EFE5), Color(0xFFF0965F), Color(0xFF3B3129)),
        ),
        listOf("econ.", "q-fin.", "cs.CY", "physics.soc-ph"),
        listOf("econom", "market", "policy", "social", "politic", "education", "inequal", "labor", "price", "trade",
            "game theory", "survey", "household", "income", "urban", "happiness"),
    ),
    HUMANITIES(
        "History & culture", Icons.Outlined.Language, Motif.STRATA,
        listOf(
            Palette(Color(0xFFF2E3CF), Color(0xFF2D1F12), Color(0xFF9B5E2C), Color(0xFFE6D1B4)),
            Palette(Color(0xFF2B2017), Color(0xFFF8EEE2), Color(0xFFE0A86E), Color(0xFF3A2C20)),
        ),
        listOf(),
        listOf("ancient", "history", "archaeolog", "roman", "medieval", "language", "linguist", "culture", "art ",
            "music", "literature", "viking", "museum", "heritage"),
    ),
    GENERAL(
        "Research", Icons.Outlined.AutoGraph, Motif.GEOMETRY,
        listOf(
            Palette(Color(0xFFE9E7E1), Color(0xFF1E1E1E), Color(0xFF1F4B3F), Color(0xFFDAD7CF)),
            Palette(Color(0xFF26282A), Color(0xFFF2F0EA), Color(0xFF8FD1B8), Color(0xFF33363A)),
        ),
        listOf(),
        listOf(),
    ),
    ;

    fun palette(seed: Int): Palette = palettes[(seed ushr 3) % palettes.size]

    companion object {
        private val cache = HashMap<String, Field>()

        /** Best guess at a paper's field: arXiv categories first, then words in its title and keywords. */
        fun of(paper: Paper): Field = cache.getOrPut(paper.id) {
            val primaryCat = paper.tags.firstOrNull { it.contains('.') || it.contains('-') }
            if (primaryCat != null) {
                // The most specific prefix wins (q-bio.NC → Mind before q-bio. → Life).
                entries.flatMap { f -> f.arxivPrefixes.map { it to f } }
                    .filter { (prefix, _) -> primaryCat.startsWith(prefix) }
                    .maxByOrNull { it.first.length }
                    ?.let { return@getOrPut it.second }
            }
            ofText(paper.title + " " + paper.tags.joinToString(" ") + " " + (paper.venue ?: "") + " " + paper.abstract.take(300))
        }

        fun of(topic: Topic): Field = when (topic.id) {
            "ml", "nlp", "cv", "robotics", "security" -> AI
            "quantum", "condensed", "hep" -> QUANTUM
            "astro", "exoplanets" -> SPACE
            "math", "stats" -> MATH
            "genomics", "microbiome", "immunology" -> LIFE
            "cancer", "publichealth" -> HEALTH
            "neuro", "psych" -> MIND
            "climate" -> EARTH
            "energy", "materials" -> MATTER
            "econ" -> SOCIETY
            else -> ofText(topic.name + " " + topic.query)
        }

        fun ofText(text: String): Field {
            val t = " " + text.lowercase() + " "
            return entries.filter { it != GENERAL }
                .map { f -> f to f.keywords.count { t.contains(it) } }
                .filter { it.second > 0 }
                .maxByOrNull { it.second }?.first ?: GENERAL
        }
    }
}

/** Stable, well-mixed seed from a string so a paper always gets the same cover. */
fun seedOf(text: String): Int {
    var h = 0x811C9DC5.toInt()
    for (c in text) {
        h = h xor c.code
        h *= 0x01000193
    }
    return h and 0x7FFFFFFF
}
