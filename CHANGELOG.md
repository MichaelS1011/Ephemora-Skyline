# Changelog

All notable changes to Ephemora Skyline are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Every line below states what was measured, not what was intended: a number here
came from a run on this machine, with the file and the check that produced it.

## [Unreleased]

The work in the tree since the last commit. Not yet released; the gates below
were run on it as a whole.

### Added

- **A finished folder scan stays live.** With the native folder picker, the scan
  keeps the handle and watches metadata (name, size, mtime) every 3 s — 8 s
  above 5,000 files — debounced by 700 ms. A change sends a complete path+SHA
  manifest plus the bytes of only the changed and new files; the server reuses
  every unchanged analysis by hash, removes the findings of deleted paths and
  folds the delta into the same result. The delta runs **built-in rules only**;
  semgrep, gitleaks, the dependency audit, churn, duplicates and coverage keep
  their answers from the full scan, and the permanent band names that boundary:
  `Live — built-in rules only; external engines from the last full scan`. A
  re-read file's card says the same about itself, and a live city with zero
  findings no longer says `No findings`. **Full scan** in the band re-reads the
  same folder through every engine and starts watching the new result. A file
  that changed without its size or mtime moving is the documented blind spot of
  a metadata watch; the full scan is the way to settle it. Measured on the
  running app against a 31-file fixture: one changed file produced one P0
  (`EVAL_USAGE`) with `live.changed = 1`; deleting one file and adding another
  kept 31 files with `added = 1, removed = 1`; **Full scan** produced a new
  analysis id with `live: null`, the same 31 files and the same P0.
  `backend/tests/live-delta.test.ts`, `frontend/tests/live-watch.test.tsx`
- **Large folders open as a preview instead of refusing.** A folder above the
  full-read walls (10,000 files / 150 MB) is sampled across its top-level
  districts — up to 2,000 files and 60 MB — and the rest is counted, not
  silently dropped. The announcement says `Preview · 2,000 of 12,000 files
read` and names the way to a full read; the header says `2,000 sampled files`
  with the total in its title; the project card adds `Preview sample of
12,000`; a zero-finding preview says `Preview — not every file was read`,
  never `No findings`. Measured on a 12,000-file, 12-district fixture: 2,000
  read, 10,000 left out, 12 districts rendered, no page errors.
  `frontend/tests/preview-sample.test.ts`, `frontend/tests/arrival-budget.test.tsx`
- **One command starts it.** `npm start` builds both workspaces once, starts the
  backend and serves the built app and the API from one address on
  **http://127.0.0.1:4173**, then opens the browser; a checkout no longer needs
  a dev server to be read. The package path shares one stage with the check:
  `npm run package:build` writes `dist-package/` (250 files, 2.98 MB unpacked),
  `npm run pack:check` installs its 0.93 MB tarball into an empty folder and
  starts the installed `ephemora-skyline` bin, and `npx ephemora-skyline`
  becomes the one-liner when the package is published. README and
  GETTING_STARTED lead with `npm start`; `npm run dev` remains the hot-reload
  path for contributors.
- **The finished card hands the tour to a resident.** The city's announcement
  now ends with a resident line — _Your project is a city. Shall I walk you to
  the findings?_ — and one verb, _Show findings_, which starts the existing
  security tour and folds the card. A resident already on the street stops,
  turns to the reader and waves for 3.4 s once per scan; there is no second
  prompt, no spawned actor and no new surface. The arrival card stays inside its
  measured word budget (171 in the fixture); the room came from deleting the
  duplicated "what the shipped rules cannot see" lead, the countdown sentence
  and the long pin label, not from raising the budget.
  `frontend/tests/arrival-budget.test.tsx`, `frontend/tests/epheArtDirection.test.ts`
- **Traffic follows the street instead of the block.** The 24 background cars
  now keep a bumper distance to the car ahead, take a junction in a strict
  near-first order, follow connected street segments through quadratic bends,
  and turn around on a half circle only where the network ends — the old code
  flipped direction in place at every block. The cab stands on the right-hand
  kerb of its own direction, runs to the lane end and turns around there; the
  bus aligns to its projected stop, brakes for anyone on the asphalt and turns
  on a curve. Each vehicle has four wheels, and the roll sign is taken in the
  vehicle's frame, not from its world heading. `frontend/tests/fleetMotion.test.ts`,
  `frontend/tests/transitMotion.test.ts`, `frontend/tests/openCityLife.test.ts`
