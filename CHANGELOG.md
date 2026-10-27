# Changelog

All notable changes to Ephemora Skyline are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Every line below states what was measured, not what was intended: a number here
came from a run on this machine, with the file and the check that produced it.

## [Unreleased]

- **An aircraft tows the product's own invitation across the sky.** `frontend/src/components/BannerPlane.tsx` flies a racetrack — two straights with the turns outside the readable band — because a towed cloth is read across its flight line, not along it: on a circle half of every lap shows a mirrored address. Four meshes, one 640×128 canvas texture redrawn at most twice (language, then the real font arriving), no instancing, no picking, no new colour: hull and plate are `ENV.arcCasing`, copy is `ENV.plot` at 13,37:1 on its plate and 1,05:1 against the haze without it. Measured on the start screen at 1440×900: the show crosses a 273×119 px band, cloth legible in the crop, and the header still reads 60 fps. Over a built city at the arrival framing it is not visible — that frame has no sky above the rooftops — and it appears as soon as the reader orbits toward the horizon.

- **A promise with no number behind it left the dictionary.** `scan.etaHint` read “usually about {s} s” / “dauert meist {s} s” and no surface ever asked for it: nothing in the payload carries a duration a scan could vouch for, while `frontend/tests/i18nPlural.test.ts` listed it as a plan requirement. It is gone, and `frontend/tests/dict-dead-keys.test.ts` now counts the keys no source file reads — 28 of 1,038 — as a ratchet, so the next orphan fails the guard instead of joining the list.

- **The resident's door hangs on the plate it opens.** The 3D entrance stood on the empty ground below the schematic plate — the caption of a portrait that had been removed. It is the plate's last row now, measured at 1440×900: plate 893,326 343×359, door 965,643 200×28, 5 px under the caption, inside the frame (was 71 px below it). Its glyph was CSS `content` and Chrome folded it into the accessible name — `ariaSnapshot` read "▸See the resident in 3D"; it is a hidden node now and reads "See the resident in 3D". Two guards, each proven red by sabotage before it was restored byte-identical.
- **The ground says it itself, the note is gone.** The start screen's longest line described the empty world behind the page in seventeen words, at the one place where the background cannot be guaranteed: on the delivered frame its ink `#a8a49a` sat at 1.02:1 against a bright road marking, with 5 % of its ground pixels at or below 2.79:1. First beat: 117 → 101 words, 41.7 % → 38.7 % coverage, four surfaces unchanged.
- **The wait is a surface with a clock.** Nine seconds of the first run asked for patience without a name or a number: the build bar had no class, so the first-run census counted 0 surfaces / 0 words / 0.0 % there, and no elapsed figure appeared. It is `.build-bar` now and carries the store's own elapsed seconds. Measured on the real demo run at 1440×900: 1 s = 2 surfaces / 17 words / 8.7 %, 3 s = 2 / 16 / 9.5 %, city standing = 3 / 40 / 23.1 %. The probe was recalibrated first — two of its seventeen selectors named classes that no longer exist.

## [0.2.0] - 2026-10-27

The work in the tree since 0.1.0, released as this version. The gates below were
run on it as a whole, on this machine, and each line names what it measured.

### Added

- **The screen edge points at the next decision.** A finding that still needs a verdict and sits outside what the camera shows is announced by one pill at that edge: a word (`left` / `right` / `behind`), the straight-line distance in city units, and a flight to the same address on press. The sign and the flight read one function (`frontend/src/city/waypoint.ts`) — `flyToVoxel` no longer owns its own copy of the arithmetic — so the two cannot drift apart. It stays silent while the city is under its crane, while the tour walks the reader, when the target is inside the view cone, and when nothing is open anymore. Measured: 15 cases in `frontend/tests/waypoint.test.tsx`, including the field-of-view pin against `App.tsx` (52° in both) and a counter-proof where the side convention is flipped in the shipped module — 5 cases go red, restored byte-identical (sha256 `c7517616…`).

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
  `npm run package:build` writes `dist-package/`; `npm run pack:check` installs
  its tarball into an empty folder, starts the installed `ephemora-skyline` bin
  and prints the exact counts and sizes on every run. `npx ephemora-skyline`
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
- **A demo clip and a refreshed capture set** on the entry surface: 27,2 s of
  playback filmed from the running build (1600 × 1000 and 30 fps, 2.595 KB, one
  video stream and no audio track), plus eleven frames shot from the same build —
  the ten of README's “The look” and the poster — replacing the set from 2026-10-07.
  Film and visit take the same time: every output frame is the nearest captured
  frame to _i_/30 s, so the only thing the clip does with the wall clock is hold
  a frame where the page painted slowly. The poster beside the clip link is its
  own 2400 × 1500 frame of the finished city, not a frame of the clip, and the
  README no longer lends the clip's numbers to
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

