package app.folio.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.Redo
import androidx.compose.material.icons.automirrored.outlined.Undo
import androidx.compose.material.icons.outlined.BorderColor
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.PanTool
import androidx.compose.material.icons.automirrored.outlined.StickyNote2
import androidx.compose.material.icons.outlined.ZoomIn
import androidx.compose.material.icons.outlined.ZoomOut
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LocalMinimumInteractiveComponentSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.isCtrlPressed
import androidx.compose.ui.input.key.isMetaPressed
import androidx.compose.ui.input.key.isShiftPressed
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.folio.AppScope
import app.folio.LocalApp
import app.folio.PdfDocument
import app.folio.ink.EraserIcon
import app.folio.ink.HighlighterColors
import app.folio.ink.InkSession
import app.folio.ink.InkSettings
import app.folio.ink.PenColors
import app.folio.ink.Tool
import app.folio.ink.drawStroke
import app.folio.ink.drawStrokes
import app.folio.ink.inkInput
import app.folio.ui.components.EmptyState
import app.folio.ui.theme.Folio
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock

private val zoomSteps = listOf(1f, 1.35f, 1.75f, 2.25f, 3f)

/** In-app PDF reader with pen and highlighter, typed notes, zoom and page memory. Works offline. */
@OptIn(FlowPreview::class)
@Composable
fun ReaderScreen(id: String, notesOpenAtStart: Boolean = false) {
    val app = LocalApp.current
    val graph = app.graph
    val paper = remember(id) { graph.paper(id) }
    val path = remember(id) { graph.downloads.fileFor(id) }
    val doc by produceState<Result<PdfDocument?>?>(null, path) {
        value = runCatching { graph.platform.openPdf(path) }
    }
    // Capture the opened document itself: reading `doc` inside onDispose would see the newer value.
    val opened = doc?.getOrNull()
    DisposableEffect(opened) { onDispose { opened?.close() } }

    val session = remember(id) { InkSession(graph.notes.load(id)) }
    val settings = graph.ink
    var zoom by remember { mutableStateOf(0) }
    var notesOpen by remember { mutableStateOf(notesOpenAtStart) }
    var inking by remember { mutableStateOf(false) }
    val listState = rememberLazyListState(initialFirstVisibleItemIndex = graph.store.entry(id)?.lastPage ?: 0)
    val hScroll = rememberScrollState()
    val scope = rememberCoroutineScope()
    val focus = remember { FocusRequester() }

    fun persist() = graph.notes.save(id, session.snapshot(Clock.System.now().toEpochMilliseconds()))

    // Save notes shortly after each change, and once more on the way out.
    LaunchedEffect(session) {
        snapshotFlow { session.version }.drop(1).debounce(500).collect { persist() }
    }
    DisposableEffect(session) { onDispose { if (session.version > 0) persist() } }

    LaunchedEffect(listState) {
        snapshotFlow { listState.firstVisibleItemIndex }.distinctUntilChanged().debounce(600).collect { page ->
            graph.store.setLastPage(id, page)
            if (page > 0) graph.store.setRead(id, true)
        }
    }
    LaunchedEffect(Unit) { runCatching { focus.requestFocus() } }

    // Writing on a paper means you want to keep it: save it and keep its PDF offline.
    val onInk = {
        if (paper != null && !graph.downloads.isKept(id)) {
            graph.store.save(paper)
            graph.downloads.keepCached(paper)
        }
    }

    Box(
        Modifier.fillMaxSize()
            .background(if (Folio.colors.dark) Color(0xFF0B0B0C) else Color(0xFFE4E1DA))
            .focusRequester(focus).focusable()
            .onKeyEvent { e ->
                val mod = e.isCtrlPressed || e.isMetaPressed
                if (e.type != KeyEventType.KeyDown || !mod) return@onKeyEvent false
                when {
                    e.key == Key.Z && !e.isShiftPressed -> { session.undo(); true }
                    e.key == Key.Y || (e.key == Key.Z && e.isShiftPressed) -> { session.redo(); true }
                    else -> false
                }
            },
    ) {
        Column(Modifier.fillMaxSize()) {
            TopBar(app, paper?.title ?: "Paper", doc?.getOrNull()?.pageCount, listState, zoom, onZoom = { zoom = it }, notesOpen = notesOpen, onNotes = { notesOpen = !notesOpen })
            Row(Modifier.weight(1f).fillMaxWidth()) {
                Box(Modifier.weight(1f).fillMaxHeight()) {
                    val result = doc
                    when {
                        result == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = MaterialTheme.colorScheme.secondary) }
                        result.getOrNull() == null -> EmptyState(Icons.Outlined.ErrorOutline, "Can't open this PDF", "The file may be damaged. Remove it from this device and open the paper again.")
                        else -> Pages(
                            doc = result.getOrNull()!!, zoom = zoomSteps[zoom], listState = listState, hScroll = hScroll,
                            session = session, settings = settings, scrollEnabled = !inking,
                            onInking = { inking = it }, onInk = onInk,
                        )
                    }
                    InkToolbar(
                        settings, session,
                        modifier = Modifier.align(Alignment.BottomCenter).windowInsetsPadding(WindowInsets.navigationBars).padding(bottom = 16.dp),
                    )
                }
                if (app.wide) {
                    AnimatedVisibility(notesOpen, enter = slideInHorizontally { it } + fadeIn(), exit = slideOutHorizontally { it } + fadeOut()) {
                        NotesPanel(session, listState, onClose = { notesOpen = false }, modifier = Modifier.width(340.dp).fillMaxHeight())
                    }
                }
            }
        }
        if (!app.wide) {
            AnimatedVisibility(
                notesOpen, enter = slideInVertically { it } + fadeIn(), exit = slideOutVertically { it } + fadeOut(),
                modifier = Modifier.align(Alignment.BottomCenter),
            ) {
                NotesPanel(
                    session, listState, onClose = { notesOpen = false },
                    modifier = Modifier.fillMaxWidth().height(380.dp).clip(RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp)),
                )
            }
        }
    }
}

