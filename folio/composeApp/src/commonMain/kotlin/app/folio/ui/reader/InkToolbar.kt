package app.folio.ui.reader

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Redo
import androidx.compose.material.icons.automirrored.outlined.Undo
import androidx.compose.material.icons.outlined.BorderColor
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.PanTool
import androidx.compose.material.icons.outlined.Tune
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LocalMinimumInteractiveComponentSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.folio.data.InkTool
import app.folio.ink.EraserIcon
import app.folio.ink.EraserSizeRange
import app.folio.ink.HighlighterColors
import app.folio.ink.HighlighterPresets
import app.folio.ink.HighlighterSizeRange
import app.folio.ink.InkSession
import app.folio.ink.InkSettings
import app.folio.ink.PenColors
import app.folio.ink.PenPresets
import app.folio.ink.PenSizeRange
import app.folio.ink.Tool
import app.folio.ink.drawStroke
import app.folio.ui.theme.Folio
import kotlin.math.sin

/**
 * Floating pill: pen, highlighter, eraser, tool settings, undo/redo, and whether touch writes.
 * Tap the settings button (or the selected tool again) for colour, thickness and pressure.
 */
@Composable
fun InkToolbar(settings: InkSettings, session: InkSession, modifier: Modifier = Modifier) {
    var panel by remember { mutableStateOf(false) }
    var hint by remember { mutableStateOf(false) }
    LaunchedEffect(hint) { if (hint) { kotlinx.coroutines.delay(4500); hint = false } }

    fun pick(tool: Tool) {
        if (settings.tool == tool) panel = !panel
        settings.tool = tool
        if (!settings.stylusSeen && !settings.touchDraws) hint = true
    }

    CompositionLocalProvider(LocalMinimumInteractiveComponentSize provides Dp.Unspecified) {
        Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
            AnimatedVisibility(hint && !panel, enter = fadeIn(), exit = fadeOut()) {
                Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.onBackground, contentColor = MaterialTheme.colorScheme.background, modifier = Modifier.padding(bottom = 10.dp)) {
                    Text("Write with your stylus. To use a finger or mouse, turn on the hand.", style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp))
                }
            }
            AnimatedVisibility(panel, enter = fadeIn() + slideInVertically { it / 3 }, exit = fadeOut()) {
                ToolSettings(settings, Modifier.padding(bottom = 10.dp))
            }
            Surface(shape = RoundedCornerShape(22.dp), color = Folio.colors.card, shadowElevation = 10.dp) {
                Row(Modifier.padding(horizontal = 6.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    ToolButton(Icons.Outlined.Edit, "Pen", settings.tool == Tool.PEN, dot = Color(settings.penColor)) { pick(Tool.PEN) }
                    ToolButton(Icons.Outlined.BorderColor, "Highlighter", settings.tool == Tool.HIGHLIGHTER, dot = Color(settings.highlighterColor)) { pick(Tool.HIGHLIGHTER) }
                    ToolButton(EraserIcon, "Eraser", settings.tool == Tool.ERASER) { pick(Tool.ERASER) }
                    ToolButton(Icons.Outlined.Tune, "Pen settings: colour, thickness, pressure", panel, accent = false) { panel = !panel }
                    Divider()
                    ToolButton(Icons.AutoMirrored.Outlined.Undo, "Undo", false, enabled = session.canUndo) { session.undo() }
                    ToolButton(Icons.AutoMirrored.Outlined.Redo, "Redo", false, enabled = session.canRedo) { session.redo() }
                    Divider()
                    ToolButton(Icons.Outlined.PanTool, if (settings.touchDraws) "Finger and mouse write (tap to scroll instead)" else "Finger and mouse scroll (tap to write with them)", settings.touchDraws) {
                        settings.touchDraws = !settings.touchDraws
                        hint = false
                    }
                }
            }
        }
    }
}

