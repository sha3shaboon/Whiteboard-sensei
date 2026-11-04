package app.folio.ui.reader

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.CloseFullscreen
import androidx.compose.material.icons.outlined.DeleteSweep
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.OpenInFull
import androidx.compose.material.icons.outlined.Remove
import androidx.compose.material.icons.outlined.Straighten
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LocalMinimumInteractiveComponentSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.text.drawText
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.PointerEventType
import androidx.compose.ui.input.pointer.isCtrlPressed
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChange
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.folio.LocalApp
import app.folio.data.BoardStyle
import app.folio.ink.BOARD_MAX_ZOOM
import app.folio.ink.BOARD_MIN_ZOOM
import app.folio.ink.InkSession
import app.folio.ink.InkSettings
import app.folio.ink.InputKind
import app.folio.ink.PenInput
import app.folio.ink.RulerState
import app.folio.ink.inkInput
import app.folio.ink.zoomScroll
import app.folio.ui.theme.Folio
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.launch
import kotlin.math.atan2
import kotlin.math.exp
import kotlin.math.floor
import kotlin.math.hypot

/** Sheet shape: A4 portrait, width / height. */
private const val SHEET_RATIO = 1f / 1.414f
private const val SHEET_MM = 210f
private val TOP_PAD = 12.dp
private val GAP = 14.dp

/** Holder for layout coordinates that pointer code reads lazily (not Compose state). */
private class Coords { var value: LayoutCoordinates? = null }

private data class ScrollTarget(val x: Float, val y: Float, val seq: Int)

