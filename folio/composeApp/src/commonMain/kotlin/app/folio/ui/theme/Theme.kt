package app.folio.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import app.folio.data.ThemeMode
import app.folio.resources.Res
import app.folio.resources.dmserifdisplay_regular
import app.folio.resources.poppins_bold
import app.folio.resources.poppins_medium
import app.folio.resources.poppins_regular
import app.folio.resources.poppins_semibold
import org.jetbrains.compose.resources.Font

/** Colours outside Material's scheme: the beige band behind headers and the orange highlight. */
@Immutable
data class FolioColors(
    val band: Color,
    val highlight: Color,
    val onHighlight: Color,
    val card: Color,
    val chip: Color,
    val muted: Color,
    val dark: Boolean,
)

val LocalFolioColors = staticCompositionLocalOf {
    FolioColors(Color(0xFFE9E4D4), Color(0xFFF26B3A), Color.White, Color.White, Color(0xFFF1EFEA), Color(0xFF8C8C90), false)
}

object Folio {
    val colors: FolioColors @Composable get() = LocalFolioColors.current
    val serif: FontFamily @Composable get() = FontFamily(Font(Res.font.dmserifdisplay_regular))
}

private val Green = Color(0xFF1F4B3F)

private val LightScheme = lightColorScheme(
    primary = Green,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFD5E6DF),
    onPrimaryContainer = Color(0xFF0E2A22),
    secondary = Color(0xFFF26B3A),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFFFE1D4),
    onSecondaryContainer = Color(0xFF4A1B08),
    tertiary = Color(0xFF8E5BB5),
    background = Color(0xFFF5F3EE),
    onBackground = Color(0xFF15161A),
    surface = Color(0xFFF5F3EE),
    onSurface = Color(0xFF15161A),
    surfaceVariant = Color(0xFFEEEBE4),
    onSurfaceVariant = Color(0xFF7D7D82),
    surfaceContainerLowest = Color.White,
    surfaceContainerLow = Color.White,
    surfaceContainer = Color.White,
    surfaceContainerHigh = Color(0xFFF1EFEA),
    surfaceContainerHighest = Color(0xFFE7E4DC),
    outline = Color(0xFFCFCBC2),
    outlineVariant = Color(0xFFE6E2D9),
)

private val DarkScheme = darkColorScheme(
    primary = Color(0xFF7CC4AC),
    onPrimary = Color(0xFF06231A),
    primaryContainer = Color(0xFF1D3A31),
    onPrimaryContainer = Color(0xFFC6EBDD),
    secondary = Color(0xFFFF8A5C),
    onSecondary = Color(0xFF2E0F02),
    secondaryContainer = Color(0xFF4A2414),
    onSecondaryContainer = Color(0xFFFFDBCB),
    tertiary = Color(0xFFD3A8F0),
    background = Color(0xFF121314),
    onBackground = Color(0xFFF1EEE8),
    surface = Color(0xFF121314),
    onSurface = Color(0xFFF1EEE8),
    surfaceVariant = Color(0xFF232427),
    onSurfaceVariant = Color(0xFF9C9BA0),
    surfaceContainerLowest = Color(0xFF0D0E0F),
    surfaceContainerLow = Color(0xFF1B1C1E),
    surfaceContainer = Color(0xFF1B1C1E),
    surfaceContainerHigh = Color(0xFF232427),
    surfaceContainerHighest = Color(0xFF2C2D31),
    outline = Color(0xFF45464B),
    outlineVariant = Color(0xFF2C2D31),
)

private val LightExtras = FolioColors(
    band = Color(0xFFE9E4D4), highlight = Color(0xFFF26B3A), onHighlight = Color.White,
    card = Color.White, chip = Color(0xFFF1EFEA), muted = Color(0xFF8C8C90), dark = false,
)
private val DarkExtras = FolioColors(
    band = Color(0xFF1F1E1A), highlight = Color(0xFFFF8A5C), onHighlight = Color(0xFF2E0F02),
    card = Color(0xFF1B1C1E), chip = Color(0xFF26272A), muted = Color(0xFF8E8D92), dark = true,
)

@Composable
private fun folioTypography(): Typography {
    val sans = FontFamily(
        Font(Res.font.poppins_regular, FontWeight.Normal),
        Font(Res.font.poppins_medium, FontWeight.Medium),
        Font(Res.font.poppins_semibold, FontWeight.SemiBold),
        Font(Res.font.poppins_bold, FontWeight.Bold),
    )
    return Typography(
        displayLarge = TextStyle(fontFamily = sans, fontWeight = FontWeight.Bold, fontSize = 40.sp, lineHeight = 46.sp, letterSpacing = (-0.8).sp),
        displayMedium = TextStyle(fontFamily = sans, fontWeight = FontWeight.Bold, fontSize = 34.sp, lineHeight = 40.sp, letterSpacing = (-0.6).sp),
        displaySmall = TextStyle(fontFamily = sans, fontWeight = FontWeight.Bold, fontSize = 30.sp, lineHeight = 36.sp, letterSpacing = (-0.5).sp),
        headlineMedium = TextStyle(fontFamily = sans, fontWeight = FontWeight.SemiBold, fontSize = 26.sp, lineHeight = 33.sp, letterSpacing = (-0.3).sp),
        headlineSmall = TextStyle(fontFamily = sans, fontWeight = FontWeight.SemiBold, fontSize = 22.sp, lineHeight = 29.sp, letterSpacing = (-0.2).sp),
        titleLarge = TextStyle(fontFamily = sans, fontWeight = FontWeight.Medium, fontSize = 19.sp, lineHeight = 26.sp),
        titleMedium = TextStyle(fontFamily = sans, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, lineHeight = 21.sp),
        titleSmall = TextStyle(fontFamily = sans, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, lineHeight = 18.sp),
        bodyLarge = TextStyle(fontFamily = sans, fontSize = 16.sp, lineHeight = 27.sp),
        bodyMedium = TextStyle(fontFamily = sans, fontSize = 13.5.sp, lineHeight = 20.sp),
        bodySmall = TextStyle(fontFamily = sans, fontSize = 12.sp, lineHeight = 17.sp),
        labelLarge = TextStyle(fontFamily = sans, fontWeight = FontWeight.Medium, fontSize = 13.5.sp, lineHeight = 18.sp),
        labelMedium = TextStyle(fontFamily = sans, fontWeight = FontWeight.Medium, fontSize = 12.sp, lineHeight = 16.sp),
        labelSmall = TextStyle(fontFamily = sans, fontWeight = FontWeight.SemiBold, fontSize = 10.5.sp, lineHeight = 14.sp, letterSpacing = 1.sp),
    )
}

@Composable
fun FolioTheme(mode: ThemeMode = ThemeMode.SYSTEM, content: @Composable () -> Unit) {
    val dark = when (mode) {
        ThemeMode.SYSTEM -> isSystemInDarkTheme()
        ThemeMode.LIGHT -> false
        ThemeMode.DARK -> true
    }
    val scheme = if (dark) DarkScheme else LightScheme
    MaterialTheme(colorScheme = scheme, typography = folioTypography()) {
        CompositionLocalProvider(
            LocalFolioColors provides if (dark) DarkExtras else LightExtras,
            LocalContentColor provides scheme.onBackground,
            content = content,
        )
    }
}
