# UI review — 1 October 2026

The app was started locally at http://localhost:3010 with its backend on port 4000. The review focused on onboarding, readable controls, keyboard access, and small-screen layouts. Brand colors and the existing 3D renderer are preserved.

## Changes

- A clearer project entry screen with a schematic explaining how code maps to buildings, a visible demo action, and optional scan settings.
- A consistent workspace header with an accessible project switcher, project identity and severity filters. Demo projects are identified correctly.
- Larger interface text and controls; a smaller primary toolbar with secondary actions in a keyboard-accessible More menu.
- Readable findings, synchronized severity filters, recoverable collapsed project overview, and a concise navigation guide.
- Panels stay within the viewport at narrow widths. Opening Findings returns from a selected file; search results and the More menu appear above file details.
- Native Tab navigation, arrow-key building selection, accessible search selection, dialog focus handling and predictable Escape priority.
- Demo loading failures, clipboard failures and PNG failures have visible feedback.

## Verification

- `npm run lint`: passed.
- `npm run type-check`: passed.
- `npm run test`: 686 passed (363 frontend, 323 backend) in 80 files. DOM interaction tests cover search and workspace controls. Re-measured on 4 October; the review itself ran on 1 October.
- `npm run build`: passed.
- `git diff --check`: passed.
- Browser checks: desktop 1440 × 900, narrow window 390 × 844, narrow landing 320 × 740; no horizontal document overflow observed. These are width checks in a desktop browser, not a phone claim: Ephemora Skyline is a local web application and is not intended for phones.
- Interactions: demo loading, scan-profile dialog, nested-dialog Escape, project switcher, search selection with Enter, findings/detail switching, More menu, security tour next/exit, and Tab leaving the focused city canvas.
- Actual local API smoke test: two generated source files analyzed successfully, completed result retrieved, and its city permalink loaded in the browser. The city showed the correct two-file count and local-project identity.

## Limits

The native directory picker did not produce an automatable file-chooser event in the in-app browser. Its file-selection step was not completed automatically; the analysis pipeline was verified independently using the local API and generated fixtures. This is not an end-to-end assertion for the OS picker.

The browser already reports a Three.js Clock deprecation warning; the rendering dependency was not changed. No new browser errors were observed after correcting a conflicting border style during the review. Export and clipboard error handling are covered by DOM tests; successful native downloads and external editor launches were not exercised.

## Screenshots

- [Project entry](assets/ui-landing.png)
- [Desktop workspace](assets/ui-workspace.png)
- [Narrow-window findings](assets/ui-narrow.png)

## Second pass — 9/10 October 2026

The same questions, asked of the tree as it stands now, with the frames re-shot
from it. The numbers below are from runs on this machine; the counts in the
section above are from 4 October and are kept as the record of that pass.

- `npm run lint`, `npm run type-check`: passed, both packages, zero warnings.
- `npm run test`: **1,542 passed in 169 files** (933 frontend in 96 files, 609
  backend in 73 files), **no test skipped**, three consecutive runs ending 0.
- Gates were additionally run on a fresh copy of the tree without `.git` and
  without `node_modules`: `npm ci` succeeded and the same three gates passed
  there.
- Browser checks on the running build: desktop 1600 × 1000 (1600 × 1250 where a
  page is taller than the screen) and a narrow window at 390 × 844, driven
  through the visible controls — entry screen, scan settings, demo city, security
  mode, findings list, finding card, share studio, More menu, language switch.
  No phone claim: this is a desktop web application.
- What the new frames show that the October set did not: the _Excluded folders_
  field beside the profile choice, the map's own alarm count in words, the
  platform rows with what each of them can take (and LinkedIn stating it stays
  off), the version-note switch inside the city, the quoted line on the finding
  card, the finding card in German with its remediation steps translated, and
  the “recently opened” row filled.

### Every caption was checked against its own pixels

The set came out of the first pass with three captions the frames did not
support, found by measuring the pictures rather than by looking at them:

