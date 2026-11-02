package app.folio.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.MenuBook
import androidx.compose.material.icons.automirrored.outlined.OpenInNew
import androidx.compose.material.icons.outlined.Bookmark
import androidx.compose.material.icons.outlined.BookmarkBorder
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.CloudDone
import androidx.compose.material.icons.outlined.Draw
import androidx.compose.material.icons.outlined.Download
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.RadioButtonUnchecked
import androidx.compose.material.icons.outlined.SearchOff
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.folio.AppScope
import app.folio.LocalApp
import app.folio.data.DownloadState
import app.folio.data.Paper
import app.folio.data.SavedPaper
import app.folio.toast
import app.folio.ui.Screen
import app.folio.ui.components.EmptyState
import app.folio.ui.components.PillButton
import app.folio.ui.components.friendlyDate
import app.folio.ui.components.readMinutes
import app.folio.ui.cover.Field
import app.folio.ui.cover.PaperCover
import app.folio.ui.theme.Folio

@Composable
fun PaperScreen(id: String) {
    val app = LocalApp.current
    val library by app.graph.store.library.collectAsState()
    val downloads by app.graph.downloads.active.collectAsState()
    val entry = library.firstOrNull { it.paper.id == id }
    val paper = remember(id) { app.graph.paper(id) } ?: entry?.paper
    val pad = if (app.wide) 36.dp else 20.dp

    if (paper == null) {
        Column(Modifier.windowInsetsPadding(WindowInsets.statusBars).padding(12.dp)) {
            IconButton(onClick = { app.nav.pop() }) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Back") }
            EmptyState(Icons.Outlined.SearchOff, "Paper not available", "It may have been removed from your library.")
        }
        return
    }
    val field = remember(paper.id) { Field.of(paper) }
    val download = downloads[paper.id]

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        // Hero on the beige band
        Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(bottomStart = 56.dp)).background(Folio.colors.band)) {
            Column(Modifier.windowInsetsPadding(WindowInsets.statusBars).padding(start = pad - 12.dp, end = pad - 12.dp, top = 8.dp, bottom = 28.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = { app.nav.pop() }) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Back") }
                    Spacer(Modifier.weight(1f))
                    IconButton(onClick = {
                        app.graph.platform.share(paper.title, "${paper.title}\n${paper.authors.take(3).joinToString(", ")}\n${paper.doi?.let { "https://doi.org/$it" } ?: paper.landingUrl}")
                            ?.let(app::toast)
                    }) { Icon(Icons.Outlined.Share, "Share") }
                    IconButton(onClick = { app.graph.store.toggleSaved(paper) }) {
                        Icon(
                            if (entry != null) Icons.Outlined.Bookmark else Icons.Outlined.BookmarkBorder,
                            if (entry != null) "Remove from library" else "Save to library",
                            tint = if (entry != null) MaterialTheme.colorScheme.secondary else MaterialTheme.colorScheme.onBackground,
                        )
                    }
                }
                Spacer(Modifier.height(8.dp))
                if (app.wide) {
                    Row(Modifier.padding(horizontal = 12.dp), verticalAlignment = Alignment.Top) {
                        PaperCover(paper, Modifier.width(230.dp), elevation = 18)
                        Spacer(Modifier.width(36.dp))
                        Column(Modifier.weight(1f).widthIn(max = 720.dp)) { Headline(paper, field, entry) ; Spacer(Modifier.height(24.dp)); Actions(app, paper, entry, download) }
                    }
                } else {
                    Column(Modifier.padding(horizontal = 12.dp)) {
                        PaperCover(paper, Modifier.width(170.dp).align(Alignment.CenterHorizontally), elevation = 18)
                        Spacer(Modifier.height(24.dp))
                        Headline(paper, field, entry)
                        Spacer(Modifier.height(20.dp))
                        Actions(app, paper, entry, download)
                    }
                }
            }
        }

        Column(Modifier.padding(horizontal = pad, vertical = 24.dp).widthIn(max = 860.dp)) {
            NotesCard(app, paper)
            Spacer(Modifier.height(16.dp))
            Surface(shape = RoundedCornerShape(22.dp), color = Folio.colors.card, modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(22.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("ABSTRACT", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.secondary, modifier = Modifier.weight(1f))
                        if (paper.abstract.isNotBlank()) Text("${readMinutes(paper.abstract)} min read", style = MaterialTheme.typography.labelMedium, color = Folio.colors.muted)
                    }
                    Spacer(Modifier.height(10.dp))
                    Text(paper.abstract.ifBlank { "No abstract was published with this paper." }, style = MaterialTheme.typography.bodyLarge)
                    if (entry != null) {
                        Spacer(Modifier.height(8.dp))
                        TextButton(onClick = { app.graph.store.setRead(paper.id, !entry.read) }, contentPadding = PaddingValues(0.dp)) {
                            Icon(if (entry.read) Icons.Outlined.CheckCircle else Icons.Outlined.RadioButtonUnchecked, null, Modifier.size(18.dp), tint = MaterialTheme.colorScheme.primary)
                            Spacer(Modifier.width(8.dp))
                            Text(if (entry.read) "Read" else "Mark as read", color = MaterialTheme.colorScheme.primary)
                        }
                    }
                }
            }
            if (paper.tags.isNotEmpty()) {
                Spacer(Modifier.height(20.dp))
                Text("EXPLORE RELATED", style = MaterialTheme.typography.labelSmall, color = Folio.colors.muted)
                Spacer(Modifier.height(10.dp))
                @OptIn(ExperimentalLayoutApi::class)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    paper.tags.forEach { tag ->
                        PillButton(tag, onClick = { app.graph.search.submit(tag); app.nav.reset(Screen.Search) })
                    }
                }
            }
        }
    }
}

