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

**Your local codebase, rendered as a living 3D city in daylight.** Folders become districts, files become buildings, a taller building holds more tangled code, and a red beacon marks a security finding. Your source never leaves the machine. No account. No login. A desktop web application — phones are not supported and not planned.

|                                                                                                                                                                                                             |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [![The demo city rising: the front-end district mid-build, its blue file towers climbing, the streets and the other districts already standing](docs/assets/demo-city-loop.gif)](docs/assets/demo-city.mp4) | **[Watch the 27-second clip](docs/assets/demo-city.mp4)** — one visit, filmed as it happens: the entry screen, the demo opened, the city assembling, the Security Tour flying finding to finding. No sound, no cuts, no sped-up frames; every pixel is drawn by the app on a laptop. The clip plays 27.2 s at 1600 × 1000 and 30 fps, 2,595 KB, one video stream and no audio track. The picture beside it runs on its own: 7 seconds of that build, 70 frames at 640 × 400 and 10 fps, 3,227 KB, cut from the same visit. |

## Quick start

Requires **Node 20.19+ or 22.12+** (Node 21 is unsupported) and **npm >= 10**. Optional: `gitleaks`, `semgrep`, `osv-scanner` and `ruff` on `PATH` — without them those checks report themselves as skipped instead of pretending to have run.

```bash
git clone https://github.com/MichaelS1011/Ephemora-Skyline.git   # Apache-2.0: a mirror or a fork is permitted
cd Ephemora-Skyline
npm install            # workspaces: frontend + backend
npm start              # build once, then app + API on :4173; opens the browser
```

Open **http://127.0.0.1:4173** and click **Choose project folder** — or **Explore demo** first; that city uses sample files and findings, and no scanner ran on it. While changing the code, `npm run dev` starts Vite on :3010 and the API on :4000. Every screen and switch is walked through in [`docs/GETTING_STARTED.md`](./docs/GETTING_STARTED.md).

### The five gates CI enforces

`.github/workflows/ci.yml` is part of this repository and runs on pushes to `main` and on pull requests against it: lint, the type check, the test suite, the build, the dependency audit. No status badge sits above this line, because no file in this repository can show a run result — the badge that is there names the five checks instead, and you can run them yourself.

```bash
npm run lint           # ESLint, zero warnings
npm run type-check     # tsc --noEmit, both packages
npm run test           # Vitest — 284 test files: 199 frontend, 85 backend (2026-10-26)
npm run build          # production build, both packages
node scripts/audit-gate.mjs   # dependency audit
```

3,254 cases measured 2026-10-26 — 2,360 frontend, 894 backend. The file counts are read out of this tree by a test (`backend/tests/claims-counts.test.ts`), so anyone with the checkout can check them. The audit gate fails on every high or critical finding **except** those accepted in `scripts/audit-gate.mjs` by name, with a reason and a re-check date. On this lockfile `npm audit` reported `0 vulnerabilities` on 2026-10-26, so the gate passes on the fix rather than on an exception — and the one dated exception still in the list (`braces`, GHSA-vfj7-8cjw-p6xm, added 2026-10-04) is then printed as matching no finding, because a waiver nobody can match against a report is exactly the entry that outlives its reason.

## What you see

Most security tooling is a list of findings you scroll. This makes a codebase **spatially legible**, so "where is the risk?" is answered by sight before you read a line — and a number you cannot check is not a measurement, so every channel in the city is a real metric.

| What you see               | What it encodes                                                                   |
| -------------------------- | --------------------------------------------------------------------------------- |
| Building height            | Synthetic complexity: 45% cyclomatic, 30% import-count depth proxy, 25% file size |
| Red beacon, landmark tower | Security findings, weighted by risk                                               |
| Plot and district          | Folder, with its most at-risk files drawn                                         |
| Yellow lasers              | Copy-paste clones between files                                                   |
| Red rings                  | Circular imports                                                                  |
| Blue shield                | Test coverage, when an `lcov` report exists                                       |
| Grey `#6b6a63` "unscanned" | No engine looked here — not a claim of clean                                      |

