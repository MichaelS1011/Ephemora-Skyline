# Contributing to Ephemora Skyline

Thanks for your interest. Ephemora Skyline is a focused 3D visualizer — small, reviewable pull requests land far faster than big rewrites.

## Ground rules

- **Local-first, always.** Nothing here should send analyzed file content off the machine. A PR that introduces network egress for code that was analyzed from a local folder is a security bug, not a feature.
- **The name stays.** `Ephemora Skyline` and the BSL-1.1 license are non-negotiable.
- **UI strings are English.**
- **3D / render-critical files** (`CityScene`, `Building`, `District`, `RoadSystem`, `ParticleField`, the `renderer/` folder) need a real-GPU screenshot in the PR before they are reviewed — the headless CI cannot render WebGL.

## Getting set up

```bash
git clone https://github.com/MichaelS1011/Ephemora-Skyline.git
cd Ephemora-Skyline
npm install                 # requires Node >= 20, npm >= 10
npm run dev                 # backend :4000 + frontend :3010
```

Optional for higher GitHub rate limits when using the remote-repo path:

```bash
export GITHUB_TOKEN=your_token
```

## Before you open a PR — the four gates

These are exactly what CI enforces. Run them clean first:

```bash
npm run lint          # ESLint, zero warnings
npm run type-check    # tsc --noEmit across both packages
npm run test          # Vitest (120 tests: 36 frontend + 84 backend)
npm run build         # production build, both packages
```

A fifth check runs in CI: `npm audit --audit-level high` must report no high-severity advisories.

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

By contributing, you agree your contributions are licensed under the project's BSL-1.1 terms (see [LICENSE](./LICENSE)). Contributions are source-available, not OSI open-source.