- **Silence no longer wears the face of an empty answer.** Three read paths fell back to an empty value on failure, which for a security tool reads as "nothing was found": the mirrored verdict file (`backend/src/server/routes/verdicts.ts`) now answers `503 verdicts_unreadable` and refuses writes and resets while its bytes cannot be read, and a failed read is dropped from the memoized load so the next request tries the disk again instead of caching the failure forever; the rule-pack read (`frontend/src/config/rulePacks.ts`) distinguishes read / absent / unreadable, states the failure in words and no longer hands an empty list to the store — that path had been silently un-listing saved scan packs and rewriting them in `localStorage`; stored preferences park unreadable bytes untouched under their own key instead of replacing them with defaults, because a silently reset colour-blind palette is an accessibility failure that announces itself as nothing. Measured: verdicts `32/32`, packs `16/16` (13 of them red before the fix), prefs `12/12`, and the public-number guards re-walked after each change.

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

- **The README opens on a picture that runs, because a README cannot hold a
  video.** Asked why the clip only appeared as a still, the answer was measured
  on GitHub's own renderer: `<video>` keeps `src`, `muted`, `controls` and
  `width` and strips `autoplay`, `loop`, `playsinline` and `poster`; on the
  README page the element is dropped whole — probed on a branch and read back
  through `GET /repos/…/readme` with `Accept: application/vnd.github.html`, with
  a text marker proving the branch was what rendered, for relative,
  `github.com/…/raw` and `raw.githubusercontent` srcs alike. The hero cell now
  carries a 7-second cut of the same visit as an animated image — 70 frames at
  640 × 400 and 10 fps, 3,227 KB — still linked to the 27.2 s file, so one click
  gives the whole visit. `beleg-04-demo-clip.test.ts` reads those five numbers
  from the README sentence and counts the GIF's frames by walking its blocks; a
  byte search for the Graphic Control marker reported 114 frames in a 70-frame
  file, which is why the walker exists. The poster PNG left with it: its job was
  to tease a video that could not play, and the orphan guard names any asset no
  document links.
- **The resident's offer outlives the card it arrived on.** Measured on the
  running app before this change: the announcement speaks in a resident's voice —
  „Your project is a city. Shall I walk you to the findings?" — for exactly
  **9.0 s**, then folds into its strip and the offer is gone, and one resident
  waves once for **3.4 s** at the arrival pose. A reader who looks up late meets
  neither. Now the folded strip carries the same verb (`frontend/src/components/
ScanSummary.tsx`), so the offer stands as long as the city does, and while it
  stands one resident in the frame waves again every **20 s**
  (`frontend/src/city/residentGreeting.ts`, asked once a second by the crowd).
  Both end on the reader's own answer: taking the verb, calling a resident, or
  closing the card — a refusal is never asked a second time, and a guided flow,
  an open file or a called resident owns the stage in the meantime. Measured
  after: one verb on screen at every sampled instant (card, then strip, never
  two, never zero while open), the strip verb mounts `.security-tour` and drops
  to zero verbs, and the strip's line is **17 words**. `arrival-budget.test.tsx`
  23 → 27 tests, `resident-greeting.test.ts` adds 5. The asking itself is now a
  seam (`frontend/src/hooks/useWaveRhythm.ts`: one timer, asks once a second, waves
  on a yes, gone with the component) and `wave-rhythm.test.tsx` holds it with three
  cases, so what is no longer taken on faith is the beat, not only the rule. Public
  numbers moved with
  the two new source files: the reader's set **516 → 518**, the scanner's
  **495 → 497**, test files **241 → 242** (frontend **157 → 158**).
