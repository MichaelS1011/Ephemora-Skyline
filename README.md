# Ephemora Skyline

<p align="left">
  <a href="https://github.com/MichaelS1011/Ephemora-Skyline/blob/main/LICENSE"><img alt="Licence: Apache License 2.0 — you may read it, run it, change it, ship it; the name is not part of what it grants" src="https://img.shields.io/badge/license-Apache--2.0-blue?style=flat"></a>
  <img alt="The five gates CI runs on every push to main and on every pull request: lint, the type check, the test suite, the build, the dependency audit" src="https://img.shields.io/badge/gates-lint%20%C2%B7%20types%20%C2%B7%20tests%20%C2%B7%20build%20%C2%B7%20audit-2c2c29?style=flat&logo=githubactions&logocolor=white">
  <img alt="Nothing leaves your machine: the backend binds to 127.0.0.1, your source is posted over loopback, and the app sends no telemetry" src="https://img.shields.io/badge/local--only-no%20telemetry%20%C2%B7%20127.0.0.1-29d398?style=flat">
  <img alt="Requires Node.js 20.19 or a supported newer release, and npm 10 or newer" src="https://img.shields.io/badge/node-20.19%2B-339933?style=flat&logo=nodedotjs&logocolor=white">
  <img alt="Written in TypeScript 5.9" src="https://img.shields.io/badge/typescript-5.9-3178c2?style=flat&logo=typescript&logocolor=white">
  <img alt="Interface built with React 19" src="https://img.shields.io/badge/react-19-61dafb?style=flat&logo=react&logocolor=000">
  <img alt="3D rendering on three.js revision 186" src="https://img.shields.io/badge/three.js-r186-000000?style=flat">
  <img alt="Dependencies are checked for advisories weekly by Dependabot, and the audit gate fails on any high or critical finding that was not explicitly accepted" src="https://img.shields.io/badge/deps-Dependabot%20weekly-4078c0?style=flat&logo=dependabot&logocolor=white">
</p>

**Your local codebase, rendered as a living 3D city in daylight.** Point it at a folder and watch it rise: folders become districts, files become buildings, a taller building holds more tangled code, and a red beacon marks a security finding. Your source never leaves the machine. No account. No login. A desktop web application — phones are not supported and not planned.

**To see it before you read any of this:** `git clone` this repository, `npm install`, `npm run dev`, open **http://localhost:3010** and press _Explore demo_. The exact commands, what each of the five gates checks and what the tool will not tell you are below.

|                                                                                                                                                                             |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [![The finished demo city: six districts, the project panel, the map naming its own alarm count](docs/assets/demo-city-poster.png?v=2026-10-12)](docs/assets/demo-city.mp4) | **[Watch the 28-second clip](docs/assets/demo-city.mp4)** — one visit, filmed as it happens: the entry screen, the demo opened, the city assembling, the Security Tour flying finding to finding. No sound, no cuts, no sped-up frames; every pixel is drawn by the app on a laptop. The clip plays 28.5 s at 800 × 500 and 15 fps, 442 KB, one video stream and no audio track. The poster beside it is its own frame of the finished city, not a frame of the clip, and it carries its own measurements in `docs/UI_REVIEW.md`. |

![The built city: districts as plots, files as buildings, the riskiest file as a landmark tower with a red beam](docs/assets/ui-workspace.png?v=2026-10-12)

## Quick start

Requires **Node 20.19+ or 22.12+** (Node 21 is unsupported) and **npm >= 10**. Optional: `gitleaks`, `semgrep`, `osv-scanner` and `ruff` on `PATH` — without them the corresponding checks report themselves as skipped instead of pretending to have run.

```bash
git clone https://github.com/MichaelS1011/Ephemora-Skyline.git   # Apache-2.0: a mirror or a fork is permitted
cd Ephemora-Skyline
npm install            # workspaces: frontend + backend
npm run dev            # backend on :4000 + frontend on :3010
```

Open **http://localhost:3010** and click **Choose project folder** — or **Explore demo** first. The demo uses sample files and findings; no scanner ran on that city.

### The gates CI enforces

