# School & University Guide — Ephemora Skyline

English guide for teachers and lecturers: a quickstart, a 45-minute lesson plan,
a 90-minute double period, a university lab sheet, and an exam block with model
answers. The exercises live under [`teaching/uebungen/`](../../teaching/README.md)
and need no internet connection. The German original is
[SCHULE_UNI_GUIDE.md](./SCHULE_UNI_GUIDE.md); it carries the same claims. Every
product statement here is backed by [README.md](../../README.md),
[docs/GETTING_STARTED.md](../GETTING_STARTED.md),
[docs/PRIVACY.md](../PRIVACY.md) and [docs/LIMITS.md](../LIMITS.md) — check
those first when a number on a worksheet becomes critical.

## Teacher quickstart (2 minutes, once)

Requires Node.js `^20.19.0 || >=22.12.0` (from the school's package manager or
nodejs.org). No admin rights beyond that install — the app is a Node process,
not a service.

**Path A — release package (recommended for computer rooms).** Every release
since v0.3.0 ships its built package as the asset
`ephemora-skyline-<version>.tgz`
([releases page](https://github.com/MichaelS1011/Ephemora-Skyline/releases)).
In an empty folder:

```bash
npm install ./ephemora-skyline-<version>.tgz
node_modules/.bin/ephemora-skyline --port 4173 --no-open
```

Then open `http://127.0.0.1:4173` in a browser. The package carries the built
backend and frontend (`backend/dist`, `frontend/dist`); `npm install` pulls the
seven runtime dependencies from the npm registry on first install — for a purely
offline computer room, install once on a networked machine and copy the finished
folder to the others (details in the
[IT-admin privacy one-pager](./IT_ADMIN_DATENSCHUTZ.md)).

**Path B — checkout.** In the repository: `npm install`, then `npm start`; the
app opens at `http://127.0.0.1:4173`. For projector work: `EPHEMORA_NO_OPEN=1`
keeps the browser closed.

To try it without your own folder: the entry button **„Explore demo"** shows a
city of sample files with sample findings — no scanner ran on it (stated in the
README as such).

## 45-minute lesson: "Looking inside your own code" (exercise 01-webshop)

Material: the folder `teaching/uebungen/01-webshop/` (one copy per pair) and
[ARBEITSBLATT.md](../../teaching/uebungen/01-webshop/ARBEITSBLATT.md). For the
blind variant, delete the answer key `.skyline-uebung.json` from each copy (see
the worksheet's teacher section).

| Phase         | Time  | What happens                                                                                                                                                                                                              | Note                                                                                                                                                                                                                                                                                                                      |
| ------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Arrival       | 0–5   | The app is already running (quickstart); the projector shows the entry screen                                                                                                                                             | Start before the lesson, not in front of the class                                                                                                                                                                                                                                                                        |
| Demo city     | 5–10  | Open "Explore demo"; briefly: districts = folders, buildings = files, red beacons = findings                                                                                                                              | Emphasise: **no** scanner ran on the demo — it is illustrative material                                                                                                                                                                                                                                                   |
| Shared scan   | 10–15 | "Choose project folder" → a copy of `01-webshop`; look at the report                                                                                                                                                      | The report shows 7 entries: the 6 answer-key items plus the judgment-case `console.log`; with the optional engines on `PATH` a second-channel report joins (eight). Without engines all 6 answer-key items stay visible (the weak-hash rule comes from the shipped rule pack, running in the built-in in-process channel) |
| Pair work     | 15–33 | Pairs work through the worksheet: match findings to spots, use the hint ladder, collect points                                                                                                                            | Circulate; when a pair is stuck, point to the next hint rung, never to the solution                                                                                                                                                                                                                                       |
| Security tour | 33–41 | Teacher-led tour: the button "Visit security findings, highest priority first" — at each beacon: what the scanner sees, why it is dangerous, how to fix it (solution table in the worksheet)                              | The tour flies beacon to beacon; the order is priority, not file                                                                                                                                                                                                                                                          |
| Wrap-up       | 41–45 | Reflection questions in plenary, the central one: "Does a green report mean safe?" → No — see [docs/LIMITS.md](../LIMITS.md): whole classes of problems (e.g. authorization logic) are invisible to patterns of this kind | Optional: set verdicts — the buttons sit on each finding in the panel                                                                                                                                                                                                                                                     |

**Projector notes.** Start with `--no-open` / `EPHEMORA_NO_OPEN=1` and open one
browser manually. Pin the port (`--port 4173`) so everyone knows the same
address. Do not click open the answer file `.skyline-uebung.json` in the panel —
it contains the locations. Which optional engines are active, the city itself
reports (provenance; a missing check says it was skipped,
[docs/SCANNERS.md](../SCANNERS.md)).

## 90-minute double period: "Two languages, the same mistakes"

Both exercises in sequence; the goal is the comparison (the injection patterns
appear identically in JavaScript and Python; the scanner channels differ).

| Block              | Time  | Content                                                                                                                                                                                                                                                                                                                                    |
| ------------------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Intro              | 0–10  | Why static analysis? Short demo city; the terms district / beacon / report                                                                                                                                                                                                                                                                 |
| Scan ritual        | 10–20 | Scan `01-webshop` together, read the first findings aloud together; introduce the verdict words (real / false positive / reviewed)                                                                                                                                                                                                         |
| Exercise 01        | 20–45 | Pair work on [worksheet 01](../../teaching/uebungen/01-webshop/ARBEITSBLATT.md) (6 spots, 105 points)                                                                                                                                                                                                                                      |
| Tour & debrief 01  | 45–55 | Security tour through the beacons; walk the solution table (what/why/fix)                                                                                                                                                                                                                                                                  |
| Exercise 02        | 55–75 | [Worksheet 02](../../teaching/uebungen/02-datenimport/ARBEITSBLATT.md) (5 spots, 90 points). Announce beforehand: machines with `semgrep`/`ruff` show **more** reports than machines without — that is deliberate and discussed in block 7                                                                                                 |
| Compare & channels | 75–85 | Board picture: 5 of the 6 webshop findings come from pattern rules and one (the weak hash) from the shipped rule pack in the built-in in-process channel; of the Python findings, 4 come from pattern rules and the `os.system` finding needs an optional engine — so what does "the scanner found nothing" mean? (answer in worksheet 02) |
| Reflection         | 85–90 | Plenary: a green report ≠ a guarantee; which findings would you report to IT, which would you wave off as "fine"?                                                                                                                                                                                                                          |

## University lab sheet: "Scan and triage your own project" (90 minutes, pairs)

Students scan **their own** course project (or a brought open-source project)
and hand in a justified triage.

1. **Scan.** Start the app, choose the folder. Know the bounds: up to 10,000
   files / 150 MB / 2 MB per file scan fully; larger folders open as a preview
   sample of up to 2,000 files, and the announcement says so (README, privacy
   docs). `.git` is sent along (up to 96 MB, its own budget) because without
   commit history there is no churn axis ([docs/PRIVACY.md](../PRIVACY.md)).
2. **Read.** Open each finding: type, severity, rule, explanation, code frame
   (two lines; credential values are erased to `‹hidden›` before a finding is
   stored).
3. **Triage.** Mark every finding with a verdict (false positive / to fix /
   reviewed). Verdicts live locally: browser storage plus
   `~/.ephemora-skyline/verdicts.json`; they survive a backend restart and a
   re-scan ([docs/PRIVACY.md](../PRIVACY.md),
   [docs/AGENTS.md](../AGENTS.md) §3 — read channel
   `GET /api/result/<id>/verdicts`).
4. **Fix & verify.** Fix two findings, **re-scan**, and read the comparison: it
   distinguishes `present`, `gone`, `moved`, `unknown` — a vanished fingerprint
   alone is not proof, because the line may only have shifted (`moved`); see
   [docs/AGENTS.md](../AGENTS.md) §2 (`POST /api/verify`).
5. **Export.** SARIF 2.1.0 export at `GET /api/result/<id>/sarif`
   ([docs/API.md](../API.md)) — briefly note that CI tools (e.g. GitHub Code
   Scanning) read this format. The PNG city view for the report.

**Deliverable:** a triage table — finding (path, line, type), verdict, a
two-sentence justification, and for each "false positive": why the rule is wrong
here. Grade the justification, not the finding count. Tie in
[docs/LIMITS.md](../LIMITS.md): argue why your project is not "secure" despite
clean subsets.

## Exam block: 10 questions with model answers

Every question is answerable from the product (panel, reports, the four cited
documents). Model answers are short forms; full sentences expected.

1. **What address does the backend bind to, and why does that matter on a school
   network?** — `127.0.0.1` (localhost). Other machines on the school network
   cannot reach the service; the source post never leaves the machine (README,
   docs/PRIVACY.md).
2. **What is the staged copy, where does it live, how long?** — An owner-only
   copy of the chosen folder under `$TMPDIR/ephemora-skyline-uploads/<id>`, kept
   for 24 h (override `EPHEMORA_UPLOAD_DIR` / `EPHEMORA_UPLOAD_TTL_HOURS`), so
   the in-city test runner can run the project's own tests (docs/PRIVACY.md).
3. **What does a saved run (`~/.ephemora-skyline/runs/<id>.json`) store — and
   what not?** — Folder basename, relative paths, masked code frames, findings
   and summary, the newest 20 runs; **not** the raw staged copy, and credential
   values are erased to `‹hidden›` (docs/PRIVACY.md).
4. **Name three finding types your scans showed, each with its countermeasure.**
   — e.g. SQL_INJECTION → parameterized queries; PATH_TRAVERSAL → validate the
   path against a base directory (no `..`); HARDCODED_SECRET → move secrets out
   of the code into environment/vault (worksheets 01/02, solution tables).
5. **Does "no findings" mean "secure"?** — No. Patterns of this kind cannot see
   whole classes (among them authorization logic), and missing optional engines
   report themselves as skipped rather than "found nothing"
   ([docs/LIMITS.md](../LIMITS.md), docs/SCANNERS.md).
6. **Why did the `os.system` finding of exercise 02 not appear on some
   machines?** — Its rule runs through the optional `semgrep` (or `ruff` reports
   the same line); without those programs on `PATH` the line goes unnoticed — but
   the report says the case was skipped (worksheet 02, docs/SCANNERS.md).
7. **A `console.log` was reported. Dismiss or fix?** — Argue it: in shipped code
   remove it / use a logger; in the teaching material it was deliberately there
   as an unscored judgment case (worksheet 01, the "what a scan shows" section,
   teaching/README.md).
8. **What is a false positive, and how do you mark one?** — A finding that
   reports correctly by pattern but is harmless in context (e.g. a test fixture).
   Mark it in the panel with the "false positive" verdict; verdicts live locally
   in `~/.ephemora-skyline/verdicts.json` and apply again on the next scan of the
   same folder (docs/PRIVACY.md, docs/AGENTS.md §3).
9. **What is the SARIF export for, and who reads it?** — A machine-readable
   findings report (SARIF 2.1.0) at `GET /api/result/<id>/sarif`; CI and
   code-scanning tools can ingest it, so a team can track findings without
   sharing screenshots (docs/API.md).
10. **Why does the tool need no account, and what network access does it have at
    all?** — It is built local-first: no account, no telemetry. The README's
    host table lists the outbound lookups (among them the hourly update check,
    switchable off; `SKYLINE_OFFLINE=1` closes all paths); guard tests check the
    host table against the code (`backend/tests/network-honesty.test.ts`,
    docs/PRIVACY.md §"What the guards are").

## Teacher checklist before the lesson

- [ ] Node present, app starts on a pinned port, browser open, demo city tried.
- [ ] Exercise copies distributed; for the blind variant
      `.skyline-uebung.json` removed.
- [ ] Know which optional engines are on the machines (`semgrep`, `gitleaks`,
      `ruff` on `PATH`) — it decides how many reports appear (announce the
      expectation up front).
- [ ] The worksheets' solution tables not visible to the class (the hint panel
      never shows locations, but the worksheet file itself does).
- [ ] Time buffer: pair work is the core; tour and plenary are trimmable.