- **The city answers a call.** `C` (or a click on a resident's body) calls one
  visible foreground resident: it stops, turns to the reader, raises a hand and
  leaves a small card with exactly one verb — _Show me the risk_. The card names
  the highest **open** finding from the existing triage order; the resident turns
  and points at its building, then the existing camera flight opens the file.
  Escape or the close button dismisses the card and puts the resident back on
  the sidewalk. The visitor is found by a screen-space pick with a mesh-only
  visibility ray (the chat sprites are not occluders), and the selection ring is
  a UI mark above the plates (`depthTest: false`), not a second body.
  `frontend/tests/arrival-budget.test.tsx`
- **The city can stand alone.** A frame control in the header, with a named twin
  in the More menu, hides the header, dock, project card, reading panels and the
  height rail; the canvas takes the whole window and escapes through `Esc` or the
  one chip that stays. The measured jump is 1284 → 1600 px on a 1600 px window,
  and the panel state is untouched, so leaving restores the finding that was
  open. `frontend/tests/arrival-budget.test.tsx`

- **Excluded folders field.** The entry screen's scan settings and the in-city
  scan panel now hold the field the file-cap refusal had been pointing at since
  it was written. Names are stored, normalised, capped at fifty, and every file
  they remove is counted. `frontend/tests/scan-excludes.test.tsx`
- **A sixth reason for an unread file.** Files whose shape the scanners do not
  read are counted as `unsupportedFormat` on both the browser and the server
  side of the pipeline, appear as their own row on the scan summary, and are
  added to the one number in the strip. Measured over real folders before the
  change: `docs/` held 17 files, the scan read 0, and the result reported 0
  unread. `backend/tests/drop-formats.test.ts`
- **The map names its alarm count in words.** Alongside the wedge it draws in
  the corner of a critical plot: “▲ 1 of 6 plots carries a critical finding”.
  `frontend/tests/stadt-ui-minimap-carrier.test.tsx`
- **A version-note switch inside the city.** The store has carried
  `toggleUpdateCheck` since it was built; the row was missing, so declining the
  note meant leaving the city.
- **Two Escape rows in the shortcut list** — the share studio and the project
  card each close on one `Esc`, and both files are now inside the registry
  guard that checks a list against the handlers.
- **A demo clip and a refreshed capture set** on the entry surface: 28,5 s of
  playback filmed from the running build (800 × 500, 15 fps, 442 KB, one video
  stream and no audio track), plus eleven frames shot from the same build — the
  ten of README's “The look” and the poster — replacing the set from 2026-10-07.
  Film and visit take the same time: every output frame is the nearest captured
  frame to _i_/15 s, so the only thing the clip does with the wall clock is hold
  a frame where the page painted slowly (mean 0,0035 s, largest 0,1193 s). The
  poster beside the clip link is its own 1280 × 800 frame of the finished city,
  not a frame of the clip, and the README no longer lends the clip's numbers to
  it. Each caption is checked against the pixels it describes:
  the security-mode line now quotes the measured difference between its own two
  frames, split by channel — the dimmed towers and the mode bar's active chip —
  instead of saying “the city darkens”. The pose behind that number is held by a
  control, and the control has two states: with the browser asking for reduced
  motion the same screen, shot again 600 ms later with no input at all, differs
  in 0 of its 1,600,000 pixels; as shipped it differs in 7,263, because the
  street fleet drives and the alarm windows pulse. `docs/UI_REVIEW.md` names both.
- **Every finding the demo shows now carries the line it was raised on.** The
  code frame is the product's answer to “why should I believe this?”, and it was
  invisible exactly where most people meet it first: measured over the shipped
  demo payload, 0 of its 7 findings carried a snippet. The demo already named
  the line each rule matched and threw the string away. It now quotes that line
  with its number, and nothing else — a real scan reads two lines either side
  out of your copy of the file, no file was read here, so the frame stays one
  line deep instead of inventing neighbours. `backend/tests/demo-claims.test.ts`
- **The self-scan number now travels with its list.** README.md:54 claimed 68
  findings and 59 quoted test text for the first scan of this repository, and no
  artefact in the tree or the working folders could reproduce either number. The
  one allowed run over this checkout (default profile, 412 files — everything
  git calls the project, tool folders set aside by the repository's own
  `.gitignore`, no git history) reported 10 findings
  and 1 of them on an `expect(...)` line; its handoff list ships as
  `docs/self-scan-findings.ndjson` and the sentence carries those two numbers.
  The run was repeated on 12 October after a reformat moved two of the list's
  pointers: the guard went red on exactly that, and repeating the run is what
  keeps the file checkable instead of patched.
  `backend/tests/selbst23-two-numbers.test.ts`
- **The browser reads your `.gitignore` before it counts.** The folder picker
  walked every path on disk and then refused the folder for being large, so a
  checkout with its own build output inside it could not be scanned at all:
  measured on this repository on 2026-10-12 with the shipped walk rules,
  **17,360** source-shaped files on disk against
  **392** the project itself calls source. The client now applies the same
  matcher the backend parser uses — mirrored byte for byte between
  `frontend/src/config/gitignore.ts` and `backend/src/services/analyzer/gitignore.ts`,
  with a test on each side that fails if the two bodies stop being identical —
  prunes an ignored directory without listing what is inside it, and counts the
  directory as one. `frontend/tests/local-gitignore.test.tsx`
- **Two more reasons an unread file names itself.** Paths your project sets
  aside arrive as `gitIgnored`, and history that is over the tool's own budget
  arrives as `gitBudget` instead of being reported as “too large”. Both have
  their own row on the scan summary, the churn tail only shows when the scan
  actually read history, and the eight counters are the eight the model declares.
  `backend/tests/fahrt-drop-account.test.ts`, `frontend/tests/fahrt-summary-account.test.tsx`
- **The residents have legs.** Each Ephe was six boxes on a glide; it is now ten
  — a thigh and a shin per leg, knees that bend forward, a head sized against the
  body instead of against the camera, and a contact patch under the feet so the
  figure sits on the pavement rather than floating through it. Trousers carry
  their own three values instead of borrowing the hand's colour.
  `frontend/tests/epheArtDirection.test.ts`
- **The street fleet has a shape, a coat and wheels that turn.** The taxi and the
  bus were the same pair of boxes at two scales; they now have a body, a cabin
  and four wheels each, on a lit material instead of an emissive one, in one of
  five coats that no other surface in the city wears. The cars that drive a lane
  roll theirs with the distance covered — half a turn per half circumference, and
  `frontend/tests/roadFleet.test.ts` measures exactly that — while the taxi at the
  kerb and the bus at its stop keep theirs still, because those two are parked.
- **The compose stack publishes on loopback ports you can move.** Both published
  ports are parameters now, because the fixed pair collided with `npm run dev`
  on the machine that develops the file, and both loopback spellings are in the
  allowed-origin list, because nginx does not forward `Host` and the self-origin
  fallback therefore cannot fire through it.
- **One command installs it.** `npx ephemora-skyline` starts the backend, which
  now serves the built app itself, and opens the address once `/api/health`
  answers. Measured on the packed tarball rather than the checkout: 0,89 MB,
  234 files, installed into an empty folder and asked over HTTP — health, the app
  document, the version the package names. `scripts/pack-check.mjs` is that
  measurement, and it fails on a build that shipped without its frontend.
- **A city can be carried away as a folder.** `POST /api/export` writes the app,
  the city JSON, a one-route server and a start script into
  `~/Downloads/ephemora-<id>`, and the README it writes carries digests read back
  from the files on disk, not from memory of them. The page boots from the
  embedded payload behind an API guard, so nothing on screen asks a server that is
  not there: the summary says _exported city_ instead of _Scan complete_, the
  update check answers "could not check" instead of "up to date", and the test
  runner is struck because the strike and the disable must be the same question.
  `frontend/tests/exported-banner.test.tsx` and `backend/tests/export-identity.test.ts`
- **The comparison asks itself, once, when the city arrives.** A folder shape seen
  before carries the scan it is worth comparing against; the card dates its
  heading by that scan ("Since the scan of 18 Oct") and the three numbers — no
  longer detected, at another line, unchanged — arrive without a click. Measured
  on a second visit to the same folder: 0,2 s to a settled card, and a first visit
  stays silent because there is nothing to compare. `frontend/tests/verify-anchor.test.ts`,
  `frontend/tests/since-on-arrival.test.tsx`
- **A card can ask a model that lives on the same machine.** With
  `EPHEMORA_LLM_URL` set to a loopback OpenAI-compatible server, a finding's
  details offer one sentence about the flagged line. The whitelist of what may
  travel is asserted as a set, not a deny-list, and the address is checked before
  a request exists. Measured against a 9B model on a GB10: 920–1 090 bytes per
  question and 2,3–3,4 s to an answer warm, and 2,8 s through the HTTP route with
  a real scan and the fingerprint the card holds. Two defects came out of that
  measurement and not out of the stub: a 20 s clock that fired on a cold model,
  and a reasoning dump where an answer belonged.
  `backend/tests/llm-explain-guard.test.ts`, `frontend/tests/ask-local-model.test.tsx`,
  `scripts/local-llm-probe.mjs`

### Fixed

- **A folder of only docs and fixtures says so before it uploads.** `README.md`
  and `notes.txt` are staged for the project's own test runner, so the picker
  counted them as a folder to scan; the upload succeeded and the server then
  answered `No analyzable files`, which the screen hid behind `Analysis failed
on the server`. The upload gate now asks the scan's own `isScanCandidate`
  whether any admitted path can become a city. Measured on the running app
  against a two-document folder: no POST, the `no-source` card with the
  supported extensions, `Pick a folder that holds source code`, one **Choose
  another folder** action, no floating count and no `Show the server's words`
  opening on the reader's own drop tally.
  `frontend/tests/picker-file-size-cap.test.ts`
- **A triage verdict says what it decides.** `Reviewed` read as "seen" while
  the queue counted it as finished; the segment now reads **Kein
  Handlungsbedarf** / **No action needed**. The stepper's second number names
  the set it counts — `1 / 8 · 7 offen` instead of `1 / 8 · 7 Funde` — and a
  `role="status"` line announces every step with position, file, line, severity
  and rule class, while a started triage puts keyboard focus on the file name
  once instead of leaving it on `BODY`. Measured on the demo: focus on
  `auth-service.ts`, announcement `Triage 1 von 8 … Zeile 23, Kritisch`, and
  the counter fell from `8 offen` to `7 offen` after the first verdict.
  `frontend/tests/triageAnnounce.test.tsx`,
  `frontend/tests/local-triageVerdicts.test.tsx`
- **The resting scan strip stays in the free stage.** At 1024 the 676 px strip
  was centred over the 400 px file panel — measured 248 × 40 px of overlap, the
  panel's top row behind the glass. With a file or findings panel open the
  strip now starts at the left edge of the free stage, wraps its words, and
  leaves the card it describes uncovered. Below 1200 the crumb chip also stops
  at 344 px, eight pixels before the German mode bar at 352, where the measured
  4 px used to sit behind the control, and the trail scrolls its active file
  segment into view instead of hiding it at the end of a clipped row. The same
  round stops the demo's file
  card from requesting source under an id that has no staged copy: no 404, no
  retry button that can only fail, the existing `sourceUnavailable` sentence
  instead.
  `frontend/src/design/start.css`, `frontend/src/components/InfoPanel.tsx`
- **The city's grammar is on screen where it is read.** The two lines that
  explain height and roof were hidden in the bottom-left legend, and the world
  mast disappears below 1200 px and behind an open panel. The compact grammar
  now sits in the project card exactly when the mast cannot be seen, the legend
  explains again, and district nameplates keep a screen-fixed size instead of
  shrinking to 4–7 px in the overview.
- **The file card leads with the finding.** Findings or the honest verdict now
  come before navigation, SARIF and copy; a finding's line is a button
  (`Zeile 210 öffnen`) that loads the source for any file with findings and
  scrolls to that line, instead of only during triage.
- **The dock says what its doors do, and triage stays one row.** `Triage` /
  `Security tour` / `Findings` carry the visible subtitles decide / fly / filter;
  while triage runs the other doors live in **More**, and the announcement
  folds to its strip when triage, the tour or the list starts. At 1024 the
  labels shorten through matchMedia, not a hidden duplicate in the DOM.
- **Selection is gold; cycles are a base line.** The building selection and its
  ground glow no longer use the alarm red that P0 findings and import cycles
  own; a cycle is a thin line on the plinth instead of a second rotating ring.
- **The build phase no longer prints the result before the city exists.** The
  file count and severity chips appear with `buildPhase === "built"`; Skip is a
  36 px target. The reveal animation itself is unchanged.
- **German copy stops contradicting itself.** The security tour uses `fixDe`;
  a console finding says `Konsolenausgabe — geloggte Werte prüfen; kein
Datenabfluss bewiesen` instead of the hygiene line `Keine Schwachstelle`; and
  the construction note says `Die Ephe ziehen ein` / `The Ephe are moving in`.
  `frontend/tests/ux-wave.test.ts`, `frontend/tests/stadt-ui-verdicts.test.tsx`,
  `frontend/tests/live-watch.test.tsx`

- **A live delta no longer calls itself "Scan complete".** The arrival card
  checked findings before the live state, so a city with one finding still read
  `Scan complete` while semgrep, gitleaks and the dependency audit were from the
  full scan; it now says `Live — built-in rules only · 1 finding` and keeps the
  red findings grade. The live band gained **Pause / Resume** (the snapshot and
  the session survive; changes made while paused are folded in on resume), and
  the breadcrumb trail steps below the band by its measured height instead of
  being covered by it. `frontend/tests/fahrt-summary-account.test.tsx`,
  `frontend/tests/live-watch.test.tsx`

- **The shell asked nothing of a user who asks to be left alone.** Four things a
  disturbance census on the running screen turned up, each fixed with its own
  number.
  · `prefers-reduced-transparency` — the obligation Apple binds to a translucent
  material — reached nothing: the glass was glass for everyone. `globals.css` now
  pins both materials opaque and the frost off under that query, and
  `frontend/src/render/useGlassStage.ts` stands the adaptive sampler off and takes back the
  inline stage it had written, which would otherwise have beaten the sheet.
  Verified in the browser with the request emulated over CDP: header, mode bar and
  dock go `rgb(14, 16, 21)` / `blur: none` with no inline value left; the reading
  plate goes `rgb(18, 18, 16)`.
  · Two controls sat under the shell's own 28 px target floor — measured live at
  91 × 23 px for the strip's “Show again” and 26 × 26 for the card's ✕. Both
  grew; the census now counts 25 visible targets and none under the floor.
  · The world gave no sign that it can be dragged: `cursor: auto` on the canvas,
  so the only hint was the camera moving after the user had already tried. It is
  `grab`, and `grabbing` while held.
  · The beacon on a finding tower breathed forever — 1,3 s, 0,8× to 1,4× scale,
  the only _periodic_ motion in the scene (the fleet and the residents cross and
  are gone). `layout.ts` already says the pulse is evidence, never decoration, so
  the breath now holds for 10 s after the building mounts and settles over 6: the
  marker stays exactly where it was, the movement leaves it. Alarm-shaped pixels
  changing between frames went 9 → 4,5.
  What the census did **not** find is worth saying: nothing in the chrome moves,
  no number ticks (a MutationObserver over six seconds logged zero text writes),
  no CSS animation loops (`document.getAnimations()` reported one, finished), and
  the continuous motion is 19 of 360 grid cells — streets, with mean |Δ| 1,5–3,6
  levels. `frontend/tests/reduced-transparency.test.tsx` and the two new cases in
  `frontend/tests/motion.test.ts` hold all four.
- **Two checks read the machine they ran on, not the code they test.** The first
  CI run of this tree (`gh run view 38265309295`) went red on both while every
  gate was green locally. The repository-address check matched its remote out of
  `.git/config` with a character class that excluded only `/` and `.` — a
  runner writes the URL without its `.git` suffix and follows it with a tab and a
  `fetch =`, so the captured "slug" contained a newline. And the offline Docker
  check assumed it was the only reader of `SEMGREP_DOCKER`, a switch the CI test
  job sets to `0` on purpose; it now names the switch in both of its branches,
  and a second case asserts what a machine that refused Docker as an engine
  source gets: no version probe, no inspect, no container.
- **The city kept 316 px reserved for a panel that was not there.** The canvas
  makes room for the project card because the card is opaque and takes pointer
  events, and `:has()` asks the DOM rather than the render tree — so when an info
  or findings panel opened and hid that card with `display: none`, the strip
  stayed empty. Found by measuring a shipped frame (the picture began at x=316
  with nothing painted in front of it) rather than by looking at it, and pinned
  by a guard that reads every reservation out of the stylesheet.
  `frontend/tests/canvasReserve.test.ts`
- **The history budget reported “too large”.** A `.git` object that fit its own
  size limit and only lost out once the 15 MB budget was spent was counted in the
  same bucket as an oversized file, so the summary told you to make your files
  smaller. It now says which of the two happened.
- **The README named two different git budgets.** The picker sends 15 MB and the
  route accepts 20; the sentence about the picker quoted the route's number.
- **Two surfaces that described a picture they did not paint.** The legend's
  marker for the alarm windows carried the beacon's red while the city painted
  `ENV.windowAlarm`, and its heat-ramp row hardcoded the normal-vision gradient
  while `complexityColor` had long since switched to the colour-saver ramp under
  the preference — so with the switch on, the key named a ramp that was nowhere
  on screen. Both rows are now drawn from the tables that produce the picture,
  and the window row's label follows the branch (en “Blue pulsing windows",
  de “Pulsende blaue Fenster"). `frontend/tests/farbband-legend.test.tsx`
- **A palette switch left the facades red.** Facade textures are cached and
  shared, and the window tones are rasterised _into_ them — but the cache key
  carried only the facade colour, the size, the alarm flag and a seed bucket.
  Turning the switch on repainted the panels and the beacon while every tower
  kept the texture it had already been given, with nothing on screen to say so.
  The tone pair is now part of the key. `frontend/tests/farbband-cache.test.ts`
- **Three non-severity signals stopped wearing the P0 red as a literal.** The
  failing-test wireframe, the passing-test base and the circular-import ring each
  spelled `#ff2e4d` / `#29d398` inline, which made an alarm-colour guard unable
  to tell a finding from a red test; they are named constants in the palette now
  and keep their values.
- **The scan summary's ✕ dismissed nothing.** The button wrote `open = false`,
  while the render decides panel or strip from `collapsed`, so the one control
  that promises “out of my way” had no effect at all — measured in the browser
  as a panel still present 14 s after the click. `frontend/tests/start-firstPath.test.tsx`
- **A dismissed summary no longer comes back by itself.** Its arrival effect
  keyed on the city object, and a language switch hands it a fresh reference for
  the same scan: the node that carried the dismissal was the same node, so this
  was no remount but a re-fired effect re-opening a notice the person had closed.
  Now once per scan id. `frontend/tests/start-firstPath.test.tsx`
- **A refusal that accused the wrong thing.** A write from a page this process was
  not told to serve is refused — the guard protecting the two routes that execute
  code is correct and untouched. What was wrong is that it said _“This request
  came from another website”_ to a second checkout that had only moved to port
  3011, which is what Vite does by itself the moment 3010 is busy, while the
  setting that answers the situation (`FRONTEND_ORIGIN`) lives in the same file.
  Measured before: 1 of 1 such refusals named a security problem that was not
  there. A loopback page that is simply not on the served list now hears which
  page sent it, which pages the process serves and what to set; a genuinely
  foreign origin gets the old sentence, byte for byte. Both branches still answer
  403 and still never reach the route.
  `backend/tests/local-only-origin.test.ts`, `CONTRIBUTING.md`
- **Two token shapes reached the city JSON unmasked.** The value mask carried
  `gh[pousr]_…` for GitHub and `_npmp_…` for npm — the legacy `.npmrc` auth key, not
  the access token. A real `npm_…` token and a fine-grained `github_pat_…` therefore
  survived the one boundary that promises they cannot, behind a variable name that
  gives nothing away (`const pat = "…"`), while README's own table claims GitHub
  shapes are hidden. Both shapes are in the table now; the npm legacy key stays for
  what it actually is. Found by writing a test for the sentence rather than trusting
  it. `backend/tests/beleg-05-frame-and-shapes.test.ts`
- **The build runner no longer reaches for a registry image.** With no semgrep
  binary but a working Docker — which is exactly a GitHub runner — the adapter's
  convenience fallback pulled `semgrep/semgrep` inside tests that wait 30 s: the
  badge would have measured the network. `SEMGREP_DOCKER=0` closes the fallback
  before any probe, set for the test job in `.github/workflows/ci.yml`. Proved both
  ways against a fake `docker` that leaves a mark when asked, because a test that
  only passes where Docker is missing proves nothing about the machine that has it.
  `backend/tests/semgrep-adapter.test.ts`
- **Three public documents said things the code does not do.** `ARCHITECTURE.md`
  drew a `GitHub Repo ──clone──▶` step that no route and no call performs — while
  `GETTING_STARTED.md` states the opposite in as many words —, it listed a
  `renderer/` directory and a `vite-env.d.ts` that are not in the tree, and
  `GETTING_STARTED.md` cited `index.ts:302-307` for a warning that lives a hundred
  lines further down, in the `server.listen` callback. All three corrected, and the
  citation class is now refused by a guard: a public document names a mechanism,
  never a line number. `backend/tests/beleg-07-doc-citations.test.ts`
- **A busy port now says what to do about it.** Starting a second backend on
  `:4000` ended in an unhandled Node event — `Unhandled 'error' event`,
  `code: 'EADDRINUSE'`, a dozen stack lines — as the first thing a contributor
  sees after `npm run dev`, and it reads as a broken install. One fatal line
  names the port, the address, and the three settings that let a second checkout
  run beside the first. Measured live against the occupied port: 1 line, exit 1,
  0 stack traces, and the first backend untouched. `backend/tests/bind-address.test.ts`

### Changed

- **Residents keep their distance.** A pure personal-space step gives every
  walker a **0.9-unit** bubble. A resident ahead or beside pushes it up to
  **0.30 units away from the side it is on** — someone on the right moves the
  walker left, someone on the left moves it right; only an exactly centred pair
  uses the right-hand pass, so a head-on meeting still passes on opposite sides
  instead of stopping nose to nose. A resident behind gets no push; a follower
  is the follower's problem, not a reason for the leader to drift off the kerb.
  A resident standing still, or walking the same way ahead, sets a pace floor
  of **0.25** and is eased behind; a walker coming the other way is passed, not
  queued. The offset is smoothed and applied to the drawing only — `e.x/e.z`
  stay on the sidewalk graph, so the crosswalk, door and construction-site
  contracts are untouched. Reduced motion skips the pass.
  `frontend/tests/ephe-gait.test.ts`
- **The residents walk; they no longer scurry.** At the old 2.3 units/s a
  1.35-unit resident took **4.0 steps a second** — a run everywhere, including
  at a bus stop. The walk is now **1.35 units/s** and **2.4 steps/s**, and the
  foot cycle has a real stance and swing: the stance foot cancels exactly the
  ground the body covers (measured world drift **< 1e-9 units**, against a
  0.571-unit half-cycle the old 0.26-unit foot stroke could not cover), so the
  planted foot holds its spot instead of gliding. The stride opens from
  **0.26 to 0.57 units**; the swing foot lifts **0.055** and the knee leads only
  in the air. The upper body now shifts **0.022 units** over the stance foot,
  the visor leads a corner by up to **0.6 rad** before the shoulders, waiting
  residents glance around, and arm swing varies per figure (0.85–1.15) instead
  of one shared pendulum. `frontend/tests/ephe-gait.test.ts`
- **The first screen holds in one view.** At 1024×768 the landing stayed a
  one-column stack, so the illustration began below the fold and only its top
  edge was visible. The two-column layout now holds down to 960 px: measured
  at 1024×768, the plate ends at 551 px, the footer still sits inside the
  768 px window and the page has no horizontal overflow. The scan profile is a
  44 px hairline row instead of a 54 px bordered field, so it no longer reads
  as a third primary action. The recently-opened rail shares the hero's
  1280 px measure (it started 72 px left of the headline), and its cards are
  320 × 54 px with the action on the card's own axis instead of a third row.
  `frontend/src/design/start.css`, `frontend/src/design/globals.css`
- **The glass reads what is behind it.** Apple's Materials page (updated
  9 September 2025) prescribes the behaviour, not the film: the _regular_ variant
  "blurs and adjusts the luminosity of background content to maintain legibility",
  and the dimming layer is asked for only "if the underlying content is bright".
  A fixed alpha does the opposite of both — it films over the dark towers, where
  nothing needs covering, while the bright plaza is the only thing that forces
  the density at all. `frontend/src/render/backdropLuminance.ts` now measures the picture
  inside each panel's own rectangle (a 12 × 8 downscale of the drawing buffer,
  on a 450 ms timer with a 0,04 hysteresis so a slow camera drift cannot make the
  chrome breathe) and writes the stage on that panel: 0,30 over a shadowed
  facade, where seven tenths of the city passes through, up to the ceiling the
  control inks allow — 0,75, where the split below left it. Measured in the
  running demo at the arrival pose, each bar at its own stage: header 0,75
  (backdrop Y 0,403) · mode bar 0,75 (0,431) · announcement 0,75 (0,223) · dock
  0,75 (0,482) — every one of them sitting at the cap, which is the finding the
  retune below answers. 60,1 fps with the sampler running.
  `frontend/tests/glas-chrome.test.ts` walks the ladder over ten real grounds — sky, plaza,
  floor, field path, kerb, street, plot edge, the darkest facade in the language
  table, the monolith, the unscanned grey — and refuses any rung where a listed
  ink falls under AA over the ground that produced it.