- “Security mode: the city darkens” — the buildings drop, and one control moves
  with them. Between the two frames shipped until 21 October 1.33 % of the 1,600,000 pixels differ
  with no tolerance and no region mask: 17,293 of them are city pixels going
  darker (median colour sum 384 → 235) and 4,842 sit inside the mode bar's
  284 × 28 px chip field, where the highlight moves from Structure to Security
  (2,484 of those brighter, 2,358 darker). The median over all differing pixels
  goes 366 → 250. Streets, kerbs, trees, sky and nameplates are pixel-identical.
  Two notes on re-measuring this pair: the field was named 166 × 28 px before,
  which cannot hold the 4,794 differing pixels that paragraph counted, so the
  box is now the one the three chips actually occupy; and “the same screen shot
  again 600 ms later differs in 0 pixels” is only true where nothing moves —
  measured with the browser asking for reduced motion it is 0 of 1,600,000, as
  shipped it is 7,263 (0,454 %), because the street fleet drives and the alarm
  windows pulse. The caption names both channels; this names both states.
- The poster beside the clip link is its own frame, not a frame of the clip:
  1280 × 800 and 364 KB, shot after the visit had returned to the overview,
  while the clip ends on a close-up. The README therefore gives the poster no
  clip numbers and the clip no poster numbers.
- “The finding card: … the code frame” — the demo city had none. 0 of its 7
  findings carried a snippet; the card was scrolled past its own head as well.
  Both fixed, and the frame was re-shot from the head.
- Two frames showed the same screen (the entry page with its settings open twice)
  and one of them was a byte-identical duplicate of the other, 727 KB of it. The
  hero was re-shot with the settings folded, and the 1 October frame that the
  duplicate had overwritten was restored out of the commit it belonged to, so
  the pass above still shows its own evidence.

The capture scripts were themselves the source of two of the failures: a loose
label match clicked _Security tour_ where _SECURITY_ was meant, and a text
selector looked for a string that only ever exists as an `aria-label`. The
frames now come from one sitting, on the build that ships them, with a
visibility check before each one.

### The first drive, on a machine that had never seen the app

A copy of exactly the files the pending commit carries (375 files, 11 MB),
`npm install` from empty, then the app's own **Choose project folder** against a
project it had never read: 11 paths on disk → **9 files analysed, 3 findings
(2 critical, 1 high), 2 files “in a format the scanners do not read”** — the
arithmetic closes on a stranger's folder, not only on fixtures. **0 requests**
left the machine for the whole visit. A real external engine contributed one of
the three findings (`gitleaks`, rule `stripe-access-token`), and its secret value
reached the screen masked while the two lines beside it stayed readable.

Two of its findings were about setup rather than screens, and both are fixed in
this tree: a refused write from a page the process was not told to serve said
_“came from another website”_ when the real cause was a moved port, and a second
backend on a busy port died as a Node stack trace. A third — the dev proxy
hardcoding the backend's port, so a second frontend silently drove the _first_
checkout's backend — is fixed too, with the working two-command recipe in
`CONTRIBUTING.md`.

The limit stands where it did on 1 October: the native directory dialog cannot
be answered from an automation. This drive went through the app's own fallback
input, which is the path a browser without the File System Access API takes.

### Screens

- [Entry screen](assets/hero.png) · [scan settings open](assets/ui-entry-settings.png)
- [City, structure mode](assets/ui-workspace.png) · [security mode](assets/ui-security.png)
- [Findings list](assets/ui-findings-list.png) · [one finding](assets/ui-finding.png)
- [Share studio with the platform rows](assets/ui-share-platforms.png) · [More menu](assets/ui-more-menu.png)
- [The same card in German](assets/ui-german-card.png) · [narrow window](assets/ui-narrow.png)
- [27-second clip of one visit](assets/demo-city.mp4) — 1600 × 1000, 30 fps, one video stream, no audio track; re-shot 21 October, see the last section
- [Seven-second build loop](assets/demo-city-loop.gif) — 640 × 400, 10 fps, 70 frames, 3,227 KB; the picture the README opens on, because a README cannot carry a video

