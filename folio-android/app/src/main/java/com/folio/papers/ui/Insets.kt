package com.folio.papers.ui

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.statusBars
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp

/** Scaffold padding (bottom bar) plus room for the status bar on top. */
@Composable
fun PaddingValues.withStatusBar(): PaddingValues = PaddingValues(
    top = WindowInsets.statusBars.asPaddingValues().calculateTopPadding(),
    bottom = calculateBottomPadding().coerceAtLeast(0.dp),
)
