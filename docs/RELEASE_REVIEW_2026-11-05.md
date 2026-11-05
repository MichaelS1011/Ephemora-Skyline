# Release-Prüfung 0.4.5

5. November 2026. Geprüfter Stand: Commit `54a9b86`, Tag `v0.4.5`. Ziel ist die lokale Installation und das GitHub-Release; eine Hosting-Funktion ist nicht Teil des Produkts.

## Freigabestand

| Punkt         | Nachweis                                                                                                                                                                                                                     |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Version       | `package.json`, `frontend/package.json`, `backend/package.json`, `package.publish.json` und `package-lock.json` nennen `0.4.5`.                                                                                              |
| Release       | [v0.4.5](https://github.com/MichaelS1011/Ephemora-Skyline/releases/tag/v0.4.5), veröffentlicht am 2026-11-05. Asset: `ephemora-skyline-0.4.5.tgz`, 1,13 MB, 279 Dateien.                                                     |
| Installation  | `npm run pack:check` baute, packte und installierte den Tarball in einen leeren Ordner. Ergebnis: 279 Dateien, 3,62 MB entpackt, 1,13 MB gepackt, Health ok, App ausgeliefert, Version `0.4.5` stimmt mit dem Paket überein. |
| Tests         | 3.774 Fälle: 2.819 Frontend in 233 Testdateien, 955 Backend in 92 Testdateien.                                                                                                                                               |
| Gates         | Lint, Type-Check, Build, vollständige Tests, Prettier, Self-Scan mit 0 Findings und Audit-Gate mit 0 Findings sind grün.                                                                                                     |
| CodeQL        | Lauf [42105578623](https://github.com/MichaelS1011/Ephemora-Skyline/actions/runs/42105578623) erfolgreich; 0 offene Code-Scanning-Alerts.                                                                                    |
| CI            | Lauf [42105578298](https://github.com/MichaelS1011/Ephemora-Skyline/actions/runs/42105578298) erfolgreich: Security Scan, Lint und Type-Check, Build sowie Tests auf Node 20.19, 22.12 und 24.                               |
| Dokumentation | README und CHANGELOG nennen `0.4.5`; der Release-Text trägt den SHA-256 des Assets: `4b8e4451d071a889875a5c0d29a45ca12d4073ddec73fc2b8d4593ef33ce8454`.                                                                      |

## Durchgeführte Nachweise

- Der Release-Cut lief über `node scripts/release-cut.mjs --kind patch` und prüfte vor dem Commit Lint, Type-Check, Tests, Build, Audit-Gate und `pack:check`.
- Der Tarball wurde nach dem Upload erneut heruntergeladen; seine SHA-256 stimmt mit dem Release-Text überein.
- `v0.4.4` wurde nachträglich aus Commit `a84af53` veröffentlicht, damit die bereits gesetzte Manifest-Version nicht ohne Tag und Release bleibt. `v0.4.5` ist der aktuelle Stand.
- Die Dokumentation wurde auf den veröffentlichten Stand gezogen: Release-Beispiele, Paketgrößen und der `[unreleased]`-Vergleichslink zeigen jetzt auf `v0.4.5`.

## Offen vor einer uneingeschränkten Freigabe

1. In einem normalen Desktop-Browser einen echten Projektordner über den nativen Dialog wählen, den Scan abschließen, eine Datei prüfen und die Stadt erneut öffnen.
2. Den dokumentierten Compose-Befehl auf einem Rechner mit laufendem Docker-Daemon ausführen und Ordnerimport, Proxy und Tests dort prüfen.
3. Ein eigenes und zwei fremde reale Projekte prüfen; jeden P0/P1-Fall menschlich einordnen, bevor eine öffentliche Aussage über gefundene Fehler gemacht wird.
4. Die visuelle Stufe B abnehmen: feste GPU-Screenshots der vier Stadtgrößen in beiden Grafikprofilen, ein Straßenblick auf die Ephe's und ein realer Lauf mit 1.000+ Dateien für FPS, Kameraflug, Fokus, Export und Speicherverbrauch.
5. PNG- und WebM-Export auf Chrome, Safari und Firefox unter Mac und Windows prüfen: Abspielbarkeit, Zuschnitt, Dateigröße und Abbruch.
6. Fünf bis acht moderierte Desktop-Sessions durchführen und beobachten, ob Nutzer die visuelle Kodierung ohne Anleitung verstehen.

## Bewertung

`0.4.5` ist als lokale Vorabversion veröffentlicht und durch automatisierte Gates sowie einen echten Installationslauf belegt. Eine uneingeschränkte Aussage „alles funktioniert“ bleibt ohne die oben genannten Browser-, Docker-, Fremdprojekt-, GPU-, Export- und Nutzertests nicht belegt. Der ältere Bericht vom 11. Oktober 2026 bleibt als historischer Stand erhalten und beschreibt nicht diesen Release.
