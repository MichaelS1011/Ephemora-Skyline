# Contributing to Ephemora Skyline

Thanks for your interest. Ephemora Skyline is a focused 3D visualizer — small, reviewable pull requests land far faster than big rewrites.

## Ground rules

- **Local-first, always.** Nothing here should send analyzed file content off the machine. A PR that introduces network egress for code that was analyzed from a local folder is a security bug, not a feature.
- **The name is yours to keep out of.** `Ephemora Skyline` is the project's name; Apache-2.0 licenses the code, not the mark.
- **UI strings need both languages.** Every interface string lives in `frontend/src/i18n.ts` with an English and a German entry; a key that exists in one language only falls back to printing its own name, which is a visible bug, not a missing translation.
- **3D / render-critical files** (`CityScene`, `Building`, `District`, `RoadSystem`, `ParticleField`, the `renderer/` folder) need a real-GPU screenshot in the PR before they are reviewed — the headless CI cannot render WebGL.

## Getting set up

```bash
git clone https://github.com/MichaelS1011/Ephemora-Skyline.git
cd Ephemora-Skyline
npm install                 # requires Node >= 20, npm >= 10
npm run dev                 # backend :4000 + frontend :3010
```

Optional, for the deeper scans: put `gitleaks`, `semgrep`, `osv-scanner` and `ruff` on your `PATH`. Without them the corresponding checks report themselves as skipped — they never pretend to have run.

## Before you open a PR — the four gates

These are exactly what CI enforces. Run them clean first:

```bash
npm run lint          # ESLint, zero warnings
npm run type-check    # tsc --noEmit across both packages
npm run test          # Vitest — 765 tests in 91 files (408 frontend, 357 backend)
npm run build         # production build, both packages
```

A fifth check runs in CI: `node scripts/audit-gate.mjs`. It fails on every high or critical advisory except those explicitly accepted in the script with a reason and a re-check date — an accepted finding stays visible instead of being hidden behind a lowered threshold.

## Commit & PR conventions

- One logical change per commit. Conventional-style subjects: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`.
- Keep the diff to the smallest thing that works. No drive-by reformatting (Prettier runs via Husky + lint-staged on commit, so formatting is already free).
- New behavior needs a test. Non-trivial logic without a test does not merge.
- Reference an issue when one exists (`Fixes #NNN`).

## What will and will not be merged

- Merged: bug fixes, accessibility, clarity, performance, tests, docs.
- Discuss first: new dependencies, new top-level components, changes to the scanner adapters, anything touching the analyze pipeline caps (3000 files / 40 MB).
- Not merged: telemetry, cloud analysis of local code, license or branding changes.

## License

By contributing, you agree your contributions are licensed under the project's Apache License 2.0 (see [LICENSE](./LICENSE)). No separate assignment, no CLA: the licence you contribute under is the licence the project ships.
