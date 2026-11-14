# Unterrichtsführer Schule & Uni — Ephemora Skyline

Deutschsprachiger Führer für Lehrkräfte: Schnellstart, ein 45-Minuten-Plan, eine
90-Minuten-Doppelstunde, ein Uni-Übungsblatt und ein Prüfungsblock mit
Musterantworten. Die dazugehörigen Übungen liegen unter
[`teaching/uebungen/`](../../teaching/README.md) und brauchen keine
Internetverbindung; englische Fassung: [SCHOOL_UNI_GUIDE.md](./SCHOOL_UNI_GUIDE.md).
Alle Produktaussagen hier stehen so (oder mit belegten Zahlen) in
[README.md](../../README.md), [docs/GETTING_STARTED.md](../GETTING_STARTED.md),
[docs/PRIVACY.md](../PRIVACY.md) und [docs/LIMITS.md](../LIMITS.md) — bitte dort
nachlesen, wenn eine Zahl in einem Arbeitsblatt kritisch wird.

## Schnellstart für die Lehrkraft (2 Minuten, einmalig)

Voraussetzung ist Node.js `^20.19.0 || >=22.12.0` (aus dem Paketmanager der Schule
oder von nodejs.org; darüber hinaus sind keine Administratorrechte nötig — die App
ist ein Node-Prozess, kein Dienst).