- **It builds in front of you.** Every visit starts on an unbuilt plot — streets, kerbs and crossings already drawn — and the city assembles while its small inhabitants explain what they are raising.
- **Scale-independent semantic zoom.** One block per top-level folder at the overview, ten folders or ten thousand; click into a block to open it as its own district. What a folder cannot draw shares one podium marker, and the panel says so in numbers — “{drawn} of {files} files here stand as buildings, a folder draws at most {cap}” — never silently dropping a file.
- **Names stay readable all the way out.** A district label used to shrink with distance until it rendered at about two pixels — present in the file, invisible on the screen. Both fitting rules now read one measured number from the layout itself (the smallest real distance between two neighbouring plots), so a name is drawn at the shell's own type step and never paints over its neighbour. What that costs is stated rather than hidden: a long folder name is truncated on the plate, and the full value is carried in the name a screen reader reads out.
- **Security Tour.** The camera flies finding to finding, highest risk first, with a plain-language explanation and a fix suggestion. Press `C` and a resident you call walks you to the highest **open** finding. The same offer arrives on the scan announcement, stands on its strip until you take it or close it, and while it stands a resident in the frame waves.
- **Findings you can verify.** Each carries its file, its line, the matched line with two lines either side read out of your own copy, a link to the rule that fired, and a fingerprint over rule, path, line and the masked line — so a verdict survives the next scan and a coding agent can point at the same finding. One that moves lines gets a new fingerprint, and says so.
- **Orientation that stays out of the picture until you ask.** Four surfaces stand once the arrival notice has folded itself away — plus that notice while it counts down — measured, not styled: `frontend/tests/arrival-budget.test.tsx`. The map, the key, the heat channels and the keyboard guide are named rows in the dock's menu, and the search field opens from `/` or Cmd/Ctrl+K.
- **The edge points at the next decision.** When a finding still needs your verdict and it sits outside what the camera shows, one small pill appears at that screen edge with a word (`left`, `right`, `behind`) and the straight-line distance. Press it and the camera flies there — the same address the sign reads, from one shared function, so a sign and a flight cannot disagree. While the city is under its crane or a tour is walking you, the sign stays quiet: one navigator at a time. Guarded in `frontend/tests/waypoint.test.tsx`.
- **The city can stand alone.** One control hides every instrument and gives the canvas the whole window; `Esc` brings the controls back exactly as they stood. Measured: 1284 px beside the open project card → the full 1600 px.
- **Shareable by choice.** The local Share Studio renders MP4/H.264 1080p video (WebM only where the browser cannot encode MP4) and PNG in three formats. A video opens on the finished city and ends on the same frame, so it loops. The share dialog receives the **file alone** — no suggested caption, no platform row. Names in the media are opt-in; the mark `by Ephemora Skyline` is the one ink that is always burned in. SARIF 2.1.0 carries the scan id and the fingerprints.
- **Colour is never the only carrier.** Severity chips carry a shape and a word, the map marks an alarm plot with a wedge _and_ names the count, an unverified sweep is drawn dashed, and the colour-blind palette reaches every surface that paints a severity. One colour also makes one promise: the gold ring marks where the keyboard is and nothing else — the chosen figure chip wears ink with a soft halo, the escape door in the analysis plate wears the plate's own border, and the elapsed and stage numerals wear the ink ladder of the word beside them. A ring that means both “you are here” and “you picked this” says neither.
- **Nothing leaves the folder count without a number.** Files that never joined a scan are counted by the reason they left — too long a path, refused as unsafe, too large, unreadable, excluded by you, set aside by your own `.gitignore`, past the history budget, or a shape the scanners do not read. The summary line adds them up, so “32 files” and “30 files were not read” arrive together, and the way around the file cap is a field on the entry screen, not a config file: _Excluded folders_ stores them, reads them back and caps the list at fifty.
- **The tower explains itself, and knows when to stop.** A file past 500 lines, 50 branches, or carrying a line past 300 characters gets a note on its own card naming its measured number and what splitting buys; the height rail saturates rather than stretching forever. Those notes are deliberately **not** findings — routed through the scanner, this repository's honest self-scan answered 38 → 122, the lecture burying the queue the city exists for.
- **A state you cannot read is never drawn as an empty one.** This is the difference between a tool that tells you the truth and one that tells you nothing happened. Every stored read answers one of three things — read, absent, unreadable — and bytes that refused to parse are parked under their own key, untouched, so the next save cannot overwrite what you already had. The rule covers the verdict file on disk (while it reads badly no write and no reset touches it), the rule-pack list, the excluded-folders field, the list of cities you opened, stored preferences, the names you gave residents, the saved look of the figure, the verdicts this browser carries, the record of your earlier scans and the scan profile chosen on the chip row. Where the old code answered with an empty state — nothing judged, nobody named, never visited — it now answers _unreadable_, and says so in words: twelve sentences, English and German, each on a surface that already existed. A silently reset colour-blind palette is an accessibility failure nobody announced; “you never named anyone” when the file only failed to parse is the same failure wearing a friendlier face.
- **The city you come back to.** Reload and the district, the selection and the camera are where you left them, including when your system asks for reduced motion.

