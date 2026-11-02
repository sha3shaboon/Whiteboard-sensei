package app.folio.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material.icons.outlined.Explore
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Shuffle
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.folio.AppScope
import app.folio.LocalApp
import app.folio.data.Paper
import app.folio.data.Topic
import app.folio.ui.Screen
import app.folio.ui.components.BookCard
import app.folio.ui.components.CoverSkeleton
import app.folio.ui.components.EmptyState
import app.folio.ui.components.FeedUiState
import app.folio.ui.components.PaperRow
import app.folio.ui.components.PillButton
import app.folio.ui.components.RowSkeleton
import app.folio.ui.components.SearchPill
import app.folio.ui.components.SectionHeader
import app.folio.ui.components.longDate
import app.folio.ui.components.today
import app.folio.ui.cover.COVER_RATIO
import app.folio.ui.cover.TopicCover
import app.folio.ui.theme.Folio

private const val SHELF = 10

@Composable
fun HomeScreen() {
    val app = LocalApp.current
    val home = app.graph.home
    val state by home.feed.state.collectAsState()
    val curiosity by home.curiosity.collectAsState()
    val settings by app.graph.store.settings.collectAsState()
    val library by app.graph.store.library.collectAsState()
    val savedIds = remember(library) { library.map { it.paper.id }.toSet() }
    val pad = if (app.wide) 36.dp else 20.dp
    val listState = rememberLazyListState()
    var query by rememberSaveable { mutableStateOf("") }

    InfiniteScroll(listState, state, home.feed::loadMore)

    LazyColumn(state = listState, modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 32.dp)) {
        item(key = "hero") {
            Box {
                // Beige band behind the header, ending halfway down the first shelf like the reference.
                Box(
                    Modifier.matchParentSize().padding(bottom = 150.dp, end = if (app.wide) 0.dp else 0.dp)
                        .clip(RoundedCornerShape(bottomStart = 56.dp))
                        .background(Folio.colors.band),
                )
                Column(Modifier.windowInsetsPadding(WindowInsets.statusBars)) {
                    Row(Modifier.padding(start = pad, end = pad - 8.dp, top = 24.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(longDate(today()).uppercase(), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.secondary)
                            Spacer(Modifier.height(2.dp))
                            Text("Discover", style = if (app.wide) MaterialTheme.typography.displayMedium else MaterialTheme.typography.displaySmall)
                        }
                        if (!app.wide) {
                            IconButton(onClick = { app.nav.push(Screen.Settings) }) { Icon(Icons.Outlined.Settings, "Settings") }
                        }
                    }
                    Spacer(Modifier.height(16.dp))
                    SearchPill(
                        value = query,
                        onValueChange = { query = it },
                        onSearch = {
                            if (query.isNotBlank()) {
                                app.graph.search.submit(query)
                                app.nav.reset(Screen.Search)
                            }
                        },
                        modifier = Modifier.padding(horizontal = pad).then(if (app.wide) Modifier.width(560.dp) else Modifier),
                    )
                    Spacer(Modifier.height(28.dp))
                    SectionHeader(
                        "Fresh for you",
                        subtitle = if (settings.interests.isEmpty()) null else "Newest open papers on ${settings.interests.size} interests",
                        action = "View all",
                        onAction = { app.nav.push(Screen.ForYou) },
                        modifier = Modifier.padding(horizontal = pad),
                    )
                    Spacer(Modifier.height(14.dp))
                    FreshShelf(state, app, pad)
                }
            }
        }

        item(key = "interests") {
            Spacer(Modifier.height(30.dp))
            SectionHeader(
                "Your interests", subtitle = "Tap one to see only that",
                action = "Edit", onAction = { app.nav.reset(Screen.Interests) },
                modifier = Modifier.padding(horizontal = pad),
            )
            Spacer(Modifier.height(12.dp))
            LazyRow(contentPadding = PaddingValues(horizontal = pad - 4.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                items(settings.interests, key = { it.id }) { topic ->
                    InterestTile(topic) { app.nav.push(Screen.TopicFeed(topic)) }
                }
                item { AddInterestTile { app.nav.reset(Screen.Interests) } }
            }
        }

        item(key = "curiosity") {
            Spacer(Modifier.height(30.dp))
            Column(
                Modifier.padding(horizontal = pad).fillMaxWidth().clip(RoundedCornerShape(28.dp))
                    .background(if (Folio.colors.dark) MaterialTheme.colorScheme.surfaceContainerHigh else androidx.compose.ui.graphics.Color(0xFFF2E3F7))
                    .padding(vertical = 20.dp),
            ) {
                Row(Modifier.padding(horizontal = 20.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("WANDER OFF THE MAP", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.tertiary)
                        Text("Curiosity shelf", style = MaterialTheme.typography.headlineSmall)
                        Text(
                            "Papers from outside your interests, new every day: " + curiosity.topics.joinToString(", "),
                            style = MaterialTheme.typography.bodySmall, color = Folio.colors.muted, maxLines = 2, overflow = TextOverflow.Ellipsis,
                        )
                    }
                    Spacer(Modifier.width(8.dp))
                    PillButton("Shuffle", onClick = home::shuffle, leading = Icons.Outlined.Shuffle)
                }
                Spacer(Modifier.height(14.dp))
                LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    items(curiosity.picks, key = { "c" + it.paper.id }) { pick ->
                        BookCard(pick.paper, onClick = { app.open(pick.paper) }, width = 138.dp, label = pick.topic)
                    }
                    if (curiosity.loading) items(if (curiosity.picks.isEmpty()) 4 else 1) { CoverSkeleton(width = 138.dp) }
                    if (!curiosity.loading && curiosity.picks.isEmpty()) item {
                        Text("Couldn't reach the libraries. Try Shuffle in a moment.", style = MaterialTheme.typography.bodyMedium, color = Folio.colors.muted, modifier = Modifier.padding(16.dp))
                    }
                }
            }
        }

        item(key = "latest-header") {
            Spacer(Modifier.height(30.dp))
            SectionHeader("More new papers", subtitle = "From arXiv, Europe PMC and OpenAlex", modifier = Modifier.padding(horizontal = pad))
            Spacer(Modifier.height(12.dp))
        }
        paperList(state.papers.drop(SHELF), savedIds, app, pad, columns = if (app.wide) 2 else 1)
        feedFooter(state, pad, onRetry = home::refresh)
    }
}