### The alarm band inside the city — 11 October 2026

The colour-blind switch had stopped at the flat surfaces. Two reasons, and both
were structural rather than a missed file: `THREAT_COLOR` is assembled inside
`palette.ts` from the unswitched severity table, and `palette.ts` is the one file
the guard that walks the tree excludes; and the guard's pattern matched _reads_
of that table, so a JSX attribute like `emissive="#ff2e4d"` could not be seen by
construction. Measured before the change: eleven alarm values sat as literals in
the components that paint the city.

What the switch now does, read off the pixels it moves rather than off the
source:

| surface                                        | worst case over the three vision types, against its calm neighbour |
| ---------------------------------------------- | ------------------------------------------------------------------ |
| pulsing alarm window                           | 10,50 → **30,74** ΔE00                                             |
| second alarm tower's window                    | 10,50 → **32,50** ΔE00                                             |
| plot kerb of a critical district               | 10,50 → **28,52** ΔE00                                             |
| dim window row of the same facade              | 33,08 → **46,35** ΔE00                                             |
| rooftop beacon (control — it already switched) | 39,37 → 39,37                                                      |

With the switch **off**, the city is the picture it was: 0 pixels differ over the
whole frame area at Δ>30, and the drilled-in close-up hashes identically
(`6ccacddfa160`). The one difference found in the mid-distance frame was 1.812
pixels inside a district label, all of them on glyph edges — the fractional CSS
transform of a DOM label over the canvas, not a colour. Kerb, plaza and city
centre measured ΔE76 0,00 there.

Two findings the guard produced on the way, neither of which was in the brief:
the legend's heat-ramp row hardcoded the normal-vision gradient, so under the
switch it named a ramp that was no longer painted; and the facade texture cache
key did not carry the window tones, so switching repainted panels and beacon
while every tower kept the texture it already had.

Left open, by decision and with its number: the default branch still paints a
pale alarm window 6,12 ΔE00 from a calm one, and the beacon's shape code — the
only carrier in the picture that does not need colour at all — exists only in the
switched branch. Closing either redraws every published frame in this file.

## Third pass — 12 October 2026: the world changed, so the frames had to

The inhabitants and the street fleet were redrawn (legs that bend, a contact patch
under each figure, a car shape with its own proportions, five coats, wheels that
roll), so every frame of the city in this file and in README.md was re-shot from
the build that ships it: the ten frames of "The look", the poster, and the clip.
Each one was opened through the app's own controls — no injected state — and each
capture is preceded by a check that the page is visible and its canvas has a box.
`ui-landing.png` is deliberately **not** among them: it is the 1 October frame the
first pass above cites, restored out of the commit it belonged to, and replacing
it would trade a record for a picture of today.

The five gates were run on the tree that carries them: lint and the type check
over both packages with zero warnings, **192 test files and 1,717 cases** (660
backend, 1,057 frontend) in three consecutive full runs, each ending with exit 0
and no test skipped, the production build for both packages, and the audit gate
with its one accepted advisory named in the gate itself. The same four jobs ran
on GitHub Actions for the pushed head (run `38266378931`), where five backend
cases skip — three in `rule-packs.test.ts` and two in `gitleaks-paths.test.ts`,
because the runner has neither `ruff` nor `gitleaks` — which is the answer the
README says an absent engine gets.

### The clip ran faster than the visit it filmed

The capture is a stream of frames Chrome pushes when it paints. The old recipe
kept every fourth of them and then declared 15 fps, which is only the truth while
the page paints at 60. Read off the manifest of the take that shipped: **383
frames kept over 26,83 s of visit**, played back at 15 fps — **25,53 s of film
for 26,83 s of visit, 4,8 % fast.** "No sped-up frames" was a claim about intent
rather than about the file.

