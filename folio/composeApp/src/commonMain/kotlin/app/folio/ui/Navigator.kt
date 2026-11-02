package app.folio.ui

import androidx.compose.runtime.Stable
import androidx.compose.runtime.mutableStateListOf
import app.folio.data.Topic

sealed interface Screen {
    data object Home : Screen
    data object Search : Screen
    data object Interests : Screen
    data class Library(val offlineOnly: Boolean = false) : Screen
    data object Settings : Screen
    data object Onboarding : Screen
    data class TopicFeed(val topic: Topic) : Screen
    data object ForYou : Screen
    data class PaperDetail(val id: String) : Screen
    data class Reader(val id: String) : Screen
}

enum class Tab(val root: Screen) { HOME(Screen.Home), SEARCH(Screen.Search), INTERESTS(Screen.Interests), LIBRARY(Screen.Library()) }

class Entry(val key: Int, val screen: Screen)

/** A plain back stack: tabs reset it, everything else pushes onto it. */
@Stable
class Navigator(start: Screen) {
    private var nextKey = 0
    val stack = mutableStateListOf(Entry(nextKey++, start))

    val current: Entry get() = stack.last()
    val canGoBack: Boolean get() = stack.size > 1

    /** The tab the current stack belongs to. */
    val tab: Tab?
        get() = when (val root = stack.first().screen) {
            Screen.Home -> Tab.HOME
            Screen.Search -> Tab.SEARCH
            Screen.Interests -> Tab.INTERESTS
            is Screen.Library -> Tab.LIBRARY
            else -> null
        }

    fun push(screen: Screen) {
        stack.add(Entry(nextKey++, screen))
    }

    fun pop(): Boolean {
        if (!canGoBack) return false
        stack.removeAt(stack.lastIndex)
        return true
    }

    /** Start a fresh stack at [screen] (tab switches, finishing onboarding). */
    fun reset(screen: Screen) {
        val entry = Entry(nextKey++, screen)
        stack.clear()
        stack.add(entry)
    }
}

/** Lets the desktop window route Esc to the navigator without knowing about it. */
object BackBus {
    var handler: (() -> Boolean)? = null
}