@Composable
private fun Headline(paper: Paper, field: Field, entry: SavedPaper?) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        val p = field.palette(0)
        Row(Modifier.clip(RoundedCornerShape(8.dp)).background(p.background).padding(horizontal = 8.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(field.icon, null, Modifier.size(14.dp), tint = p.accent)
            Spacer(Modifier.width(6.dp))
            Text(field.label.uppercase(), style = MaterialTheme.typography.labelSmall, color = p.ink)
        }
        Spacer(Modifier.width(10.dp))
        Text("${paper.source.label} · ${friendlyDate(paper.published)}", style = MaterialTheme.typography.labelMedium, color = Folio.colors.muted)
    }
    Spacer(Modifier.height(12.dp))
    Text(paper.title, style = MaterialTheme.typography.headlineMedium)
    Spacer(Modifier.height(10.dp))
    Authors(paper.authors)
    val facts = listOfNotNull(paper.venue, paper.citations?.let { "$it citations" }, paper.doi?.let { "doi:$it" })
    if (facts.isNotEmpty()) {
        Spacer(Modifier.height(4.dp))
        Text(facts.joinToString("  ·  "), style = MaterialTheme.typography.bodySmall, color = Folio.colors.muted, maxLines = 2, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun Authors(authors: List<String>) {
    var expanded by remember { mutableStateOf(false) }
    val long = authors.size > 6
    Text(
        when {
            authors.isEmpty() -> "Unknown authors"
            long && !expanded -> authors.take(6).joinToString(", ") + " and ${authors.size - 6} more"
            else -> authors.joinToString(", ")
        },
        style = MaterialTheme.typography.bodyMedium,
    )
    if (long) {
        TextButton(onClick = { expanded = !expanded }, contentPadding = PaddingValues(0.dp)) {
            Text(if (expanded) "Show fewer" else "Show all ${authors.size} authors", style = MaterialTheme.typography.labelMedium)
        }
    }
}

@Composable
private fun Actions(app: AppScope, paper: Paper, entry: SavedPaper?, download: DownloadState?) {
    val pdf = paper.pdfUrl
    val downloads = app.graph.downloads
    val onDevice = downloads.isOnDevice(paper.id)
    val kept = entry?.downloaded == true && downloads.isKept(paper.id)
    val running = download as? DownloadState.Running

    fun openReader() {
        val here = app.nav.current.screen
        downloads.fetch(paper, keep = false) {
            // Only jump to the reader if the reader is still looking at this paper.
            if (app.nav.current.screen == here) app.nav.push(Screen.Reader(paper.id))
        }
    }

    Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
        when {
            running != null -> Button(
                onClick = { downloads.cancel(paper.id) },
                shape = RoundedCornerShape(14.dp), modifier = Modifier.height(50.dp),
            ) {
                CircularProgressIndicator(
                    progress = { running.progress ?: 0f }, modifier = Modifier.size(18.dp), strokeWidth = 2.dp,
                    color = MaterialTheme.colorScheme.onPrimary, trackColor = MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.3f),
                )
                Spacer(Modifier.width(10.dp))
                Text(running.progress?.let { "Opening ${(it * 100).toInt()}%" } ?: "Opening…")
                Spacer(Modifier.width(6.dp))
                Icon(Icons.Outlined.Close, "Cancel", Modifier.size(16.dp))
            }
            pdf != null || onDevice -> Button(onClick = ::openReader, shape = RoundedCornerShape(14.dp), modifier = Modifier.height(50.dp)) {
                Icon(Icons.AutoMirrored.Outlined.MenuBook, null, Modifier.size(18.dp)); Spacer(Modifier.width(8.dp))
                Text(if ((entry?.lastPage ?: 0) > 0) "Continue reading" else "Read")
            }
            else -> Button(onClick = { app.graph.platform.openUrl(paper.landingUrl) }, shape = RoundedCornerShape(14.dp), modifier = Modifier.height(50.dp)) {
                Icon(Icons.AutoMirrored.Outlined.OpenInNew, null, Modifier.size(18.dp)); Spacer(Modifier.width(8.dp))
                Text("Read on the web")
            }
        }
        if (pdf != null || onDevice) {
            OutlinedButton(
                onClick = {
                    if (kept) { downloads.delete(paper); app.toast("Removed from this device") }
                    else downloads.fetch(paper, keep = true) { app.toast("Saved for offline reading") }
                },
                enabled = running == null,
                shape = RoundedCornerShape(14.dp), modifier = Modifier.height(50.dp),
            ) {
                Icon(if (kept) Icons.Outlined.CloudDone else Icons.Outlined.Download, null, Modifier.size(18.dp)); Spacer(Modifier.width(8.dp))
                Text(if (kept) "Offline" else "Save offline")
            }
        }
        IconButton(onClick = { app.graph.platform.openUrl(paper.landingUrl) }) {
            Icon(Icons.AutoMirrored.Outlined.OpenInNew, "Open the paper's web page", tint = Folio.colors.muted)
        }
    }
    if (running?.progress != null) {
        Spacer(Modifier.height(10.dp))
        LinearProgressIndicator(progress = { running.progress }, modifier = Modifier.widthIn(max = 360.dp).fillMaxWidth(), color = MaterialTheme.colorScheme.secondary)
    }
    if (download is DownloadState.Failed) {
        Spacer(Modifier.height(12.dp))
        Row(Modifier.clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.secondaryContainer).padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Outlined.ErrorOutline, null, Modifier.size(18.dp), tint = MaterialTheme.colorScheme.onSecondaryContainer)
            Spacer(Modifier.width(8.dp))
            Text(download.message, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSecondaryContainer, modifier = Modifier.weight(1f, fill = false))
            TextButton(onClick = { app.graph.platform.openUrl(paper.landingUrl) }) { Text("Open page", style = MaterialTheme.typography.labelMedium) }
            IconButton(onClick = { downloads.dismissError(paper.id) }, modifier = Modifier.size(28.dp)) { Icon(Icons.Outlined.Close, "Dismiss", Modifier.size(14.dp)) }
        }
    }
    if (pdf == null && !onDevice) {
        Spacer(Modifier.height(8.dp))
        Text("This source doesn't offer a PDF, so it opens on the publisher's site.", style = MaterialTheme.typography.bodySmall, color = Folio.colors.muted)
    }
}

