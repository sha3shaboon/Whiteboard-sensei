package com.folio.papers.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.folio.papers.data.Source

// Ink and paper, with a single warm accent.
private val Ink = Color(0xFF0E0F13)
private val InkRaised = Color(0xFF16171D)
private val InkHigh = Color(0xFF1F2129)
private val InkLine = Color(0xFF2C2E38)
private val Paper = Color(0xFFECE7DD)
private val PaperMuted = Color(0xFF9A968E)
private val Ember = Color(0xFFF2A65A)
private val Sage = Color(0xFF8FB8A8)

private val Cream = Color(0xFFF7F4EE)
private val CreamRaised = Color(0xFFFFFFFF)
private val CreamHigh = Color(0xFFEFEAE1)
private val InkText = Color(0xFF1B1C22)
private val InkMuted = Color(0xFF6B675F)
private val Rust = Color(0xFFB0581A)

private val Dark = darkColorScheme(
    primary = Ember,
    onPrimary = Color(0xFF231405),
    primaryContainer = Color(0xFF3A2614),
    onPrimaryContainer = Color(0xFFFFD8B3),
    secondary = Sage,
    onSecondary = Color(0xFF0F1F19),
    secondaryContainer = Color(0xFF223029),
    onSecondaryContainer = Color(0xFFCDE7DC),
    background = Ink,
    onBackground = Paper,
    surface = Ink,
    onSurface = Paper,
    surfaceVariant = InkHigh,
    onSurfaceVariant = PaperMuted,
    surfaceContainerLowest = Ink,
    surfaceContainerLow = InkRaised,
    surfaceContainer = InkRaised,
    surfaceContainerHigh = InkHigh,
    surfaceContainerHighest = InkLine,
    outline = Color(0xFF4A4C57),
    outlineVariant = InkLine,
)

private val Light = lightColorScheme(
    primary = Rust,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFFFE2C8),
    onPrimaryContainer = Color(0xFF3A1D05),
    secondary = Color(0xFF3F6B5B),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFD6EADF),
    onSecondaryContainer = Color(0xFF0F2A20),
    background = Cream,
    onBackground = InkText,
    surface = Cream,
    onSurface = InkText,
    surfaceVariant = CreamHigh,
    onSurfaceVariant = InkMuted,
    surfaceContainerLowest = CreamRaised,
    surfaceContainerLow = CreamRaised,
    surfaceContainer = CreamRaised,
    surfaceContainerHigh = CreamHigh,
    surfaceContainerHighest = Color(0xFFE4DED3),
    outline = Color(0xFFB9B2A6),
    outlineVariant = Color(0xFFE0DAD0),
)

private val Serif = FontFamily.Serif
private val Sans = FontFamily.SansSerif

private val FolioType = Typography(
    displaySmall = TextStyle(fontFamily = Serif, fontWeight = FontWeight.Medium, fontSize = 34.sp, lineHeight = 40.sp, letterSpacing = (-0.5).sp),
    headlineMedium = TextStyle(fontFamily = Serif, fontWeight = FontWeight.Medium, fontSize = 28.sp, lineHeight = 34.sp, letterSpacing = (-0.3).sp),
    headlineSmall = TextStyle(fontFamily = Serif, fontWeight = FontWeight.Medium, fontSize = 24.sp, lineHeight = 31.sp),
    titleLarge = TextStyle(fontFamily = Serif, fontWeight = FontWeight.Medium, fontSize = 20.sp, lineHeight = 26.sp),
    titleMedium = TextStyle(fontFamily = Serif, fontWeight = FontWeight.Medium, fontSize = 17.sp, lineHeight = 23.sp),
    titleSmall = TextStyle(fontFamily = Sans, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, lineHeight = 20.sp),
    bodyLarge = TextStyle(fontFamily = Serif, fontSize = 17.sp, lineHeight = 28.sp),
    bodyMedium = TextStyle(fontFamily = Sans, fontSize = 14.sp, lineHeight = 21.sp),
    bodySmall = TextStyle(fontFamily = Sans, fontSize = 12.sp, lineHeight = 17.sp),
    labelLarge = TextStyle(fontFamily = Sans, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, lineHeight = 20.sp),
    labelMedium = TextStyle(fontFamily = Sans, fontWeight = FontWeight.Medium, fontSize = 12.sp, lineHeight = 16.sp, letterSpacing = 0.4.sp),
    labelSmall = TextStyle(fontFamily = Sans, fontWeight = FontWeight.SemiBold, fontSize = 10.sp, lineHeight = 14.sp, letterSpacing = 1.2.sp),
)

@Composable
fun FolioTheme(dark: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    val scheme = if (dark) Dark else Light
    MaterialTheme(colorScheme = scheme, typography = FolioType) {
        // Text outside a Surface would otherwise default to black, invisible on the ink background.
        CompositionLocalProvider(LocalContentColor provides scheme.onBackground, content = content)
    }
}

/** Each source gets its own accent so the origin of a paper reads at a glance. */
@Composable
fun Source.accent(): Color {
    val dark = MaterialTheme.colorScheme.background == Ink
    return when (this) {
        Source.ARXIV -> if (dark) Color(0xFFE57373) else Color(0xFFB3261E)
        Source.EUROPE_PMC -> if (dark) Color(0xFF6CC3BD) else Color(0xFF00726B)
        Source.OPENALEX -> if (dark) Color(0xFFA899F5) else Color(0xFF5B48C2)
    }
}
