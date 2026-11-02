package app.folio

import app.folio.data.Curiosity
import app.folio.data.Downloads
import app.folio.data.NotesStore
import app.folio.data.Paper
import app.folio.data.PaperRepository
import app.folio.data.Store
import app.folio.data.Topic
import app.folio.data.sources.ArxivSource
import app.folio.data.sources.EuropePmcSource
import app.folio.data.sources.OpenAlexSource
import app.folio.ui.components.FeedController
import app.folio.ui.components.today
import io.ktor.client.HttpClient
import io.ktor.client.plugins.HttpTimeout
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json

/** Hand-wired dependencies and the long-lived state behind each main screen. */
class AppGraph(val platform: Platform, val scope: CoroutineScope) {
    val json = Json { ignoreUnknownKeys = true; explicitNulls = false; encodeDefaults = true }

    val http = HttpClient {
        install(HttpTimeout) {
            connectTimeoutMillis = 15_000
            requestTimeoutMillis = 90_000
        }
    }

    val store = Store(platform.fileSystem, platform.dataDir, json, scope)

    val repository = PaperRepository(
        listOf(
            ArxivSource(http),
            EuropePmcSource(http, json),
            OpenAlexSource(http, json, apiKey = { store.settings.value.openAlexKey }),
        ),
    )

    val downloads = Downloads(http, platform.fileSystem, platform.dataDir, store, scope)

    val notes = NotesStore(platform.fileSystem, platform.dataDir, json, scope)

    /** Pen, colour and width choices, shared by every paper you open. */
    val ink = app.folio.ink.InkSettings()

    val home = HomePresenter(this)
    val search = SearchPresenter(this)

    /** Topic feeds stay alive while you open papers from them and come back. */
    private val topicFeeds = LinkedHashMap<String, FeedController>()

    fun topicFeed(topic: Topic): FeedController = topicFeeds.getOrPut(topic.id) {
        if (topicFeeds.size >= 6) topicFeeds.remove(topicFeeds.keys.first())
        FeedController(scope).also { it.start(repository.latest(listOf(topic))) }
    }

    fun paper(id: String): Paper? = repository.cached(id) ?: store.entry(id)?.paper
}

data class CuriosityPick(val topic: String, val paper: Paper)

data class CuriosityState(
    val topics: List<String> = emptyList(),
    val picks: List<CuriosityPick> = emptyList(),
    val loading: Boolean = false,
)

class HomePresenter(private val graph: AppGraph) {
    val feed = FeedController(graph.scope)

    private val _curiosity = MutableStateFlow(CuriosityState())
    val curiosity: StateFlow<CuriosityState> = _curiosity.asStateFlow()
    private var shuffles = 0
    private var curiosityJob: Job? = null

    init {
        graph.scope.launch {
            graph.store.settings.map { it.interests }.distinctUntilChanged().collect { interests ->
                if (interests.isEmpty()) feed.clear() else feed.start(graph.repository.latest(interests))
                if (_curiosity.value.picks.isEmpty()) loadCuriosity()
            }
        }
    }

    fun refresh() {
        val interests = graph.store.settings.value.interests
        if (interests.isNotEmpty()) feed.start(graph.repository.latest(interests))
    }

    fun shuffle() {
        shuffles++
        loadCuriosity()
    }

    /** A few subjects outside the reader's interests, two good papers each, different every day. */
    private fun loadCuriosity() {
        curiosityJob?.cancel()
        val day = today().toEpochDays()
        val topics = Curiosity.pick(graph.store.settings.value.interests, seed = day * 31 + shuffles, count = 5)
        _curiosity.value = CuriosityState(topics = topics, loading = true)
        curiosityJob = graph.scope.launch {
            val jobs = topics.map { topic ->
                launch {
                    val page = graph.repository.search(topic, pageSize = 6).loadMore()
                    val picks = page.papers
                        .filter { it.abstract.length > 200 }
                        .sortedByDescending { (if (it.pdfUrl != null) 1 else 0) }
                        .take(2)
                        .map { CuriosityPick(topic, it) }
                    _curiosity.update { s -> s.copy(picks = (s.picks + picks).sortedBy { topics.indexOf(it.topic) }) }
                }
            }
            jobs.forEach { it.join() }
            _curiosity.update { it.copy(loading = false) }
        }
    }
}

class SearchPresenter(private val graph: AppGraph) {
    val feed = FeedController(graph.scope)
    val query = MutableStateFlow("")
    val source = MutableStateFlow<app.folio.data.Source?>(null)
    val recent = MutableStateFlow<List<String>>(emptyList())

    /** The query the current results are for. */
    val submitted = MutableStateFlow("")

    fun onQueryChange(value: String) {
        query.value = value
    }

    fun clear() {
        query.value = ""
        submitted.value = ""
        feed.clear()
    }

    fun setSource(s: app.folio.data.Source?) {
        source.value = s
        if (submitted.value.isNotBlank()) submit(submitted.value)
    }

    fun submit(text: String = query.value) {
        val q = text.trim()
        if (q.isEmpty()) return
        query.value = q
        submitted.value = q
        recent.update { (listOf(q) + it.filterNot { r -> r.equals(q, ignoreCase = true) }).take(8) }
        feed.start(graph.repository.search(q, only = source.value))
    }
}