@Composable
private fun Divider() = Box(Modifier.padding(horizontal = 4.dp).width(1.dp).height(24.dp).background(MaterialTheme.colorScheme.outlineVariant))

@Composable
private fun ToolButton(icon: ImageVector, label: String, selected: Boolean, enabled: Boolean = true, dot: Color? = null, accent: Boolean = true, onClick: () -> Unit) {
    val on = if (accent) Folio.colors.highlight else Folio.colors.chip
    Box(
        Modifier.size(42.dp).clip(RoundedCornerShape(14.dp)).background(if (selected) on else Color.Transparent),
        contentAlignment = Alignment.Center,
    ) {
        IconButton(onClick = onClick, enabled = enabled, modifier = Modifier.size(42.dp)) {
            Icon(icon, label, Modifier.size(20.dp), tint = when {
                selected && accent -> Folio.colors.onHighlight
                enabled -> MaterialTheme.colorScheme.onBackground
                else -> Folio.colors.muted.copy(alpha = 0.5f)
            })
        }
        if (dot != null) {
            Box(Modifier.align(Alignment.BottomCenter).padding(bottom = 4.dp).size(width = 14.dp, height = 3.dp).clip(CircleShape).background(dot))
        }
    }
}

/** Colour, thickness and pressure for the selected tool, with a live preview stroke. */
@Composable
private fun ToolSettings(settings: InkSettings, modifier: Modifier = Modifier) {
    // The eraser has no colour; show the pen when it's selected so colours stay one tap away.
    var editing by remember { mutableStateOf(if (settings.tool == Tool.HIGHLIGHTER) Tool.HIGHLIGHTER else settings.tool) }
    LaunchedEffect(settings.tool) { editing = settings.tool }
    Surface(modifier.widthIn(max = 380.dp), shape = RoundedCornerShape(20.dp), color = Folio.colors.card, shadowElevation = 10.dp) {
        Column(Modifier.padding(16.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                listOf(Tool.PEN to "Pen", Tool.HIGHLIGHTER to "Highlighter", Tool.ERASER to "Eraser").forEach { (t, label) ->
                    val on = editing == t
                    Surface(
                        onClick = { editing = t; settings.tool = t },
                        shape = RoundedCornerShape(10.dp),
                        color = if (on) MaterialTheme.colorScheme.onBackground else Folio.colors.chip,
                        contentColor = if (on) MaterialTheme.colorScheme.background else MaterialTheme.colorScheme.onBackground,
                    ) { Text(label, style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(horizontal = 12.dp, vertical = 7.dp)) }
                }
            }
            Spacer(Modifier.height(12.dp))
            Preview(settings, editing)
            Spacer(Modifier.height(12.dp))
            when (editing) {
                Tool.PEN, Tool.HIGHLIGHTER -> {
                    val pen = editing == Tool.PEN
                    Label("Colour")
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        val current = if (pen) settings.penColor else settings.highlighterColor
                        (if (pen) PenColors else HighlighterColors).forEach { c ->
                            Box(
                                Modifier.padding(end = 8.dp).size(28.dp).clip(CircleShape).background(Color(c))
                                    .then(if (c == current) Modifier.border(3.dp, MaterialTheme.colorScheme.onBackground.copy(alpha = 0.7f), CircleShape) else Modifier)
                                    .clickable { if (pen) settings.penColor = c else settings.highlighterColor = c },
                            )
                        }
                    }
                    Spacer(Modifier.height(10.dp))
                    val range = if (pen) PenSizeRange else HighlighterSizeRange
                    val size = if (pen) settings.penSize else settings.highlighterSize
                    Label("Thickness", value = "${(size * 1000).let { (it * 10).toInt() / 10.0 }}")
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        (if (pen) PenPresets else HighlighterPresets).forEach { preset ->
                            val on = kotlin.math.abs(preset - size) < 0.0004f
                            Box(
                                Modifier.padding(end = 4.dp).size(34.dp).clip(CircleShape)
                                    .background(if (on) Folio.colors.chip else Color.Transparent)
                                    .clickable { if (pen) settings.penSize = preset else settings.highlighterSize = preset },
                                contentAlignment = Alignment.Center,
                            ) {
                                val d = (4 + (preset - range.start) / (range.endInclusive - range.start) * 18).dp
                                Box(Modifier.size(d).clip(CircleShape).background(Color(if (pen) settings.penColor else settings.highlighterColor)))
                            }
                        }
                    }
                    FolioSlider(size, range) { if (pen) settings.penSize = it else settings.highlighterSize = it }
                    if (pen) {
                        Label("Pressure sensitivity", value = if (settings.pressure < 0.02f) "Off" else "${(settings.pressure * 100).toInt()}%")
                        FolioSlider(settings.pressure, 0f..1f) { settings.pressure = it }
                        Text(
                            "How much pressing harder thickens the line. Off draws an even line.",
                            style = MaterialTheme.typography.bodySmall, color = Folio.colors.muted,
                        )
                    }
                }
                Tool.ERASER -> {
                    Label("Eraser size", value = "${settings.eraserSize.toInt()} dp")
                    FolioSlider(settings.eraserSize, EraserSizeRange) { settings.eraserSize = it }
                    Text(
                        "Removes whole strokes it touches. Your stylus's eraser end and side button erase too.",
                        style = MaterialTheme.typography.bodySmall, color = Folio.colors.muted,
                    )
                }
            }
        }
    }
}