- **The exported file carries the product mark, and there is no switch for it.**
  The credit left the row of options and became part of the picture: every
  recorded frame and every exported PNG is drawn with `by Ephemora Skyline` and
  the brand dot in the lower-right corner. The mark's type now scales with the
  **short** side (23 px at a 1080-pixel edge), not the height, so a 9:16 take no
  longer carries a 40 px billboard. That corner belongs to the mark, so the names
  band gets the room that is left — smaller type first, then a cut name, never a
  plate underneath the mark. Measured in the running app with names on: 16:9 band
  38 → 1259 px against the mark at 1580 → 1890 (**321 px** clear), 1:1 band
  38 → 709 against 740 → 1050 (**31 px** clear, the band clipped to `infras…`),
  9:16 band 67 → 673 against 740 → 1050 (**67 px** clear). That the mark is in
  the **file**, not only in the canvas, was read back out of a recorded take: a
  4.0 s MP4/H.264 1920 × 1080 with 238 composited frames and 761,616 bytes,
  decoded in the browser at 1 s and near the end, carries **979** and **983** ink
  pixels plus **46** vermilion pixels in the mark's box; the three PNG exports
  carry 1,005 / 1,005 / 970. `frontend/tests/share-anonymity.test.tsx` (18 tests)
  pins the layout claim per format and that the studio now holds exactly **one**
  checkbox — the names switch, which still defaults to off. The result cards say
  what is in the file: "Burned in too, and not switchable: by Ephemora Skyline."
- **The README's pictures now show the README's numbers.** Cropping the header
  out of each shipped frame found the same defect the demo clip had: the city
  shots said **73 files** and **7 findings in 6 files** while the text had said
  **74** and **8** for a week. All nine frames were re-shot from this build
  (1600 × 1000, headless, `--use-angle=metal`, 0 console errors), and three
  captions were wrong against their own picture and fixed: the structure frame
  shows no city map (it is a menu row now), the settings frame shows the profiles
  without claiming five, and the More-menu frame never held a language switch or a
  version note. The security pair now measures **2,49 %** differing pixels and a
  median colour sum of **403 → 268**; its guard had asserted "over 98 %
  identical" as a stand-in for that claim and a closer framing broke it while the
  claim held, so `beleg-06-frame-pixels.test.ts` now checks the five regions the
  sentence names as byte-identical (sky, grass, header, project panel, dock —
  0 differing pixels each) and keeps a 97 % floor. Two more text claims were
  checked against the code and corrected: the arrival budget is **four** surfaces
  plus the notice, not "five surfaces", and the podium does not say "+N more
  files" — it says "{drawn} of {files} files here stand as buildings, a folder
  draws at most {cap}".
- **The README is a first read again.** It carried **7,040 words** — a stranger
  opened the repository and got a 271-line document, with the privacy model, the
  self-scan distribution and the endpoint reference all inline. It is now
  **179 lines / 3,575 words**, of which 1,083 sit in tables: the same facts, with
  the argument moved to the file that holds it. Nothing was deleted on the way —
  `docs/PRIVACY.md` (staging, masking, fingerprints, retention, the one model
  request), `docs/LIMITS.md` (where all 38 self-scan findings sit, the classes no
  rule covers, the colour weakness kept open by number), `docs/SCANNERS.md` (rule
  packs and their licence), `docs/API.md` (the route table) and
  `docs/ARCHITECTURE.md` (source map, live delta, where the rail saturates)
  received it, and all four new files joined `SURFACES`, so the forbidden-wording
  and secrecy guards read them like the README. The 21 places where a test reads
  the README as evidence kept working: **25 line citations were re-pointed** by
  matching each citation's own old sentence against the new tree rather than by
  guessing, 5 of them gained the quote the ratchet asks for, and the walked pair
  moved with the four new documents (**512 → 516** admitted, 495 read). Two
  promises the cut had silently dropped — the summary that adds the numbers up,
  and the excluded-folders field that "caps the list at fifty" — were put back.
  `backend/tests/baum-hygiene.test.ts` also had a real bug found by the move: its
  runtime-path exemption was anchored to the start of the resolved path, so the
  same `~/.ephemora-skyline/verdicts.json` named from `docs/` read as a broken
  pointer.
- **The example clip and its poster show the app that ships.** The README sold
  one visit in words and another in pictures: its text says **74 sample files**
  and **8 findings**, while the clip was filmed on 12 October with **73 / 7**,
  the triage word `Reviewed` — renamed to `No action needed` on 21 October — and
  the chrome before the glass pass, and the poster came from a third UI
  generation on 16 October. Both are re-shot from this build. The clip is
  **817 frames over 27,233 s at 1600 × 1000 and 30 fps, 2.595 KB**, one video
  stream, no audio, `mvhd` rate 1.0 and a single constant delta in its sample
  table; the film takes as long as the visit because every output slot takes the
  screencast frame nearest its own timestamp (a gap repeats a frame, it moves
  none). The poster is its own capture at **2400 × 1500 and 1.413 KB**, taken
  once the resident card has left the DOM — its lifetime is not fixed: gone
  after ~14 s in one run, after ~29 s in the next.
  `backend/tests/beleg-04-demo-clip.test.ts` reads the README sentence and the
  clip's own boxes, so the two cannot drift apart again.
