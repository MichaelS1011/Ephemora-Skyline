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
│   ├── index.ts             # Express app, rate limits, route wiring
│   ├── bind-address.ts      # loopback by default; HOST overrides deliberately
│   ├── local-only.ts        # refuses writes that a foreign web page sent
│   └── routes/
│       ├── local-analyze.ts # POST /api/analyze-local — staging + job start
│       ├── status.ts        # GET /api/status/:id (polled)
│       ├── job-progress.ts  # progress map, skeleton, failure marking
│       ├── source.ts        # GET /api/result/:id/source/:fileId
│       ├── tests.ts         # POST /api/tests/:id/run — the project's own tests
│       ├── update-check.ts  # GET /api/update/check (the one self-request)
│       ├── demo.ts          # GET /api/demo, /api/cities/default
│       └── health.ts        # GET /api/health
├── services/
│   ├── analyzer/
│   │   ├── orchestrator.ts  # the pipeline: enumerate → parse → scan → aggregate
│   │   ├── metrics.ts       # lines, complexity, sections, imports, env/data files
│   │   ├── git-churn.ts     # churn and author districts, from the staged history
│   │   ├── duplicates.ts    # clone detection, drawn as yellow lasers
│   │   ├── coverage.ts      # lcov reader, drawn as blue shields
│   │   └── gitignore.ts     # ignored paths stay out of the scan surface
│   └── security/
│       ├── scanner.ts       # facade: per-run config, filters, dedup, masking
│       ├── adapter.ts       # the adapter contract all engines implement
│       ├── adapters/        # regex, gitleaks, semgrep, dependency, osv, ruff
│       ├── categories.ts    # CWE clusters, selectable per scan
│       ├── scan-config.ts   # profiles, tool toggles, custom patterns, validation
│       ├── rule-packs.ts    # local rule bundles and their manifest check
│       ├── scan-depth.ts    # what a profile actually switches on
│       ├── dedup.ts         # one finding per file/line/type across engines
│       ├── redact.ts        # credential values erased before storage
│       ├── finding-knowledge.ts # explanation, CWE, reference link, category
│       ├── sarif-mapper.ts  # SARIF 2.1.0 from engine output
│       └── network-policy.ts# the SKYLINE_OFFLINE switch
├── models/index.ts          # GitHubRepo, FileAnalysis, SecurityIssue, AnalysisResult
└── utils/
    ├── cityMapper.ts        # analysis → city payload (districts, plots, LOD)
    └── sarif.ts             # SARIF envelope
```

### Analysis Pipeline

```
1. Staging        → the browser-posted files are written to an owner-only temp copy
2. Enumerate      → supported extensions, env files, manifests; caps and skips applied
3. Parse          → per file: lines, languages, complexity, sections, imports
4. Deep scan      → semgrep (local pack or registry), gitleaks, ruff, dependency audit
5. Aggregate      → AnalysisResult: summary, provenance, findings per file
6. Map            → cityMapper builds the city payload the renderer consumes
Progress events go to the job-progress map; the frontend polls GET /api/status/:id.
```

### API Design

- **Asynchronous**: `POST /api/analyze-local` stages the picked folder, answers `202 { id, statusUrl }` immediately, and runs the analysis in the background
- **Polling**: `GET /api/status/:id` for progress, `GET /api/result/:id/city` for the finished city — there is no socket, the frontend polls
- **One orchestrator per request**: the scanner holds the resolved config and per-run adapter state, so two analyses running at once cannot answer with each other's profile
- **In-memory results**: the last 20 cities for 24 hours. A `?city=<id>` link is a pointer into the running process, not an archive — PNG and SARIF export are the artefacts that outlive it

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
User picks a folder in the browser
  → the page reads the files client-side (File System Access API, input fallback)
  → Zustand: pickFolder() → POST /api/analyze-local { name, files, config }
  → Backend: 202 { id } and the pipeline starts on the staged copy
  → Zustand: polling /api/status/:id → progress and stage in the HUD
  → Zustand: fetch /api/result/:id/city → setCityData(), URL becomes ?city=<id>
  → React Three Fiber: the city builds, then the camera rises to the overview
  → InfoPanel / ContextCard: details on building click
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
