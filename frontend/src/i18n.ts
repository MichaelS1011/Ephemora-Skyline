/**
 * Minimal i18n — one flat dictionary, two languages, zero dependencies.
 *
 * English is the source of truth: every key exists in both languages and the
 * English value matches the pre-i18n UI strings exactly, so the default
 * language renders byte-identical to before. Placeholders use {name} syntax
 * and are replaced with plain string operations — no regex, no runtime that
 * could throw on a missing key.
 */

export type Lang = "en" | "de";

/** The full UI dictionary — exported so tests can audit key coverage. */
export const DICT = {
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
  "profile.estimated": {
    en: "Scan time once the folder is read: {time}.",
    de: "Scanzeit, nachdem der Ordner gelesen ist: {time}.",
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
  "landing.demoError": {
    en: "The demo couldn't load. Check that the local server is running, then try again.",
    de: "Die Demo konnte nicht geladen werden. Prüfe, ob der lokale Server läuft, und versuche es erneut.",
  },
  "landing.progressCollecting": {
    en: "Reading your folder · {count} files",
    de: "Ordner wird gelesen · {count} Dateien",
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
    en: "— open to change scan depth",
    de: "— öffnen, um die Scan-Tiefe zu ändern",
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
  "hud.connecting": {
    en: "Connecting…",
    de: "Verbindung wird hergestellt…",
  },
  "hud.localProject": {
    en: "Local project",
    de: "Lokales Projekt",
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
  "hud.sevAriaOff": {
    en: "{label} findings: {count}. Filter city",
    de: "{label}: {count} Funde. Stadt filtern",
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
    de: "ABHÄNGIGK.",
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
  "search.findingsGroup": {
    en: "Findings",
    de: "Fundstellen",
  },
  "search.filesGroup": {
    en: "Files",
    de: "Dateien",
  },
  "actions.colorblindPalette": {
    en: "Colorblind-safe palette",
    de: "Farbsichere Palette",
  },
  "actions.runTests": {
    en: "Run tests",
    de: "Tests ausführen",
  },
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
  "actions.linkCopied": {
    en: "City link copied. It opens while this local server is running.",
    de: "Stadt-Link kopiert. Er funktioniert, solange dieser lokale Server läuft.",
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
    en: "Next finding (Triage)",
    de: "Nächster Fund (Triage)",
  },
  "hints.triagePrev": {
    en: "Previous finding (Triage)",
    de: "Vorheriger Fund (Triage)",
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
    en: "Threat level — the worst finding severity in this file (critical → high → medium → low). Drawn as red pulsing windows in the city.",
    de: "Bedrohungsstufe — der schwerste Fund in dieser Datei (kritisch → hoch → mittel → gering). In der Stadt als rot pulsierende Fenster dargestellt.",
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
    en: "Search buildings",
    de: "Gebäude durchsuchen",
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
  "analyze.success": {
    en: "✓ CITY BUILT — explore it below",
    de: "✓ STADT GEBAUT — unten erkunden",
  },
  "analyze.cancel": {
    en: "CANCEL",
    de: "ABBRECHEN",
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
} satisfies Record<string, { en: string; de: string }>;

export type DictKey = keyof typeof DICT;

/**
 * Look up a string in the display language and substitute {name} placeholders.
 * Unknown keys return the key itself — calling code never has to guard.
 */
export function t(lang: Lang, key: DictKey, vars?: Record<string, string | number>): string {
  const entry = (DICT as Record<string, { en: string; de: string } | undefined>)[key];
  const text = entry ? entry[lang] : key;
  if (!vars) return text;
  return Object.entries(vars).reduce(
    (acc, [name, value]) => acc.split(`{${name}}`).join(String(value)),
    text,
  );
}