- **The project card is a plate, not a pane.** It carried `rgba(24,24,22,.94)`
  inline and a second, later `rgba(32,49,62,.96) !important` in the sheet — an
  opaque plate over the city, with a blur under it that had nothing to frost.
  Both are gone; it wears the shell's reading material, `--material-read-bg`,
  which is also why the sampler no longer touches it: 245 words of 12 px text do
  not belong on a stage that thins over a bright plaza.
  `frontend/tests/glas-chrome.test.ts` counts it among the surfaces (nine) and fails if a
  second rule draws over it or if the sampler's surface list reaches a reading
  plate.
- **Where the ceiling comes from, measured per ink.** The tint cannot thin to
  0,70 with the shell's old greys: `--meta` (#98948a — the header wordmark,
  the panels, the search field, the heat channels) needs α 0,907 over the plaza,
  `--meta-strong` 0,840, the HEAT caption 0,907, the coach hint 0,842. The step
  was then taken, and scoped: the four control surfaces wear their own ladder
  (#c6c2b9 needs 0,73 over the plaza, 0,74 on the sky; the dock's gold count
  #ffd98a 0,64; the primary #f2efe8 0,59), the reading plates keep the ladder
  their text was measured against, and the old quiet grey would still have asked
  0,89 — which is why it is not on a bar any more. The ceiling is the binding
  ink plus a hundredth, not a round number.

- **One glass, now including the announcement.** The scan card and the line it
  folds into wore their own recipe (`rgba(18,18,16,.94)` and `.90`, `blur(12px)`
  and `blur(10px)`, no sheen, no specular edge) while the header, the panels,
  the dock, the mode bar, the heat bar and the primer all wear the shell's
  measured material. They are the same surface now: `--glass-control-bg` at
  alpha 0,75 over the brightest ground the city can paint, `blur(24px)
saturate(1.4)`, the 0,05 sheen and the lit top edge. `frontend/tests/glas-chrome.test.ts`
  resolves the cascade for both and fails if a rule other than the token wins,
  and the dock's four dead inline declarations — overwritten by the sheet's
  `!important` since October — are gone, so one place paints that bar.
  Measured transmission through the strip, same method on the unchanged dock as
  control: 8,35 % → 8,58 % at a 32 px plate period, dock 2,85 % → 2,85 %.
- **Two materials, because the shell does two different jobs.** Apple's
  Materials page separates them outright: Liquid Glass is the layer of „controls
  and navigation elements … that floats above the content layer", and „Don't use
  Liquid Glass in the content layer"; where a surface carries „a significant
  amount of text" the thicker standard material is what keeps fine features
  legible. The shell had one film for both. Counted on the running screen, the
  split is not a hairline: the dock carries 14 words and 5 controls, the mode bar
  3 and 3 — the file card 245 words, the findings list 189. So `--glass-chrome-bg`
  became `--glass-control-bg` (adaptive, ceiling 0,75) and `--material-read-bg`
  (fixed, 0,94), the sampler's surface list lost the reading plates, and the
  control ink ladder moved onto the bars only.
  Measured A/B against the commit before it, same port pair, same pose, same
  crops, with a grey plate behind the chrome: the light that reaches the eye
  through a bar went **4 % → 21,5 %** on the dock, **11,3 % → 22,4 %** on the
  header, **7,6 % → 22,4 %** on the mode bar, **12,3 % → 21,5 %** on the
  announcement, while the project card moved the other way — from a sampled
  0,89 to a fixed 0,94, deliberately less transparent, because that is where the
  sentences live. The delta was always the trustworthy number — the level a frame
  shows carries each panel's own fills and a sheen that varies across it (≈ +0,04
  in α read off the token) — and the retune below replaced that estimate with an
  instrument: two uniform grounds behind the same bar make the fills and the glint
  cancel, and the response slope returns the stage on its own. Detail does not come back with the
  light: at 8, 16 and 32 px plate period the surviving modulation is ≤ 2 %, at or
  under the panel's own glyph noise, which is what a 24 px frost does to a
  hairline. At 128 px — a block, a tower's width — it rises from 4–7 % to
  10–12 % on the dock, header and strip; the mode bar is excluded, its labels are
  louder than the signal. `frontend/tests/glas-chrome.test.ts` now pairs every surface with
  the one material it may wear and refuses a reading plate that thins below 0,92.
