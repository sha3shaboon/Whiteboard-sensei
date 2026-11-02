package com.folio.papers.ui.topics

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.folio.papers.AppContainer
import com.folio.papers.data.Topics
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

/** Topic picker, used both for first-run onboarding and for editing followed topics later. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun TopicsScreen(container: AppContainer, firstRun: Boolean, onDone: () -> Unit) {
    var chosen by rememberSaveable { mutableStateOf<Set<String>?>(null) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(Unit) {
        if (chosen == null) chosen = container.library.topics.first().map { it.id }.toSet()
    }
    TopicsContent(
        picked = chosen ?: emptySet(),
        firstRun = firstRun,
        onToggle = { id -> val c = chosen ?: emptySet(); chosen = if (id in c) c - id else c + id },
        onConfirm = { scope.launch { container.library.setTopics(chosen ?: emptySet()); onDone() } },
        onBack = onDone,
    )
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun TopicsContent(picked: Set<String>, firstRun: Boolean, onToggle: (String) -> Unit, onConfirm: () -> Unit, onBack: () -> Unit) {
    Box(Modifier.fillMaxSize()) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).statusBarsPadding()
                .padding(horizontal = 22.dp).padding(bottom = 120.dp),
        ) {
            if (!firstRun) {
                IconButton(onClick = onBack, modifier = Modifier.padding(top = 4.dp)) {
                    Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Back")
                }
            } else {
                Spacer(Modifier.height(48.dp))
                Text("FOLIO", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
            }
            Spacer(Modifier.height(10.dp))
            Text(
                if (firstRun) "What do you\nlove to read?" else "Your topics",
                style = MaterialTheme.typography.displaySmall,
            )
            Spacer(Modifier.height(10.dp))
            Text(
                "Pick a few fields. Folio gathers the newest open papers on them from arXiv, Europe PMC and OpenAlex.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            Topics.fields.forEach { field ->
                Spacer(Modifier.height(28.dp))
                Text(field.uppercase(), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(10.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Topics.all.filter { it.field == field }.forEach { topic ->
                        val on = topic.id in picked
                        FilterChip(
                            selected = on,
                            onClick = { onToggle(topic.id) },
                            label = { Text(topic.name) },
                            leadingIcon = if (on) {
                                { Icon(Icons.Outlined.Check, null, Modifier.size(FilterChipDefaults.IconSize)) }
                            } else null,
                            shape = RoundedCornerShape(12.dp),
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = MaterialTheme.colorScheme.primaryContainer,
                                selectedLabelColor = MaterialTheme.colorScheme.onPrimaryContainer,
                                selectedLeadingIconColor = MaterialTheme.colorScheme.onPrimaryContainer,
                            ),
                        )
                    }
                }
            }
        }

        Surface(
            modifier = Modifier.align(androidx.compose.ui.Alignment.BottomCenter).fillMaxWidth(),
            color = MaterialTheme.colorScheme.background,
        ) {
            Button(
                onClick = onConfirm,
                enabled = picked.isNotEmpty(),
                modifier = Modifier.navigationBarsPadding().padding(16.dp).fillMaxWidth().height(56.dp),
                shape = RoundedCornerShape(18.dp),
            ) {
                Text(
                    when {
                        picked.isEmpty() -> "Pick at least one topic"
                        firstRun -> "Start reading · ${picked.size} topics"
                        else -> "Save · ${picked.size} topics"
                    },
                )
            }
        }
    }
}
