package app.folio

import app.folio.data.InkStroke
import app.folio.data.InkTool
import app.folio.data.NotesStore
import app.folio.data.PaperNotes
import app.folio.ink.InkSession
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.serialization.json.Json
import okio.FileSystem
import okio.Path.Companion.toPath
import java.nio.file.Files
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class InkTest {
    private fun stroke(page: Int, x: Float) = InkStroke(page, InkTool.PEN, 0xFF000000, 0.004f, listOf(x, 0.1f, 1f, x + 0.05f, 0.1f, 1f))

    @Test
    fun undoRedoAndErase() {
        val s = InkSession(PaperNotes())
        s.add(stroke(0, 0.1f)); s.add(stroke(0, 0.5f)); s.add(stroke(1, 0.1f))
        assertEquals(3, s.strokes.size)
        assertTrue(s.eraseAt(0, 0.52f, 0.1f, 0.01f), "eraser should hit the second stroke")
        assertEquals(2, s.strokes.size)
        assertFalse(s.eraseAt(0, 0.9f, 0.9f, 0.01f))
        s.undo(); assertEquals(3, s.strokes.size)
        s.undo(); assertEquals(2, s.strokes.size)
        s.redo(); assertEquals(3, s.strokes.size)
        assertTrue(s.canUndo && s.canRedo)
    }

    @Test
    fun notesRoundTrip() {
        val dir = Files.createTempDirectory("folio-notes").toString().toPath()
        val json = Json { ignoreUnknownKeys = true }
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        val store = NotesStore(FileSystem.SYSTEM, dir, json, scope)
        store.save("arxiv:1234.5678", PaperNotes(listOf(stroke(2, 0.3f)), "Check eq. 4", 1))
        Thread.sleep(300)
        val again = NotesStore(FileSystem.SYSTEM, dir, json, scope)
        assertEquals(setOf("arxiv:1234.5678"), again.annotated.value)
        val notes = again.load("arxiv:1234.5678")
        assertEquals("Check eq. 4", notes.text)
        assertEquals(2, notes.strokes.single().page)
    }

    /** Must match Windows' x64 layout exactly or GetPointerPenInfo writes past the buffer. */
    @Test
    fun win32StructLayout() {
        assertEquals(96, PointerInfo().size(), "sizeof(POINTER_INFO)")
        val pen = PointerPenInfo()
        assertEquals(120, pen.size(), "sizeof(POINTER_PEN_INFO)")
        // Write the fields and read the raw bytes back at the offsets Windows uses.
        pen.penFlags = 0x55; pen.pressure = 777; pen.write()
        assertEquals(0x55, pen.pointer.getInt(96), "penFlags offset")
        assertEquals(777, pen.pointer.getInt(104), "pressure offset")
    }
}

class CleanTextTest {
    @Test
    fun escapedTagsAndComparisons() {
        assertEquals("Ecological role of Acropora palmata in reefs", app.folio.data.sources.cleanText("Ecological role of &lt;i&gt;Acropora palmata&lt;/i&gt; in reefs"))
        assertEquals("Effect was large (p < 0.05) and > baseline", app.folio.data.sources.cleanText("Effect was large (p &lt; 0.05) and &gt; baseline"))
        assertEquals("H2O and CO2", app.folio.data.sources.cleanText("H<sub>2</sub>O and CO<sub>2</sub>"))
    }
}

class PointerTypeInfoLayoutTest {
    @Test
    fun size() = assertEquals(152, PointerTypeInfo().size(), "sizeof(POINTER_TYPE_INFO)")
}