- **A scroll edge over the city was built, measured — and taken out again.**
  Apple's second legibility mechanism („Scroll edge effects further enhance
  legibility by blurring and reducing the opacity of background content") went in
  as two masked bands on the canvas wrapper. The first measurement said it did
  nothing: 0,3 % of a 64 px edge removed where the reader sees it, the same number
  a control region outside any band removed. Two silent causes, both worth
  remembering: the wrapper is `position: static`, so an unlayered absolute
  pseudo-element paints **under** the WebGL canvas — proved by putting a red
  rectangle on the band and watching no pixel change — and a band anchored to the
  frame spends its whole fade behind the bar. With `z-index: 1` and a
  dock-relative anchor it bit, measured against a synthetic 64 px edge so the
  camera could not lie: 29,1 % under the header, 35,6 % above the dock, 0 %
  between them, teeth checked in both directions (no z-index → exactly 0 %, old
  geometry → 5,6 %). An earlier probe had reported a 9,6 % cut that was the
  arrival camera still settling, which is why the measurement waited for two
  byte-identical frames. **Then the operator looked at the screen: no haze
  outside a panel — a picture seen through a veil is a picture you cannot see.**
  The bands are gone and the drive that measured them went with them. What stays
  is the guard, turned around: it fails if a filter, a mask or a painted
  pseudo-element ever lands on `.city-canvas` again, and the legibility the bands
  were meant to buy now has to come from the panels' own tint, which
  `frontend/tests/glas-chrome.test.ts` holds to AA. Inside the surfaces the same idea
  stayed, where it belongs to the surface and not to the world: a scrolling card
  fades its own last 18 px (`.panel-scroll`), paint only, so a line is no longer
  clipped in half.
