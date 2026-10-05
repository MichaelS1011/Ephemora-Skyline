# For a coding agent

Skyline has two channels. The 3D city is the human's: it answers "what am I full
of" at a glance. This file documents the agent's channel, which is text, small,
and keyed by the same identity the panel shows.

## 1. Read the findings

```bash
curl -s -H 'Origin: http://localhost:3010' \
  http://127.0.0.1:4000/api/result/<analysisId>/handoff
```

Newline-delimited JSON, one finding per line, ordered by path then line so two
runs of the same scan produce the same bytes. Measured: **219 bytes per finding**
in a four-field packet, ~670 bytes with the reasoning fields, 3 findings = 2005
bytes. A repository's whole triage fits in a context window.

```json
{
  "schema": "ephemora.finding.v1",
  "analysisId": "956cfb77-…",
  "fingerprint": "3fa1…",
  "path": "src/db.js",
  "line": 1,
  "type": "SQL_INJECTION",
  "ruleId": "regex:SQL_INJECTION",
  "severity": "P0",
  "provenance": "regex",
  "cwe": "CWE-89",
  "refUrl": "https://owasp.org/…",
  "explanation": "A database query is built by string concatenation, so attacker-supplied text can change its meaning…",
  "fix": "use placeholders",
  "assessment": "Scanner finding requiring verification; not a confirmed vulnerability."
}
```

The line of source is deliberately **not** in the payload. The agent works in the
repository it already has; shipping the file's text would move the user's code
into a second place without being asked to.

## 2. Check your own work

```bash
curl -s -X POST -H 'Content-Type: application/json' -H 'Origin: http://localhost:3010' \
  -d '{"before":"<scan-vor-dem-fix>","after":"<scan-nach-dem-fix>"}' \
  http://127.0.0.1:4000/api/verify
```

`present`, `gone`, `moved`, `unknown`. Measured on a real fix of two findings and
one moved line: `present 0 · gone 2 · moved 1 · unknown 0`.

`moved` exists because a vanished fingerprint is not proof of a fix. The line can
have shifted, the file can have been renamed, the finding can have been silenced.
An agent that reports "fixed" for those three cases is worse than one that got
nothing, so the ambiguity is handed back instead of resolved in its favour.

Both endpoints read the in-memory results only: no folder is opened, nothing is
executed, nothing is written. `POST /api/verify` carries the same origin guard as
the routes that run code.

## 3. What is not here yet, on purpose

| Missing                                 | Why it is missing                                                                                                                                                                                                              |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Your verdicts (false positive / to fix) | they live in this browser, not on the server, until review data has somewhere to be persisted                                                                                                                                  |
| A stable project id in the payload      | the scan id changes per scan; the project bucket exists since 2026-10-05 but is not exported                                                                                                                                   |
| Absolute paths                          | the picker never sends them; the file's path is relative to the folder you chose                                                                                                                                               |
| An MCP server                           | `GET /handoff` is 2 KB for a repo's worth of findings, smaller than a tool description would be; the server is worth it once verification and persistence exist — and `semgrep/mcp` being deprecated is the cautionary example |

## 4. The rule that survives all of this

The agent gets evidence and a way to check itself. It does not get write access
to the city, the scan or the verdicts. A finding becomes "handled" when a human
says so, and when a later scan says the code agrees.