@Composable
private fun TopBar(
    app: AppScope, title: String, pageCount: Int?, listState: LazyListState,
    zoom: Int, onZoom: (Int) -> Unit, notesOpen: Boolean, onNotes: () -> Unit,
) {
    Surface(color = Folio.colors.card, shadowElevation = 2.dp) {
        Row(Modifier.fillMaxWidth().windowInsetsPadding(WindowInsets.statusBars).padding(horizontal = 4.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = { app.nav.pop() }) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Back") }
            Column(Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (pageCount != null) Text("Page ${listState.firstVisibleItemIndex + 1} of $pageCount", style = MaterialTheme.typography.bodySmall, color = Folio.colors.muted)
            }
            IconButton(onClick = { if (zoom > 0) onZoom(zoom - 1) }, enabled = zoom > 0) { Icon(Icons.Outlined.ZoomOut, "Zoom out") }
            if (app.wide) Text("${(zoomSteps[zoom] * 100).toInt()}%", style = MaterialTheme.typography.labelMedium, modifier = Modifier.width(44.dp))
            IconButton(onClick = { if (zoom < zoomSteps.lastIndex) onZoom(zoom + 1) }, enabled = zoom < zoomSteps.lastIndex) { Icon(Icons.Outlined.ZoomIn, "Zoom in") }
            IconButton(onClick = onNotes) {
                Icon(Icons.AutoMirrored.Outlined.StickyNote2, "Notes", tint = if (notesOpen) MaterialTheme.colorScheme.secondary else MaterialTheme.colorScheme.onBackground)
            }
        }
    }
}