- **A recorded city opens on its result.** The take no longer starts on an empty
  lot: it opens on the **finished city** at a camera fitted to the output
  format, holds **0.7 s**, cuts hard to the empty site, builds, and flies back
  to the same pose — so the platform's loop returns to the frame it started on.
  The fitted subject is the tallest plot plus every plot inside the horizontal
  room that framing distance buys (`distance · tan(fov/2) · aspect`), which is
  why a 16:9 take holds two districts while a 9:16 one fills the frame with the
  tallest; the camera then holds that pose every frame until the take ends, so
  no other director can move it out from under the recording. Measured on the
  running app (demo city, build length, one classifier over old and new files):
  subject pixels in the first 0.3 s went from **0.08 % blue (9:16) / 0.05 %
  (16:9)** to **4.46 % / 2.77 %**, and hook vs last frame differ by only
  **0.24 % / 0.30 %** of pixels above 30 — the cars and pedestrians, not the
  camera. `frontend/tests/share-hero.test.ts`
- **The share result is a file, not a draft.** The studio no longer proposes
  three post captions or four platform rows. A caption written by the tool is
  posted in the user's voice, and a bad one is worse than none; the system
  share dialog now receives the **video file alone** and the card says so.
  The recorder asks for **MP4/H.264 first** (WebM only where the browser cannot
  encode MP4) and writes **1920×1080 / 1080×1080 / 1080×1920** at 30 fps and
  8–10 Mbit/s instead of 720p WebM, so the file can be attached where people
  actually post. The file name wears the container's extension. Measured from
  the running app through the real recorder: 9:16 = 1080×1920, 16:9 =
  1920×1080, both H.264, 30 fps, 4.0 s, 3.7 MB / 3.6 MB, 0 % cut; the card
  carries no caption or platform block.
  `frontend/tests/share-formats.test.ts`, `frontend/tests/share-result.test.tsx`
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

### Changed

- **The import arc is now legible in the daylight it is drawn in.** The static
  file→file arc carried the accent gold at 0.22 opacity with additive blending,
  and a real frame of the demo city measured the pixel it produced against the
  horizon haze at **1.10:1** — the relationship was in the scene and not on the
  screen. It also stood 8.7° of hue from the clone laser and 4.7° from the
  Medium finding, so the one line the reader most needs was the one line the
  palette already said twice. The arc is now a stroked line: a near-black
  casing (`#141a24`) under a core that takes the direction colour the legend
  already teaches — violet leaves, cyan arrives. Paired at the same 134 screen
  locations, the stroke's own boundary went from p50 1.28:1 with 96% of samples
  under the project's 2.5:1 floor to p50 9.35:1 with none under it; arc ink in
  the corridor went 2,043 → 4,700 px. The two tubes per arc cost 0.0 fps: 60.0
  with the arcs up, 60.0 with them down, no frame over 33 ms either way.
  `frontend/tests/import-arcs.test.ts`, `frontend/tests/worldPicture.test.ts`
- **The underground tally on the podium is readable.** Measured on a self-scan of
  this repository, in the district where 19 of 54 files sit under the draw limit:
  the plate carrying that number scaled with camera distance and arrived at
  **3.21 px** of glyph — a disclosure nobody could read. It now renders at its
  declared size, **11.00 px**, exactly `--fs-meta`. `typeFloor.test.ts` had
  carved the 3D-scaled plates out of the type floor and noted their px "are not
  screen pixels"; that exemption is now bounded rather than open — exactly one
  scaled site may remain in the city, it must be the far-zoom district chips, and
  it may not carry a measurement. `frontend/tests/typeFloor.test.ts`
- **The heaviest relationship carries its name.** One arc per selection now
  wears a plate — `importer → imported` and the number of named imports behind
  the edge — chosen by weight and, on equal weight, by file path, so the same
  city labels the same arc on every reload. No edge is dropped to make room:
  all of the selection's real relationships stay drawn, in DEPENDENCIES mode
  too, and the hue there is now the direction's own rather than a second amber.
  `frontend/src/city/importArcs.ts`

