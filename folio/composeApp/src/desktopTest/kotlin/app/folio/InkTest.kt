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
        assertTrue(s.eraseAt(0, false, 0.52f, 0.1f, 0.01f), "eraser should hit the second stroke")
        assertEquals(2, s.strokes.size)
        assertFalse(s.eraseAt(0, false, 0.9f, 0.9f, 0.01f))
        s.undo(); assertEquals(3, s.strokes.size)
        s.undo(); assertEquals(2, s.strokes.size)
        s.redo(); assertEquals(3, s.strokes.size)
        assertTrue(s.canUndo && s.canRedo)
    }

    @Test
    fun whiteboardIsSeparateFromThePaper() {
        val s = InkSession(PaperNotes())
        s.add(stroke(0, 0.1f))
        s.add(stroke(0, 0.1f).copy(board = true))
        assertEquals(1, s.strokesOn(0, board = false).size)
        assertEquals(1, s.strokesOn(0, board = true).size)
        // Erasing on the board leaves the paper's stroke alone, even at the same spot.
        assertTrue(s.eraseAt(0, true, 0.12f, 0.1f, 0.01f))
        assertEquals(1, s.strokesOn(0, board = false).size)
        assertEquals(0, s.strokesOn(0, board = true).size)
        s.addSheet(); s.add(stroke(1, 0.2f).copy(board = true)); s.add(stroke(1, 0.6f).copy(board = true))
        s.clearSheet(1)
        assertEquals(0, s.strokesOn(1, board = true).size)
        s.undo()
        assertEquals(2, s.strokesOn(1, board = true).size, "undo brings a cleared sheet back")
        s.setStyle(app.folio.data.BoardStyle.LINES)
        val snap = s.snapshot(1)
        assertEquals(2, snap.boardSheets)
        assertEquals(app.folio.data.BoardStyle.LINES, snap.boardStyle)
        // Reopening restores sheets and style.
        val again = InkSession(snap)
        assertEquals(2, again.boardSheets)
        assertEquals(app.folio.data.BoardStyle.LINES, again.boardStyle)
    }

    @Test
    fun oldNotesStillLoad() {
        // Notes saved before the whiteboard existed have no board/pressure fields.
        val json = Json { ignoreUnknownKeys = true }
        val old = """{"strokes":[{"page":3,"tool":"PEN","color":4278190080,"width":0.004,"points":[0.1,0.1,1.0,0.2,0.2,1.0]}],"text":"hi","updatedAt":5}"""
        val notes = json.decodeFromString(PaperNotes.serializer(), old)
        assertEquals(false, notes.strokes.single().board)
        assertEquals(1f, notes.strokes.single().pressure)
        assertEquals(1, notes.boardSheets)
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
    fun size() {
        assertEquals(152, PointerTypeInfo().size(), "sizeof(POINTER_TYPE_INFO), pen")
        assertEquals(144, PointerTouchInfo().size(), "sizeof(POINTER_TOUCH_INFO)")
        assertEquals(152, TouchTypeInfo().size(), "sizeof(POINTER_TYPE_INFO), touch")
    }
}
