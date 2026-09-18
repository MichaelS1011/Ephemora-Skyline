# Architecture

CodeCity CyberDefense ist ein **Turborepo-Monorepo** mit zwei Workspaces: `frontend` und `backend`.

## Monorepo-Struktur

```
codecity-cyberdefense/
├── package.json            # Root: Workspaces, devDeps, Scripts
├── turbo.json              # Turborepo: Task-Definitionen
├── tsconfig.base.json      # Geteilter TypeScript-Config
├── eslint.config.js        # Root ESLint (Flat Config v9)
├── .prettierrc             # Prettier-Regeln
├── frontend/               # Workspace: React 3D-Frontend
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── src/
├── backend/                # Workspace: Express API
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
├── docker/                 # Dockerfile.backend + Dockerfile.frontend
├── .github/workflows/      # CI Pipeline
└── render.yaml             # Render Deployment
```

**Turborepo Tasks:**
- `dev`: Cache=false, persistent — startet beide Workspaces gleichzeitig
- `build`: `^build` — baut Backend zuerst, dann Frontend
- `lint`: `^lint` — Lint mit Dependency-Tracking
- `type-check`: `^build` — baut zuerst, dann Typ-Check
- `test`: `^build` — baut zuerst, dann Tests

## Backend-Architektur

```
backend/src/
├── server/
│   ├── index.ts            # Express App + HTTP + WebSocket Server
│   └── routes/
│       ├── analyze.ts      # POST /api/analyze Handler
│       ├── demo.ts         # GET /api/demo — Demo-Daten
│       └── health.ts       # GET /api/health Handler
├── services/
│   ├── github/
│   │   ├── client.ts       # GitHub API Client (node-fetch)
│   │   └── clone-manager.ts # Repository Cloning (isomorphic-git)
│   ├── analyzer/
│   │   └── orchestrator.ts # Analyse-Orchestrator (koordiniert Pipeline)
│   └── security/
│       └── scanner.ts      # Security Issue Scanner
├── models/
│   └── index.ts            # TypeScript Interfaces
│       ├── GitHubRepo
│       ├── FileAnalysis
│       ├── SecurityIssue
│       ├── AnalysisResult
│       ├── ProjectSummary
│       └── WebSocketEvent
├── parser/                 # Code-Parser: Lines, Complexity, Functions
├── scanner/                # Security-Pattern-Matching
├── ai/                     # AI-Integration (未来)
└── utils/                  # Hilfsfunktionen
```

### Analyse-Pipeline

```
1. CloneManager → Repository clonen (isomorphic-git, in-memory)
2. File Parser → Jede Datei: Lines, Languages, Cyclomatic/Cognitive Complexity
3. SecurityScanner → Pattern-Matching für Vulnerabilities (P0/P1/P2)
4. Analyzer Orchestrator → Ergebnis aggregieren → AnalysisResult
5. WebSocket / Polling → Fortschritt an Frontend senden
```

### API-Design

- **Asynchron**: `POST /api/analyze` startet Analyse im Hintergrund, gibt sofort `analysisId` zurück
- **Polling**: `GET /api/result/:id` und `GET /api/status/:id` für Status-Abfrage
- **WebSocket**: `/ws` für Echtzeit-Updates während der Analyse
- **In-Memory Store**: `Map<string, AnalysisResult>` — keine持久性 (für PoC/Entwicklung)

### Sicherheits-Middleware

- `helmet` — HTTP-Security-Headers
- `cors` — CORS mit allowlist (`http://localhost:3000`)
- `express-rate-limit` — Rate Limiting gegen Abuse
- Pino Logger strukturiertes Logging

## Frontend-Architektur

```
frontend/src/
├── main.tsx                # React Entry Point
├── App.tsx                 # Root-Komponente + State-Integration
├── components/
│   ├── CityScene.tsx       # Three.js-Szene (Ort, Camera, Lights)
│   ├── Building.tsx        # Einzelne Gebäude-Visualisierung
│   ├── InfoPanel.tsx       # Side Panel: File/Directory/Vuln-Details
│   ├── Minimap.tsx         # Übersichtskarte der Stadt
│   ├── RoadSystem.tsx      # Verbindungsstraßen zwischen Buildings
│   ├── ParticleField.tsx   # Partikel-Effekte (Cyberpunk-Atmosphäre)
│   └── SearchBar.tsx       # Repository-URL-Eingabe
├── renderer/               # 3D-Renderer-Komponenten
├── hooks/
│   ├── useAnimatedBuilding.tsx  # GSAP-Animationen für Gebäude
│   └── useCameraControls.tsx    # Kamera-Navigation (OrbitControls)
├── stores/
│   └── useStore.ts         # Zustand-Store (globaler State)
├── design/                 # Design-System: Farben, Cyberpunk-Theme
└── vite-env.d.ts           # Vite-Type-Declarations
```

### Tech-Stack-Entscheidungen