- **The curve was denser than its own inks, and did not know it.** Held against
  the running app, the adaptive stage wrote one single value in four different
  camera poses — 0,75 everywhere — so the feature was a ceiling with a ramp drawn
  under it. The reason is arithmetic, not the scene: the old curve reached 0,75
  already at Y 0,456, while the measured need of every ink on a bar at that ground
  is 0,675; between the field path and the plaza the glass was up to 0,15 thicker
  than anything required. `RAMP` is now that need column plus two hundredths, on
  fourteen rungs instead of ten. Measured after the change, arrival pose: header
  0,69 · mode bar 0,66 · dock 0,73, and five distinct stages across the four poses
  where before there was one. The stage read back off the screen by response slope
  (see the next line) is 0,693 and 0,729 against those written values.
- **Two cases, two models of the same screen — that is how a half-hundredth under
  AA stays green.** The alarm-word case composited the tint over the ground and
  stopped; the ink-ladder case adds the material's own 5 % sheen on top. Washed
  the same way, the announcement's P0 word reads **4,46:1** on the horizon haze
  (Y 0,798) instead of the 4,50 the suite had been reporting as held. Both cases
  now build one field, and the mixes moved to what that field demands:
  58 % / 38 % / 0 toward white, and 54 % / 60 % / 25 % for the colour-blind set —
  half a hundredth on each, which is the whole size of the error.
