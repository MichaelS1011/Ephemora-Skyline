# Security Policy

This document covers **how to report a vulnerability** in Ephemora Skyline itself. It is not a statement that the software is secure — read the scope note below.

## How the project is designed to be safe

- **Local-first by design.** When you pick a local folder, file contents are read in-process by the backend on your own machine and never sent to a third party. The remote path (`POST /api/analyze`) is an explicit, separate action that clones a public repo via the GitHub API.
- **No shell interpolation for git.** Git runs through `execFile` with an argument array, never a shell string, so file/folder names cannot be used to inject commands.
- **Bounded input.** Local analysis is capped at 3000 files / 40 MB and skips `node_modules`, `.git`, and build directories.
- **Secret scanning.** Findings come from regex heuristics plus `gitleaks` (secrets), `semgrep` (AST), and dependency audit — surfaced as beacons, not silently.

## Reporting a vulnerability

Please report suspected vulnerabilities in **Ephemora Skyline itself** privately, not in a public issue:

- Open a private **security advisory**: GitHub → Security → _Report a vulnerability_ (https://github.com/MichaelS1011/Ephemora-Skyline/security/advisories/new)

Include: affected version/commit, a minimal reproduction, and the impact. You will get a response within 5 working days.

## Scope — what this is NOT

- This is **not** a guarantee or attestation of security. It is a maintenance process.
- A finding in the code you scan (a leaked secret in your own repo) is exactly what the tool is _for_ — it is not a vulnerability in Ephemora Skyline. Only use this channel for flaws in the visualizer, its backend, or its pipeline.

## Version support

Pre-1.0. Security fixes are applied to `main`. Backported releases begin at 1.0.
