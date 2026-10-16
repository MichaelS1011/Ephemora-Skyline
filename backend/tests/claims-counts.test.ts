import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, mkdtempSync, rmSync } from "fs";
import { execFileSync } from "child_process";
import { tmpdir } from "os";
import path from "path";
import { emptyDroppedFiles, isScanCandidate } from "../src/services/analyzer/orchestrator.js";
import {
  REPO,
  constExpr,
  evaluate,
  importClient,
  read,
  testFileCount,
  type ClientGitignore,
  type ClientReader,
  type IgnoreMatcherLike,
  type PickerPlan,
  type WalkResult,
} from "./helpers/claimsShared.js";

/**
 * The expensive half of the split of `public-surface-claims.test.ts`
 * (2026-10-16): the number guards. These are the cases that measure — the file
 * counts read out of `frontend/tests` and `backend/tests`, and `walkWithShippedRules`,
 * which runs the app's own two selection decisions over the WHOLE checkout
 * including `.git`, plus the portable fixture proof that forks the drive script.
 *
 * They live apart from the badges, the CI steps, the licence, the ports and the
 * citations (`claims-surface.test.ts`) for two reasons: one typo in one badge
 * line must not pay for a walk of the tree, and a red case here names its
 * family — a count that drifted, never a wording.
 *
 * No check was softened and no claim dropped in the move: the same assertions,
 * the same regexes, the same messages, the same 30 s budgets.
 */

/**
 * The two sets the screen names, produced by the two functions the app itself
 * runs over a picked folder — not by a copy of their predicates.
 *
 * The first is the browser reader's `classifyCandidate`
 * (`frontend/src/hooks/useLocalAnalysis.ts`): the `SKIP_DIRS` segment test, the
 * project's own `.gitignore` set-aside, its source-shape rule, the user's
 * excludes, the path wall and the per-file size wall, applied to a real `File`
 * object, exactly as the picker hands one over. The second is the scan's own
 * single decision, `isScanCandidate`, applied to what the reader admitted, which
 * is what the backend does to the staged copy before it analyses a file.
 *
 * The enumeration prunes an ignored folder whole and counts it once, as the
 * directory walk does. `.git` is walked — the picker's history branch is a real
 * branch of the shipped classifier — but never read: its bytes belong to a
 * separate 15 MB budget, and the scan's own decision refuses every `.git` path
 * through `ARTIFACT_SEGMENT`, so it is in neither number. Both of those claims
 * are asserted in the check below, so the cheapness stays faithful.
 */
async function walkWithShippedRules(root: string): Promise<WalkResult> {
  const reader = await importClient<ClientReader>("../../frontend/src/hooks/useLocalAnalysis.ts");
  const { IgnoreMatcher } = await importClient<ClientGitignore>(
    "../../frontend/src/config/gitignore.ts",
  );
  const ignores = new IgnoreMatcher();
  const plan: PickerPlan = {
    candidates: [],
    found: 0,
    bytes: 0,
    dropped: emptyDroppedFiles(),
    overCap: false,
    setAside: new Set<string>(),
  };
  const isGitPath = (rel: string): boolean => rel === ".git" || rel.startsWith(".git/");
  let files = 0;
  let gitFiles = 0;
  const walk = (dirAbs: string, prefix: string): void => {
    const rule = path.join(dirAbs, ".gitignore");
    if (existsSync(rule)) ignores.add(prefix.replace(/\/$/, ""), readFileSync(rule, "utf-8"));
    for (const entry of readdirSync(dirAbs, { withFileTypes: true })) {
      const rel = `${prefix}${entry.name}`;
      const abs = path.join(dirAbs, entry.name);
      if (entry.isDirectory()) {
        if (reader.SKIP_DIRS.test(entry.name)) continue;
        if (ignores.isIgnored(rel, "dir")) {
          if (!plan.setAside.has(rel)) {
            plan.setAside.add(rel);
            plan.dropped.gitIgnored += 1;
          }
          continue;
        }
        walk(abs, `${rel}/`);
        continue;
      }
      if (!entry.isFile()) continue;
      if (isGitPath(rel)) {
        gitFiles += 1;
        reader.classifyCandidate(rel, new File([], entry.name), [], plan, ignores);
        continue;
      }
      files += 1;
      // The bytes the picker holds: `classifyCandidate` reads `file.size` — the
      // same wall the browser measures against the same 2 MB it uploads with.
      reader.classifyCandidate(rel, new File([readFileSync(abs)], entry.name), [], plan, ignores);
    }
  };
  walk(root, "");
  const admitted = plan.candidates.filter((c) => !c.git).map((c) => c.rel);
  const analysed = admitted.filter(isScanCandidate);
  expect(
    plan.found,
    `the reader's own counter (${plan.found}) and the source files it collected (${admitted.length}) ` +
      `disagree — one of the two was counted by something other than the shipped classifier`,
  ).toBe(admitted.length);
  expect(
    plan.candidates.filter((c) => c.git).map((c) => c.rel),
    `the history branch collected ${gitFiles} .git paths, and they must be exactly the paths the ` +
      `walk saw — otherwise the skip below is hiding files from a number it owes`,
  ).toHaveLength(gitFiles);
  return {
    files,
    gitFiles,
    admitted: plan.found,
    analysed: analysed.length,
    dropped: plan.dropped,
    setAside: [...plan.setAside],
  };
}

