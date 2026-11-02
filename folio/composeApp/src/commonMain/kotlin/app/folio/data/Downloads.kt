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

/** Fetches paper PDFs into the app's data folder so they can be read offline. */
class Downloads(
    private val http: HttpClient,
    private val fs: FileSystem,
    dataDir: Path,
    private val store: Store,
    private val scope: CoroutineScope,
) {
    private val dir = dataDir / "papers"
    private val jobs = HashMap<String, Job>()

    /** In-flight and failed downloads by paper id. Finished ones live in the library. */
    private val _active = MutableStateFlow<Map<String, DownloadState>>(emptyMap())
    val active: StateFlow<Map<String, DownloadState>> = _active.asStateFlow()

    init {
        fs.createDirectories(dir)
    }

    fun fileFor(id: String): Path = dir / (id.replace(Regex("[^A-Za-z0-9._-]"), "_") + ".pdf")

    fun isOnDevice(id: String): Boolean = fs.exists(fileFor(id))

    fun start(paper: Paper) {
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
                if (!response.status.isSuccess()) error("The server answered ${response.status.value}")
                val bytes = response.readRawBytes()
                if (bytes.size < 5 || bytes.decodeToString(0, 5) != "%PDF-") {
                    error("This source only offers the paper as a web page. Open it online instead.")
                }
                withContext(Dispatchers.Default) {
                    val target = fileFor(paper.id)
                    val tmp = dir / (target.name + ".part")
                    fs.write(tmp) { write(bytes) }
                    fs.atomicMove(tmp, target)
                }
                store.setDownloaded(paper, true)
                _active.update { it - paper.id }
            } catch (e: CancellationException) {
                _active.update { it - paper.id }
                throw e
            } catch (e: Exception) {
                val message = e.message?.takeIf { it.length < 120 } ?: "Download failed. Check your connection."
                _active.update { it + (paper.id to DownloadState.Failed(message)) }
            }
        }
    }

    fun cancel(id: String) {
        jobs.remove(id)?.cancel()
        _active.update { it - id }
    }

    fun dismissError(id: String) = _active.update { it - id }

    fun delete(paper: Paper) {
        cancel(paper.id)
        runCatching { fs.delete(fileFor(paper.id)) }
        store.setDownloaded(paper, false)
    }

    /** Total size of downloaded PDFs, in bytes. */
    fun usedBytes(): Long = runCatching {
        fs.list(dir).sumOf { fs.metadata(it).size ?: 0L }
    }.getOrDefault(0L)
}
