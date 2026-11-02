package app.folio

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.runtime.collectAsState
import app.folio.ui.BackBus
import app.folio.ui.Navigator
import app.folio.ui.Screen
import app.folio.ui.screens.BottomBar
import app.folio.ui.screens.HomeScreen
import app.folio.ui.screens.InterestsScreen
import app.folio.ui.screens.LibraryScreen
import app.folio.ui.screens.PaperScreen
import app.folio.ui.screens.ReaderScreen
import app.folio.ui.screens.SearchScreen
import app.folio.ui.screens.SettingsScreen
import app.folio.ui.screens.Sidebar
import app.folio.ui.screens.TopicFeedScreen
import app.folio.ui.theme.FolioTheme
import kotlinx.coroutines.launch

/** Shared app state screens reach for: the graph, navigation, layout width and a snackbar. */
class AppScope(val graph: AppGraph, val nav: Navigator, val wide: Boolean, val snackbar: SnackbarHostState) {
    fun open(paper: app.folio.data.Paper) = nav.push(Screen.PaperDetail(paper.id))
}

val LocalApp = compositionLocalOf<AppScope> { error("No AppScope") }

@Composable
fun App(platform: Platform) {
    val scope = rememberCoroutineScope()
    val graph = remember { AppGraph(platform, scope) }
    App(graph)
}

@Composable
fun App(graph: AppGraph, start: Screen? = null) {
    val settings by graph.store.settings.collectAsState()
    val nav = remember { Navigator(start ?: if (graph.store.settings.value.onboarded) Screen.Home else Screen.Onboarding) }
    val snackbar = remember { SnackbarHostState() }
    val holder = rememberSaveableStateHolder()

    PlatformBackHandler(enabled = nav.canGoBack) { nav.pop() }
    DisposableEffect(nav) {
        BackBus.handler = { nav.pop() }
        onDispose { BackBus.handler = null }
    }

    // Forget saved scroll positions for screens that have left the stack.
    val keys = nav.stack.map { it.key }
    val seen = remember { mutableSetOf<Int>() }
    LaunchedEffect(keys) {
        (seen - keys.toSet()).forEach { holder.removeState(it) }
        seen.clear(); seen.addAll(keys)
    }

    FolioTheme(settings.theme) {
        BoxWithConstraints(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
            val wide = maxWidth >= 840.dp
            val app = remember(wide) { AppScope(graph, nav, wide, snackbar) }
            val screen = nav.current.screen
            val chrome = screen !is Screen.Onboarding && screen !is Screen.Reader

            CompositionLocalProvider(LocalApp provides app) {
                Row(Modifier.fillMaxSize()) {
                    if (wide && chrome) Sidebar()
                    Column(Modifier.weight(1f).fillMaxSize()) {
                        Box(Modifier.weight(1f).fillMaxWidth()) {
                            AnimatedContent(
                                targetState = nav.current,
                                transitionSpec = {
                                    (fadeIn() + slideInHorizontally { it / 12 }) togetherWith fadeOut()
                                },
                                contentKey = { it.key },
                                label = "screens",
                            ) { entry ->
                                holder.SaveableStateProvider(entry.key) {
                                    ScreenContent(entry.screen)
                                }
                            }
                            SnackbarHost(snackbar, Modifier.align(Alignment.BottomCenter).padding(16.dp).widthIn(max = 520.dp))
                        }
                        if (!wide && chrome && nav.tab != null && nav.stack.size == 1) BottomBar()
                    }
                }
            }
        }
    }
}

@Composable
private fun ScreenContent(screen: Screen) {
    when (screen) {
        Screen.Home -> HomeScreen()
        Screen.Search -> SearchScreen()
        Screen.Interests -> InterestsScreen(onboarding = false)
        Screen.Onboarding -> InterestsScreen(onboarding = true)
        is Screen.Library -> LibraryScreen(screen.offlineOnly)
        Screen.Settings -> SettingsScreen()
        is Screen.TopicFeed -> TopicFeedScreen(screen.topic)
        Screen.ForYou -> TopicFeedScreen(null)
        is Screen.PaperDetail -> PaperScreen(screen.id)
        is Screen.Reader -> ReaderScreen(screen.id, screen.notesOpen)
    }
}

/** Snackbar helper for screens. */
fun AppScope.toast(message: String) {
    graph.scope.launch { snackbar.showSnackbar(message) }
}