/**
 * The README sentence that states both numbers, by their pinned shapes: what the
 * project calls source (the reader's admission set) and what the app prints (the
 * set the scan read).
 */
function readmePublishedCounts(walked: WalkResult): {
  statedAdmitted: number;
  statedAnalysed: number;
  sentence: string;
} {
  const line = read("README.md")
    .split("\n")
    .find((l) => /files the project calls source/.test(l));
  expect(
    line,
    `README.md lost the sentence that states the walked counts — this checkout admits ` +
      `${walked.admitted} and the app prints ${walked.analysed}, so the sentence must read ` +
      `"counts **${walked.admitted}** files the project calls source … then reads ` +
      `**${walked.analysed}** of those" (that is the one-line fix the next drift needs)`,
  ).toBeTruthy();
  const admitted = /counts \*\*([\d,]+)\*\* files the project calls source/.exec(line!);
  expect(
    admitted,
    `the admitted-count sentence no longer states its number in the pinned shape — the walk ` +
      `admits ${walked.admitted}: ${line!.slice(-260)}`,
  ).toBeTruthy();
  const analysed = /then reads \*\*([\d,]+)\*\* of those/.exec(line!);
  expect(
    analysed,
    `the sentence states no "then reads **N** of those" number — the app prints ` +
      `${walked.analysed} for this folder, and a reader has to be able to reproduce the ` +
      `number on the screen: ${line!.slice(-260)}`,
  ).toBeTruthy();
  return {
    statedAdmitted: Number(admitted![1]!.replace(/,/g, "")),
    statedAnalysed: Number(analysed![1]!.replace(/,/g, "")),
    sentence: line!,
  };
}

describe("the counts a stranger can read out of this tree", () => {
  it("claims no test file the tree does not hold", () => {
    const frontend = testFileCount("frontend/tests");
    const backend = testFileCount("backend/tests");
    expect(
      frontend + backend,
      "an empty test directory is a bug, not a doc problem",
    ).toBeGreaterThan(100);
    const stated: string[] = [];
    for (const rel of ["README.md", "CONTRIBUTING.md"]) {
      const docLine =
        read(rel)
          .split("\n")
          .find((line) => /Vitest.*test files/.test(line)) ?? "";
      const counts = docLine.match(
        /Vitest[^\n]*?([\d,]+) test files?[^\d]+([\d,]+)\s*frontend[^\d]+([\d,]+)\s*backend/,
      );
      expect(
        counts,
        `${rel} must name its test files as "Vitest — N test files: F frontend, B backend (<date>)"`,
      ).toBeTruthy();
      expect(
        docLine,
        `${rel}: a file count without the day it was counted is a claim, not a measurement`,
      ).toMatch(/\d{4}-\d{2}-\d{2}/);
      const number = (value: string): number => Number(value.replace(/,/g, ""));
      const [total, f, b] = [number(counts![1]!), number(counts![2]!), number(counts![3]!)];
      // Exact, not "at most": a file count leaves the tree, so a document that is
      // one test file short is simply wrong, and the wrongness is the whole defect
      // this check exists to catch — the count a lane published before it added one.
      expect(f, `${rel}: frontend/tests holds ${frontend} test files`).toBe(frontend);
      expect(b, `${rel}: backend/tests holds ${backend} test files`).toBe(backend);
      expect(total, `${rel}: ${f} frontend + ${b} backend does not add up to ${total}`).toBe(f + b);
      expect(total, `${rel}: the tree holds ${frontend + backend} test files`).toBe(
        frontend + backend,
      );
      stated.push(`${f}+${b}`);
    }
    expect(stated[0], "README and CONTRIBUTING state different test-file counts").toBe(stated[1]);
  });
});

