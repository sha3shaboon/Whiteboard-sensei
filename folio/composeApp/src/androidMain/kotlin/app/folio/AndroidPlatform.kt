package app.folio

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import androidx.activity.compose.BackHandler
import androidx.browser.customtabs.CustomTabColorSchemeParams
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import okio.FileSystem
import okio.Path
import okio.Path.Companion.toOkioPath

class AndroidPlatform(private val context: Context) : Platform {
    override val name = "android"
    override val fileSystem: FileSystem = FileSystem.SYSTEM
    override val dataDir: Path = context.filesDir.toOkioPath() / "folio"

    override fun openUrl(url: String) {
        val params = CustomTabColorSchemeParams.Builder().setToolbarColor(0xFFF5F3EE.toInt()).build()
        runCatching {
            CustomTabsIntent.Builder().setDefaultColorSchemeParams(params).setShowTitle(true).build().apply {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }.launchUrl(context, Uri.parse(url))
        }.onFailure {
            runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
        }
    }

    override fun share(title: String, text: String): String? {
        val send = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, title)
            putExtra(Intent.EXTRA_TEXT, text)
        }
        context.startActivity(Intent.createChooser(send, "Share paper").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        return null
    }

    override suspend fun openPdf(path: Path): PdfDocument? = withContext(Dispatchers.IO) {
        runCatching { AndroidPdf(ParcelFileDescriptor.open(path.toFile(), ParcelFileDescriptor.MODE_READ_ONLY)) }.getOrNull()
    }
}

/** PdfRenderer allows one open page at a time, so every call goes through a lock. */
private class AndroidPdf(private val fd: ParcelFileDescriptor) : PdfDocument {
    private val renderer = PdfRenderer(fd)
    private val lock = Mutex()
    private val ratios: FloatArray = FloatArray(renderer.pageCount) { i ->
        renderer.openPage(i).use { it.height.toFloat() / it.width.coerceAtLeast(1) }
    }

    override val pageCount: Int = renderer.pageCount

    override fun aspectRatio(page: Int): Float = ratios[page]

    override suspend fun render(page: Int, widthPx: Int): ImageBitmap = withContext(Dispatchers.IO) {
        lock.withLock {
            renderer.openPage(page).use { p ->
                val height = (widthPx * p.height.toFloat() / p.width).toInt().coerceAtLeast(1)
                val bitmap = Bitmap.createBitmap(widthPx, height, Bitmap.Config.ARGB_8888)
                bitmap.eraseColor(Color.WHITE)
                p.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                bitmap.asImageBitmap()
            }
        }
    }

    override fun close() {
        runCatching { renderer.close() }
        runCatching { fd.close() }
    }
}

@Composable
actual fun PlatformBackHandler(enabled: Boolean, onBack: () -> Unit) = BackHandler(enabled, onBack)
