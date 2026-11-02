package com.folio.papers.data

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json

private val Context.dataStore by preferencesDataStore(name = "folio")

/** On-device state: followed topics, the saved-paper library and settings. */
class LibraryStore(private val context: Context, private val json: Json) {
    private val topicsKey = stringSetPreferencesKey("topics")
    private val onboardedKey = booleanPreferencesKey("onboarded")
    private val savedKey = stringPreferencesKey("saved")
    private val openAlexKey = stringPreferencesKey("openalex_key")
    private val savedSerializer = ListSerializer(SavedPaper.serializer())

    val onboarded: Flow<Boolean> = context.dataStore.data.map { it[onboardedKey] ?: false }

    val topics: Flow<List<Topic>> = context.dataStore.data.map { prefs ->
        prefs[topicsKey].orEmpty().mapNotNull(Topics::get).sortedBy { Topics.all.indexOf(it) }
    }

    val saved: Flow<List<SavedPaper>> = context.dataStore.data.map { prefs ->
        prefs[savedKey]?.let { runCatching { json.decodeFromString(savedSerializer, it) }.getOrNull() }
            .orEmpty()
            .sortedByDescending { it.savedAt }
    }

    val openAlexApiKey: Flow<String> = context.dataStore.data.map { it[openAlexKey].orEmpty() }

    suspend fun currentOpenAlexKey(): String? = openAlexApiKey.first().ifBlank { null }

    suspend fun setTopics(ids: Set<String>) = context.dataStore.edit {
        it[topicsKey] = ids
        it[onboardedKey] = true
    }

    suspend fun setOpenAlexKey(key: String) = context.dataStore.edit { it[openAlexKey] = key.trim() }

    suspend fun toggleSaved(paper: Paper) = editSaved { list ->
        if (list.any { it.paper.id == paper.id }) list.filterNot { it.paper.id == paper.id }
        else list + SavedPaper(paper, savedAt = System.currentTimeMillis())
    }

    suspend fun remove(id: String) = editSaved { list -> list.filterNot { it.paper.id == id } }

    suspend fun restore(item: SavedPaper) = editSaved { list -> list.filterNot { it.paper.id == item.paper.id } + item }

    suspend fun setRead(id: String, read: Boolean) = editSaved { list ->
        list.map { if (it.paper.id == id) it.copy(read = read) else it }
    }

    private suspend fun editSaved(transform: (List<SavedPaper>) -> List<SavedPaper>) {
        context.dataStore.edit { prefs ->
            val current = prefs[savedKey]?.let { runCatching { json.decodeFromString(savedSerializer, it) }.getOrNull() }.orEmpty()
            prefs[savedKey] = json.encodeToString(savedSerializer, transform(current))
        }
    }
}