@Composable
private fun FreshShelf(state: FeedUiState, app: AppScope, pad: androidx.compose.ui.unit.Dp) {
    val width = if (app.wide) 168.dp else 140.dp
    when {
        state.loading -> LazyRow(contentPadding = PaddingValues(horizontal = pad - 4.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            items(6) { CoverSkeleton(width = width) }
        }
        state.papers.isEmpty() && state.started -> EmptyState(
            Icons.Outlined.CloudOff, "Nothing came back",
            state.problems.joinToString("\n").ifBlank { "Try again in a moment." },
            action = { PillButton("Try again", onClick = app.graph.home::refresh, leading = Icons.Outlined.Refresh) },
        )
        !state.started -> EmptyState(Icons.Outlined.Explore, "Follow something", "Pick a few interests and fresh papers will appear here.",
            action = { PillButton("Choose interests", onClick = { app.nav.reset(Screen.Interests) }) })
        else -> LazyRow(contentPadding = PaddingValues(horizontal = pad - 4.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            items(state.papers.take(SHELF), key = { it.id }) { paper ->
                BookCard(paper, onClick = { app.open(paper) }, width = width)
            }
        }
    }
}

/** Interest tile in the style of the reference's categories: a cover standing on a soft plinth. */
@Composable
fun InterestTile(topic: Topic, width: androidx.compose.ui.unit.Dp = 150.dp, onClick: () -> Unit) {
    Column(Modifier.width(width).clip(RoundedCornerShape(16.dp)).clickable(onClick = onClick), horizontalAlignment = Alignment.CenterHorizontally) {
        Box(Modifier.fillMaxWidth().height(width * 0.86f), contentAlignment = Alignment.BottomCenter) {
            Box(Modifier.fillMaxWidth().height(width * 0.42f).clip(RoundedCornerShape(16.dp)).background(Folio.colors.chip))
            TopicCover(topic, Modifier.width(width * 0.5f).padding(bottom = 10.dp), showTitle = false)
        }
        Spacer(Modifier.height(8.dp))
        Text(topic.name, style = MaterialTheme.typography.titleSmall, textAlign = TextAlign.Center, maxLines = 2, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun AddInterestTile(onClick: () -> Unit) {
    Column(Modifier.width(150.dp).clip(RoundedCornerShape(16.dp)).clickable(onClick = onClick), horizontalAlignment = Alignment.CenterHorizontally) {
        Box(Modifier.fillMaxWidth().height(129.dp), contentAlignment = Alignment.BottomCenter) {
            Box(Modifier.fillMaxWidth().height(63.dp).clip(RoundedCornerShape(16.dp)).background(Folio.colors.chip))
            Box(
                Modifier.width(75.dp).height(75.dp / COVER_RATIO).padding(bottom = 10.dp).clip(RoundedCornerShape(10.dp))
                    .background(MaterialTheme.colorScheme.surfaceContainerHighest),
                contentAlignment = Alignment.Center,
            ) { Icon(Icons.Outlined.Add, null, tint = Folio.colors.muted, modifier = Modifier.size(28.dp)) }
        }
        Spacer(Modifier.height(8.dp))
        Text("Add your own", style = MaterialTheme.typography.titleSmall, color = Folio.colors.muted)
    }
}

/** PaperRows, in one or more columns. */
fun LazyListScope.paperList(papers: List<Paper>, savedIds: Set<String>, app: AppScope, pad: androidx.compose.ui.unit.Dp, columns: Int = 1) {
    val rows = papers.chunked(columns)
    items(rows, key = { row -> "row-" + row.first().id }) { row ->
        Row(Modifier.padding(horizontal = pad, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            row.forEach { paper ->
                PaperRow(
                    paper, saved = paper.id in savedIds,
                    onClick = { app.open(paper) },
                    onToggleSave = { app.graph.store.toggleSaved(paper) },
                    modifier = Modifier.weight(1f),
                )
            }
            repeat(columns - row.size) { Spacer(Modifier.weight(1f)) }
        }
    }
}

fun LazyListScope.feedFooter(state: FeedUiState, pad: androidx.compose.ui.unit.Dp, onRetry: () -> Unit) {
    if (state.loading) {
        items(3) { RowSkeleton(Modifier.padding(horizontal = pad, vertical = 6.dp)) }
    }
    item(key = "footer") {
        Box(Modifier.fillMaxWidth().padding(vertical = 20.dp, horizontal = pad), contentAlignment = Alignment.Center) {
            when {
                state.loadingMore -> CircularProgressIndicator(Modifier.size(24.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.secondary)
                state.problems.isNotEmpty() -> Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(state.problems.joinToString("\n"), style = MaterialTheme.typography.bodySmall, color = Folio.colors.muted, textAlign = TextAlign.Center)
                    if (state.papers.isEmpty()) { Spacer(Modifier.height(8.dp)); PillButton("Try again", onClick = onRetry, leading = Icons.Outlined.Refresh) }
                }
                state.endReached && state.papers.isNotEmpty() -> Text("You've reached the end", style = MaterialTheme.typography.bodySmall, color = Folio.colors.muted)
            }
        }
    }
}

/** Loads the next page when the list nears its end. */
@Composable
fun InfiniteScroll(listState: androidx.compose.foundation.lazy.LazyListState, state: FeedUiState, loadMore: () -> Unit) {
    val nearEnd by remember {
        derivedStateOf {
            val info = listState.layoutInfo
            val last = info.visibleItemsInfo.lastOrNull()?.index ?: 0
            info.totalItemsCount > 0 && last >= info.totalItemsCount - 3
        }
    }
    LaunchedEffect(nearEnd, state.papers.size) {
        if (nearEnd && state.papers.isNotEmpty()) loadMore()
    }
}
