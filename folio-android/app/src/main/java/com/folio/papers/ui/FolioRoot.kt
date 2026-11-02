package com.folio.papers.ui

import android.net.Uri
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoStories
import androidx.compose.material.icons.filled.Explore
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.outlined.AutoStories
import androidx.compose.material.icons.outlined.Explore
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.folio.papers.AppContainer
import com.folio.papers.data.Paper
import com.folio.papers.ui.detail.PaperDetailScreen
import com.folio.papers.ui.discover.DiscoverScreen
import com.folio.papers.ui.discover.DiscoverViewModel
import com.folio.papers.ui.library.LibraryScreen
import com.folio.papers.ui.library.LibraryViewModel
import com.folio.papers.ui.library.SettingsScreen
import com.folio.papers.ui.search.SearchScreen
import com.folio.papers.ui.search.SearchViewModel
import com.folio.papers.ui.topics.TopicsScreen

private enum class Tab(val route: String, val label: String, val icon: ImageVector, val selectedIcon: ImageVector) {
    DISCOVER("discover", "Discover", Icons.Outlined.Explore, Icons.Filled.Explore),
    SEARCH("search", "Search", Icons.Outlined.Search, Icons.Filled.Search),
    LIBRARY("library", "Library", Icons.Outlined.AutoStories, Icons.Filled.AutoStories),
}

@Composable
fun FolioRoot(container: AppContainer, onboarded: Boolean) {
    val nav = rememberNavController()
    val snackbar = remember { SnackbarHostState() }
    // Tab view models live at activity scope so each tab keeps its list while you move around.
    val discoverVm = viewModel { DiscoverViewModel(container) }
    val searchVm = viewModel { SearchViewModel(container) }
    val libraryVm = viewModel { LibraryViewModel(container) }

    val entry by nav.currentBackStackEntryAsState()
    val route = entry?.destination?.route
    val showBar = Tab.entries.any { it.route == route }

    val openPaper: (Paper) -> Unit = { nav.navigate("paper/${Uri.encode(it.id)}") }

    Scaffold(
        modifier = Modifier.fillMaxSize(),
        containerColor = MaterialTheme.colorScheme.background,
        contentWindowInsets = WindowInsets(0),
        snackbarHost = { SnackbarHost(snackbar) },
        bottomBar = {
            AnimatedVisibility(showBar, enter = slideInVertically { it } + fadeIn(), exit = slideOutVertically { it } + fadeOut()) {
                BottomBar(nav, route)
            }
        },
    ) { padding ->
        NavHost(
            navController = nav,
            startDestination = if (onboarded) Tab.DISCOVER.route else "welcome",
            enterTransition = { fadeIn() },
            exitTransition = { fadeOut() },
        ) {
            composable("welcome") {
                TopicsScreen(container, firstRun = true) {
                    nav.navigate(Tab.DISCOVER.route) { popUpTo("welcome") { inclusive = true } }
                }
            }
            composable(Tab.DISCOVER.route) {
                DiscoverScreen(discoverVm, onOpen = openPaper, onEditTopics = { nav.navigate("topics") }, contentPadding = padding.withStatusBar())
            }
            composable(Tab.SEARCH.route) {
                SearchScreen(searchVm, onOpen = openPaper, contentPadding = padding.withStatusBar())
            }
            composable(Tab.LIBRARY.route) {
                LibraryScreen(
                    libraryVm, onOpen = openPaper, onSettings = { nav.navigate("settings") },
                    snackbar = snackbar, contentPadding = padding.withStatusBar(),
                )
            }
            composable(
                "paper/{id}",
                enterTransition = { slideInHorizontally { it / 3 } + fadeIn() },
                popExitTransition = { slideOutHorizontally { it / 3 } + fadeOut() },
            ) { backStack ->
                val id = Uri.decode(backStack.arguments?.getString("id").orEmpty())
                PaperDetailScreen(
                    paperId = id,
                    container = container,
                    onBack = { nav.popBackStack() },
                    onSearch = { tag ->
                        searchVm.submit(tag)
                        nav.switchTab(Tab.SEARCH.route)
                    },
                )
            }
            composable("topics") { TopicsScreen(container, firstRun = false) { nav.popBackStack() } }
            composable("settings") {
                SettingsScreen(container, onBack = { nav.popBackStack() }, onEditTopics = { nav.navigate("topics") })
            }
        }
    }
}

@Composable
private fun BottomBar(nav: NavHostController, route: String?) {
    NavigationBar(containerColor = MaterialTheme.colorScheme.surfaceContainerLow) {
        Tab.entries.forEach { tab ->
            val selected = route == tab.route
            NavigationBarItem(
                selected = selected,
                onClick = { nav.switchTab(tab.route) },
                icon = { Icon(if (selected) tab.selectedIcon else tab.icon, null) },
                label = { Text(tab.label) },
                colors = NavigationBarItemDefaults.colors(
                    selectedIconColor = MaterialTheme.colorScheme.onPrimaryContainer,
                    indicatorColor = MaterialTheme.colorScheme.primaryContainer,
                ),
            )
        }
    }
}

private fun NavHostController.switchTab(route: String) = navigate(route) {
    popUpTo(graph.findStartDestination().id) { saveState = true }
    launchSingleTop = true
    restoreState = true
}
