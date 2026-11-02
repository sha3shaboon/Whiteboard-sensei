package com.folio.papers.ui.components

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.browser.customtabs.CustomTabColorSchemeParams
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import com.folio.papers.data.Paper
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale

private val dayFormat = DateTimeFormatter.ofPattern("d MMM yyyy", Locale.getDefault())

/** "Today", "3 days ago", or "12 Mar 2026". */
fun friendlyDate(iso: String): String {
    val date = runCatching { LocalDate.parse(iso.take(10)) }.getOrNull() ?: return iso
    val days = ChronoUnit.DAYS.between(date, LocalDate.now())
    return when {
        days == 0L -> "Today"
        days == 1L -> "Yesterday"
        days in 2..6 -> "$days days ago"
        else -> date.format(dayFormat)
    }
}

fun shortAuthors(authors: List<String>): String = when (authors.size) {
    0 -> "Unknown authors"
    1 -> authors[0]
    2 -> "${authors[0]} & ${authors[1]}"
    else -> "${authors[0]}, ${authors[1]} & ${authors.size - 2} more"
}

fun openInBrowser(context: Context, url: String, toolbar: Color) {
    val params = CustomTabColorSchemeParams.Builder().setToolbarColor(toolbar.toArgb()).build()
    runCatching {
        CustomTabsIntent.Builder()
            .setDefaultColorSchemeParams(params)
            .setShowTitle(true)
            .build()
            .launchUrl(context, Uri.parse(url))
    }.onFailure {
        runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
    }
}

fun sharePaper(context: Context, paper: Paper) {
    val link = paper.doi?.let { "https://doi.org/$it" } ?: paper.landingUrl
    val send = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_SUBJECT, paper.title)
        putExtra(Intent.EXTRA_TEXT, "${paper.title}\n${shortAuthors(paper.authors)}\n$link")
    }
    context.startActivity(Intent.createChooser(send, "Share paper"))
}
