package app.folio.ui.components

import kotlinx.datetime.Clock
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.daysUntil
import kotlinx.datetime.todayIn

private val months = listOf("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
private val longMonths = listOf("January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December")
private val weekdays = listOf("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")

fun today(): LocalDate = Clock.System.todayIn(TimeZone.currentSystemDefault())

/** "Today", "3 days ago", or "12 Mar 2026". */
fun friendlyDate(iso: String, now: LocalDate = today()): String {
    val date = runCatching { LocalDate.parse(iso.take(10)) }.getOrNull() ?: return iso
    val days = date.daysUntil(now)
    return when {
        days == 0 -> "Today"
        days == 1 -> "Yesterday"
        days in 2..6 -> "$days days ago"
        else -> "${date.dayOfMonth} ${months[date.monthNumber - 1]} ${date.year}"
    }
}

fun longDate(date: LocalDate): String =
    "${weekdays[date.dayOfWeek.ordinal]}, ${date.dayOfMonth} ${longMonths[date.monthNumber - 1]}"

fun shortAuthors(authors: List<String>): String = when (authors.size) {
    0 -> "Unknown authors"
    1 -> authors[0]
    2 -> "${authors[0]} & ${authors[1]}"
    else -> "${authors[0]}, ${authors[1]} & ${authors.size - 2} more"
}

/** Rough reading time for the abstract, the way it shows on cards. */
fun readMinutes(abstract: String): Int = (abstract.split(' ').size / 200).coerceAtLeast(1)

fun formatBytes(bytes: Long): String = when {
    bytes < 1024 -> "$bytes B"
    bytes < 1024 * 1024 -> "${bytes / 1024} KB"
    else -> "${(bytes * 10 / (1024 * 1024)) / 10.0} MB"
}