@Composable
private fun Pages(
    doc: PdfDocument, zoom: Float, listState: LazyListState, hScroll: ScrollState,
    session: InkSession, settings: InkSettings, scrollEnabled: Boolean,
    onInking: (Boolean) -> Unit, onInk: () -> Unit,
) {
    val app = LocalApp.current
    val pen = app.graph.platform.pen
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val available = maxWidth
        // Fit to width on phones; a comfortable reading column on wide screens.
        val base = minOf(available - 16.dp, 860.dp)
        val pageWidth = base * zoom
        val density = LocalDensity.current
        val widthPx = with(density) { pageWidth.roundToPx() }.coerceAtMost(2600)
        val cache = remember(doc) { LinkedHashMap<String, ImageBitmap>() }
        Box(Modifier.fillMaxSize().horizontalScroll(hScroll, enabled = scrollEnabled), contentAlignment = Alignment.TopCenter) {
            LazyColumn(
                state = listState,
                userScrollEnabled = scrollEnabled,
                modifier = Modifier.width(maxOf(pageWidth + 16.dp, available)),
                contentPadding = PaddingValues(top = 12.dp, bottom = 120.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                items(doc.pageCount) { index ->
                    val key = "$index@$widthPx"
                    val bitmap by produceState(cache[key], key) {
                        if (value == null) {
                            val rendered = doc.render(index, widthPx)
                            cache[key] = rendered
                            while (cache.size > 10) cache.remove(cache.keys.first())
                            value = rendered
                        }
                    }
                    Box(
                        Modifier.width(pageWidth).aspectRatio(1f / doc.aspectRatio(index))
                            .shadow(4.dp, RoundedCornerShape(4.dp)).clip(RoundedCornerShape(4.dp)).background(Color.White)
                            .inkInput(
                                page = index, session = session, settings = settings, pen = pen,
                                onPan = { d -> listState.dispatchRawDelta(-d.y); hScroll.dispatchRawDelta(-d.x) },
                                onInkingChange = onInking, onInk = onInk,
                            ),
                        contentAlignment = Alignment.Center,
                    ) {
                        val b = bitmap
                        if (b == null) CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.dp, color = Color(0xFFB0ACA3))
                        else Image(b, "Page ${index + 1}", Modifier.fillMaxSize(), contentScale = ContentScale.FillWidth)
                        // Finished strokes, then the stroke in progress, on their own layers so
                        // drawing doesn't repaint the whole page. Offscreen so highlighter multiplies.
                        Canvas(Modifier.fillMaxSize().graphicsLayer { compositingStrategy = CompositingStrategy.ModulateAlpha }) {
                            drawStrokes(session.strokes.filter { it.page == index })
                        }
                        Canvas(Modifier.fillMaxSize()) {
                            if (session.livePage == index) drawStroke(session.liveTool, session.liveColor, session.liveWidth, session.livePoints.toList())
                        }
                    }
                }
            }
        }
    }
}

