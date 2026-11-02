package app.folio.ui.components

import app.folio.data.Feed
import app.folio.data.Paper
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class FeedUiState(
    val papers: List<Paper> = emptyList(),
    /** First page in flight. */
    val loading: Boolean = false,
    /** Later page in flight. */
    val loadingMore: Boolean = false,
    val problems: List<String> = emptyList(),
    val endReached: Boolean = false,
    val started: Boolean = false,
)

/** Drives a [Feed] for a screen: first load, infinite scroll and refresh. */
class FeedController(private val scope: CoroutineScope) {
    private val _state = MutableStateFlow(FeedUiState())
    val state: StateFlow<FeedUiState> = _state.asStateFlow()

    private var feed: Feed? = null
    private var job: Job? = null

    fun start(newFeed: Feed) {
        job?.cancel()
        feed = newFeed
        _state.value = FeedUiState(loading = true, started = true)
        job = scope.launch { load(newFeed) }
    }

    fun clear() {
        job?.cancel()
        feed = null
        _state.value = FeedUiState()
    }

    fun loadMore() {
        val current = feed ?: return
        val s = _state.value
        if (s.loading || s.loadingMore || s.endReached) return
        _state.update { it.copy(loadingMore = true) }
        job = scope.launch { load(current) }
    }

    private suspend fun load(target: Feed) {
        var page = target.loadMore()
        // A page can come back empty after de-duplication; keep going a couple of times.
        var tries = 0
        while (page.papers.isEmpty() && !page.endReached && page.problems.isEmpty() && tries++ < 2) {
            page = target.loadMore()
        }
        if (feed !== target) return
        _state.update {
            it.copy(
                papers = it.papers + page.papers,
                loading = false,
                loadingMore = false,
                problems = page.problems,
                endReached = page.endReached || (page.papers.isEmpty() && page.problems.isNotEmpty() && it.papers.isEmpty()),
            )
        }
    }
}
