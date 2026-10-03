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

### GitHub token — remote path only (optional)

The local folder path — the primary way to use Ephemora Skyline — **works fully without any token**. Nothing is configured, nothing is uploaded.

The `GITHUB_TOKEN` (a GitHub Personal Access Token) applies **only** to the separate remote path (`POST /api/analyze`, which clones a public repository via the GitHub API) and is used **only to raise API rate limits**:

```bash
# Optional — remote public-repo path only
echo 'GITHUB_TOKEN=ghp_...' >> .env
```

|                      | Local folder path (primary)         | Remote public-repo path                  |
| -------------------- | ----------------------------------- | ---------------------------------------- |
| How                  | **Choose project folder** in the UI | `POST /api/analyze`                      |
| Token required       | No                                  | No (recommended for higher rate limits)  |
| Where your code goes | Stays on your machine               | Only public repos are cloned from GitHub |

### Security scanners (optional, recommended)

Without external binaries the scanner degrades quietly to regex heuristics — scan quality is noticeably lower. The `scanProvenance` field in every result reports honestly which scanners actually ran. The wired adapters are **gitleaks**, **semgrep**, and **npm audit**; install them via Homebrew:

```bash
brew install gitleaks semgrep   # macOS (Homebrew) — optional, improves scan quality
```

| Scanner           | Task                                                     | Without the binary     |
| ----------------- | -------------------------------------------------------- | ---------------------- |
| Regex (always on) | Heuristics: injection, XSS, eval, …                      | —                      |
| **gitleaks**      | Secrets in the working tree (and optionally Git history) | entropy-regex fallback |
| **semgrep**       | AST scan (`p/security-audit` ruleset), binary or Docker  | skipped                |
| **npm audit**     | CVEs in dependencies (requires `package-lock.json`)      | skipped                |

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
   - `GITHUB_TOKEN` (GitHub PAT — optional, raises remote-path rate limits only)
   - `VITE_API_URL` → your backend URL (e.g. `https://ephemora-skyline-backend.onrender.com`)
4. `render.yaml` is detected automatically and creates:
   - `ephemora-skyline-backend` (Node.js web service)
   - `ephemora-skyline-frontend` (static site with API forwarding)
