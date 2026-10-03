# Architecture

Ephemora Skyline is a **Turborepo monorepo** with two workspaces: `frontend` and `backend`.

## Monorepo Structure

```
codecity-cyberdefense/          # internal package name (owner-locked)
├── package.json            # Root: workspaces, devDeps, scripts
├── turbo.json              # Turborepo: task definitions
├── tsconfig.base.json      # Shared TypeScript config
├── eslint.config.js        # Root ESLint (Flat Config v9)
├── .prettierrc             # Prettier rules
├── frontend/               # Workspace: React 3D frontend
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── src/
├── backend/                # Workspace: Express API
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
├── docker/                 # Dockerfile.backend + Dockerfile.frontend
├── .github/workflows/      # CI pipeline
└── render.yaml             # Render deployment
```

**Turborepo tasks:**

- `dev`: cache=false, persistent — starts both workspaces simultaneously
- `build`: `^build` — builds the backend first, then the frontend
- `lint`: `^lint` — lint with dependency tracking
- `type-check`: `^build` — builds first, then type check
- `test`: `^build` — builds first, then tests

## Backend Architecture

```
backend/src/
├── server/
│   ├── index.ts            # Express app + HTTP server
│   └── routes/
│       ├── analyze.ts      # POST /api/analyze handler
│       ├── demo.ts         # GET /api/demo — demo data
│       └── health.ts       # GET /api/health handler
├── services/
│   ├── github/
│   │   ├── client.ts       # GitHub API client (node-fetch)
│   │   └── clone-manager.ts # Repository cloning (system git via execFile)
│   ├── analyzer/
│   │   └── orchestrator.ts # Analysis orchestrator (coordinates the pipeline)
│   └── security/
│       └── scanner.ts      # Security issue scanner
├── models/
│   └── index.ts            # TypeScript interfaces
│       ├── GitHubRepo
│       ├── FileAnalysis
│       ├── SecurityIssue
│       ├── AnalysisResult
│       ├── ProjectSummary
│       └── ProgressEvent
├── parser/                 # Code parser: lines, complexity, functions
├── scanner/                # Security pattern matching
├── ai/                     # AI integration (future)
└── utils/                  # Helper functions
```

### Analysis Pipeline

```
1. CloneManager → clone the repository (system git, shallow by default; fullHistory option for history secret scan)
2. File Parser → per file: lines, languages, cyclomatic/cognitive complexity
3. SecurityScanner → pattern matching for vulnerabilities (P0/P1/P2)
4. Analyzer Orchestrator → aggregate the result → AnalysisResult
5. Progress events → job-progress map → the frontend polls GET /api/status/:id
```

### API Design

- **Asynchronous**: `POST /api/analyze` starts the analysis in the background and returns an `analysisId` immediately
- **Polling**: `GET /api/result/:id/city` and `GET /api/status/:id` for status queries
- **Progress**: `GET /api/status/:id` only — there is no socket, the frontend polls it every 2 s
- **In-memory store**: `Map<string, AnalysisResult>` — no persistence (for PoC/development)

### Security Middleware

- `helmet` — HTTP security headers
- `cors` — CORS with an allowlist (`http://localhost:3010`)
- `express-rate-limit` — rate limiting against abuse
- Pino logger for structured logging

## Frontend Architecture

```
frontend/src/
├── main.tsx                # React entry point
├── App.tsx                 # Root component + state integration
├── components/
│   ├── CityScene.tsx       # Three.js scene (scene, camera, lights)
│   ├── Building.tsx        # Individual building visualization
│   ├── InfoPanel.tsx       # Side panel: file/directory/vuln details
│   ├── Minimap.tsx         # Overview map of the city
│   ├── RoadSystem.tsx      # Connecting roads between buildings
│   ├── ParticleField.tsx   # Particle effects (cyberpunk atmosphere)
│   └── SearchBar.tsx       # Repository URL input
├── renderer/               # 3D renderer components
├── hooks/
│   └── useLocalAnalysis.ts # folder pick → upload → poll /api/status for progress
├── stores/
│   └── useStore.ts         # Zustand store (global state)
├── design/                 # Design system: colors, cyberpunk theme
└── vite-env.d.ts           # Vite type declarations
```

### Tech-Stack Decisions

