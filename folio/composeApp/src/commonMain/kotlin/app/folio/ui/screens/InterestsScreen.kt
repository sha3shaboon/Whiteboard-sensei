package app.folio.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.material3.LocalMinimumInteractiveComponentSize
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import app.folio.LocalApp
import app.folio.data.Curiosity
import app.folio.data.Topic
import app.folio.data.Topics
import app.folio.ui.Screen
import app.folio.ui.components.ScreenTitle
import app.folio.ui.components.today
import app.folio.ui.cover.Field
import app.folio.ui.cover.TopicCover
import app.folio.ui.theme.Folio

/** Follow anything: type your own interests, or pick from popular fields. Doubles as onboarding. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun InterestsScreen(onboarding: Boolean) {
    val app = LocalApp.current
    val store = app.graph.store
    val settings by store.settings.collectAsState()
    val interests = settings.interests
    val ids = interests.map { it.id }.toSet()
    val pad = if (app.wide) 36.dp else 20.dp
    var text by rememberSaveable { mutableStateOf("") }
    val suggestions = remember(interests.size) { Curiosity.pick(interests, seed = today().toEpochDays() + 7, count = 8) }

    fun addTyped() {
        // Commas let people add several at once: "coral reefs, sleep, Byzantine history".
        text.split(',', ';').map { it.trim() }.filter { it.length >= 2 }.forEach { store.follow(Topic.custom(it)) }
        text = ""
    }

    Box(Modifier.fillMaxSize()) {
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = if (onboarding) 120.dp else 32.dp)) {
            item {
                Column(Modifier.windowInsetsPadding(WindowInsets.statusBars).padding(start = pad, end = pad, top = if (onboarding) 48.dp else 24.dp)) {
                    if (onboarding) {
                        Text("WELCOME TO WARAQ", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.secondary)
                        Spacer(Modifier.height(6.dp))
                        Text("What are you\ncurious about?", style = MaterialTheme.typography.displaySmall)
                        Spacer(Modifier.height(10.dp))
                        Text(
                            "Type anything at all, or pick from the fields below. Waraq gathers the newest open papers on them from arXiv, Europe PMC and OpenAlex.",
                            style = MaterialTheme.typography.bodyMedium, color = Folio.colors.muted, modifier = Modifier.widthIn(max = 560.dp),
                        )
                    } else {
                        ScreenTitle("Interests", kicker = "${interests.size} followed")
                    }
                    Spacer(Modifier.height(20.dp))

                    // Free-text interest
                    Surface(shape = RoundedCornerShape(16.dp), color = Folio.colors.card, shadowElevation = if (Folio.colors.dark) 0.dp else 2.dp, modifier = if (app.wide) Modifier.widthIn(max = 640.dp) else Modifier.fillMaxWidth()) {
                        Row(Modifier.padding(6.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Outlined.AutoAwesome, null, Modifier.padding(start = 10.dp).size(18.dp), tint = MaterialTheme.colorScheme.secondary)
                            Box(Modifier.weight(1f).padding(horizontal = 10.dp)) {
                                if (text.isEmpty()) Text("Any topic: coral reefs, Byzantine history…", style = MaterialTheme.typography.bodyMedium, color = Folio.colors.muted, maxLines = 1)
                                BasicTextField(
                                    value = text, onValueChange = { text = it }, singleLine = true,
                                    textStyle = MaterialTheme.typography.bodyMedium.copy(color = MaterialTheme.colorScheme.onBackground),
                                    cursorBrush = SolidColor(MaterialTheme.colorScheme.secondary),
                                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                                    keyboardActions = KeyboardActions(onDone = { addTyped() }),
                                    modifier = Modifier.fillMaxWidth(),
                                )
                            }
                            Surface(onClick = ::addTyped, enabled = text.isNotBlank(), shape = RoundedCornerShape(10.dp), color = MaterialTheme.colorScheme.primary, contentColor = MaterialTheme.colorScheme.onPrimary) {
                                Row(Modifier.padding(horizontal = 14.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Icon(Icons.Outlined.Add, null, Modifier.size(16.dp)); Spacer(Modifier.width(4.dp))
                                    Text("Follow", style = MaterialTheme.typography.labelLarge)
                                }
                            }
                        }
                    }
                    Spacer(Modifier.height(10.dp))
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Ideas:", style = MaterialTheme.typography.labelMedium, color = Folio.colors.muted, modifier = Modifier.padding(top = 7.dp))
                        suggestions.forEach { idea ->
                            TopicChip(idea.replaceFirstChar { it.uppercase() }, selected = false, small = true) { store.follow(Topic.custom(idea)) }
                        }
                    }
                }
            }

            if (interests.isNotEmpty()) {
                item {
                    Column(Modifier.padding(start = pad, end = pad, top = 28.dp)) {
                        Text("YOU FOLLOW", style = MaterialTheme.typography.labelSmall, color = Folio.colors.muted)
                        Spacer(Modifier.height(12.dp))
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            interests.forEach { topic -> FollowedChip(topic, onOpen = { if (!onboarding) app.nav.push(Screen.TopicFeed(topic)) }, onRemove = { store.unfollow(topic.id) }) }
                        }
                    }
                }
            }

            Topics.groups.forEach { group ->
                item(key = group) {
                    Column(Modifier.padding(start = pad, end = pad, top = 26.dp)) {
                        Text(group.uppercase(), style = MaterialTheme.typography.labelSmall, color = Folio.colors.muted)
                        Spacer(Modifier.height(10.dp))
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Topics.presets.filter { it.group == group }.forEach { topic ->
                                val on = topic.id in ids
                                TopicChip(topic.name, selected = on, field = Field.of(topic)) {
                                    if (on) store.unfollow(topic.id) else store.follow(topic)
                                }
                            }
                        }
                    }
                }
            }
        }

        if (onboarding) {
            Surface(Modifier.align(Alignment.BottomCenter).fillMaxWidth(), color = MaterialTheme.colorScheme.background) {
                Button(
                    onClick = { store.finishOnboarding(); app.nav.reset(Screen.Home) },
                    enabled = interests.isNotEmpty(),
                    modifier = Modifier.windowInsetsPadding(WindowInsets.navigationBars).padding(16.dp).then(if (app.wide) Modifier.widthIn(max = 420.dp) else Modifier.fillMaxWidth()).height(56.dp),
                    shape = RoundedCornerShape(16.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary),
                ) {
                    Text(if (interests.isEmpty()) "Follow at least one topic" else "Start reading · ${interests.size} interests", style = MaterialTheme.typography.labelLarge)
                }
            }
        }
    }
}

@Composable
private fun TopicChip(label: String, selected: Boolean, small: Boolean = false, field: Field? = null, onClick: () -> Unit) {
    val colors = Folio.colors
    CompositionLocalProvider(LocalMinimumInteractiveComponentSize provides 0.dp) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(12.dp),
        color = if (selected) MaterialTheme.colorScheme.onBackground else colors.card,
        contentColor = if (selected) MaterialTheme.colorScheme.background else MaterialTheme.colorScheme.onBackground,
        shadowElevation = if (selected || colors.dark) 0.dp else 1.dp,
    ) {
        Row(Modifier.padding(horizontal = if (small) 10.dp else 14.dp, vertical = if (small) 6.dp else 10.dp), verticalAlignment = Alignment.CenterVertically) {
            when {
                selected -> { Icon(Icons.Outlined.Check, null, Modifier.size(16.dp)); Spacer(Modifier.width(6.dp)) }
                field != null -> {
                    Box(Modifier.size(18.dp).clip(RoundedCornerShape(5.dp)).background(field.palette(0).background), contentAlignment = Alignment.Center) {
                        Icon(field.icon, null, Modifier.size(12.dp), tint = field.palette(0).accent)
                    }
                    Spacer(Modifier.width(8.dp))
                }
                small -> { Icon(Icons.Outlined.Add, null, Modifier.size(14.dp)); Spacer(Modifier.width(4.dp)) }
            }
            Text(label, style = if (small) MaterialTheme.typography.labelMedium else MaterialTheme.typography.labelLarge)
        }
    }
    }
}

@Composable
private fun FollowedChip(topic: Topic, onOpen: () -> Unit, onRemove: () -> Unit) {
    Surface(onClick = onOpen, shape = RoundedCornerShape(14.dp), color = Folio.colors.card, shadowElevation = if (Folio.colors.dark) 0.dp else 1.dp) {
        Row(Modifier.padding(start = 6.dp, top = 6.dp, bottom = 6.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            TopicCover(topic, Modifier.width(30.dp), elevation = 0, showTitle = false)
            Spacer(Modifier.width(10.dp))
            Column {
                Text(topic.name, style = MaterialTheme.typography.labelLarge)
                Text(if (topic.custom) "Your own" else Field.of(topic).label, style = MaterialTheme.typography.bodySmall, color = Folio.colors.muted)
            }
            Surface(onClick = onRemove, shape = RoundedCornerShape(8.dp), color = MaterialTheme.colorScheme.background.copy(alpha = 0f)) {
                Icon(Icons.Outlined.Close, "Unfollow ${topic.name}", Modifier.padding(8.dp).size(16.dp), tint = Folio.colors.muted)
            }
        }
    }
}