- **A stage measured from its response, not its level.** One frame cannot say how
  transparent a bar is: the grey it shows is the tint, the glint and every control
  sitting on it at once. Two uniform grounds behind the same bar (223 and 24) make
  the additive terms cancel, and the slope of the answer is the transmission —
  header 30,7 %, dock 27,1 % after the retune, against 24,1 % and 25,1 % before it,
  with the recovered α landing within 0,003 of the value the sampler wrote. The
  estimator has a stated limit: on the mode bar its modal green is a chip's own
  fill (102 in both frames, a slope of nothing at all), so that bar is judged by
  the ladder case, not by this instrument.
- **The retune's own risk, measured before it was pinned.** A curve that finally
  moves can make the chrome breathe while the camera flies, so it was watched:
  eight idle seconds wrote **no stage at all** on header, mode bar and dock, and a
  ten-second flown sweep wrote **four** changes in total. Two invariants went into
  the ladder case out of that: over the mid-bright grounds the chrome actually
  floats on (Y 0,40 / 0,456 / 0,50 / 0,55) the stage must sit below the ceiling —
  the old curve measured 0,750 at all four — and no 0,05 of luminance may carry
  more than 0,14 of stage, where this curve measures 0,080 and the old one 0,210.
- **An alarm that is a word is lighter than an alarm that is a dot.** On the
  glass over the plaza the shipped P0 red reads **3,88:1**, the colour-blind
  vermilion **3,66:1** and the colour-blind blue **2,73:1** — under the 4,5 a
  12 px sentence needs. `severityTextColor` lifts exactly those three (18 %,
  16 %, 30 % toward white) and only where the tone is spelled as text; the dot,
  the rule and the beacon keep the pure alarm colour, and `tests/
farbsichere-alarme.test.ts` now judges both: the rule must carry the switch's
  signal, the sentence must carry its readable variant, and the switch must
  reach both. `frontend/tests/glas-chrome.test.ts` recomputes all six combinations over the
  four grounds and says which way it would notice a redundant column.

