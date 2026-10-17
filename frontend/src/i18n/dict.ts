/**
 * Minimal i18n — one flat dictionary, two languages, zero dependencies.
 *
 * English is the source of truth: every key exists in both languages and the
 * English value matches the pre-i18n UI strings exactly, so the default
 * language renders byte-identical to before. Placeholders use {name} syntax
 * and are replaced with plain string operations — no regex, no runtime that
 * could throw on a missing key.
 *
 * Two conventions hold the German text honest (measured defect: "Kritisch:
 * 1 Funde"):
 *
 * 1. Singular/Plural — a key that shows a count with a noun or a verb carries
 *    a twin named `…One` and the base key stays the plural form (the pattern
 *    `panel.findingsCountOne`/`…Many` already set). Callers pick with
 *    `plural()` below or with an `n === 1` branch; the number itself always
 *    stays in the `{count}`/`{n}` placeholder, never inside the noun.
 * 2. Numbers and units in a German sentence follow the house style used
 *    throughout this file: thin space between number and unit or percent
 *    ("31 s", "88 %", "512 Zeichen"), dot as thousands separator from 1000 up
 *    (`formatCount()`), decimal comma, en dash for ranges ("Zeilen 12–40").
 *    Engine names and file formats stay English inside German sentences —
 *    they are proper names of tools, not prose ("semgrep", "SARIF", "CVE").
 */

export type Lang = "en" | "de";

