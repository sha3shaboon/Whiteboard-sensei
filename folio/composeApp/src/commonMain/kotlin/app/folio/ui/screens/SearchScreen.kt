package app.folio.ui.screens

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
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.SearchOff
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.unit.dp
import app.folio.LocalApp
import app.folio.data.Curiosity
import app.folio.data.Source
import app.folio.data.Topic
import app.folio.toast
import app.folio.ui.components.EmptyState
import app.folio.ui.components.PillButton
import app.folio.ui.components.ScreenTitle
import app.folio.ui.components.SearchPill
import app.folio.ui.components.today
import app.folio.ui.theme.Folio

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SearchScreen() {
    val app = LocalApp.current
    val search = app.graph.search
    val state by search.feed.state.collectAsState()
    val query by search.query.collectAsState()
    val submitted by search.submitted.collectAsState()
    val source by search.source.collectAsState()
    val recent by search.recent.collectAsState()
    val settings by app.graph.store.settings.collectAsState()
    val library by app.graph.store.library.collectAsState()
    val savedIds = remember(library) { library.map { it.paper.id }.toSet() }
    val pad = if (app.wide) 36.dp else 20.dp
    val focus = LocalFocusManager.current
    val listState = rememberLazyListState()
    val ideas = remember { Curiosity.pick(emptyList(), seed = today().toEpochDays(), count = 10) }

    InfiniteScroll(listState, state, search.feed::loadMore)

    LazyColumn(state = listState, modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 32.dp)) {
        item(key = "head") {
            Column(Modifier.windowInsetsPadding(WindowInsets.statusBars).padding(start = pad, end = pad, top = 24.dp)) {
                ScreenTitle("Search", kicker = "Every source at once")
                Spacer(Modifier.height(16.dp))
                SearchPill(
                    value = query,
                    onValueChange = search::onQueryChange,
                    onSearch = { search.submit(); focus.clearFocus() },
                    modifier = if (app.wide) Modifier.widthIn(max = 680.dp) else Modifier,
                    leading = { SourcePicker(source, search::setSource) },
                )
                Spacer(Modifier.height(16.dp))
            }
        }

        if (submitted.isBlank()) {
            item(key = "ideas") {
                Column(Modifier.padding(horizontal = pad), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    if (recent.isNotEmpty()) {
                        Text("RECENT", style = MaterialTheme.typography.labelSmall, color = Folio.colors.muted)
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            recent.forEach { r -> PillButton(r, onClick = { search.submit(r); focus.clearFocus() }, leading = Icons.Outlined.History) }
                        }
                        Spacer(Modifier.height(8.dp))
                    }
                    Text("TRY SOMETHING NEW", style = MaterialTheme.typography.labelSmall, color = Folio.colors.muted)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        ideas.forEach { idea -> PillButton(idea, onClick = { search.submit(idea); focus.clearFocus() }) }
                    }
                }
            }
        } else {
            item(key = "results-head") {
                val topic = Topic.custom(submitted)
                val following = settings.interests.any { it.id == topic.id || it.query.equals(submitted, ignoreCase = true) }
                Row(Modifier.padding(horizontal = pad).padding(bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("Results for “$submitted”", style = MaterialTheme.typography.titleLarge)
                        Text(source?.let { "From ${it.label}" } ?: "Best matches, mixed from all sources", style = MaterialTheme.typography.bodySmall, color = Folio.colors.muted)
                    }
                    PillButton(
                        if (following) "Following" else "Follow topic",
                        selected = following,
                        leading = if (following) Icons.Outlined.Check else Icons.Outlined.Add,
                        onClick = {
                            if (!following) { app.graph.store.follow(topic); app.toast("Following “${topic.name}”. It's in your Discover feed now.") }
                        },
                    )
                    IconButton(onClick = search::clear) { Icon(Icons.Outlined.Close, "Clear search") }
                }
            }
            if (state.started && !state.loading && state.papers.isEmpty() && state.problems.isEmpty()) {
                item { EmptyState(Icons.Outlined.SearchOff, "No papers found", "Try fewer or broader words.") }
            }
            paperList(state.papers, savedIds, app, pad, columns = if (app.wide) 2 else 1)
            feedFooter(state, pad, onRetry = { search.submit(submitted) })
        }
    }
}

@Composable
private fun SourcePicker(source: Source?, onPick: (Source?) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        TextButton(onClick = { open = true }) {
            Text(source?.label ?: "All sources", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onBackground)
            Icon(Icons.Outlined.ExpandMore, null, Modifier.size(18.dp), tint = Folio.colors.muted)
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            DropdownMenuItem(text = { Text("All sources") }, onClick = { onPick(null); open = false })
            Source.entries.forEach { s -> DropdownMenuItem(text = { Text(s.label) }, onClick = { onPick(s); open = false }) }
        }
    }
}
