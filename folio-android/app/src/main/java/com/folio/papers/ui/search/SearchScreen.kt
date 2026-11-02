package com.folio.papers.ui.search

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AssistChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.SuggestionChip
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.folio.papers.AppContainer
import com.folio.papers.data.Paper
import com.folio.papers.ui.components.FeedController
import com.folio.papers.ui.components.PaperFeed
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

class SearchViewModel(private val container: AppContainer) : ViewModel() {
    val feed = FeedController(viewModelScope)
    val query = MutableStateFlow("")
    val recent = MutableStateFlow<List<String>>(emptyList())
    val savedIds = container.library.saved.map { list -> list.map { it.paper.id }.toSet() }
        .stateIn(viewModelScope, SharingStarted.Eagerly, emptySet())

    fun onQueryChange(value: String) {
        query.value = value
        if (value.isBlank()) feed.clear()
    }

    fun submit(text: String = query.value) {
        val q = text.trim()
        if (q.isEmpty()) return
        query.value = q
        recent.update { (listOf(q) + it.filterNot { r -> r.equals(q, ignoreCase = true) }).take(6) }
        feed.start(container.repository.search(q))
    }

    fun toggleSave(paper: Paper) = viewModelScope.launch { container.library.toggleSaved(paper) }
}

private val ideas = listOf(
    "CRISPR base editing", "dark matter", "sparse autoencoders", "sleep and memory", "room-temperature superconductor",
    "gut-brain axis", "protein folding", "black hole imaging", "carbon capture", "mixture of experts",
)

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SearchScreen(vm: SearchViewModel, onOpen: (Paper) -> Unit, contentPadding: PaddingValues) {
    val state by vm.feed.state.collectAsStateWithLifecycle()
    val query by vm.query.collectAsStateWithLifecycle()
    val recent by vm.recent.collectAsStateWithLifecycle()
    val savedIds by vm.savedIds.collectAsStateWithLifecycle()
    val focus = LocalFocusManager.current

    Column(Modifier.fillMaxSize().padding(top = contentPadding.calculateTopPadding())) {
        Column(Modifier.padding(start = 20.dp, end = 20.dp, top = 24.dp, bottom = 8.dp)) {
            Text("Search", style = MaterialTheme.typography.displaySmall)
            Spacer(Modifier.height(14.dp))
            OutlinedTextField(
                value = query,
                onValueChange = vm::onQueryChange,
                modifier = Modifier.fillMaxWidth(),
                placeholder = { Text("Topics, titles, authors…") },
                leadingIcon = { Icon(Icons.Outlined.Search, null) },
                trailingIcon = {
                    if (query.isNotEmpty()) {
                        IconButton(onClick = { vm.onQueryChange("") }) { Icon(Icons.Outlined.Close, "Clear") }
                    }
                },
                singleLine = true,
                shape = RoundedCornerShape(18.dp),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(onSearch = { vm.submit(); focus.clearFocus() }),
                colors = OutlinedTextFieldDefaults.colors(
                    unfocusedContainerColor = MaterialTheme.colorScheme.surfaceContainerLow,
                    focusedContainerColor = MaterialTheme.colorScheme.surfaceContainerLow,
                    unfocusedBorderColor = MaterialTheme.colorScheme.outlineVariant,
                ),
            )
        }

        if (!state.started) {
            Column(
                Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 12.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                if (recent.isNotEmpty()) {
                    SectionLabel("Recent")
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        recent.forEach { r ->
                            AssistChip(
                                onClick = { vm.submit(r); focus.clearFocus() },
                                label = { Text(r) },
                                leadingIcon = { Icon(Icons.Outlined.History, null, Modifier.height(AssistChipDefaults.IconSize)) },
                            )
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                }
                SectionLabel("Try something new")
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    ideas.forEach { idea ->
                        SuggestionChip(onClick = { vm.submit(idea); focus.clearFocus() }, label = { Text(idea) })
                    }
                }
                Spacer(Modifier.height(8.dp))
                Text(
                    "Searches arXiv, Europe PMC and OpenAlex together. Only open-access papers are shown.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        } else {
            PaperFeed(
                state = state,
                savedIds = savedIds,
                onOpen = onOpen,
                onToggleSave = vm::toggleSave,
                onLoadMore = vm.feed::loadMore,
                contentPadding = PaddingValues(top = 8.dp, bottom = contentPadding.calculateBottomPadding() + 16.dp),
            )
        }
    }
}

@Composable
private fun SectionLabel(text: String) {
    Text(text.uppercase(), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
}
