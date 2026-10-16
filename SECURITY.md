# Security Policy

This document covers **how to report a vulnerability** in Ephemora Skyline itself. It is not a statement that the software is secure — read the scope note below.

## How the project is designed to be safe

- **Local-first by design.** When you pick a local folder, the browser reads it and posts the contents to the backend on `127.0.0.1`. Nothing is sent to a third party. There is no remote-repository path in this program: no clone, no upload, no account.
- **The backend binds to loopback** (`127.0.0.1` by default; `HOST` overrides it deliberately). Eleven routes carry the origin guard and refuse a request that a foreign web page sent, checked on `Origin` and `Sec-Fetch-Site`, because CORS limits what a page may read, not what it may send. Seven of them act on the machine beyond answering a question — start a scan, cancel one, run a folder's own tests, purge the staged copies, verify a scan against a later one, write a project's verdicts, delete every stored verdict — and four are reads of the local program (the demo, the city-mapped demo, the rule-pack list, the disk footprint). Two of the eleven run code: starting a scan runs the scanner binaries you installed, and **Run test file** runs the staged folder's own test suite.
- **No shell interpolation for git.** Git runs through `execFile` with an argument array, never a shell string, so file/folder names cannot be used to inject commands.
- **Bounded input.** Local analysis is capped at 10,000 files / 150 MB / 2 MB per file and skips `node_modules`, build output and other directories that hold no relevant source. `.git` is **not** skipped — it arrives within its own 20 MB budget because churn, author districts and the deep profile's history scan need commit history. The staged copy is written owner-only (`0700`) under `$TMPDIR/codecity-uploads/<id>` and swept after a TTL. Verdicts live in browser storage mirrored to one machine-owned file, `~/.ephemora-skyline/verdicts.json` (`CODECITY_VERDICTS_FILE` overrides it); the entry screen's reset button clears both.
- **Secret scanning.** Findings come from regex heuristics plus the optional engines you installed — `gitleaks` (secrets), `semgrep` (AST), `osv-scanner` (dependency advisories, falling back to `npm audit` and `pip-audit`) and `ruff` (Python lint) — surfaced as beacons, not silently.

## Reporting a vulnerability

Please report suspected vulnerabilities in **Ephemora Skyline itself** privately, not in a public issue:

- Open a private **security advisory**: GitHub → Security → _Report a vulnerability_ (https://github.com/MichaelS1011/Ephemora-Skyline/security/advisories/new)

Include: affected version/commit, a minimal reproduction, and the impact. You will get a response within 5 working days.

## Scope — what this is NOT

- This is **not** a guarantee or attestation of security. It is a maintenance process.
- A finding in the code you scan (a leaked secret in your own repo) is exactly what the tool is _for_ — it is not a vulnerability in Ephemora Skyline. Only use this channel for flaws in the visualizer, its backend, or its pipeline.

## Version support

Pre-1.0. Security fixes are applied to `main`. Backported releases begin at 1.0.
