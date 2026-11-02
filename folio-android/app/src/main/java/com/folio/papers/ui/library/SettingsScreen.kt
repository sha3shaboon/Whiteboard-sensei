package com.folio.papers.ui.library

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.folio.papers.AppContainer
import com.folio.papers.data.Source
import com.folio.papers.ui.components.SourceTag
import com.folio.papers.ui.components.openInBrowser
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

@Composable
fun SettingsScreen(container: AppContainer, onBack: () -> Unit, onEditTopics: () -> Unit) {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val toolbar = MaterialTheme.colorScheme.surface
    var key by remember { mutableStateOf("") }
    var savedKey by remember { mutableStateOf("") }
    LaunchedEffect(Unit) { key = container.library.openAlexApiKey.first(); savedKey = key }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).statusBarsPadding().padding(horizontal = 22.dp)) {
        IconButton(onClick = onBack, modifier = Modifier.padding(top = 4.dp)) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Back") }
        Spacer(Modifier.height(10.dp))
        Text("Settings", style = MaterialTheme.typography.displaySmall)
        Spacer(Modifier.height(20.dp))

        ListItem(
            headlineContent = { Text("Followed topics") },
            supportingContent = { Text("Choose what Discover shows") },
            trailingContent = { Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, null) },
            colors = ListItemDefaults.colors(containerColor = MaterialTheme.colorScheme.surface),
            modifier = Modifier.clickable(onClick = onEditTopics),
        )

        Spacer(Modifier.height(12.dp))
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        Spacer(Modifier.height(20.dp))

        Text("OPENALEX KEY", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.height(8.dp))
        Text(
            "Optional. Without a key, OpenAlex shares a small daily budget per network. A free key gives you your own.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = key,
            onValueChange = { key = it },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            placeholder = { Text("Paste API key") },
            visualTransformation = PasswordVisualTransformation(),
            shape = RoundedCornerShape(16.dp),
        )
        TextButton(
            onClick = { scope.launch { container.library.setOpenAlexKey(key); savedKey = key.trim() } },
            enabled = key.trim() != savedKey,
        ) { Text("Save key") }
        TextButton(onClick = { openInBrowser(context, "https://help.openalex.org/api/authentication/", toolbar) }) {
            Text("How to get a free key")
        }

        Spacer(Modifier.height(12.dp))
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        Spacer(Modifier.height(20.dp))

        Text("SOURCES", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.height(12.dp))
        SourceRow(Source.ARXIV, "Preprints in physics, maths, computer science, quantitative biology and economics.")
        SourceRow(Source.EUROPE_PMC, "Open-access life-science and biomedical research, including preprints.")
        SourceRow(Source.OPENALEX, "An open catalogue of scholarly works across every field.")
        Spacer(Modifier.height(32.dp))
    }
}

@Composable
private fun SourceRow(source: Source, text: String) {
    Column(Modifier.padding(bottom = 16.dp)) {
        SourceTag(source)
        Spacer(Modifier.height(4.dp))
        Text(text, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