- **The arrival screen stands on five surfaces, not thirteen.** Measured on the
  running build, same folder, same 1440 × 900, same moment after the build:
  **13 → 5** chrome regions, **251 → 189** words, **37,2 % → 25,6 %** of the
  window covered. What stays is the header, the mode switch, the dock, the
  project card and the scan's own announcement; the city map, the colour and
  height key, the heat channels, the first-look primer, the keyboard guide and
  the search field now come back from named rows — the last one from a ⌕ in the
  header, with `/` and Cmd/Ctrl+K still opening it directly. The breadcrumb
  trail appears with the first drill-in, because at the root it repeated the
  project the header already names. `frontend/tests/arrival-budget.test.tsx`
  holds the count, the word budget and the rule that every folded surface is
  reachable by its own name in both languages; `scripts/arrival-ab-shot.mjs`
  frames and counts the same state on any port.
- **The grade census is said once.** Critical / High / Medium stood on the
  header, on the scan announcement and on the project card — three copies of
  the same three numbers, none of them wrong, all of them competing. The
  header keeps them (it is the surface that filters the city when clicked), the
  announcement states the total and what it read, and the card states a grade
  split only inside a district, where the header cannot speak for it. The
  arithmetic claim that rode on the announcement's chips now ties the header's
  chips to the strip's total: `scripts/first-drive.mjs` reads them off the
  filter controls, `scripts/drei-ordner-drive.mjs` fails if the announcement
  names a grade again, and `frontend/tests/fahrt-summary-account.test.tsx`
  proves the silence on a payload that has findings to repeat.
- **The share nudge is gone.** It was the one surface that put itself on the
  screen unasked — once per city, a card in the corner offering to film it. The
  studio it offered is a named row in the dock's own menu, and nothing arrives
  by itself any more: `frontend/tests/arrival-budget.test.tsx` fails if a card
  appears after the arrival without being asked for.
- **The first-look primer is asked for, not scheduled.** It used to raise
  itself once per version out of `localStorage`; the row that opens it is in
  the dock, and Escape still closes it.

- **The folder walls moved from 3.000 files / 40 MB to 10.000 files / 150 MB**
  (2 MB per file, and the request body limit with them at 200 MB), on both sides
  of the pipeline, in the refusal text, and in the document that quotes them.
  The old pair was set before anyone had pointed the picker at a real checkout;
  with the `.gitignore` pruning running in front of the count, this repository is
  392 source-shaped files, and a mid-sized TypeScript service stops arriving as a refusal. The
  two walls are one number on both sides, and a test says so.
  `backend/tests/upload-caps.test.ts`