The new take selects each output frame by timestamp (the nearest captured frame
to _i_/15 s), so the film takes the time the visit took:

|           | captured                                      | film                            | offset to the target clock      |
| --------- | --------------------------------------------- | ------------------------------- | ------------------------------- |
| this take | 1.691 frames over 28,565 s (59,2 fps painted) | 428 frames = 28,533 s at 15 fps | mean 0,0035 s, largest 0,1193 s |

The largest offset is the one honest cost of the method: where the page painted
slower than the target rate — the moment the city assembles — a frame is held for
up to 0,1193 s. Nothing is re-timed, and nothing is dropped forward. The file is
800 × 500, 442 KB, one video track, no audio track; the README's clip sentence
states those numbers and `backend/tests/beleg-04-demo-clip.test.ts` now reads
them out of that sentence instead of repeating them, so the document and the
bytes cannot drift.
The poster beside it is 1280 × 800 and 364 KB.

_These are the numbers of the 12 October take. Both files were re-shot on
21 October from the current build — 27,2 s at 1600 × 1000 and 30 fps, 2.595 KB, with a 2400 × 1500 poster; the last section of this document carries them._

### What measuring the frames found in the layout

The findings-list frame came out with a dead band: the city picture started at
**x = 316** with nothing painted in front of it. The rule is sound in itself —
the canvas reserves the project card's width, because the card is opaque and
takes pointer events — but `:has()` asks the DOM, not the render tree, and the
same stylesheet hides that card (`display: none`) whenever an info or findings
panel is open. So the reservation stayed behind a panel that was gone.

Fixed by guarding the reservation with `:not(:has(.panel-info, .panel-findings))`
in both wide-viewport blocks, and pinned by
`frontend/tests/canvasReserve.test.ts`, which reads every rule that reserves the
card's width out of `globals.css` and fails if its guard does not name every panel
that hides the card. Verified by the same measurement that found it: the picture
now reaches the left edge of the frame in both panel shots, and the two frames
that showed the band were re-shot after the change.

## 21 October 2026 — the example clip and its poster re-shot

The README's prose had moved on and its picture had not. The text of this
checkout says **74 sample files** and **8 findings**; the clip in `assets/` was
filmed on 12 October and shows **73 files / 7 findings**, the triage word
`Reviewed` — renamed to `No action needed` on 21 October — and the chrome before
the glass pass. The poster was shot on 16 October, so the two showed the same
visit in two different UI generations.

**Method, and why the film takes the time the visit took.** The app was driven
in a headless browser at 1600 × 1000 while Chrome pushed screencast frames:
**2.471 frames over 41,28 s in the first takes, 1.819 over 30,34 s, 1.534 over
25,66 s — 59,9 fps painted every time.** Each output slot of a 30 fps grid takes
the frame whose timestamp is nearest: a gap repeats the previous frame, nothing
is re-timed and nothing is dropped forward. The shipped take holds **817 frames
over 27,233 s**, so the film is as long as the visit.

| the file          |                                                                                                                                              |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| frames / duration | 817 over 27,233 s = 30 fps, one constant delta in `stts`                                                                                     |
| picture           | 1600 × 1000, one `trak`, handler `vide`, no `soun`, `mvhd` rate 1.0                                                                          |
| weight            | 2.657.666 bytes = 2.595 KB                                                                                                                   |
| the visit         | entry 2,5 s → _Explore demo_ → city assembles ≈ 9,6 s → finished city (74 files, 8 findings) → Security tour, three stops → tour card closed |
| console           | 0 errors                                                                                                                                     |

The poster is its own capture of the finished state — **2400 × 1500 at a 1,5×
device scale, 1.447.006 bytes = 1.413 KB** — taken in a separate run that waits
for the resident card to leave the DOM. That wait is in the recipe on purpose:
the card's lifetime is not fixed, it was gone after ~14 s in one run and after
~29 s in the next, and a poster that catches it covers the top of the city.

