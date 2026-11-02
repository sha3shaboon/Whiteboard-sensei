package app.folio.ui.screens

import androidx.compose.foundation.background
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
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import app.folio.LocalApp
import app.folio.data.Topic
import app.folio.ui.components.PillButton
import app.folio.ui.cover.Field
import app.folio.ui.cover.TopicCover
import app.folio.ui.theme.Folio

/** Newest papers on one topic, or on everything followed when [topic] is null ("For you"). */
@Composable
fun TopicFeedScreen(topic: Topic?) {
    val app = LocalApp.current
    val settings by app.graph.store.settings.collectAsState()
    val controller = remember(topic) { if (topic == null) app.graph.home.feed else app.graph.topicFeed(topic) }
    val state by controller.state.collectAsState()
    val library by app.graph.store.library.collectAsState()
    val savedIds = remember(library) { library.map { it.paper.id }.toSet() }
    val pad = if (app.wide) 36.dp else 20.dp
    val listState = rememberLazyListState()
    InfiniteScroll(listState, state, controller::loadMore)

    LazyColumn(state = listState, modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 32.dp)) {
        item {
            Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(bottomStart = 48.dp)).background(Folio.colors.band)) {
                Column(Modifier.windowInsetsPadding(WindowInsets.statusBars).padding(start = pad - 12.dp, end = pad, top = 12.dp, bottom = 24.dp)) {
                    IconButton(onClick = { app.nav.pop() }) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Back") }
                    Row(Modifier.padding(start = 12.dp, top = 8.dp), verticalAlignment = Alignment.Bottom) {
                        if (topic != null) {
                            TopicCover(topic, Modifier.width(if (app.wide) 120.dp else 92.dp), showTitle = false)
                            Spacer(Modifier.width(20.dp))
                        }
                        Column(Modifier.weight(1f)) {
                            Text(
                                (topic?.let { if (it.custom) "Your own interest" else Field.of(it).label } ?: "${settings.interests.size} interests").uppercase(),
                                style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.secondary,
                            )
                            Text(topic?.name ?: "Fresh for you", style = MaterialTheme.typography.displaySmall)
                            Text("Newest open papers, last 60 days", style = MaterialTheme.typography.bodySmall, color = Folio.colors.muted)
                            if (topic != null) {
                                Spacer(Modifier.height(10.dp))
                                val following = settings.interests.any { it.id == topic.id }
                                PillButton(
                                    if (following) "Following" else "Follow",
                                    selected = following,
                                    leading = if (following) Icons.Outlined.Check else Icons.Outlined.Add,
                                    onClick = { if (following) app.graph.store.unfollow(topic.id) else app.graph.store.follow(topic) },
                                )
                            }
                        }
                    }
                }
            }
            Spacer(Modifier.height(16.dp))
        }
        paperList(state.papers, savedIds, app, pad, columns = if (app.wide) 2 else 1)
        feedFooter(state, pad, onRetry = { if (topic == null) app.graph.home.refresh() })
    }
}
