package com.folio.papers.ui.discover

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.folio.papers.AppContainer
import com.folio.papers.data.Paper
import com.folio.papers.data.Topic
import com.folio.papers.ui.components.FeedController
import com.folio.papers.ui.components.FeedUiState
import com.folio.papers.ui.components.PaperFeed
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

class DiscoverViewModel(private val container: AppContainer) : ViewModel() {
    val feed = FeedController(viewModelScope)
    val topics = container.library.topics.stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())
    val savedIds = container.library.saved.map { list -> list.map { it.paper.id }.toSet() }
        .stateIn(viewModelScope, SharingStarted.Eagerly, emptySet())

    /** null means "For you": every followed topic at once. */
    val selected = MutableStateFlow<String?>(null)

    init {
        viewModelScope.launch {
            combine(container.library.topics, selected) { all, sel -> all to sel }
                .distinctUntilChanged()
                .collect { (all, sel) -> reload(all, sel) }
        }
    }

    fun select(id: String?) {
        selected.value = id
    }

    fun refresh() = reload(topics.value, selected.value)

    fun toggleSave(paper: Paper) = viewModelScope.launch { container.library.toggleSaved(paper) }

    private fun reload(all: List<Topic>, sel: String?) {
        if (all.isEmpty()) return feed.clear()
        val chosen = all.firstOrNull { it.id == sel }?.let(::listOf) ?: all
        feed.start(container.repository.latest(chosen))
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DiscoverScreen(
    vm: DiscoverViewModel,
    onOpen: (Paper) -> Unit,
    onEditTopics: () -> Unit,
    contentPadding: PaddingValues,
) {
    val state by vm.feed.state.collectAsStateWithLifecycle()
    val topics by vm.topics.collectAsStateWithLifecycle()
    val selected by vm.selected.collectAsStateWithLifecycle()
    val savedIds by vm.savedIds.collectAsStateWithLifecycle()
    DiscoverContent(
        state, topics, selected, savedIds,
        onSelect = vm::select, onRefresh = vm::refresh, onLoadMore = vm.feed::loadMore,
        onOpen = onOpen, onToggleSave = { vm.toggleSave(it) }, onEditTopics = onEditTopics,
        contentPadding = contentPadding,
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DiscoverContent(
    state: FeedUiState,
    topics: List<Topic>,
    selected: String?,
    savedIds: Set<String>,
    onSelect: (String?) -> Unit,
    onRefresh: () -> Unit,
    onLoadMore: () -> Unit,
    onOpen: (Paper) -> Unit,
    onToggleSave: (Paper) -> Unit,
    onEditTopics: () -> Unit,
    contentPadding: PaddingValues,
    today: LocalDate = LocalDate.now(),
) {
    var pulled by remember { mutableStateOf(false) }
    LaunchedEffect(state.loading) { if (!state.loading) pulled = false }

    PullToRefreshBox(
        isRefreshing = pulled && state.loading,
        onRefresh = { pulled = true; onRefresh() },
        modifier = Modifier.padding(top = contentPadding.calculateTopPadding()),
    ) {
        PaperFeed(
            state = state,
            savedIds = savedIds,
            onOpen = onOpen,
            onToggleSave = onToggleSave,
            onLoadMore = onLoadMore,
            contentPadding = PaddingValues(bottom = contentPadding.calculateBottomPadding() + 16.dp),
        ) {
            item(key = "header") {
                Column(Modifier.padding(start = 20.dp, end = 20.dp, top = 24.dp)) {
                    Text(
                        today.format(DateTimeFormatter.ofPattern("EEEE, d MMMM", Locale.getDefault())).uppercase(),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.primary,
                    )
                    Spacer(Modifier.height(6.dp))
                    Text("Discover", style = MaterialTheme.typography.displaySmall)
                    Spacer(Modifier.height(4.dp))
                    Text(
                        "The newest open papers on what you follow",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            item(key = "chips") {
                TopicChips(topics, selected, onSelect = onSelect, onEditTopics = onEditTopics)
            }
        }
    }
}

@Composable
private fun TopicChips(
    topics: List<Topic>,
    selected: String?,
    onSelect: (String?) -> Unit,
    onEditTopics: () -> Unit,
) {
    val colors = FilterChipDefaults.filterChipColors(
        selectedContainerColor = MaterialTheme.colorScheme.primary,
        selectedLabelColor = MaterialTheme.colorScheme.onPrimary,
        selectedLeadingIconColor = MaterialTheme.colorScheme.onPrimary,
    )
    LazyRow(
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        item {
            FilterChip(
                selected = selected == null,
                onClick = { onSelect(null) },
                label = { Text("For you") },
                leadingIcon = { Icon(Icons.Outlined.AutoAwesome, null) },
                colors = colors,
            )
        }
        items(topics, key = { it.id }) { topic ->
            FilterChip(
                selected = selected == topic.id,
                onClick = { onSelect(topic.id) },
                label = { Text(topic.name) },
                colors = colors,
            )
        }
        item {
            FilterChip(
                selected = false,
                onClick = onEditTopics,
                label = { Text("Topics") },
                leadingIcon = { Icon(Icons.Outlined.Add, null) },
            )
        }
    }
}
