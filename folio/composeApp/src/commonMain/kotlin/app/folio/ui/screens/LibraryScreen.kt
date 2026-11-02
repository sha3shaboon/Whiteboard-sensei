package app.folio.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.BookmarkBorder
import androidx.compose.material.icons.outlined.CloudDownload
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.folio.LocalApp
import app.folio.ui.Screen
import app.folio.ui.components.BookCard
import app.folio.ui.components.EmptyState
import app.folio.ui.components.PillButton
import app.folio.ui.components.ScreenTitle

private enum class Shelf(val label: String) { ALL("All"), UNREAD("To read"), READ("Read"), OFFLINE("Offline") }

@Composable
fun LibraryScreen(offlineOnly: Boolean) {
    val app = LocalApp.current
    val library by app.graph.store.library.collectAsState()
    var shelf by rememberSaveable { mutableStateOf(if (offlineOnly) Shelf.OFFLINE else Shelf.ALL) }
    val pad = if (app.wide) 36.dp else 20.dp
    val shown = when (shelf) {
        Shelf.ALL -> library
        Shelf.UNREAD -> library.filterNot { it.read }
        Shelf.READ -> library.filter { it.read }
        Shelf.OFFLINE -> library.filter { it.downloaded }
    }

    LazyVerticalGrid(
        columns = GridCells.Adaptive(if (app.wide) 160.dp else 140.dp),
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = pad - 4.dp, end = pad - 4.dp, bottom = 32.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        item(span = { GridItemSpan(maxLineSpan) }) {
            Column(Modifier.windowInsetsPadding(WindowInsets.statusBars).padding(top = 24.dp, start = 4.dp, end = 4.dp)) {
                ScreenTitle(
                    "My Library",
                    kicker = "${library.size} saved · ${library.count { !it.read }} to read · ${library.count { it.downloaded }} offline",
                    trailing = if (!app.wide) ({ IconButton(onClick = { app.nav.push(Screen.Settings) }) { Icon(Icons.Outlined.Settings, "Settings") } }) else null,
                )
                Spacer(Modifier.height(16.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Shelf.entries.forEach { s -> PillButton(s.label, onClick = { shelf = s }, selected = shelf == s) }
                }
            }
        }
        if (shown.isEmpty()) {
            item(span = { GridItemSpan(maxLineSpan) }) {
                if (shelf == Shelf.OFFLINE) {
                    EmptyState(Icons.Outlined.CloudDownload, "Nothing offline yet", "Open a paper and tap Download to keep its PDF on this device and read it anywhere.")
                } else {
                    EmptyState(Icons.Outlined.BookmarkBorder, if (library.isEmpty()) "Your shelf is empty" else "Nothing on this shelf", "Tap the bookmark on any paper to keep it here.")
                }
            }
        }
        items(shown, key = { it.paper.id }) { item ->
            BookCard(
                item.paper, onClick = { app.open(item.paper) }, width = null,
                downloaded = item.downloaded, read = item.read,
            )
        }
    }
}
