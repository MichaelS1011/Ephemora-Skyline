# HTTP surface

The local backend serves the app and its API from one address: `:4173` when started with `npm start` (built frontend served by the same process), `:4000` during `npm run dev` while Vite holds `:3010`. It binds to `127.0.0.1` by default.

**Every route below is loopback-only.** The fifteen that carry the origin guard refuse a request a foreign web page sent, checked on `Origin` and `Sec-Fetch-Site`; the reads answer only this machine's own page. `backend/tests/beleg-02-api-and-staging.test.ts` reads this table and the registered paths in `backend/src/server/index.ts` and fails if the two ever disagree in either direction.

| Method and path                       | Purpose                                                              |
| ------------------------------------- | -------------------------------------------------------------------- |
| `GET  /api/health`                    | liveness, and the retention values the running process actually uses |
| `GET  /api/demo`                      | the seeded demo city (`demo-001`)                                    |
| `GET  /api/cities/default`            | the default city for a cold start                                    |
| `POST /api/analyze-local`             | analyze a folder picked in the browser (primary path)                |
| `POST /api/analyze-local/:id/live`    | fold a content-hash delta into a finished scan (built-in rules only) |
| `POST /api/analyze-local/:id/cancel`  | stop a running scan and delete its staged copy                       |
| `GET  /api/status/:id`                | progress of a running analysis (polled)                              |
| `GET  /api/result/:id`                | full analysis result as JSON                                         |
| `GET  /api/result/:id/city`           | the city payload the renderer consumes                               |
| `GET  /api/result/:id/sarif`          | SARIF 2.1.0 export of the findings                                   |
| `GET  /api/result/:id/source/:fileId` | the file a finding points at                                         |
| `GET  /api/result/:id/handoff`        | one finding per line, NDJSON, for a coding agent (`docs/AGENTS.md`)  |
| `POST /api/verify`                    | did the findings of one scan survive a later one?                    |
| `POST /api/explain-finding`           | one flagged line to a model on this machine (`EPHEMORA_LLM_URL`)     |
| `GET  /api/result/:id/verdicts`       | the verdicts the person set for that scan's project, read-only       |
| `PUT  /api/result/:id/verdicts`       | the browser's write of that project's verdicts (origin-guarded)      |
| `POST /api/verdicts/reset`            | delete every verdict this machine stored (the entry screen's button) |
| `GET  /api/rule-classes`              | the curated class names a filter chip reads (`EVAL_USAGE` → Eval…)   |
| `POST /api/export`                    | write the held city as a folder that opens on another desk           |
| `GET  /api/rule-packs`                | the rule packs on this disk, and whether the offline switch is set   |
| `GET  /api/footprint`                 | the staged copies: how many, how big, how long they stay             |
| `POST /api/footprint/purge`           | delete the copies that are past their keep time                      |
| `POST /api/tests/:id/run`             | run one of that city's own test files                                |
| `GET  /api/tests/run/:runId`          | output of that run                                                   |
| `GET  /api/update/check`              | the anonymous newest-release check                                   |

## What the guards are

- **The nine that can do something** beyond answering a question: start a scan, cancel one, run a folder's own tests, purge staged copies, verify a scan against a later one, write a project's verdicts, delete every stored verdict, write an exported copy of a city, ask a model on this machine about one flagged line.
- **The five reads** of the local program: the demo, the city-mapped demo, the rule-pack list, the rule-class names, the disk footprint.
- **No websocket, no long-poll channel, no hosted backend.** `backend/tests/no-websocket-surface.test.ts` fails if one ever appears in the code or in the public text.
- **Retention is answered, not recited.** `GET /api/health` returns the values the process is using, so the city-link message cannot go stale when an operator changes `ANALYSIS_MAX_ENTRIES` or `ANALYSIS_TTL_MS`.