`backend/tests/beleg-04-demo-clip.test.ts` reads the README's clip sentence and
the clip's own boxes, so the sentence and the bytes cannot drift; it now accepts
the thousands separator in the weight. One correction is recorded here because
the probe, not the product, caused it: a scripted ending that clicked `Overview`
straight after the tour produced a frame with labels and no city. Re-tested
(tour → Escape → `Overview`), the control flies home and the whole city stands
there within 3 s and holds.

## 21 October 2026 — the README's frames re-shot from the current build

The check that started this was cheap: crop the header out of a shipped frame and
read it. `ui-workspace.png` said **73 files**, `ui-findings-list.png` said
**7 findings in 6 files**, while the README's own text had long since moved to
**74 sample files** and **8 findings** — the same defect the demo clip had, still
standing in the image grid. The word `Reviewed` in those frames was a second
symptom: the verdict button has been `No action needed` since this morning. (The
file row still counts `0/2 reviewed`, which is a different label and was not
renamed.)

All nine frames were shot again from the running build, headless at 1600 × 1000
with `--use-angle=metal`, 0 console errors across the six drives. The security
pair is taken under `prefers-reduced-motion`, with the demo notice dismissed and
the cursor parked in the header before each shot, because the caption compares
the two frames pixel for pixel: a tooltip that only one frame carries, or a
notice folding itself away between them, would be counted as a mode change.

| the pair now               |                                                                               |
| -------------------------- | ----------------------------------------------------------------------------- |
| pixels differing           | 39.857 of 1,600,000 = **2,49 %**                                              |
| median colour sum on those | **403 → 268**                                                                 |
| byte-identical regions     | sky, grass, header, project panel, the dock — **0 differing pixels** in each  |
| not identical              | the towers, the mode chip's field, and one car 14 px further along the avenue |

That last row is why `backend/tests/beleg-06-frame-pixels.test.ts` changed today.
It had asserted "over 98 % of the frames are identical" as a stand-in for the
caption's claim, and a closer framing of the same city broke it while the claim
had not changed: how much city is on screen decides how many pixels the dimming
can reach. The guard now checks what the sentence actually says — the five named
background regions must be byte-identical — and keeps a floor of 97 % so the pair
cannot drift into being two different moments.

## 21 October 2026 — the exported file now carries the product mark

The credit was a checkbox that came pre-ticked. A pre-ticked box is a default, and
a default that can be removed is not a claim, so the switch is gone: every
recorded frame and every exported PNG is drawn with `by Ephemora Skyline` and the
brand dot in the lower-right corner, and the studio says so in one line the reader
cannot misread — "Every file carries this mark, and it cannot be switched off".
The names switch stayed, unchecked, because that one is about the user's project.

The mark's type now follows the **short** side of the frame (23 px at a 1080-pixel
edge) rather than the height, so a 9:16 take no longer carries a 40 px billboard.
That corner belongs to the mark, so the names band gets the room that is left:
smaller type first, then a cut name. A plate never runs underneath the mark, and
no ink leaves the frame. Measured in the running app, names on, demo city at the
overview, `--use-angle=metal`, 0 console errors:

| format | names band, left → right | mark, left → right | clear gap  | band text           |
| ------ | ------------------------ | ------------------ | ---------- | ------------------- |
| 16:9   | 38 → 1259 px             | 1580 → 1890 px     | **321 px** | whole district list |
| 1:1    | 38 → 709 px              | 740 → 1050 px      | **31 px**  | cut to `infras…`    |
| 9:16   | 67 → 673 px              | 740 → 1050 px      | **67 px**  | cut to `mobile…`    |

The rectangles above were not computed from the source — the page wrapped
`roundRect` and reported what the exporter really drew, which is the only way to
catch a font whose advance width disagrees with the model.

