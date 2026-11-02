package com.folio.papers

import android.app.Application
import com.folio.papers.data.LibraryStore
import com.folio.papers.data.PaperRepository
import com.folio.papers.data.sources.ArxivSource
import com.folio.papers.data.sources.EuropePmcSource
import com.folio.papers.data.sources.OpenAlexSource
import kotlinx.serialization.json.Json
import okhttp3.Cache
import okhttp3.OkHttpClient
import java.io.File
import java.util.concurrent.TimeUnit

class FolioApp : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
    }
}

/** Hand-wired dependencies; small enough not to need a DI framework yet. */
class AppContainer(app: Application) {
    val json = Json { ignoreUnknownKeys = true; explicitNulls = false }

    private val http = OkHttpClient.Builder()
        .cache(Cache(File(app.cacheDir, "http"), 20L * 1024 * 1024))
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    val library = LibraryStore(app, json)

    val repository = PaperRepository(
        listOf(
            ArxivSource(http),
            EuropePmcSource(http, json),
            OpenAlexSource(http, json, apiKey = { library.currentOpenAlexKey() }),
        ),
    )
}
