package app.folio.ui.cover

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import app.folio.data.Paper
import app.folio.data.Topic
import app.folio.ui.theme.Folio
import androidx.compose.material3.MaterialTheme
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.min
import kotlin.math.sin
import kotlin.random.Random

const val COVER_RATIO = 0.69f // width / height, like a paperback

private val CoverShape = RoundedCornerShape(topStart = 4.dp, bottomStart = 4.dp, topEnd = 10.dp, bottomEnd = 10.dp)

/** A book-style cover for a paper: field colours, a motif for its subject, and its title. */
@Composable
fun PaperCover(paper: Paper, modifier: Modifier = Modifier, elevation: Int = 10, showTitle: Boolean = true) {
    val field = remember(paper.id) { Field.of(paper) }
    CoverArt(
        field = field,
        seed = remember(paper.id) { seedOf(paper.id) },
        title = if (showTitle) paper.title else null,
        footer = listOf(paper.source.label, paper.year).filter { it.isNotBlank() }.joinToString(" · "),
        modifier = modifier,
        elevation = elevation,
    )
}

/** Cover-style tile for a topic (interest tiles, curiosity labels). */
@Composable
fun TopicCover(topic: Topic, modifier: Modifier = Modifier, elevation: Int = 6, showTitle: Boolean = true) {
    CoverArt(
        field = remember(topic.id) { Field.of(topic) },
        seed = remember(topic.id) { seedOf(topic.id) },
        title = if (showTitle) topic.name else null,
        footer = null,
        modifier = modifier,
        elevation = elevation,
        titleScale = 1.25f,
    )
}