/** Preview of your handwriting and typed notes, with a way back into the reader. */
@Composable
private fun NotesCard(app: AppScope, paper: Paper) {
    val annotated by app.graph.notes.annotated.collectAsState()
    if (paper.id !in annotated) return
    val notes = remember(paper.id, annotated) { app.graph.notes.load(paper.id) }
    Surface(
        onClick = { app.nav.push(Screen.Reader(paper.id)) },
        shape = RoundedCornerShape(22.dp), color = Folio.colors.card, modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(22.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Outlined.Draw, null, Modifier.size(16.dp), tint = MaterialTheme.colorScheme.secondary)
                Spacer(Modifier.width(8.dp))
                Text("YOUR NOTES", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.secondary, modifier = Modifier.weight(1f))
                val pages = notes.strokes.map { it.page }.distinct().size
                if (notes.strokes.isNotEmpty()) Text("${notes.strokes.size} pen strokes on $pages ${if (pages == 1) "page" else "pages"}", style = MaterialTheme.typography.labelMedium, color = Folio.colors.muted)
            }
            if (notes.text.isNotBlank()) {
                Spacer(Modifier.height(10.dp))
                Text(notes.text, style = MaterialTheme.typography.bodyMedium, maxLines = 6, overflow = TextOverflow.Ellipsis)
            }
            Spacer(Modifier.height(6.dp))
            Text("Open in the reader", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
        }
    }
}
