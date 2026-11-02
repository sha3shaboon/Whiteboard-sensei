package app.folio.ui.components

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.outlined.Bookmark
import androidx.compose.material.icons.outlined.BookmarkBorder
import androidx.compose.material.icons.outlined.CloudDone
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.material3.LocalMinimumInteractiveComponentSize
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.folio.data.Paper
import app.folio.ui.cover.COVER_RATIO
import app.folio.ui.cover.Field
import app.folio.ui.cover.PaperCover
import app.folio.ui.theme.Folio

@Composable
fun SectionHeader(title: String, modifier: Modifier = Modifier, subtitle: String? = null, action: String? = null, onAction: () -> Unit = {}) {
    Row(modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.headlineSmall)
            if (subtitle != null) {
                Text(subtitle, style = MaterialTheme.typography.bodySmall, color = Folio.colors.muted)
            }
        }
        if (action != null) PillButton(action, onClick = onAction, trailing = Icons.AutoMirrored.Outlined.KeyboardArrowRight)
    }
}

/** The small white "View all >" pill from the shelves. */
@Composable
fun PillButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, leading: ImageVector? = null, trailing: ImageVector? = null, selected: Boolean = false) {
    val colors = Folio.colors
    CompositionLocalProvider(LocalMinimumInteractiveComponentSize provides 0.dp) {
    Surface(
        onClick = onClick,
        modifier = modifier,
        shape = RoundedCornerShape(10.dp),
        color = if (selected) MaterialTheme.colorScheme.onBackground else colors.card,
        contentColor = if (selected) MaterialTheme.colorScheme.background else MaterialTheme.colorScheme.onBackground,
        shadowElevation = if (selected || colors.dark) 0.dp else 1.dp,
    ) {
        Row(Modifier.padding(horizontal = 12.dp, vertical = 7.dp), verticalAlignment = Alignment.CenterVertically) {
            if (leading != null) { Icon(leading, null, Modifier.size(16.dp)); Spacer(Modifier.width(6.dp)) }
            Text(text, style = MaterialTheme.typography.labelMedium)
            if (trailing != null) { Spacer(Modifier.width(2.dp)); Icon(trailing, null, Modifier.size(16.dp)) }
        }
    }
    }
}

