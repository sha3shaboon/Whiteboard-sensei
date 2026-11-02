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
import kotlinx.datetime.Clock
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import okio.FileSystem
import okio.Path

@Serializable
enum class ThemeMode { SYSTEM, LIGHT, DARK }

@Serializable
data class Settings(
    val onboarded: Boolean = false,
    val interests: List<Topic> = emptyList(),
    val openAlexKey: String = "",
    val theme: ThemeMode = ThemeMode.SYSTEM,
)

/**
 * The reader's state on this device, kept as two small JSON files in the app's data folder:
 * settings (interests, key, theme) and the library of saved papers.
 */
class Store(
    private val fs: FileSystem,
    private val dir: Path,
    private val json: Json,
    private val scope: CoroutineScope,
) {
    private val settingsFile = dir / "settings.json"
    private val libraryFile = dir / "library.json"
    private val librarySerializer = ListSerializer(SavedPaper.serializer())
    private val writeLock = Mutex()

    private val _settings = MutableStateFlow(read(settingsFile, Settings.serializer()) ?: Settings())
    val settings: StateFlow<Settings> = _settings.asStateFlow()

    private val _library = MutableStateFlow(read(libraryFile, librarySerializer).orEmpty())
    val library: StateFlow<List<SavedPaper>> = _library.asStateFlow()

    init {
        fs.createDirectories(dir)
    }

    private fun <T> read(path: Path, serializer: kotlinx.serialization.KSerializer<T>): T? = runCatching {
        if (!fs.exists(path)) null else json.decodeFromString(serializer, fs.read(path) { readUtf8() })
    }.getOrNull()

    private fun persist() {
        val settings = _settings.value
        val library = _library.value
        scope.launch(Dispatchers.Default) {
            writeLock.withLock {
                write(settingsFile, json.encodeToString(Settings.serializer(), settings))
                write(libraryFile, json.encodeToString(librarySerializer, library))
            }
        }
    }

    /** Write to a temp file and move it into place so a crash never leaves half a file. */
    private fun write(path: Path, text: String) {
        val tmp = path.parent!! / (path.name + ".tmp")
        fs.write(tmp) { writeUtf8(text) }
        fs.atomicMove(tmp, path)
    }

    private fun editSettings(transform: (Settings) -> Settings) {
        _settings.update(transform); persist()
    }

    private fun editLibrary(transform: (List<SavedPaper>) -> List<SavedPaper>) {
        _library.update(transform); persist()
    }

    // Interests

    fun setInterests(topics: List<Topic>) = editSettings { it.copy(interests = topics.distinctBy { t -> t.id }, onboarded = true) }

    fun follow(topic: Topic) = editSettings { s ->
        if (s.interests.any { it.id == topic.id }) s else s.copy(interests = s.interests + topic)
    }

    fun unfollow(id: String) = editSettings { s -> s.copy(interests = s.interests.filterNot { it.id == id }) }

    fun finishOnboarding() = editSettings { it.copy(onboarded = true) }

    fun setOpenAlexKey(key: String) = editSettings { it.copy(openAlexKey = key.trim()) }

    fun setTheme(mode: ThemeMode) = editSettings { it.copy(theme = mode) }

    // Library

    fun entry(id: String): SavedPaper? = _library.value.firstOrNull { it.paper.id == id }

    fun isSaved(id: String) = entry(id) != null

    fun toggleSaved(paper: Paper) = editLibrary { list ->
        if (list.any { it.paper.id == paper.id }) list.filterNot { it.paper.id == paper.id }
        else listOf(SavedPaper(paper, savedAt = now())) + list
    }

    fun save(paper: Paper) = editLibrary { list ->
        if (list.any { it.paper.id == paper.id }) list else listOf(SavedPaper(paper, savedAt = now())) + list
    }

    fun remove(id: String) = editLibrary { list -> list.filterNot { it.paper.id == id } }

    fun setRead(id: String, read: Boolean) = updateEntry(id) { it.copy(read = read) }

    fun setDownloaded(paper: Paper, downloaded: Boolean) {
        if (downloaded) save(paper)
        updateEntry(paper.id) { it.copy(downloaded = downloaded) }
    }

    fun setLastPage(id: String, page: Int) = updateEntry(id) { it.copy(lastPage = page) }

    private fun updateEntry(id: String, transform: (SavedPaper) -> SavedPaper) = editLibrary { list ->
        list.map { if (it.paper.id == id) transform(it) else it }
    }

    private fun now() = Clock.System.now().toEpochMilliseconds()
}
