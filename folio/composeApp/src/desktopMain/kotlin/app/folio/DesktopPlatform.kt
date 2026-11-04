package app.folio

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.toComposeImageBitmap
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import okio.FileSystem
import okio.Path
import okio.Path.Companion.toPath
import org.apache.pdfbox.Loader
import org.apache.pdfbox.pdmodel.PDDocument
import org.apache.pdfbox.rendering.ImageType
import org.apache.pdfbox.rendering.PDFRenderer
import java.awt.Desktop
import java.awt.Toolkit
import java.awt.datatransfer.StringSelection
import java.io.File
import java.net.URI

class DesktopPlatform(override val dataDir: Path = defaultDataDir()) : Platform {
    override val name = "desktop"
    override val fileSystem: FileSystem = FileSystem.SYSTEM

    /** On Windows, real pen pressure and eraser via the pointer API; elsewhere, what Compose reports. */
    override val pen: app.folio.ink.PenInput = WindowsPen

    override fun openUrl(url: String) {
        runCatching {
            if (Desktop.isDesktopSupported() && Desktop.getDesktop().isSupported(Desktop.Action.BROWSE)) {
                Desktop.getDesktop().browse(URI(url))
            } else {
                ProcessBuilder("xdg-open", url).start()
            }
        }
    }

    override fun share(title: String, text: String): String? = runCatching {
        Toolkit.getDefaultToolkit().systemClipboard.setContents(StringSelection(text), null)
        "Copied title and link to the clipboard"
    }.getOrDefault("Couldn't reach the clipboard")

    override suspend fun openPdf(path: Path): PdfDocument? = withContext(Dispatchers.IO) {
        runCatching { DesktopPdf(Loader.loadPDF(File(path.toString()))) }.getOrNull()
    }

    companion object {
        /**
         * The usual per-user app data folder on each desktop OS. The app used to be called Folio;
         * an existing Folio folder is moved over so the library and notes carry on.
         */
        fun defaultDataDir(): Path {
            val home = System.getProperty("user.home")
            val os = System.getProperty("os.name").lowercase()
            fun dir(name: String) = when {
                os.contains("mac") -> "$home/Library/Application Support/$name"
                os.contains("win") -> (System.getenv("APPDATA") ?: "$home/AppData/Roaming") + "/$name"
                else -> (System.getenv("XDG_DATA_HOME") ?: "$home/.local/share") + "/" + name.lowercase()
            }
            val current = File(dir("Waraq"))
            val old = File(dir("Folio"))
            if (!current.exists() && old.isDirectory) runCatching { old.renameTo(current) }
            return current.path.toPath()
        }
    }
}

private class DesktopPdf(private val doc: PDDocument) : PdfDocument {
    private val renderer = PDFRenderer(doc)
    private val lock = Mutex()
    private val widths = FloatArray(doc.numberOfPages)
    private val ratios = FloatArray(doc.numberOfPages) { i ->
        val page = doc.getPage(i)
        val box = page.cropBox
        val rotated = page.rotation % 180 != 0
        val w = if (rotated) box.height else box.width
        val h = if (rotated) box.width else box.height
        widths[i] = w
        h / w.coerceAtLeast(1f)
    }

    override val pageCount: Int = doc.numberOfPages

    override fun aspectRatio(page: Int): Float = ratios[page]

    override suspend fun render(page: Int, widthPx: Int): ImageBitmap = withContext(Dispatchers.IO) {
        lock.withLock {
            renderer.renderImage(page, widthPx / widths[page], ImageType.ARGB).toComposeImageBitmap()
        }
    }

    override fun close() {
        runCatching { doc.close() }
    }
}

@Composable
actual fun PlatformBackHandler(enabled: Boolean, onBack: () -> Unit) = Unit
