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

No folder handy? Click **explore a demo city first** to see the full experience with sample data.

That's the entire primary path. Everything below is configuration, tooling, and deployment.

## Prerequisites

| Requirement             | Version    | Notes                                                         |
| ----------------------- | ---------- | ------------------------------------------------------------- |
| Node.js                 | ≥ 20.0.0   | LTS recommended                                               |
| npm                     | ≥ 10.0.0   |                                                               |
| Git                     | any recent |                                                               |
| Docker + Docker Compose | optional   | only for container deployment (see [Deployment](#deployment)) |

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

That answers the update check offline, keeps the OSV and dependency checks from running, and keeps Semgrep off unless you selected a rule pack that is already on disk. The city then reports what it could not check through `scanProvenance` and paints those buildings the colour of ground no scanner looked at. It is an environment variable; there is no switch for it in the interface yet.

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

### Local with Docker Compose

```bash
docker compose up --build
# Backend:  http://localhost:4000
# Frontend: http://localhost:3010
```

Build single containers:

```bash
docker build -f docker/Dockerfile.backend  -t ephemora-skyline-backend .
docker build -f docker/Dockerfile.frontend -t ephemora-skyline-frontend .
```

### Render

1. Open the [Render dashboard](https://dashboard.render.com/) → **New +** → **Public Git Repository**.
2. Select your `Ephemora-Skyline` repository.
3. Set environment variables:
   - `HOST` — the backend binds `127.0.0.1` by default; a deployed backend has to bind the interface its platform routes to, and the local-only guard on the code-running routes is what still refuses a foreign page's write
   - `PORT` — the platform's assigned port (default `4000`)
   - `VITE_API_URL` → your backend URL (e.g. `https://ephemora-skyline-backend.onrender.com`)
4. `render.yaml` is detected automatically and creates:
   - `ephemora-skyline-backend` (Node.js web service)
   - `ephemora-skyline-frontend` (static site with API forwarding)