How the live delta after a save works and where the rail saturates: [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

## What it will not tell you

Worth reading before the feature list means anything to you.

- **A finding is a rule that matched, not an exploit proven.** Every card names the scanner and the line so you can check it. The check is the product; the beacon is only the pointer.
- **There is no accuracy number here, on purpose.** Precision and recall need an annotated corpus this repository does not have, so the only honest scan to show is its own: the default profile over this checkout on 16 October covered 444 files, read **407** of them, and **reported 38 findings, and 1 of them** landed on an `expect(...)` line — a `gitleaks` `aws-access-token` hit on `expect(maskSecretText(...))` in `backend/tests/beleg-05-frame-and-shapes.test.ts`, a fixture id inside the assertion that masks it, not a credential in shipped code. Three further `P0`s sit in `scripts/`: two `EVAL_USAGE` hits on Puppeteer element-evaluation calls and a `stripe-access-token` on a synthetic key template. In `backend/src` and `frontend/src`: none. The list ships as `docs/self-scan-findings.ndjson`, one finding per line with no source text, so the total is a `wc -l`. Where all 38 sit, and what a machine without the four optional engines reports, is in [`docs/LIMITS.md`](./docs/LIMITS.md).
- **It does not run your code.** No execution, no fuzzing, no reachability proof. The one route that does execute something is named on screen: **Run test file** runs _your project's own_ test file, from the copy you picked, only after you press it.
- **The default picture keeps one measured weakness.** The colour-blind switch repaints the alarm band itself — worst case an alarm window and a calm one move from 10,50 to 30,74 ΔE00 apart, and with the switch off 0 pixels change anywhere. What stays open is stated by number: in the default branch that distance is still 6,12 ΔE00 for a deuteranope, and the beacon's shape code exists only in the switched branch. Both redraw every published frame, so they are listed rather than quietly changed.
- **It does not write to your project.** The explanation layer has a voice and no pen; fixes happen in your editor or your coding agent, and a fresh scan shows what moved.
- **A city is not an archive.** Results live in the local process — the last 20, for 24 hours. Export the SARIF or the PNG if a finding has to outlive the process.

## Privacy model

**Nothing listens on a public address.** The backend binds to `127.0.0.1` by default, and the fifteen routes that carry the origin guard refuse a request a foreign web page sent, checked by `Origin` and `Sec-Fetch-Site`. Ten of them can do something beyond answering a question: start a scan, fold a live delta into one, cancel one, run a folder's own tests, purge staged copies, verify a scan against a later one, write a project's verdicts, delete every stored verdict, export a city, ask a model on this machine about one flagged line. The five reads of the local program: the demo, the city-mapped demo, the rule-pack list, the rule-class names, the disk footprint.

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

That table is not decoration: the entry screen renders the same list from the same declaration the backend obeys, and a test fails if the two ever name different hosts. `SKYLINE_OFFLINE=1` switches off the update check even for a reader who turned it on, the OSV and dependency checks, and Semgrep unless a local rule pack is already on disk; it also closes pip-audit, the Docker pull and any `npm ci` the test runner would attempt. With the switch set, nothing above is reached — it is an environment variable, not a UI control yet.

**The limits are numbers, not adjectives.** Local analysis is capped at **10,000 files / 150 MB / 2 MB per file**; a larger folder opens as a preview sample of up to 2,000 files across its top-level districts, with the full count named, and your own `.gitignore` sets paths aside _before_ the cap applies. Over this checkout, the browser reader's own decision — `classifyCandidate`: the `SKIP_DIRS` test, the set-aside, the source-shape rule, your excludes and the path and size walls — counts **594** files the project calls source and admits them to the read, and the scan's own single decision, `isScanCandidate`, then reads **572** of those. Two sets, two names, and only one of them is on the screen; `backend/tests/claims-counts.test.ts` calls those two shipped functions over this tree and fails, printing both numbers, the moment this sentence drifts.

**Telemetry: none.** The only request the app makes for itself is the anonymous release check in the table above, and that switch starts off. The UI typeface ships inside the app, and a test fails if the entry document ever references a third-party host. Maintainers measure adoption through [GitHub's traffic and clone statistics](https://docs.github.com/en/rest/metrics/traffic) (`GH_TOKEN=*** node scripts/clone-stats.mjs`), which count clones without identifying anyone; those endpoints answer only a token with write access to this repository, and they report the last 14 days.

Credential masking, what a staged copy holds, how a fingerprint is minted and how long a result lives: [`docs/PRIVACY.md`](./docs/PRIVACY.md). Reporting a vulnerability in this tool follows [SECURITY.md](./SECURITY.md).

## What it checks

| Profile      | What it does                                                                                                |
| ------------ | ----------------------------------------------------------------------------------------------------------- |
| **Quick**    | Heuristics, secrets and dependency advisories, critical findings only — no AST scan, no OSV, no Python lint |
| **Standard** | Every check: regex heuristics, `gitleaks`, `semgrep`, dependency audit, OSV, `ruff`                         |
| **Deep**     | Standard plus a secret scan of the git history                                                              |
| **Custom**   | The same checks, chosen by you: categories, engines and rule pack                                           |

Findings fall into nine switchable categories — injection and execution, secrets, cryptography, transport and certificates, data exposure, dependencies and supply chain, permissions and destructive actions, code hygiene, and a bucket for rules whose CWE the taxonomy does not know. Your own patterns are supported too: up to 25 regular expressions, each validated against a ReDoS canary before it is ever run. Where the Semgrep rules come from, and why the registry is fetched by you at scan time instead of shipped here: [`docs/SCANNERS.md`](./docs/SCANNERS.md).

## The look

Every frame below was shot from the build in this repository on 2026-10-21, on the sample city the app ships with — the one place where a picture can be honest about what it shows, because nothing of anyone's code is in it.

| Entry screen                                                                                                                                                        | The scan settings                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ![Entry screen: the folder action, the folded scan settings, an annotated sample district and the last city this browser opened](docs/assets/hero.png?v=2026-10-21) | ![The settings open: the scan profiles, the one line that says what the chosen one runs, and the excluded-folders field](docs/assets/ui-entry-settings.png?v=2026-10-21) |
| What the tool is, in one screen, before it has anything of yours.                                                                                                   | One question at a time: how deep to scan, and which folders to leave out — the second is the way around the file cap.                                                    |

| The city, structure mode                                                                                                                        | The city, security mode                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ![The built city with its project panel, the demo notice naming its own counts, and the height axis](docs/assets/ui-workspace.png?v=2026-10-21) | ![Security mode: the towers with no critical or high finding drop in brightness, while the streets, the ground and the labels stay as they were](docs/assets/ui-security.png?v=2026-10-21)                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 74 sample files in six districts, the riskiest file as a landmark tower.                                                                        | Two channels change between these frames, and both are named: the towers with no critical or high finding drop in brightness, and the mode bar's active chip moves. Measured between the two frames with no tolerance and no region mask: 2.49 % of the pixels differ, and on those the median colour sum falls from 403 to 268. The sky, the grass, the header, the project panel and the dock are byte-identical between them; one car on the avenue sits fourteen pixels further along, because the fleet keeps driving while the camera holds. The split by channel, and the control that holds the pose still, are in `docs/UI_REVIEW.md`. |

| The findings list                                                                                                         | One finding, opened                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| ![Findings grouped by file, with the priority and rule filters above them](docs/assets/ui-findings-list.png?v=2026-10-21) | ![The finding card from its head: the file, its tags, the line, the rule, the CWE and the verdict buttons](docs/assets/ui-finding.png?v=2026-10-21) |
| Eight findings in seven files, filterable by priority and by the rule that fired.                                         | `auth-service.ts`, line 23, `HARDCODED_SECRET`, CWE-798, the line the rule matched, four steps.                                                     |

| The share result                                                                                                                                                        | The More menu                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| ![A finished city video: preview, Save, the measured file facts, and the mark the file carries; no caption or platform row](docs/assets/ui-share-file.png?v=2026-10-21) | ![The dock's menu: export, the view switches, and the surfaces that stay out of the picture until asked](docs/assets/ui-more-menu.png?v=2026-10-21) |
| The result is the file and its measured facts. Sharing hands over the video alone; the mark `by Ephemora Skyline` is burned into it.                                    | Export, the view switches and the surfaces the arrival budget keeps out of the picture.                                                             |

| In German                                                                                                                                                  | A narrow window                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| ![The same finding card in German, with the remediation steps translated and the scanner's own sentence kept](docs/assets/ui-german-card.png?v=2026-10-21) | ![The same city in a narrow window](docs/assets/ui-narrow.png?v=2026-10-21) |
| The interface, the categories and the fix recipes are bilingual; the scanner's own message stays in the language it was written in.                        | Panels stay inside the viewport; the city stays explorable.                 |

## Where the rest is documented

| You want                                             | It is in                                               |
| ---------------------------------------------------- | ------------------------------------------------------ |
| every screen, switch and shortcut                    | [`docs/GETTING_STARTED.md`](./docs/GETTING_STARTED.md) |
| module map, render pipeline, live delta, budgets     | [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)       |
| the endpoint reference, with what each one guards    | [`docs/API.md`](./docs/API.md)                         |
| masking, staging, fingerprints, retention            | [`docs/PRIVACY.md`](./docs/PRIVACY.md)                 |
| what the shipped rules cannot see, and the self-scan | [`docs/LIMITS.md`](./docs/LIMITS.md)                   |
| rule packs and their licence                         | [`docs/SCANNERS.md`](./docs/SCANNERS.md)               |
| feeding one finding to a coding agent                | [`docs/AGENTS.md`](./docs/AGENTS.md)                   |
| how each frame above was measured                    | [`docs/UI_REVIEW.md`](./docs/UI_REVIEW.md)             |

## Contributing

Gates, commit conventions and the PR checklist are in **[CONTRIBUTING.md](./CONTRIBUTING.md)**. Small, reviewable changes land fastest. Interface strings need an English and a German entry, and anything that changes the 3D render needs a real-GPU screenshot — headless CI cannot judge a WebGL scene.

## License

**Apache License 2.0** — full text in [LICENSE](./LICENSE), attribution and the bundled components' own licences in [NOTICE](./NOTICE); OSI-approved open source since 2026-10-05, before that the project carried the Business Source License, with a scheduled conversion to this same licence that has been pulled forward.

- **You may** read it, run it, change it, ship it, sell work built on it and host it for anyone — copyright is §2, patents are §3.
- **You must** keep the licence text and the `NOTICE`, and note where you changed a file (§4). That is the whole price.
- **Not granted:** the name — §6 withholds trade names and marks, so `Ephemora Skyline` stays the name of this implementation and a fork should pick another. The patent licence also ends for anyone who litigates claiming this work infringes their patents (§3).
- **No warranty, liability capped at nothing** (§7, §8) — worth reading twice for a tool that reads your source and can run a folder's test suite. The UI typeface is JetBrains Mono under the SIL Open Font License 1.1, served by the app itself rather than a font CDN.

Skyline is the piece of this work meant to be read and argued with, not the piece meant to earn.