| Technology               | Rationale                                                    |
| ------------------------ | ------------------------------------------------------------ |
| **React Three Fiber**    | Declarative Three.js — better for React integration          |
| **React Three Drei**     | Helper components (OrbitControls, Text, etc.)                |
| **Zustand**              | Minimal state manager — no Redux-style boilerplate           |
| **TailwindCSS**          | Utility-first CSS — fast styling without CSS files           |
| **Vite**                 | Blazing-fast HMR — better than Create React App              |
| **react-three-fiber v9** | Building-entry kinematics via useFrame, CSS keyframes for UI |

### State Flow

```
User enters a GitHub URL
  → Zustand: setAnalysisUrl(url)
  → Backend: POST /api/analyze
  → Zustand: polling /api/status/:id
  → Zustand: setAnalysisResult(result)
  → React Three Fiber: render buildings based on DirectorySummary
  → InfoPanel: details on building click
```

## Deployment Architecture

### Docker Compose (Local)

```
Dockerfile.backend   → Express app on port 4000
Dockerfile.frontend  → Nginx serving the Vite build on port 3010
docker-compose.yml   → Bridge network, backend first
```

### Render (Production)

```
render.yaml → Two services:
  1. codecity-backend (Node.js web service)
     - Build: npm ci && npm run build
     - Start: npm start
     - Health check: /api/health
  2. codecity-frontend (Static site)
     - Build: cd frontend && npm ci && npm run build
     - Publish: ./frontend/dist
     - Routes: /api/* → backend URL, /* → index.html (SPA fallback)
```

## Dependencies

### Root

- **Turborepo** — monorepo orchestrator
- **TypeScript 5.8** — typing
- **ESLint 9 + @typescript-eslint v8** — Flat Config
- **Prettier** — code formatting
- **Husky + lint-staged** — git hooks (auto-lint on commit)

### Frontend

- **React 19** — UI framework (StrictMode-safe with R3F v9)
- **Three.js r186 + React Three Fiber 9** — 3D rendering
- **@react-three/postprocessing 3** — bloom
- **Zustand 5** — state management
- **Vite 8** — build tool (Rolldown)
- **TailwindCSS** — CSS framework

### Backend

- **Express** — web framework
- **system git** via execFile argument array (no shell, token via askpass)
- **Pino** — logging
- **Helmet + CORS + Rate Limit** — security

---

## City Layer (v2 — semantic zoom & build film)

> This section describes the current state of the city rendering and
> supersedes the older frontend sections above.

### Data Flow

```
GitHub Repo ──clone──▶ Orchestrator ──FileAnalysis[]──▶ cityMapper ──CityData──▶ Store ──▶ 3D scene
```

- **`backend/src/utils/cityMapper.ts`** builds a hierarchical directory tree
  (`CityDir` tree) from the full file list, with per-directory aggregates
  (fileCount, LOC, languages, findings, threatScore, topFindings). Per directory
  only the top-K files (`detailFiles`, weighted Threat×√LOC) are rendered
  individually; the rest are counted honestly as `remainingFiles` (podium).
  Import relationships are resolved (relative paths, extensions, `index.*`,
  `@/` alias) and aggregated at both the file **and** directory level.
- **`frontend/src/city/layout.ts`** lays out deterministically (path-hashed
  jitter): one block per child directory + a central plaza holding the detail
  files, center-out (heavy units inside), a road grid as StreetLines.
- **Semantic zoom:** `focusPath` in the store selects the visible level.
  Overview = 1 block per top-level directory — independent of repository size.
  Clicking a block (`drillIn`) flies the camera in and opens the block as its
  own district. Breadcrumbs + minimap provide orientation; the minimap shows the
  real camera position.
- **Build film:** `buildPhase` (empty → constructing → built). After loading,
  blocks and buildings rise out of the ground staggered in time (roads first),
  driven by `buildStartedAt` + per-item delays; `BuildStatus` shows the
  progress, after which the City Dossier (size, languages, findings, most
  risky file) appears and the import arcs connect.
- **Security Tour:** risk-weighted fly-through of all findings
  (`tourStops`); InfoPanel explains type, line, and a fix suggestion.
- **Honesty:** the HUD shows "rendered/total files"; findings are labeled as a
  heuristic regex scan (SARIF import as an extension point — the CityData
  findings format is kept scanner-agnostic).
- **Share:** every analyzed city has a permalink `?city=<id>` (in-memory
  store, lives until the backend restarts) and PNG export.
