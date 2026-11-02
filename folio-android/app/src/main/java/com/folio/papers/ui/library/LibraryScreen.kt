package com.folio.papers.ui.library

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.BookmarkBorder
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Text
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.folio.papers.AppContainer
import com.folio.papers.data.Paper
import com.folio.papers.data.SavedPaper
import com.folio.papers.ui.components.EmptyState
import com.folio.papers.ui.components.PaperCard
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class LibraryViewModel(private val container: AppContainer) : ViewModel() {
    val saved = container.library.saved.stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    fun remove(item: SavedPaper) = viewModelScope.launch { container.library.remove(item.paper.id) }
    fun restore(item: SavedPaper) = viewModelScope.launch { container.library.restore(item) }
    fun toggleSave(paper: Paper) = viewModelScope.launch { container.library.toggleSaved(paper) }
}

private enum class Shelf(val label: String) { ALL("All"), UNREAD("To read"), READ("Read") }

@Composable
fun LibraryScreen(
    vm: LibraryViewModel,
    onOpen: (Paper) -> Unit,
    onSettings: () -> Unit,
    snackbar: SnackbarHostState,
    contentPadding: PaddingValues,
) {
    val saved by vm.saved.collectAsStateWithLifecycle()
    var shelf by rememberSaveable { mutableStateOf(Shelf.ALL) }
    val scope = rememberCoroutineScope()
    val shown = when (shelf) {
        Shelf.ALL -> saved
        Shelf.UNREAD -> saved.filterNot { it.read }
        Shelf.READ -> saved.filter { it.read }
    }

    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(
            top = contentPadding.calculateTopPadding(),
            bottom = contentPadding.calculateBottomPadding() + 16.dp,
        ),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item(key = "header") {
            Column(Modifier.padding(start = 20.dp, end = 8.dp, top = 24.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(
                            "${saved.size} SAVED · ${saved.count { !it.read }} TO READ",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.primary,
                        )
                        Spacer(Modifier.height(6.dp))
                        Text("Library", style = MaterialTheme.typography.displaySmall)
                    }
                    IconButton(onClick = onSettings) { Icon(Icons.Outlined.Settings, "Settings") }
                }
                Spacer(Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Shelf.entries.forEach { s ->
                        FilterChip(selected = shelf == s, onClick = { shelf = s }, label = { Text(s.label) })
                    }
                }
            }
        }

        if (shown.isEmpty()) {
            item {
                EmptyState(
                    icon = Icons.Outlined.BookmarkBorder,
                    title = if (saved.isEmpty()) "Your shelf is empty" else "Nothing on this shelf",
                    body = if (saved.isEmpty()) "Tap the bookmark on any paper to keep it here, even offline."
                    else "Mark papers as read from their page.",
                )
            }
        }

        items(shown, key = { it.paper.id }) { item ->
            val dismiss = rememberSwipeToDismissBoxState(
                confirmValueChange = { value ->
                    if (value != SwipeToDismissBoxValue.Settled) {
                        vm.remove(item)
                        scope.launch {
                            val result = snackbar.showSnackbar("Removed from library", actionLabel = "Undo", withDismissAction = true)
                            if (result == SnackbarResult.ActionPerformed) vm.restore(item)
                        }
                        true
                    } else false
                },
            )
            SwipeToDismissBox(
                state = dismiss,
                modifier = Modifier.padding(horizontal = 16.dp).animateItem(),
                backgroundContent = {
                    Box(
                        Modifier.fillMaxSize().clip(RoundedCornerShape(22.dp))
                            .background(MaterialTheme.colorScheme.errorContainer)
                            .padding(horizontal = 24.dp),
                        contentAlignment = if (dismiss.dismissDirection == SwipeToDismissBoxValue.StartToEnd) Alignment.CenterStart else Alignment.CenterEnd,
                    ) {
                        Icon(Icons.Outlined.Delete, "Remove", tint = MaterialTheme.colorScheme.onErrorContainer)
                    }
                },
            ) {
                PaperCard(
                    paper = item.paper,
                    saved = true,
                    read = item.read,
                    onClick = { onOpen(item.paper) },
                    onToggleSave = { vm.toggleSave(item.paper) },
                )
            }
        }
    }
}