> **The gates are in the tree.** `.github/workflows/ci.yml` is part of this repository: it defines five checks — lint, the type check, the build, the test suite, the dependency audit — and triggers on pushes to `main` and on pull requests against it. No status badge sits above this line, because no file in this repository can show a run result, and a badge that shows nothing is a decoration; the badge that is there names the five checks instead. Every command is under Quick start; run them yourself before you file anything.

```bash
npm run lint           # ESLint, zero warnings
npm run type-check     # tsc --noEmit, both packages
npm run test           # Vitest — 202 test files: 121 frontend, 81 backend (2026-10-16)
npm run build          # production build, both packages
node scripts/audit-gate.mjs   # dependency audit, see below
```

The file counts are read out of this tree by a test (`backend/tests/claims-counts.test.ts`), so anyone with the checkout can check them. The case count is a measurement from one machine rather than something the repository re-checks: 1,965 cases on 2026-10-16 — 796 backend, 1,169 frontend — a dated 1,885-case base plus the 6 cases `backend/tests/provenanz-verdrahtung.test.ts` adds. Cases that need an external scanner binary are skipped only when that binary is genuinely absent: the probe asks the filesystem, not the scanner, because a cold `semgrep --version` took 11–104 s here and used to retire three real assertions as skips.

The audit gate fails on every high or critical finding **except** those explicitly accepted in `scripts/audit-gate.mjs` with a reason and a re-check date. Today one advisory is accepted: `braces` (GHSA-vfj7-8cjw-p6xm) has no fixed release, and it reaches the tree only through the file watcher that Tailwind's build depends on. It is named in the gate rather than hidden by a lowered threshold.

## Why it is different

Most security tooling is a list of findings you scroll. Ephemora Skyline makes a codebase **spatially legible**, so "where is the risk?" is answered by sight before you read a line. Clarity is the first security control — and a number you cannot check is not a measurement, so every channel in the city is a real metric.

| What you see               | What it encodes                                                                   |
| -------------------------- | --------------------------------------------------------------------------------- |
| Building height            | Synthetic complexity: 45% cyclomatic, 30% import-count depth proxy, 25% file size |
| Red beacon, landmark tower | Security findings, weighted by risk                                               |
| Plot and district          | Folder, with its most at-risk files drawn                                         |
| Yellow lasers              | Copy-paste clones between files                                                   |
| Red rings                  | Circular imports                                                                  |
| Blue shield                | Test coverage, when an `lcov` report exists                                       |
| Grey `#6b6a63` "unscanned" | No engine looked here — not a claim of clean                                      |

- **It builds in front of you.** Every visit starts on an unbuilt plot — its streets, kerbs and crossings are already drawn, and the Ephe's are already walking them. The Ephe's are the city's small inhabitants: the ones who do the construction, and who say what they are raising while they raise it. Pick a folder and the city assembles — roads, plots, buildings — while they explain it.
- **Scale-independent semantic zoom.** The overview draws one block per top-level folder — ten folders or ten thousand, the picture stays readable. Click into a block to open it as its own district. Files that are not drawn show honestly as a podium ("+N more files"), never silently dropped.
- **Security Tour.** The camera flies finding to finding, highest risk first, with a plain-language explanation and a fix suggestion.
- **Findings you can verify.** Every finding carries its file, its line, the line the rule matched with two lines either side read out of your copy of the file, and a link to the rule that fired. Open the file in your editor from the card. Each one also carries a fingerprint — rule, path, line and the (masked) line itself — so a verdict you record survives scanning the same folder again, and the same finding can be named in a report, in the city JSON and by an agent. A finding that moves to another line or into a renamed file counts as a new one, and says so.
- **Orientation, always.** Breadcrumbs, a minimap showing the real camera position, search-to-fly, keyboard navigation.
- **Shareable by choice.** The local Share Studio previews PNG pictures and WebM construction videos in three formats before saving or using the system share dialog. Project and folder names in the media are opt-in; a small Ephemora credit is optional. SARIF 2.1.0 carries the scan id, finding fingerprints and rule context. A `?city=<id>` link works only for someone using the same running local backend. When a picture is finished, four platform rows say what each of them can actually take from a browser — and none of them posts anything.
- **Nothing leaves the folder count without a number.** Files that never joined a scan are counted by the reason they left: too long a path, refused as unsafe, too large, unreadable, excluded by you, set aside by your project's own `.gitignore`, past the tool's own 15 MB history budget, or a shape the scanners do not read. The summary line adds them up, so “32 files” and “30 files were not read” arrive together. One thing is stated instead of smoothed over: a folder your `.gitignore` excludes is counted as that one folder, not as the files inside it — the browser never lists them, so it would be inventing a number.
- **The way around the file cap is a field, not a config file.** When a folder is over the limit, the refusal names the count, the limit and the excluded folders you set — and the entry screen has an _Excluded folders_ field beside the profile choice that stores them, reads them back and caps the list at fifty.
- **A verdict that cannot be stored says so.** Triage decisions live in browser storage, mirrored to a machine-owned file (`~/.ephemora-skyline/verdicts.json`) so a re-scan of the same folder finds them again; the reset button clears both. If a write is refused, the panel states it where you clicked, and the note disappears the moment a write succeeds again.
- **Colour is never the only carrier.** Severity chips carry a shape and a word, the map marks an alarm plot with a wedge _and_ names the count in words, an unverified sweep is drawn dashed, and the colour-blind palette reaches every surface that paints a severity — the city's own alarm band included.
- **The city you come back to.** Reload and the district, the selection and the camera are where you left them, including when your system asks for reduced motion; the entry screen lists the cities this browser has opened, with what each one measured.

