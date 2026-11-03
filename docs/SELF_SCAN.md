# Self-scan policy

`npm run self-scan` sends the working tree through the product's own
`POST /api/analyze-local` route and treats a non-zero finding list as a failed
gate. It is the repository's answer to the question a user asks when they point
the tool at its own folder: **is this product clean by its own rules?**

Baseline after the 0.4.4 rule work: **0 findings, 0 `CMD_INJECTION`** under
the policy below. The **default profile** (no fixture exclusion, console on)
still reports **39 findings** — 22 intentional rule fixtures and 17
`CONSOLE_USAGE` lines in CLI/test code — because those are the product's
default answer, not this gate's exclusion. The delivered default list is
`docs/self-scan-findings.ndjson`.

## What the gate runs

- Profile `standard` with the local `ephemora-core` rule pack.
- `SKYLINE_OFFLINE=1`: no rule pack or advisory database is fetched. Dependency
  freshness is covered by `node scripts/audit-gate.mjs` (`npm audit`), not by
  this source scan.
- `excludePaths: ["backend/tests/fixtures/regeln"]` and
  `disabledFindingTypes: ["CONSOLE_USAGE"]` for this gate only.
- Sources are `git ls-files --cached --others --exclude-standard`, so ignored
  local scratch data cannot stall the scan.

## Dispositions for the 59 findings from the 147-finding baseline

The 147 → 59 drop was the local-matcher `exec` fix (`0459baa`). The remaining 59
are accounted for below. Every row is either a rule precision fix, a narrow
fixture exception, or a real dependency fix. **No finding type is switched off
globally.**

| Count | Type                    | Location(s)                                                                                                                                                                                                                                                                                                     | Disposition                                                                                                                                                                                                                       |
| ----: | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|    16 | `CONSOLE_USAGE`         | 15 `scripts/*.mjs`, `frontend/tests/citySidewalks.test.ts`                                                                                                                                                                                                                                                      | B — the CLI and its tests print by design; disabled only in the self-scan profile, app source is still checked.                                                                                                                   |
|    13 | `HARDCODED_SECRET`      | `backend/tests/beleg-05-frame-and-shapes.test.ts` (2), `backend/tests/fixtures/regeln/credentials.js` (4), `backend/tests/gitleaks-paths.test.ts` (1), `backend/tests/regeln-regex-layer.test.ts` (1), `scripts/local-llm-probe.mjs` (3), `scripts/model-card-shot.mjs` (1), `scripts/persistenz-drive.mjs` (1) | A/B — `.gitleaks.toml` allowlists the exact fake values; the LLM-redaction canary is also filtered by exact value in the regex fallback. No path or keyword allowlist.                                                            |
|     7 | `XSS`                   | `backend/tests/fixtures/regeln/xss-server.js` (4), `frontend/tests/farbband-legend.test.tsx` (1), `frontend/tests/heat-axis-legend.test.tsx` (1), `frontend/tests/surface-boundary.test.tsx` (1)                                                                                                                | A/B — fixtures are excluded; the three component tests assign static markup/clear a host, so the AST guard only ignores literal, non-interpolated right-hand sides. Dynamic `innerHTML` and `dangerouslySetInnerHTML` still fire. |
|     5 | `EVAL_USAGE`            | `scripts/drei-ordner-drive.mjs` (1), `scripts/model-card-shot.mjs` (2), `scripts/persistenz-drive.mjs` (2)                                                                                                                                                                                                      | A — Playwright `$eval`/`$$eval` is not the `eval` builtin; the regex now requires no `.` or `$` before `eval`.                                                                                                                    |
|     4 | `PATH_TRAVERSAL`        | `backend/tests/fixtures/regeln/traversal.js`                                                                                                                                                                                                                                                                    | B — intentional fixture, exact fixture directory excluded from the self-scan only.                                                                                                                                                |
|     3 | `SQL_INJECTION`         | `backend/tests/fixtures/regeln/sql-static.js`                                                                                                                                                                                                                                                                   | B — intentional fixture, exact fixture directory excluded from the self-scan only.                                                                                                                                                |
|     3 | `SSRF`                  | `backend/tests/fixtures/regeln/ssrf.js`                                                                                                                                                                                                                                                                         | B — intentional fixture, exact fixture directory excluded from the self-scan only.                                                                                                                                                |
|     2 | `CORS`                  | `backend/tests/fixtures/regeln/cors.js`                                                                                                                                                                                                                                                                         | B — intentional fixture, exact fixture directory excluded from the self-scan only.                                                                                                                                                |
|     2 | `INSECURE_HTTP`         | `scripts/pack-check.mjs`                                                                                                                                                                                                                                                                                        | A — loopback health probes (`127.0.0.1`, `localhost`, `[::1]`) are not network hops; public HTTP URLs still fire.                                                                                                                 |
|     2 | `VULNERABLE_DEPENDENCY` | `package-lock.json` (`GHSA-g3hv-75wg-m249`, minimatch < 11.0.1)                                                                                                                                                                                                                                                 | C — real advisory; root `overrides.minimatch` pins 11.0.4. `npm audit` is now 0/0/0/0/0.                                                                                                                                          |
|     2 | `WEAK_RANDOMNESS`       | `backend/tests/fixtures/regeln/weak-random.js`                                                                                                                                                                                                                                                                  | B — intentional fixture, exact fixture directory excluded from the self-scan only.                                                                                                                                                |

Fixture total: 22 findings in `backend/tests/fixtures/regeln/`; they remain
visible to normal users and are still asserted by the rule tests.

## Acceptance rules

1. `npm run self-scan` exits 0 with `0 finding(s)` and `0 CMD_INJECTION`.
2. Removing any one rule fix must make the matching positive test fail: `eval(userInput)`,
   `fetch('http://example.com')`, dynamic `innerHTML`, and a real credential
   are still findings. `backend/tests/evidence-precision.test.ts` and
   `backend/tests/regeln-regex-layer.test.ts` are the tripwires.
3. A new finding is a red gate. Do not add a directory, extension, or finding
   type to the self-scan config to make it green. Record the finding here with
   an owner, a reason, and the next review date; an expired exception is a bug.
4. Exceptions are reviewed when the rule pack or the fixture layout changes,
   and in any case by **2027-05-01**.
5. The native folder picker remains a human action. The gate scans the same
   working tree through the API, so it is reproducible without macOS picker
   automation.

## Reproduce

```bash
npm run self-scan
```
