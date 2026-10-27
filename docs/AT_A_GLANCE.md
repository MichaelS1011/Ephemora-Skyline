# Ephemora Skyline in one screen

Three questions a stranger asks before installing anything, answered here so
you don't have to scroll the README to find the deal-breaker. Every sentence
sides with a document or a test in this repository; where a number is due, the
number lives in the README with its guard, not here.

## What am I looking at?

A folder of code drawn as a city you fly around with the mouse. One top-level
folder is one district; one file is one building. A taller building means more
tangled code inside it — a blend of cyclomatic complexity, import depth and
file size, weighted in the shipped mapping and named in the README table. A
red beacon on a roof is a security finding, weighted by risk. Yellow lasers
are copy-paste clones between files, red rings are circular imports, a blue
shield is test coverage when an `lcov` report exists. And grey means no engine
looked there — which is deliberately not a claim of clean.

Click a building and you get the file, the line, the matched text with its
surrounding lines, the rule that fired and the steps to fix it.

## What can I do with it?

- **Run it locally.** Four commands, no account, no token, no upload:
  [`GETTING_STARTED.md`](./GETTING_STARTED.md). Or press **Explore demo** and
  walk a sample city first — sample files with sample findings, no scanner ran
  on it.
- **Work the queue, not the map.** The Security Tour flies finding to finding,
  worst first, and explains each one in plain words. An edge pill points back
  to the next finding you still have to judge, and a resident you call walks
  you there.
- **Judge.** Every finding carries its rule, its line and a fingerprint; your
  verdict survives the next scan, and a coding agent can be pointed at the
  same finding ([`AGENTS.md`](./AGENTS.md)).
- **Share what you built.** The studio renders a video and pictures locally —
  you get the file, no caption, no platform row. SARIF goes out for tools.
- **Read it in English or German.** The interface, the categories and the fix
  recipes; a scanner's own message stays as written.

## What can I not do with it?

- **It proves nothing.** A finding is a rule that matched, not an exploit
  proven. The check is the product; the red light is only the pointer.
- **There is no accuracy number to quote** — precision and recall need an
  annotated corpus this repository does not have. What the shipped rules
  cannot see is in [`LIMITS.md`](./LIMITS.md), including the app's own
  self-scan of this checkout.
- **It does not run your code** (the one exception is named on screen: **Run
  test file**, only after you press it), and **it does not write to your
  project** — the explanation layer has a voice and no pen.
- **A city is not an archive.** Results live in the local process for a short
  window; export SARIF or a picture if a finding has to outlive it.
- **It takes a folder, not a repository URL.** There is no remote-repository
  path to authorise — the only input is a folder you pick and whose contents
  cross the loopback interface and stop there
  ([`PRIVACY.md`](./PRIVACY.md)).
- **It is not a phone app.** Desktop web; phones were decided against and are
  not planned.

## Want the receipts?

The README states the gate list, the test counts with the day they were
measured, and every host that may reach the network — each pinned by a test in
`backend/tests` that fails when the sentence and the tree disagree. The screens
in the README were shot from this repository's own build, and
[`UI_REVIEW.md`](./UI_REVIEW.md) says how each frame was measured. To run the
checks yourself: [CONTRIBUTING.md](../CONTRIBUTING.md)
names the five gates; [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)
runs them.