- **One demo import relationship is now something the source says.** Every
  other edge in the demo city comes out of `pickTargets` — a seeded generator
  drawing each target uniformly from a pool, with invented symbol names — which
  is a fine picture of a codebase and no claim about one. Two demo files now
  carry real TypeScript (`backend/src/server/routes/demoFixtures.ts`), and their
  structure is derived by `scanFileStructure`, the same pass a user's scan goes
  through: `useScrollPosition.ts` contains
  `import { useDebounced } from "./useDebounce"`, and that is the whole basis of
  the edge. Verified in the running demo as a single violet outgoing arc labelled
  `useScrollPosition.ts → useDebounce.ts · 1 named import` at 12 px, and as
  `line: 0` on the import — the value the analyzer itself records, so the
  fixture is indistinguishable from a scanned file. The pair was chosen on
  engineering grounds before looking at the generator; existing random edges
  like `useMediaQuery → useAuth` were rejected precisely because they would have
  needed a story invented for them. Grounding the two files retired the three
  random edges they had been carrying — `useScrollPosition → useLocalStorage`,
  `useScrollPosition → useFetch` and `useDebounce → SettingsDialog` — none of
  which their source contains, so the demo shipped 139 edges where it shipped 142
  and adds none. Its 74 files, 8 findings and "sample findings · no scan" lead
  are unchanged, and every remaining edge is still illustrative.
  `backend/tests/demo-import-grounding.test.ts`
- **The second grounded edge takes a false "DEAD CODE?" off the file the demo
  teaches with.** `useScrollPosition.ts` wore the dead-code chip for the whole
  round above: it exports, and nothing in the demo imported it — so the one
  building used to show a real relationship also advertised itself as unused.
  `DebugPanel.tsx` now imports it in source: a diagnostics overlay that reports
  where the reader stands is the plain reason for the edge, chosen the same way
  the first pair was — on engineering grounds, before looking at what the
  generator happened to draw. Measured against the same build with this fixture
  withdrawn: edges 139 → 137, dead-code-marked files 12 → 11, and the difference
  is exactly that one file, so no building gained a mark. What withdrawing shows
  is what grounding removed: the generator had drawn `DebugPanel → health.ts`,
  `→ ChatInput.tsx` and `→ metrics-aggregator.ts`, three relations that file's
  text never states, and the test fails if any of them returns. The panel keeps
  its three incoming edges — grounding replaces only a file's own imports — so
  the chip moves nowhere. And because a grounded file must not be free to keep a
  finding that points at a comment, the demo's `CONSOLE_USAGE` line is checked
  against the fixture: `console.log("frame", frameMs);` sits on line 12 in both.
  `backend/tests/demo-import-grounding.test.ts`
- **A grounded file's height comes from its own source.** Each demo file's line
  split was arithmetic over its index in a list — `30 + ((i * 89) % 160)` — so
  appending to `HOOKS` would have moved two fixture files' towers out from under
  the code they carry. A path owned by a fixture now publishes the code lines its
  own text holds (84, 48, 22), and the guard test imports the same
  `fixtureLineCounts()` the product uses instead of keeping its own copy of the
  formula, which is the kind of agreement that only holds until someone edits one
  side. `backend/src/server/routes/demoFixtures.ts`
- **The backend's own tests are now linted.** `backend/package.json` ran
  `eslint src`, so 85 test files passed through no lint at all while the frontend
  ran `eslint .` over everything — and the root config already listed
  `backend/tests/**/*.ts`, so the rules existed and were simply never handed
  their input. The first run found 18 problems: 9 dead imports and bindings, 4
  `any` (one of them the `verify` report, whose real shape is already exported
  as `VerifyReport` and is now used instead of a guess), 2 inline `import()`
  type annotations, and `structuredClone` — a Node global since 17 that the
  config never declared, which is a config gap, not a code one. All 18 fixed.

- **The import label stays where a reader can read it.** The plate was anchored
  to the arc's apex and scaled with camera distance, so in a real project — not
  the demo, whose towers are short — the apex sat above the frame and the one
  sentence naming the two files never arrived: measured at y = −258 at the
  default district camera, and 1.12–10.53 px of glyph across the zoom range.
  The plate is now placed by a rule instead of by the camera: it keeps the
  projected apex as its anchor, is pushed out of any HUD surface it lands on
  along the shortest feasible way out, and holds its type at `--fs-small`
  (12 px) at every distance. When it had to leave its apex it says so with a
  glyph pointing back at it, so a plate beside a neighbour is never read as a
  plate about that neighbour. Measured over 4 camera levels × 5 window sizes on
  a self-scan of this repository: on screen in 15 of 15 testable cells, 12 px in
  all of them, zero overlap with the eight surfaces it keeps clear of. The
  eighth surface — the breadcrumb row — was found in a rendered frame, not in
  the list. `frontend/src/city/labelPlacement.ts`,
  `frontend/tests/label-placement.test.ts`, `frontend/tests/label-hud.test.ts`

