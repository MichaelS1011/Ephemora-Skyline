# What the tool cannot see

The README lists this in six bullets. This is the same honesty with its working shown: where the 38 self-scan findings sit, what a machine without the optional engines reports, and which picture-language weaknesses stay open on purpose.

## The self-scan, distributed

The README's accuracy bullet states the pair the delivered list counts: **38 findings**, **1 of them** on an `expect(...)` line. The distribution is the part worth reading before you judge the number.

- **28** of the 38 are in test files and fixtures. Five of the `P0`s among them are synthetic credential fixtures this project scans on purpose — a secret scanner that cannot see a planted key is not a scanner.
- **2** are the dependency advisories on `package-lock.json`, which [the audit gate](../scripts/audit-gate.mjs) accepts by name with a reason and a re-check date rather than by lowering its threshold.
- **8** are in the scripts under `scripts/`, and the other three `P0`s sit there too: a `gitleaks` `stripe-access-token` on a synthetic key template and two `EVAL_USAGE` hits on Puppeteer element-evaluation calls in `scripts/persistenz-drive.mjs`. The remaining five are `CONSOLE_USAGE` in the drive scripts and the audit gate.
- **In `backend/src` and `frontend/src`: none.**

All four optional engines were on `PATH` for that run (`gitleaks`, `semgrep`, `ruff`, `osv-scanner`), so a machine without them reports fewer, and it says which ones it skipped. The list ships as `docs/self-scan-findings.ndjson`, one finding per line, with path, line, rule, severity and CWE and no source text — so the total is a `wc -l` and the second number is the line each finding points at. `backend/tests/selbst23-two-numbers.test.ts` forms both from that file and fails if the README sentence drifts.

## The rules cannot see whole classes

The shipped rules are shape heuristics on a single file. They have no authorisation model, so **authorisation and IDOR**, **race conditions**, **SSRF**, **weak randomness**, **server-side response sinks** and **path traversal in credential literals** are not covered by a rule that fires; the project panel says this in the city itself rather than in a footnote. What the rules do catch is the obvious line, not the clever one.

## Colour: one weakness kept open, by number

The colour-blind switch repaints the alarm band itself — the pulsing windows take the blue alarm tone, the plot's kerb takes vermilion, and the legend changes its key along with them. Measured on the pixels the switch moves, the worst-case distance between an alarm window and a calm one rises from **10,50 to 30,74 ΔE00**. Measured with the switch off: **0 pixels** change over the whole city area, so the shipped picture is untouched.

Two things stay open and are stated rather than smoothed over:

1. In the default branch the pale alarm window still sits **6,12 ΔE00** from a calm one for a deuteranope.
2. The beacon's shape code — octahedron, box, cone per class — exists only in the switched branch.

Both are picture-language decisions: acting on them redraws every published frame and every screenshot in this repository, so they are listed instead of quietly changed. `frontend/tests/farbband-palette.test.ts` and the ΔE00 measurements behind them are recorded in `docs/UI_REVIEW.md`.

## Other limits that are real

- **A metadata watch has a blind spot.** A file that changed without its size or mtime moving is invisible to the live delta; the full scan is the way to settle it.
- **A folder your `.gitignore` excludes is counted as that one folder**, not as the files inside it — the browser never lists them, so naming a file count there would be inventing one.
- **Headless CI cannot judge a WebGL scene.** Every render change needs a real-GPU screenshot; a green suite says nothing about the picture.
- **The offline switch is an environment variable**, not a UI control yet.
