package com.folio.papers.ui.components

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Bookmark
import androidx.compose.material.icons.outlined.BookmarkBorder
import androidx.compose.material.icons.outlined.PictureAsPdf
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.folio.papers.data.Paper
import com.folio.papers.data.Source
import com.folio.papers.ui.theme.accent

@Composable
fun SourceTag(source: Source, modifier: Modifier = Modifier) {
    val color = source.accent()
    Row(modifier, verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(6.dp).clip(CircleShape).background(color))
        Spacer(Modifier.width(6.dp))
        Text(source.label.uppercase(), style = MaterialTheme.typography.labelSmall, color = color)
    }
}

@Composable
fun PaperCard(
    paper: Paper,
    saved: Boolean,
    onClick: () -> Unit,
    onToggleSave: () -> Unit,
    modifier: Modifier = Modifier,
    read: Boolean = false,
) {
    Surface(
        onClick = onClick,
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(22.dp),
        color = MaterialTheme.colorScheme.surfaceContainerLow,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Column(Modifier.padding(start = 20.dp, top = 18.dp, end = 8.dp, bottom = 16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                SourceTag(paper.source)
                Text(
                    "  ·  ${friendlyDate(paper.published)}",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (paper.pdfUrl != null) {
                    Spacer(Modifier.width(8.dp))
                    Icon(
                        Icons.Outlined.PictureAsPdf, contentDescription = "PDF available",
                        modifier = Modifier.size(14.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Spacer(Modifier.weight(1f))
                IconButton(onClick = onToggleSave, modifier = Modifier.size(36.dp)) {
                    AnimatedContent(
                        targetState = saved,
                        transitionSpec = { (scaleIn() + fadeIn()) togetherWith fadeOut() },
                        label = "save",
                    ) { isSaved ->
                        Icon(
                            if (isSaved) Icons.Outlined.Bookmark else Icons.Outlined.BookmarkBorder,
                            contentDescription = if (isSaved) "Remove from library" else "Save to library",
                            tint = if (isSaved) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
            Column(Modifier.padding(end = 12.dp).alpha(if (read) 0.6f else 1f)) {
                Spacer(Modifier.height(4.dp))
                Text(
                    paper.title,
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(Modifier.height(6.dp))
                Text(
                    shortAuthors(paper.authors),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (paper.abstract.isNotBlank()) {
                    Spacer(Modifier.height(10.dp))
                    Text(
                        paper.abstract,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.78f),
                        maxLines = 3,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                val venue = paper.venue
                if (venue != null) {
                    Spacer(Modifier.height(12.dp))
                    Text(
                        venue,
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.secondary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
    }
}

/** Placeholder card shown while the first page loads. */
@Composable
fun PaperCardSkeleton(modifier: Modifier = Modifier) {
    val transition = rememberInfiniteTransition(label = "skeleton")
    val alpha by transition.animateFloat(
        initialValue = 0.35f, targetValue = 0.8f,
        animationSpec = infiniteRepeatable(tween(900), RepeatMode.Reverse), label = "alpha",
    )
    val block = MaterialTheme.colorScheme.surfaceContainerHighest
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(22.dp),
        color = MaterialTheme.colorScheme.surfaceContainerLow,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Column(Modifier.padding(20.dp).alpha(alpha), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Box(Modifier.width(110.dp).height(10.dp).clip(CircleShape).background(block))
            Box(Modifier.fillMaxWidth(0.95f).height(16.dp).clip(CircleShape).background(block))
            Box(Modifier.fillMaxWidth(0.7f).height(16.dp).clip(CircleShape).background(block))
            Box(Modifier.fillMaxWidth(0.4f).height(10.dp).clip(CircleShape).background(block))
            Box(Modifier.fillMaxWidth().height(10.dp).clip(CircleShape).background(block))
            Box(Modifier.fillMaxWidth(0.85f).height(10.dp).clip(CircleShape).background(block))
        }
    }
}
