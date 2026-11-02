package com.folio.papers.ui.detail

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.OpenInNew
import androidx.compose.material.icons.outlined.Bookmark
import androidx.compose.material.icons.outlined.BookmarkBorder
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.PictureAsPdf
import androidx.compose.material.icons.outlined.RadioButtonUnchecked
import androidx.compose.material.icons.outlined.SearchOff
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.SuggestionChip
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.folio.papers.AppContainer
import com.folio.papers.data.Paper
import com.folio.papers.ui.components.EmptyState
import com.folio.papers.ui.components.SourceTag
import com.folio.papers.ui.components.friendlyDate
import com.folio.papers.ui.components.openInBrowser
import com.folio.papers.ui.components.sharePaper
import kotlinx.coroutines.launch

@Composable
fun PaperDetailScreen(paperId: String, container: AppContainer, onBack: () -> Unit, onSearch: (String) -> Unit) {
    val saved by container.library.saved.collectAsStateWithLifecycle(initialValue = null)
    val savedItem = saved?.firstOrNull { it.paper.id == paperId }
    val paper: Paper? = container.repository.cached(paperId) ?: savedItem?.paper
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val toolbar = MaterialTheme.colorScheme.surface

    PaperDetailContent(
        paper = paper,
        loaded = saved != null,
        saved = savedItem != null,
        read = savedItem?.read == true,
        onBack = onBack,
        onShare = { paper?.let { sharePaper(context, it) } },
        onToggleSave = { paper?.let { scope.launch { container.library.toggleSaved(it) } } },
        onToggleRead = { paper?.let { scope.launch { container.library.setRead(it.id, savedItem?.read != true) } } },
        onOpenPdf = { url ->
            openInBrowser(context, url, toolbar)
            if (savedItem != null && !savedItem.read) scope.launch { container.library.setRead(paperId, true) }
        },
        onOpenPage = { url -> openInBrowser(context, url, toolbar) },
        onSearch = onSearch,
    )
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun PaperDetailContent(
    paper: Paper?,
    loaded: Boolean,
    saved: Boolean,
    read: Boolean,
    onBack: () -> Unit,
    onShare: () -> Unit,
    onToggleSave: () -> Unit,
    onToggleRead: () -> Unit,
    onOpenPdf: (String) -> Unit,
    onOpenPage: (String) -> Unit,
    onSearch: (String) -> Unit,
) {
    val scroll = TopAppBarDefaults.enterAlwaysScrollBehavior()

    Scaffold(
        modifier = Modifier.nestedScroll(scroll.nestedScrollConnection),
        topBar = {
            TopAppBar(
                title = {},
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Back") } },
                actions = {
                    if (paper != null) {
                        IconButton(onClick = onShare) { Icon(Icons.Outlined.Share, "Share") }
                        IconButton(onClick = onToggleSave) {
                            Icon(
                                if (saved) Icons.Outlined.Bookmark else Icons.Outlined.BookmarkBorder,
                                if (saved) "Remove from library" else "Save to library",
                                tint = if (saved) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                            )
                        }
                    }
                },
                scrollBehavior = scroll,
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface, scrolledContainerColor = MaterialTheme.colorScheme.surface),
            )
        },
        bottomBar = {
            if (paper != null) {
                Surface(color = MaterialTheme.colorScheme.surfaceContainerLow, tonalElevation = 2.dp) {
                    Row(
                        Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 16.dp, vertical = 12.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        val pdf = paper.pdfUrl
                        if (pdf != null) {
                            Button(
                                onClick = { onOpenPdf(pdf) },
                                modifier = Modifier.weight(1f).height(52.dp),
                                shape = RoundedCornerShape(16.dp),
                            ) {
                                Icon(Icons.Outlined.PictureAsPdf, null, Modifier.size(18.dp))
                                Spacer(Modifier.width(8.dp))
                                Text("Read PDF")
                            }
                        }
                        OutlinedButton(
                            onClick = { onOpenPage(paper.landingUrl) },
                            modifier = Modifier.weight(1f).height(52.dp),
                            shape = RoundedCornerShape(16.dp),
                        ) {
                            Icon(Icons.AutoMirrored.Outlined.OpenInNew, null, Modifier.size(18.dp))
                            Spacer(Modifier.width(8.dp))
                            Text(if (pdf == null) "Read online" else "Paper page")
                        }
                    }
                }
            }
        },
    ) { padding ->
        if (paper == null) {
            if (loaded) {
                EmptyState(
                    Icons.Outlined.SearchOff, "Paper not available",
                    "It may have been removed from your library.", Modifier.padding(padding),
                )
            }
            return@Scaffold
        }
        Column(
            Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(horizontal = 22.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                SourceTag(paper.source)
                Text(
                    "  ·  ${friendlyDate(paper.published)}",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(Modifier.height(12.dp))
            Text(paper.title, style = MaterialTheme.typography.headlineMedium)
            Spacer(Modifier.height(14.dp))
            Authors(paper.authors)
            paper.venue?.let {
                Spacer(Modifier.height(6.dp))
                Text(it, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.secondary)
            }

            Spacer(Modifier.height(18.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(24.dp)) {
                paper.citations?.let { Fact("Citations", it.toString()) }
                paper.doi?.let { Fact("DOI", it) }
            }

            if (saved) {
                Spacer(Modifier.height(8.dp))
                TextButton(onClick = onToggleRead) {
                    Icon(if (read) Icons.Outlined.CheckCircle else Icons.Outlined.RadioButtonUnchecked, null, Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(if (read) "Read" else "Mark as read")
                }
            }

            Spacer(Modifier.height(12.dp))
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            Spacer(Modifier.height(20.dp))
            Text("ABSTRACT", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.height(10.dp))
            Text(
                paper.abstract.ifBlank { "No abstract was published with this paper." },
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.92f),
            )

            if (paper.tags.isNotEmpty()) {
                Spacer(Modifier.height(24.dp))
                Text("RELATED", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                Spacer(Modifier.height(6.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    paper.tags.forEach { tag ->
                        SuggestionChip(onClick = { onSearch(tag) }, label = { Text(tag) })
                    }
                }
            }
            Spacer(Modifier.height(32.dp))
        }
    }
}

@Composable
private fun Authors(authors: List<String>) {
    var expanded by remember { mutableStateOf(false) }
    val long = authors.size > 6
    val text = when {
        authors.isEmpty() -> "Unknown authors"
        long && !expanded -> authors.take(6).joinToString(", ") + " and ${authors.size - 6} more"
        else -> authors.joinToString(", ")
    }
    Text(
        text,
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        maxLines = if (expanded || !long) Int.MAX_VALUE else 3,
        overflow = TextOverflow.Ellipsis,
    )
    if (long) {
        TextButton(onClick = { expanded = !expanded }, contentPadding = PaddingValues(0.dp)) {
            Text(if (expanded) "Show fewer" else "Show all ${authors.size} authors")
        }
    }
}

@Composable
private fun Fact(label: String, value: String) {
    Column {
        Text(label.uppercase(), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(2.dp))
        Text(value, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}