/**
 * Scratch paper beside the article: sheets of grid, lined, dotted or blank paper to work through
 * maths, test an idea or sketch. Same pens, eraser and undo as the paper; saved with the paper.
 *
 * Pinch with two fingers (or Ctrl + wheel) to zoom; the ruler gives straight lines.
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
    val density = LocalDensity.current
    val ruler = session.ruler

    Column(modifier.background(if (Folio.colors.dark) Color(0xFF17181A) else Color(0xFFEDEAE3))) {
        BoardBar(
            session, mode, onMode,
            currentSheet = listState.firstVisibleItemIndex.coerceAtMost(session.boardSheets - 1),
        )
        BoxWithConstraints(Modifier.weight(1f).fillMaxWidth()) {
            val viewWidth = maxWidth
            val viewW = constraints.maxWidth.toFloat()
            val viewH = constraints.maxHeight.toFloat()
            // At 100% the sheet fills the width (up to a readable maximum); zoom scales from there.
            val base = minOf(maxWidth - 24.dp, 900.dp)
            val zoom = session.boardZoom
            val sheetWidth = base * zoom
            val sheetWidthPx = with(density) { sheetWidth.toPx() }
            val hScroll = rememberScrollState()
            val viewport = remember { Coords() }
            val sheets = remember { HashMap<Int, LayoutCoordinates>() }
            val targets = remember { MutableStateFlow<ScrollTarget?>(null) }
            var seq by remember { mutableStateOf(0) }
            var pinching by remember { mutableStateOf(false) }
            val topPadPx = with(density) { TOP_PAD.toPx() }
            val gapPx = with(density) { GAP.toPx() }
            val basePx = with(density) { base.toPx() }

            ruler.length = maxOf(viewW, viewH) * 1.6f
            ruler.thickness = with(density) { 76.dp.toPx() }
            ruler.placeIfNeeded(viewW, viewH)

            /** Zoom by [factor] keeping [focus] (viewport px) still, moving by [pan]. */
            fun zoomBy(factor: Float, focus: Offset, pan: Offset = Offset.Zero) {
                val old = session.boardZoom
                val new = (old * factor).coerceIn(BOARD_MIN_ZOOM, BOARD_MAX_ZOOM)
                val f = new / old
                val sheetH = basePx * old / SHEET_RATIO
                val absY = topPadPx + listState.firstVisibleItemIndex * (sheetH + gapPx) + listState.firstVisibleItemScrollOffset
                val tx = zoomScroll(hScroll.value.toFloat(), focus.x, f, pan.x)
                val ty = zoomScroll(absY, focus.y, f, pan.y)
                session.boardZoom = new
                targets.value = ScrollTarget(tx, ty, ++seq)
            }

            // Scroll to the anchored position once the zoomed layout exists.
            LaunchedEffect(Unit) {
                targets.filterNotNull().collect { t ->
                    withFrameNanos { }
                    hScroll.scrollTo(t.x.toInt())
                    val sheetH = basePx * session.boardZoom / SHEET_RATIO
                    val rel = (t.y - topPadPx).coerceAtLeast(0f)
                    val index = floor(rel / (sheetH + gapPx)).toInt().coerceIn(0, session.boardSheets - 1)
                    listState.scrollToItem(index, (rel - index * (sheetH + gapPx)).toInt().coerceAtLeast(0))
                }
            }
            // Windows reports touch pinches outside Compose; route them here.
            LaunchedEffect(pen) {
                pen.pinches?.collect { p ->
                    val vc = viewport.value ?: return@collect
                    if (!vc.isAttached) return@collect
                    val local = vc.windowToLocal(p.centroid)
                    if (local.x in 0f..viewW && local.y in 0f..viewH) zoomBy(p.scale, local, p.pan)
                }
            }

            val zoomRef by rememberUpdatedState(::zoomBy)
            Box(
                Modifier.fillMaxSize()
                    .onGloballyPositioned { viewport.value = it }
                    .boardGestures(pen, ruler, onZoom = { f, c, p -> zoomRef(f, c, p) }, onPinching = { pinching = it }),
            ) {
                Box(Modifier.fillMaxSize().horizontalScroll(hScroll, enabled = scrollEnabled && !pinching)) {
                    LazyColumn(
                        state = listState,
                        userScrollEnabled = scrollEnabled && !pinching,
                        modifier = Modifier.width(maxOf(sheetWidth + 24.dp, viewWidth)),
                        contentPadding = PaddingValues(top = TOP_PAD, bottom = 120.dp),
                        verticalArrangement = Arrangement.spacedBy(GAP),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        items(session.boardSheets) { sheet ->
                            // Map a stroke's start to the ruler (viewport space) and back to the sheet.
                            val snapFor = remember(sheet, ruler) {
                                { local: Offset ->
                                    val sc = sheets[sheet]; val vc = viewport.value
                                    if (sc == null || vc == null || !sc.isAttached || !vc.isAttached) null
                                    else ruler.snapperFor(vc.localPositionOf(sc, local), with(density) { 22.dp.toPx() })?.let { proj ->
                                        { q: Offset -> sc.localPositionOf(vc, proj(vc.localPositionOf(sc, q))) }
                                    }
                                }
                            }
                            Box(
                                Modifier.width(sheetWidth).aspectRatio(SHEET_RATIO)
                                    .onGloballyPositioned { sheets[sheet] = it }
                                    .shadow(3.dp, RoundedCornerShape(6.dp)).clip(RoundedCornerShape(6.dp)).background(Color.White)
                                    .inkInput(
                                        page = sheet, board = true, session = session, settings = settings, pen = pen,
                                        onPan = { d -> listState.dispatchRawDelta(-d.y); hScroll.dispatchRawDelta(-d.x) },
                                        onInkingChange = onInking, onInk = onInk, snapFor = snapFor,
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
                if (ruler.visible) RulerOverlay(ruler, mmPx = sheetWidthPx / SHEET_MM)
                ZoomPill(
                    zoom,
                    onOut = { zoomBy(1 / 1.25f, Offset(viewW / 2, viewH / 3)) },
                    onIn = { zoomBy(1.25f, Offset(viewW / 2, viewH / 3)) },
                    onReset = { zoomBy(1f / session.boardZoom, Offset(viewW / 2, viewH / 3)) },
                    modifier = Modifier.align(Alignment.TopEnd).padding(10.dp),
                )
            }
        }
    }
}

/**
 * The board's own gestures, seen before the sheets get them:
 * - two fingers: pinch to zoom and pan;
 * - finger or mouse on the ruler: move it (two fingers twist it; tap the angle to step it);
 * - Ctrl + wheel (or a touchpad pinch): zoom; wheel over the ruler: rotate it.
 * A stylus is always left alone so it can write, including along the ruler.
 */
private fun Modifier.boardGestures(
    pen: PenInput,
    ruler: RulerState,
    onZoom: (Float, Offset, Offset) -> Unit,
    onPinching: (Boolean) -> Unit,
): Modifier = pointerInput(pen, ruler) {
    awaitEachGesture {
        val down = awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
        val kind = pen.classify(down).kind
        if (kind == InputKind.STYLUS || kind == InputKind.STYLUS_ERASER) return@awaitEachGesture

        if (ruler.hitsBody(down.position)) {
            down.consume()
            var travelled = 0f
            var prev: Pair<Offset, Offset>? = null
            while (true) {
                val ev = awaitPointerEvent(PointerEventPass.Initial)
                val pressed = ev.changes.filter { it.pressed }
                if (pressed.isEmpty()) {
                    if (travelled < viewConfiguration.touchSlop && ruler.hitsLabel(down.position, 48.dp.toPx())) ruler.cycleAngle()
                    ev.changes.forEach { it.consume() }
                    break
                }
                if (pressed.size >= 2) {
                    val a = pressed[0].position; val b = pressed[1].position
                    prev?.let { (pa, pb) ->
                        val before = atan2(pb.y - pa.y, pb.x - pa.x)
                        val now = atan2(b.y - a.y, b.x - a.x)
                        ruler.rotateBy(((now - before) * 180f / kotlin.math.PI.toFloat()))
                        ruler.moveBy((a + b) / 2f - (pa + pb) / 2f)
                    }
                    prev = a to b
                    travelled += 100f
                } else {
                    prev = null
                    val d = pressed[0].positionChange()
                    travelled += d.getDistance()
                    ruler.moveBy(d)
                }
                ev.changes.forEach { it.consume() }
            }
            return@awaitEachGesture
        }

        // Watch for a second finger; until then the sheets get the events as usual.
        while (true) {
            val ev = awaitPointerEvent(PointerEventPass.Initial)
            val fingers = ev.changes.filter { it.pressed && pen.classify(it).kind == InputKind.FINGER }
            if (ev.changes.none { it.pressed }) break
            if (fingers.size >= 2) {
                onPinching(true)
                var pa = fingers[0].position; var pb = fingers[1].position
                val ida = fingers[0].id; val idb = fingers[1].id
                ev.changes.forEach { it.consume() }
                while (true) {
                    val e = awaitPointerEvent(PointerEventPass.Initial)
                    val a = e.changes.firstOrNull { it.id == ida }
                    val b = e.changes.firstOrNull { it.id == idb }
                    e.changes.forEach { it.consume() }
                    if (a == null || b == null || !a.pressed || !b.pressed) break
                    val before = hypot(pb.x - pa.x, pb.y - pa.y).coerceAtLeast(1f)
                    val now = hypot(b.position.x - a.position.x, b.position.y - a.position.y).coerceAtLeast(1f)
                    val c = (a.position + b.position) / 2f
                    val pc = (pa + pb) / 2f
                    onZoom(now / before, c, c - pc)
                    pa = a.position; pb = b.position
                }
                // Swallow the rest so a lifted-last finger doesn't fling the page.
                while (true) {
                    val e = awaitPointerEvent(PointerEventPass.Initial)
                    e.changes.forEach { it.consume() }
                    if (e.changes.none { it.pressed }) break
                }
                onPinching(false)
                break
            }
        }
    }
}.pointerInput(ruler) {
    awaitPointerEventScope {
        while (true) {
            val ev = awaitPointerEvent(PointerEventPass.Initial)
            if (ev.type != PointerEventType.Scroll) continue
            val c = ev.changes.firstOrNull() ?: continue
            when {
                ev.keyboardModifiers.isCtrlPressed -> {
                    onZoom(exp(-c.scrollDelta.y * 0.12f), c.position, Offset.Zero)
                    ev.changes.forEach { it.consume() }
                }
                ruler.hitsBody(c.position) -> {
                    ruler.rotateBy(c.scrollDelta.y * 3f)
                    ev.changes.forEach { it.consume() }
                }
            }
        }
    }
}

/** Floating "− 150% +" control; tap the number to go back to 100%. */
@Composable
private fun ZoomPill(zoom: Float, onOut: () -> Unit, onIn: () -> Unit, onReset: () -> Unit, modifier: Modifier = Modifier) {
    CompositionLocalProvider(LocalMinimumInteractiveComponentSize provides Dp.Unspecified) {
        Surface(modifier, shape = RoundedCornerShape(14.dp), color = Folio.colors.card.copy(alpha = 0.94f), shadowElevation = 4.dp) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onOut, enabled = zoom > BOARD_MIN_ZOOM + 0.01f, modifier = Modifier.size(36.dp)) { Icon(Icons.Outlined.Remove, "Zoom out", Modifier.size(18.dp)) }
                Surface(onClick = onReset, color = Color.Transparent, shape = RoundedCornerShape(8.dp)) {
                    Text("${(zoom * 100).toInt()}%", style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(horizontal = 4.dp, vertical = 6.dp))
                }
                IconButton(onClick = onIn, enabled = zoom < BOARD_MAX_ZOOM - 0.01f, modifier = Modifier.size(36.dp)) { Icon(Icons.Outlined.Add, "Zoom in", Modifier.size(18.dp)) }
            }
        }
    }
}

