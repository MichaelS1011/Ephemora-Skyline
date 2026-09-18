# CodeCity CyberDefense

Eine interaktive 3D-City-Visualisierung von GitHub-Repositories als lebendige Stadt in der Dämmerung.

**Paste a GitHub repository and watch it rise as a living city** — districts are folders,
buildings are files, glowing arcs are imports, and red beacons are security findings.

- **Leere Welt als Start:** Jeder Besuch beginnt auf einer leeren Dämmerungs-Landschaft. Ein Repo-Link — und die Stadt baut sich Stück für Stück auf (Straßen → Viertel → Gebäude), wie ein Film.
- **Skalenunabhängig durch semantischen Zoom:** Die Übersicht zeigt immer einen Block pro Top-Level-Ordner — ob das Repo 100 oder 50.000 Dateien hat. Reinklicken öffnet den Block als eigenes Viertel; nicht gerenderte Dateien erscheinen ehrlich als Podium („+N more files").
- **Security Tour:** Die Kamera fliegt von Finding zu Finding (risikogewichtet) — mit Erklärung und Fix-Vorschlag. From finding to action.
- **Orientierung:** Brotkrumen, Minimap mit echter Kameraposition, Landmark-Turm für die gefährlichste Datei, Search-to-Fly.
- **Teilen:** Jede Stadt hat einen Permalink (`?city=<id>`) plus PNG-Export.

![CodeCity CyberDefense](https://img.shields.io/badge/status-beta-orange)
![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)
![TypeScript](https://img.shields.io/badge/typescript-5.8-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## 🏗️ Tech Stack

| Layer | Technologie |
|-------|-------------|
| **Backend** | Express, TypeScript (ESM), pino Logging, WebSocket (ws) |
| **Git** | isomorphic-git (Repos clonen & parsen) |
| **Frontend** | Vite, React 18, Three.js (@react-three/fiber), Zustand, Tailwind CSS |
| **Build** | Turborepo (Monorepo), TypeScript, ESLint, Prettier |
| **Testing** | Vitest |
| **Dev Tools** | Husky, lint-staged |

## 🚀 Quick Start

### Voraussetzungen

- Node.js >= 20.0.0
- npm >= 10.0.0

### Installation

```bash
# Repository clonen
git clone https://github.com/username/codecity-cyberdefense.git
cd codecity-cyberdefense

# Dependencies installieren
npm install

# Optional: GitHub Token setzen (empfohlen für höhere Rate Limits)
export GITHUB_TOKEN=your_github_token_here
```

### Entwicklungsumgebung starten

```bash
# Startet Backend (Port 4000) + Frontend (Vite Dev Server) parallel
npm run dev
```

- Backend: http://localhost:4000
- Frontend: http://localhost:3010

## 📦 Build

```bash
# Vollständiger Build (beide Packages)
npm run build

# Einzeln
cd backend && npm run build   # → dist/
cd frontend && npm run build  # → dist/
```

## 🌍 Deployment

### Render (Backend)

```yaml
# render.yaml
services:
  - type: web
    name: codecity-backend
    env: node
    buildCommand: npm ci && npm run build
    startCommand: npm start
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 10000
```

### Vercel (Frontend)

```json
// vercel.json
{
  "buildCommand": "npm run build",
  "outputDirectory": "frontend/dist",
  "rewrites": [
    { "source": "/api/(.*)", "destination": "https://codecity-backend.onrender.com/api/$1" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

### Docker (Lokal)

```bash
# Backend + Frontend mit docker-compose starten
docker compose -f docker/docker-compose.yml up --build
```

- Frontend: http://localhost:3000
- Backend: http://localhost:4000

## 📜 Scripts-Übersicht

### Root (Monorepo)

| Script | Beschreibung |
|--------|-------------|
| `npm run dev` | Backend + Frontend parallel starten (Turborepo) |
| `npm run build` | Vollständiger Build (beide Packages) |
| `npm run lint` | ESLint über alle Packages |
| `npm run type-check` | TypeScript Check über alle Packages |
| `npm run test` | Vitest Tests über alle Packages |
| `npm run format` | Prettier Formatierung (alle Files) |
| `npm run format:check` | Prettier Check |
| `npm run clean` | Alle dist/, .turbo/, node_modules löschen |

### Backend

| Script | Beschreibung |
|--------|-------------|
| `npm run dev` | Hot-reload mit tsx watch |
| `npm run build` | TypeScript Compilation (tsc -b) |
| `npm start` | Production Start (node dist/server/index.js) |
| `npm run test` | Unit Tests (vitest run) |
| `npm run test:watch` | Test Watch Mode |
| `npm run lint` | ESLint Check |
| `npm run type-check` | TypeScript Check |

### Frontend

| Script | Beschreibung |
|--------|-------------|
| `npm run dev` | Vite Dev Server mit HMR |
| `npm run build` | TypeScript + Vite Build |
| `npm run test` | Vitest Tests |
| `npm run lint` | ESLint Check |
| `npm run type-check` | TypeScript Check |

## 🔌 API Endpoints

### Health Check

```
GET /api/health
```

**Response:**
```json
{ "status": "ok", "timestamp": "2025-01-01T00:00:00.000Z" }
```

### Repository Analysieren

```
POST /api/analyze
Content-Type: application/json

{
  "url": "https://github.com/username/repo",
  "branch": "main"
}
```

**Response (Streaming via WebSocket):**
- Fortschritts-Updates per WS (`ws://localhost:4000/ws`)
- Endergebnis im Analysis-Format

### Analyse-Ergebnis abrufen

```
GET /api/result/:sessionId
```

**Response:**
```json
{
  "sessionId": "...",
  "status": "completed",
  "data": { /* City-Daten */ }
}
```

### Analyse-Status prüfen

```
GET /api/status/:sessionId
```

**Response:**
```json
{
  "sessionId": "...",
  "status": "analyzing", // | "completed" | "error"
  "progress": 0.75
}
```

### Demo-Repository

```
GET /api/demo
```

**Response:** Lädt ein Demo-Repository zur Visualisierung.

## 🏛️ Architektur

```
codecity-cyberdefense/
├── backend/                  # Express API Server
│   └── src/
│       ├── server/           # HTTP Server & Routes
│       │   ├── index.ts      # Server Entry Point
│       │   └── routes/       # API Route Handlers
│       │       ├── health.ts # Health Check Endpoint
│       │       ├── analyze.ts# Repository Analysis
│       │       └── demo.ts   # Demo Repository
│       ├── services/         # Core Services
│       │   ├── analyzer/     # Code Analyse
│       │   │   └── orchestrator.ts
│       │   ├── github/       # GitHub Client
│       │   ├── security/     # Security Scanner
│       │   └── streaming/    # WS Progress Streaming
│       ├── models/           # Data Models & Types
│       ├── parser/           # Git File Parser
│       ├── scanner/          # File Scanner
│       ├── ai/               # AI Components (optional)
│       └── utils/            # Utilities
├── frontend/                 # React 3D Visualisierung
│   └── src/
│       ├── components/       # 3D & UI Components
│       │   ├── CityScene.tsx  # Haupt-Szene
│       │   ├── Building.tsx   # Einzelne Gebäude
│       │   ├── RoadSystem.tsx # Straßennetz
│       │   ├── ParticleField.tsx # Partikeleffekte
│       │   ├── InfoPanel.tsx  # Informations-Panel
│       │   ├── Minimap.tsx    # Mini-Map
│       │   └── SearchBar.tsx  # Suche
│       ├── renderer/         # 3D Renderer
│       ├── stores/           # Zustand Stores
│       ├── hooks/            # Custom Hooks
│       └── design/           # Design Tokens
├── docker/                   # Docker Configuration
├── render.yaml               # Render Deploy Config
├── vercel.json               # Vercel Deploy Config
└── package.json              # Root + Turborepo Config
```

## 🔧 Entwicklung

### Code Style

```bash
# Alle Files formatieren
npm run format

# Formatierung prüfen
npm run format:check

# ESLint Fix
# Läuft automatisch via lint-staged vor Commits
```

### Testing

```bash
# Tests ausführen
npm run test

# Watch Mode
npm run test:watch
```

## 📝 Lizenz

MIT