- **A file now answers "who imports me".** In the file dossier, **Show potential
  impact** marks every building whose source imports the selected file, and the
  panel names them: `8 files import this one`, each with its path, and the line
  `Static import analysis. Runtime impact not verified.` The relation is the
  city's own directed edge — `from` imports `to` — read in ONE direction only:
  selecting `util.ts` names `auth.ts`, selecting `auth.ts` never names `util.ts`.
  That asymmetry is the whole feature, so it is pinned twice: 12 assertions on a
  hand-built graph (`frontend/tests/blast-radius.test.ts`) and 8 on the dossier
  (`frontend/tests/blast-radius-ui.test.tsx`), including the wrong-way case a
  symmetric graph would pass. Marked with a **cyan square** on the ground —
  square, not round, so it cannot be mistaken for the cycle ring or the gold
  selection ring, and the list says the same thing in words for anyone who reads
  the frame without hue. Files the level does not draw stay in the list and say
  `not drawn here`, with the count spelled out (`4 of 8 stand as a building on
this level`): a display cap is not a missing dependency. Off until asked for,
  switched off again by a new city, and the empty answer carries its own limit —
  an import the resolver could not match leaves no edge, so it is absent here
  rather than absent in the code. Measured on a self-scan of this repository
  (555 files, 400 edges): `backend/src/server/routes/local-analyze.ts` with 8
  importers, 4 drawn; **60.01 fps with the marks off, 60.01 with them on**
  (481 frames in 8.015 s each), 8 extra flat quads on the plaza. The most
  imported file here, `backend/src/models/index.ts` (39 importers), draws 0 of
  them — the same district boundary that hides 345 of this repository's 400
  import arcs, now measured on the impact layer too.
  `frontend/src/city/blastRadius.ts`, `frontend/src/components/BlastRadiusBlock.tsx`
- **One resident is now the Explorer, and it walks you somewhere real.** In the
  file dossier, next to the impact list, a connected file can be answered by
  **Ask Ephe to guide me**: the Explorer turns, walks the sidewalk graph to that
  building's frontage, stops, faces it and points — the gesture the crowd has
  always had — and only then does the panel speak, with the one sentence the edge
  supports: `useScrollPosition.ts imports useDebounce.ts. A change to useDebounce
ts may require reviewing useScrollPosition.ts.` No edge, no offer; a neighbour
  this zoom does not draw stays named with `this level does not draw them as
buildings` instead of getting a walk. The role is a job, not a costume: the
  Explorer is one figure, chosen by the same index arithmetic as the crowd's
  colours, excluded from the build crew and from taxi and bus duty so it cannot
  be called away mid-errand, and marked by a small shape-only badge (a word
  beside a 20 px resident is bigger than the resident). It ends on a second
  click, on Escape, on a new selection and with the city. Reduced motion does not
  get a walk it cannot watch — the camera goes through the existing door instead,
  and the sentence still comes from the edge. Measured on the running demo:
  **60.0 fps with the guide active**, 19 new assertions (10 on the role rules and
  the claim, 9 on the dossier), and one defect found by looking rather than by
  testing — the first frames aimed at the building's centre, so the guide arrived
  inside the tower it was explaining; it now aims at the frontage.
  `frontend/src/city/epheRoles.ts`, `frontend/src/components/GuideAction.tsx`
- **The security tour now has somebody walking it.** A second resident carries a
  ⛨ badge: when the reader starts the tour, that figure is sent to the current
  stop's building frontage and points at it — and when the tour moves, it follows.
  Nothing else changed hands. The tour keeps its own panel, its order, its
  keyboard (`← → navigate · Enter next · Esc`), and its Escape abort; the resident
  adds a body in the scene, not a second voice, so no sentence is spoken twice.
  The errand is created only where the payload carries a finding on a file this
  level draws — a stop with nothing to report sends nobody, and a stop summarised
  into the podium is not pointed at from across the plaza. Ending the tour clears
  the resident's task but never the reader's own Explorer errand, and the tour's
  per-step selection change does not cancel a guide the reader started by hand.
  Measured on the running demo: badge appears with step 1 of 7 and is gone after
  Escape, the tour panel reads the same at both moments, **60.02 fps** with the
  tour active, 9 new assertions (two figures never carry two jobs on one body;
  the claim names the worst finding's rule, line and scanner, and says
  `built-in` when no scanner reported it). `frontend/tests/ephe-guide-ui.test.tsx`

