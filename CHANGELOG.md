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