@Composable
private fun Label(text: String, value: String? = null) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(text.uppercase(), style = MaterialTheme.typography.labelSmall, color = Folio.colors.muted, modifier = Modifier.weight(1f))
        if (value != null) Text(value, style = MaterialTheme.typography.labelMedium)
    }
    Spacer(Modifier.height(4.dp))
}

@Composable
private fun FolioSlider(value: Float, range: ClosedFloatingPointRange<Float>, onChange: (Float) -> Unit) {
    Slider(
        value = value, onValueChange = onChange, valueRange = range,
        colors = SliderDefaults.colors(
            thumbColor = Folio.colors.highlight, activeTrackColor = Folio.colors.highlight,
            inactiveTrackColor = Folio.colors.chip,
        ),
    )
}

/** A sample stroke drawn with the current settings, light-to-firm pressure left to right. */
@Composable
private fun Preview(settings: InkSettings, tool: Tool) {
    Box(Modifier.fillMaxWidth().height(64.dp).clip(RoundedCornerShape(12.dp)).background(Color.White)) {
        Canvas(Modifier.fillMaxWidth().height(64.dp)) {
            val w = size.width
            val h = size.height
            // Preview at the scale of a phone-width page so sizes match what you'll see.
            val scale = w / 380.dp.toPx().coerceAtLeast(1f)
            val pts = buildList {
                for (i in 0..80) {
                    val t = i / 80f
                    add(0.06f + t * 0.88f)
                    add((h / 2 + sin(t * 9.4f) * h * 0.22f) / w)
                    add(0.1f + 0.9f * t)
                }
            }
            when (tool) {
                Tool.PEN -> drawStroke(InkTool.PEN, settings.penColor, settings.penSize * scale, pts, settings.pressure)
                Tool.HIGHLIGHTER -> {
                    drawLine(Color(0xFF2B2B2B), Offset(w * 0.08f, size.height / 2), Offset(w * 0.92f, size.height / 2), 1.5.dp.toPx())
                    drawStroke(InkTool.HIGHLIGHTER, settings.highlighterColor, settings.highlighterSize * scale, listOf(0.08f, size.height / 2 / w, 1f, 0.92f, size.height / 2 / w, 1f), 0f)
                }
                Tool.ERASER -> drawCircle(Color(0xFFDDD8CE), settings.eraserSize.dp.toPx(), Offset(w / 2, size.height / 2))
            }
        }
    }
}