- **A resident now has an address, not just a seat number.** Clicking a figure
  (or pressing `C`) used to hand the app an array index into a crowd that is
  rebuilt every time the reader changes level — so nothing could remember which
  resident it was. `frontend/src/city/epheIdentity.ts` states the rule instead: a figure is a
  citizen of the plot it belongs to, named by the payload's own file id
  (`fileIdForPath` mints it from the path, so re-scanning the same folder gives
  the same address), plus which of that door's residents it is. The card shows
  it as one readable line — `Lives at · security-scanner.ts` — and stays silent
  where the level draws no plot: on the overview a district is a block, and a
  block is nobody's home. No new mesh, no new draw call, no stored bytes: this
  is the Grundbuch the name, the role and a later model binding hang on
  (EPHE-AI EA-01). Measured: 9 assertions on the rule and the plan chain
  (two independently built instances of one city give the same addresses; a
  different tree gives different ones; an off-level figure is reported as
  off-level), 2 on the card, `854 + 1585` tests green, fps gate unchanged.
  `frontend/src/city/epheIdentity.ts`, `frontend/tests/ephe-identity.test.ts`
- **The resident card stopped being only a pointer.** Clicking a figure (or
  pressing `C`) already gave the reader one verb — `Show me the risk`. It now
  also says who was called and lets the reader claim it: **`Lives at ·
security-scanner.ts`** (the address from EA-01, named after the file rather
  than the raw id), **`Role · no role · Task · nothing to do`** — the role the
  crowd actually assigned and the errand this figure is on, not a second
  figure's — and **`Make this Ephe yours`**, a name field that commits as it is
  typed. A name belongs to the resident, not to the selection: naming one and
  calling another shows the second one unnamed, measured in the running app when
  `C` happened to reach a different body. The card still holds exactly one
  button — a name is not a competing action — and typing in the field cannot
  call a third resident, because the field is inside the app's existing
  not-while-typing guard. Nothing is stored yet: the name lives in this session,
  keyed by the address, which is the key EA-03 persists.
  `frontend/src/components/ResidentCard.tsx`, `frontend/src/stores/useStore.ts`
- **A named resident stays yours, and answers when you call.** The name a reader
  types is written to one localStorage bucket per project — the same
  `bucketKeyFor` the verdicts use, no account, nothing sent anywhere. Only an
  address that names a plot is durable: `plot:<file id>#<seat>` comes from the
  path, so the same folder re-scanned gives the same address, while
  `street:<n>` is a crowd number of one level and is deliberately not stored
  (waking a stranger under the right name is worse than losing the name).
  Emptying the field deletes the record; the map is capped at 200 names; a write
  the browser refuses is said out loud on the card instead of leaving the
  promise standing. Two rules came out of measuring this in the running app:
  a claimed resident is **not available to the city's own job picks** — the
  build crew, a taxi, a bus stop and a doorway now all decline it, through one
  `onDuty` helper the four picks share — and **it answers `C` before the nearest
  stranger does**. The second was earned: after a reload, fourteen presses had
  never reached the resident called Atlas, because the caller picks the closest
  visible body and that choice is deterministic per camera pose. Measured after
  the fix, in one browser across a reload: the record survives
  (`{"plot:f-4c089df7a5ce#0":"Atlas"}`), `C` reaches it, and the card reads
  `Atlas · Lives at · security-scanner.ts`. **60,1 fps** with the crowd rule
  changed, 11 storage assertions, 2 availability assertions, 1 card assertion,
  854 + 1604 tests green.
  `frontend/src/epheNames.ts`, `frontend/tests/ephe-names.test.ts`
