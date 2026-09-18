# CodeCity Verbesserungsplan — Stand 18.09.2026

Voll-Audit (Backend/Security, Frontend/3D, Setup/Doku/Tests) + Recherche zu aktuellen Versionen. Ziel: lokal laufendes Privatprojekt robuster, schneller und auf aktuellen Stand bringen. Alle Phasen sind unabhängig testbar; nach jeder Phase: `npm run lint && npm run type-check && npm test` + Live-Test mit axios/express/react über die echte UI.

## Phase 1 — Kritische Fixes (P0, muss)

1. **Build-Entry-Mismatch beheben** (backend): `tsc -b` schreibt nach `dist/src/server/index.js`, aber `npm start` + Docker-CMD zeigen auf stale `dist/server/index.js` (Build vom 31.07., ohne Rate-Limiter/alte CORS-Origin!). Fix: `backend/tsconfig.json` bekommt `"rootDir": "src"` (tests aus Build ausnehmen), stale `dist/server/` löschen, `start`-Script bleibt dann korrekt.
2. **clone-manager architektonisch fixen** (`backend/src/services/github/clone-manager.ts`): `exec(String)` → `execFile('git', ['clone', '--depth=1', '--branch', branch, '--single-branch', url, path])` — Shell-Injection-Klasse komplett eliminiert statt nur Allowlist-Mitigation. GITHUB_TOKEN nicht mehr in die URL, sondern via `GIT_ASKPASS`-Helper/`-c credential.helper`-Env — taucht dann nicht mehr im `ps`-Output auf. Toten `gitCommand()` in `client.ts:166-179` entfernen. `failed`-Clones aus `activeClones` aufräumen (Memory-Leak).
3. **WS-Rate-Limit-Bypass schließen** (`backend/src/server/index.ts:241-249`): `start_analysis` über WebSocket läuft komplett ohne Rate-Limiter (nur HTTP-Pfad ist gedeckt). AnalyzeLimiter analog auf WS-Nachrichten anwenden (key = remoteAddress).
4. **analysisStore-Eviction** (`server/index.ts:42`): Map wächst ungebunden (Memory-DoS) → LRU mit max. ~20 Ergebnissen + Alter-Grenze.
5. **Repo-Hygiene**: `git init` + erster Commit (es existiert KEIN .git — Husky-Pre-Commit und CI sind dadurch tot). `.gitignore`-Fix: `!.env.local` entfernen (lokalen Secrets würden sonst committet). 33 Build-Artefakte (`*.d.ts.map`, tsbuildinfo) aus `frontend/src/` löschen. `/tmp/codecity-clones`-Reste aufräumen.

## Phase 2 — Backend: Performance & Robustheit

6. **Gitleaks batchen** (`gitleaks-adapter.ts` + `orchestrator.ts:169`): aktuell 1 Prozess-Spawn + tmpdir PRO DATEI (bei 1000 Dateien = 1000 Spawns, Minuten bis Stunden). Fix: ein `gitleaks detect --source <clone> --report-format json --report-path <tmp>` pro Repo → Datei-Mapping aus Report. Das ist auch der offiziell vorgesehene Nutzungsmodus (ganz-repo-Scan in einem Prozess).
7. **Semgrep stabilisieren**: versioniertes Docker-Image statt `returntocorp/semgrep:latest`, `--metrics=off`, Registry-Rules cachen (lokales Rules-Verzeichnis) — currently still laut, wenn Registry nicht erreichbar ist.
8. **Analyze als Job**: `/api/analyze` und WS-Pfad liefern sofort Job-ID zurück (Kommentar im Code verspricht das schon, tut es aber nicht — Request blockt Minuten → Gateway-Timeouts). Fortschritt weiter via WS, existierender `GET /api/status/:id` als Polling-Fallback.
9. **Scanner-Noise dämpfen** (größter UX-Hebel laut Review): `CONSOLE_USAGE`/`LOOSE_EQUALITY` (P2-Flut, hunderte Treffer in realen Repos) default auf aus/gesammelt als "Info"-Bucket statt Threat; Cross-Provenance-Dedup (gleiche Stelle von Regex UND Semgrep erscheint doppelt); `provenance` (welcher Scanner lief wirklich) in die Summary — „complete" ehrlich machen, wenn nur Regex lief.
10. **Input-Hardening**: URL-Validierung via URL-Parser (aktuell `url.includes('github.com')` — akzeptiert `https://evil.com/?x=github.com`); nur `https://github.com/<owner>/<repo>`; `owner`/`branch` mit `encodeURIComponent` in GitHub-API-Pfaden (`analyze.ts:55`, `client.ts:110,140`); interne Fehlermeldungen (git-stderr) nicht roh an Clients.
11. **Aufräum-Logik verbinden**: `getCachedClone()`/Eviction (24h/Disk-Limit) sind toter Code — jeder Analyze re-klont. Entweder Cache in `cloneRepo()` nutzen oder toten Code entfernen + dokumentiertes Cleanup.

## Phase 3 — Frontend: Performance & UX