/** Floating pill: pen, highlighter, eraser, colour, undo/redo, and whether touch writes. */
@Composable
private fun InkToolbar(settings: InkSettings, session: InkSession, modifier: Modifier = Modifier) {
    var palette by remember { mutableStateOf(false) }
    var hint by remember { mutableStateOf(false) }
    LaunchedEffect(hint) { if (hint) { kotlinx.coroutines.delay(4500); hint = false } }

    fun pick(tool: Tool) {
        if (settings.tool == tool && tool != Tool.ERASER) palette = !palette else palette = false
        settings.tool = tool
        if (!settings.stylusSeen && !settings.touchDraws) hint = true
    }

    CompositionLocalProvider(LocalMinimumInteractiveComponentSize provides Dp.Unspecified) {
        Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
            AnimatedVisibility(hint, enter = fadeIn(), exit = fadeOut()) {
                Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.onBackground, contentColor = MaterialTheme.colorScheme.background, modifier = Modifier.padding(bottom = 10.dp)) {
                    Text("Write with your stylus. To use a finger or mouse, turn on the hand.", style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp))
                }
            }
            AnimatedVisibility(palette, enter = fadeIn() + slideInVertically { it / 2 }, exit = fadeOut()) {
                Palette(settings, Modifier.padding(bottom = 10.dp))
            }
            Surface(shape = RoundedCornerShape(22.dp), color = Folio.colors.card, shadowElevation = 10.dp) {
                Row(Modifier.padding(horizontal = 6.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    ToolButton(Icons.Outlined.Edit, "Pen", settings.tool == Tool.PEN, dot = Color(settings.penColor)) { pick(Tool.PEN) }
                    ToolButton(Icons.Outlined.BorderColor, "Highlighter", settings.tool == Tool.HIGHLIGHTER, dot = Color(settings.highlighterColor)) { pick(Tool.HIGHLIGHTER) }
                    ToolButton(EraserIcon, "Eraser", settings.tool == Tool.ERASER) { pick(Tool.ERASER) }
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
private fun ToolButton(icon: ImageVector, label: String, selected: Boolean, enabled: Boolean = true, dot: Color? = null, onClick: () -> Unit) {
    Box(
        Modifier.size(44.dp).clip(RoundedCornerShape(14.dp))
            .background(if (selected) Folio.colors.highlight else Color.Transparent),
        contentAlignment = Alignment.Center,
    ) {
        IconButton(onClick = onClick, enabled = enabled, modifier = Modifier.size(44.dp)) {
            Icon(icon, label, Modifier.size(20.dp), tint = when {
                selected -> Folio.colors.onHighlight
                enabled -> MaterialTheme.colorScheme.onBackground
                else -> Folio.colors.muted.copy(alpha = 0.5f)
            })
        }
        if (dot != null) {
            Box(Modifier.align(Alignment.BottomCenter).padding(bottom = 4.dp).size(width = 14.dp, height = 3.dp).clip(CircleShape).background(dot))
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Palette(settings: InkSettings, modifier: Modifier = Modifier) {
    val highlighter = settings.tool == Tool.HIGHLIGHTER
    Surface(modifier, shape = RoundedCornerShape(18.dp), color = Folio.colors.card, shadowElevation = 8.dp) {
        Row(Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
            val colors = if (highlighter) HighlighterColors else PenColors
            val current = if (highlighter) settings.highlighterColor else settings.penColor
            colors.forEach { c ->
                Box(
                    Modifier.padding(4.dp).size(28.dp).clip(CircleShape).background(Color(c))
                        .then(if (c == current) Modifier.border(3.dp, MaterialTheme.colorScheme.onBackground.copy(alpha = 0.7f), CircleShape) else Modifier)
                        .clickableNoRipple { if (highlighter) settings.highlighterColor = c else settings.penColor = c },
                )
            }
            if (!highlighter) {
                Divider()
                listOf(0, 1, 2).forEach { i ->
                    Box(
                        Modifier.padding(2.dp).size(32.dp).clip(CircleShape)
                            .background(if (settings.penWidth == i) Folio.colors.chip else Color.Transparent)
                            .clickableNoRipple { settings.penWidth = i },
                        contentAlignment = Alignment.Center,
                    ) { Box(Modifier.size((4 + i * 4).dp).clip(CircleShape).background(Color(settings.penColor))) }
                }
            }
        }
    }
}

private fun Modifier.clickableNoRipple(onClick: () -> Unit): Modifier = this.clickable(onClick = onClick)

/** Typed notes plus a list of the pages you've written on. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun NotesPanel(session: InkSession, listState: LazyListState, onClose: () -> Unit, modifier: Modifier = Modifier) {
    val scope = rememberCoroutineScope()
    Surface(modifier, color = Folio.colors.card, shadowElevation = 12.dp) {
        Column(Modifier.padding(20.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Notes", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.weight(1f))
                IconButton(onClick = onClose) { Icon(Icons.Outlined.Close, "Close notes") }
            }
            val pages = session.strokes.map { it.page }.distinct().sorted()
            if (pages.isNotEmpty()) {
                Text("WRITTEN ON", style = MaterialTheme.typography.labelSmall, color = Folio.colors.muted)
                Spacer(Modifier.height(8.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    pages.forEach { p ->
                        Surface(onClick = { scope.launch { listState.animateScrollToItem(p) } }, shape = RoundedCornerShape(10.dp), color = Folio.colors.chip) {
                            Text("Page ${p + 1}", style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp))
                        }
                    }
                }
                Spacer(Modifier.height(16.dp))
            }
            Text("YOUR THOUGHTS", style = MaterialTheme.typography.labelSmall, color = Folio.colors.muted)
            Spacer(Modifier.height(8.dp))
            Box(Modifier.fillMaxWidth().weight(1f).clip(RoundedCornerShape(14.dp)).background(Folio.colors.chip).padding(14.dp)) {
                if (session.text.isEmpty()) Text("Ideas, questions, things to look up…", style = MaterialTheme.typography.bodyMedium, color = Folio.colors.muted)
                BasicTextField(
                    value = session.text,
                    onValueChange = session::textChanged,
                    textStyle = MaterialTheme.typography.bodyMedium.copy(color = MaterialTheme.colorScheme.onBackground),
                    cursorBrush = SolidColor(MaterialTheme.colorScheme.secondary),
                    modifier = Modifier.fillMaxSize(),
                )
            }
            Spacer(Modifier.height(8.dp))
            Text("Saved automatically on this device.", style = MaterialTheme.typography.bodySmall, color = Folio.colors.muted)
        }
    }
}