| Technologie | Grund |
|---|---|
| **React Three Fiber** | Declarative Three.js — besser für React Integration |
| **React Three Drei** | Helper-Komponenten (OrbitControls, Text, etc.) |
| **Zustand** | Minimaler State-Manager — kein Boilerplate wie Redux |
| **TailwindCSS** | Utility-First CSS — schnelles Styling ohne CSS-Dateien |
| **Vite** | Blitzschnelles HMR — besser als Create React App |
| **GSAP** | Professionelle Animationen für Building-Entry |

### State-Flow

```
User gibt GitHub URL ein
  → Zustand: setAnalysisUrl(url)
  → Backend: POST /api/analyze
  → Zustand: polling /api/status/:id
  → Zustand: setAnalysisResult(result)
  → React Three Fiber: Buildings basierend auf DirectorySummary rendern
  → InfoPanel: Details bei Building-Click
```

## Deployment-Architektur

### Docker Compose (Local)

```
Dockerfile.backend → Express App auf Port 4000
Dockerfile.frontend  → Nginx serving Vite Build auf Port 3000
docker-compose.yml   → Bridge Network, Backend first
```

### Render (Production)

```
render.yaml → Zwei Services:
  1. codecity-backend (Node.js Web-Service)
     - Build: npm ci && npm run build
     - Start: npm start
     - Health Check: /api/health
  2. codecity-frontend (Static Site)
     - Build: cd frontend && npm ci && npm run build
     - Publish: ./frontend/dist
     - Routes: /api/* → Backend-URL, /* → index.html (SPA Fallback)
```

## Abhängigkeiten

### Root
- **Turborepo** — Monorepo-Orchestrator
- **TypeScript 5.8** — Typisierung
- **ESLint 9 + @typescript-eslint v8** — Flat Config
- **Prettier** — Code Formatting
- **Husky + lint-staged** — Git Hooks (auto-lint on commit)

### Frontend
- **React 18** — UI Framework
- **Three.js + React Three Fiber** — 3D-Rendering
- **Zustand 5** — State Management
- **Vite 5** — Build Tool
- **TailwindCSS** — CSS Framework
- **GSAP** — Animationen

### Backend
- **Express** — Web Framework
- **isomorphic-git** — Git-Operationen in Node.js
- **Pino** — Logging
- **Helmet + CORS + Rate Limit** — Security
- **WebSocket (ws)** — Echtzeit-Kommunikation

---

## City Layer (v2 — semantischer Zoom & Bau-Film)

> Dieser Abschnitt beschreibt den aktuellen Stand der Stadt-Darstellung und
> korrigiert die älteren Frontend-Abschnitte oben.

### Datenfluss

```
GitHub Repo ──clone──▶ Orchestrator ──FileAnalysis[]──▶ cityMapper ──CityData──▶ Store ──▶ 3D-Szene
```

- **`backend/src/utils/cityMapper.ts`** baut aus der vollen Dateiliste einen
  hierarchischen Verzeichnisbaum (`CityDir`-Baum) mit Aggregaten pro Ordner
  (fileCount, LOC, Sprachen, Findings, threatScore, topFindings). Pro Ordner
  werden nur die Top-K Dateien (`detailFiles`, gewichtet Threat×√LOC) einzeln
  gerendert; der Rest wird ehrlich als `remainingFiles` gezählt (Podium).
  Import-Beziehungen werden aufgelöst (relative Pfade, Extensions, `index.*`,
  `@/`-Alias) und auf Datei- **und** Ordnerebene aggregiert.
- **`frontend/src/city/layout.ts`** layoutet deterministisch (path-gehashtes
  Jitter): ein Block pro Kind-Ordner + zentrale Plaza mit den Detail-Dateien,
  Center-out (schwere Einheiten innen), Straßenraster als StreetLines.
- **Semantischer Zoom:** `focusPath` im Store wählt die sichtbare Ebene.
  Übersicht = 1 Block pro Top-Level-Ordner — unabhängig von der Repo-Größe.
  Klick auf einen Block (`drillIn`) fliegt die Kamera hinein und öffnet den
  Block als eigenes Viertel. Brotkrumen + Minimap geben Orientierung,
  die Minimap zeigt die echte Kameraposition.
- **Bau-Film:** `buildPhase` (empty → constructing → built). Nach dem Laden
  steigen Blöcke und Gebäude zeitversetzt aus dem Boden (Straßen zuerst),
  getaktet über `buildStartedAt` + pro-Einzel-Delays; `BuildStatus` zeigt den
  Fortschritt, danach erscheint das City-Dossier (Größe, Sprachen, Findings,
  riskanteste Datei) und die Import-Arcs verbinden sich.
- **Security Tour:** risikogewichtete Fly-through aller Findings
  (`tourStops`), InfoPanel erklärt Typ, Zeile und Fix-Vorschlag.
- **Ehrlichkeit:** HUD zeigt „rendered/total files"; Findings sind als
  heuristischer Regex-Scan gekennzeichnet (SARIF-Import als Erweiterungspunkt —
  das CityData-Findings-Format ist scanner-agnostisch gehalten).
- **Share:** Jede analysierte Stadt hat einen Permalink `?city=<id>`
  (In-Memory-Store, lebt bis zum Backend-Restart) und PNG-Export.
