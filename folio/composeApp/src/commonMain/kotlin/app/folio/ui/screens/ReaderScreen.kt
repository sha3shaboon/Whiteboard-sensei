package app.folio.ui.screens

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.ZoomIn
import androidx.compose.material.icons.outlined.ZoomOut
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.folio.LocalApp
import app.folio.PdfDocument
import app.folio.ui.components.EmptyState
import app.folio.ui.theme.Folio
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged

private val zoomSteps = listOf(1f, 1.35f, 1.75f, 2.25f, 3f)

/** In-app reader for downloaded PDFs: works offline, remembers your page, zooms. */
@Composable
fun ReaderScreen(id: String) {
    val app = LocalApp.current
    val paper = remember(id) { app.graph.paper(id) }
    val path = remember(id) { app.graph.downloads.fileFor(id) }
    val doc by produceState<Result<PdfDocument?>?>(null, path) {
        value = runCatching { app.graph.platform.openPdf(path) }
    }
    // Capture the opened document itself: reading `doc` inside onDispose would see the *new*
    // value and close the file that was just opened.
    val opened = doc?.getOrNull()
    DisposableEffect(opened) { onDispose { opened?.close() } }
    var zoom by remember { mutableStateOf(0) }
    val listState = rememberLazyListState(initialFirstVisibleItemIndex = app.graph.store.entry(id)?.lastPage ?: 0)

    LaunchedEffect(listState) {
        @OptIn(kotlinx.coroutines.FlowPreview::class)
        snapshotFlow { listState.firstVisibleItemIndex }.distinctUntilChanged().debounce(600).collect { page ->
            app.graph.store.setLastPage(id, page)
            if (page > 0) app.graph.store.setRead(id, true)
        }
    }

    Column(Modifier.fillMaxSize().background(if (Folio.colors.dark) Color(0xFF0B0B0C) else Color(0xFFE4E1DA))) {
        Surface(color = Folio.colors.card, shadowElevation = 2.dp) {
            Row(Modifier.fillMaxWidth().windowInsetsPadding(WindowInsets.statusBars).padding(horizontal = 4.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = { app.nav.pop() }) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Back") }
                Column(Modifier.weight(1f)) {
                    Text(paper?.title ?: "Paper", style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    val count = doc?.getOrNull()?.pageCount
                    if (count != null) Text("Page ${listState.firstVisibleItemIndex + 1} of $count", style = MaterialTheme.typography.bodySmall, color = Folio.colors.muted)
                }
                IconButton(onClick = { if (zoom > 0) zoom-- }, enabled = zoom > 0) { Icon(Icons.Outlined.ZoomOut, "Zoom out") }
                Text("${(zoomSteps[zoom] * 100).toInt()}%", style = MaterialTheme.typography.labelMedium, modifier = Modifier.width(44.dp))
                IconButton(onClick = { if (zoom < zoomSteps.lastIndex) zoom++ }, enabled = zoom < zoomSteps.lastIndex) { Icon(Icons.Outlined.ZoomIn, "Zoom in") }
            }
        }

        val result = doc
        when {
            result == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = MaterialTheme.colorScheme.secondary) }
            result.getOrNull() == null -> EmptyState(Icons.Outlined.ErrorOutline, "Can't open this PDF", "The file may be damaged. Remove the download and fetch it again.")
            else -> Pages(result.getOrNull()!!, zoomSteps[zoom], listState)
        }
    }
}

@Composable
private fun Pages(doc: PdfDocument, zoom: Float, listState: androidx.compose.foundation.lazy.LazyListState) {
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val available = maxWidth
        // Fit to width on phones; a comfortable reading column on wide screens.
        val base = minOf(available - 16.dp, 860.dp)
        val pageWidth = base * zoom
        val density = LocalDensity.current
        val widthPx = with(density) { pageWidth.roundToPx() }.coerceAtMost(2600)
        val cache = remember(doc) { LinkedHashMap<String, ImageBitmap>() }
        Box(Modifier.fillMaxSize().horizontalScroll(rememberScrollState()), contentAlignment = Alignment.TopCenter) {
            LazyColumn(
                state = listState,
                modifier = Modifier.width(maxOf(pageWidth + 16.dp, available)),
                contentPadding = PaddingValues(vertical = 12.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                items(doc.pageCount) { index ->
                    val key = "$index@$widthPx"
                    val bitmap by produceState(cache[key], key) {
                        if (value == null) {
                            val rendered = doc.render(index, widthPx)
                            cache[key] = rendered
                            while (cache.size > 10) cache.remove(cache.keys.first())
                            value = rendered
                        }
                    }
                    Box(
                        Modifier.width(pageWidth).aspectRatio(1f / doc.aspectRatio(index))
                            .shadow(4.dp, RoundedCornerShape(4.dp)).clip(RoundedCornerShape(4.dp)).background(Color.White),
                        contentAlignment = Alignment.Center,
                    ) {
                        val b = bitmap
                        if (b == null) CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.dp, color = Color(0xFFB0ACA3))
                        else Image(b, "Page ${index + 1}", Modifier.fillMaxSize(), contentScale = ContentScale.FillWidth)
                    }
                }
            }
        }
    }
}
