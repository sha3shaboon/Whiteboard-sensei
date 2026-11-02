# Folio: an open papers library

Folio collects new open-access research papers on whatever you're curious about and turns them
into a bookshelf you can browse, save and read offline. It runs on **Android** and **desktop**
(Windows, macOS, Linux) from one Kotlin codebase built with
[Compose Multiplatform](https://www.jetbrains.com/compose-multiplatform/). The shared code avoids
JVM-only APIs, so an **iOS** target can be added later.

Papers come from three free sources:

| Source | Covers |
|---|---|
| [arXiv](https://info.arxiv.org/help/api/) | Preprints in physics, maths, CS, quantitative biology, stats, economics |
| [Europe PMC](https://europepmc.org/RestfulWebService) | Open-access life-science and biomedical papers, including preprints |
| [OpenAlex](https://docs.openalex.org) | An open catalogue of scholarly works in every field |

![Desktop: Discover](docs/screenshots/desktop-home.png)

| Phone: Discover | Paper | Offline reader | Interests |
|---|---|---|---|
| ![](docs/screenshots/phone-home.png) | ![](docs/screenshots/phone-paper.png) | ![](docs/screenshots/phone-reader.png) | ![](docs/screenshots/phone-interests.png) |

More in [docs/screenshots](docs/screenshots), including dark mode and the full Discover page.

## Features

- **Generated covers.** Papers have no cover art, so Folio draws one for each paper. It works
  out the paper's field from its arXiv category or keywords: AI & computing, physics, space,
  maths, life sciences, health, mind & brain, earth & climate, materials & energy, society, or
  history & culture. Then it draws a motif for that field (networks, waves, orbits, cells, pulse
  lines, contour maps, crystal lattices…) in the field's colours and sets the title like a book
  cover. The same paper always gets the same cover, so the subject is clear at a glance.
- **Any interest you like.** Type anything ("coral reefs", "sourdough microbes", "Byzantine
  history") and Folio follows it. You can also pick from 23 popular fields, or tap
  **Follow topic** on any search.
- **Discover**
  - *Fresh for you*: the newest papers across your interests, mixed from all sources.
  - *Your interests*: one tile per topic, each opening its own feed.
  - *Curiosity shelf*: papers on subjects **outside** your interests (octopus intelligence,
    Roman concrete, fast radio bursts…). It picks new subjects every day, and Shuffle picks more.
  - *More new papers*: the list continues as you scroll.
- **Offline reading.** Download a paper's PDF and read it in the app, with zoom. Folio remembers
  your page, marks the paper read, and keeps it on the **Offline** shelf.
- **Library.** Saved papers as a bookshelf, with All / To read / Read / Offline shelves.
- **Adaptive layout.** Phones get a bottom bar. Tablets and desktop (840 dp and wider) get the
  sidebar layout. Light and dark themes, or follow the system.

## Project layout

```
composeApp/src/
  commonMain/   everything shared: data sources, feeds, library store, downloads, all UI
    data/                 Paper/Topic models, Repository (merge, dedupe, paging), Store, Downloads, Curiosity
    data/sources/         ArxivSource (Atom), EuropePmcSource, OpenAlexSource (JSON) on Ktor
    ui/cover/             Field classifier + generative cover art
    ui/screens/           Home, Search, Interests, Library, Paper, Reader, Topic feed, Settings, Shell
  androidMain/  MainActivity, Custom Tabs, share sheet, PDF rendering with PdfRenderer
  desktopMain/  Window, system browser, clipboard, PDF rendering with Apache PDFBox
  desktopTest/  live API checks and a screenshot tour of the real app
```

The platform layer is small. The `Platform` interface covers file storage, opening links,
sharing and opening PDFs. Each target implements it in about 100 lines.

## Build and run

Requires JDK 17+. Android also needs the Android SDK (platform 35).

```bash
./gradlew :composeApp:run                    # desktop app
./gradlew :composeApp:packageDistributionForCurrentOS   # .dmg / .msi / .deb installer
./gradlew :composeApp:assembleDebug          # Android APK in composeApp/build/outputs/apk/
./gradlew :composeApp:installDebug           # onto a connected phone
```

## Tests

```bash
./gradlew :composeApp:desktopTest                                   # offline: live checks skip
./gradlew :composeApp:desktopTest -Dlive=true                       # parse real arXiv / Europe PMC / OpenAlex
./gradlew :composeApp:desktopTest -Dlive=true -DshotsDir=/tmp/shots # also screenshot every screen
```

The screenshot tour drives the real app headlessly at phone and desktop sizes against the live
APIs. Along the way it downloads a real PDF and opens it in the reader.

## Notes

- Without a key, OpenAlex shares a small daily budget across everyone on the same IP address, and
  sometimes pauses anonymous search. When that happens the other sources keep working, and the
  list says what happened at the bottom. You can add a free key in **Settings**.
- arXiv asks clients to space out requests; Folio queues its arXiv calls about 1.2 s apart.
- Some publishers only serve a web page, not a PDF. Folio detects this and offers to open the
  paper online instead.
- Fonts: Poppins and DM Serif Display, both under the SIL Open Font License (see `licenses/`).
