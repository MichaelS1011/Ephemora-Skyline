# teaching/ — Übungsmaterial für Unterricht und Lehre

Deutsch zuerst, englische Kurzfassung unten.

Dieser Ordner enthält **Lernmaterial mit absichtlich eingebauten Sicherheitsfehlern**
für die Arbeit mit Ephemora Skyline in Schule (Sekundarstufe II) und Uni-Einführungen.

## Der Inhalt

| Ordner                    | Was                                                                   | Sprache                              | Gesuchte Stellen |
| ------------------------- | --------------------------------------------------------------------- | ------------------------------------ | ---------------- |
| `uebungen/01-webshop`     | Mini-Webshop: Suche, Download, Bildkonvertierung, Kassenzettel, Login | JavaScript (Node.js, ohne Framework) | 6                |
| `uebungen/02-datenimport` | Import-Pipeline: CSV/Pickle laden, Demo-Feed, Archive packen          | Python 3                             | 5                |

Jede Übung enthält ein **ARBEITSBLATT.md** mit Ablauf, Hint-Leiter, Reflexionsfragen
und einem Lehrkraft-Teil (Lösungstabelle, was/warum/wie beheben pro Stelle). Die
Antwortliste liegt als `.skyline-uebung.json` im Übungsordner
(`schema: ephemora.exercise-key.v1`).

## Kurz gesagt (TL;DR)

1. Projektstamm öffnen, `npm start`, dann <http://127.0.0.1:4173>.
2. „Ordner analysieren“ → `teaching/uebungen/01-webshop` (oder `02-datenimport`).
3. Arbeitsblatt öffnen, Aufgaben 1–5 der Reihe nach arbeiten; Hinweise erst auf Nachfrage freigeben.

## Was beim Scannen auffällt (und warum)

- Alle Zugangsdaten sind **erfunden** (`demo-not-a-real-key-…`, `demo-nicht-echt-…`);
  die Demo-Feed-Adresse existiert nicht. Nichts aus diesem Ordner auf echte Systeme loslassen.
- Je nach installierten Zusatz-Werkzeugen (semgrep, ruff, gitleaks) erscheinen **mehr**
  Meldungen als die gesuchten Stellen — die Arbeitsblätter ordnen jede zusätzliche
  Meldung ein (Doppelmeldungen anderer Kanäle, Diskussionsfälle wie MD5-Prüfsummen).
- Vier von fünf Python-Stellen und alle sechs Webshop-Stellen finden die **eingebauten**
  Kanäle ohne jedes Zusatz-Werkzeug; die fünfte Python-Stelle (`os.system`) meldet das
  mitgelieferte Regelpaket über die optionale semgrep-Anbindung. Die Arbeitsblätter sagen
  pro Stelle, welcher Kanal sie findet.
- Die Webshop-Route `server.js` enthält ein `console.log` — ein echter, bewusster Fund,
  der nicht zur Punkte­liste gehört: Lernende sollen lernen, Befunde zu beurteilen
  („echt oder egal?“), nicht nur abzuhaken.

## Blind-Challenge

Für die Blintherausforderung den Übungsordner **ohne** `.skyline-uebung.json` austeilen
(Datei in einer Kopie entfernen). In der Übungsphase darf die Datei bleiben: Das
Hinweis-Panel zeigt daraus nur Hinweise zu noch nicht gefundenen Stellen, niemals Fundorte.

## Warum dieser Ordner im Selbstscan des Projekts ausgenommen ist

Die eingebauten Fehler sind **Lehrmaterial, keine Funde im Produktcode**. Der
Gate-Selbstscan (`scripts/self-scan.mjs`, siehe `docs/SELF_SCAN.md`) schließt den
Ordner `teaching/` deshalb aus — dieselbe Begründung wie für die Analyse-Fixtures unter
`backend/tests/fixtures/regeln`: Sie sollen lehren, nicht anklagen. Die Ausnahme ist in
`docs/SELF_SCAN.md` dokumentiert. Von einem normalen Scan — auch dem des Produkts
über einen gewählten Ordner — sind die Übungen weiterhin sichtbar und gefunden
werden; in der mitgelieferten Beispielliste `docs/self-scan-findings.ndjson`
erscheinen sie unter ihren `teaching/`-Pfaden, dort als Lehrmaterial ausgewiesen
(siehe `docs/LIMITS.md`), nicht als Produktmängel.

## Für Lehrkräfte

- Stundenpläne, Uni-Übungsblatt und ein Prüfungsblock mit Musterantworten stehen in
  `docs/education/SCHULE_UNI_GUIDE.md` (deutsch) bzw. `docs/education/SCHOOL_UNI_GUIDE.md` (englisch).
- Für die IT-Datenschutzabstimmung (127.0.0.1-Bindung, keine Telemetrie, Offline-Installation):
  `docs/education/IT_ADMIN_DATENSCHUTZ.md`.
- Der Scanner läuft lokal und lädt nichts hoch (siehe `docs/PRIVACY.md`); die Übungen
  erfordern keine Internetverbindung.

---

## English TL;DR

This folder holds **deliberately vulnerable teaching material** for Ephemora Skyline:
a mini Node.js webshop with six planted issues (`uebungen/01-webshop`) and a Python
data-import pipeline with five (`uebungen/02-datenimport`). Each exercise ships a
worksheet (`ARBEITSBLATT.md`, German with an English section) plus a machine-readable
answer key (`.skyline-uebung.json`, `schema: ephemora.exercise-key.v1`). Start the app
(`npm start` → <http://127.0.0.1:4173>), choose „Ordner analysieren“ on an exercise
folder, and work the worksheet. All credentials are invented; nothing should be run
against real systems. Built-in channels find all six webshop items and four of five
Python items with no optional tools installed — the worksheets state, per item, which
channel reports it. For a blind challenge, hand out the folder without the answer-key
file. The folder is excluded from the project's own self-scan gate (it teaches, it is
not product code) — see `docs/SELF_SCAN.md`. Lesson plans, a university lab sheet, an
exam block, and an IT-admin/data-protection one-pager live in `docs/education/`.
