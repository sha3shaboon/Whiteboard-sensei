package app.folio

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.ImageBitmap
import okio.FileSystem
import okio.Path

/** Everything the shared app needs from the device it runs on. */
interface Platform {
    /** "android", "desktop", … */
    val name: String
    val fileSystem: FileSystem

    /** Private folder for the library, settings and downloaded PDFs. */
    val dataDir: Path

    fun openUrl(url: String)

    /** Phone: the share sheet. Desktop: copy to the clipboard. Returns a message to show, if any. */
    fun share(title: String, text: String): String?

    /** Classifies pointers as stylus / eraser / finger / mouse, with pressure. */
    val pen: app.folio.ink.PenInput get() = app.folio.ink.ComposePenInput

    /** Opens a downloaded PDF for in-app reading, or null if the file can't be read. */
    suspend fun openPdf(path: Path): PdfDocument?
}

interface PdfDocument {
    val pageCount: Int

    /** Height / width of a page, so the reader can lay out pages before they render. */
    fun aspectRatio(page: Int): Float

    suspend fun render(page: Int, widthPx: Int): ImageBitmap

    fun close()
}

/** System back (Android gesture / button). No-op on desktop, which uses Esc and the back arrow. */
@Composable
expect fun PlatformBackHandler(enabled: Boolean, onBack: () -> Unit)
