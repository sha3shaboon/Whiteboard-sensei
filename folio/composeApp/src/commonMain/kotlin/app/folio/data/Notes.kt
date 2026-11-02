package app.folio.data

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okio.FileSystem
import okio.Path

@Serializable
enum class InkTool { PEN, HIGHLIGHTER }

/**
 * One stroke on one page. Points are flattened (x, y, pressure) triples with x and y divided by
 * the page width, so strokes stay in place at any zoom or screen size. [width] is in the same units.
 */
@Serializable
data class InkStroke(
    val page: Int,
    val tool: InkTool,
    val color: Long,
    val width: Float,
    val points: List<Float>,
)

@Serializable
data class PaperNotes(
    val strokes: List<InkStroke> = emptyList(),
    val text: String = "",
    val updatedAt: Long = 0,
) {
    val isEmpty: Boolean get() = strokes.isEmpty() && text.isBlank()
}

/** Handwriting and typed notes, one small JSON file per paper. */
class NotesStore(
    private val fs: FileSystem,
    dataDir: Path,
    private val json: Json,
    private val scope: CoroutineScope,
) {
    private val dir = dataDir / "notes"
    private val lock = Mutex()

    /** Ids of papers that have notes, for badges in the library. */
    private val _annotated = MutableStateFlow<Set<String>>(emptySet())
    val annotated: StateFlow<Set<String>> = _annotated.asStateFlow()

    init {
        fs.createDirectories(dir)
        _annotated.value = runCatching {
            fs.list(dir).filter { it.name.endsWith(".json") }.mapNotNull { path ->
                runCatching { json.decodeFromString(StoredNotes.serializer(), fs.read(path) { readUtf8() }).id }.getOrNull()
            }.toSet()
        }.getOrDefault(emptySet())
    }

    private fun file(id: String) = dir / (id.replace(Regex("[^A-Za-z0-9._-]"), "_") + ".json")

    fun load(id: String): PaperNotes = runCatching {
        val path = file(id)
        if (!fs.exists(path)) PaperNotes() else json.decodeFromString(StoredNotes.serializer(), fs.read(path) { readUtf8() }).notes
    }.getOrDefault(PaperNotes())

    fun save(id: String, notes: PaperNotes) {
        _annotated.update { if (notes.isEmpty) it - id else it + id }
        scope.launch(Dispatchers.Default) {
            lock.withLock {
                val path = file(id)
                if (notes.isEmpty) {
                    runCatching { fs.delete(path) }
                } else {
                    val tmp = dir / (path.name + ".tmp")
                    fs.write(tmp) { writeUtf8(json.encodeToString(StoredNotes.serializer(), StoredNotes(id, notes))) }
                    fs.atomicMove(tmp, path)
                }
            }
        }
    }

    @Serializable
    private data class StoredNotes(val id: String, val notes: PaperNotes)
}