12. **mousemove-Re-Render-Fix** (`App.tsx:81-87`): jede Mausbewegung re-rendert die GANZE App inkl. Canvas-Props ~60×/s nur fürs Tooltip → Position via ref/transform statt State.
13. **Building-Rendering** (`Building.tsx`): 2–8 eigene Meshes + 2× `useFrame` pro Gebäude (~200 Frame-Callbacks bei 100 Gebäuden; Bau-`useFrame` läuft nach Ende weiter) → gemeinsame Geometrien, Bau-Animation nach 700ms deregistrieren, wenn machbar Instancing wie im RoadSystem.
14. **facadeCache-Full-Clear fixen** (`Building.tsx:34-40`): bei >500 Entries werden ALLE Texturen disposed, inkl. aktiver → Stotterer. Nur älteste Entries evicten.
15. **Unmemoisierte Baum-Walks cachen**: SearchBar walkt bei jedem Tastenanschlag den gesamten Dateibaum (`searchFiles`), ebenso InfoPanel/ContextCard/SecurityTour pro Render → useMemo/debounce.
16. **WS-Resilienz** (`useAnalysis.ts:114-151`): `onclose` fehlt komplett — bei Verbindungsverlust hängt der Progress-Balken ewig. Timeout + Reconnect + Polling-Fallback auf `/api/status/:id` + klare Fehlermeldung.
17. **Tote Features beleben oder entfernen**: `threatFilter` existiert im Store, hat aber kein UI → Filter-Chips ins HUD; dokumentierte Esc-Navigation („Up one level (Esc)", „double-Esc") implementieren oder Hilfetexte korrigieren; Permalink-Ladefehler zeigen aktuell still eine leere Welt → sichtbarer Empty-State.

## Phase 4 — Framework-Upgrade (empfohlen, eigene Phase; überspringbar)

Recherche Stand Sept 2026: React 19.x, @react-three/fiber 9.7, drei 10.x, postprocessing 3.x (braucht fiber 9), three r186, Vite 8.1. Projekt: React 18.3/fiber 8.18/drei 9.122/postprocessing 2.19/three 0.170/Vite 5.4.

18. Schrittweise, pro Paket mit Build+Test: React 19 → fiber 9 → drei 10 → postprocessing 3 → three r186 → Vite 8. **Danach StrictMode wieder aktivierbar** (dein frozen-Canvas-Problem ist ein fiber-v8-Bug, in v9 behoben) — main.tsx entsprechend umstellen und verifizieren.
19. Optional backend: Express 4→5 (stable seit Ende 2024, express-rate-limit v7 kompatibel), vitest upgraden.
20. Optional: Tailwind 3→4 (Offizielles Upgrade-Tool `npx @tailwindcss/upgrade`; CSS-first-Config — nur lohnend, wenn sonstiges steht).

## Phase 5 — Erweiterungen (Features)

21. **Abhängigkeits-Scan (empfohlen)**: vierter Scanner-Adapter via `npm audit --json`/OSV-Scanner im geklonten Repo — verwundbare Dependencies als eigenes Finding-Typ (eigene Farbe/Alarm-Stufe) in der Stadt; SARIF-Export bleibt konsistent.
22. **Git-History-Scan (Option beim Scan)**: Clone wahlweise ohne `--depth 1`, gitleaks scannt komplette History → findet gelöschte Secrets in alten Commits.
23. Weitere Kandidaten (nicht in diesem Durchgang): Branch-Diff-Stadt („was ändert dieser PR?"), LLM-Triage gegen False Positives.

## Phase 6 — Doku, Tests, Hygiene

24. **Doku-Fixes**: README behauptet isomorphic-git (stimmt nicht, es ist child_process-git) + dokumentiert `format:check` (existiert nicht); ARCHITECTURE.md nennt GSAP (gibt's nicht); GETTING_STARTED sagt Port 3000 (real 3010) und erwähnt NICHT, dass gitleaks/semgrep-Binaries installiert sein müssen (ohne sie degradiert still auf Regex) — Scanner-Voraussetzungen + Env-Variablen (CLONE_*, GIT_*, VITE_WS_URL) dokumentieren.
25. **Testlücken schließen (fokusiert)**: clone-manager (Sanitizing/execFile/Eviction), orchestrator-Pipeline-Smoke, useAnalysis (WS-States); Frontend-vitest auf `environment: 'jsdom'` umstellen damit Komponenten-Tests möglich werden.
26. **Docker (optional, lokal eh nicht genutzt)**: nginx `map` liegt illegal im server-Block, docker-compose setzt `FRONTEND_URL` statt `FRONTEND_ORIGIN`, Dockerfile-Build-Context/.dockerignore kaputt — erst fixen, falls Docker je gebraucht wird.

Umfang: Phasen 1–3 + 6 sind der Kern (Fixes, Perf, Ehrlichkeit der Scanner), Phase 4 ist der Modernisierungs-Sprung, Phase 5 Punkt 21 das sinnvollste neue Feature. Alle Änderungen bleiben lokal (kein Deployment nötig).