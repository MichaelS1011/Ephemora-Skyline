# For a coding agent

Skyline has two channels. The 3D city is the human's: it answers "what am I full
of" at a glance. This file documents the agent's channel, which is text, small,
and keyed by the same fingerprint the panel shows.

## 1. Read the findings

```bash
curl -s http://127.0.0.1:4000/api/result/<analysisId>/handoff
```

Newline-delimited JSON, one finding per line. `buildHandoffLines` in
`backend/src/server/routes/agent.ts` writes them sorted by path, then by line, so
the same stored result produces the same bytes however its findings were ordered
on the way in. Measured on the packet below, written as one NDJSON line:
**643 bytes**, **322 bytes** with the four reasoning fields (`cwe`, `refUrl`,
`explanation`, `fix`) left out — three such findings are one response of
1932 bytes.

```json
{
  "schema": "ephemora.finding.v1",
  "analysisId": "956cfb77-4c3a-4d11-9c1f-7f5be2d18a04",
  "fingerprint": "83672b8534b95c59",
  "path": "src/db.js",
  "line": 1,
  "type": "SQL_INJECTION",
  "ruleId": "regex:SQL_INJECTION",
  "severity": "P0",
  "provenance": "regex",
  "cwe": "CWE-89",
  "refUrl": "https://owasp.org/www-community/attacks/SQL_Injection",
  "explanation": "A database query is built by string concatenation, so attacker-supplied text can change its meaning — read, modify or delete any data the query can touch.",
  "fix": "Use parameterized queries or an ORM (e.g., Prisma, Drizzle)",
  "assessment": "Scanner finding requiring verification; not a confirmed vulnerability."
}
```

The line of source is deliberately **not** in the payload. The fingerprint is
minted from it server-side in
`backend/src/services/security/finding-identity.ts`, and the payload carries only
that hash. The agent works in the repository it already has; shipping the file's
text would move the user's code into a second place without being asked to.

## 2. Check your own work

```bash
curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"before":"<scan-before-the-fix>","after":"<scan-after-the-fix>"}' \
  http://127.0.0.1:4000/api/verify
```

`present`, `gone`, `moved`, `unknown` — four branches of one comparison in
`compareScans`, not four heuristics. A fingerprint the later scan still holds is
`present`. A fingerprint that is gone, with no finding of the same rule left in
the same path, is `gone`. A finding whose rule is still in the same path at
another line is `moved`, never `gone`. A fingerprint the caller asked about that
the before-scan never held is `unknown`. Only the fingerprints the caller names
are checked: the body also takes `"fingerprints": ["83672b8534b95c59"]`, a list is
read up to 2000 fingerprints, and without that list every finding of the
before-scan is checked. The answer carries `before`, `after`, `checked` and those
four lists, `moved` as `from`/`to` pairs.

`moved` exists because a vanished fingerprint is not proof of a fix: the line can
have shifted under an unchanged rule. A renamed file and a silenced finding do
land in `gone`, because the path is part of the finding's identity, so to the
comparison each is a new finding — and `gone` says only that this fingerprint is
not in the later scan. An agent that reports "fixed" on that reading is worse than
one that got nothing, so the ambiguity is handed back instead of resolved in the
agent's favour.

Both endpoints read the in-memory results only: no folder is opened, nothing is
executed, nothing is written. `POST /api/verify` carries the same origin guard as
the routes that run code. Neither call needs an `Origin` header: the guard answers
a browser page from another website, and a client on this machine names no origin
and is let through. Send one only when it is the origin this process serves — a
configured `FRONTEND_ORIGIN` and a header that does not match it is a 403.

## 3. Read the verdicts

```bash
curl -s http://127.0.0.1:4000/api/result/<analysisId>/verdicts
```

`{"project": "<bucket>", "reviews": {"fp:<fingerprint>": "false-positive" | "to-fix" | "reviewed"}}`.
Read-only. The write doors — a `PUT` on the same path and `POST /api/verdicts/reset` —
belong to the browser and carry the same origin guard as the routes that run code;
this channel names only the read. `project` is the bucket `projectKey` in
`frontend/src/reviews.ts` mints — the workspace root the person configured for the
editor, otherwise the folder's top-level shape — derived in that one place and
never shipped inside the handoff payload. It is `""` while nothing has been synced
for that scan in the running process; a `?project=<bucket>` query reads a bucket
directly, which is how a re-scan finds the verdicts a previous process wrote before
anything was registered again. The verdicts live in one JSON file (`verdicts.json`)
in `~/.ephemora-skyline` on this machine (`backend/src/server/routes/verdicts.ts`,
override `CODECITY_VERDICTS_FILE`) — they survive a backend restart and a re-scan
of the same folder, and nothing about them leaves the machine.

## 4. What is not here yet, on purpose

| Missing                            | Why it is missing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A stable project id in the payload | the scan id is a fresh uuid per scan; the handoff line still carries no project bucket — the stable project id rides the verdict routes (`?project=` / the PUT body) and is minted in exactly one place, `projectKey` in `frontend/src/reviews.ts`                                                                                                                                                                                                                                                                          |
| Verdicts on another machine        | nothing leaves this machine: `SHARE_LINK` stays empty, the verdict store writes one local JSON file only, and no route talks to the network. A verdict belongs to the machine that scanned the folder                                                                                                                                                                                                                                                                                                                       |
| Absolute paths                     | the picker names paths relative to the folder you chose, and the backend refuses an absolute or climbing one — `safeRelativePath` in `backend/src/server/routes/local-analyze.ts`                                                                                                                                                                                                                                                                                                                                           |
| An MCP server                      | the channel works without a protocol: the example packet is one line of 643 bytes and both endpoints are read-only. A server is worth it once verification and persistence exist — persistence now does, and the verdicts are read over the route above. `semgrep/mcp` is the cautionary example: its README states the repository "has been deprecated, and further updates to the Semgrep MCP server will be made via the official `semgrep` binary" — [github.com/semgrep/mcp](https://github.com/semgrep/mcp), archived |

## 5. The rule that survives all of this

The agent gets evidence and a way to check itself. It does not get write access
to the city, the scan or the verdicts. A finding becomes "handled" when a human
says so, and when a later scan says the code agrees. The verdicts now have a home
that outlives the process; the agent still only reads them.
