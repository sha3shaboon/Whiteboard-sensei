package app.folio.ui.reader

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.CloseFullscreen
import androidx.compose.material.icons.outlined.DeleteSweep
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.OpenInFull
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.folio.LocalApp
import app.folio.data.BoardStyle
import app.folio.ink.InkSession
import app.folio.ink.InkSettings
import app.folio.ink.inkInput
import app.folio.ui.theme.Folio
import kotlinx.coroutines.launch

/** Sheet shape: A4 portrait. */
private const val SHEET_RATIO = 1f / 1.414f

/**
 * Scratch paper beside the article: sheets of grid, lined, dotted or blank paper to work through
 * maths, test an idea or sketch. Same pens, eraser and undo as the paper; saved with the paper.
 */
@Composable
fun Whiteboard(
    session: InkSession,
    settings: InkSettings,
    listState: LazyListState,
    mode: BoardMode,
    scrollEnabled: Boolean,
    onInking: (Boolean) -> Unit,
    onInk: () -> Unit,
    onMode: (BoardMode) -> Unit,
    modifier: Modifier = Modifier,
) {
    val app = LocalApp.current
    val pen = app.graph.platform.pen
    val scope = rememberCoroutineScope()
    Column(modifier.background(if (Folio.colors.dark) Color(0xFF17181A) else Color(0xFFEDEAE3))) {
        BoardBar(
            session, mode, onMode,
            currentSheet = listState.firstVisibleItemIndex.coerceAtMost(session.boardSheets - 1),
            onAddSheet = {
                session.addSheet()
                scope.launch { listState.animateScrollToItem(session.boardSheets - 1) }
            },
        )
        BoxWithConstraints(Modifier.weight(1f).fillMaxWidth()) {
            // Fill the width, but keep sheets a readable size on very wide screens.
            val sheetWidth = minOf(maxWidth - 24.dp, 900.dp)
            LazyColumn(
                state = listState,
                userScrollEnabled = scrollEnabled,
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(top = 12.dp, bottom = 120.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                items(session.boardSheets) { sheet ->
                    Box(
                        Modifier.width(sheetWidth).aspectRatio(SHEET_RATIO)
                            .shadow(3.dp, RoundedCornerShape(6.dp)).clip(RoundedCornerShape(6.dp)).background(Color.White)
                            .inkInput(
                                page = sheet, board = true, session = session, settings = settings, pen = pen,
                                onPan = { d -> listState.dispatchRawDelta(-d.y) },
                                onInkingChange = onInking, onInk = onInk,
                            ),
                    ) {
                        Canvas(Modifier.fillMaxSize()) { drawPaper(session.boardStyle) }
                        InkLayers(session, sheet, board = true)
                        Text(
                            "${sheet + 1}", style = MaterialTheme.typography.labelSmall, color = Color(0xFFB4B0A8),
                            modifier = Modifier.align(Alignment.BottomEnd).padding(10.dp),
                        )
                    }
                }
                item {
                    TextButton(onClick = {
                        session.addSheet()
                        scope.launch { listState.animateScrollToItem(session.boardSheets - 1) }
                    }) {
                        Icon(Icons.Outlined.Add, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("Add a sheet")
                    }
                }
            }
        }
    }
}

@Composable
private fun BoardBar(session: InkSession, mode: BoardMode, onMode: (BoardMode) -> Unit, currentSheet: Int, onAddSheet: () -> Unit) {
    var styles by remember { mutableStateOf(false) }
    Surface(color = Folio.colors.card) {
        Row(Modifier.fillMaxWidth().padding(start = 14.dp, end = 4.dp, top = 2.dp, bottom = 2.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Whiteboard", style = MaterialTheme.typography.titleSmall, maxLines = 1)
                Text("Sheet ${currentSheet + 1} of ${session.boardSheets}", style = MaterialTheme.typography.bodySmall, color = Folio.colors.muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Box {
                TextButton(onClick = { styles = true }) {
                    Text(session.boardStyle.label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onBackground)
                    Icon(Icons.Outlined.ExpandMore, null, Modifier.size(16.dp), tint = Folio.colors.muted)
                }
                DropdownMenu(expanded = styles, onDismissRequest = { styles = false }) {
                    BoardStyle.entries.forEach { s ->
                        DropdownMenuItem(
                            text = { Text(s.label) },
                            leadingIcon = { Canvas(Modifier.size(22.dp).clip(RoundedCornerShape(4.dp)).background(Color.White)) { drawPaper(s, preview = true) } },
                            onClick = { session.setStyle(s); styles = false },
                        )
                    }
                }
            }
            IconButton(onClick = onAddSheet) { Icon(Icons.Outlined.Add, "Add a sheet") }
            IconButton(onClick = { session.clearSheet(currentSheet) }) { Icon(Icons.Outlined.DeleteSweep, "Clear this sheet (undo brings it back)") }
            IconButton(onClick = { onMode(if (mode == BoardMode.FULL) BoardMode.SPLIT else BoardMode.FULL) }) {
                Icon(
                    if (mode == BoardMode.FULL) Icons.Outlined.CloseFullscreen else Icons.Outlined.OpenInFull,
                    if (mode == BoardMode.FULL) "Show the paper again" else "Whiteboard full screen",
                )
            }
            IconButton(onClick = { onMode(BoardMode.CLOSED) }) { Icon(Icons.Outlined.Close, "Close whiteboard") }
        }
    }
}

/** Paper rulings, spaced relative to the sheet so they scale with it. */
private fun DrawScope.drawPaper(style: BoardStyle, preview: Boolean = false) {
    val w = size.width
    val h = size.height
    val line = Color(0xFFD9E2EC)
    val strong = Color(0xFFBFCCDA)
    val stroke = if (preview) 1f else maxOf(1f, w / 700f)
    when (style) {
        BoardStyle.GRID -> {
            val step = if (preview) w / 5 else w / 28
            var x = step; var i = 1
            while (x < w) { drawLine(if (i % 5 == 0) strong else line, Offset(x, 0f), Offset(x, h), stroke); x += step; i++ }
            var y = step; i = 1
            while (y < h) { drawLine(if (i % 5 == 0) strong else line, Offset(0f, y), Offset(w, y), stroke); y += step; i++ }
        }
        BoardStyle.LINES -> {
            val step = if (preview) h / 5 else w / 20
            var y = step * 2
            while (y < h) { drawLine(line, Offset(0f, y), Offset(w, y), stroke); y += step }
            drawLine(Color(0xFFF2B8B5), Offset(w * 0.11f, 0f), Offset(w * 0.11f, h), stroke)
        }
        BoardStyle.DOTS -> {
            val step = if (preview) w / 5 else w / 28
            val r = if (preview) 1f else maxOf(1.2f, w / 500f)
            var y = step
            while (y < h) {
                var x = step
                while (x < w) { drawCircle(strong, r, Offset(x, y)); x += step }
                y += step
            }
        }
        BoardStyle.BLANK -> Unit
    }
}
