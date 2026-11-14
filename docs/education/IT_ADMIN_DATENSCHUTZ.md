# IT- und Datenschutz-Kurzinformation — Ephemora Skyline

Einseiter für Datenschutzbeauftragte und IT-Administration. Deutsche Fassung mit
englischer Kurzfassung oben. Jede Aussage hier ist in
[docs/PRIVACY.md](../PRIVACY.md), [README.md](../../README.md),
[docs/GETTING_STARTED.md](../GETTING_STARTED.md) oder
[docs/SCANNERS.md](../SCANNERS.md) belegt; die Dateipfade sind mitgenannt.

**EN summary.** Ephemora Skyline is a local-first code analyzer: the backend
binds to `127.0.0.1` only, source is posted over loopback and stops there, there
is no account and no telemetry. The only scheduled outbound request is an hourly
"is a newer version published?" call to `api.github.com`, switchable off
permanently with one click, and `SKYLINE_OFFLINE=1` closes every outbound path.
On disk the app writes exactly three kinds of data, all documented: a
owner-only staged copy of the scanned folder under `$TMPDIR/ephemora-skyline-uploads/`
(expiring after 24 h), a run archive of the newest 20 results in
`~/.ephemora-skyline/runs/` (masked code frames, no raw source), and triage
verdicts in `~/.ephemora-skyline/verdicts.json`. Installation needs Node.js and,
for the release package, one npm-registry reach for seven runtime dependencies;
the optional engines (`gitleaks`, `semgrep`, `ruff`) are not required and report
themselves as skipped when absent.

## Was läuft, woran gebunden

- **Nur Loopback.** Das Backend bindet an `127.0.0.1`; der Source-Ordner wird per
  HTTP über die Schleife an die eigene Backend-Instanz gesendet und dort lokal
  analysiert — es gibt keinen Upload (README-Privatsphäre-Sektion,
  docs/PRIVACY.md). Kein Dienst, kein Daemon, kein Freigeben von Ports ins Netz:
  die Firewall der Rechner muss nichts zulassen; aus dem Schulnetz ist der
  Prozess nicht erreichbar.
- **Kein Konto, keine Telemetrie.** Keine Registrierung, kein Login, keine
  Analytics (docs/GETTING_STARTED.md: „No account, no token, no upload“). Die
  ausgehenden Nachschlagen sind in der Host-Tabelle des READMEs einzeln
  aufgeführt; `backend/tests/network-honesty.test.ts` prüft diese Tabelle gegen
  den Code (docs/PRIVACY.md § „What the guards are“).
- **Der eine planmäßige Ausgang.** Ein stündlicher Update-Check fragt
  `api.github.com` nach dem neuesten Release-Tag; in der Anfrage stehen weder
  Code noch Pfade noch Maschinenangaben. Er ist ab dem ersten Start an und bleibt
  dauerhaft aus nach einem Klick im „More“-Menü der Stadt;
  `SKYLINE_OFFLINE=1` schaltet ihn sowie OSV-/Abhängigkeits-Checks, pip-audit und
  alle Downloads (auch den Semgrep-Docker-Fallback) ab
  (docs/GETTING_STARTED.md, docs/PRIVACY.md).
- **Optionales lokales Modell.** Die Finding-Erklärungen durch ein Sprachmodell
  sind ausgeschaltet, wenn nicht selbst aktiviert; die konfigurierte Adresse muss
  Loopback sein, sonst verweigert der Start das Feature; `SKYLINE_OFFLINE=1`
  schließt auch diesen Weg (docs/PRIVACY.md).

## Was auf der Platte geschrieben wird (und wie man es löscht)

1. **Staging-Kopie** des gewählten Ordners unter
   `$TMPDIR/ephemora-skyline-uploads/<id>`, nur für den Eigentümer lesbar,
   24 Stunden gehalten (override `EPHEMORA_UPLOAD_DIR`,
   `EPHEMORA_UPLOAD_TTL_HOURS`), damit der eingebaute Testrunner das Projekt
   selbst testen kann. Der Ordner-Chooser sendet auch `.git` mit (eigenes Budget
   96 MB) — ohne Historie gäbe es keine Churn-Achse. Was ausgelassen wird
   (`.gitignore`-Treffer, `node_modules`, Build-Ordner, Dateien über 2 MB), wird
   gezählt, nicht versteckt (docs/PRIVACY.md § „What the staged copy is“).
   Löschen: Ordner entfernen oder 24 h verstreichen lassen.
