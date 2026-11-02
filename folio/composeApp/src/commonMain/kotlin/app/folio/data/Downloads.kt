package app.folio.data

import io.ktor.client.HttpClient
import io.ktor.client.plugins.onDownload
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.statement.readRawBytes
import io.ktor.http.isSuccess
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okio.FileSystem
import okio.Path

sealed interface DownloadState {
    data class Running(val progress: Float?) : DownloadState
    data class Failed(val message: String) : DownloadState
}

/**
 * Fetches paper PDFs so they open in the in-app reader.
 *
 * Opening a paper to read puts its PDF in a small cache (the last [CACHE_LIMIT] papers).
 * Saving it for offline, or writing on it, moves it to permanent storage and marks it in the library.
 */
class Downloads(
    private val http: HttpClient,
    private val fs: FileSystem,
    dataDir: Path,
    private val store: Store,
    private val scope: CoroutineScope,
) {
    private val keptDir = dataDir / "papers"
    private val cacheDir = dataDir / "cache"
    private val jobs = HashMap<String, Job>()

    /** In-flight and failed downloads by paper id. */
    private val _active = MutableStateFlow<Map<String, DownloadState>>(emptyMap())
    val active: StateFlow<Map<String, DownloadState>> = _active.asStateFlow()

    init {
        fs.createDirectories(keptDir)
        fs.createDirectories(cacheDir)
    }

    private fun name(id: String) = id.replace(Regex("[^A-Za-z0-9._-]"), "_") + ".pdf"
    private fun keptFile(id: String): Path = keptDir / name(id)
    private fun cacheFile(id: String): Path = cacheDir / name(id)

    /** Where the PDF is on this device: kept copy first, then the reading cache. */
    fun fileFor(id: String): Path = keptFile(id).takeIf { fs.exists(it) } ?: cacheFile(id)

    fun isOnDevice(id: String): Boolean = fs.exists(keptFile(id)) || fs.exists(cacheFile(id))

    fun isKept(id: String): Boolean = fs.exists(keptFile(id))

    /**
     * Gets the PDF onto the device. With [keep], it is stored permanently and marked offline in the
     * library; otherwise it goes to the reading cache. [onReady] runs once the file is in place.
     */
    fun fetch(paper: Paper, keep: Boolean, onReady: () -> Unit = {}) {
        if (keep && fs.exists(cacheFile(paper.id))) {
            keepCached(paper); onReady(); return
        }
        if (isOnDevice(paper.id)) {
            if (keep) keepCached(paper)
            onReady(); return
        }
        val url = paper.pdfUrl ?: return
        if (jobs[paper.id]?.isActive == true) return
        _active.update { it + (paper.id to DownloadState.Running(null)) }
        jobs[paper.id] = scope.launch {
            try {
                val response = http.get(url) {
                    header("User-Agent", "Mozilla/5.0 (Folio paper reader)")
                    header("Accept", "application/pdf,*/*")
                    onDownload { sent, total ->
                        val p = total?.takeIf { it > 0 }?.let { sent.toFloat() / it }
                        _active.update { it + (paper.id to DownloadState.Running(p)) }
                    }
                }
                if (!response.status.isSuccess()) error("The server answered ${response.status.value}. Try opening the paper's page instead.")
                val bytes = response.readRawBytes()
                if (bytes.size < 5 || bytes.decodeToString(0, 5) != "%PDF-") {
                    error("This source only offers the paper as a web page. Open the paper's page instead.")
                }
                withContext(Dispatchers.Default) {
                    val target = if (keep) keptFile(paper.id) else cacheFile(paper.id)
                    val tmp = target.parent!! / (target.name + ".part")
                    fs.write(tmp) { write(bytes) }
                    fs.atomicMove(tmp, target)
                    if (!keep) pruneCache()
                }
                if (keep) store.setDownloaded(paper, true)
                _active.update { it - paper.id }
                onReady()
            } catch (e: CancellationException) {
                _active.update { it - paper.id }
                throw e
            } catch (e: Exception) {
                val message = e.message?.takeIf { it.length < 140 } ?: "Download failed. Check your connection."
                _active.update { it + (paper.id to DownloadState.Failed(message)) }
            }
        }
    }

    /** Move a cached PDF into permanent storage (when saved offline or annotated). */
    fun keepCached(paper: Paper) {
        val cached = cacheFile(paper.id)
        if (fs.exists(cached) && !fs.exists(keptFile(paper.id))) runCatching { fs.atomicMove(cached, keptFile(paper.id)) }
        if (fs.exists(keptFile(paper.id))) store.setDownloaded(paper, true)
    }

    private fun pruneCache() {
        val files = fs.list(cacheDir).filter { it.name.endsWith(".pdf") }
        if (files.size <= CACHE_LIMIT) return
        files.sortedBy { fs.metadata(it).lastModifiedAtMillis ?: 0L }.take(files.size - CACHE_LIMIT).forEach { runCatching { fs.delete(it) } }
    }

    fun cancel(id: String) {
        jobs.remove(id)?.cancel()
        _active.update { it - id }
    }

    fun dismissError(id: String) = _active.update { it - id }

    fun delete(paper: Paper) {
        cancel(paper.id)
        runCatching { fs.delete(keptFile(paper.id)) }
        runCatching { fs.delete(cacheFile(paper.id)) }
        store.setDownloaded(paper, false)
    }

    /** Total size of PDFs kept offline, in bytes. */
    fun usedBytes(): Long = runCatching { fs.list(keptDir).sumOf { fs.metadata(it).size ?: 0L } }.getOrDefault(0L)

    companion object {
        const val CACHE_LIMIT = 25
    }
}