## What it will not tell you

Worth reading before the feature list means anything to you.

- **A finding is a rule that matched, not an exploit proven.** Every card says which scanner fired and on what line, so you can check it. The check is the product; the beacon is only the pointer.
- **There is no accuracy number here, on purpose.** Precision and recall need an annotated corpus that is not this repository. The one scan we can show honestly is our own: the default-profile run over this checkout on 16 October. It covered 444 files — everything git calls the project (tracked plus the untracked files of this tree, the repository's own `.gitignore` respected, no git history sent) — and the scan read **407** of them. It reported **38 findings**, and 1 of them landed on an `expect(...)` line: a `gitleaks` `aws-access-token` hit on `expect(maskSecretText(...))` in `backend/tests/beleg-05-frame-and-shapes.test.ts`. That hit is a fixture key id inside the assertion that the masker just hid — not a credential in shipped code. Where the 38 sit is the part worth reading: 28 are in test files and fixtures, and 5 of the `P0`s among them are synthetic credential fixtures this project scans on purpose; 2 are the dependency advisories on `package-lock.json` that [the audit gate](./scripts/audit-gate.mjs) accepts by name with a reason and a re-check date; 8 are in the scripts under `scripts/`, and the other 3 `P0`s sit there too — a `gitleaks` `stripe-access-token` on a synthetic key template and two `EVAL_USAGE` hits on Puppeteer element-evaluation calls in `scripts/persistenz-drive.mjs`, the remaining five `CONSOLE_USAGE` in the drive scripts and the audit gate. In `backend/src` and `frontend/src`: none. All four optional engines were on `PATH` for this run (`gitleaks`, `semgrep`, `ruff`, `osv-scanner`), so a machine without them reports fewer, and it says which ones it skipped. The list ships as `docs/self-scan-findings.ndjson`, one finding per line, with path, line, rule, severity and CWE and no source text, so the total is a `wc -l` and the second number is the line each finding points at. `backend/tests/selbst23-two-numbers.test.ts` forms both from that file and fails if this sentence drifts.
- **It does not run your code.** No execution, no fuzzing, no reachability proof. It reads files, and asks four optional external scanners that you installed yourself. The one route that does execute something is deliberate and named on screen: **Run test file** runs _your project's own_ test file, from the copy you picked, only after you press it.
- **The switch reaches the city now; the default picture keeps its measured weakness.** Turning the colour-blind palette on repaints the alarm band itself — the pulsing windows take the blue alarm tone, the plot's kerb takes vermilion, and the legend changes its key along with them. Measured on the pixels the switch moves: the worst-case distance between an alarm window and a calm one rises from **10,50 to 30,74 ΔE00**. Measured with the switch off: **0 pixels** change over the whole city area, the shipped picture is untouched. What remains open is stated by number rather than smoothed over — in the default branch the pale alarm window still sits 6,12 ΔE00 from a calm one for a deuteranope, and the beacon's shape code (octahedron, box, cone per class) exists only in the switched branch. Both are picture-language decisions: acting on them redraws every published frame, so they stay listed as open.
- **It does not write to your project.** The explanation layer has a voice and no pen. Fixes happen in your editor or your coding agent, and a fresh scan shows what moved.
- **A city is not an archive.** Results live in the local process — the last 20, for 24 hours. A `?city=` link is a pointer into a running session. Export the SARIF or the PNG if the finding has to outlive the process.

## Privacy model

**Nothing listens on a public address.** The backend binds to `127.0.0.1` by default. The eleven routes that carry the origin guard refuse a request that a foreign web page sent, checked by `Origin` and `Sec-Fetch-Site`:

- **The seven that could do anything beyond answering a question:** start a scan, cancel one, run a folder's own tests, purge the staged copies, verify a scan against a later one, write a project's verdicts, delete every stored verdict.
- **The four reads of the local program:** the demo, the city-mapped demo, the rule-pack list, the disk footprint.

A random site you visit cannot make your local scanner run your tests. Reporting a vulnerability in this tool itself follows [SECURITY.md](./SECURITY.md).
**The table below is not decoration.** The entry screen of the app renders the same list from the same declaration the backend obeys (`OUTBOUND_CALLS`), and a test fails if the two ever name different hosts. What that test pins is the host set: the wording of each row is written twice, so it can drift while the hosts still match.
**Before you do anything, the browser asks nothing that reaches past this machine.** The UI font ships inside the app, a separate test fails if the entry document ever references a third-party host, and what the entry screen does request — the copy footprint it prints — goes to the local backend over `127.0.0.1`. The newest-release lookup in the first row below is part of that silence: it runs only while the reader has switched it on in the More menu of a city, and that switch starts **off**.

When you pick a folder, the **browser** reads it and posts the contents to the local backend over `127.0.0.1`: your source is never uploaded and never sent to a third party — it crosses the loopback interface and stops there. What does leave the machine are lookups the scanners make for themselves, and those carry names, never code:

| Host                   | Made by                             | Leaves the machine                                          | When                                                  |
| ---------------------- | ----------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------- |
| `api.github.com`       | the app (update check)              | one anonymous request for the newest release tag            | once an hour, only if the check is on (default: off)  |
| `semgrep.dev`          | `semgrep`                           | the name of the rule pack it downloads (`p/security-audit`) | a Semgrep scan with no local rule pack selected       |
| `api.osv.dev`          | `osv-scanner`                       | package names and versions read out of your lockfiles       | a scan with the OSV check switched on                 |
| `api.deps.dev`         | `osv-scanner`                       | the same package names, resolved against the deps.dev index | with `osv-scanner` installed, next to the OSV queries |
| `registry.npmjs.org`   | `npm audit`                         | the same dependency names, via npm's advisory path          | dependency check on, but no `osv-scanner` installed   |
| `pypi.org`             | `pip-audit`                         | Python requirement names and versions                       | OSV check on, but no `osv-scanner` installed          |
| `registry-1.docker.io` | the Semgrep Docker fallback         | nothing but an image pull (`semgrep/semgrep:1.162.0`)       | Semgrep selected, no binary on `PATH`, Docker present |
| `registry.npmjs.org`   | `npm ci` in the in-city test runner | whatever your own project's tests install                   | only when you press **Run test file** on a building   |

`SKYLINE_OFFLINE=1` switches off the update check even for a reader who turned it on, the OSV check and the dependency check, and switches off Semgrep unless a local rule pack is selected — a pack that is already on your disk needs no download. It also closes the three paths a profile never asks about: **pip-audit** is skipped instead of resolving requirements against `pypi.org`, the **Semgrep Docker fallback** only runs on an image already cached locally instead of pulling one, and **Run test file** refuses to `npm ci` a staged copy that has no `node_modules`. With the switch set, nothing in the table above is reached. It is an environment variable, not a UI control yet. The city then reports what went missing through `scanProvenance` and paints those buildings the colour of ground no scanner looked at, instead of calling them clean.

**What the staged copy is.** To scan a folder the backend writes it to `$TMPDIR/codecity-uploads/<id>` with owner-only permissions, and keeps it for 24 hours (override with `CODECITY_UPLOAD_DIR` / `CODECITY_UPLOAD_TTL_HOURS`) so the in-city test runner can execute your project's own tests from the city you are looking at. The folder picker sends `.git` too — up to 15 MB of it, in its own budget, trimmed in the browser before anything is posted — because churn, author districts and the deep profile's history scan are impossible without commit history. Local analysis is capped at **10,000 files / 150 MB / 2 MB per file**. What never joins a scan is counted rather than hidden. Your project's own `.gitignore` sets its paths aside _before_ the cap is applied, and `node_modules` and build output are skipped, so the summary names every number it left out. Measured on this repository on 2026-10-12, the one machine's disk offered **17,360** source-shaped files before the repository's own `.gitignore` set the tooling folders aside — that number stays dated because it belongs to a disk, not to the checkout. The checkout's own number is walked, not retyped, and the walk runs the two decisions the app itself makes over a picked folder: the browser reader's own `classifyCandidate` — the very `SKIP_DIRS` test, `.gitignore` set-aside, source-shape rule, your excludes and the path and size walls — counts **428** files the project calls source and admits them to the read, and the scan's own single decision, `isScanCandidate`, then reads **411** of those. Two sets, two names, and only one of them is on the screen: pointing the app at the same folder prints `376 files analyzed` next to `37 files in a format the scanners do not read` — that pair was read off the screen on 2026-10-14, over the 413-file tree of that day, and this checkout has since grown two test files plus three source files from later lanes. The 17 that sit between the two numbers are files the reader carries along for the project's own test runner that no scanner reads — nine Markdown (this README among them), `LICENSE`, `NOTICE`, `.gitignore`, the two `Dockerfile.*`, `nginx.conf`, the font licence `.txt`, one `.svg`; the 37 are those 17 plus the 20 the reader does not open at all — 12 pictures, the 28-second clip, six extension-less dotfiles and `docs/self-scan-findings.ndjson`. That pair was read off the shipped build against this checkout's file set on 2026-10-14; the walked pair above is the same two functions over today's file set. `backend/tests/claims-counts.test.ts` calls those two shipped functions over this tree and fails, printing both numbers, the moment this sentence drifts.

**What the saved city carries.** A finding stores the line it was found on plus a two-line code frame, and the result is served as JSON you can export and share. Credential values are erased to `‹hidden›` before a finding is kept, and the erasure does not trust the variable name: it masks `NAME = "…"` assignments _and_ known token shapes (GitHub, AWS, Slack, Google, Stripe, OpenAI, npm, JWT, private-key headers), because `const pat = "ghp_…"` in a test fixture is a real token behind an innocent name — that exact line is how we found the hole, in our own repository. The name stays, because the name is what tells you where to fix. Masking is not limited to secret findings: it runs on every frame at the scanner boundary, because a `console.log` one line above a password carries that password in its neighbour lines. It also runs before the 120- and 160-character display limits, so a clipped line never shows the first half of a token — a fragment no rule would recognise again. `.env`, `.env.production` and friends are in the scan surface **because** of that masking, and are read as data — no complexity, no code-shape questions.

**How a finding is named.** Each one carries a fingerprint derived from rule, path, line and the masked line, and it is minted once — the same value in the panel, in the city JSON and in the SARIF export's `partialFingerprints`. That is what lets a verdict you recorded survive scanning the same folder again, and what lets a report or a coding agent point at the same finding you are looking at. It is deliberately not magic: a finding that moves to another line, or into a renamed file, gets a new fingerprint, and verdicts left behind by such a move are counted and named in the panel rather than quietly kept.

**Telemetry: none.** No analytics, no beacon of its own — the only request the app makes for itself is the anonymous release check in the table above. The browser asks nothing before you act either: the UI typeface is bundled, and a test fails if the entry document ever references a third-party host. Maintainers measure adoption through [GitHub's traffic and clone statistics](https://docs.github.com/en/rest/metrics/traffic) (`GH_TOKEN=*** node scripts/clone-stats.mjs`), which count clones without identifying anyone. Two conditions belong to that sentence: those endpoints answer only a token with write access to this repository, and they report the last 14 days, so the numbers exist for the maintainers and for nobody else. `scripts/clone-stats.mjs` reads three fields out of them — `count`, `uniques`, `timestamp`.

**How long a city lives.** Results are held in the backend's memory: by default the last 20 cities, for 24 hours, both settable with `ANALYSIS_MAX_ENTRIES` and `ANALYSIS_TTL_MS`. The app does not recite those two numbers — `GET /api/health` answers with the values the running process is actually using, and the city-link message is built from that answer, so an operator who changes the environment does not leave a stale claim on the screen. A `?city=<id>` link therefore works while that backend process is running: it is a pointer into a live session, not an archive. Export the PNG or the SARIF if the finding has to outlive the process.

## What it checks

Pick a profile, or configure your own:

| Profile      | What it does                                                                                                |
| ------------ | ----------------------------------------------------------------------------------------------------------- |
| **Quick**    | Heuristics, secrets and dependency advisories, critical findings only — no AST scan, no OSV, no Python lint |
| **Standard** | Every check: regex heuristics, `gitleaks`, `semgrep`, dependency audit, OSV, `ruff`                         |
| **Deep**     | Standard plus a secret scan of the git history                                                              |
| **Custom**   | The same checks, chosen by you: categories, engines and rule pack                                           |

Findings are grouped into nine categories that can be switched per scan, inside a city — injection and execution, secrets, cryptography, transport and certificates, data exposure, dependencies and supply chain, permissions and destructive actions, code hygiene, and a bucket for findings whose rule carries no CWE the taxonomy knows.

Your own patterns are supported too: up to 25 regular expressions with severity, message, suggested fix, CWE and language gates. Each one is validated against a ReDoS canary before it is ever run.

### Rule packs

The deep AST scan needs rules, and where those rules come from is a decision with a licence attached. The Semgrep Rules License v1.0 states: "This license does not allow you to distribute the rules, or to make them available to others as a service." So the registry stays what it always was — fetched by `semgrep` itself, by you, at scan time — and what ships in this repository is rules we wrote and own.

| Pack                 | Where it lives                                                       | Rules                                                                  | Licence                                                 |
| -------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------- |
| `ephemora-core`      | `backend/rules/ephemora-core/`                                       | 12                                                                     | Apache-2.0, same as the program — ours to ship and grow |
| _(nothing selected)_ | `semgrep.dev`, during the scan                                       | not in this tree — the registry's own count, on the registry's own day | Semgrep Rules License v1.0 — not redistributable        |
| your own             | `~/.ephemora-skyline/rule-packs/<id>/` (or `CODECITY_RULE_PACK_DIR`) | any                                                                    | yours                                                   |

A pack is a directory with a `pack.json` manifest and rule YAML beside it. The manifest's `ruleCount` is checked against the files at load time, and a pack whose manifest lies is not offered at all. Scans select packs **by id**; a path is rejected, because a client-supplied directory would let the scanner read rules from anywhere on the machine.

## The look

Every frame below was shot from the build in this repository on 2026-10-16, on the sample city the app ships with — the one place where a picture can be honest about what it shows, because nothing of anyone's code is in it.

| Entry screen                                                                                                                                                        | The scan settings                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ![Entry screen: the folder action, the folded scan settings, an annotated sample district and the last city this browser opened](docs/assets/hero.png?v=2026-10-12) | ![The settings open: the five scan profiles, the one line that says what the chosen one runs, and the excluded-folders field](docs/assets/ui-entry-settings.png?v=2026-10-12)                                                                             |
| What the tool is, in one screen, before it has anything of yours. The row at the bottom is the last city this browser opened, with what it measured.                | One question at a time: how deep to scan, and which folders to leave out — the second is the way around the file cap. Narrowing a scan by finding category or rule pack sits inside a city, where there are already findings to judge the choice against. |

| The city, structure mode                                                                                                                           | The city, security mode                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ![The built city with its project panel, the honest demo banner and the city map](docs/assets/ui-workspace.png?v=2026-10-12)                       | ![Security mode: the towers with no critical or high finding drop in brightness, while the streets, the ground and the labels stay as they were; the one control that changes is the mode bar's own active chip](docs/assets/ui-security.png?v=2026-10-12)                                                                                                                                                                                                                                                                |
| 74 sample files in six districts, the riskiest file as a landmark tower. The map names its own count: “▲ 1 of 6 plots carries a critical finding”. | Two channels change between these frames, and both are named: the towers with no critical or high finding drop in brightness, and the mode bar's active chip moves from Structure to Security — every brighter pixel of the pair sits inside that chip's field. Measured between the two frames with no tolerance and no region mask: 1.33 % of the pixels differ, and on those the median colour sum falls from 366 to 250. The split by channel, and the control that holds the pose still, are in `docs/UI_REVIEW.md`. |

| The findings list                                                                                                         | One finding, opened                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ![Findings grouped by file, with the priority and rule filters above them](docs/assets/ui-findings-list.png?v=2026-10-12) | ![The finding card from its head: the file, its tags, the line, the rule, the CWE, the verdict buttons, the quoted line and the fix steps](docs/assets/ui-finding.png?v=2026-10-12)                                                                            |
| Eight findings in seven files, filterable by priority and by the rule that fired.                                         | `auth-service.ts`, line 23, `HARDCODED_SECRET`, CWE-798, the line the rule matched, four steps. On a scanned project the frame carries two lines either side, read out of your own copy of the file; on the demo it is the one line, because nothing was read. |

| The share studio                                                                                                                             | The More menu                                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| ![A finished city image with the caption text and what each platform can take](docs/assets/ui-share-platforms.png?v=2026-10-12)              | ![The preference rows: colour-blind palette, language, the version note, the city link](docs/assets/ui-more-menu.png?v=2026-10-12) |
| Nothing is posted. Each row says what that platform can take from a browser — and LinkedIn says it stays off while no public address is set. | The switches are inside the city too, not only on the entry screen.                                                                |

| In German                                                                                                                                                          | A narrow window                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| ![The same finding card in German, with the remediation steps translated and the scanner's own sentence kept](docs/assets/ui-german-card.png?v=2026-10-12)         | ![The same city in a narrow window](docs/assets/ui-narrow.png?v=2026-10-12)                                        |
| The interface, the categories and the fix recipes are bilingual. The scanner's own message stays in the language it was written in, with the German line under it. | Panels stay inside the viewport; the city stays explorable. A width check in a desktop browser, not a phone claim. |

The interface speaks English and German. The switch sits in the header of the entry screen and in the **More** menu once you are inside a city, and the choice is remembered across visits. What is _not_ translated is the scanner's own sentence and the rule knowledge behind it — those arrive from the adapters, and the panel shows its curated German line underneath rather than pretending the English was the translation.

## Architecture

Full detail in [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md), first run in [`docs/GETTING_STARTED.md`](./docs/GETTING_STARTED.md), UI review notes in [`docs/UI_REVIEW.md`](./docs/UI_REVIEW.md).

```
Ephemora-Skyline/
├── backend/src/
│   ├── server/            # Express app, loopback bind, local-only guard
│   │   └── routes/        # local-analyze, status, job-progress, source, demo,
│   │                      # health, tests, agent (handoff + verify), update-check
│   ├── services/
│   │   ├── analyzer/      # pipeline: enumerate -> parse -> metrics -> aggregate
│   │   └── security/      # scanner facade + adapters (regex, gitleaks, semgrep,
│   │                      # dependency, osv, ruff) + categories, dedup, redact,
│   │                      # rule-packs, scan-config, network-policy
│   ├── models/            # CityData, Finding, FileNode
│   └── utils/             # cityMapper (layout) + SARIF export
├── frontend/src/
│   ├── city/              # layout, palette, types, geometry
│   ├── components/        # 3D scene + HUD (CityScene, Building, ContextCard,
│   │                      # InfoPanel, FindingsPanel, Minimap, SearchBar, ...)
│   ├── config/            # scan profiles, finding categories, rule packs
│   ├── editor/            # deep links into your editor, workspace root
│   ├── findings/          # finding presentation and knowledge
│   ├── hooks/             # useLocalAnalysis, useTestRunner, ...
│   ├── stores/            # Zustand
│   ├── design/            # design tokens and CSS
│   ├── i18n.ts            # the interface strings, EN and DE
│   ├── prefs.ts           # language, graphics-lite, colour-blind mode
│   └── reviews.ts         # triage state, per city
├── docs/                  # ARCHITECTURE, GETTING_STARTED, UI_REVIEW, assets/
├── scripts/               # audit-gate, clone-stats, first-drive, persistenz-drive
└── .github/               # CI, issue and PR templates, dependabot
```

## API (`:4000`)

| Method and path                       | Purpose                                                              |
| ------------------------------------- | -------------------------------------------------------------------- |
| `GET  /api/health`                    | liveness                                                             |
| `GET  /api/demo`                      | the seeded demo city (`demo-001`)                                    |
| `GET  /api/cities/default`            | the default city for a cold start                                    |
| `POST /api/analyze-local`             | analyze a folder picked in the browser (primary path)                |
| `POST /api/analyze-local/:id/cancel`  | stop a running scan and delete its staged copy                       |
| `GET  /api/status/:id`                | progress of a running analysis (polled)                              |
| `GET  /api/result/:id`                | full analysis result as JSON                                         |
| `GET  /api/result/:id/city`           | the city payload the renderer consumes                               |
| `GET  /api/result/:id/sarif`          | SARIF 2.1.0 export of the findings                                   |
| `GET  /api/result/:id/source/:fileId` | the file a finding points at                                         |
| `GET  /api/result/:id/handoff`        | one finding per line, NDJSON, for a coding agent (`docs/AGENTS.md`)  |
| `POST /api/verify`                    | did the findings of one scan survive a later one?                    |
| `GET  /api/result/:id/verdicts`       | the verdicts the person set for that scan's project, read-only       |
| `PUT  /api/result/:id/verdicts`       | the browser's write of that project's verdicts (origin-guarded)      |
| `POST /api/verdicts/reset`            | delete every verdict this machine stored (the entry screen's button) |
| `GET  /api/rule-packs`                | the rule packs on this disk, and whether the offline switch is set   |
| `GET  /api/footprint`                 | the staged copies: how many, how big, how long they stay             |
| `POST /api/footprint/purge`           | delete the copies that are past their keep time                      |
| `POST /api/tests/:id/run`             | run one of that city's own test files                                |
| `GET  /api/tests/run/:runId`          | output of that run                                                   |
| `GET  /api/update/check`              | the anonymous newest-release check                                   |

## Contributing

The gates, commit conventions and PR checklist are in **[CONTRIBUTING.md](./CONTRIBUTING.md)**. Small, reviewable changes land fastest. Interface strings need both an English and a German entry. Anything that changes the 3D render needs a real-GPU screenshot — headless CI cannot judge a WebGL scene. The "Ephemora Skyline" name is not part of what the licence grants — Apache-2.0 gives copyright and patents, not the mark.

## License

**Apache License 2.0** — the full text is in [LICENSE](./LICENSE), attribution and the bundled components' own licences in [NOTICE](./NOTICE). OSI-approved open source since 2026-10-05; before that the project carried the Business Source License, with a scheduled conversion to this same licence that has been pulled forward.

- **What you may do:** read it, run it, change it, ship it, sell work built on it, and host it for anyone — the copyright grant is §2 and the patent grant is §3.
- **What you must do:** keep the licence text and the `NOTICE`, and note where you changed a file (§4). That is the whole price.
- **What is not granted:** the name. §6 withholds trade names and marks, so `Ephemora Skyline` stays the name of this implementation and a fork should pick another.
- **Patent suicide clause:** the patent licence ends for anyone who litigates claiming this work infringes their patents (§3).
- **Warranty and liability:** none, respectively capped at nothing (§7 and §8) — which for a tool that reads your source and can run a folder's test suite is worth reading twice.
- **The local footprint is on the entry screen:** how many copies of picked folders sit in the staging root, how big they are, how long they stay, with a button that deletes the stale ones and one that clears the verdicts. The reset button deletes the browser's verdict buckets **and** the machine copy (`~/.ephemora-skyline/verdicts.json`, env override `CODECITY_VERDICTS_FILE`) — a deleted verdict cannot come back on the next scan. Server-side rules: only directories this program minted, only past their keep time, and only a deletion that actually happened is reported (`GET /api/footprint`, `POST /api/footprint/purge`, `POST /api/verdicts/reset`).
- **Bundled under their own terms:** the UI typeface is JetBrains Mono, **SIL Open Font License 1.1**, taken from `@fontsource` and served by the app itself rather than a font CDN. Its licence text ships with the build (`OFL-JetBrains-Mono.txt`), and a test fails if a bundled font ever travels without one.

Skyline is the piece of this work meant to be read and argued with, not the piece meant to earn.