/** The full UI dictionary — exported so tests can audit key coverage. */
export const DICT = {
  "panel.historyCommit": { en: "Found in commit", de: "Fund in Commit" },
  "panel.historyEvidence": {
    en: "Historical finding. Inspect this revision; the current file is not its evidence.",
    de: "Historischer Fund. Prüfe diese Revision; die aktuelle Datei ist nicht der Beleg.",
  },
  "panel.sourceSeverity": { en: "Advisory severity:", de: "Schwere laut Advisory:" },
  // ── Skip link (WCAG 2.4.1) ───────────────────────────────────────────────
  "a11y.skipLink": { en: "Skip to content", de: "Zum Inhalt springen" },
  // ── Landing ───────────────────────────────────────────────────────────────
  "landing.homeAria": {
    en: "Ephemora Skyline home",
    de: "Ephemora Skyline Startseite",
  },
  "landing.localBadge": {
    en: "Local by design",
    de: "Lokal, mit Absicht",
  },
  /**
   * The badge is a claim, so it carries its own evidence: what the scan sends
   * out, what it never sends, and the switch that stops the rest.
   */
  /**
   * The duration was measured on the server route only (POST /api/analyze-local
   * → poll → result), so the label says what it covers: reading the folder is
   * the user's own disk work and is not in the number.
   */
  // No seconds here. The reference values this line used to print were measured
  // by a script that lives outside the repository, on a tree five days older than
  // this one; a claim the product cannot show the proof for is struck, not
  // relabelled. What remains is what is true without a stopwatch.
  "profile.durationNote": {
    en: "Duration depends on the folder's size and which engines ran — the progress line counts the seconds as they pass.",
    de: "Die Dauer hängt von der Größe des Ordners und den laufenden Prüfprogrammen ab — die Fortschrittszeile zählt die Sekunden mit.",
  },
  "profile.lookFor": {
    en: "What to look for",
    de: "Worauf achten",
  },
  "landing.localBadgeNote": {
    en: "Source code is never uploaded. Scanners fetch their own rule and advisory data (semgrep.dev, api.osv.dev, npm, one GitHub release check). SKYLINE_OFFLINE=1 stops every one of them.",
    de: "Quellcode wird nie hochgeladen. Die Scanner holen ihre Regel- und Sicherheitsdaten selbst (semgrep.dev, api.osv.dev, npm, ein GitHub-Release-Check). SKYLINE_OFFLINE=1 schaltet sie alle ab.",
  },
  "landing.langAria": {
    en: "Change display language",
    de: "Anzeigesprache wechseln",
  },
  "landing.category": {
    en: "A new view of your code",
    de: "Eine neue Sicht auf deinen Code",
  },
  "landing.h1a": {
    en: "Your codebase.",
    de: "Deine Codebase.",
  },
  "landing.h1b": {
    en: "A city to explore.",
    de: "Eine Stadt zum Erkunden.",
  },
  "landing.description": {
    en: "Turn your project into a living 3D city. Explore its structure, spot complex code, and follow security findings straight to the source.",
    de: "Verwandle dein Projekt in eine lebendige 3D-Stadt. Erkunde ihre Struktur, entdecke komplexen Code und folge Sicherheitsfunden direkt zur Quelle.",
  },
  "landing.primary": {
    en: "Choose project folder",
    de: "Projektordner wählen",
  },
  "landing.primaryCollecting": {
    en: "Reading your files…",
    de: "Dateien werden gelesen…",
  },
  "landing.primaryAnalyzing": {
    en: "Analyzing code…",
    de: "Code wird analysiert…",
  },
  "landing.secondary": {
    en: "Explore demo",
    de: "Demo ansehen",
  },
  "landing.secondaryLoading": {
    en: "Opening demo…",
    de: "Demo wird geöffnet…",
  },
  "landing.privacy": {
    en: "Your source code stays on this machine. No account needed.",
    de: "Dein Quellcode bleibt auf diesem Rechner. Kein Konto nötig.",
  },
  /**
   * The strongest claim on the entry screen, so the check is offered next to
   * it rather than only in the repository.
   */
  "landing.networkToggle": {
    en: "What leaves the machine",
    de: "Was die Maschine verlässt",
  },
  "landing.networkLead": {
    en: "Never your source. These are lookups the scanners make for themselves; each one carries a name, not code.",
    de: "Niemals dein Quellcode. Das sind Nachfragen, die die Scanner selbst stellen; jede trägt einen Namen, keinen Code.",
  },
  "landing.networkMadeBy": {
    en: "Made by",
    de: "Gemacht von",
  },
  "landing.networkWhen": {
    en: "When",
    de: "Wann",
  },
  "landing.networkOfflineSuffix": {
    en: "closes every row above.",
    de: "schließt jede Zeile oben.",
  },
  /**
   * The footprint is the privacy promise turned into a number the user can read,
   * check and act on without a terminal: what copies sit where, how long they
   * stay, and two buttons that remove them.
   */
  "landing.footprintLead": { en: "On this machine", de: "Auf diesem Rechner" },
  "landing.footprintPath": {
    en: "Copies of the folders you picked live in",
    de: "Kopien der Ordner, die du gewählt hast, liegen in",
  },
  "landing.footprintCopies": {
    en: "{n} copies · {bytes} on disk · kept {h} h",
    de: "{n} Kopien · {bytes} auf der Platte · gehalten {h} h",
  },
  "landing.footprintCopiesOne": {
    en: "{n} copy · {bytes} on disk · kept {h} h",
    de: "{n} Kopie · {bytes} auf der Platte · gehalten {h} h",
  },
  "landing.footprintStale": {
    en: "{n} past their keep time",
    de: "{n} über der Haltezeit",
  },
  "landing.footprintNone": { en: "nothing staged", de: "nichts zwischengelagert" },
  "landing.footprintApprox": {
    en: "(size counted only partly — the tree is large)",
    de: "(Größe nur teilweise gezählt — der Baum ist groß)",
  },
  "landing.footprintPurge": {
    en: "Delete the copies past their keep time",
    de: "Kopien über der Haltezeit löschen",
  },
  "landing.footprintRefresh": { en: "Look again", de: "Nachsehen" },
  "landing.footprintReset": {
    en: "Delete the verdicts saved in this browser",
    de: "Im Browser gespeicherte Urteile löschen",
  },
  "landing.footprintPurged": {
    en: "{n} copies deleted, {bytes} freed",
    de: "{n} Kopien gelöscht, {bytes} frei geworden",
  },
  "landing.footprintPurgedOne": {
    en: "{n} copy deleted, {bytes} freed",
    de: "{n} Kopie gelöscht, {bytes} frei geworden",
  },
  "landing.footprintResetDone": {
    en: "{n} verdict buckets removed from this browser",
    de: "{n} Urteils-Ablagen aus diesem Browser entfernt",
  },
  "landing.footprintResetDoneOne": {
    en: "{n} verdict bucket removed from this browser",
    de: "{n} Urteils-Ablage aus diesem Browser entfernt",
  },
  "landing.footprintError": {
    en: "The local server did not answer — is it running?",
    de: "Der lokale Server antwortet nicht — läuft er?",
  },
  /**
   * The canvas is announced before a city exists too; the driving instructions
   * belong to the version that has something to drive through.
   */
  "city.canvasAria": {
    en: "3D city visualization. Arrow keys turn the camera around the city, W A S D and Q E walk it, bracket keys step through the buildings, Tab moves to the controls.",
    de: "3D-Stadt-Visualisierung. Pfeiltasten drehen die Kamera um die Stadt, W A S D und Q E bewegen sie, eckige Klammern schalten die Gebäude durch, Tab erreicht die Bedienung.",
  },
  "city.canvasEmptyAria": {
    en: "3D city visualization. Nothing is built here yet.",
    de: "3D-Stadt-Visualisierung. Hier ist noch nichts gebaut.",
  },
  "city.rescueFrame": {
    en: "City out of view — bring it back",
    de: "Stadt außer Sicht — zurück ins Bild",
  },
  "landing.demoError": {
    en: "The demo couldn't load. Check that the local server is running, then try again.",
    de: "Die Demo konnte nicht geladen werden. Prüfe, ob der lokale Server läuft, und versuche es erneut.",
  },
  "app.permalinkError": {
    en: "The local server has no city under this link. Scans live in memory and are gone after a restart — open the folder again to rebuild the city.",
    de: "Der lokale Server kennt keine Stadt unter diesem Link. Scans liegen im Speicher und sind nach einem Neustart weg — Ordner erneut öffnen, um die Stadt neu zu bauen.",
  },
  "landing.progressCollecting": {
    en: "Reading your folder · {count} files",
    de: "Ordner wird gelesen · {count} Dateien",
  },
  "landing.progressCollectingOne": {
    en: "Reading your folder · {count} file",
    de: "Ordner wird gelesen · {count} Datei",
  },
  "landing.progressReady": {
    en: "Getting ready…",
    de: "Wird vorbereitet…",
  },
  "landing.progressAria": {
    en: "Project analysis",
    de: "Projektanalyse",
  },
  "landing.cancel": {
    en: "Cancel analysis",
    de: "Analyse abbrechen",
  },
  "landing.scanSettings": {
    en: "Scan settings",
    de: "Scan-Einstellungen",
  },
  "landing.scanSettingsHint": {
    en: "— choose the scan profile and depth here",
    de: "— hier Profil und Scan-Tiefe wählen",
  },
  "landing.scanDepth": {
    en: "Choose the depth of your scan.",
    de: "Wähle, wie tief gescannt wird.",
  },
  "landing.footer1": {
    en: "Understand the structure. Know where to look next.",
    de: "Verstehe die Struktur. Erkenne, wo es weitergeht.",
  },
  "landing.footer2": {
    en: "Folders become districts. Files become buildings.",
    de: "Ordner werden zu Stadtteilen. Dateien werden zu Gebäuden.",
  },
  "landing.illuTitle": {
    en: "Read your code as a city",
    de: "Deinen Code als Stadt lesen",
  },
  "landing.illuDesc": {
    en: "A sample district with six buildings. Each building represents a file; height represents complexity and a red beacon marks a security finding.",
    de: "Ein Beispiel-Stadtteil mit sechs Gebäuden. Jedes Gebäude steht für eine Datei, die Höhe für Komplexität; ein rotes Leuchtfeuer markiert einen Sicherheitsfund.",
  },
  "landing.illuRisk": {
    en: "Find the risk",
    de: "Finde das Risiko",
  },
  "landing.illuRiskCaption": {
    en: "Security findings glow red",
    de: "Sicherheitsfunde leuchten rot",
  },
  "landing.illuComplexity": {
    en: "See the complexity",
    de: "Sieh die Komplexität",
  },
  "landing.illuComplexityCaption": {
    en: "Taller buildings, more tangled code",
    de: "Höhere Gebäude, verflochtenerer Code",
  },
  "landing.illuDistrict": {
    en: "Explore a district",
    de: "Erkunde einen Stadtteil",
  },
  "landing.illuDistrictCaption": {
    en: "One folder. A neighborhood of files.",
    de: "Ein Ordner. Eine Nachbarschaft aus Dateien.",
  },
  "landing.illuFigcaption": {
    en: "Illustrative district",
    de: "Beispielhafter Stadtteil",
  },
  "landing.illuFigcaptionNote": {
    en: "Actual cities are built from your code.",
    de: "Echte Städte entstehen aus deinem Code.",
  },

  // ── HUD overlay ───────────────────────────────────────────────────────────
  "hud.backToStart": {
    en: "Back to start",
    de: "Zurück zum Start",
  },
  "hud.overviewTitle": {
    en: "Go to city overview",
    de: "Zur Stadtübersicht",
  },
  "hud.demoProject": {
    en: "Demo project",
    de: "Demo-Projekt",
  },
  /**
   * Fund 5 / UX-Punkt 4: "sample findings, no scan" lived only in the
   * dismissible summary, so a dismissed demo read "73 files · 3 Critical" with
   * nothing saying the numbers are synthetic. This line sits next to the city
   * name permanently — the demo states its own syntheticity on site.
   */
  "hud.demoSynth": {
    en: "◈ Sample findings · no scan",
    de: "◈ Beispielfunde · kein Scan",
  },
  "hud.connecting": {
    en: "Connecting…",
    de: "Verbindung wird hergestellt…",
  },
  "hud.localProject": {
    en: "Local project",
    de: "Lokales Projekt",
  },
  "hud.identityGuessedTitle": {
    en: "Verdicts are filed under this folder's name and layout — no project root is saved. Set one once (in a file card, next to Open in editor) so two folders called backend cannot share a bucket.",
    de: "Urteile liegen nach Ordnername und Struktur dieses Ordners — eine Projektwurzel fehlt. Trage sie einmal ein (in einer Dateikarte, neben „Im Editor öffnen“), damit sich zwei Ordner namens backend nicht denselben Bucket teilen.",
  },
  "hud.identityGuessedAria": {
    en: "Project identity inferred",
    de: "Projektzugehörigkeit abgeleitet",
  },
  "hud.filesUnit": {
    en: "files",
    de: "Dateien",
  },
  "hud.filterBySeverityAria": {
    en: "Filter city by severity",
    de: "Stadt nach Schweregrad filtern",
  },
  "hud.sevCritical": {
    en: "Critical",
    de: "Kritisch",
  },
  "hud.sevHigh": {
    en: "High",
    de: "Hoch",
  },
  "hud.sevMedium": {
    en: "Medium",
    de: "Mittel",
  },
  "hud.sevAriaOn": {
    en: "{label} findings: {count}. Clear filter",
    de: "{label}: {count} Funde. Filter aufheben",
  },
  "hud.sevAriaOnOne": {
    en: "{label} finding: {count}. Clear filter",
    de: "{label}: {count} Fund. Filter aufheben",
  },
  "hud.sevAriaOff": {
    en: "{label} findings: {count}. Filter city",
    de: "{label}: {count} Funde. Stadt filtern",
  },
  /**
   * Measured defect: the severity chip announced "Kritisch: 1 Funde". The
   * singular branch lives here so the caller only has to choose the key.
   */
  "hud.sevAriaOffOne": {
    en: "{label} finding: {count}. Filter city",
    de: "{label}: {count} Fund. Stadt filtern",
  },
  "hud.sevTitleOn": {
    en: "{label} findings — click to clear",
    de: "{label} — klicken, um den Filter aufzuheben",
  },
  "hud.sevTitleOff": {
    en: "{label} findings — click to filter",
    de: "{label} — klicken, um die Stadt zu filtern",
  },
  "hud.noFindings": {
    en: "No findings",
    de: "Keine Funde",
  },
  /**
   * The HUD carries the same condition as the panel: an empty list only means
   * clean when every scanner ran. One engine missing reads "lief nicht", two
   * read "liefen nicht" — the caller picks with the count of names.
   */
  "hud.noFindingsQual": {
    en: "No findings — {missing} did not run",
    de: "Keine Funde — {missing} lief nicht",
  },
  "hud.noFindingsQualMany": {
    en: "No findings — {missing} did not run",
    de: "Keine Funde — {missing} liefen nicht",
  },
  "hud.heightComplexity": {
    en: "Height = complexity",
    de: "Höhe = Komplexität",
  },
  "hud.phase0": {
    en: "The Ephe's are moving in…",
    de: "Die Ephe's ziehen ein…",
  },
  "hud.building": {
    en: "Building {name} · {done}/{total}",
    de: "{name} wird gebaut · {done}/{total}",
  },
  "hud.skip": {
    en: "Skip",
    de: "Überspringen",
  },
  "hud.skipAria": {
    en: "Skip city construction",
    de: "Stadtbau überspringen",
  },
  "hud.shortcutsHint": {
    en: "shortcuts",
    de: "Tastenkürzel",
  },
  "hud.shortcutsAria": {
    en: "Toggle keyboard shortcuts (press ? key)",
    de: "Tastenkürzel ein- oder ausblenden (Taste ?)",
  },

  // ── Action dock ───────────────────────────────────────────────────────────
  "actions.cityActionsAria": {
    en: "City actions",
    de: "Stadt-Aktionen",
  },
  "actions.triage": {
    en: "Triage",
    de: "Triage",
  },
  "actions.triageStartAria": {
    en: "Start triage",
    de: "Triage starten",
  },
  /**
   * The word the dock puts after the triage's count. The dock shows the triage
   * count and the findings button side by side, so both name the counted thing
   * with the same term — findings/Funde, never two words for one object.
   */
  "actions.triageOpenWord": {
    en: "findings",
    de: "Funde",
  },
  "actions.triageOpenWordOne": {
    en: "finding",
    de: "Fund",
  },
  "actions.triageOpenTitle": {
    en: "{open} findings in this queue still need a verdict",
    de: "{open} Funde in dieser Warteschlange brauchen noch ein Urteil",
  },
  "actions.triageOpenTitleOne": {
    en: "{open} finding in this queue still needs a verdict",
    de: "{open} Fund in dieser Warteschlange braucht noch ein Urteil",
  },
  "actions.triageAllJudgedTitle": {
    en: "Every finding in this view already has a verdict — the queue opens on the first one",
    de: "Jeder Fund in dieser Ansicht hat schon ein Urteil — die Warteschlange öffnet beim ersten",
  },
  "actions.triagePrevTitle": {
    en: "Previous finding without a verdict",
    de: "Vorheriger Fund ohne Urteil",
  },
  "actions.triageNextTitle": {
    en: "Next finding without a verdict",
    de: "Nächster Fund ohne Urteil",
  },
  "actions.triageNoneBehind": {
    en: "No finding without a verdict behind this one",
    de: "Kein Fund ohne Urteil weiter zurück",
  },
  "actions.triageNoneAhead": {
    en: "No finding without a verdict ahead of this one",
    de: "Kein Fund ohne Urteil weiter vorn",
  },
  "actions.prev": {
    en: "Prev",
    de: "Zurück",
  },
  "actions.next": {
    en: "Next",
    de: "Weiter",
  },
  "actions.exit": {
    en: "Exit",
    de: "Beenden",
  },
  "actions.finding": {
    en: "Finding",
    de: "Fund",
  },
  "actions.of": {
    en: "of",
    de: "von",
  },
  "actions.tour": {
    en: "Security tour",
    de: "Security-Tour",
  },
  "actions.tourActive": {
    en: "Tour active",
    de: "Tour läuft",
  },
  "actions.tourTitle": {
    en: "Visit security findings, highest priority first",
    de: "Sicherheitsfunde besuchen, höchste Priorität zuerst",
  },
  "actions.tourEmptyTitle": {
    en: "No findings to tour",
    de: "Keine Funde für eine Tour",
  },
  "actions.findings": {
    en: "Findings {count}",
    de: "Funde {count}",
  },
  "actions.findingsOne": {
    en: "Finding {count}",
    de: "Fund {count}",
  },
  "actions.findingsTitle": {
    en: "Review findings by file",
    de: "Funde je Datei durchsehen",
  },
  "actions.overview": {
    en: "Overview",
    de: "Übersicht",
  },
  "actions.overviewTitle": {
    en: "Return to the city overview",
    de: "Zurück zur Stadtübersicht",
  },
  "actions.more": {
    en: "More",
    de: "Mehr",
  },
  "actions.reduceEffects": {
    en: "Reduce effects",
    de: "Effekte reduzieren",
  },
  "update.available": {
    en: "Version {version} is available",
    de: "Version {version} ist verfügbar",
  },
  "update.whatsNew": {
    en: "What's new",
    de: "Was ist neu",
  },
  "update.check": {
    en: "Check for updates",
    de: "Nach Updates suchen",
  },
  "update.upToDate": {
    en: "You are up to date ({version})",
    de: "Du bist auf dem neuesten Stand ({version})",
  },
  "update.unavailable": {
    en: "Could not check for updates",
    de: "Update-Prüfung nicht möglich",
  },
  "mode.structure": {
    en: "STRUCTURE",
    de: "STRUKTUR",
  },
  "mode.security": {
    en: "SECURITY",
    de: "SICHERHEIT",
  },
  "mode.dependencies": {
    en: "DEPENDENCIES",
    de: "ABHÄNGIGKEITEN",
  },
  "mode.aria": {
    en: "View mode",
    de: "Ansichtsmodus",
  },
  "mode.structureTip": {
    en: "Architecture only — the default view",
    de: "Nur Architektur — die Standardansicht",
  },
  "mode.securityTip": {
    en: "City darkens, findings glow",
    de: "Die Stadt dunkelt ab, Funde leuchten",
  },
  "mode.dependenciesTip": {
    en: "Buildings recede, dependency routes glow",
    de: "Gebäude treten zurück, Abhängigkeitsadern leuchten",
  },
  /**
   * Which lens is on was paint only: an accent colour, a tint, a border and a
   * CSS dot grown from `aria-checked`. The product's rule is that colour is
   * never the only carrier, so the state gets two more channels — the
   * `aria-current` attribute on the control and the word below, read out as
   * its accessible description. The visible label keeps its plain name, so
   * voice control still hits "SECURITY".
   */
  "mode.stateOn": {
    en: "active",
    de: "aktiv",
  },
  "mode.stateOff": {
    en: "not active",
    de: "nicht aktiv",
  },
  "search.findingsGroup": {
    en: "Findings",
    de: "Fundstellen",
  },
  "search.filesGroup": {
    en: "Files",
    de: "Dateien",
  },
  "actions.updateCheck": {
    en: "Ask about new versions",
    de: "Nach neuen Versionen fragen",
  },
  // What the switch actually reaches: the landing's own version note. The
  // scanners' rule-pack and advisory lookups are a different surface and are
  // not switched here, so the sentence names only what changes.
  "actions.updateCheckOn": {
    en: "Version note on — the landing asks the release feed again",
    de: "Versionshinweis an — die Landung fragt wieder beim Release-Feed nach",
  },
  "actions.updateCheckOff": {
    en: "Version note off — the landing asks for nothing",
    de: "Versionshinweis aus — die Landung fragt nach nichts",
  },
  "actions.colorblindPalette": {
    en: "Colorblind-safe palette",
    de: "Farbsichere Palette",
  },
  "actions.language": {
    en: "Switch language (Deutsch)",
    de: "Sprache wechseln (English)",
  },
  "actions.languageSwitched": {
    en: "Language switched to English",
    de: "Sprache auf Deutsch umgestellt",
  },
  "actions.runTests": {
    en: "Run tests",
    de: "Tests ausführen",
  },
  "test.preparing": { en: "Preparing the scanned copy…", de: "Gescannte Kopie wird vorbereitet…" },
  "test.installing": {
    en: "Installing locked npm dependencies…",
    de: "Fixierte npm-Abhängigkeiten werden installiert…",
  },
  "test.running": { en: "Running project tests…", de: "Projekttests laufen…" },
  "test.failed": {
    en: "Test run could not finish",
    de: "Testlauf konnte nicht abgeschlossen werden",
  },
  "test.timeout": {
    en: "Test run timed out. Check the local server before retrying.",
    de: "Zeitlimit erreicht. Prüfe den lokalen Server vor einem erneuten Versuch.",
  },
  "test.expired": {
    en: "The server no longer holds this run. Scan the folder again.",
    de: "Der Server hält diesen Lauf nicht mehr. Scanne den Ordner erneut.",
  },
  "test.backend": {
    en: "Could not reach the local test runner",
    de: "Lokaler Test-Runner nicht erreichbar",
  },
  "test.noResults": {
    en: "The runner returned no usable results",
    de: "Der Runner lieferte keine verwertbaren Ergebnisse",
  },
  "test.summary": {
    en: "{passed} passed · {failed} failed · {skipped} skipped",
    de: "{passed} bestanden · {failed} fehlgeschlagen · {skipped} übersprungen",
  },
  "test.snapshot": {
    en: "Runs this test file in the scanned copy. Scan again after edits. First run may download locked npm dependencies. Vitest and Jest are supported.",
    de: "Führt diese Testdatei in der gescannten Kopie aus. Scanne nach Änderungen erneut. Beim ersten Lauf können fixierte npm-Abhängigkeiten heruntergeladen werden. Unterstützt werden Vitest und Jest.",
  },
  "test.skipped": { en: "Tests skipped", de: "Tests übersprungen" },
  "test.fileSkipped": { en: "{count} skipped", de: "{count} übersprungen" },
  "test.failedSuites": { en: "{count} failed suites", de: "{count} fehlgeschlagene Testsuiten" },
  "actions.testsRunning": {
    en: "Tests running…",
    de: "Tests laufen…",
  },
  "actions.runTestsTitle": {
    en: "Run this project's tests locally",
    de: "Die Tests dieses Projekts lokal ausführen",
  },
  "actions.runTestsNoScanTitle": {
    en: "Scan a repository to run its tests",
    de: "Repository scannen, um seine Tests auszuführen",
  },
  "actions.exportPng": {
    en: "Export PNG",
    de: "PNG exportieren",
  },
  "actions.exportSarif": {
    en: "Export SARIF",
    de: "SARIF exportieren",
  },
  "actions.exportSarifTitle": {
    en: "Every finding of this scan as one SARIF file — the format scanners and code review tools read",
    de: "Alle Funde dieses Scans als eine SARIF-Datei — das Format, das Scanner und Code-Review-Werkzeuge lesen",
  },
  "actions.exportHandoff": {
    en: "Export findings (NDJSON)",
    de: "Funde exportieren (NDJSON)",
  },
  "actions.exportHandoffTitle": {
    en: "One finding per line with its fingerprint — the machine channel a coding agent reads",
    de: "Ein Fund pro Zeile, mit Fingerprint — der Maschinenkanal, den ein Coding-Agent liest",
  },
  "actions.exportReportStarted": {
    en: "{name} saved to your downloads.",
    de: "{name} liegt in den Downloads deines Browsers.",
  },
  "actions.runTestsNoFolderTitle": {
    en: "The demo city has no folder on this machine, so there is nothing to run",
    de: "Die Demo-Stadt hat keinen Ordner auf diesem Rechner, da läuft nichts",
  },
  "actions.exportNoScanTitle": {
    en: "This city has no scan the local server still holds",
    de: "Diese Stadt hat keinen Scan, den der lokale Server noch hält",
  },
  "actions.copyLink": {
    en: "Copy city link",
    de: "Stadt-Link kopieren",
  },
  "actions.copyLinkTitle": {
    en: "Copy a link to this city",
    de: "Link zu dieser Stadt kopieren",
  },
  "actions.copyLinkNoScanTitle": {
    en: "Scan a repository to create a city link",
    de: "Repository scannen, um einen Stadt-Link zu erzeugen",
  },
  "actions.shareNote": {
    en: "Scan a repository to run tests and share its city.",
    de: "Scanne ein Repository, um Tests auszuführen und seine Stadt zu teilen.",
  },
  "actions.building": {
    en: "Building {name}",
    de: "Baue {name}",
  },
  "actions.yourCity": {
    en: "your city",
    de: "deine Stadt",
  },
  "actions.dismissAria": {
    en: "Dismiss message",
    de: "Meldung schließen",
  },
  /**
   * The link is a pointer into the backend's in-RAM result store: 24 hours and
   * at most 20 analyses (ANALYSIS_TTL_MS / ANALYSIS_MAX_ENTRIES). Saying only
   * "while the server runs" promised more lifetime than the store has.
   */
  "actions.linkCopied": {
    en: "City link copied. It opens on this machine only, while the server runs — about {lifetime} or the next {max} scans, whichever comes first.",
    de: "Stadt-Link kopiert. Er öffnet nur auf diesem Rechner, solange der Server läuft — etwa {lifetime} oder bis zu den nächsten {max} Scans, je nachdem was zuerst eintritt.",
  },
  "actions.linkCopiedUnknown": {
    en: "City link copied. It opens on this machine only, while the server runs — the server did not answer, so how long it holds this city is unknown.",
    de: "Stadt-Link kopiert. Er öffnet nur auf diesem Rechner, solange der Server läuft — der Server antwortete nicht, also ist unbekannt, wie lange er diese Stadt hält.",
  },
  "actions.linkCopyFailed": {
    en: "The link could not be copied. Copy the address from your browser instead.",
    de: "Der Link konnte nicht kopiert werden. Kopiere die Adresse stattdessen aus dem Browser.",
  },
  "actions.exportNoCanvas": {
    en: "The city view is not ready. Wait for it to load, then export again.",
    de: "Die Stadtansicht ist noch nicht bereit. Warte, bis sie geladen ist, und exportiere erneut.",
  },
  "actions.exportStarted": {
    en: "PNG export started. Check your browser’s downloads.",
    de: "PNG-Export gestartet. Schau in die Downloads deines Browsers.",
  },
  "actions.exportFailed": {
    en: "This view could not be exported. Try again once the city has finished loading.",
    de: "Diese Ansicht konnte nicht exportiert werden. Versuche es erneut, sobald die Stadt fertig geladen ist.",
  },

  // ── Keyboard hints dialog ─────────────────────────────────────────────────
  "hints.aria": {
    en: "Keyboard shortcuts",
    de: "Tastenkürzel",
  },
  "hints.closeAria": {
    en: "Close keyboard shortcuts",
    de: "Tastenkürzel schließen",
  },
  "hints.header": {
    en: "KEYBOARD SHORTCUTS",
    de: "TASTENKÜRZEL",
  },
  "hints.catNavigation": {
    en: "Navigation",
    de: "Navigation",
  },
  "hints.catTour": {
    en: "Security Tour",
    de: "Security-Tour",
  },
  "hints.catTriage": {
    en: "Triage",
    de: "Triage",
  },
  "hints.searchFocus": {
    en: "Focus the search bar (file name or language)",
    de: "Suchleiste fokussieren (Dateiname oder Sprache)",
  },
  "hints.searchFocusCmdK": {
    en: "Focus the search bar — works even while typing",
    de: "Suchleiste fokussieren — funktioniert auch beim Schreiben",
  },
  "hints.nextBuilding": {
    en: "Next building — when the 3D view has focus",
    de: "Nächstes Gebäude — wenn die 3D-Ansicht den Fokus hat",
  },
  "hints.prevBuilding": {
    en: "Previous building — when the 3D view has focus",
    de: "Vorheriges Gebäude — wenn die 3D-Ansicht den Fokus hat",
  },
  "hints.esc": {
    en: "Close panel → up one district → twice at the overview re-frames",
    de: "Panel schließen → eine Ebene nach oben → zweimal: Übersicht neu einrahmen",
  },
  "hints.toggle": {
    en: "Show or hide this panel",
    de: "Dieses Panel ein- oder ausblenden",
  },
  "hints.tourNav": {
    en: "Previous / next finding (Tour)",
    de: "Vorheriger / nächster Fund (Tour)",
  },
  "hints.tourEnter": {
    en: "Next finding (Tour)",
    de: "Nächster Fund (Tour)",
  },
  "hints.tourEsc": {
    en: "Exit the tour",
    de: "Tour beenden",
  },
  "hints.triageNext": {
    en: "Next finding without a verdict (Triage)",
    de: "Nächster Fund ohne Urteil (Triage)",
  },
  "hints.triagePrev": {
    en: "Previous finding without a verdict (Triage)",
    de: "Vorheriger Fund ohne Urteil (Triage)",
  },
  "hints.catCamera": {
    en: "Camera",
    de: "Kamera",
  },
  "hints.camTurn": {
    en: "Turn around the city — the view stays framed",
    de: "Um die Stadt herum — der Ausschnitt bleibt im Bild",
  },
  "hints.camElevation": {
    en: "Raise / lower the viewpoint",
    de: "Blickpunkt heben / senken",
  },
  "hints.camPan": {
    en: "Pan through the city",
    de: "Durch die Stadt schwenken",
  },
  "hints.camHeight": {
    en: "Rise / descend",
    de: "Höher / tiefer",
  },
  "hints.camZoom": {
    en: "Zoom — from the overview down to street level",
    de: "Zoomen — von der Übersicht bis auf Straßenniveau",
  },
  "hints.camDrag": {
    en: "Drag — look around freely",
    de: "Ziehen — frei umsehen",
  },
  "hints.camOrbit": {
    en: "Double-click a building — circle it to inspect",
    de: "Doppelklick auf ein Gebäude — umkreisen und inspizieren",
  },
  "hints.camOrbitExit": {
    en: "Esc — back to free camera",
    de: "Esc — zurück zur freien Kamera",
  },
  "hints.camRightPan": {
    en: "Right mouse button — pan",
    de: "Rechte Maustaste — schwenken",
  },

  // ── Info panel — source view & sections ──────────────────────────────────
  "panel.sourceHeader": {
    en: "Source",
    de: "Quelltext",
  },
  "panel.sourceToggleAria": {
    en: "Show or hide the file's source code",
    de: "Quelltext der Datei ein- oder ausblenden",
  },
  "panel.loadSource": {
    en: "Load source",
    de: "Quelltext laden",
  },
  "panel.sourceLoading": {
    en: "Loading source…",
    de: "Quelltext wird geladen…",
  },
  "panel.sourceUnavailable": {
    en: "Source not available for this city",
    de: "Quelltext für diese Stadt nicht verfügbar",
  },
  "panel.showFullFile": {
    en: "Show full file",
    de: "Ganze Datei anzeigen",
  },
  "panel.showFindingContext": {
    en: "Show finding context only",
    de: "Nur Fund-Umgebung anzeigen",
  },
  "panel.sourceAria": {
    en: "Source code of this file with flagged finding lines",
    de: "Quellcode dieser Datei mit markierten Fund-Zeilen",
  },
  "panel.sectionFindings": {
    en: "Findings in this section",
    de: "Funde in diesem Abschnitt",
  },
  "panel.sectionNoFindings": {
    en: "No findings in this section",
    de: "Keine Funde in diesem Abschnitt",
  },
  "panel.sectionToggleAria": {
    en: "Show or hide findings of section {name}",
    de: "Funde des Abschnitts {name} ein- oder ausblenden",
  },
  "panel.findingJumpAria": {
    en: "Highlight finding at line {line} in the findings list",
    de: "Fund in Zeile {line} in der Fundliste hervorheben",
  },
  "panel.sourceAutoLoaded": {
    en: "Auto-loaded from your scan",
    de: "Automatisch aus deinem Scan geladen",
  },
  "panel.sourceLine": {
    en: "Line {line}",
    de: "Zeile {line}",
  },

  // ── Breadcrumbs ───────────────────────────────────────────────────────────
  "crumb.fileActive": {
    en: "Current file: {name}",
    de: "Aktuelle Datei: {name}",
  },
  "crumb.fileTitle": {
    en: "Re-center on this file's building",
    de: "Gebäude dieser Datei neu anfliegen",
  },
  "crumb.lineSegment": {
    en: "Fly to line {line}",
    de: "Zur Zeile {line} fliegen",
  },

  // ── Info panel — finding rows ─────────────────────────────────────────────
  "panel.reviewReviewed": {
    en: "Reviewed ✓",
    de: "Geprüft ✓",
  },
  "panel.reviewFalsePositive": {
    en: "False positive",
    de: "Falsch positiv",
  },
  "panel.reviewToFix": {
    en: "To fix",
    de: "Zu beheben",
  },
  "panel.reviewClearTitle": {
    en: 'Clear "{label}" review',
    de: "„{label}“-Kennzeichnung entfernen",
  },
  "panel.reviewMarkTitle": {
    en: "Mark as {label}",
    de: "Als „{label}“ markieren",
  },
  "panel.reviewGroupAria": {
    en: "Review status of this finding",
    de: "Review-Status dieses Funds",
  },
  "panel.verdictsBlocked": {
    en: "Verdicts are not being saved — each one lives only as long as this tab stays open",
    de: "Urteile werden nicht gespeichert — jedes lebt nur, solange dieser Tab offen bleibt",
  },
  /**
   * V1 — the first verdict of a visit is the commitment the panel confirms.
   * The sentence says exactly what the storage delivers (reviews.ts): a
   * re-scan of the same folder reads the verdict back as long as the browser
   * keeps its localStorage. No "forever", no cloud — and it is only shown
   * when the write actually succeeded (`verdictsBlocked` would be a lie).
   */
  "panel.firstVerdictSaved": {
    en: "Saved. Your verdict survives a new scan of this folder — as long as the browser keeps its storage.",
    de: "Gespeichert. Dein Urteil überlebt einen neuen Scan dieses Ordners — solange der Browser den Speicher behält.",
  },
  /**
   * The demo city has no folder and nothing is written anywhere, so the saved
   * promise would be a lie there — the Erstnutzerin saw it. The demo sentence
   * says what the demo actually keeps: the verdict for this page visit only.
   */
  "panel.firstVerdictSavedDemo": {
    en: "Demo city — nothing is saved. This verdict lives only while this page is open.",
    de: "Demo-Stadt — nichts wird gespeichert. Dieses Urteil lebt nur, solange diese Seite offen ist.",
  },
  "panel.codeAroundAria": {
    en: "Code around line {line}",
    de: "Code um Zeile {line}",
  },
  "panel.suggestedFixFallback": {
    en: "Suggested fix",
    de: "Vorgeschlagener Fix",
  },
  "panel.suggestedFixHeader": {
    en: "SUGGESTED FIX ▸ {title}",
    de: "FIX-VORSCHLAG ▸ {title}",
  },
  "panel.copyFixTitle": {
    en: "Copy suggested fix",
    de: "Fix-Vorschlag kopieren",
  },
  "panel.copied": {
    en: "Copied",
    de: "Kopiert",
  },
  "panel.cweTitle": {
    en: "Common Weakness Enumeration — standard vulnerability class",
    de: "Common Weakness Enumeration — standardisierte Schwachstellenklasse",
  },
  "panel.detailsCollapseTitle": {
    en: "Collapse details",
    de: "Details einklappen",
  },
  "panel.detailsExpandTitle": {
    en: "Show explanation, code & fix",
    de: "Erklärung, Code & Fix anzeigen",
  },
  "panel.detailsCollapseAria": {
    en: "Collapse finding details",
    de: "Fund-Details einklappen",
  },
  "panel.detailsExpandAria": {
    en: "Expand finding details",
    de: "Fund-Details ausklappen",
  },
  "panel.copyFindingTitle": {
    en: "Copy finding",
    de: "Fund kopieren",
  },
  "panel.copyFindingAria": {
    en: "Copy finding details",
    de: "Fund-Details kopieren",
  },
  "panel.detailsRegionAria": {
    en: "Finding explanation and remediation",
    de: "Erklärung und Behebung des Funds",
  },
  "panel.whyItMatters": {
    en: "WHY IT MATTERS ▸ ",
    de: "WARUM DAS ZÄHLT ▸ ",
  },
  "panel.linkAdvisory": {
    en: "open security advisory",
    de: "Sicherheitshinweis öffnen",
  },
  "panel.linkRuleDoc": {
    en: "view rule documentation",
    de: "Regel-Dokumentation öffnen",
  },
  "panel.linkReadMore": {
    en: "read more (OWASP/CWE)",
    de: "Mehr lesen (OWASP/CWE)",
  },

  // ── Info panel — file details ─────────────────────────────────────────────
  "panel.fileDetailsAria": {
    en: "File details: {name}",
    de: "Datei-Details: {name}",
  },
  "panel.langTitle": {
    en: "Language — the building's facade color in the city",
    de: "Sprache — die Fassadenfarbe des Gebäudes in der Stadt",
  },
  "panel.locTitle": {
    en: "Lines of code in this file — feeds the building's height",
    de: "Zeilen Code in dieser Datei — bestimmt die Höhe des Gebäudes",
  },
  "panel.cxTitle": {
    en: "Cyclomatic complexity — number of independent paths through the code (loops + branches). Above ~10 gets hard to test; consider simplifying.",
    de: "Zyklomatische Komplexität — Anzahl unabhängiger Pfade durch den Code (Schleifen + Verzweigungen). Ab etwa 10 wird Testen schwierig; vereinfachen lohnt sich.",
  },
  "panel.closeAria": {
    en: "Close info panel",
    de: "Info-Panel schließen",
  },
  "panel.openDistrict": {
    en: "→ OPEN DISTRICT /{path}",
    de: "→ BEZIRK ÖFFNEN /{path}",
  },
  "panel.threatTitle": {
    en: "Scanner status: the worst finding severity, missing scan coverage, or no findings from the checks that ran. This is not proof that a file is safe.",
    de: "Scanner-Status: der schwerste Fund, fehlende Prüfabdeckung oder keine Funde der gelaufenen Prüfungen. Das ist kein Nachweis, dass eine Datei sicher ist.",
  },
  "panel.statusUnchecked": {
    en: "Unverified",
    de: "Ungeprüft",
  },
  "panel.statusNoFindings": {
    en: "No findings",
    de: "Keine Funde",
  },
  "panel.churnTitle": {
    en: "Git churn — how often this file changes ({commits} commits, weighted by change size and recency). High churn on complex code is a refactor hotspot — add tests before touching it.",
    de: "Git-Churn — wie oft sich diese Datei ändert ({commits} Commits, gewichtet nach Umfang und Aktualität). Hoher Churn bei komplexem Code ist ein Refactoring-Hotspot — erst Tests ergänzen, dann anfassen.",
  },
  "panel.apiTitle": {
    en: "API surface — exported functions/classes other files may import. A wide building footprint means many exports; trimming them shrinks the building.",
    de: "API-Fläche — exportierte Funktionen/Klassen, die andere Dateien importieren können. Ein breiter Gebäudefußabdruck bedeutet viele Exporte; weniger Exporte verkleinern das Gebäude.",
  },
  "panel.deadCodeTitle": {
    en: "Dead-code candidate — exported but never imported anywhere (drawn as a glass building). Check for dynamic imports, then delete if truly unused.",
    de: "Tot-Code-Kandidat — exportiert, aber nirgends importiert (als Glasgebäude dargestellt). Dynamische Imports prüfen, dann löschen, wenn wirklich unbenutzt.",
  },
  "panel.hugeFileTitle": {
    en: "Huge file — 150 KB or more of raw source, drawn as a black windowless monolith. Splitting it up makes the real complexity visible.",
    de: "Riesige Datei — 150 KB oder mehr Rohquelltext, als schwarzer fensterloser Monolith dargestellt. Aufteilen macht die echte Komplexität sichtbar.",
  },
  "panel.cycleTitle": {
    en: "Circular import — this file is part of an import loop (A imports B imports A), marked by a rotating red ring. Break the loop by extracting the shared code into its own file.",
    de: "Zirkulärer Import — diese Datei ist Teil einer Importschleife (A importiert B importiert A), markiert durch einen rotierenden roten Ring. Die Schleife auflösen, indem der gemeinsame Code in eine eigene Datei wandert.",
  },
  "panel.coverageTitle": {
    en: "Test coverage — share of lines run by the repo's own tests (lcov report). 80% or more earns the translucent shield around the building.",
    de: "Testabdeckung — Anteil der Zeilen, die die eigenen Tests des Repos ausführen (lcov-Report). Ab 80 % gibt es den durchscheinenden Schild um das Gebäude.",
  },
  "panel.cloneTitle": {
    en: "Copy-paste clone — duplicated code also lives in {paths}. A yellow laser links the copies in the city; extract a shared helper instead.",
    de: "Copy-Paste-Klon — duplizierter Code steckt auch in {paths}. Ein gelber Laser verbindet die Kopien in der Stadt; besser einen gemeinsamen Helfer extrahieren.",
  },
  "panel.blameTitle": {
    en: "Git blame — {author} wrote most of this file. Colors mark author territory across the city.",
    de: "Git blame — {author} hat den Großteil dieser Datei geschrieben. Farben markieren Autorengebiete in der ganzen Stadt.",
  },
  "panel.astTitle": {
    en: "Includes AST findings — code-level analysis (semgrep) that understands syntax and data flow, not just patterns.",
    de: "Enthält AST-Funde — Code-Analyse (semgrep), die Syntax und Datenfluss versteht, nicht nur Muster.",
  },
  "panel.secretsTitle": {
    en: "Contains hardcoded secrets (gitleaks) — keys, tokens or passwords in source. Rotate the credential now, then move it to an environment variable.",
    de: "Enthält hartkodierte Secrets (gitleaks) — Schlüssel, Tokens oder Passwörter im Quelltext. Schlüssel sofort austauschen, dann in eine Umgebungsvariable verschieben.",
  },
  "panel.sarifExport": {
    en: "↓ SARIF Export",
    de: "↓ SARIF-Export",
  },
  "panel.sarifTitle": {
    en: "Download all findings as a SARIF report — the standard format code scanners and GitHub understand",
    de: "Alle Funde als SARIF-Report herunterladen — das Standardformat, das Code-Scanner und GitHub verstehen",
  },
  "panel.findingsCountOne": {
    en: "{count} Finding",
    de: "{count} Fund",
  },
  "panel.findingsCountMany": {
    en: "{count} Findings",
    de: "{count} Funde",
  },
  "panel.provAstHeurSecrets": {
    en: "AST + Heuristic + Secrets",
    de: "AST + Heuristik + Secrets",
  },
  "panel.provAstHeur": {
    en: "AST + Heuristic",
    de: "AST + Heuristik",
  },
  "panel.provHeurSecrets": {
    en: "Heuristic + Secrets",
    de: "Heuristik + Secrets",
  },
  "panel.provHeur": {
    en: "Heuristic",
    de: "Heuristik",
  },
  "panel.provTitle": {
    en: "How these findings were detected — AST: syntax-aware analysis (semgrep) · Heuristic: pattern matching · Secrets: hardcoded credential scan (gitleaks)",
    de: "Wie diese Funde entdeckt wurden — AST: syntaxbewusste Analyse (semgrep) · Heuristik: Mustererkennung · Secrets: Scan nach hartkodierten Credentials (gitleaks)",
  },
  "panel.noFindingsInFile": {
    en: "No findings detected in this file",
    de: "Keine Funde in dieser Datei",
  },
  /**
   * Measured defect: the panel promised green for files no engine ever opened.
   * `panel.noFindingsChecked` is only true once the file was covered; the
   * unchecked case has to name the missing scanners instead (S7).
   */
  "panel.noFindingsChecked": {
    en: "No findings in this file",
    de: "Keine Funde in dieser Datei",
  },
  "panel.noFindingsUnchecked": {
    en: "{n} scanners did not cover this file — no finding is not clean",
    de: "{n} Prüfprogramme waren für diese Datei nicht aktiv — kein Befund heißt hier nicht sauber",
  },
  "panel.noFindingsUncheckedOne": {
    en: "{n} scanner did not cover this file — no finding is not clean",
    de: "{n} Prüfprogramm war für diese Datei nicht aktiv — kein Befund heißt hier nicht sauber",
  },
  /**
   * S2: the checked card has to name its engines too, or "checked and clean"
   * and "nobody looked at this" stay indistinguishable where the verdict is
   * read (R3-02: aws.ts, a bare green line while gitleaks and semgrep looked).
   */
  "panel.coverageExamined": {
    en: "Examined by {engines}",
    de: "Geprüft von {engines}",
  },
  "panel.coverageBlind": {
    en: " — {blind} does not open this format",
    de: " — {blind} öffnet dieses Format nicht",
  },
  "panel.coverageNoScanner": {
    en: "No security scanner opens this format — only the pattern baseline read it",
    de: "Kein Sicherheits-Scanner öffnet dieses Format — nur die Mustergrundlage hat es gelesen",
  },
  "panel.coverageUnread": {
    en: "No scanner read this file at all — the city shows only its measured shape",
    de: "Kein Prüfprogramm hat diese Datei gelesen — die Stadt zeigt nur ihre gemessene Form",
  },
  /**
   * S2 · R3-03: a threat word raised on nothing but review-level hygiene
   * notes has to say what it stands on. The underlying computation is
   * untouched — this is provenance on the chip, not a new scoring rule.
   */
  "panel.chipBasisOne": {
    en: "{word} · from {count} review-level note ({notes}), no security rule matched",
    de: "{word} · aus {count} Prüfhinweis auf Review-Stufe ({notes}) — keine Sicherheitsregel hat gegriffen",
  },
  "panel.chipBasisMany": {
    en: "{word} · from {count} review-level notes ({notes}), no security rule matched",
    de: "{word} · aus {count} Prüfhinweisen auf Review-Stufe ({notes}) — keine Sicherheitsregel hat gegriffen",
  },

  // ── Info panel — structure block ──────────────────────────────────────────
  "panel.structureAria": {
    en: "Code structure of this file",
    de: "Code-Struktur dieser Datei",
  },
  "panel.structureHeader": {
    en: "Structure",
    de: "Struktur",
  },
  "panel.voxelLegendTitle": {
    en: "The building materializes as voxels when selected — one voxel per code line, sections stacked as strata, nesting depth as terraced insets",
    de: "Das Gebäude materialisiert bei Auswahl als Voxel — ein Voxel pro Codezeile, Abschnitte als Schichten gestapelt, Verschachtelungstiefe als terrassenförmige Absätze",
  },
  "panel.voxelLegend": {
    en: "1 voxel = 1 code line · {count} voxels",
    de: "1 Voxel = 1 Codezeile · {count} Voxel",
  },
  "panel.voxelLegendOne": {
    en: "1 voxel = 1 code line · {count} voxel",
    de: "1 Voxel = 1 Codezeile · {count} Voxel",
  },
  "panel.sectionMeta": {
    en: "{kind} · lines {start}–{end} · nesting depth {depth}",
    de: "{kind} · Zeilen {start}–{end} · Verschachtelungstiefe {depth}",
  },
  "panel.sectionFindingsTitle": {
    en: "Findings inside this section's line range",
    de: "Funde im Zeilenbereich dieses Abschnitts",
  },
  "panel.moreSections": {
    en: "+ {count} more sections",
    de: "+ {count} weitere Abschnitte",
  },
  "panel.moreSectionsOne": {
    en: "+ {count} more section",
    de: "+ {count} weiterer Abschnitt",
  },

  // ── Info panel — per-file test run ────────────────────────────────────────
  "panel.runTestFileTitle": {
    en: "Run this test file with the project's own runner (vitest/jest) on your machine",
    de: "Diese Testdatei mit dem eigenen Runner des Projekts (vitest/jest) auf deinem Rechner ausführen",
  },
  "panel.runTestFile": {
    en: "▶ RUN THIS TEST FILE",
    de: "▶ TESTDATEI AUSFÜHREN",
  },
  "panel.running": {
    en: "RUNNING…",
    de: "LÄUFT…",
  },
  "panel.testsFailing": {
    en: "✕ TESTS FAILING",
    de: "✕ TESTS FEHLGESCHLAGEN",
  },
  "panel.testsPassing": {
    en: "✓ TESTS PASSING",
    de: "✓ TESTS BESTANDEN",
  },
  "panel.testCountOne": {
    en: "{count} test",
    de: "{count} Test",
  },
  "panel.testCountMany": {
    en: "{count} tests",
    de: "{count} Tests",
  },
  "panel.moreFailures": {
    en: "+ {count} more failures",
    de: "+ {count} weitere Fehler",
  },
  "panel.moreFailuresOne": {
    en: "+ {count} more failure",
    de: "+ {count} weiterer Fehler",
  },

  // ── Findings panel ────────────────────────────────────────────────────────
  "findings.heading": {
    en: "Findings",
    de: "Funde",
  },
  "findings.summaryFF": {
    en: "{count} finding in {files} file",
    de: "{count} Fund in {files} Datei",
  },
  "findings.summaryFP": {
    en: "{count} finding in {files} files",
    de: "{count} Fund in {files} Dateien",
  },
  "findings.summaryPF": {
    en: "{count} findings in {files} file",
    de: "{count} Funde in {files} Datei",
  },
  "findings.summaryPP": {
    en: "{count} findings in {files} files",
    de: "{count} Funde in {files} Dateien",
  },
  /**
   * UX 6 — the card of the first (heaviest) finding states the scan's whole
   * scope before the finding itself: how many findings, across how many files,
   * and that this card is the first of them. `{summary}` is the existing
   * `findings.summary*` phrase, so the singular/plural grammar stays owned by
   * the one place that already counts it — this key only adds the honest
   * orientation, never a second number.
   */
  "panel.triageFirstFinding": {
    en: "{summary} — here is the first one",
    de: "{summary} — hier ist der erste",
  },
  "findings.closeAria": {
    en: "Close findings list",
    de: "Fundliste schließen",
  },
  "findings.ruleGroupAria": {
    en: "Filter findings by rule",
    de: "Funde nach Regel filtern",
  },
  "findings.allRules": {
    en: "All rules",
    de: "Alle Regeln",
  },
  "findings.allRulesTitle": {
    en: "Show findings of every rule",
    de: "Funde aller Regeln anzeigen",
  },
  "findings.ruleTitle": {
    en: "Show only {rule} findings",
    de: "Nur {rule}-Funde anzeigen",
  },
  /**
   * The list counts files the city draws; the priority chips count the scan.
   * When those differ the panel says so instead of showing two totals.
   */
  "findings.undrawn": {
    en: "{count} more sit on files this view does not draw",
    de: "{count} weitere liegen auf Dateien, die diese Ansicht nicht zeichnet",
  },
  "findings.undrawnOne": {
    en: "{count} more sits on a file this view does not draw",
    de: "{count} weiterer liegt auf einer Datei, die diese Ansicht nicht zeichnet",
  },
  "findings.orphanedReviews": {
    en: "Recorded verdicts with no matching finding here: {count} — a renamed file or a rewritten line moves a finding",
    de: "Gespeicherte Bewertungen ohne passenden Fund in dieser Stadt: {count} — eine umbenannte Datei oder eine umgeschriebene Zeile verschiebt einen Fund",
  },
  /**
   * V2 — the project-wide tally in the findings header. `judged` counts only
   * verdicts that match a finding of the CURRENT scan; an orphaned verdict is
   * never folded into it (that would claim a finding is decided that is not).
   * The orphaned variant says the orphans in the same line, labelled apart —
   * counted along, honestly, not prettified.
   */
  "findings.judgedTally": {
    en: "Reviewed {judged} / {total}",
    de: "Beurteilt {judged} / {total}",
  },
  "findings.judgedTallyOrphaned": {
    en: "Reviewed {judged} / {total} · {orphans} orphaned",
    de: "Beurteilt {judged} / {total} · {orphans} verwaist",
  },
  "findings.moreRules": {
    en: "+{count} rules",
    de: "+{count} Regeln",
  },
  "findings.moreRulesOne": {
    en: "+{count} rule",
    de: "+{count} Regel",
  },
  "findings.moreRulesTitle": {
    en: "Show every rule",
    de: "Alle Regeln anzeigen",
  },
  "findings.fewerRules": {
    en: "fewer rules",
    de: "weniger Regeln",
  },
  "findings.fewerRulesTitle": {
    en: "Show only the most frequent rules",
    de: "Nur die häufigsten Regeln anzeigen",
  },
  "findings.priorityGroupAria": {
    en: "Filter findings by priority",
    de: "Funde nach Priorität filtern",
  },
  "findings.allPriorities": {
    en: "All priorities",
    de: "Alle Prioritäten",
  },
  "findings.allPrioritiesTitle": {
    en: "Show all findings",
    de: "Alle Funde anzeigen",
  },
  "findings.priorityTitle": {
    en: "{priority}: {label} priority",
    de: "{priority}: Priorität {label}",
  },
  "findings.emptyRule": {
    en: "No {rule} findings in this scan.",
    de: "Keine {rule}-Funde in diesem Scan.",
  },
  "findings.emptyRulePriority": {
    en: "No {rule} findings with {priority} priority in this scan.",
    de: "Keine {rule}-Funde mit {priority}-Priorität in diesem Scan.",
  },
  "findings.emptyAll": {
    en: "No findings in this scan.",
    de: "Keine Funde in diesem Scan.",
  },
  "findings.emptyPriority": {
    en: "No {priority} findings in this scan.",
    de: "Keine {priority}-Funde in diesem Scan.",
  },
  "findings.showAllPriorities": {
    en: "Show all priorities",
    de: "Alle Prioritäten anzeigen",
  },
  "findings.showAllRules": {
    en: "Show all rules",
    de: "Alle Regeln anzeigen",
  },
  "findings.emptyHint": {
    en: "Explore the city to review the files and their structure.",
    de: "Erkunde die Stadt, um die Dateien und ihre Struktur durchzusehen.",
  },
  "findings.fileTitle": {
    en: "Show {name} in the city",
    de: "{name} in der Stadt zeigen",
  },
  "findings.fileAria": {
    en: "Show {path} in the city",
    de: "{path} in der Stadt zeigen",
  },
  "findings.reviewedTitle": {
    en: "Findings in this file with a review status",
    de: "Funde in dieser Datei mit Review-Status",
  },
  "findings.reviewedCount": {
    en: "{reviewed}/{count} reviewed",
    de: "{reviewed}/{count} geprüft",
  },
  "findings.countTitle": {
    en: "{count} findings",
    de: "{count} Funde",
  },
  "findings.countTitleOne": {
    en: "{count} finding",
    de: "{count} Fund",
  },
  "findings.findingTitle": {
    en: "Show {name}, line {line}",
    de: "{name} zeigen, Zeile {line}",
  },
  "findings.reviewLabelReviewed": {
    en: "Reviewed",
    de: "Geprüft",
  },
  "findings.reviewLabelFalsePositive": {
    en: "False positive",
    de: "Falsch positiv",
  },
  "findings.reviewLabelToFix": {
    en: "To fix",
    de: "Zu beheben",
  },
  "findings.showMore": {
    en: "Show more ({count} remaining)",
    de: "Mehr anzeigen ({count} übrig)",
  },
  "findings.hint": {
    en: "Select a finding to locate its file in the city.",
    de: "Wähle einen Fund, um seine Datei in der Stadt zu finden.",
  },

  // ── Search bar ────────────────────────────────────────────────────────────
  "search.statusIdle": {
    en: "Search by file name, folder path or language.",
    de: "Suche nach Dateiname, Ordnerpfad oder Sprache.",
  },
  "search.statusNoMatch": {
    en: "No files match “{query}”. Try a shorter name or a language like TypeScript.",
    de: "Keine Dateien passen zu „{query}“. Versuche einen kürzeren Namen oder eine Sprache wie TypeScript.",
  },
  "search.statusResultOne": {
    en: "{count} matching file. Use arrow keys to choose and Enter to open.",
    de: "{count} passende Datei. Wähle mit den Pfeiltasten, öffne mit Enter.",
  },
  "search.statusResultMany": {
    en: "{count} matching files. Use arrow keys to choose and Enter to open.",
    de: "{count} passende Dateien. Wähle mit den Pfeiltasten, öffne mit Enter.",
  },
  "search.placeholder": {
    en: "Search files, paths, languages…",
    de: "Dateien, Pfade, Sprachen suchen…",
  },
  "search.inputAria": {
    en: "Search files by name, path or language",
    de: "Dateien nach Name, Pfad oder Sprache durchsuchen",
  },
  "search.inputTitle": {
    en: "Search files by name, path or language — picking a result flies the camera to its building",
    de: "Dateien nach Name, Pfad oder Sprache durchsuchen — ein Treffer fliegt die Kamera zu seinem Gebäude",
  },
  "search.clearAria": {
    en: "Clear search",
    de: "Suche leeren",
  },
  "search.listboxAria": {
    en: "Matching files",
    de: "Passende Dateien",
  },
  "search.issuesOne": {
    en: "{count} issue",
    de: "{count} Problem",
  },
  "search.issuesMany": {
    en: "{count} issues",
    de: "{count} Probleme",
  },

  // ── Analyze panel ─────────────────────────────────────────────────────────
  "analyze.progressAria": {
    en: "Analysis progress: {progress}%",
    de: "Analysefortschritt: {progress} %",
  },
  "analyze.initializing": {
    en: "INITIALIZING...",
    de: "INITIALISIERE...",
  },
  "analyze.toggleAria": {
    en: "Toggle analyze panel",
    de: "Analyse-Panel umschalten",
  },
  "analyze.toggleAriaAnalyzing": {
    en: "Toggle analyze panel — analyzing, {progress}% done",
    de: "Analyse-Panel umschalten — Analyse läuft, {progress} % fertig",
  },
  "analyze.toggleTitle": {
    en: "Build another city: pick a local folder and scan it — the current city stays open until the new one is ready",
    de: "Eine weitere Stadt bauen: lokalen Ordner wählen und scannen — die aktuelle Stadt bleibt offen, bis die neue bereit ist",
  },
  "analyze.open": {
    en: "+ Open project",
    de: "+ Projekt öffnen",
  },
  "analyze.close": {
    en: "Close",
    de: "Schließen",
  },
  "analyze.dialogAria": {
    en: "Folder analyze panel",
    de: "Ordner-Analyse-Panel",
  },
  "analyze.header": {
    en: "Open another project",
    de: "Weiteres Projekt öffnen",
  },
  "analyze.pickAria": {
    en: "Pick a local project folder",
    de: "Lokalen Projektordner wählen",
  },
  "analyze.pickAriaBusy": {
    en: "Analysis in progress",
    de: "Analyse läuft",
  },
  "analyze.reading": {
    en: "READING FOLDER…",
    de: "ORDNER WIRD GELESEN…",
  },
  "analyze.analyzing": {
    en: "ANALYZING...",
    de: "ANALYSE LÄUFT...",
  },
  "analyze.filesBytes": {
    en: "{files} files · {kb} KB",
    de: "{files} Dateien · {kb} KB",
  },
  "analyze.filesBytesOne": {
    en: "{files} file · {kb} KB",
    de: "{files} Datei · {kb} KB",
  },
  "analyze.success": {
    en: "✓ CITY BUILT — explore it below",
    de: "✓ STADT GEBAUT — unten erkunden",
  },
  "analyze.cancel": {
    en: "CANCEL",
    de: "ABBRECHEN",
  },

  // ── Scan stages (the backend names stay the channel values; the UI shows these) ──
  "stage.enumerating": {
    en: "Enumerating files",
    de: "Dateien aufzählen",
  },
  "stage.parsing": {
    en: "Parsing files",
    de: "Dateien parsen",
  },
  "stage.deepscan": {
    en: "Deep scan (semgrep + gitleaks)",
    de: "Tiefenscan (semgrep + gitleaks)",
  },
  "stage.deps": {
    en: "Dependency audit",
    de: "Abhängigkeitsaudit",
  },
  "stage.osv": {
    en: "CVE lookup",
    de: "CVE-Abgleich",
  },
  "stage.git": {
    en: "Git history",
    de: "Git-Historie",
  },
  "stage.dupes": {
    en: "Duplicates",
    de: "Dubletten",
  },
  "stage.coverage": {
    en: "Coverage reports",
    de: "Abdeckungsberichte",
  },
  "stage.final": {
    en: "Finalizing results",
    de: "Ergebnisse zusammenstellen",
  },
  "stage.done": {
    en: "Complete",
    de: "Fertig",
  },

  // ── Reading and upload phase (the counter that proves the program is alive) ──
  "scan.reading": {
    en: "{n} files read",
    de: "{n} Dateien gelesen",
  },
  "scan.readingOne": {
    en: "{n} file read",
    de: "{n} Datei gelesen",
  },
  "scan.readingOf": {
    en: "{n} of {total}",
    de: "{n} von {total}",
  },
  "scan.uploading": {
    en: "Uploading",
    de: "Upload läuft",
  },
  "scan.elapsed": {
    en: "elapsed {s} s",
    de: "seit {s} s",
  },
  "scan.etaHint": {
    en: "usually about {s} s",
    de: "dauert meist {s} s",
  },
  "scan.cancelled": {
    en: "Cancelled — nothing continues",
    de: "Abgebrochen — nichts läuft weiter",
  },
  /**
   * The sentences the scan hook throws today (measured in the German run: they
   * stayed English). Each one has a home here so the hook only has to call t().
   */
  "scan.waiting": {
    en: "Waiting for the scan",
    de: "Warten auf den Scan",
  },
  "scan.uploadFailed": {
    en: "Upload failed",
    de: "Upload fehlgeschlagen",
  },
  "scan.uploadHttpStatus": {
    en: "Upload failed (HTTP {status})",
    de: "Upload fehlgeschlagen (HTTP {status})",
  },
  "scan.timedOut": {
    en: "Analysis timed out — is the server still running?",
    de: "Die Analyse hat die Zeit überschritten — läuft der Server noch?",
  },
  "scan.jobGone": {
    en: "Analysis job not found — was the server restarted?",
    de: "Analyseauftrag nicht gefunden — wurde der Server neu gestartet?",
  },
  "scan.serverFailed": {
    en: "Analysis failed on the server — check the server logs.",
    de: "Die Analyse ist auf dem Server fehlgeschlagen — prüfe die Server-Protokolle.",
  },
  "scan.cityLoadFailed": {
    en: "The city data could not be loaded",
    de: "Die Stadtdaten konnten nicht geladen werden",
  },
  "scan.noSource": {
    en: "No analyzable source files in this folder (supported: {exts})",
    de: "In diesem Ordner liegen keine analysierbaren Quelldateien (unterstützt: {exts})",
  },
  /**
   * The folder held source files, but every one was past the per-file wall —
   * that is a fact about the files, not "no source here". Said with the count
   * that left and the 2 MB limit, so a single 3 MB file is never described as
   * an empty folder (edge-state 1c).
   */
  "scan.noSourceTooLarge": {
    en: "{n} files in this folder are over the 2 MB per-file limit — nothing left to analyze",
    de: "{n} Dateien in diesem Ordner liegen über der 2-MB-Grenze je Datei — nichts mehr zu analysieren",
  },
  "scan.noSourceTooLargeOne": {
    en: "{n} file in this folder is over the 2 MB per-file limit — nothing left to analyze",
    de: "{n} Datei in diesem Ordner liegt über der 2-MB-Grenze je Datei — nichts mehr zu analysieren",
  },
  "scan.pickerTimeout": {
    en: "Still choosing? Take your time. If no dialog opened, you can open an alternative; this replaces the first selection.",
    de: "Noch bei der Auswahl? Lass dir Zeit. Falls kein Dialog geöffnet wurde, kannst du einen alternativen öffnen; dieser ersetzt die erste Auswahl.",
  },
  "scan.pickerUnavailable": {
    en: "The folder dialog could not open. You can try the alternative folder dialog.",
    de: "Der Ordnerdialog konnte nicht geöffnet werden. Du kannst den alternativen Ordnerdialog versuchen.",
  },
  /**
   * The AbortError inside the grace window (`PICKER_ABORT_GRACE_MS` in
   * picker.ts): no human cancelled, the dialog never appeared. Silence here is
   * the first-run dead end the Erstnutzerin found — this says what happened
   * and names the way out.
   */
  "scan.pickerNeverOpened": {
    en: "The folder dialog never opened — this browser refused it. You can use the alternative folder dialog.",
    de: "Der Ordnerdialog hat sich nie geöffnet — dieser Browser hat ihn verweigert. Du kannst den alternativen Ordnerdialog verwenden.",
  },
  "scan.pickerReadFailed": {
    en: "The selected folder could not be read. Choose another folder.",
    de: "Der gewählte Ordner konnte nicht gelesen werden. Wähle einen anderen Ordner.",
  },
  "picker.waiting": {
    en: "Waiting for folder selection",
    de: "Warte auf die Ordnerauswahl",
  },
  "picker.alternative": {
    en: "Open alternative folder dialog",
    de: "Alternativen Ordnerdialog öffnen",
  },

  // ── Limits: a file may be refused, but never silently (measured: 30 of 62 gone) ──
  "cap.filesFound": {
    en: "{found} source files found, the limit is {max}",
    de: "{found} Quelldateien gefunden, Grenze ist {max}",
  },
  "cap.filesFoundOne": {
    en: "{found} source file found, the limit is {max}",
    de: "{found} Quelldatei gefunden, Grenze ist {max}",
  },
  "cap.hint": {
    en: "Exclude folders instead of giving up",
    de: "Ordner ausschließen statt aufgeben",
  },
  "cap.excludeLabel": {
    en: "Excluded folders",
    de: "Ausgeschlossene Ordner",
  },
  "cap.excludePlaceholder": {
    en: "e.g. generated, fixtures",
    de: "z. B. generated, fixtures",
  },
  "cap.excludeNone": {
    en: "Nothing excluded — every source folder in the picked folder is read",
    de: "Nichts ausgeschlossen — jeder Quellordner im gewählten Ordner wird gelesen",
  },
  "cap.excludeCount": {
    en: "{n} folders excluded (at most {max})",
    de: "{n} Ordner ausgeschlossen (höchstens {max})",
  },
  "cap.excludeCountOne": {
    en: "{n} folder excluded (at most {max})",
    de: "{n} Ordner ausgeschlossen (höchstens {max})",
  },
  "cap.excludeRule": {
    en: "Names separated by commas, matched anywhere in the path — “src” also leaves out “frontend/src”",
    de: "Namen, durch Kommas getrennt, getroffen an jeder Stelle im Pfad — „src“ schließt auch „frontend/src“ aus",
  },
  "drop.rejected": {
    en: "{n} files exceeded the {max}-character path limit and were not read",
    de: "{n} Dateien lagen über der Pfadgrenze von {max} Zeichen und wurden nicht gelesen",
  },
  "drop.rejectedOne": {
    en: "{n} file exceeded the {max}-character path limit and was not read",
    de: "{n} Datei lag über der Pfadgrenze von {max} Zeichen und wurde nicht gelesen",
  },
  "drop.skipped": {
    en: "{n} files were too large or unreadable",
    de: "{n} Dateien waren zu groß oder unlesbar",
  },
  "drop.skippedOne": {
    en: "{n} file was too large or unreadable",
    de: "{n} Datei war zu groß oder unlesbar",
  },
  "drop.unread": {
    en: "{n} files could not be read",
    de: "{n} Dateien konnten nicht gelesen werden",
  },
  "drop.unreadOne": {
    en: "{n} file could not be read",
    de: "{n} Datei konnte nicht gelesen werden",
  },

  // ── Read budget (measured: 600 reads / 15 min, polling ate 30 per minute) ──
  "limit.hit": {
    en: "The local server asked for a break — resuming in {s} s",
    de: "Der lokale Server bittet um eine Pause — weiter in {s} s",
  },
  "limit.waiting": {
    en: "Waiting for the read budget",
    de: "Warte auf das Lesebudget",
  },

  // ── Security tour ─────────────────────────────────────────────────────────
  "tour.regionAria": {
    en: "Security tour",
    de: "Security-Tour",
  },
  "tour.stepAria": {
    en: "Step {index} of {total}: {name}",
    de: "Schritt {index} von {total}: {name}",
  },
  "tour.stepLabel": {
    en: "⚑ SECURITY TOUR · {index} of {total}",
    de: "⚑ SECURITY-TOUR · {index} von {total}",
  },
  "tour.line": {
    en: "line {line}",
    de: "Zeile {line}",
  },
  "tour.prevAria": {
    en: "Previous finding",
    de: "Vorheriger Fund",
  },
  "tour.nextAria": {
    en: "Next finding",
    de: "Nächster Fund",
  },
  "tour.exitAria": {
    en: "Exit tour",
    de: "Tour beenden",
  },
  "tour.exit": {
    en: "EXIT",
    de: "BEENDEN",
  },
  "tour.hint": {
    en: "← → navigate · Enter next · Esc exit",
    de: "← → navigieren · Enter weiter · Esc beenden",
  },

  // ── Building tooltip ──────────────────────────────────────────────────────
  "tooltip.folderSubtitle": {
    en: "folder · {files} files · {loc} LOC",
    de: "Ordner · {files} Dateien · {loc} LOC",
  },
  "tooltip.folderSubtitleOne": {
    en: "folder · {files} file · {loc} LOC",
    de: "Ordner · {files} Datei · {loc} LOC",
  },
  "tooltip.badgeCriticalOne": {
    en: "{count} critical finding",
    de: "{count} kritischer Fund",
  },
  "tooltip.badgeCriticalMany": {
    en: "{count} critical findings",
    de: "{count} kritische Funde",
  },
  "tooltip.badgeHighOne": {
    en: "{count} high finding",
    de: "{count} hoher Fund",
  },
  "tooltip.badgeHighMany": {
    en: "{count} high findings",
    de: "{count} hohe Funde",
  },
  "tooltip.badgeNone": {
    en: "no findings",
    de: "keine Funde",
  },
  // A district with nothing found is only clean if an engine could have found
  // something there.
  "tooltip.dirBadgeUnchecked": {
    en: "{n} files {engines} did not check",
    de: "{n} Dateien, von {engines} nicht geprüft",
  },
  "tooltip.dirBadgeUncheckedOne": {
    en: "{n} file {engines} did not check",
    de: "{n} Datei, von {engines} nicht geprüft",
  },
  "tooltip.badgeMediumOne": {
    en: "{count} medium finding",
    de: "{count} mittlerer Fund",
  },
  "tooltip.badgeMediumMany": {
    en: "{count} medium findings",
    de: "{count} mittlere Funde",
  },
  "tooltip.zoomHint": {
    en: "click to zoom into this district",
    de: "klicken, um in diesen Stadtteil zu zoomen",
  },
  "tooltip.fileFindingsOne": {
    en: "{loc} LOC · {count} finding",
    de: "{loc} LOC · {count} Fund",
  },
  "tooltip.fileFindingsMany": {
    en: "{loc} LOC · {count} findings",
    de: "{loc} LOC · {count} Funde",
  },
  "tooltip.fileBadgeNone": {
    en: "{loc} LOC · no findings",
    de: "{loc} LOC · keine Funde",
  },
  // A file the switched-off engines would have covered is unknown ground, not
  // a clean result — the tooltip has to say which of the two it is.
  "tooltip.fileBadgeUnchecked": {
    en: "{loc} LOC · not checked by {engines}",
    de: "{loc} LOC · von {engines} nicht geprüft",
  },
  "tooltip.detailsHint": {
    en: "click for details",
    de: "klicken für Details",
  },
  // Etappe L "free camera": double-click starts the orbit-inspect mode for
  // EVERY building (click still selects without moving the camera), so the
  // hint shows on both tooltip branches. Esc returns to free flight.
  "tooltip.orbitHint": {
    en: "double-click to circle this building",
    de: "Doppelklick: Gebäude umkreisen",
  },
  "tooltip.noFindingsOrbitHint": {
    en: "{language} · double-click to circle this building",
    de: "{language} · Doppelklick: Gebäude umkreisen",
  },
  "tooltip.typeDistrict": {
    en: "district",
    de: "Stadtteil",
  },
  "tooltip.typeFile": {
    en: "file",
    de: "Datei",
  },

  // ── Heatmap channel toggle ────────────────────────────────────────────────
  "heat.groupAria": {
    en: "Heatmap color channel",
    de: "Heatmap-Farbkanal",
  },
  "heat.groupTip": {
    en: "Far-zoom heatmap: pick what the city grid shows when you zoom out. Clicking a channel zooms out to the heat view.",
    de: "Heatmap bei weitem Zoom: lege fest, was das Stadtgitter beim Herauszoomen zeigt. Ein Klick auf einen Kanal zoomt in die Heatmap-Ansicht heraus.",
  },
  "heat.threatTip": {
    en: "THREAT: color heat cells by P0 red, P1 orange, P2 yellow, clean dark blue. Click to zoom out into the heat view.",
    de: "THREAT: färbt Heatmap-Zellen nach P0 rot, P1 orange, P2 gelb, sauber dunkelblau. Klick zoomt in die Heatmap-Ansicht heraus.",
  },
  "heat.complexityTip": {
    en: "CX: color heat cells by cyan (simple) → amber → magenta (complex). Click to zoom out into the heat view.",
    de: "CX: färbt Heatmap-Zellen von Cyan (einfach) → Bernstein → Magenta (komplex). Klick zoomt in die Heatmap-Ansicht heraus.",
  },
  "heat.churnTip": {
    en: "CHURN: color heat cells by green (stable) → orange (constantly churning). Click to zoom out into the heat view.",
    de: "CHURN: färbt Heatmap-Zellen von Grün (stabil) → Orange (ständig in Bewegung). Klick zoomt in die Heatmap-Ansicht heraus.",
  },
  "heat.churnUnavailableTip": {
    en: "No .git folder in this upload — churn and author districts need the project’s git metadata",
    de: "Kein .git-Ordner in diesem Upload — Churn- und Autor-Bezirke brauchen die Git-Metadaten des Projekts",
  },

  // ── First-visit primer (CoachMarks) ───────────────────────────────────────
  "coach.regionAria": {
    en: "Getting started",
    de: "Erste Schritte",
  },
  "coach.title": {
    en: "Explore your codebase",
    de: "Erkunde deine Codebasis",
  },
  "coach.dismissAria": {
    en: "Dismiss getting started guide",
    de: "Einblendung zu den ersten Schritten schließen",
  },
  "coach.dismissTip": {
    en: "Hide guide. The city legend remains available in Project overview.",
    de: "Einblendung ausblenden. Die Stadt-Legende bleibt in der Projektübersicht.",
  },
  "coach.hintTurn": {
    en: "Arrow keys turn the view",
    de: "Pfeiltasten drehen die Ansicht",
  },
  "coach.hintTurnDetail": {
    en: "Drag to look, scroll to fly in",
    de: "Ziehen zum Umschauen, Scrollen zum Hineinfliegen",
  },
  "coach.hintDistrict": {
    en: "Open a district",
    de: "Bezirk öffnen",
  },
  "coach.hintDistrictDetail": {
    en: "Click a folder block",
    de: "Klick auf einen Ordnerblock",
  },
  "coach.hintFile": {
    en: "Inspect a file",
    de: "Datei prüfen",
  },
  "coach.hintFileDetail": {
    en: "Click a building",
    de: "Klick auf ein Gebäude",
  },
  "coach.hintKeys": {
    en: "Keyboard shortcuts",
    de: "Tastenkürzel",
  },
  "coach.hintKeysDetail": {
    en: "Press ? for the full guide",
    de: "? drücken für die vollständige Übersicht",
  },
  "coach.legendToggle": {
    en: "What do the city markers mean?",
    de: "Was bedeuten die Marker in der Stadt?",
  },

  // ── Marker legend (shared by primer and Project overview) ─────────────────
  "legend.height": {
    en: "Building height",
    de: "Gebäudehöhe",
  },
  "legend.heightMeaning": {
    en: "Code complexity and file size",
    de: "Code-Komplexität und Dateigröße",
  },
  "legend.footprint": {
    en: "Footprint size",
    de: "Grundfläche",
  },
  "legend.footprintMeaning": {
    en: "Number of exported symbols",
    de: "Anzahl exportierter Symbole",
  },
  "legend.monolith": {
    en: "Windowless monolith",
    de: "Monolith ohne Fenster",
  },
  "legend.monolithMeaning": {
    en: "Large file, 150 KB or more",
    de: "Große Datei, 150 KB oder mehr",
  },
  "legend.glass": {
    en: "Glass building",
    de: "Glasgebäude",
  },
  "legend.glassMeaning": {
    en: "Never imported; may be unused",
    de: "Nirgends importiert; kann toter Code sein",
  },
  "legend.redWindows": {
    en: "Red pulsing windows",
    de: "Pulsende rote Fenster",
  },
  /** The same row under the colour-saver palette, where the windows take the
   *  blue alarm tone — naming the hue that is actually on screen. */
  "legend.alarmWindows": {
    en: "Blue pulsing windows",
    de: "Pulsende blaue Fenster",
  },
  "legend.redWindowsMeaning": {
    en: "Critical or high security findings",
    de: "Kritische oder hohe Sicherheitsfunde",
  },
  "legend.scaffolding": {
    en: "Orange scaffolding",
    de: "Orangenes Gerüst",
  },
  "legend.scaffoldingMeaning": {
    en: "Frequently changed in Git",
    de: "In Git häufig geändert",
  },
  "legend.shield": {
    en: "Translucent shield",
    de: "Durchscheinender Schild",
  },
  "legend.shieldMeaning": {
    en: "At least 80% test coverage",
    de: "Mindestens 80 % Testabdeckung",
  },
  "legend.ring": {
    en: "Red ring at the base",
    de: "Roter Ring am Sockel",
  },
  "legend.ringMeaning": {
    en: "Circular import: A → B → A",
    de: "Zirkulärer Import: A → B → A",
  },
  "legend.laser": {
    en: "Yellow flickering laser",
    de: "Flackernder gelber Laser",
  },
  "legend.laserMeaning": {
    en: "Duplicated code across files",
    de: "Doppelt vorhandener Code über Dateien",
  },
  "legend.streams": {
    en: "Cyan / violet streams",
    de: "Cyan- und violette Bahnen",
  },
  "legend.streamsMeaning": {
    en: "Incoming / outgoing imports",
    de: "Eingehende / ausgehende Importe",
  },
  "legend.heat": {
    en: "Heat cells (zoomed out)",
    de: "Heat-Zellen (ausgezoomt)",
  },
  "legend.heatMeaning": {
    en: "Risk, complexity or change frequency",
    de: "Risiko, Komplexität oder Änderungshäufigkeit",
  },
  "legend.authors": {
    en: "Author colors",
    de: "Autorenfarben",
  },
  "legend.authorsMeaning": {
    en: "Main contributor to each area",
    de: "Hauptbeitragender je Bereich",
  },
  "legend.citizens": {
    en: "Citizens, taxi, bus",
    de: "Einwohner, Taxi, Bus",
  },
  "legend.citizensMeaning": {
    en: "Ambient city life",
    de: "Stadtleben nebenbei",
  },

  // ── Project / district overview (ContextCard) ─────────────────────────────
  "ctx.showAria": {
    en: "Show project overview",
    de: "Projektübersicht einblenden",
  },
  "ctx.project": {
    en: "Project overview",
    de: "Projektübersicht",
  },
  "ctx.district": {
    en: "District overview",
    de: "Bezirksübersicht",
  },
  "ctx.collapseAria": {
    en: "Collapse project overview",
    de: "Übersicht einklappen",
  },
  "ctx.collapseTip": {
    en: "Collapse overview",
    de: "Übersicht einklappen",
  },
  "ctx.files": {
    en: "Files",
    de: "Dateien",
  },
  "ctx.filesTip": {
    en: "Each source file is a building in your city.",
    de: "Jede Quelldatei ist ein Gebäude in deiner Stadt.",
  },
  "ctx.codeLines": {
    en: "Lines of code",
    de: "Codezeilen",
  },
  "ctx.codeLinesTip": {
    en: "Lines of code, excluding comments, blank lines and data files.",
    de: "Codezeilen ohne Kommentare, Leerzeilen und Datendateien.",
  },
  "ctx.dataLines": {
    en: "{count} lines of data{labels}",
    de: "{count} Zeilen Daten{labels}",
  },
  "ctx.dataLinesOne": {
    en: "{count} line of data{labels}",
    de: "{count} Zeile Daten{labels}",
  },
  "ctx.dataLinesTip": {
    en: "Translation catalogues, manifests and generated JSON have lines but no behaviour. They are counted apart from the code, never inside it.",
    de: "Übersetzungskataloge, Manifeste und erzeugtes JSON haben Zeilen, aber kein Verhalten. Sie zählen getrennt vom Code, nie darin.",
  },
  "ctx.keptOut": {
    en: "{skipped} kept out by .gitignore",
    de: "{skipped} von .gitignore ausgeschlossen",
  },
  "ctx.keptOutTip": {
    en: "Every folder's own .gitignore decides what the scan reads. What it keeps out is not part of this city.",
    de: "Die .gitignore jedes Ordners entscheidet, was der Scan liest. Was sie ausschließt, gehört nicht zu dieser Stadt.",
  },
  "ctx.uncheckedDemo": {
    en: "No scanner looked at this city — it is a demo",
    de: "Kein Scanner hat diese Stadt angesehen — es ist eine Demo",
  },
  "ctx.unchecked": {
    en: "{unverified} of {total} files here were never checked{by}",
    de: "{unverified} von {total} Dateien hier wurden nie geprüft{by}",
  },
  "ctx.uncheckedOne": {
    en: "{unverified} of {total} files here was never checked{by}",
    de: "{unverified} von {total} Dateien hier wurde nie geprüft{by}",
  },
  "ctx.uncheckedBy": {
    en: " by {engines}",
    de: " von {engines}",
  },
  "ctx.uncheckedTip": {
    en: "No engine that covers these languages ran in this scan. The files are not clean — they are unread.",
    de: "Kein Engine für diese Sprachen lief in diesem Scan. Die Dateien sind nicht sauber — sie sind ungelesen.",
  },
  "ctx.kindsTip": {
    en: "What this folder is actually full of. Severity says how bad a finding is; this says what kind of work it is.",
    de: "Womit dieser Ordner wirklich voll ist. Der Schweregrad sagt, wie übel ein Fund ist; hier steht, welche Art Arbeit es ist.",
  },
  "ctx.blind": {
    en: "Nobody looked for: {list}",
    de: "Danach hat niemand gesucht: {list}",
  },
  "ctx.blindTip": {
    en: "No engine that could report on these ran in this scan. Zero findings here is a blind spot, not a clean result.",
    de: "Keine Engine, die das melden könnte, lief in diesem Scan. Null Funde sind hier eine Lücke, kein sauberes Ergebnis.",
  },
  /**
   * S2: the shipped rule set's own blind classes belong on the screen, not
   * only in the README's prose (R3-03). Phrased as a statement about the
   * rules — never as a promise that the listed classes are absent.
   */
  "ctx.classCoverage": {
    en: "What the shipped rules cannot see: authorisation/IDOR and race conditions have no rule at all. SSRF, weak randomness, server-side response sinks, path traversal and credential literals are matched by shape heuristics only — they catch the obvious line, not the clever one. No finding in these classes means un-checked, not clean",
    de: "Was die mitgelieferten Regeln nicht sehen: Autorisierung/IDOR und Race-Conditions haben überhaupt keine Regel. SSRF, schwache Zufälligkeit, serverseitige Antwort-Senken, Pfadtraversierung und Credential-Literale erkennt nur eine Form-Heuristik — sie greift die offensichtliche Zeile, nicht die clevere. Kein Befund heißt hier ungeprüft, nicht sauber",
  },
  "ctx.classCoverageTip": {
    en: "A statement about the shipped rules, not about your code: these classes can still be present — unseen.",
    de: "Eine Aussage über die mitgelieferten Regeln, nicht über Ihren Code: Diese Klassen können vorkommen — ungesehen.",
  },
  "ctx.testTip": {
    en: "Test findings can describe intentional fixtures or real executed code. Review the evidence before treating them as product vulnerabilities. They remain listed and have lower priority in the overview.",
    de: "Funde in Tests können absichtliche Beispiele oder tatsächlich ausgeführten Code betreffen. Prüfe den Beleg, bevor du daraus eine Produktlücke ableitest. Sie bleiben sichtbar und werden in der Übersicht nachrangig gewichtet.",
  },
  "ctx.testFindings": {
    en: "{inTests} of {total} findings were found in test code",
    de: "{inTests} von {total} Funden stammen aus Testcode",
  },
  "ctx.testFindingsOne": {
    en: "{inTests} of {total} findings was found in test code",
    de: "{inTests} von {total} Funden stammt aus Testcode",
  },
  "ctx.drawTip": {
    en: "One building per file that fits the plots of this view. The rest are represented by a district plot or a podium marker, and every finding is still counted.",
    de: "Ein Gebäude pro Datei, auf die die Plätze dieser Ansicht passen. Der Rest steckt auf einem Bezirksplatz oder einem Sockel-Marker, und jeder Fund bleibt gezählt.",
  },
  "ctx.findingsOne": {
    en: "1 finding to review",
    de: "1 Fund zur Prüfung",
  },
  "ctx.findingsMany": {
    en: "{count} findings to review",
    de: "{count} Funde zur Prüfung",
  },
  "ctx.reviewFileTip": {
    en: "Review {path}",
    de: "Prüfen: {path}",
  },
  "ctx.reviewHighest": {
    en: "Review priority finding",
    de: "Priorisierten Fund prüfen",
  },
  "ctx.noFindings": {
    en: "No findings in this view",
    de: "Keine Funde in dieser Ansicht",
  },
  "ctx.languages": {
    en: "Languages",
    de: "Sprachen",
  },
  "ctx.langShare": {
    en: "{name}: {pct}% of lines",
    de: "{name}: {pct} % der Zeilen",
  },
  "ctx.authorship": {
    en: "Authorship — git blame across this view",
    de: "Autorschaft — git blame über diese Ansicht",
  },
  "ctx.authored": {
    en: "{author} authored {pct}% of files in this view",
    de: "{author} hat {pct} % der Dateien in dieser Ansicht geschrieben",
  },
  "ctx.topContributor": {
    en: "Top contributor:",
    de: "Meiste Beiträge:",
  },
  "ctx.shareOfFiles": {
    en: "· {pct}% of files",
    de: "· {pct} % der Dateien",
  },
  "ctx.legendToggle": {
    en: "City legend",
    de: "Stadt-Legende",
  },

  // ── .gitignore skip count (provenance helper) ─────────────────────────────
  "prov.skipFile": {
    en: "{n} file",
    de: "{n} Datei",
  },
  "prov.skipFiles": {
    en: "{n} files",
    de: "{n} Dateien",
  },
  "prov.skipFolder": {
    en: "{n} folder",
    de: "{n} Ordner",
  },
  "prov.skipFolders": {
    en: "{n} folders",
    de: "{n} Ordner",
  },
  "prov.skipJoin": {
    en: " and ",
    de: " und ",
  },

  // ── Why a district draws fewer buildings (layout helper) ──────────────────
  "district.underground": {
    en: "underground",
    de: "im Untergrund",
  },
  "layout.drawnHere": {
    en: "{drawn} of {files} files here stand as buildings — a folder draws at most {cap}, the rest share one podium marker.",
    de: "{drawn} von {files} Dateien hier stehen als Gebäude — ein Ordner zeichnet höchstens {cap}, der Rest teilt sich einen Sockel-Marker.",
  },
  "layout.drawnHereOne": {
    en: "{drawn} of {files} files here stands as a building — a folder draws at most {cap}, the rest share one podium marker.",
    de: "{drawn} von {files} Dateien hier steht als Gebäude — ein Ordner zeichnet höchstens {cap}, der Rest teilt sich einen Sockel-Marker.",
  },
  "layout.subDistrictsOne": {
    en: "{below} files live in {plots} sub-district; each plot shows up to {towers} of its most at-risk files.",
    de: "{below} Dateien liegen in {plots} Unterbezirk; jeder Platz zeigt bis zu {towers} seiner riskantesten Dateien.",
  },
  "layout.subDistrictsMany": {
    en: "{below} files live in {plots} sub-districts; each plot shows up to {towers} of its most at-risk files.",
    de: "{below} Dateien liegen in {plots} Unterbezirken; jeder Platz zeigt bis zu {towers} seiner riskantesten Dateien.",
  },

  // ── Boot screen ───────────────────────────────────────────────────────────
  "load.aria": {
    en: "Loading Ephemora Skyline",
    de: "Ephemora Skyline lädt",
  },
  "load.line1": {
    en: "> Starting Ephemora Skyline...",
    de: "> Ephemora Skyline startet...",
  },
  "load.line2": {
    en: "> Rendering your city in 3D...",
    de: "> Deine Stadt wird in 3D gebaut...",
  },
  "load.line3": {
    en: "> Positioning the fly-over camera...",
    de: "> Flugkamera wird positioniert...",
  },
  "load.line4": {
    en: "> Ready",
    de: "> Bereit",
  },

  // ── Scan-complete toast ───────────────────────────────────────────────────
  "summary.allClear": {
    en: "✓ All clear — no issues found",
    de: "✓ Alles frei — keine Funde",
  },
  "summary.noFindingsMissing": {
    en: "◈ No findings — {missing} did not run",
    de: "◈ Keine Funde — {missing} lief nicht",
  },
  "summary.noFindingsMissingMany": {
    en: "◈ No findings — {missing} did not run",
    de: "◈ Keine Funde — {missing} liefen nicht",
  },
  "summary.depthUnknown": {
    en: "◈ No findings — scan depth unknown",
    de: "◈ Keine Funde — Scan-Tiefe unbekannt",
  },
  "summary.complete": {
    en: "◈ Scan complete",
    de: "◈ Scan abgeschlossen",
  },
  "summary.demo": {
    en: "◈ Demo · sample findings, no scan",
    de: "◈ Demo · Beispielfunde, kein Scan",
  },
  "summary.demoFiles": {
    en: "{count} sample files",
    de: "{count} Beispieldateien",
  },
  "summary.filesAnalyzed": {
    en: "{count} files analyzed",
    de: "{count} Dateien analysiert",
  },
  "summary.filesAnalyzedOne": {
    en: "{count} file analyzed",
    de: "{count} Datei analysiert",
  },
  "summary.sevRisk": {
    en: "{label} security risk",
    de: "Sicherheitsrisiko: {label}",
  },
  "summary.sevSample": {
    en: "{label} sample finding",
    de: "Beispielfund: {label}",
  },
  "summary.testContext": {
    en: "{inTests} of {total} findings are in test files. Check fixtures before treating them as real risks.",
    de: "{inTests} von {total} Funden liegen in Testdateien. Prüfe Testdaten, bevor du sie als echte Risiken wertest.",
  },
  "summary.testsShort": {
    en: "{count} in tests",
    de: "{count} in Tests",
  },
  "summary.dismissAria": {
    en: "Dismiss scan summary",
    de: "Scan-Zusammenfassung schließen",
  },
  /**
   * The same row carries the demo too, and there it says in words that nothing
   * was scanned. A control that offers to dismiss "the scan summary" over that
   * line names a thing the card denies, so the demo gets its own name for what
   * the ✕ removes.
   */
  "summary.dismissAriaDemo": {
    en: "Dismiss the demo notice",
    de: "Demo-Hinweis schließen",
  },

  // ── Scan profile chips ────────────────────────────────────────────────────
  "profile.chipsAria": {
    en: "Scan profile",
    de: "Scan-Profil",
  },
  "profile.lastKindSuffix": {
    en: " — the last kind stays on; a scan of nothing is no scan",
    de: " — die letzte Art bleibt an; ein Scan ohne alles ist kein Scan",
  },
  "profile.packsCaption": {
    en: "Deep-scan rule pack",
    de: "Regel-Pack für die Tiefensuche",
  },
  "profile.packsAria": {
    en: "Rule packs",
    de: "Regel-Packs",
  },
  "profile.packNone": {
    en: "Registry default",
    de: "Registry-Standard",
  },
  "profile.packNoneTip": {
    en: "No pack selected: semgrep loads its rules from semgrep.dev while the scan runs. With SKYLINE_OFFLINE the engine stays off, because nothing can be fetched.",
    de: "Kein Pack gewählt: semgrep lädt seine Regeln während des Scans von semgrep.dev. Mit SKYLINE_OFFLINE bleibt der Engine aus, weil dann nichts zu holen ist.",
  },
  "profile.packTip": {
    en: "{count} rules · source: {source} · license: {license} · version {version}",
    de: "{count} Regeln · Quelle: {source} · Lizenz: {license} · Version {version}",
  },
  "profile.packTipOne": {
    en: "{count} rule · source: {source} · license: {license} · version {version}",
    de: "{count} Regel · Quelle: {source} · Lizenz: {license} · Version {version}",
  },
  "profile.packFetched": {
    en: "your own",
    de: "eigenes",
  },
  "profile.packShipped": {
    en: "shipped",
    de: "mitgeliefert",
  },
  "profile.packOffline": {
    en: "Selected packs are read from this disk — the deep scan runs with the network switched off.",
    de: "Gewählte Packs liegen auf dieser Platte — der Tiefenscan läuft dann auch ohne Netz.",
  },
  "profile.closeAria": {
    en: "Close without changing the profile",
    de: "Schließen, ohne das Profil zu ändern",
  },

  // ── Small chrome strings ──────────────────────────────────────────────────
  "minimap.aria": {
    en: "City minimap — click to fly, or press Enter to go to city overview",
    de: "Stadt-Minimap — Klick fliegt hin, Enter geht zur Stadtübersicht",
  },
  "crumbs.navAria": {
    en: "Breadcrumb",
    de: "Brotpfad",
  },
  "crumbs.upAria": {
    en: "Up one level",
    de: "Eine Ebene höher",
  },
  "crumbs.rootTip": {
    en: "Root level",
    de: "Wurzelebene",
  },
  "ide.pathAria": {
    en: "Absolute workspace root path",
    de: "Absoluter Pfad zum Arbeitsverzeichnis",
  },
  "ide.setup": {
    en: "OPEN IN EDITOR — SET WORKSPACE ROOT (ONCE)",
    de: "IM EDITOR ÖFFNEN — ARBEITSVERZEICHNIS SETZEN (EINMALIG)",
  },
  "ide.save": {
    en: "SAVE",
    de: "SPEICHERN",
  },
  "ide.invalidHint": {
    en: "⚠ Path must be absolute — start with “/” (macOS/Linux) or a drive letter like “C:\\”",
    de: "⚠ Der Pfad muss absolut sein — beginne mit “/” (macOS/Linux) oder einem Laufwerksbuchstaben wie “C:\\”",
  },
  "ide.openIn": {
    en: "⤢ OPEN IN {editor}",
    de: "⤢ IN {editor} ÖFFNEN",
  },
  "ide.openAria": {
    en: "Open {path} in {editor}",
    de: "{path} in {editor} öffnen",
  },
  "ide.openAriaLine": {
    en: "Open {path} in {editor} at line {line}",
    de: "{path} in {editor}, Zeile {line} öffnen",
  },
  "ide.switchAria": {
    en: "Switch editor to {editor}",
    de: "Editor auf {editor} wechseln",
  },
  "minimap.title": {
    en: "CITY MAP",
    de: "STADTKARTE",
  },
  "app.dismissAria": {
    en: "Dismiss message",
    de: "Meldung schließen",
  },
  "minimap.overview": {
    en: "· OVERVIEW",
    de: "· ÜBERSICHT",
  },
  "landing.dismissNoteAria": {
    en: "Dismiss update note",
    de: "Hinweis zur Aktualisierung schließen",
  },

  // ── Scan profiles (the chips on the landing screen) ───────────────────────
  "profile.quick": {
    en: "Quick",
    de: "Schnell",
  },
  "profile.quickSummary": {
    en: "critical findings only — fastest scan",
    de: "nur kritische Funde — der schnellste Scan",
  },
  "profile.standard": {
    en: "Standard",
    de: "Standard",
  },
  "profile.standardSummary": {
    en: "all scanners — secrets, AST, CVEs, heuristics",
    de: "alle Scanner — Secrets, AST, CVEs, Heuristiken",
  },
  "profile.deep": {
    en: "Deep",
    de: "Tief",
  },
  "profile.deepSummary": {
    en: "standard + git-history secret scan",
    de: "Standard + Secret-Scan der Git-Historie",
  },
  "profile.custom": {
    en: "Custom",
    de: "Eigene",
  },
  "profile.customSummary": {
    en: "your own configuration (coming soon)",
    de: "deine eigene Konfiguration (kommt noch)",
  },

  // ── What each profile reports (detail card) ───────────────────────────────
  "scope.quick": {
    en: "shows only P0 critical findings — triage, not a full report",
    de: "zeigt nur P0-kritische Funde — Triage, kein vollständiger Bericht",
  },
  "scope.standard": {
    en: "shows all findings, P0 to P2 (critical → hygiene)",
    de: "zeigt alle Funde, P0 bis P2 (kritisch → Hygiene)",
  },
  "scope.deep": {
    en: "shows all findings P0 to P2, including historical secrets",
    de: "zeigt alle Funde P0 bis P2, inklusive Secrets aus der Historie",
  },
  "scope.custom": {
    en: "shows all findings, P0 to P2",
    de: "zeigt alle Funde, P0 bis P2",
  },

  // ── Engines (detail card rows) ────────────────────────────────────────────
  "engine.heuristics": {
    en: "Code patterns",
    de: "Code-Muster",
  },
  "engine.heuristicsWhat": {
    en: "scans every file for risky code patterns (injection, XSS, unsafe storage…)",
    de: "liest jede Datei nach riskanten Mustern ab (Injection, XSS, unsichere Ablage…)",
  },
  "engine.secrets": {
    en: "Secrets",
    de: "Secrets",
  },
  "engine.secretsWhat": {
    en: "finds API keys, passwords and tokens committed in your files",
    de: "findet API-Keys, Passwörter und Token in deinen committeten Dateien",
  },
  "engine.ast": {
    en: "Deep AST rules",
    de: "Tiefe AST-Regeln",
  },
  "engine.astWhat": {
    en: "syntax-tree analysis for injection and XSS flows the regexes can't see",
    de: "Syntaxbaum-Analyse für Injection- und XSS-Wege, die keine Regex sieht",
  },
  "engine.deps": {
    en: "Dependency audit",
    de: "Abhängigkeits-Prüfung",
  },
  "engine.depsWhat": {
    en: "checks npm packages against the known-vulnerability database",
    de: "gleicht npm-Pakete gegen die bekannte-Schwachstellen-Datenbank ab",
  },
  "engine.osv": {
    en: "OSV database",
    de: "OSV-Datenbank",
  },
  "engine.osvWhat": {
    en: "cross-checks dependencies against the open-source CVE database",
    de: "prüft Abhängigkeiten gegen die Open-Source-CVE-Datenbank",
  },
  "engine.ruff": {
    en: "Python lint",
    de: "Python-Lint",
  },
  "engine.ruffWhat": {
    en: "quality and hygiene checks for Python files",
    de: "Qualitäts- und Hygieneprüfung für Python-Dateien",
  },
  "engine.secretsHistory": {
    en: "Git history secrets",
    de: "Secrets in der Git-Historie",
  },
  "engine.secretsHistoryWhat": {
    en: "walks the full commit history — finds keys you deleted long ago",
    de: "geht die komplette Commit-Historie durch — findet längst gelöschte Keys",
  },
  "engine.duplicates": {
    en: "Copy-paste clones",
    de: "Copy-Paste-Klone",
  },
  "engine.duplicatesWhat": {
    en: "finds duplicated code blocks — yellow lasers connect the clones",
    de: "findet doppelte Code-Blöcke — gelbe Laser verbinden die Klone",
  },
  "engine.cycles": {
    en: "Circular imports",
    de: "Zirkuläre Importe",
  },
  "engine.cyclesWhat": {
    en: "detects import loops — red rings mark the files that block the system",
    de: "erkennt Import-Schleifen — rote Ringe markieren die blockierenden Dateien",
  },
  "engine.coverage": {
    en: "Test coverage",
    de: "Testabdeckung",
  },
  "engine.coverageWhat": {
    en: "reads the repo's own lcov report — well-tested files get a blue shield",
    de: "liest den lcov-Bericht des Repos — gut getestete Dateien erhalten einen blauen Schild",
  },
  "engine.blame": {
    en: "Author map",
    de: "Autoren-Karte",
  },
  "engine.blameWhat": {
    en: "colors districts by the developers who own them (git history)",
    de: "färbt Bezirke nach den Entwicklerinnen und Entwicklern, die sie besitzen (Git-Historie)",
  },
  "engine.included": {
    en: "included",
    de: "dabei",
  },
  "engine.skipped": {
    en: "skipped",
    de: "fehlt",
  },

  // ── Finding categories (the kinds of mistakes to look for) ────────────────
  "cat.injection": {
    en: "Injection & execution",
    de: "Injection & Ausführung",
  },
  "cat.injectionMeaning": {
    en: "Data reaches a place that runs it: shell, SQL, eval, deserialization.",
    de: "Daten landen an einer Stelle, die sie ausführt: Shell, SQL, eval, Deserialisierung.",
  },
  "cat.secrets": {
    en: "Secrets",
    de: "Secrets",
  },
  "cat.secretsMeaning": {
    en: "Credentials, tokens and keys that are stored in the code or its history.",
    de: "Zugangsdaten, Token und Keys, die im Code oder seiner Historie stehen.",
  },
  "cat.crypto": {
    en: "Cryptography",
    de: "Kryptografie",
  },
  "cat.cryptoMeaning": {
    en: "Weak algorithms and short keys — the maths that pretends to protect something.",
    de: "Schwache Verfahren und kurze Keys — die Rechenkunst, die Schutz vorgaukelt.",
  },
  "cat.transport": {
    en: "Transport & certificates",
    de: "Transport & Zertifikate",
  },
  "cat.transportMeaning": {
    en: "Cleartext network calls and certificate checks that were switched off.",
    de: "Klartext-Netzwerkaufrufe und abgeschaltete Zertifikatsprüfungen.",
  },
  "cat.exposure": {
    en: "Data exposure",
    de: "Daten-Lecks",
  },
  "cat.exposureMeaning": {
    en: "Sensitive values written where they can be read: logs, browser storage, dumps.",
    de: "Sensible Werte, die lesbar abgelegt werden: Logs, Browser-Speicher, Dumps.",
  },
  "cat.dependencies": {
    en: "Dependencies & supply chain",
    de: "Abhängigkeiten & Lieferkette",
  },
  "cat.dependenciesMeaning": {
    en: "Known-bad packages, install hooks and code pulled in without verification.",
    de: "Bekannte schlechte Pakete, Install-Hooks und ungeprüft gezogener Code.",
  },
  "cat.permissions": {
    en: "Permissions & destructive actions",
    de: "Rechte & zerstörerische Aktionen",
  },
  "cat.permissionsMeaning": {
    en: "World-writable paths and commands that delete or overwrite more than intended.",
    de: "Für alle schreibbare Pfade und Befehle, die mehr löschen oder überschreiben als geplant.",
  },
  "cat.hygiene": {
    en: "Code hygiene",
    de: "Code-Hygiene",
  },
  "cat.hygieneMeaning": {
    en: "Not a vulnerability: dead imports, wrong comparisons, shadowed names.",
    de: "Keine Schwachstelle: tote Importe, falsche Vergleiche, verdeckte Namen.",
  },
  "cat.unclassified": {
    en: "Not classified",
    de: "Nicht eingeordnet",
  },
  "cat.unclassifiedMeaning": {
    en: "A finding whose rule carries no CWE the categories know.",
    de: "Ein Fund, dessen Regel keine CWE trägt, die die Arten kennen.",
  },

  // ── Profile detail card ───────────────────────────────────────────────────
  "detail.aria": {
    en: "What the {label} scan checks",
    de: "Was der {label}-Scan prüft",
  },
  "detail.title": {
    en: "{icon} {label} scan",
    de: "{icon} {label}-Scan",
  },
  "detail.lede": {
    en: "Requested checks. Actual execution depends on project files, installed tools and network availability; see coverage in the results. Nothing is uploaded anywhere else — files stay on your machine.",
    de: "Angeforderte Prüfungen. Die Ausführung hängt von Projektdateien, installierten Tools und Netzwerkverfügbarkeit ab; die Ergebnisse zeigen die Abdeckung. Dateien bleiben auf deinem Rechner.",
  },
  "detail.report": {
    en: "REPORT:",
    de: "BERICHT:",
  },
  "detail.customNote": {
    en: "⚠ The custom pattern editor is coming soon — choosing it for now runs the standard profile.",
    de: "⚠ Der Editor für eigene Muster kommt noch — wer ihn jetzt wählt, läuft den Standard-Scan.",
  },
  "detail.use": {
    en: "✓ USE THIS PROFILE",
    de: "✓ DIESES PROFIL NEHMEN",
  },
  "detail.keep": {
    en: "← KEEP CURRENT",
    de: "← AKTUELLES BEHALTEN",
  },

  // ── City video studio (taken over from src/share/fallbackCopy.ts, Lane TEILER) ─
  /**
   * The 60 names are verbatim what the studio and the release card render today, so
   * TEILER can swap `tx()` for `t()` without touching a call site. Six values got a
   * German wording of their own: a byte-identical pair reads as untranslated and the
   * guard in tests/panelI18n.test.tsx allows copies only for tool and format names.
   */
  "menu.item": { en: "City image or video", de: "Stadtbild oder -video" },
  "studio.title": { en: "Share your city", de: "Deine Stadt teilen" },
  "studio.intro": {
    en: "Create a picture or film the city as it rises. Preview first; nothing leaves this machine unless you share it.",
    de: "Erstelle ein Bild oder filme den Bau der Stadt. Prüfe erst die Vorschau; nichts verlässt diesen Rechner, bis du es teilst.",
  },
  "studio.media": { en: "What to make", de: "Was möchtest du erstellen?" },
  "studio.image": { en: "Image", de: "Bild" },
  "studio.video": { en: "Video", de: "Video" },
  "studio.close": { en: "Close", de: "Schließen" },
  "studio.format": { en: "Format", de: "Ausgabeformat" },
  "studio.length": { en: "Length", de: "Länge" },
  "length.build": { en: "The build, start to finish", de: "Die Bau-Animation, einmal durch" },
  "length.buildWaiting": {
    en: "Replays the construction and stops when the city is complete.",
    de: "Spielt den Stadtbau erneut ab und stoppt, sobald die Stadt fertig ist.",
  },
  "length.15": { en: "15-second take", de: "15 Sekunden" },
  "length.30": { en: "30-second take", de: "30 Sekunden" },
  "length.manual": { en: "I stop it", de: "Eigener Stopp" },
  "studio.quality": { en: "Quality", de: "Qualität" },
  "quality.resolution": { en: "Picture", de: "Bild" },
  "quality.fps": { en: "Frames", de: "Bilder" },
  "quality.bitrate": { en: "Bitrate set to", de: "Bitrate eingestellt" },
  "quality.codec": { en: "Codec", de: "Video-Codec" },
  "quality.codecPending": { en: "asked for", de: "angefragt" },
  "studio.names": { en: "Show names", de: "Namen zeigen" },
  "studio.namesDisclosure": {
    en: "This puts your project name and district names into the file itself. Leave it off to show the city without those names.",
    de: "Das schreibt den Projektnamen und Bezirksnamen direkt in die Datei. Ohne Häkchen zeigt sie die Stadt ohne diese Namen.",
  },
  "studio.namesFileNote": {
    en: "The saved file has a generic name unless you enable names. No folder path is included.",
    de: "Die Datei bekommt einen neutralen Namen, solange du Namen nicht aktivierst. Ordnerpfade bleiben draußen.",
  },
  "studio.credit": {
    en: "Include a small Ephemora credit (optional)",
    de: "Kleinen Ephemora-Hinweis einblenden (optional)",
  },
  "studio.record": { en: "Record", de: "Aufnehmen" },
  "studio.stop": { en: "Stop", de: "Stopp" },
  "studio.preparing": { en: "Framing the shot", de: "Bild wird gerahmt" },
  "studio.recording": { en: "Recording", de: "Aufnahme läuft" },
  "studio.finalizing": { en: "Closing the encoder", de: "Encoder wird geschlossen" },
  "studio.elapsed": { en: "elapsed {s} s", de: "seit {s} s" },
  "studio.written": { en: "{bytes} bytes so far", de: "{bytes} Bytes bisher" },
  "studio.errorNoCanvas": {
    en: "No 3D canvas on screen. A city has to be standing before it can be filmed.",
    de: "Kein 3D-Canvas auf dem Bildschirm. Eine Stadt muss erst dastehen, bevor sie gefilmt werden kann.",
  },
  "studio.errorNoRecorder": {
    en: "This browser has no MediaRecorder, so the city cannot be filmed here.",
    de: "Dieser Browser hat keinen MediaRecorder. Die Stadt lässt sich hier nicht filmen.",
  },
  "studio.errorEmpty": {
    en: "The recorder wrote 0 bytes. Nothing was saved.",
    de: "Der Encoder hat 0 Bytes geschrieben. Es wurde nichts gespeichert.",
  },
  "studio.errorSkew": {
    en: "The shot came out out of proportion ({skew}). Recording stopped, nothing was saved.",
    de: "Das Bild lief unverhältnismäßig aus der Form ({skew}). Aufnahme gestoppt, nichts gespeichert.",
  },
  "studio.unsupported": { en: "not available", de: "nicht verfügbar" },
  "card.title": { en: "Done. The city is a file.", de: "Fertig. Die Stadt ist eine Datei." },
  "card.sub": {
    en: "Measured while recording, not estimated afterwards.",
    de: "Während der Aufnahme gemessen, nicht danach geschätzt.",
  },
  "card.facts": { en: "What the file is", de: "Was die Datei ist" },
  "card.size": { en: "Size", de: "Größe" },
  "card.duration": { en: "Duration", de: "Dauer" },
  "card.resolution": { en: "Resolution", de: "Auflösung" },
  "card.fps": { en: "Frame rate", de: "Bildrate" },
  "card.codec": { en: "Codec", de: "Video-Codec" },
  "card.fileName": { en: "File name", de: "Dateiname" },
  "card.frames": { en: "Frames composited", de: "Gerahmte Bilder" },
  "card.download": { en: "Save the video", de: "Video speichern" },
  "card.share": { en: "Share the video", de: "Video teilen" },
  "card.shareFailed": {
    en: "Sharing did not open. You can save the file instead.",
    de: "Teilen ließ sich nicht öffnen. Du kannst die Datei stattdessen speichern.",
  },
  "card.captions": { en: "Text to go with it", de: "Text dazu" },
  "card.copy": { en: "Copy", de: "Kopieren" },
  "card.copied": { en: "Copied", de: "Kopiert" },
  "card.copyFailed": { en: "Copy failed", de: "Kopieren fehlgeschlagen" },
  "card.tone.dry": { en: "Plain", de: "Trocken" },
  "card.tone.warm": { en: "Friendly", de: "Freundlich" },
  "card.tone.curious": { en: "Curious", de: "Neugierig" },
  "card.privacy": {
    en: "Nothing left this machine on the way here. It leaves only if you attach it somewhere.",
    de: "Nichts hat diese Maschine auf dem Weg hier verlassen. Es geht erst raus, wenn du es selbst anhängst.",
  },
  "card.namesOff": {
    en: "No project, folder or file names in the picture.",
    de: "Keine Projekt-, Ordner- oder Dateinamen im Bild.",
  },
  "card.namesOn": {
    en: "Names are burned into the picture: {names}.",
    de: "Namen stehen im Bild eingebrannt: {names}.",
  },
  "card.noLink": {
    en: "Made locally. Save it or share it only where you choose.",
    de: "Lokal erstellt. Speichere oder teile es nur dort, wo du möchtest.",
  },
  "card.cta": {
    en: "We are two self-funded builders making this a little better each day. If the city helped you see your code differently, sharing it or starring the repo helps others find us. Thank you.",
    de: "Wir sind zwei Entwickler und bauen Ephemora aus eigener Kraft jeden Tag ein Stück weiter. Wenn dir die Stadt einen neuen Blick auf deinen Code gegeben hat, helfen dein Teilen oder ein GitHub-Stern anderen, uns zu finden. Danke.",
  },
  "card.again": { en: "Record another take", de: "Noch einmal aufnehmen" },
  "hint.text": {
    en: "The city is finished. It films well.",
    de: "Die Stadt ist fertig gebaut. Sie lässt sich gut filmen.",
  },
  "hint.action": { en: "Record it", de: "Jetzt aufnehmen" },
  "hint.dismiss": { en: "Not now, and not again", de: "Nicht jetzt, und nie wieder" },
  "hint.aria": { en: "City video suggestion", de: "Vorschlag für ein Stadtvideo" },
  "image.create": { en: "Create image", de: "Bild erstellen" },
  "image.preparing": { en: "Framing image…", de: "Bild wird gerahmt…" },
  "image.ready": { en: "Your city image is ready", de: "Dein Stadtbild ist fertig" },
  "image.preview": {
    en: "This is the file you can save or share.",
    de: "Dieses Bild kannst du speichern oder teilen.",
  },
  "image.alt": { en: "Preview of the city image", de: "Vorschau des Stadtbilds" },
  "image.crop": {
    en: "About {n}% of the view was cropped for this format. Try another format if the city feels cut off.",
    de: "Für dieses Format wurden etwa {n}% der Ansicht abgeschnitten. Probiere ein anderes Format, falls die Stadt am Rand fehlt.",
  },
  "image.download": { en: "Save image", de: "Bild speichern" },
  "image.share": { en: "Share image", de: "Bild teilen" },
  "image.again": { en: "Choose another view", de: "Andere Ansicht wählen" },
  "share.platforms": { en: "Post it yourself", de: "Selbst posten" },
  "share.platformNote": {
    en: "The file stays on this machine until you attach it. None of these pages can build a preview from a local file, so the text travels by clipboard and the file by download.",
    de: "Die Datei bleibt auf diesem Rechner, bis du sie selbst anhängst. Keine dieser Seiten kann eine Vorschau von einer lokalen Datei bauen. Der Text geht deshalb über die Zwischenablage, die Datei über den Download.",
  },
  "share.platform.instagram": {
    en: "No web draft for posts exists. The site opens, you add text and file there.",
    de: "Einen Web-Entwurf für Beiträge gibt es nicht. Die Seite öffnet sich, Text und Datei fügst du dort ein.",
  },
  "share.platform.reddit": {
    en: "Your first line arrives as the post title. Attach the file in the form.",
    de: "Dein erster Satz kommt als Titel in den Post. Die Datei hängst du im Formular an.",
  },
  "share.platform.x": {
    en: "A draft carries text only, and only up to 280 characters. A longer caption stays in the clipboard.",
    de: "Ein Entwurf trägt nur Text, und nur bis 280 Zeichen. Ein längerer Text bleibt in der Zwischenablage.",
  },
  "share.platform.linkedin": {
    en: "The preview is read from a public web address. No address is set for this project, so this row stays off.",
    de: "Die Vorschau wird von einer öffentlichen Web-Adresse gelesen. Für dieses Projekt ist keine gesetzt, deshalb bleibt diese Zeile aus.",
  },
  "share.platform.open": {
    en: "Open {name}",
    de: "{name} öffnen",
  },
  "share.platform.opened": {
    en: "{name} opened, text in the clipboard",
    de: "{name} geöffnet, Text in der Zwischenablage",
  },
  "share.platform.copyFailed": {
    en: "The text could not be copied. Use the copy button above the caption instead.",
    de: "Der Text ließ sich nicht kopieren. Benutze den Kopierknopf über dem Text.",
  },
  "share.platform.popupBlocked": {
    en: "The browser blocked the new tab for {name}. Allow pop-ups for this page.",
    de: "Der Browser hat den neuen Tab für {name} blockiert. Erlaube Pop-ups für diese Seite.",
  },
  "share.platform.off": {
    en: "Needs a public address",
    de: "Braucht eine öffentliche Adresse",
  },
  "image.error": {
    en: "The image could not be created. Move the camera and try again.",
    de: "Das Bild konnte nicht erstellt werden. Bewege die Kamera und versuche es erneut.",
  },

  // ── Keyboard-only hints (taken over from the resolve() bridges, Lane WELT-GRIFF) ─
  "hints.echoNote": {
    en: "A key this view cannot use says so above the dock — that line is the answer, not an error.",
    de: "Eine Taste, die diese Ansicht nicht kann, antwortet einen Satz über der Dockleiste — das ist die Antwort, kein Fehler.",
  },
  "keys.orbitReleased": { en: "Camera released — it flies free again", de: "Kamera wieder frei" },
  "minimap.ariaKeyboard": {
    en: "City map. Arrow keys move the marker, Enter flies the camera to it — the same as a click.",
    de: "Übersichtskarte. Pfeiltasten bewegen die Markierung, Enter fliegt dorthin — wie ein Klick.",
  },
  "minimap.keys": { en: "← → ↑ ↓ marker · Enter flies", de: "← → ↑ ↓ Markierung · Enter fliegt" },
  // The map marks a critical plot with a wedge in its corner; this is the same
  // statement in words, for a plate whose two colours are 1,54:1 apart.
  "minimap.alarm": {
    en: "▲ {n} of {total} plots carry a critical finding",
    de: "▲ {n} von {total} Plätzen mit einem kritischen Fund",
  },
  "minimap.alarmOne": {
    en: "▲ {n} of {total} plots carries a critical finding",
    de: "▲ {n} von {total} Plätzen trägt einen kritischen Fund",
  },
  "minimap.alarmNone": {
    en: "▲ no plot carries a critical finding",
    de: "▲ kein Platz mit einem kritischen Fund",
  },
  "tooltip.zoomHintKeyboard": { en: "Enter — walk in", de: "Enter — hineingehen" },
  "tooltip.orbitHintKeyboard": {
    en: "Enter — circle it, Esc frees the camera",
    de: "Enter — umkreisen, Esc gibt die Kamera frei",
  },
  "tooltip.noFindingsOrbitHintKeyboard": {
    en: "Enter — circle it, Esc frees the camera",
    de: "Enter — umkreisen, Esc gibt die Kamera frei",
  },
} satisfies Record<string, { en: string; de: string }>;

export type DictKey = keyof typeof DICT;
