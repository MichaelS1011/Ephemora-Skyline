# Getting Started — Ephemora Skyline

Ephemora Skyline renders a local folder as an interactive 3D city: folders become districts, files become buildings, building height reflects complexity, and red beacons mark security risks. Everything runs on your machine — **your code is never uploaded**. Some scanners fetch their own rule and advisory data over the network ([the full list](../README.md#privacy-model)); `SKYLINE_OFFLINE=1` stops all of it and the city shows which checks then went missing.

## In 30 seconds — your first city

```bash
git clone https://github.com/MichaelS1011/Ephemora-Skyline.git
cd Ephemora-Skyline
npm install
npm run dev
```

Open **http://localhost:3010** and click **Choose project folder** to pick any folder on your machine. Ephemora Skyline scans it locally (code quality, secrets, CVEs) and builds the city. No account, no token, no upload.

A folder is read up to **10,000 files, 150 MB in total, 2 MB per file**. Whatever does not join the scan is counted on screen by the reason it left — including the paths your own `.gitignore` sets aside, which the browser skips before it counts anything, so a checkout with large local tooling folders still reads as the project inside it.

No folder handy? Click **explore a demo city first** to see the full experience with sample data.

That's the entire primary path. Everything below is configuration, tooling, and deployment.

## Prerequisites

| Requirement             | Version          | Notes                                                         |
| ----------------------- | ---------------- | ------------------------------------------------------------- |
| Node.js                 | 20.19+ or 22.12+ | Node 21 unsupported; LTS recommended                          |
| npm                     | ≥ 10.0.0         |                                                               |
| Git                     | any recent       |                                                               |
| Docker + Docker Compose | optional         | only for container deployment (see [Deployment](#deployment)) |

Check your versions with `node --version` and `npm --version`.

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/MichaelS1011/Ephemora-Skyline.git
cd Ephemora-Skyline
```

> Note: the internal package name in `package.json` is `codecity-cyberdefense` (owner-locked and cannot be changed). The product is **Ephemora Skyline** everywhere users see it.

### 2. Install dependencies

```bash
npm install
```

This installs all workspaces (root, frontend, backend) via npm workspaces. For a deterministic install from the lockfile (e.g. in CI), use `npm ci` instead.

### 3. Start developing

```bash
npm run dev
```

Turborepo starts both workspaces in parallel:

- **Frontend** (Vite) → `http://localhost:3010`
- **Backend** (Express + tsx watch) → `http://localhost:4000`

Verify the backend responds:

```bash
curl http://localhost:4000/api/health
```

## Configuration

### No token, no account

Ephemora Skyline needs no credentials to run a scan. You pick a folder, the browser reads it, and the local backend analyses it. There is no remote-repository path — nothing to authorise, nothing to upload.

The one place a GitHub token is used at all is the maintainer script that reads clone statistics (`GH_TOKEN=*** node scripts/clone-stats.mjs`). It never affects a scan.

### Switching the network off

```bash
SKYLINE_OFFLINE=1 npm run dev
```

That answers the update check offline, keeps the OSV and dependency checks from running, and keeps Semgrep off unless you selected a rule pack that is already on disk. The update check needs to be asked for in the first place: it runs only while **Ask about new versions** is switched on in the More menu of a city, and that switch is off by default, so a first run reaches neither `api.github.com` nor any other host before you click. The city then reports what it could not check through `scanProvenance` and paints those buildings the colour of ground no scanner looked at. It is an environment variable; there is no switch for it in the interface yet.

|                      | Local folder path (the only path)                                               |
| -------------------- | ------------------------------------------------------------------------------- |
| How                  | **Choose project folder** in the UI                                             |
| Token required       | No                                                                              |
| Where your code goes | Stays on your machine; the backend stages a private copy in your temp directory |

### Security scanners (optional, recommended)

Without these binaries the scanner does not fail — it reports the affected checks as skipped, and `scanProvenance` in every result says honestly which engines actually ran. Install what you want with Homebrew:

```bash
brew install gitleaks semgrep osv-scanner ruff   # macOS — optional, improves scan quality
```

| Scanner           | Task                                                                                                               | Without the binary                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| Regex (always on) | Heuristics: injection, XSS, eval, unsafe storage, …                                                                | —                                                        |
| **gitleaks**      | Secrets in the working tree (and in Git history on the deep profile)                                               | entropy-regex fallback, marked as such                   |
| **semgrep**       | AST scan — registry ruleset (`p/security-audit`) or a local [rule pack](../README.md#rule-packs), binary or Docker | skipped                                                  |
| **osv-scanner**   | CVEs for every lockfile format it understands                                                                      | falls back to `pip-audit` for Python, `npm audit` for JS |
| **npm audit**     | CVEs in npm dependencies (requires `package-lock.json`)                                                            | skipped                                                  |
| **ruff**          | Python lint, contributing to the hygiene category                                                                  | skipped                                                  |

## Development workflow

### Working on one workspace

```bash
# Backend only
cd backend && npm run dev

# Frontend only
cd frontend && npm run dev
```

Or run the backend in one terminal and the frontend in another.

### Code quality

```bash
npm run lint           # ESLint, all workspaces
npm run type-check     # TypeScript type check
npm run format         # Prettier
```

### Tests

```bash
npm run test                   # all workspaces (Vitest)
cd backend && npm run test     # backend only
cd frontend && npm run test    # frontend only
cd backend && npm run test:watch
```

## Building

```bash
npm run build                  # all workspaces
cd backend && npm run build    # backend only
cd frontend && npm run build   # frontend only
# Output: backend/dist/ + frontend/dist/
```

## Troubleshooting

### `npm install` / `npm ci` fails

```bash
rm -rf node_modules package-lock.json
npm cache clean --force
npm install
```

### Port already in use

```bash
lsof -i :3010   # Frontend — note the PID
lsof -i :4000   # Backend — note the PID
kill <PID>
```

On Linux without `lsof`, use `ss -tlnp | grep -E '3010|4000'` instead.

### TypeScript errors after cloning

```bash
npm run clean
npm install
npm run build
```

### Demo does not load

Make sure the backend is running:

```bash
curl http://localhost:4000/api/demo
# Should return JSON
```

### Frontend cannot reach the backend

Check the proxy target in `frontend/vite.config.ts`:

```ts
// Dev server proxy
server: {
  proxy: {
    '/api': 'http://localhost:4000'
  }
}
```

## Deployment

### Local containers

The compose file lives in `docker/`, so name it:

```bash
docker compose -f docker/docker-compose.yml up --build
# Backend:  http://localhost:4000
# Frontend: http://localhost:3010
```

Same two processes, same machine. Both published ports bind to `127.0.0.1`. Inside the private Docker network, the backend uses `HOST=0.0.0.0` so nginx can reach it. `TRUST_PROXY=1` is set there only because nginx sits in front of the API.

`4000` and `3010` are also the ports `npm run dev` uses, so a stack started while a dev run is up fails with Docker's `ports are not available` message. Name your own ports and both the mapping and the origin the backend admits follow them:

```bash
BACKEND_HOST_PORT=4210 FRONTEND_HOST_PORT=3310 docker compose -f docker/docker-compose.yml up --build
# Frontend: http://localhost:3310   (nginx forwards /api to the backend)
```

**What the containers do not carry:** the images install production dependencies only, so `gitleaks`, `semgrep`, `osv-scanner` and `ruff` are not in them. A folder scanned through the container is therefore checked by the built-in rules and the advisory tables, and the city states which engines did not run — measured on the sample folder, 2 of its 4 findings arrive that way, and `scanProvenance` answers `gitleaks: false, semgrep: false, ruff: false`. The scan itself, the proxy and the in-city test runner work: the staged project's own `vitest` suite ran inside the container and reported 2 of 2 passed.

Build single containers:

```bash
docker build -f docker/Dockerfile.backend  -t ephemora-skyline-backend .
docker build -f docker/Dockerfile.frontend -t ephemora-skyline-frontend .
```

### There is no hosted version

The repository carries no platform manifest on purpose. Until 5 October 2026 it held a
`render.yaml` and a `vercel.json` that pointed `/api/*` at a public URL — an unauthenticated
endpoint that accepts `POST /api/analyze-local` (up to 200 MB of someone's source) and can run the
test suite of whatever folder it is handed. That contradicts the one claim the entry screen leads
with, so both files are gone and no documentation section replaces them.

Deploying it on a network you do not own is still possible and is now your decision alone: set
`HOST` to the interface your platform routes to, and read the warning the server logs itself when
it binds a non-loopback address (the `listening on a non-loopback address` warning in `backend/src/server/index.ts`). The local-only guard
refuses another _website's_ write; it does not refuse another machine.