// ── Claims lane, 2026-10-14 ───────────────────────────────────────────────
// Signature S1: "no public number breaks on a fresh clone". Each check below
// was written and run BEFORE the sentence it fixes — red first — and pins a
// published claim to a fact the tree itself carries: the app's own two
// selection decisions run over this checkout, the shipped weights, the route's
// own constants, the guard count of `localOnlyRoute`, the delivered finding
// list, the engines range, the number of gates.
// Written as dynamic imports so the backend's NodeNext program never pulls
// frontend sources into its own compilation, while the test still executes the
// very functions the browser runs — the rule is reused, not re-implemented.
// The checks of the same lane that quote a source instead of counting one
// (G, H, I, J) are in `claims-surface.test.ts`.

describe("the claims lane of 2026-10-14 (S1: no public number breaks)", () => {
  it("A — the README states the number the app prints, from the app's own two decisions", async () => {
    const walked = await walkWithShippedRules(REPO);
    const { statedAdmitted, statedAnalysed, sentence } = readmePublishedCounts(walked);
    expect(
      statedAdmitted,
      `README says the project calls ${statedAdmitted} files source, but the browser's own ` +
        `classifier admits ${walked.admitted} of the ${walked.files} files this checkout offers ` +
        `(dropped: ${JSON.stringify(walked.dropped)}) — fix the sentence to ${walked.admitted}: ` +
        sentence.slice(-160),
    ).toBe(walked.admitted);
    expect(
      statedAnalysed,
      `README says the app prints ${statedAnalysed} files analyzed, but the shipped scan ` +
        `decision reads ${walked.analysed} of the ${walked.admitted} the reader admitted (the ` +
        `other ${walked.admitted - walked.analysed} are shaped for the test runner, not for a ` +
        `scanner) — fix the sentence to ${walked.analysed}`,
    ).toBe(walked.analysed);
    expect(sentence, "the counted sentence must name the guard that pins it").toContain(
      "backend/tests/claims-counts.test.ts",
    );
    // The two buckets the screen names can never exceed what the folder offered.
    // A working tree also holds local files the project's own `.gitignore` sets
    // aside, and those leave through `gitIgnored`, which counts a folder once
    // rather than the files inside it — so the exact close (analysed + unread =
    // every file offered) is asserted over the clean snapshot, in A2.
    expect(
      walked.admitted + walked.dropped.unsupportedFormat,
      `the reader admitted ${walked.admitted} and named ${walked.dropped.unsupportedFormat} formats ` +
        `it does not open — together more than the ${walked.files} files this folder offers. ` +
        `Full accounting: ${JSON.stringify(walked.dropped)}, set aside: ${walked.setAside.join(", ")}`,
    ).toBeLessThanOrEqual(walked.files);
    // The history branch really is outside both numbers: the scan refuses every
    // .git path, so skipping it above cannot have hidden a file either count owes.
    expect(isScanCandidate(".git/config"), "the .git skip stopped being faithful").toBe(false);
    expect(isScanCandidate(".git/objects/ab/cdef"), "the .git skip stopped being faithful").toBe(
      false,
    );
  }, 30_000); // reads to the next person as a broken claim, which it is not. // default as soon as the machine is busy — and a guard that times out under load // A walk of the whole checkout, `.git` included, needs longer than vitest's 5 s

  it("A2 — the same walk over the folder the app was driven with prints the number on the screen", async () => {
    /**
     * The check that used to live here read a snapshot of one developer's
     * machine (`/tmp/firsttouch/verify-tree`) and returned GREEN WITHOUT SAYING
     * ANYTHING wherever that folder was absent — which is every clone, including
     * CI. A guard that no reader can run is not a guard.
     *
     * The portable version uses the one folder whose printed number is on record
     * for a reason anyone can reproduce: the first drive (`scripts/first-drive.mjs`)
     * hands a hand-authored 13-path fixture to the running app and reads the
     * counts off the page. The fixture and its expected counts are written in
     * that file, decided before the app is asked. This check builds the same
     * folder, runs the app's own two decisions over it — the browser's classifier
     * and the scan's own candidate rule — and requires the walk to agree with the
     * numbers the screen is claimed to show.
     */
    const scratch = mkdtempSync(path.join(tmpdir(), "skyline-claims-walk-"));
    try {
      const run = (args: string[]): string =>
        execFileSync(process.execPath, ["scripts/first-drive.mjs", ...args], {
          cwd: REPO,
          encoding: "utf-8",
          env: { ...process.env, FAHRT_SCRATCH: scratch },
        });
      run(["--fixture"]);
      const expected = JSON.parse(run(["--expected"])) as {
        pathsOnDisk: number;
        analyzed: number;
        unread: number;
      };
      const walked = await walkWithShippedRules(path.join(scratch, "target"));
      expect(
        walked.files,
        `the fixture holds ${expected.pathsOnDisk} paths; the walk saw ${walked.files}`,
      ).toBe(expected.pathsOnDisk);
      expect(
        walked.analysed,
        `the drive reads ${expected.analyzed} files analyzed off the screen; the walk that is ` +
          `supposed to be the app's own rule says ${walked.analysed}`,
      ).toBe(expected.analyzed);
      expect(
        walked.dropped.unsupportedFormat + (walked.admitted - walked.analysed),
        `the drive reads ${expected.unread} files in a format the scanners do not read; the two ` +
          `shaped-out buckets of this walk add up differently (${JSON.stringify(walked.dropped)})`,
      ).toBe(expected.unread);
      // the close the screen shows: analyzed + unread is the folder, exactly
      expect(
        walked.analysed + expected.unread,
        `${expected.analyzed} analyzed + ${expected.unread} unread must be the ` +
          `${expected.pathsOnDisk} paths the fixture holds`,
      ).toBe(expected.pathsOnDisk);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }, 30_000);

  it("B — the height row names every non-zero weight the shipped mapping uses", async () => {
    const mapping = await importClient<{ COMPLEXITY_WEIGHTS: Record<string, number> }>(
      "../../frontend/src/city/mapping.ts",
    );
    const weights = mapping.COMPLEXITY_WEIGHTS;
    const row = read("README.md")
      .split("\n")
      .find((l) => /^\|\s*Building height/.test(l));
    expect(row, "the README lost the Building height row").toBeTruthy();
    const nonZero = Object.values(weights).filter((w) => w > 0).length;
    if (nonZero > 1) {
      expect(
        row!,
        "the shipped height is a weighted blend; the row may not claim one factor",
      ).not.toMatch(/cyclomatic complexity of that file/i);
      const named: Record<string, RegExp> = {
        cyclomatic: /cyclomatic/i,
        depthProxy: /import/i,
        loc: /size/i,
      };
      for (const [factor, weight] of Object.entries(weights)) {
        if (weight <= 0) continue;
        expect(row, `the row omits the ${factor} factor`).toMatch(named[factor]!);
        expect(row, `the row omits the ${factor} weight`).toContain(`${Math.round(weight * 100)}%`);
      }
    }
  });

  it("C — one per-file size on both sides, and the docs promise that number", () => {
    const client = constExpr("frontend/src/hooks/useLocalAnalysis.ts", "MAX_FILE_BYTES");
    const route = constExpr("backend/src/server/routes/local-analyze.ts", "MAX_FILE_BYTES");
    expect(client, "the browser and the route must share one per-file wall").toBe(route);
    const bytes = evaluate(client);
    expect(bytes, "the per-file wall the docs sell is 2 MB").toBe(2 * 1024 * 1024);
    for (const rel of ["README.md", "docs/GETTING_STARTED.md", "SECURITY.md"]) {
      expect(read(rel), `${rel} must promise the shared number`).toContain("2 MB per file");
    }
  });

  it("D — SECURITY states the route's caps, the guard count, and all four engines", () => {
    const sec = read("SECURITY.md");
    const files = evaluate(constExpr("backend/src/server/routes/local-analyze.ts", "MAX_FILES"));
    const total = evaluate(
      constExpr("backend/src/server/routes/local-analyze.ts", "MAX_TOTAL_BYTES"),
    );
    expect(sec, "SECURITY.md misstates the caps the route enforces").toContain(
      `${files.toLocaleString("en-US")} files / ${Math.round(total / 1024 / 1024)} MB`,
    );
    expect(sec).not.toMatch(/3000 files|3,000 files|40 MB/);
    // five registrations, and both documents say five
    const registrations = read("backend/src/server/index.ts")
      .split("\n")
      .filter((l) => /localOnlyRoute[,)"]/.test(l) && !l.trim().startsWith("import")).length;
    expect(registrations, "the guard is wired where the docs say").toBe(5);
    expect(sec, "SECURITY undersells the guard — five routes refuse a foreign page").toMatch(
      /[Ff]ive routes/,
    );
    expect(sec).not.toMatch(/two routes that execute/i);
    expect(read("README.md")).toContain("five routes");
    // every shipped adapter is named by the security policy
    const adapters = readdirSync(path.join(REPO, "backend/src/services/security/adapters"))
      .join("\n")
      .toLowerCase();
    for (const engine of ["gitleaks", "semgrep", "osv", "ruff"]) {
      expect(adapters, `${engine} has no adapter, yet the docs name it`).toContain(engine);
      expect(
        sec,
        `SECURITY.md omits ${engine} from the engine list — complete it (${engine}-adapter.ts ships)`,
      ).toMatch(new RegExp(engine === "osv" ? "osv-scanner" : engine, "i"));
    }
  });

  it("E — the accuracy bullet describes the expect-line hit that actually shipped", () => {
    const bullet = read("README.md")
      .split("\n")
      .find((l) => l.includes("There is no accuracy number here, on purpose."));
    expect(bullet, "the accuracy bullet moved").toBeTruthy();
    const rows = read("docs/self-scan-findings.ndjson")
      .split("\n")
      .filter((l) => l.length > 0)
      .map((l) => JSON.parse(l) as { path: string; line: number; ruleId: string });
    const onExpect = rows.filter((f) =>
      /expect\s*\(/.test(read(f.path).split("\n")[f.line - 1] ?? ""),
    );
    expect(
      onExpect,
      "the list must still carry the expect-line hit the sentence describes",
    ).toHaveLength(1);
    expect(
      bullet!,
      `the real hit is the ${onExpect[0]!.ruleId} on an expect line — name it`,
    ).toContain(onExpect[0]!.ruleId);
    expect(
      bullet!,
      "no eval-shaped rule ships; the sentence may not explain an eval hit",
    ).not.toMatch(/\bnot a call to\b|\beval\b/);
    expect(
      rows.some((f) => /eval/i.test(f.ruleId)),
      "an eval rule now ships — re-describe",
    ).toBe(false);
  });

  it("F — CONTRIBUTING quotes the engines range and counts the gates", () => {
    const pkg = JSON.parse(read("package.json")) as { engines?: Record<string, string> };
    const contrib = read("CONTRIBUTING.md");
    expect(
      contrib,
      `CONTRIBUTING must quote package.json's engines range verbatim (${pkg.engines?.node})`,
    ).toContain(pkg.engines!.node!);
    expect(contrib, "the gates heading lied about their number").toMatch(/five gates/);
    expect(contrib).not.toMatch(/four gates/);
  });
});