- **The names bucket is disclosed and deletable, and the call rule is a tested
  function.** An audit of the three steps above found the storage promise had a
  hole: `docs/PRIVACY.md` said triage verdicts were **the** exception to
  "nothing is written", the entry screen's footprint block counted only the
  verdict buckets, and its reset button removed only `codecity-reviews:` —
  resident names were kept on the machine without being named anywhere and
  without a way back. The block now counts them out of the buckets themselves,
  says the number, and offers **Delete the resident names saved in this
  browser** (disabled when there is nothing to delete, clearing the screen's
  copy in the same act). Two more from the same pass: the choice of _which_
  resident answers `C` moved out of the frame loop into `pickCallable`, so the
  claim-before-distance rule is testable rather than only measured, and a name
  is normalised in one place, so what the card shows is what the next reload
  will read. `docs/PRIVACY.md` names both exceptions. The audit also refuted one
  of its own hypotheses — file ids were already pinned as path-shaped and
  order-invariant by `backend/tests/finding-identity.test.ts`; the equation
  `id === fileIdForPath(path)` is now pinned too. **855 + 1610 tests green,
  60,0 fps.**
  `frontend/src/components/Landing.tsx`, `frontend/src/city/epheRoles.ts`
- **A third resident answers for one number.** The dossier already prints
  `cx 22`; a ⚒ resident now explains what that figure counts and what it does to
  the building in front of the reader — **Ask Ephe about this complexity** walks
  it to the selected file's own frontage, and on arrival the panel says
  `cx 22 in auth-service.ts: 21 decision points, counted one per branch, loop,
case, catch or short-circuit. It carries 25 % of the complexity value the
height is built from, and its full share at cx 40.` One metric, deliberately:
  the decision count is that metric's own definition (1 + one per decision
  point) and the share is the weight table times the same `cyclomaticFactor` the
  renderer uses, so both numbers are the mapping's, not a copy of it — and the
  line closes with `Height comes from three metrics. This one answers for
complexity alone.` No refactoring verdict is offered, because the payload
  carries none. The offer is absent where the number is not a measurement: a
  data file carries `cx` 1 by construction, and a branch-free file has nothing
  worth crossing a level for. Two defects found by looking at the running app
  rather than by testing: the sentence landed below the dossier's fold, so it now
  scrolls itself into view (`auto` under Reduced Motion, where the reader also
  gets the sentence without a walk at all), and a resident that had just stepped
  into a doorway refused the errand, so the three role figures now stay on the
  street the way they already stay out of a taxi and off a build site. Measured
  on the built demo: **60.03 fps** during the walk, the standing gate at
  **60.0 fps** with all three roles in the crowd, 24 role assertions and 10
  dossier assertions, badge present while the errand lives and gone after
  Escape, 0 page errors.
  `frontend/src/city/epheRoles.ts`, `frontend/src/components/MaintenanceAction.tsx`

- **The demo says its folders are invented, not only its findings.** The city
  carries a `mobile/` district — `AppShell.native`, `CameraScanner`,
  `PushHandler`, `OfflineCache` — while the entry document has said since 10.10
  that phones are not supported and not planned. The permanent disclaimer read
  `Sample findings · no scan`, which covers the numbers and nothing else, so a
  visitor could read a platform claim out of a synthetic tree. The demo's own
  line in the city guide now names the project as written for the demo: its
  folders, files and findings. `frontend/src/components/learningCopy.ts`
- **The node badge is now checked against the CI matrix.** The badge and
  `engines` stated two floors — 20.19 and 22.12 — while the test job ran a
  single `node-version: 20`, so nothing in the tree could notice the promise and
  the proof drifting apart. The test job now runs a matrix of **20.19.0,
  22.12.0 and 24**, and `claims-surface.test.ts` reads that list: every version
  named in `engines` has to appear in a CI job, and so does the floor the badge
  prints. Verified by shrinking the matrix to one entry — the guard fails with
  `engines promises node 22.12.0, which no CI job runs`.
- **The resident's head holds the project's own contrast floor on asphalt.**
  The hair family sat at 2.36:1 against the road while `worldPicture` and
  `hudLegibility` demand 2.5:1 of every other edge in the world — and the guard
  read `toBeGreaterThanOrEqual(2.3)`, written to the measurement rather than to
  the rule. The four tones moved to L 0.0149…0.0191, which is **≥2.73:1 on
  asphalt** with every other edge improving with it (plaza ≥10.9:1, kerb 5.78:1,
  zebra 7.32:1, skin 11.54:1), because the plaza and the road are a fixed 4.007
  ratio points apart: darkening the head raises both edges at once. The family
  is no less varied than before — pairwise ΔE00 2.2…7.6 against 1.6…7.1. The
  floor in the test is now 2.5. `frontend/src/city/palette.ts`,
  `frontend/tests/ephe-readability.test.ts`

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