That the mark is in the **file** rather than only in the canvas was read back out
of a recording: a 4.0 s MP4/H.264 1920 × 1080 take (238 composited frames,
761,616 bytes) was decoded in the browser at 1 s and near the end, and the mark's
box carries **979** and **983** ink pixels with **46** vermilion pixels in each.
The three PNG exports carry 1,005 / 1,005 / 970. Proof files:
`docs/reviews/2026-10-21-export-mark/` (`measure.json`, the crops, the two decoded
frames).

`docs/assets/ui-share-file.png` was re-shot from this build, because the card in
it gained the row "Burned in too, and not switchable: by Ephemora Skyline." — the
same drive as before (studio open on a finished 4.0 s take, names off, 238 frames,
MP4 · H.264). `frontend/tests/share-anonymity.test.tsx` grew from 13 to 18 tests:
the mark's own text, that a frame with no project ink still carries it, that the
studio holds exactly one checkbox, and the no-collision claim per format.

## 21 October 2026 — the resident's offer had nine seconds, now it stands

Asked why no resident greeted him at the start, the answer was measured on the
running app before anything was changed: a fresh context, the demo opened, no key
pressed, sampled every 250 ms. The announcement card carries the resident's line
for **9.0 s** from the moment the city is built, then folds itself into its strip
and the line is gone — it does not come back, and the strip never mentioned it.
The wave that belongs to the same moment lasts **3.4 s** and happens once, at the
arrival pose. `docs/reviews/2026-10-21-export-mark/` holds that timeline; the
greeting was not missing, it was nine seconds long.

Two changes, both ending on the reader's own answer:

| now                         | measured                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------ |
| verb on screen              | card 0 → 9.0 s, strip from 9.0 s — **one** at every sampled instant, never two, never zero |
| strip verb clicked          | `.security-tour` mounts, the offer reads `taken`, the verb is gone                         |
| card closed with ✕          | the offer reads `closed`: no strip verb, no further wave — a refusal is never asked twice  |
| strip line with the verb    | **17 words** (the budget guard holds at 24)                                                |
| wave while the offer stands | every **20 s**, one resident in frame, not under reduced motion or a guided flow           |

`frontend/tests/arrival-budget.test.tsx` (23 → 27) holds the strip cases against
the mounted `App`; `frontend/tests/resident-greeting.test.ts` (5) holds the wave
arithmetic — 20 s from the **last** wave, nothing owed to `taken` or `closed`,
nothing while the stage is busy. The live run finished with 0 console errors.
Proof: `docs/reviews/2026-10-21-resident-offer/` (`measure.json`, the strip with
its verb, the frame after the click).

## 22 October 2026 — the README opens on a picture that runs

Asked for the clip to be visible and running while the README is read, the first
answer was a measurement of what GitHub allows. Rendered through GitHub's own
markdown endpoint, `<video>` keeps only `src`, `muted`, `controls` and `width`:
`autoplay`, `loop`, `playsinline` and `poster` are stripped. On the README page
itself — a probe branch, read back through `GET /repos/…/readme` with
`Accept: application/vnd.github.html`, where a text marker proved the branch was
the thing rendered — the element is **dropped entirely**, for a relative src, for
`github.com/…/raw/main/…` and for `raw.githubusercontent.com/…` alike. So a
README cannot hold a playing video, and the only picture there that runs by
itself is an animated `<img>`.

The hero cell therefore shows a 7-second cut of the build — 5 s to 12 s of the
same visit, 70 frames at 640 × 400 and 10 fps, **3,227 KB** — linked to the clip,
so one click still hands over the whole 27.2 s file. `beleg-04-demo-clip.test.ts`
reads those five numbers out of the README sentence and walks the GIF's own
blocks to count its frames; a byte search for the Graphic Control marker was the
first idea and reported **114** frames in a 70-frame file, which is why the
walker steps over sub-blocks and local colour tables instead.

The poster PNG left with this: its job was to tease a video that could not play,
and the orphan guard (`baum-hygiene.test.ts`, "ships no asset in docs/assets that
no document links") would otherwise have had a new orphan to name. The 9/10
October and 12 October sections above keep their poster numbers as the history
they are.