**Weg A — Release-Paket (empfohlen für Rechneräume).** Jedes Release seit v0.3.0
trägt sein fertiges Paket als Asset `ephemora-skyline-<version>.tgz`
([Releases-Seite](https://github.com/MichaelS1011/Ephemora-Skyline/releases)). In
einem leeren Ordner:

```bash
npm install ./ephemora-skyline-<version>.tgz
node_modules/.bin/ephemora-skyline --port 4173 --no-open
```

Dann im Browser `http://127.0.0.1:4173` öffnen. Das Paket enthält den gebauten
Backend- und Frontend-Code (`backend/dist`, `frontend/dist`); `npm install` holt
beim ersten Installieren die sieben Laufzeit-Abhängigkeiten aus dem npm-Registry —
für rein offline installierte Rechneräume: auf einem Rechner mit Netz einmal
installieren und den fertigen Ordner auf die übrigen kopieren (Details im
[IT-Admin-Datenschutz-Einseiter](./IT_ADMIN_DATENSCHUTZ.md)).

**Weg B — Checkout.** Im Repository: `npm install`, dann `npm start`; die App
öffnet sich auf `http://127.0.0.1:4173`. Fürs Beamerteam: `EPHEMORA_NO_OPEN=1`
hält den Browser geschlossen.

Zum Ausprobieren ohne eigenen Ordner: Der Einstiegsknopf **„Explore demo“** zeigt
eine Stadt aus Beispieldateien mit Beispielfunden — an ihr läuft kein Scanner
(steht so im README).

## 45-Minuten-Stunde: „Den eigenen Code durchleuchten“ (Übung 01-webshop)

Material: Ordner `teaching/uebungen/01-webshop/` (Kopie pro Zweiergruppe) und
[ARBEITSBLATT.md](../../teaching/uebungen/01-webshop/ARBEITSBLATT.md). Für die
Blind-Variante in jeder Kopie die Antwortdatei `.skyline-uebung.json` löschen
(siehe Arbeitsblatt-Lehrkraftteil).

| Phase            | Zeit  | Was passiert                                                                                                                                                                                                    | Notiz                                                                                                                                                                                                                                                                                                                  |
| ---------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ankommen         | 0–5   | App läuft bereits (Schnellstart), Beamer zeigt die Einstiegsseite                                                                                                                                               | Vor Stundenbeginn starten, nicht vor der Klasse                                                                                                                                                                                                                                                                        |
| Demo-Stadt       | 5–10  | „Explore demo“ öffnen; kurz erklären: Bezirke = Ordner, Gebäude = Dateien, rote Baken = Funde                                                                                                                   | Betonen: an der Demo lief **kein** Scanner — sie ist Anschauungsmaterial                                                                                                                                                                                                                                               |
| Gemeinsamer Scan | 10–15 | „Choose project folder“ → Kopie von `01-webshop`; Report ansehen                                                                                                                                                | Der Report zeigt 7 Meldungen: die 6 Lösungsseiten-Posten plus das Wertungsfall-`console.log`; mit optionalen Engines auf dem `PATH` kommt eine Zweitkanal-Meldung dazu (acht). Ohne Engines bleiben alle 6 Lösungsseiten-Posten sichtbar (schwacher Hash kommt aus dem mitgelieferten Regelpaket im eingebauten Kanal) |
| Paararbeit       | 15–33 | Gruppen arbeiten das Arbeitsblatt ab: Befunde den Stellen zuordnen, Hint-Leiter nutzen, Punkte sammeln                                                                                                          | Lehrkraft geht herum; bei „nicht gefunden“ auf die nächste Hint-Stufe verweisen, nicht auf die Lösung                                                                                                                                                                                                                  |
| Sicherheits-Tour | 33–41 | Lehrkraft führt die Tour: Button „Sicherheitsfunde besuchen, höchste Priorität zuerst“ — an jeder Bake kurz: Was sieht der Scanner, warum ist es gefährlich, wie behebt man es (Lösungstabelle im Arbeitsblatt) | Tour fliegt von Bake zu Bake; Reihenfolge ist Priorität, nicht Datei                                                                                                                                                                                                                                                   |
| Abschluss        | 41–45 | Reflexionsfragen im Plenum, zentrale: „Heißt ein grüner Report: sicher?“ → Nein, siehe [docs/LIMITS.md](../LIMITS.md): ganz Klassen (z. B. Berechtigungslogik) sieht kein Muster dieser Art                     | Optional: Verdicts setzen — die Buttons dazu sitzen am jeweiligen Befund im Panel                                                                                                                                                                                                                                      |

**Beamernotizen.** Mit `--no-open` bzw. `EPHEMORA_NO_OPEN=1` starten und manuell
einen Browser öffnen. Fester Port (`--port 4173`), damit alle denselben Link
kennen. Die Antwortdatei `.skyline-uebung.json` nicht im Panel anclicken — sie
enthält die Fundorte. Welche optionalen Engines laufen, zeigt die Stadt selbst
(Provenienz; fehlende Checks melden sich als übersprungen,
[docs/SCANNERS.md](../SCANNERS.md)).

## 90-Minuten-Doppelstunde: „Zwei Sprachen, dieselben Fehler“

Beide Übungen nacheinander; Ziel ist der Vergleich (Injection-Muster tauchen in
JavaScript und Python identisch auf; die Scanner-Kanäle unterscheiden sich).

| Block                 | Zeit  | Inhalt                                                                                                                                                                                                                                                                                                                     |
| --------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Einstieg              | 0–10  | Warum statische Analyse? Kurze Demo-Stadt, Begriffe Bezirk/Bake/Report                                                                                                                                                                                                                                                     |
| Scan-Ritual           | 10–20 | Gemeinsamer Scan von `01-webshop`, erste Befunde gemeinsam lesen; Verdict-Begriffe einführen (echter Fund / Fehlalarm / geprüft)                                                                                                                                                                                           |
| Übung 01              | 20–45 | Paararbeit am [Arbeitsblatt 01](../../teaching/uebungen/01-webshop/ARBEITSBLATT.md) (6 Stellen, 105 Punkte)                                                                                                                                                                                                                |
| Tour & Besprechung 01 | 45–55 | Sicherheits-Tour durch die Baken; Lösungstabelle besprechen (Was/Warum/Beheben)                                                                                                                                                                                                                                            |
| Übung 02              | 55–75 | [Arbeitsblatt 02](../../teaching/uebungen/02-datenimport/ARBEITSBLATT.md) (5 Stellen, 90 Punkte). Vorher ansagen: Auf Rechnern mit `semgrep`/`ruff` erscheinen **mehr** Meldungen als ohne — das ist Absicht und wird in Block 7 besprochen                                                                                |
| Vergleich & Kanäle    | 75–85 | Tafelbild: 5 der 6 Webshop-Funde stammen aus Musterregeln, einer (schwacher Hash) aus dem mitgelieferten Regelpaket im eingebauten Kanal; von den Python-Funden stammen 4 aus Musterregeln, der `os.system`-Fund braucht eine optionale Engine — was heißt „der Scanner hat nichts gefunden“? (Antwort im Arbeitsblatt 02) |
| Reflexion             | 85–90 | Plenum: grüner Report ≠ Garantie; welche Funde würdet ihr der IT melden, welche dem Lehrer als „egal“?                                                                                                                                                                                                                     |

## Uni-Übungsblatt: „Eigenes Projekt scannen und triagieren“ (90 Minuten, Partnerarbeit)

Studierende scannen **ihr eigenes** Semesterprojekt (oder ein mitgebrachtes
Open-Source-Projekt) und liefern eine begründete Triage.

1. **Scan.** App starten, Ordner wählen. Grenzwerte kennen: bis 10 000 Dateien /
   150 MB / 2 MB pro Datei wird vollständig gescannt; größere Ordner öffnen als
   Vorschau-Stichprobe von bis zu 2 000 Dateien, und die Ankündigung sagt es
   (README/Datenschutz). `.git` wird mitgeschickt (bis 96 MB, eigenes Budget), weil
   ohne Historie keine Churn-Achse entsteht ([docs/PRIVACY.md](../PRIVACY.md)).
2. **Lesen.** Jeden Befund öffnen: Typ, Schwere, Regel, Erklärung, Code-Frame
   (zwei Zeilen; Credential-Werte sind zu `‹hidden›` gelöscht, bevor ein Befund
   gespeichert wird).
3. **Triage.** Jeden Befund mit einem Verdict versehen (Fehlalarm / muss weg /
   geprüft). Verdicts liegen lokal: Browser-Speicher plus
   `~/.ephemora-skyline/verdicts.json`, sie überleben Backend-Neustart und
   Re-Scan ([docs/PRIVACY.md](../PRIVACY.md),
   [docs/AGENTS.md](../AGENTS.md) §3 — Lesekanal `GET /api/result/<id>/verdicts`).
4. **Beheben & verifizieren.** Zwei Befunde fixen, **neu scannen** und den
   Vergleich lesen: die Maske unterscheidet `present`, `gone`, `moved`,
   `unknown` — ein verschwundener Fingerabdruck allein ist kein Beweis, weil die
   Zeile auch nur gerutscht sein kann (`moved`), siehe
   [docs/AGENTS.md](../AGENTS.md) §2 (`POST /api/verify`).
5. **Export.** SARIF-2.1.0-Export über `GET /api/result/<id>/sarif`
   ([docs/API.md](../API.md)) — kurz anreißen, dass CI-Werkzeuge (z. B.
   GitHub-Code-Scanning) dieses Format lesen. PNG-Export als Stadtansicht für den
   Bericht.

**Abgabe:** Triage-Tabelle — Befund (Pfad, Zeile, Typ), Verdict, zwei-sätzige
Begründung, und bei „Fehlalarm“: warum die Regel hier danebenliegt. Bewertung an
der Begründung, nicht an der Zahl der Funde. Einbindung von
[docs/LIMITS.md](../LIMITS.md): Begründe, warum dein Projekt trotz grünen
Teilmengen nicht „sicher“ ist.

## Prüfungsblock: 10 Fragen mit Musterantworten

Alle Fragen sind aus dem Produkt beantwortbar (Panel, Reports, die vier
zitierten Dokumente). Musterantworten sind Kurzfassungen; volle Sätze erwartet.

1. **An welche Adresse bindet das Backend, und warum ist das im Schulnetz
   wichtig?** — An `127.0.0.1` (localhost). Andere Rechner im Schulnetz können den
   Dienst nicht erreichen; der Source-Post verlässt die Maschine nicht
   (README, docs/PRIVACY.md).
2. **Was ist die „Staging-Kopie“, wo liegt sie, wie lange?** — Eine
   Eigentümer-only Kopie des gewählten Ordners unter
   `$TMPDIR/ephemora-skyline-uploads/<id>`, gehalten 24 h (override
   `EPHEMORA_UPLOAD_DIR` / `EPHEMORA_UPLOAD_TTL_HOURS`), damit der in der Stadt
   eingebaute Testrunner das Projekt testen kann (docs/PRIVACY.md).
3. **Was speichert ein gespeicherter Lauf (`~/.ephemora-skyline/runs/<id>.json`) —
   und was nicht?** — Ordner-Name, relative Pfade, maskierte Code-Frames, Befunde
   und Zusammenfassung, die letzten 20 Läufe; **nicht** die Roh-Kopie, und
   Credential-Werte sind zu `‹hidden›` gelöscht (docs/PRIVACY.md).
4. **Nenne drei Befundtypen, die deine Scans gezeigt haben, je mit Gegenmaßnahme.**
   — z. B. SQL_INJECTION → parametrisierte Abfragen; PATH_TRAVERSAL → Pfad gegen
   Basisverzeichnis validieren (kein `..`); HARDCODED_SECRET → Geheimnisse aus dem
   Code in Umgebung/Vault (Arbeitsblätter 01/02, Lösungstabellen).
5. **Heißt „keine Befunde“ = „sicher"?** — Nein. Muster dieser Bauart sehen
   ganze Klassen nicht (u. a. Berechtigungslogik), und fehlende optionale Engines
   melden sich als übersprungen statt als „nichts gefunden“
   ([docs/LIMITS.md](../LIMITS.md), docs/SCANNERS.md).
6. **Warum erschien der `os.system`-Befund in Übung 02 auf manchen Rechnern
   nicht?** — Die Regel dafür läuft über das optionale `semgrep` (bzw. `ruff`
   meldet dieselbe Zeile); ohne diese Programme auf `PATH` bleibt die Zeile
   unbemerkt — der Report sagt aber, dass der Fall übersprungen wurde
   (Arbeitsblatt 02, docs/SCANNERS.md).
7. **Ein `console.log` wurde als Befund gemeldet. Storno oder beheben?** —
   Belegen: In Auslieferungscode löschen/Logger nutzen; im Schulmaterial war er
   absichtlich als Urteils-Fall ohne Punkte (Arbeitsblatt 01, Übungsteil „Was beim
   Scannen auffällt“, teaching/README.md).
8. **Was sind Fehlalarme (false positives), und wie zeichnest du einen?** —
   Befund, der technisch meldet, aber im Kontext harmlos ist (z. B. Testfixture).
   Im Panel als Verdict „Fehlalarm“ markieren; Verdicts liegen lokal in
   `~/.ephemora-skyline/verdicts.json` und gelten beim nächsten Scan desselben
   Ordners weiter (docs/PRIVACY.md, docs/AGENTS.md §3).
9. **Wozu der SARIF-Export, und wer liest ihn?** — Maschinenlesbarer
   Befundreport (SARIF 2.1.0) über `GET /api/result/<id>/sarif`; CI- und
   Code-Scanning-Werkzeuge können ihn einlesen, sodass das Team Befunde
   nachverfolgen kann, ohne Screenshots zu teilen (docs/API.md).
10. **Warum braucht das Werkzeug keinen Account, und welche Netzwerkzugriffe
    hat es überhaupt?** — Es ist lokal ausgelegt: kein Konto, keine Telemetrie.
    Die Host-Tabelle im README listet die ausgehenden Nachschlagen (u. a.
    Update-Check stündlich, abschaltbar; `SKYLINE_OFFLINE=1` schließt alle Pfade);
    die Guard-Tests prüfen die Host-Tabelle gegen den Code
    (`backend/tests/network-honesty.test.ts`, docs/PRIVACY.md §„What the guards
    are“).

## Lehrkraft-Checkliste vor der Stunde

- [ ] Node vorhanden, App startet auf festem Port, Browser offen, Demo-Stadt getestet.
- [ ] Übungskopien verteilt; für die Blind-Variante `.skyline-uebung.json` entfernt.
- [ ] Klar, welche optionalen Engines auf den Rechnern liegen (`semgrep`,
      `gitleaks`, `ruff` auf `PATH`) — davon hängt ab, wie viele Meldungen
      erscheinen (Erwartung vorher ansagen).
- [ ] Lösungstabellen beider Arbeitsblätter vor der Klasse nicht sichtbar
      (Hinweis-Panel zeigt nie Fundorte, aber die Arbeitsblatt-Datei selbst tut es).
- [ ] Zeitpuffer: Paararbeit ist der Kern; Tour und Plenum kürzbar.
