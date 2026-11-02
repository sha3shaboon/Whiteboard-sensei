package app.folio.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import app.folio.LocalApp
import app.folio.data.ThemeMode
import app.folio.toast
import app.folio.ui.components.PillButton
import app.folio.ui.components.ScreenTitle
import app.folio.ui.components.formatBytes
import app.folio.ui.theme.Folio

@Composable
fun SettingsScreen() {
    val app = LocalApp.current
    val store = app.graph.store
    val settings by store.settings.collectAsState()
    val library by store.library.collectAsState()
    var key by remember { mutableStateOf(settings.openAlexKey) }
    val pad = if (app.wide) 36.dp else 20.dp

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).windowInsetsPadding(WindowInsets.statusBars).padding(horizontal = pad, vertical = 24.dp).widthIn(max = 720.dp)) {
        if (app.nav.canGoBack) IconButton(onClick = { app.nav.pop() }) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Back") }
        ScreenTitle("Settings")
        Spacer(Modifier.height(20.dp))

        Card("Appearance") {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ThemeMode.entries.forEach { mode ->
                    PillButton(mode.name.lowercase().replaceFirstChar { it.uppercase() }, onClick = { store.setTheme(mode) }, selected = settings.theme == mode)
                }
            }
        }

        Card("Offline papers") {
            val count = library.count { it.downloaded }
            Text("$count papers on this device · ${formatBytes(app.graph.downloads.usedBytes())}", style = MaterialTheme.typography.bodyMedium)
            Text("Remove a download from the paper's page.", style = MaterialTheme.typography.bodySmall, color = Folio.colors.muted)
        }

        Card("OpenAlex key") {
            Text(
                "Optional. Without a key, OpenAlex shares a small daily budget across everyone on your network. A free key gives you your own.",
                style = MaterialTheme.typography.bodyMedium, color = Folio.colors.muted,
            )
            Spacer(Modifier.height(10.dp))
            OutlinedTextField(
                value = key, onValueChange = { key = it }, singleLine = true, placeholder = { Text("Paste API key") },
                visualTransformation = PasswordVisualTransformation(), shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth(),
            )
            Row {
                TextButton(onClick = { store.setOpenAlexKey(key); app.toast("Key saved") }, enabled = key.trim() != settings.openAlexKey) { Text("Save key") }
                TextButton(onClick = { app.graph.platform.openUrl("https://openalex.org/settings/api") }) { Text("Get a free key") }
            }
        }

        Card("Sources") {
            Text("arXiv: preprints in physics, maths, computer science, quantitative biology and economics.", style = MaterialTheme.typography.bodyMedium)
            Spacer(Modifier.height(6.dp))
            Text("Europe PMC: open-access life-science and biomedical research, including preprints.", style = MaterialTheme.typography.bodyMedium)
            Spacer(Modifier.height(6.dp))
            Text("OpenAlex: an open catalogue of scholarly works in every field.", style = MaterialTheme.typography.bodyMedium)
            Spacer(Modifier.height(6.dp))
            Text("Covers are generated from each paper's field and title; they're not publisher artwork.", style = MaterialTheme.typography.bodySmall, color = Folio.colors.muted)
        }
    }
}

@Composable
private fun Card(title: String, content: @Composable () -> Unit) {
    Surface(shape = RoundedCornerShape(20.dp), color = Folio.colors.card, modifier = Modifier.fillMaxWidth().padding(bottom = 14.dp)) {
        Column(Modifier.padding(20.dp)) {
            Text(title.uppercase(), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.secondary)
            Spacer(Modifier.height(10.dp))
            content()
        }
    }
}
