# Getting Started

## Voraussetzungen

- **Node.js ≥ 20.0.0** (LTS empfohlen)
- **npm ≥ 10.0.0**
- **Git**
- Optional: **Docker + Docker Compose** für Container-Deployment

## Installation

### 1. Repository klonen

```bash
git clone https://github.com/username/codecity-cyberdefense.git
cd codecity-cyberdefense
```

### 2. Dependencies installieren

```bash
npm ci
```

Dies installiert alle Dependencies für Root, Frontend und Backend (npm Workspaces).

### 3. Environment konfigurieren

```bash
# Optional: GitHub Token für API-Access
echo 'GITHUB_TOKEN=ghp_...' >> .env
```

Ein `GITHUB_TOKEN` (GitHub Personal Access Token) ermöglicht:

- Höhere Rate Limits für GitHub API-Requests
- Zugang zu privaten Repositories

Ohne Token wird nur der Demo-Modus (`/api/demo`) funktionieren.

### 3b. Security-Scanner (optional, aber empfohlen)

CodeCity degradiert ohne externe Scanner still auf Regex-Heuristics — die
Scan-Qualität ist dann deutlich geringer (`scanProvenance` im Ergebnis zeigt
ehrlich, welche Scanner gelaufen sind):

```bash
brew install gitleaks semgrep   # macOS (Homebrew)
```

| Scanner             | Aufgabe                                          | Ohne Binary             |
| ------------------- | ------------------------------------------------ | ----------------------- |
| Regex (immer aktiv) | Heuristics: Injection, XSS, eval, …              | —                       |
| **gitleaks**        | Secrets in Working-Tree & (optional) Git-History | Entropie-Regex-Fallback |
| **semgrep**         | AST-Scan (p/security-audit), Binary oder Docker  | übersprungen            |
| **npm audit**       | CVEs in Dependencies (nur mit package-lock.json) | übersprungen            |

### 4. Entwicklung starten

```bash
npm run dev
```

Turborepo startet beide Workspaces gleichzeitig:

- **Frontend** (Vite) → `http://localhost:3010`
- **Backend** (Express + tsx watch) → `http://localhost:4000`

### 5. Demo ausprobieren

```bash
# Demo-Daten laden
curl http://localhost:4000/api/demo

# Health Check
curl http://localhost:4000/api/health
```

Im Browser: Öffne `http://localhost:3010` und klicke auf **Demo** oder gib eine GitHub-URL ein.

## Development Workflow

### Einzeln arbeiten

```bash
# Nur Backend
cd backend && npm run dev

# Nur Frontend
cd frontend && npm run dev

# Backend in einem Terminal, Frontend in einem anderen
```

### Code-Qualität

```bash
# ESLint (alle Workspaces)
npm run lint

# TypeScript Type-Check
npm run type-check

# Prettier Formatierung prüfen
npm run format:check

# Prettier formatieren
npm run format
```

### Tests

```bash
# Backend Tests
cd backend && npm run test

# Frontend Tests
cd frontend && npm run test

# Tests im Watch-Modus
cd backend && npm run test:watch
```

## Building

```bash
# Alle Workspaces bauen
npm run build

# Nur Backend bauen
cd backend && npm run build

# Nur Frontend bauen
cd frontend && npm run build

# Ergebnis: backend/dist/ + frontend/dist/
```

## Docker Deployment

### Local mit Docker Compose

```bash
docker compose up --build
# Backend: http://localhost:4000
# Frontend: http://localhost:3010
```

### Einzelne Container bauen

```bash
# Nur Backend
docker build -f docker/Dockerfile.backend -t codecity-backend .

# Nur Frontend
docker build -f docker/Dockerfile.frontend -t codecity-frontend .
```

## Render Deployment

### 1. Repo verbinden

1. [Render Dashboard](https://dashboard.render.com/) öffnen
2. **New +** → **Public Git Repository**
3. `codecity-cyberdefense` Repository auswählen

### 2. Environment Variables setzen

- `GITHUB_TOKEN` (GitHub PAT)
- `VITE_API_URL` → Backend-URL (z.B. `https://codecity-backend.onrender.com`)

### 3. Auto-Deploy

`render.yaml` wird automatisch erkannt und erstellt:

- `codecity-backend` (Node.js Web-Service)
- `codecity-frontend` (Static Site mit API-Weiterleitung)

## Troubleshooting

### `npm ci` schlägt fehl

```bash
# Clean slate
rm -rf node_modules package-lock.json
npm cache clean --force
npm ci
```

### Port already in use

```bash
# Ports prüfen und killen
lsof -i :3010   # Frontend
lsof -i :4000   # Backend
kill <PID>
```

### TypeScript-Fehler nach Clone

```bash
# Alle Builds neu machen
npm run clean
npm ci
npm run build
```

### Demo funktioniert nicht

Stelle sicher, dass das Backend läuft:

```bash
curl http://localhost:4000/api/demo
# Sollte JSON zurückgeben
```

### Frontend kann Backend nicht erreichen

In `frontend/vite.config.ts` die Backend-URL prüfen:

```ts
// Server proxy für Dev
server: {
  proxy: {
    '/api': 'http://localhost:4000'
  }
}
```
