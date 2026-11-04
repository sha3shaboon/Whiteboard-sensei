package app.folio.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Bookmarks
import androidx.compose.material.icons.outlined.DownloadForOffline
import androidx.compose.material.icons.outlined.GridView
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.folio.LocalApp
import app.folio.ui.Screen
import app.folio.ui.Tab
import app.folio.ui.cover.CoverArt
import app.folio.ui.cover.Field
import app.folio.ui.theme.Folio

private data class NavItem(val label: String, val icon: ImageVector, val screen: Screen)

private val mainItems = listOf(
    NavItem("Discover", Icons.Outlined.Home, Screen.Home),
    NavItem("Search", Icons.Outlined.Search, Screen.Search),
    NavItem("Interests", Icons.Outlined.GridView, Screen.Interests),
    NavItem("My Library", Icons.Outlined.Bookmarks, Screen.Library()),
)

/** Desktop / tablet navigation, after the reference's white sidebar. */
@Composable
fun Sidebar() {
    val app = LocalApp.current
    val root = app.nav.stack.first().screen
    Surface(color = Folio.colors.card, modifier = Modifier.fillMaxHeight().width(232.dp)) {
        Column(Modifier.windowInsetsPadding(WindowInsets.safeDrawing).padding(horizontal = 22.dp, vertical = 28.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(28.dp).clip(RoundedCornerShape(8.dp)).background(MaterialTheme.colorScheme.primary), contentAlignment = Alignment.Center) {
                    Text("W", color = MaterialTheme.colorScheme.onPrimary, fontWeight = FontWeight.Bold, fontSize = 15.sp, style = MaterialTheme.typography.titleMedium)
                }
                Spacer(Modifier.width(10.dp))
                Text("WARAQ", style = MaterialTheme.typography.titleMedium, letterSpacing = 2.sp)
            }
            Spacer(Modifier.height(36.dp))
            Text("MENU", style = MaterialTheme.typography.labelSmall, color = Folio.colors.muted)
            Spacer(Modifier.height(12.dp))
            mainItems.forEach { item ->
                SideItem(item.label, item.icon, selected = root == item.screen) { app.nav.reset(item.screen) }
            }
            SideItem("Offline", Icons.Outlined.DownloadForOffline, selected = root == Screen.Library(offlineOnly = true)) {
                app.nav.reset(Screen.Library(offlineOnly = true))
            }
            Spacer(Modifier.height(12.dp))
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            Spacer(Modifier.height(12.dp))
            SideItem("Settings", Icons.Outlined.Settings, selected = root == Screen.Settings) { app.nav.reset(Screen.Settings) }
            Spacer(Modifier.weight(1f))
            WanderCard()
        }
    }
}

@Composable
private fun SideItem(label: String, icon: ImageVector, selected: Boolean, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable(onClick = onClick).padding(vertical = 8.dp, horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        NavIcon(icon, selected)
        Spacer(Modifier.width(14.dp))
        Text(
            label,
            style = MaterialTheme.typography.labelLarge,
            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
            color = if (selected) MaterialTheme.colorScheme.onBackground else Folio.colors.muted,
        )
    }
}

/** Rounded-square icon: orange when selected, soft grey otherwise. */
@Composable
private fun NavIcon(icon: ImageVector, selected: Boolean) {
    Box(
        Modifier.size(34.dp).clip(RoundedCornerShape(10.dp))
            .background(if (selected) Folio.colors.highlight else Folio.colors.chip),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, null, Modifier.size(18.dp), tint = if (selected) Folio.colors.onHighlight else Folio.colors.muted)
    }
}

/** The lilac card at the bottom of the sidebar: a shortcut to a fresh curiosity shelf. */
@Composable
private fun WanderCard() {
    val app = LocalApp.current
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).clickable {
            app.graph.home.shuffle(); app.nav.reset(Screen.Home)
        },
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        CoverArt(Field.MIND, seed = 7, title = null, footer = null, modifier = Modifier.width(96.dp), elevation = 0)
        Spacer(Modifier.height(10.dp))
        Text("WANDER", style = MaterialTheme.typography.labelSmall)
        Text("Surprise me with something new", style = MaterialTheme.typography.bodySmall, color = Folio.colors.muted, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
    }
}

/** Phone navigation. */
@Composable
fun BottomBar() {
    val app = LocalApp.current
    Surface(color = Folio.colors.card, shadowElevation = 12.dp) {
        Row(
            Modifier.fillMaxWidth().windowInsetsPadding(WindowInsets.navigationBars).padding(horizontal = 8.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.SpaceAround,
        ) {
            Tab.entries.zip(mainItems).forEach { (tab, item) ->
                val selected = app.nav.tab == tab
                Column(
                    Modifier.clip(RoundedCornerShape(14.dp)).clickable { app.nav.reset(tab.root) }.padding(horizontal = 10.dp, vertical = 4.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    NavIcon(item.icon, selected)
                    Spacer(Modifier.height(4.dp))
                    Text(
                        item.label.removePrefix("My "),
                        style = MaterialTheme.typography.labelMedium,
                        color = if (selected) MaterialTheme.colorScheme.onBackground else Folio.colors.muted,
                    )
                }
            }
        }
    }
}
