package app.folio.data

import kotlin.random.Random

/**
 * Off-the-beaten-path subjects for the curiosity shelf: things a reader didn't ask for but
 * might enjoy. A few are picked each day (and on every shuffle), skipping the reader's interests.
 */
object Curiosity {
    val pool: List<String> = listOf(
        "octopus intelligence", "tardigrades", "honeybee waggle dance", "bird magnetoreception",
        "crow tool use", "dolphin communication", "deep sea hydrothermal vents", "slime mold computation",
        "lucid dreaming", "music and the brain", "placebo effect", "why we laugh", "curiosity neuroscience",
        "ancient DNA", "Roman concrete", "Viking navigation", "Stonehenge", "Pompeii",
        "origin of life", "fermentation", "coffee", "chocolate flavor chemistry", "sourdough microbes",
        "black hole images", "fast radio bursts", "Mars habitability", "Europa ocean", "interstellar objects",
        "volcanic lightning", "rogue waves", "ball lightning", "glacier earthquakes",
        "game theory", "chess engines", "origami engineering", "knot theory", "prime numbers",
        "spider silk", "self-healing materials", "invisibility cloaks", "room-temperature superconductivity",
        "language evolution", "whistled languages", "happiness economics", "sleep and memory", "jet lag",
    )

    fun pick(exclude: Collection<Topic>, seed: Int, count: Int = 5): List<String> {
        val taken = exclude.map { it.query.lowercase() }.toSet()
        return pool.filter { it.lowercase() !in taken }.shuffled(Random(seed)).take(count)
    }
}