/** The ruler: a frosted strip with millimetre ticks at the sheet's scale and its angle in the middle. */
@Composable
private fun RulerOverlay(ruler: RulerState, mmPx: Float) {
    val measurer = rememberTextMeasurer()
    val labelStyle = MaterialTheme.typography.labelSmall.copy(color = Color(0xFF3D4650))
    val angleStyle = MaterialTheme.typography.labelLarge.copy(color = Color(0xFF1F2933))
    Canvas(Modifier.fillMaxSize()) {
        val c = ruler.center
        if (c == Offset.Unspecified) return@Canvas
        val len = ruler.length
        val t = ruler.thickness
        val left = c.x - len / 2
        val top = c.y - t / 2
        rotate(ruler.angle, pivot = c) {
            drawRoundRect(Color.Black.copy(alpha = 0.10f), Offset(left, top + 3.dp.toPx()), Size(len, t), androidx.compose.ui.geometry.CornerRadius(8.dp.toPx()))
            drawRoundRect(Color(0xFFF7F9FB).copy(alpha = 0.86f), Offset(left, top), Size(len, t), androidx.compose.ui.geometry.CornerRadius(8.dp.toPx()))
            drawRoundRect(
                Color(0xFF8C98A4), Offset(left, top), Size(len, t), androidx.compose.ui.geometry.CornerRadius(8.dp.toPx()),
                style = androidx.compose.ui.graphics.drawscope.Stroke(1.dp.toPx()),
            )
            // Ticks along both edges, numbered every centimetre from the middle outwards.
            val step = if (mmPx < 3f) mmPx * 5 else mmPx
            var i = 0
            var x = 0f
            while (x <= len / 2) {
                listOf(c.x + x, c.x - x).distinct().forEach { px ->
                    val mm = i * (if (mmPx < 3f) 5 else 1)
                    val h = when {
                        mm % 10 == 0 -> t * 0.30f
                        mm % 5 == 0 -> t * 0.20f
                        else -> t * 0.12f
                    }
                    drawLine(Color(0xFF55606B), Offset(px, top), Offset(px, top + h), 1.dp.toPx())
                    drawLine(Color(0xFF55606B), Offset(px, top + t), Offset(px, top + t - h), 1.dp.toPx())
                    if (mm % 10 == 0 && mm != 0 && kotlin.math.abs(px - c.x) > 56.dp.toPx()) {
                        val label = measurer.measure("${mm / 10}", labelStyle)
                        drawText(label, topLeft = Offset(px - label.size.width / 2f, top + t * 0.32f))
                    }
                }
                i++
                x += step
                if (i > 4000) break
            }
            // Angle badge in the middle; tap it to step through 0°, 45°, 90°, 135°.
            val text = measurer.measure("${ruler.angle.toInt()}°", angleStyle)
            val pad = 8.dp.toPx()
            drawRoundRect(
                Color.White, Offset(c.x - text.size.width / 2f - pad, c.y - text.size.height / 2f - pad / 2),
                Size(text.size.width + pad * 2, text.size.height + pad), androidx.compose.ui.geometry.CornerRadius(10.dp.toPx()),
            )
            drawText(text, topLeft = Offset(c.x - text.size.width / 2f, c.y - text.size.height / 2f))
        }
    }
}

@Composable
private fun BoardBar(session: InkSession, mode: BoardMode, onMode: (BoardMode) -> Unit, currentSheet: Int) {
    var styles by remember { mutableStateOf(false) }
    val ruler = session.ruler
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
            IconButton(onClick = { ruler.visible = !ruler.visible }) {
                Box(
                    Modifier.size(34.dp).clip(RoundedCornerShape(10.dp)).background(if (ruler.visible) Folio.colors.highlight else Color.Transparent),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.Outlined.Straighten, if (ruler.visible) "Hide ruler" else "Show ruler", tint = if (ruler.visible) Folio.colors.onHighlight else MaterialTheme.colorScheme.onBackground)
                }
            }
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
