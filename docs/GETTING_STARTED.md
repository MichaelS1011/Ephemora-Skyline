# Getting Started — Ephemora Skyline

Ephemora Skyline renders a local folder as an interactive 3D city: folders become districts, files become buildings, building height reflects complexity, and red beacons mark security risks. Everything runs on your machine — **your code is never uploaded**. Some scanners fetch their own rule and advisory data over the network ([the full list](../README.md#privacy-model)); `SKYLINE_OFFLINE=1` stops all of it and the city shows which checks then went missing.

## In 30 seconds — your first city

```bash
git clone https://github.com/MichaelS1011/Ephemora-Skyline.git
cd Ephemora-Skyline
npm install
npm start
```

Open **http://127.0.0.1:4173** and click **Choose project folder** to pick any folder on your machine. Ephemora Skyline scans it locally (code quality, secrets, CVEs) and builds the city. No account, no token, no upload. `npm start` builds once, starts the backend and serves the built app from the same address; `EPHEMORA_NO_OPEN=1` keeps the browser closed, and `PORT=` moves the address. For hot reload while developing, use `npm run dev` (Vite on :3010, API on :4000) — see [Start developing](#4-start-developing).

A folder is read up to **10,000 files, 150 MB in total, 2 MB per file**. A larger folder still opens: the city becomes a **preview sample of up to 2,000 files across its top-level districts**, and both numbers — what was read and what the folder holds — are printed on the announcement and in the header. Whatever does not join a full scan is counted on screen by the reason it left — including the paths your own `.gitignore` sets aside, which the browser skips before it counts anything, so a checkout with large local tooling folders still reads as the project inside it.

**Keep it live.** After a folder picked with the native picker builds its city, the app watches the folder by metadata (name, size, mtime) and folds saves into the same city in place. Only changed and new files are re-read, and only by the **built-in rules**; semgrep, gitleaks, the dependency audit, churn, duplicates and coverage keep their answers from the full scan. The band under the header says `Live — built-in rules only; external engines from the last full scan` and names the delta (`1 changed · 0 added · 1 removed`). **Full scan** in that band re-reads the whole folder through every engine and starts watching the new result. A file that changes without its size or mtime moving is the blind spot of a metadata watch; run the full scan after such a change.

**Work the open decisions, do not hunt for them.** Once the city stands, the findings are a queue: the dock steps through them, and while you are looking somewhere else a small pill appears at that screen edge with a word and a distance - the next finding that still has no verdict. Press it and the camera flies to the exact line. Nothing is asked of you to enable this, and nothing is announced when there is nothing left open. Triage decisions live in your browser and are mirrored to `~/.ephemora-skyline/verdicts.json` so they survive a reload, a restart and a re-scan. When one of those files cannot be read, the app says so in words instead of showing an empty list - and it will not delete or overwrite bytes it could not read.

No folder handy? Click **Explore demo** to see the full experience with sample data.

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

Two facts the install itself does not say: the repo ships an `.npmrc` with `legacy-peer-deps=true`, so every `npm install` and `npm ci` here resolves peer dependencies in npm 6's relaxed mode — nothing in the command output hints that this file is the reason. And the advisory picture moves: up to 21 October `npm audit` on this lockfile printed `7 vulnerabilities (2 moderate, 5 high)` while the gate stayed green, because all five high findings traced to one advisory the gate accepts by name (`GHSA-vfj7-8cjw-p6xm`, braces, then with no fixed release upstream) reached through five build-time package paths — braces, chokidar, fast-glob, micromatch, tailwindcss. Measured 2026-10-26, after the dependency update, the same command prints `0 vulnerabilities` and the gate passes on the fix. `node scripts/audit-gate.mjs` prints that arithmetic whenever a finding fires, names any accepted exception that no finding still carries, retries a broken audit call instead of reading it as a clean sheet, and fails on anything else.

### 3. Start

```bash
npm start
```

One build, one address: the backend serves the built frontend and the API on
**http://127.0.0.1:4173**, then the browser opens. `PORT=4200 npm start` moves
the address; `EPHEMORA_NO_OPEN=1` leaves the browser closed for a headless run.
This is the same launcher the package uses, so a checkout and a package run the
same code.

Verify the backend responds:

```bash
curl http://127.0.0.1:4173/api/health
```

### 4. Start developing

```bash
npm run dev
```

Turborepo starts both workspaces in parallel, with Vite's hot reload:

- **Frontend** (Vite) → `http://localhost:3010`
- **Backend** (Express + tsx watch) → `http://localhost:4000`

`npm run dev` is the contributor path; `npm start` is the user path. A dev run
and a packaged run can stand side by side, because they use different ports
(:3010/:4000 vs :4173) — but only one of them should own the backend port at a
time.

### 5. Run from a package (release path)

The publishable package is assembled from `package.publish.json`; it carries
the launcher, both built workspaces, the licences and the README, and nothing
else. `npm run pack:check` builds, packs, installs the tarball into an empty
folder, starts the installed `ephemora-skyline` bin, asks `/api/health` and
`/` and prints the exact counts and sizes on every run; on 2026-10-20 the run
ended **health ok, app served, version 0.1.0 matches the package**.

```bash
npm run package:build   # writes dist-package/
npm run pack:check      # installs and boots it, prints exact counts and sizes
```

The registry listing is the release step:

```bash
npm publish dist-package
```

Once it is on npm, the same launcher is

```bash
npx ephemora-skyline
npx ephemora-skyline --port 4200 --no-open   # another address, no browser
```

Until then, `npm start` is the one-command path from this checkout.

## Configuration

### No token, no account

Ephemora Skyline needs no credentials to run a scan. You pick a folder, the browser reads it, and the local backend analyses it. There is no remote-repository path — nothing to authorise, nothing to upload.

The one place a GitHub token is used at all is the maintainer script that reads clone statistics (`GH_TOKEN=*** node scripts/clone-stats.mjs`). It never affects a scan.

### Switching the network off

```bash
SKYLINE_OFFLINE=1 npm start
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

| Scanner           | Task                                                                                                     | Without the binary                                       |
| ----------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Regex (always on) | Heuristics: injection, XSS, eval, unsafe storage, …                                                      | —                                                        |
| **gitleaks**      | Secrets in the working tree (and in Git history on the deep profile)                                     | entropy-regex fallback, marked as such                   |
| **semgrep**       | AST scan — registry ruleset (`p/security-audit`) or a local [rule pack](./SCANNERS.md), binary or Docker | skipped                                                  |
| **osv-scanner**   | CVEs for every lockfile format it understands                                                            | falls back to `pip-audit` for Python, `npm audit` for JS |
| **npm audit**     | CVEs in npm dependencies (requires `package-lock.json`)                                                  | skipped                                                  |
| **ruff**          | Python lint, contributing to the hygiene category                                                        | skipped                                                  |

### A local model for one line (optional)

Every explanation the cards show is written by this program. The one thing it cannot write is a sentence about _this particular line_ — so a card can ask a model you run yourself.

```bash
export EPHEMORA_LLM_URL=http://127.0.0.1:8100/v1     # llama.cpp, Ollama, LM Studio, vLLM
export EPHEMORA_LLM_MODEL=Qwen3.5-9B                  # what the card signs its answer with
npm start
```

Then open a finding's details and press **Ask … on this machine**. What the model receives is the flagged line (masked, clipped to 500 characters) and the rule facts already printed on the card: no file, no surrounding lines, no path. `EPHEMORA_LLM_URL` must be `127.0.0.1`, `localhost` or `::1` — a hosted address is refused when the server starts, and the card offers nothing rather than a click that fails. `EPHEMORA_LLM_TIMEOUT_MS` raises the 45-second wait for a cold or large model.

Measured on 2026-10-18 against a 9B model on a GB10 (vLLM, 2 048-token context): a question costs 920–1 090 bytes and answers in 2,3–3,4 s. `node scripts/local-llm-probe.mjs` re-runs that measurement through the same code the route calls, and `--live` runs it through the HTTP route with a real scan and a real fingerprint.

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

Since 2026-10-14 the frontend dev server runs with `strictPort`: if `:3010` is already taken it exits with `Port 3010 is already in use` instead of landing on `:3011+` while its proxy still talks to the first checkout's backend — free the port as above, or point a second checkout at its own pair with `BACKEND_PORT=…` and `--port` (plus `FRONTEND_ORIGIN=` on the backend).

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
// Dev server proxy — the target is 127.0.0.1 by address, not "localhost" by
// name (the resolver would answer ::1 first, and nothing listens there), and
// it follows BACKEND_PORT so a second checkout can point at its own backend.
server: {
  port: 3010,
  proxy: {
    "/api": {
      target: `http://127.0.0.1:${process.env.BACKEND_PORT ?? "4000"}`,
      changeOrigin: true,
    },
  },
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