@Composable
fun CoverArt(
    field: Field,
    seed: Int,
    title: String?,
    footer: String?,
    modifier: Modifier = Modifier,
    elevation: Int = 10,
    titleScale: Float = 1f,
) {
    val palette = field.palette(seed)
    Box(
        modifier
            .aspectRatio(COVER_RATIO)
            .shadow(elevation.dp, CoverShape, ambientColor = Color.Black.copy(alpha = 0.25f), spotColor = Color.Black.copy(alpha = 0.3f))
            .clip(CoverShape)
            .background(palette.background),
    ) {
        BoxWithConstraints(Modifier.fillMaxSize()) {
            val w = maxWidth.value
            val small = w < 96
            val motifShare = if (title == null || small) 1f else 0.56f

            Canvas(Modifier.fillMaxSize()) {
                val area = Size(size.width, size.height * motifShare)
                clipRect(0f, 0f, area.width, area.height) {
                    drawMotif(field.motif, palette, Random(seed), area)
                }
                if (motifShare < 1f) {
                    // Let the motif melt into the title panel.
                    drawRect(
                        Brush.verticalGradient(
                            listOf(palette.background.copy(alpha = 0f), palette.background),
                            startY = area.height * 0.72f, endY = area.height,
                        ),
                        topLeft = Offset(0f, area.height * 0.72f),
                        size = Size(area.width, area.height * 0.28f + 1f),
                    )
                }
            }

            if (small) {
                Box(
                    Modifier.align(Alignment.BottomStart).padding((w * 0.1f).dp)
                        .size((w * 0.34f).dp).clip(CircleShape).background(palette.background.copy(alpha = 0.92f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(field.icon, null, tint = palette.accent, modifier = Modifier.size((w * 0.22f).dp))
                }
            } else {
                Column(Modifier.fillMaxSize().padding(start = (w * 0.13f).dp, end = (w * 0.09f).dp, top = (w * 0.08f).dp, bottom = (w * 0.08f).dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(field.icon, null, tint = palette.ink, modifier = Modifier.size((w * 0.075f).dp))
                        Spacer(Modifier.width((w * 0.03f).dp))
                        Text(
                            field.label.uppercase(),
                            color = palette.ink,
                            fontSize = (w * 0.05f).sp,
                            fontWeight = FontWeight.SemiBold,
                            letterSpacing = 0.12.em,
                            maxLines = 1,
                            overflow = TextOverflow.Clip,
                            style = MaterialTheme.typography.labelSmall,
                            modifier = Modifier.background(palette.background.copy(alpha = 0.75f), RoundedCornerShape(4.dp)).padding(horizontal = 3.dp),
                        )
                    }
                    Spacer(Modifier.weight(1f))
                    // Solid panel behind the title so long titles never sit on top of the motif.
                    Column(
                        Modifier.fillMaxWidth()
                            .background(Brush.verticalGradient(0f to palette.background.copy(alpha = 0f), 0.12f to palette.background, 1f to palette.background))
                            .padding(top = (w * 0.05f).dp),
                    ) {
                    if (title != null) {
                        val len = title.length
                        val factor = when {
                            len <= 28 -> 0.125f
                            len <= 55 -> 0.102f
                            len <= 90 -> 0.086f
                            len <= 130 -> 0.074f
                            else -> 0.066f
                        } * titleScale
                        Box(Modifier.width((w * 0.16f).dp).height((w * 0.02f).dp).background(palette.accent))
                        Spacer(Modifier.height((w * 0.04f).dp))
                        Text(
                            title,
                            color = palette.ink,
                            fontFamily = Folio.serif,
                            fontSize = (w * factor).sp,
                            lineHeight = (w * factor * 1.1f).sp,
                            maxLines = 6,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    if (!footer.isNullOrBlank()) {
                        Spacer(Modifier.height((w * 0.05f).dp))
                        Text(
                            footer,
                            color = palette.ink.copy(alpha = 0.68f),
                            fontSize = (w * 0.05f).sp,
                            style = MaterialTheme.typography.labelMedium,
                            maxLines = 1,
                        )
                    }
                    }
                }
            }

            // Spine: a darker strip and a crease of light, so it reads as a book.
            Box(Modifier.fillMaxHeight().width((w * 0.055f).dp).background(Color.Black.copy(alpha = 0.16f)))
            Box(Modifier.fillMaxHeight().width(1.dp).offset(x = (w * 0.055f).dp).background(Color.White.copy(alpha = 0.22f)))
        }
    }
}

// ---------------------------------------------------------------------------------------------
// Motifs. Each is drawn from a seeded Random, so the same paper always gets the same picture.

private fun DrawScope.drawMotif(motif: Motif, p: Palette, r: Random, area: Size) {
    when (motif) {
        Motif.NETWORK -> network(p, r, area)
        Motif.WAVES -> waves(p, r, area)
        Motif.ORBITS -> orbits(p, r, area)
        Motif.GEOMETRY -> geometry(p, r, area)
        Motif.CELLS -> cells(p, r, area)
        Motif.PULSE -> pulse(p, r, area)
        Motif.CONTOURS -> contours(p, r, area)
        Motif.LATTICE -> lattice(p, r, area)
        Motif.BARS -> bars(p, r, area)
        Motif.BRANCHES -> branches(p, r, area)
        Motif.STRATA -> strata(p, r, area)
    }
}

private fun DrawScope.network(p: Palette, r: Random, a: Size) {
    val n = 13 + r.nextInt(6)
    val pts = List(n) { Offset(a.width * (0.1f + r.nextFloat() * 0.85f), a.height * (0.12f + r.nextFloat() * 0.8f)) }
    val stroke = a.width * 0.008f
    pts.forEachIndexed { i, pt ->
        pts.indices.filter { it != i }.sortedBy { hypot(pts[it].x - pt.x, pts[it].y - pt.y) }.take(2).forEach { j ->
            drawLine(p.accent.copy(alpha = 0.45f), pt, pts[j], strokeWidth = stroke)
        }
    }
    pts.forEachIndexed { i, pt ->
        val rad = a.width * (0.018f + r.nextFloat() * 0.03f)
        drawCircle(p.soft, rad * 1.9f, pt)
        drawCircle(if (i % 4 == 0) p.ink else p.accent, rad, pt)
    }
}

private fun DrawScope.waves(p: Palette, r: Random, a: Size) {
    drawCircle(p.soft, a.width * (0.32f + r.nextFloat() * 0.12f), Offset(a.width * (0.55f + r.nextFloat() * 0.3f), a.height * 0.38f))
    val lines = 9
    val freq = 1.5f + r.nextFloat() * 2f
    val phase = r.nextFloat() * 6f
    for (k in 0 until lines) {
        val path = Path()
        val baseY = a.height * (0.12f + k * 0.085f)
        val amp = a.height * (0.03f + 0.05f * sin(k * 0.6f + phase).let { it * it })
        var x = 0f
        path.moveTo(0f, baseY)
        while (x <= a.width) {
            val y = baseY + amp * sin((x / a.width) * freq * 2 * PI.toFloat() + phase + k * 0.45f)
            path.lineTo(x, y)
            x += a.width / 60f
        }
        drawPath(path, (if (k % 3 == 0) p.ink else p.accent).copy(alpha = 0.35f + 0.5f * (k % 2)), style = Stroke(a.width * 0.007f, cap = StrokeCap.Round))
    }
}

private fun DrawScope.orbits(p: Palette, r: Random, a: Size) {
    repeat(70) {
        drawCircle(p.ink.copy(alpha = 0.25f + r.nextFloat() * 0.6f), a.width * (0.002f + r.nextFloat() * 0.007f), Offset(r.nextFloat() * a.width, r.nextFloat() * a.height))
    }
    val c = Offset(a.width * (0.45f + r.nextFloat() * 0.25f), a.height * (0.42f + r.nextFloat() * 0.15f))
    val rad = a.width * (0.17f + r.nextFloat() * 0.08f)
    for (k in 1..3) {
        drawOval(p.soft, topLeft = Offset(c.x - rad * (1.3f + k * 0.45f), c.y - rad * (0.35f + k * 0.12f)),
            size = Size(rad * (2.6f + k * 0.9f), rad * (0.7f + k * 0.24f)), style = Stroke(a.width * 0.008f))
    }
    drawCircle(Brush.radialGradient(listOf(p.accent, p.accent.copy(alpha = 0.75f)), center = c - Offset(rad * 0.4f, rad * 0.4f), radius = rad * 1.6f), rad, c)
    drawCircle(p.ink.copy(alpha = 0.85f), rad * 0.18f, Offset(c.x + rad * 1.9f, c.y - rad * 0.6f))
}

private fun DrawScope.geometry(p: Palette, r: Random, a: Size) {
    val cols = 4
    val cell = a.width / cols
    val rows = (a.height / cell).toInt() + 1
    for (row in 0 until rows) for (col in 0 until cols) {
        val o = Offset(col * cell, row * cell)
        val color = when (r.nextInt(5)) { 0 -> p.accent; 1 -> p.ink; else -> p.soft }
        when (r.nextInt(4)) {
            0 -> drawCircle(color, cell * 0.42f, o + Offset(cell / 2, cell / 2))
            1 -> drawArc(color, 90f * r.nextInt(4), 180f, true, o + Offset(cell * 0.08f, cell * 0.08f), Size(cell * 0.84f, cell * 0.84f))
            2 -> drawPath(Path().apply {
                moveTo(o.x + cell * 0.1f, o.y + cell * 0.9f); lineTo(o.x + cell * 0.5f, o.y + cell * 0.1f); lineTo(o.x + cell * 0.9f, o.y + cell * 0.9f); close()
            }, color)
            else -> drawRect(color, o + Offset(cell * 0.14f, cell * 0.14f), Size(cell * 0.72f, cell * 0.72f))
        }
    }
}

private fun DrawScope.cells(p: Palette, r: Random, a: Size) {
    repeat(9 + r.nextInt(4)) {
        val c = Offset(r.nextFloat() * a.width, r.nextFloat() * a.height)
        val rad = a.width * (0.07f + r.nextFloat() * 0.13f)
        val blob = Path()
        val wobble = r.nextFloat() * 6f
        for (i in 0..36) {
            val t = i / 36f * 2 * PI.toFloat()
            val rr = rad * (1f + 0.08f * sin(3 * t + wobble) + 0.05f * cos(5 * t))
            val pt = Offset(c.x + rr * cos(t), c.y + rr * sin(t))
            if (i == 0) blob.moveTo(pt.x, pt.y) else blob.lineTo(pt.x, pt.y)
        }
        blob.close()
        drawPath(blob, p.soft)
        drawPath(blob, p.accent.copy(alpha = 0.7f), style = Stroke(a.width * 0.008f))
        drawCircle(p.accent, rad * 0.32f, c + Offset(rad * 0.15f, -rad * 0.1f))
        drawCircle(p.ink.copy(alpha = 0.5f), rad * 0.08f, c + Offset(-rad * 0.4f, rad * 0.35f))
    }
}

private fun DrawScope.pulse(p: Palette, r: Random, a: Size) {
    drawCircle(p.soft, a.width * 0.42f, Offset(a.width * 0.72f, a.height * 0.3f))
    repeat(5) {
        val c = Offset(r.nextFloat() * a.width, r.nextFloat() * a.height * 0.9f)
        val s = a.width * (0.035f + r.nextFloat() * 0.03f)
        drawRect(p.accent.copy(alpha = 0.5f), c - Offset(s, s / 3), Size(s * 2, s * 2 / 3))
        drawRect(p.accent.copy(alpha = 0.5f), c - Offset(s / 3, s), Size(s * 2 / 3, s * 2))
    }
    val y = a.height * (0.48f + r.nextFloat() * 0.12f)
    val path = Path().apply {
        moveTo(0f, y)
        var x = 0f
        while (x < a.width) {
            val beat = a.width * (0.22f + r.nextFloat() * 0.1f)
            lineTo(x + beat * 0.4f, y)
            lineTo(x + beat * 0.48f, y - a.height * 0.08f)
            lineTo(x + beat * 0.56f, y + a.height * 0.22f)
            lineTo(x + beat * 0.64f, y - a.height * 0.32f)
            lineTo(x + beat * 0.72f, y)
            x += beat
            lineTo(x, y)
        }
    }
    drawPath(path, p.accent, style = Stroke(a.width * 0.014f, cap = StrokeCap.Round))
}

private fun DrawScope.contours(p: Palette, r: Random, a: Size) {
    repeat(2) { hill ->
        val c = Offset(a.width * (0.25f + r.nextFloat() * 0.55f), a.height * (0.3f + r.nextFloat() * 0.45f))
        val ph = r.nextFloat() * 6f
        for (k in 1..9) {
            val base = a.width * 0.06f * k * (if (hill == 0) 1f else 0.75f)
            val path = Path()
            for (i in 0..48) {
                val t = i / 48f * 2 * PI.toFloat()
                val rr = base * (1f + 0.16f * sin(2 * t + ph + k * 0.3f) + 0.08f * cos(3 * t - ph))
                val pt = Offset(c.x + rr * cos(t), c.y + rr * 0.78f * sin(t))
                if (i == 0) path.moveTo(pt.x, pt.y) else path.lineTo(pt.x, pt.y)
            }
            path.close()
            drawPath(path, (if (k % 4 == 0) p.accent else p.ink.copy(alpha = 0.35f)), style = Stroke(a.width * (if (k % 4 == 0) 0.01f else 0.006f)))
        }
    }
}

private fun DrawScope.lattice(p: Palette, r: Random, a: Size) {
    val s = a.width * 0.11f
    val h = s * 1.732f
    var row = 0
    var y = -h / 2
    while (y < a.height + h) {
        var x = if (row % 2 == 0) 0f else s * 1.5f
        while (x < a.width + s) {
            val hex = Path()
            for (i in 0..5) {
                val t = PI.toFloat() / 3 * i
                val pt = Offset(x + s * cos(t), y + s * sin(t))
                if (i == 0) hex.moveTo(pt.x, pt.y) else hex.lineTo(pt.x, pt.y)
            }
            hex.close()
            if (r.nextInt(6) == 0) drawPath(hex, p.accent.copy(alpha = 0.85f)) else if (r.nextInt(3) == 0) drawPath(hex, p.soft)
            drawPath(hex, p.ink.copy(alpha = 0.3f), style = Stroke(a.width * 0.006f))
            drawCircle(p.ink.copy(alpha = 0.6f), a.width * 0.012f, Offset(x + s, y))
            x += s * 3
        }
        y += h / 2
        row++
    }
}

private fun DrawScope.bars(p: Palette, r: Random, a: Size) {
    val n = 7
    val gap = a.width * 0.03f
    val bw = (a.width * 0.86f - gap * (n - 1)) / n
    val tops = mutableListOf<Offset>()
    for (i in 0 until n) {
        val hgt = a.height * (0.2f + r.nextFloat() * 0.6f)
        val x = a.width * 0.1f + i * (bw + gap)
        drawRect(if (i == n - 2) p.accent else p.soft, Offset(x, a.height - hgt), Size(bw, hgt))
        tops += Offset(x + bw / 2, a.height - hgt - a.height * 0.06f)
    }
    val path = Path().apply { tops.forEachIndexed { i, t -> if (i == 0) moveTo(t.x, t.y) else lineTo(t.x, t.y) } }
    drawPath(path, p.ink.copy(alpha = 0.8f), style = Stroke(a.width * 0.01f, cap = StrokeCap.Round))
    tops.forEach { drawCircle(p.ink, a.width * 0.017f, it) }
}

private fun DrawScope.branches(p: Palette, r: Random, a: Size) {
    drawCircle(p.soft, a.width * 0.36f, Offset(a.width * 0.5f, a.height * 0.5f))
    fun branch(from: Offset, angle: Float, len: Float, depth: Int) {
        if (depth == 0 || len < a.width * 0.02f) return
        val to = Offset(from.x + len * cos(angle), from.y + len * sin(angle))
        drawLine(p.accent.copy(alpha = 0.55f + depth * 0.08f), from, to, strokeWidth = a.width * 0.0035f * depth, cap = StrokeCap.Round)
        if (depth == 1) drawCircle(p.ink.copy(alpha = 0.7f), a.width * 0.01f, to)
        val spread = 0.45f + r.nextFloat() * 0.35f
        branch(to, angle - spread, len * (0.62f + r.nextFloat() * 0.15f), depth - 1)
        branch(to, angle + spread, len * (0.62f + r.nextFloat() * 0.15f), depth - 1)
    }
    val c = Offset(a.width * 0.5f, a.height * 0.52f)
    val arms = 5 + r.nextInt(3)
    for (i in 0 until arms) {
        branch(c, (2 * PI.toFloat() / arms) * i + r.nextFloat() * 0.4f, min(a.width, a.height) * 0.2f, 5)
    }
    drawCircle(p.accent, a.width * 0.07f, c)
    drawCircle(p.ink, a.width * 0.025f, c)
}

private fun DrawScope.strata(p: Palette, r: Random, a: Size) {
    drawCircle(p.accent, a.width * (0.1f + r.nextFloat() * 0.05f), Offset(a.width * (0.25f + r.nextFloat() * 0.5f), a.height * 0.22f))
    val layers = 6
    for (k in 0 until layers) {
        val y0 = a.height * (0.38f + k * 0.11f)
        val ph = r.nextFloat() * 6f
        val path = Path().apply {
            moveTo(0f, a.height)
            var x = 0f
            lineTo(0f, y0)
            while (x <= a.width) {
                lineTo(x, y0 + a.height * 0.035f * sin(x / a.width * 4f + ph))
                x += a.width / 30f
            }
            lineTo(a.width, a.height)
            close()
        }
        val tint = if (k % 2 == 0) p.soft else p.ink.copy(alpha = 0.1f + k * 0.04f)
        drawPath(path, tint)
    }
}
