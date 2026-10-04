# Ephemora Skyline

**Your local codebase, rendered as a living 3D city at dusk.** Pick any folder and watch it rise: folders become districts, files become buildings, taller buildings hold more tangled code, and red beacons mark security findings. Your code never leaves your machine.

![Ephemora Skyline landing — scan profiles and the Choose-project-folder call to action](docs/assets/hero.png)

<p align="left">
  <img alt="Node >=20" src="https://img.shields.io/badge/node-%3E%3D20-339933?style=flat&logo=nodedotjs&logocolor=white">
  <img alt="TypeScript 5.8" src="https://img.shields.io/badge/typescript-5.8-3178c2?style=flat&logo=typescript&logocolor=white">
  <img alt="React 19" src="https://img.shields.io/badge/react-19-61dafb?style=flat&logo=react&logocolor=000">
  <img alt="three.js r186" src="https://img.shields.io/badge/three.js-r186-000000?style=flat">
  <img alt="License BSL-1.1" src="https://img.shields.io/badge/license-BSL--1.1-informational?style=flat">
</p>

> A CI badge is deliberately **absent** until a green run exists on `main`. A badge that does not reflect enforced CI is decoration, not a signal. The four gates below are exactly what CI runs; run them locally first.

## Why it is different

Most security tooling is a terminal of findings you scroll. Ephemora Skyline makes a codebase **spatially legible**, so "where is the risk?" is answered by sight before you read a line. Clarity is the first security control.

- **Empty world, then it builds.** Every visit starts on an empty dusk landscape. Pick a folder and the city assembles itself — roads, districts, buildings — like a film.
- **Scale-independent semantic zoom.** The overview shows one block per top-level folder, whether the repo has 100 or 50,000 files. Click in to open a block as its own district; unrendered files show honestly as a podium ("+N more files"), never silently dropped.
- **Security Tour.** The camera flies finding to finding, weighted by risk, with an explanation and a fix suggestion. From finding to action.
- **Orientation, always.** Breadcrumbs, a minimap with the real camera position, a landmark tower for the most dangerous file, and search-to-fly.
- **Shareable.** Every city has a permalink (`?city=<id>`) and a PNG export.

## Privacy model

Local analysis reads file contents in-process on your own machine through the `localhost` backend. **Your source code is never uploaded and never sent to a third party.** What does leave the machine are lookups made by the scanners themselves, and they carry no source:

| Host                 | Made by                | Leaves the machine                                          | When                                                 |
| -------------------- | ---------------------- | ----------------------------------------------------------- | ---------------------------------------------------- |
| `api.github.com`     | the app (update check) | one anonymous request for the newest release tag            | once an hour, if the app checks for an update        |
| `semgrep.dev`        | `semgrep`              | the name of the rule pack it downloads (`p/security-audit`) | a Semgrep scan with no local rule pack selected      |
| `api.osv.dev`        | `osv-scanner`          | package names and versions read out of your lockfiles       | a scan with the dependency engine switched on        |
| `registry.npmjs.org` | `npm audit`            | the same dependency names, via npm's own advisory path      | dependency engine on, but no `osv-scanner` installed |

Measured, not assumed: a scan of a 11-file fixture on the `standard` profile produced 8 connection attempts to `semgrep.dev`; a scan of this repository produced 25 to `api.osv.dev` plus the same 8. Nothing else reached out. The harness is `.qoder-scratch/net-probe.mts` — a logging proxy in front of the real scanner; the same command works for any folder.

**None of this is required.** `SKYLINE_OFFLINE=1` closes every path above: the update check answers offline, the OSV and `npm audit` engines do not run, and Semgrep runs only against a rule pack that is already on your disk. The city then reports them through `scanProvenance` and paints the buildings the colour of ground no scanner looked at, instead of pretending they came back clean. Git runs through `execFile` with an argument array (never a shell string), so file names cannot inject commands. Local analysis is bounded at **3000 files / 40 MB** and skips `node_modules`, `.git`, and build dirs. The remote path (`POST /api/analyze`, public-repo clone via the GitHub API) is an explicit, separate action. See [SECURITY.md](./SECURITY.md) for the reporting process.