2. **Lauf-Archiv** `~/.ephemora-skyline/runs/<id>.json` (override
   `EPHEMORA_RUNS_DIR`), atomar und eigentümer-only, die neuesten 20 Läufe. Es
   enthält Ordner-Name, relative Pfade, maskierte Code-Frames, Befunde und
   Zusammenfassung — **nicht** die Roh-Kopie; Credential-Werte sind vorher zu
   `‹hidden›` gelöscht (docs/PRIVACY.md § „What a saved city carries“ /
   „How long a result lives“). Löschen: Ordner `~/.ephemora-skyline/runs`
   entfernen.
3. **Triage-Verdicts** im Browser-Speicher plus Maschinen-Spiegel
   `~/.ephemora-skyline/verdicts.json` (override `EPHEMORA_VERDICTS_FILE`). Der
   Reset-Knopf der Einstiegsseite löscht beide; Nichts davon verlässt die
   Maschine (docs/PRIVACY.md § „Three things are the exception…“,
   docs/AGENTS.md § 3). Ephe-Namen stehen nur im Browser-Speicher und gehen nie
   ans Backend.

Bei Mehrbenutzer-Rechneräumen liegen alle drei Punkte je Benutzerkonto
(`$TMPDIR` bzw. `$HOME`, Browser-Profil) — eigene lokale Accounts pro Schüler/in
halten die Daten getrennt und machen das Löschen trivial.

## Installation im Computerraum

- **Node.js** `^20.19.0 || >=22.12.0` ist die einzige Voraussetzung
  (`package.publish.json`, README). Darüber hinaus sind keine Administratorrechte
  nötig; die App ist ein Node-Skript (`scripts/ephemora-skyline.mjs`), kein
  Dienst und kein Treiber.
- **Release-Paket:** `npm install ./ephemora-skyline-<version>.tgz` in einem
  leeren Ordner, Start mit `node_modules/.bin/ephemora-skyline --port 4173
--no-open`. Das Paket enthält den gebauten Code (`backend/dist`,
  `frontend/dist`); `npm install` benötigt beim ersten Installieren Zugang zum
  npm-Registry für sieben Laufzeit-Pakete (express, helmet, cors, dotenv,
  express-rate-limit, pino, typescript — siehe `package.publish.json`).
  **Voll offline:** auf einem netzwerkfähigen Rechner einmal installieren und den
  fertigen Ordner auf die übrigen kopieren, oder das interne npm-Mirror
  verwenden. Nach der Installation läuft alles offline; der Update-Check bleibt
  per Klick aus oder mit `SKYLINE_OFFLINE=1` abgeschaltet.
- **Optionale Engines:** `gitleaks`, `semgrep`, `ruff`, `osv-scanner` sind
  optional und werden nur über `PATH` gesucht. Fehlen sie, melden sich die
  zugehörigen Checks als übersprungen — die Stadt malt betroffene Gebäude in der
  Farbe „hier hat kein Scanner hingesehen“, statt sie sauber zu nennen
  (docs/SCANNERS.md, docs/PRIVACY.md). Eine Installation dieser Werkzeuge ist
  für den Unterrichtsbetrieb nicht erforderlich.

## Prüfbarkeit

Die Privatsphäre-Behauptungen sind nicht nur Text: `network-honesty.test.ts`
vergleicht Host-Tabelle und Code-Deklaration, `no-websocket-surface.test.ts`
verbietet WebSocket-/Hosted-Backend-Formulierungen im öffentlichen Text, und
die fünfzehn Origin-geschützten Routen weisen Cross-Site-Anfragen ab
(docs/PRIVACY.md § „What the guards are“). Auslieferungsgegenstand ist
Apache-2.0-Quellcode; ein Betrieb ohne Einsicht in den Quellcode ist nicht nötig.

_Stand dieser Datei: 2026-11-14. Bei Abweichungen gilt der Quelltext mit seinen
Tests; die zitierten Dokumente sind die deutschsprachigen Leitfassungen._