/** Search field + dark "Search" button in one white pill, as in the Discover header. */
@Composable
fun SearchPill(
    value: String,
    onValueChange: (String) -> Unit,
    onSearch: () -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String = "Find a paper, topic or author…",
    leading: @Composable (() -> Unit)? = null,
) {
    Surface(modifier = modifier.fillMaxWidth(), shape = RoundedCornerShape(14.dp), color = Folio.colors.card, shadowElevation = if (Folio.colors.dark) 0.dp else 2.dp) {
        Row(Modifier.padding(6.dp), verticalAlignment = Alignment.CenterVertically) {
            if (leading != null) {
                leading()
                Box(Modifier.padding(horizontal = 6.dp).width(1.dp).height(24.dp).background(MaterialTheme.colorScheme.outlineVariant))
            }
            Icon(Icons.Outlined.Search, null, Modifier.padding(start = 8.dp).size(18.dp), tint = Folio.colors.muted)
            Box(Modifier.weight(1f).padding(horizontal = 10.dp), contentAlignment = Alignment.CenterStart) {
                if (value.isEmpty()) Text(placeholder, style = MaterialTheme.typography.bodyMedium, color = Folio.colors.muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
                BasicTextField(
                    value = value,
                    onValueChange = onValueChange,
                    singleLine = true,
                    textStyle = MaterialTheme.typography.bodyMedium.copy(color = MaterialTheme.colorScheme.onBackground),
                    cursorBrush = SolidColor(MaterialTheme.colorScheme.secondary),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                    keyboardActions = KeyboardActions(onSearch = { onSearch() }),
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            Surface(onClick = onSearch, shape = RoundedCornerShape(10.dp), color = MaterialTheme.colorScheme.primary, contentColor = MaterialTheme.colorScheme.onPrimary) {
                Text("Search", style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(horizontal = 18.dp, vertical = 10.dp))
            }
        }
    }
}

/** Cover with title and authors underneath, for shelves and grids. */
@Composable
fun BookCard(
    paper: Paper,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    width: Dp? = 150.dp,
    label: String? = null,
    downloaded: Boolean = false,
    read: Boolean = false,
) {
    Column(
        (if (width != null) modifier.width(width) else modifier)
            .clip(RoundedCornerShape(12.dp)).clickable(onClick = onClick).padding(bottom = 6.dp),
    ) {
        Box {
            PaperCover(paper, Modifier.fillMaxWidth().padding(4.dp).alpha(if (read) 0.6f else 1f))
            if (downloaded) {
                Box(
                    Modifier.align(Alignment.TopEnd).padding(10.dp).size(24.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary),
                    contentAlignment = Alignment.Center,
                ) { Icon(Icons.Outlined.CloudDone, "Offline", Modifier.size(14.dp), tint = MaterialTheme.colorScheme.onPrimary) }
            }
        }
        Spacer(Modifier.height(8.dp))
        if (label != null) {
            Text(label.uppercase(), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.secondary, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(horizontal = 4.dp))
            Spacer(Modifier.height(2.dp))
        }
        Text(paper.title, style = MaterialTheme.typography.titleSmall, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(horizontal = 4.dp))
        Text(shortAuthors(paper.authors), style = MaterialTheme.typography.bodySmall, color = Folio.colors.muted, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(horizontal = 4.dp))
    }
}

/** Row for lists: small cover, then field, title, authors, venue and date. */
@Composable
fun PaperRow(paper: Paper, saved: Boolean, onClick: () -> Unit, onToggleSave: () -> Unit, modifier: Modifier = Modifier) {
    val field = Field.of(paper)
    Surface(
        onClick = onClick,
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        color = Folio.colors.card,
        shadowElevation = if (Folio.colors.dark) 0.dp else 1.dp,
    ) {
        Row(Modifier.padding(12.dp)) {
            PaperCover(paper, Modifier.width(78.dp), elevation = 4, showTitle = false)
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        field.label.uppercase(),
                        style = MaterialTheme.typography.labelSmall,
                        color = field.palette(0).accent.takeIf { !Folio.colors.dark } ?: field.palette(1).accent,
                        maxLines = 1,
                        modifier = Modifier.weight(1f, fill = false),
                    )
                    Text("  ·  " + friendlyDate(paper.published), style = MaterialTheme.typography.labelMedium, color = Folio.colors.muted, maxLines = 1)
                }
                Spacer(Modifier.height(4.dp))
                Text(paper.title, style = MaterialTheme.typography.titleMedium, maxLines = 3, overflow = TextOverflow.Ellipsis)
                Spacer(Modifier.height(4.dp))
                Text(shortAuthors(paper.authors), style = MaterialTheme.typography.bodySmall, color = Folio.colors.muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(
                    listOfNotNull(paper.venue, paper.source.label.takeIf { paper.venue?.contains(it) != true }).joinToString(" · "),
                    style = MaterialTheme.typography.bodySmall, color = Folio.colors.muted, maxLines = 1, overflow = TextOverflow.Ellipsis,
                )
            }
            IconButton(onClick = onToggleSave, modifier = Modifier.size(36.dp)) {
                Icon(
                    if (saved) Icons.Outlined.Bookmark else Icons.Outlined.BookmarkBorder,
                    if (saved) "Remove from library" else "Save to library",
                    tint = if (saved) MaterialTheme.colorScheme.secondary else Folio.colors.muted,
                )
            }
        }
    }
}

@Composable
fun shimmerAlpha(): Float {
    val t = rememberInfiniteTransition(label = "shimmer")
    val a by t.animateFloat(0.35f, 0.8f, infiniteRepeatable(tween(850), RepeatMode.Reverse), label = "a")
    return a
}

@Composable
fun CoverSkeleton(modifier: Modifier = Modifier, width: Dp = 150.dp) {
    val a = shimmerAlpha()
    Column(modifier.width(width).padding(4.dp).alpha(a)) {
        Box(Modifier.fillMaxWidth().aspectRatio(COVER_RATIO).clip(RoundedCornerShape(10.dp)).background(MaterialTheme.colorScheme.surfaceContainerHighest))
        Spacer(Modifier.height(10.dp))
        Box(Modifier.fillMaxWidth(0.9f).height(10.dp).clip(CircleShape).background(MaterialTheme.colorScheme.surfaceContainerHighest))
        Spacer(Modifier.height(6.dp))
        Box(Modifier.fillMaxWidth(0.5f).height(8.dp).clip(CircleShape).background(MaterialTheme.colorScheme.surfaceContainerHighest))
    }
}

@Composable
fun RowSkeleton(modifier: Modifier = Modifier) {
    val a = shimmerAlpha()
    val block = MaterialTheme.colorScheme.surfaceContainerHighest
    Surface(modifier.fillMaxWidth(), shape = RoundedCornerShape(18.dp), color = Folio.colors.card) {
        Row(Modifier.padding(12.dp).alpha(a)) {
            Box(Modifier.width(78.dp).aspectRatio(COVER_RATIO).clip(RoundedCornerShape(8.dp)).background(block))
            Spacer(Modifier.width(14.dp))
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Box(Modifier.width(90.dp).height(8.dp).clip(CircleShape).background(block))
                Box(Modifier.fillMaxWidth(0.9f).height(12.dp).clip(CircleShape).background(block))
                Box(Modifier.fillMaxWidth(0.6f).height(12.dp).clip(CircleShape).background(block))
                Box(Modifier.fillMaxWidth(0.4f).height(8.dp).clip(CircleShape).background(block))
            }
        }
    }
}

@Composable
fun EmptyState(icon: ImageVector, title: String, body: String, modifier: Modifier = Modifier, action: (@Composable () -> Unit)? = null) {
    Column(
        modifier.fillMaxWidth().padding(horizontal = 32.dp, vertical = 48.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(Modifier.size(64.dp).clip(RoundedCornerShape(20.dp)).background(MaterialTheme.colorScheme.secondaryContainer), contentAlignment = Alignment.Center) {
            Icon(icon, null, tint = MaterialTheme.colorScheme.secondary, modifier = Modifier.size(30.dp))
        }
        Text(title, style = MaterialTheme.typography.titleLarge, textAlign = TextAlign.Center)
        Text(body, style = MaterialTheme.typography.bodyMedium, color = Folio.colors.muted, textAlign = TextAlign.Center)
        action?.invoke()
    }
}

/** Screen title row used at the top of every main screen. */
@Composable
fun ScreenTitle(title: String, modifier: Modifier = Modifier, kicker: String? = null, trailing: @Composable (() -> Unit)? = null) {
    Row(modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            if (kicker != null) {
                Text(kicker.uppercase(), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.secondary)
                Spacer(Modifier.height(4.dp))
            }
            Text(title, style = MaterialTheme.typography.displaySmall)
        }
        trailing?.invoke()
    }
}