**Telemetry: none.** Ephemora Skyline ships no analytics and no beacon of its own — the only request it makes is the anonymous release check in the table above, and `SKYLINE_OFFLINE=1` switches that off too. Maintainers measure adoption through [GitHub's built-in traffic & clone statistics](https://docs.github.com/en/rest/metrics/traffic) (`GH_TOKEN=... node scripts/clone-stats.mjs`) — which count clones without ever identifying a user.

**What the saved city carries.** A finding stores the line it was found on plus a two-line code frame, and the whole result is written to a JSON file you can export and share. So the value of any credential-shaped assignment (`NAME = "…"`, `"NAME": "…"`) is erased to `‹hidden›` before the finding is kept — the name stays, because the name is what tells you where to fix it. Masking is not limited to secret findings: it runs on every frame, because a `console.log` one line above a password carries that password in its neighbour lines. `.env`, `.env.production` and friends are in the scan surface **because** of that masking, and are read as data — no complexity, no code shape questions.

### Rule packs

The deep AST scan needs rules, and where those rules come from is a decision with a licence attached to it. The Semgrep registry is the obvious source and the measured answer is that we may not ship it: the Semgrep Rules License v1.0 states "This license does not allow you to distribute the rules, or to make them available to others as a service." So the registry stays what it always was — fetched by `semgrep` itself, by you, at scan time — and what ships in this repository is rules we wrote and own.

| Pack                     | Where it lives                         | Rules | Licence                                              |
| ------------------------ | -------------------------------------- | ----- | ---------------------------------------------------- |
| `ephemora-core`          | `backend/rules/ephemora-core/`         | 12    | BSL-1.1, same as the program — ours to ship and grow |
| _(nothing selected)_     | `semgrep.dev`, during the scan         | 225   | Semgrep Rules License v1.0 — not redistributable     |
| your own, if you add one | `~/.ephemora-skyline/rule-packs/<id>/` | any   | yours                                                |

A pack is a directory with a `pack.json` manifest and rule YAML next to it. The manifest's `ruleCount` is checked against the files at load time and a pack whose manifest lies is not offered at all. The scan selects packs **by id**; a path is rejected, because a client-supplied directory would be a directory the scanner reads rules from anywhere on the machine. Selecting a pack is also what makes a deep scan possible with the network switched off — `SKYLINE_OFFLINE=1` keeps Semgrep on then, and off when the rules would still have to be fetched.

## Quick start

Requires **Node >= 20** and **npm >= 10**.

```bash
git clone https://github.com/MichaelS1011/Ephemora-Skyline.git
cd Ephemora-Skyline
npm install            # ~492 packages
npm run dev            # backend :4000 + frontend :3010, in parallel
```

Open **http://localhost:3010** and click **Choose project folder** — or **explore a demo city first** for the full experience with no folder. Optional, for higher rate limits on the remote path:

```bash
export GITHUB_TOKEN=your_token
```

### The four gates (what CI enforces)

```bash
npm run lint           # ESLint, zero warnings
npm run type-check     # tsc --noEmit, both packages
npm run test           # Vitest — 120 tests (36 frontend + 84 backend)
npm run build          # production build, both packages
```

A fifth check runs in CI: `npm audit --audit-level high` must report no high-severity advisories.

## Tech stack

| Layer    | Technology                                                                            |
| -------- | ------------------------------------------------------------------------------------- |
| Backend  | Express 4, TypeScript (ESM), pino logging                                             |
| Git      | system `git` via `execFile` — argument array, never a shell string                    |
| Security | regex heuristics + `gitleaks` (secrets) + `semgrep` (AST) + `npm audit` (deps)        |
| Frontend | Vite 8, React 19, three.js r186 (`@react-three/fiber` 9), Zustand 5, Tailwind CSS 3.4 |
| Build    | Turborepo (monorepo), TypeScript 5.8, ESLint 9, Prettier                              |
| Testing  | Vitest                                                                                |
| Dev      | Husky, lint-staged                                                                    |

## Architecture

Full detail in [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md); first-run walkthrough in [`docs/GETTING_STARTED.md`](./docs/GETTING_STARTED.md).

```
Ephemora-Skyline/
├── backend/                 # Express API server (:4000)
│   └── src/
│       ├── server/routes/   # health, analyze, demo handlers
│       ├── services/
│       │   ├── analyzer/    # pipeline: parse -> scan -> aggregate (orchestrator.ts)
│       │   ├── github/      # clone-manager (execFile git) + API client
│       │   └── security/    # scanner facade + adapters (regex / gitleaks / semgrep / dep)
│       ├── models/          # CityData, Finding, FileNode
│       └── utils/           # cityMapper (city layout) + SARIF export
├── frontend/                # React + three.js visualization (:3010 via Vite)
│   └── src/
│       ├── city/            # layout, types, geometry
│       ├── components/      # 3D scene + UI (InfoPanel, Minimap, SearchBar, ...)
│       ├── renderer/        # three.js render loop
│       ├── hooks/           # useLocalAnalysis, useTestRunner, useLod...
│       ├── stores/          # Zustand
│       └── design/          # design tokens
├── docs/                    # ARCHITECTURE, GETTING_STARTED, assets/
└── .github/                 # CI, issue/PR templates, dependabot
```

## API (`:4000`)

| Method / path               | Purpose                                        |
| --------------------------- | ---------------------------------------------- |
| `GET  /api/health`          | liveness check                                 |
| `GET  /api/demo`            | seeded demo city (`demo-001`)                  |
| `POST /api/analyze-local`   | analyze a locally-picked folder (primary path) |
| `GET  /api/status/:id`      | analyze progress (0..1, phase)                 |
| `GET  /api/result/:id/city` | completed city data for the renderer           |
| `POST /api/analyze`         | clone a public repo (explicit alternative)     |

## Contributing

The four gates, commit conventions, and PR checklist live in **[CONTRIBUTING.md](./CONTRIBUTING.md)**. Small, reviewable changes land fastest. The `Ephemora Skyline` name and the BSL-1.1 license are non-negotiable; UI strings are English; 3D/render-critical changes need a real-GPU screenshot (headless CI cannot render WebGL).

## License

**Business Source License 1.1 (BSL-1.1)** — see [LICENSE](./LICENSE). Source-available, **not** OSI open-source.

- **Allowed:** read, modify, run, and share the code for personal, educational, internal-business, and all non-production purposes (development, testing, evaluation, research).
- **Not allowed** (without a separate commercial license): offering the software or derivatives to third parties as a hosted/managed service (SaaS).
- **Automatic conversion:** on the Change Date (**2030-09-29**) the license converts to **Apache License 2.0**.

Copies must retain this license, the "Ephemora Skyline" branding, and all copyright notices. Commercial licenses (hosted-service rights, white-labeling, enterprise redistribution) are available via Ephemora.