- **The colour-blind switch reaches the city.** Until now it stopped at the flat
  surfaces: the beacon followed it, the alarm windows, the plot kerb, the
  landmark beam and the threat table did not, because `THREAT_COLOR` was
  assembled inside `palette.ts` from the unswitched table — the one file the
  existing guard excludes. The band is now a function of the preference
  (`alarmWindowColors`, `curbAlarmColor`, `landmarkBeamColor`, `threatColor`),
  and the tones were chosen by measurement rather than by name: the obvious
  choice, the loudest colour-saver alarm tone, was rejected because its derived
  pale lands 6,35 ΔE00 from the git-erosion band, the same defect class the
  switch exists to remove. Measured in the rendered frame on the pixels the
  switch moves: alarm window against a calm window **10,50 → 30,74 ΔE00** worst
  case over the three vision types; plot kerb **10,50 → 28,52**. With the switch
  off the picture is unchanged: **0 pixels** over the city area, and the
  close-up frame is byte-identical (`6ccacddfa160` before and after). The pale
  window tone is no longer a second hand-picked value but the same 0.372 white
  mix the shipped pair implies, which is what keeps the default branch exact.
  `frontend/tests/farbband-palette.test.ts`

- **The dev proxy follows `BACKEND_PORT`.** The backend's port was named twice on
  purpose — a default there, a literal here — so a second checkout ran its own
  backend on another port while its frontend kept talking to the **first** one's.
  Measured with the two commands now printed in `CONTRIBUTING.md`: a backend on
  :4100 and a frontend on :3011 answer each other (health uptime 21 s, not the
  hour-old instance), unset the target is still `127.0.0.1:4000`, and loopback
  stays named by number because `localhost` resolves to `::1` first on this
  platform. A guard test refuses a re-hardcoded port.
  `frontend/tests/dev-proxy-port.test.ts`
- **The city-link message asks instead of reciting.** “about a day or the next
  20 scans” is now built from `GET /api/health`, which answers with the
  `ANALYSIS_MAX_ENTRIES` and `ANALYSIS_TTL_MS` the running process is actually
  using; a server that does not answer is reported as unknown rather than
  defaulted. `frontend/tests/stadt-ui-city-lifetime.test.ts`
- **Colour-blind palette reaches the rest of the alarm surfaces**: the security
  tour card, a district's plate and its strip bars, the scan summary's accent,
  the city map, the code frame and source lines, the churn chip and the test
  block. No file in the source tree reads the unswitched severity palette any
  more — a guard test walks the whole tree to keep it that way, and the shipped
  default colours are unchanged.
- **Every announced count agrees with its noun.** “1 Funde”, “1 Unterbezirke”
  and an English “finding(s)” are gone from the announced text; the singular
  branches that sat in the dictionary uncalled are now called, and a test
  refuses a `…One` key with no caller (38 branches, 0 orphans).
- **The district badge answers in three states, not two.** A plot whose only
  findings are medium is no longer announced as finding-free, and a plot the
  switched-off engines would have covered is named as unproven ground instead of
  green. Measured on the sample city: 9 of 17 districts.
- **The remediation recipes are bilingual.** Nine rule classes, both languages,
  the same number of steps and the same code frame in each.
- **The sample city's findings carry their CWE and category**, derived from the
  same knowledge table a real scan reads from: 7 of 7, where it was 0 of 7.
- **The camera keeps the pose you came back for under reduced motion.** The
  reveal glide is no longer armed for a visit that carries a pose; measured
  before, 3 of 4 reloads lost it, up to 185 units away, because a jump under
  reduced motion is one instant write that no skip could reach.
- **A refused verdict write is stated where the verdict was clicked**, instead
  of leaving a day of triage looking saved.
- **The read budget covers the test runner's poll and the shipped rule-pack
  list** as it already covered the scan's progress. Measured against the running
  server: eight such calls now cost zero slots, where they cost eight.
- **The “recently opened” row reads the index the app writes.** It parsed a
  second key with a field nothing ever wrote, so the row stayed empty while the
  list underneath it filled up.
- **No duration claim without an artifact.** The reference seconds on the profile
  chip and the detail card (“~2s”, “~5s”) are struck: the script that measured
  them lives outside the repository, on a tree days older. What is said instead
  is what needs no stopwatch, and the progress line counts the seconds live.
- **The group strip stands on the kerb the city is presented from.** The row
  faced away from every vantage the app puts a reader at: measured over the demo
  city's 23 bars from the shipped overview camera (azimuth 62°, elevation 39°),
  only 33.4 % of a bar's camera-facing silhouette stayed clear of its own
  district's towers — the height the strip exists to carry could not be read.
  The camera is not the lever: no vantage on the key light's side passes 46 %,
  and the opposite side reaches 97 % only by mirroring the row's documented
  left-is-riskiest reading and leaving both visible facades unlit against a sun
  at azimuth 23°. On the street kerb the silhouette is 100 % clear, the reading
  order holds, and the towers give up 3.9 points of their own (83.8 → 79.9). In
  the rendered frame from one and the same pose (`79.7,155.8,151.8`): 339 → 939
  saturated bar pixels. The podium stone took the corner the row left, because
  its last bar would have stood inside the stone on any plot under 46 units
  wide. `frontend/tests/strip-kerb-side.test.ts`

### Fixed

- **The gate is deterministic again.** “Is semgrep installed” was decided by
  running `semgrep --version` with an eight-second timeout; a cold Python CLI on
  a loaded machine answered in 11–104 s, so three real assertions retired as
  skips and the suite still went out green. Presence is now read off the
  filesystem, and the same rule applies to the gitleaks probe.
- **The staging tests no longer sweep each other's folders.** Four files share
  one staging root and three of them fast-forward the TTL; the sweep honoured
  the injected clock in half of the function and the real clock in the other
  half. Both halves honour it now, and each file gets a root of its own.

## [0.1.0]

Initial public shape of the repository: the local city, the scanner facade with
its four optional external engines, the SARIF and NDJSON exports, the in-city
test runner, the Share Studio, and the Apache-2.0 licence with its `NOTICE`.

[unreleased]: https://github.com/MichaelS1011/Ephemora-Skyline/compare/c2e184a...HEAD
