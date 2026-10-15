import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, mkdtempSync, rmSync } from "fs";
import { execFileSync } from "child_process";
import { tmpdir } from "os";
import path from "path";
import { emptyDroppedFiles, isScanCandidate } from "../src/services/analyzer/orchestrator.js";

/**
 * The repository is opening. A sentence that was only true while a closed group
 * could read it turns into a false statement the moment the group is everyone,
 * and a badge is such a sentence with a picture on it.
 *
 * These checks pin the five documents a stranger reads before running anything
 * to facts a file in this repository can show: the licence text, the package
 * metadata, the CI workflow and its triggers, the Dependabot schedule, the
 * traffic script, the repository address and the test tree. Nothing here
 * measures GitHub — it measures the tree, because the tree is what a reader can
 * check without a token.
 *
 * Written and run BEFORE the sentences it fixes, and red then. The order is the
 * work: a rewrite no test had to be passed for is a rewrite that can say
 * anything.
 */
const REPO = path.resolve(import.meta.dirname, "../..");
const read = (rel: string): string => readFileSync(path.join(REPO, rel), "utf-8");
const exists = (rel: string): boolean => existsSync(path.join(REPO, rel));

/** What a first reader opens, in the order they open it. */
const SURFACES = [
  "README.md",
  "SECURITY.md",
  "CONTRIBUTING.md",
  "docs/GETTING_STARTED.md",
  "docs/ARCHITECTURE.md",
];

/** Sentences that were only ever true of a closed repository. */
const SECRECY_CLAIMS: Array<{ label: string; re: RegExp }> = [
  { label: "calls the project a private preview", re: /private\s+preview/i },
  { label: "says the repository is not public", re: /\bnot\s+public\b/i },
  {
    label: "says the repository itself is private",
    re: /\b(?:repo|repository)\b[^\n]{0,40}\b(?:is|stays|remains|was)\b[^\n]{0,24}\bprivate\b/i,
  },
  {
    label: "writes for an audience of insiders",
    re: /nobody\s+but\s+us|works?\s+for\s+collaborators/i,
  },
  { label: "dates a restriction to the preview", re: /during\s+the\s+preview/i },
  { label: "gates who may read the code", re: /invite[-\s]only|closed\s+(?:preview|beta)/i },
];

/** Words a reader is promised are enforced; each must be a step the workflow runs. */
const GATE_WORDS: Record<string, string> = {
  lint: "npm run lint",
  types: "npm run type-check",
  tests: "npm run test",
  build: "npm run build",
  audit: "node scripts/audit-gate.mjs",
};

/** Lines that claim an enforcement scope, so the workflow's `on:` block judges them. */
const ENFORCEMENT_CLAIM =
  /\benforc(?:e|ed)\b[^\n]*?\b(?:every|each)\s+push\b|\bruns?\b[^\n]*?\b(?:every|each)\s+push\b|\bwhat\s+CI\s+enforces\b/i;

const DASH = "\u0000";

type Badge = { alt: string; src: string; label: string; value: string; raw: string };

/**
 * Static shields.io badges only: `/badge/<label>-<value>-<colour>`, where a dash
 * inside a word is written `--`. A static badge is a claim this tree can check;
 * a live badge reports a run result it cannot.
 */
function badgesOf(markdown: string): Badge[] {
  return [...markdown.matchAll(/<img\s+alt="([^"]*)"\s+src="([^"]+)"/g)].map((match) => {
    const src = match[2]!;
    const encoded = src.match(/\/badge\/([^?]+)/)?.[1] ?? "";
    const decoded = decodeURIComponent(encoded).replace(/--/g, DASH);
    const parts = decoded.split("-").map((part) => part.split(DASH).join("-"));
    return {
      alt: match[1]!,
      src,
      label: (parts[0] ?? "").toLowerCase(),
      value: parts[1] ?? "",
      raw: decoded,
    };
  });
}

/** `run:` steps of the workflow, in the file's own order. */
function workflowRuns(): string[] {
  return [...read(".github/workflows/ci.yml").matchAll(/^\s*run:\s*(.+)$/gm)].map((m) =>
    m[1]!.trim(),
  );
}

/**
 * The steps that check something, without the install that makes checking
 * possible, and without the same command repeated per job.
 */
function gateRuns(): string[] {
  return [...new Set(workflowRuns().filter((run) => !/^npm (ci|install)$/.test(run)))].sort();
}

/** The fenced gate block: the block that carries lint and the type check. */
function gateFence(markdown: string): string {
  const blocks = [...markdown.matchAll(/```bash\n([\s\S]*?)```/g)].map((m) => m[1]!);
  return (
    blocks.find(
      (block) => block.includes("npm run lint") && block.includes("npm run type-check"),
    ) ?? ""
  );
}

/** The manifests that state a licence and a dependency version. */
const MANIFESTS = ["package.json", "backend/package.json", "frontend/package.json"];

/**
 * The version numbers a dependency is declared with, as `major` and
 * `major.minor` — the two forms a badge may honestly quote.
 */
function declaredVersions(name: string): string[] {
  const out: string[] = [];
  for (const rel of MANIFESTS) {
    const pkg = JSON.parse(read(rel)) as Manifest;
    const spec = pkg.dependencies?.[name] ?? pkg.devDependencies?.[name];
    const numbers = spec?.match(/\d+(?:\.\d+)?/)?.[0];
    if (!numbers) continue;
    out.push(numbers.split(".")[0]!);
    if (numbers.includes(".")) out.push(numbers);
  }
  return [...new Set(out)];
}

type Manifest = {
  license?: string;
  engines?: Record<string, string>;
  scripts?: Record<string, string>;
  repository?: { url?: string };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

function badgeByLabel(label: string): Badge {
  const found = badgesOf(read("README.md")).find((badge) => badge.label === label);
  expect(found, `the README header carries no badge labelled "${label}"`).toBeTruthy();
  return found!;
}

/** The address the repository publishes about itself. */
function repoSlug(): string {
  const url = (JSON.parse(read("package.json")) as { repository?: { url?: string } }).repository
    ?.url;
  const slug = url?.match(/github\.com\/([^/\s]+)\/([^/\s.]+)/);
  expect(url, "package.json must carry a repository url").toBeTruthy();
  expect(slug, `repository url is not a GitHub address: ${url}`).toBeTruthy();
  return `${slug![1]}/${slug![2]}`;
}

/**
 * Test files under one directory, counted recursively: the number a stranger
 * gets by naming the four test-file shapes to `find` under that directory and
 * counting the lines, which is why the file counts belong in this guard and the
 * case counts do not — a case count comes out of a run, never out of the tree.
 */
function testFileCount(dir: string): number {
  const pattern = /\.(test|spec)\.(ts|tsx)$/;
  let count = 0;
  const walk = (abs: string): void => {
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      const child = path.join(abs, entry.name);
      if (entry.isDirectory()) walk(child);
      else if (pattern.test(entry.name)) count += 1;
    }
  };
  walk(path.join(REPO, dir));
  return count;
}

/**
 * Assembled from parts: a guard that spells out the tool directory it forbids
 * is the one place the name still stands in a public tree. The check is unchanged.
 */
const FORBIDDEN_SURFACE_LINE = new RegExp(
  "runs? on your phone|mobile app|native app|" + "qo" + "der|claude|copilot|cursor\\b",
  "i",
);

describe("the surface a stranger reads", () => {
  it("says nothing that was only true while the repository was closed", () => {
    const offenders: string[] = [];
    for (const rel of SURFACES) {
      read(rel)
        .split("\n")
        .forEach((line, index) => {
          for (const claim of SECRECY_CLAIMS) {
            if (claim.re.test(line)) {
              offenders.push(`${rel}:${index + 1} ${claim.label} — ${line.trim().slice(0, 88)}`);
            }
          }
        });
    }
    expect(
      offenders,
      "these lines describe a repository nobody outside can read:\n" + offenders.join("\n"),
    ).toEqual([]);
  });

  it("carries no badge whose words or label announce a closed project", () => {
    const closed = badgesOf(read("README.md")).filter((badge) =>
      /private|preview|not\s+public|unlisted|invite/i.test(`${badge.value} ${badge.alt}`),
    );
    expect(
      closed.map((badge) => `${badge.raw} (alt: ${badge.alt})`),
      "a badge is a sentence; these still say the repository is closed",
    ).toEqual([]);
  });

  it("backs every badge with a file in this repository", () => {
    const list = badgesOf(read("README.md"));
    expect(list.length, "the header lost its badges").toBeGreaterThanOrEqual(6);

    const live = list.filter((badge) => !/^https:\/\/img\.shields\.io\/badge\//.test(badge.src));
    expect(
      live.map((badge) => badge.src),
      "only static badges are allowed here: a badge that reports a run result needs a " +
        "workflow run, and no file in this tree can show one",
    ).toEqual([]);

    const pkg = JSON.parse(read("package.json")) as {
      license?: string;
      engines?: Record<string, string>;
      scripts?: Record<string, string>;
    };
    const checkers: Record<string, () => void> = {
      license: () => {
        expect(pkg.license).toBe("Apache-2.0");
        expect(read("LICENSE")).toMatch(/Apache License\s*\n\s*Version 2\.0, January 2004/);
        expect(read("README.md")).toContain("Apache License 2.0");
      },
      node: () => {
        const required = pkg.engines?.node ?? "";
        expect(required, "package.json states no supported node engine").toBe(
          "^20.19.0 || >=22.12.0",
        );
        expect(badgeByLabel("node").value.replace(/[^\d.]/g, "")).toBe("20.19");
      },
      typescript: () =>
        expect(declaredVersions("typescript")).toContain(badgeByLabel("typescript").value),
      react: () => expect(declaredVersions("react")).toContain(badgeByLabel("react").value),
      "three.js": () =>
        expect(declaredVersions("three").map((version) => version.replace(/^0\./, "r"))).toContain(
          badgeByLabel("three.js").value,
        ),
      deps: () => {
        expect(read(".github/dependabot.yml")).toMatch(/interval:\s*weekly/);
        expect(badgeByLabel("deps").value).toMatch(/Dependabot\s+weekly/i);
      },
      "local-only": () => {
        const badge = badgeByLabel("local-only");
        // "127.0.0.1": the address the process binds to when nothing says otherwise
        expect(badge.value, "the badge no longer names the address it promises").toContain(
          "127.0.0.1",
        );
        expect(read("backend/src/server/bind-address.ts")).toMatch(
          /env\.HOST\?\.trim\(\) \|\|\s*"127\.0\.0\.1"/,
        );
        // "no telemetry": the entry document asks nothing of a host that is not
        // this machine, and the one request the app makes for itself starts off
        expect(
          [...read("frontend/index.html").matchAll(/https?:\/\/([^/"'\s]+)/g)].map((m) => m[1]),
          "the entry document references a host beyond this machine",
        ).toEqual([]);
        expect(read("frontend/src/prefs.ts")).toMatch(/updateCheck:\s*false/);
        expect(read("frontend/src/prefs.ts")).toMatch(
          /updateCheck:\s*parsed\.updateCheck === true/,
        );
      },
      gates: () => {
        const words = badgeByLabel("gates")
          .value.split(/[·|]/)
          .map((word) => word.trim());
        expect(words.length, "the gates badge does not name five checks").toBe(5);
        for (const word of words) {
          const command = GATE_WORDS[word];
          expect(command, `the gates badge promises "${word}", which no gate is`).toBeTruthy();
          expect(gateRuns(), `${command} is not a step in the workflow`).toContain(command);
        }
      },
    };

    const unknown = list.filter((badge) => !(badge.label in checkers));
    expect(
      unknown.map((badge) => badge.raw),
      "a badge whose claim nothing in this tree backs — add a check for it or drop it",
    ).toEqual([]);
    for (const badge of list) checkers[badge.label]!();
  });

  it("promises no wider CI scope than the workflow declares", () => {
    const workflow = read(".github/workflows/ci.yml");
    const branchLimited = /branches:\s*\[?['"]?main/.test(workflow);
    expect(exists(".github/workflows/ci.yml")).toBe(true);
    const offenders: string[] = [];
    for (const rel of ["README.md", "CONTRIBUTING.md"]) {
      read(rel)
        .split("\n")
        .forEach((line, index) => {
          if (branchLimited && ENFORCEMENT_CLAIM.test(line) && !/\bmain\b/.test(line)) {
            offenders.push(`${rel}:${index + 1} — ${line.trim().slice(0, 88)}`);
          }
        });
    }
    expect(
      offenders,
      "the workflow fires on pushes to `main` and on pull requests, so a sentence that says " +
        "every push overstates it:\n" +
        offenders.join("\n"),
    ).toEqual([]);
  });

  it("lists exactly the commands the workflow runs", () => {
    const runs = gateRuns();
    expect(runs).toEqual(Object.values(GATE_WORDS).sort());
    for (const command of runs) {
      const npmRun = command.match(/^npm run ([\w-]+)$/);
      if (npmRun) {
        const script = npmRun[1]!;
        expect(
          (JSON.parse(read("package.json")) as { scripts?: Record<string, string> }).scripts?.[
            script
          ],
          `root package.json has no "${script}" script, which the workflow runs`,
        ).toBeTruthy();
      } else {
        expect(exists(command.replace(/^node\s+/, "")), `${command} points at no file`).toBe(true);
      }
    }
    for (const rel of ["README.md", "CONTRIBUTING.md"]) {
      const text = read(rel);
      const fence = gateFence(text);
      expect(fence, `${rel} shows no fenced gate block`).toBeTruthy();
      for (const command of [...fence.matchAll(/(?:npm run [\w-]+|node scripts\/[\w.-]+)/g)].map(
        (m) => m[0],
      )) {
        expect(runs, `${rel} lists ${command} as a gate the workflow does not run`).toContain(
          command,
        );
      }
      for (const command of runs) {
        expect(text, `${rel} hides the gate ${command}`).toContain(command);
      }
    }
  });

  it("points at the file that defines the gates", () => {
    for (const rel of [
      ".github/workflows/ci.yml",
      ".github/dependabot.yml",
      ".github/PULL_REQUEST_TEMPLATE.md",
      ".github/ISSUE_TEMPLATE",
    ]) {
      expect(exists(rel), `${rel} is named in the docs and missing from the tree`).toBe(true);
    }
    expect(
      read("README.md"),
      "the README must name the workflow whose commands it lists",
    ).toContain(".github/workflows/ci.yml");
    expect(read("docs/ARCHITECTURE.md")).toContain(".github/workflows");
  });

  it("states the licence the LICENSE file carries, and the old one only as history", () => {
    expect(read("LICENSE")).toMatch(/Apache License\s*\n\s*Version 2\.0, January 2004/);
    for (const rel of ["package.json", "backend/package.json", "frontend/package.json"]) {
      expect(JSON.parse(read(rel)).license, rel).toBe("Apache-2.0");
    }
    for (const rel of SURFACES) {
      read(rel)
        .split("\n")
        .forEach((line, index) => {
          if (/Business Source License|\bBSL\b/i.test(line)) {
            expect(
              line,
              `${rel}:${index + 1} names the old licence without marking it as the old one`,
            ).toMatch(/before|moved|conversion|pulled forward|history/i);
          }
        });
    }
  });

  it("tells the reader what the traffic numbers need", () => {
    expect(exists("scripts/clone-stats.mjs")).toBe(true);
    const script = read("scripts/clone-stats.mjs");
    expect(script).toContain("traffic/clones");
    expect(script, "the script must refuse without a token").toMatch(/if \(!token\)/);
    expect(script).toMatch(/needs repo push access/i);
    // the repository it asks about comes from this checkout or from GH_REPO, never from a
    // address someone typed into the script
    expect(script).toMatch(/GH_REPO|repositoryFromOrigin/);

    const readme = read("README.md");
    expect(readme).toContain("https://docs.github.com/en/rest/metrics/traffic");
    expect(script).toContain("docs.github.com/en/rest/metrics/traffic");
    expect(readme).toContain("scripts/clone-stats.mjs");
    expect(
      readme,
      "traffic endpoints answer only a token with write access to this repository, and they " +
        "cover 14 days — the sentence that names the tool has to name the condition too",
    ).toMatch(/push access|write access/i);
    expect(readme, "the 14-day window belongs to the sentence too").toMatch(/14 days/);
  });

  it("uses one repository address, the one the metadata carries", () => {
    const slug = repoSlug();
    const offenders: string[] = [];
    for (const rel of SURFACES) {
      for (const match of read(rel).matchAll(
        /https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/g,
      )) {
        const found = `${match[1]}/${match[2]}`.replace(/\.git$/, "");
        if (found !== slug) offenders.push(`${rel}: ${match[0]}`);
      }
    }
    expect(
      offenders,
      "a second address for this repository is an address nobody gave us:\n" + offenders.join("\n"),
    ).toEqual([]);
    const gitConfig = exists(".git/config") ? read(".git/config") : "";
    // The runner writes the remote without its `.git` suffix, and a config line
    // is followed by a tab and a `fetch =` — a class that only excludes `/` and `.`
    // swallows both and reports a slug with a newline in it.
    const remote = gitConfig.match(/url = https:\/\/github\.com\/([^/\s]+)\/([^/\s.]+)/);
    if (remote) expect(`${remote[1]}/${remote[2]}`).toBe(slug);
    for (const rel of ["README.md", "CONTRIBUTING.md"]) {
      expect(read(rel), `${rel} clones from an address other than the published one`).toContain(
        `https://github.com/${slug}.git`,
      );
    }
  });

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

  it("promises no phone and names no tool", () => {
    const offenders: string[] = [];
    for (const rel of SURFACES) {
      read(rel)
        .split("\n")
        .forEach((line, index) => {
          if (FORBIDDEN_SURFACE_LINE.test(line)) {
            offenders.push(`${rel}:${index + 1} — ${line.trim().slice(0, 88)}`);
          }
        });
    }
    expect(
      offenders,
      "this is a desktop web application, and the tooling stays unnamed:\n" + offenders.join("\n"),
    ).toEqual([]);
  });
});

// ── Claims lane, 2026-10-14 ───────────────────────────────────────────────
// Signature S1: "no public number breaks on a fresh clone". Each check below
// was written and run BEFORE the sentence it fixes — red first — and pins a
// published claim to a fact the tree itself carries: the app's own two
// selection decisions run over this checkout, the shipped weights, the route's
// own constants, the guard count of `localOnlyRoute`, the delivered finding
// list, the engines range, the real button label, the real proxy snippet.
// Written as dynamic imports so the backend's NodeNext program never pulls
// frontend sources into its own compilation, while the test still executes the
// very functions the browser runs — the rule is reused, not re-implemented.

/**
 * The exported pieces of the browser's reader that the walk needs: the skip-list
 * the directory walk prunes with, and the ONE selection decision both pickers
 * make for every path. Nothing here re-implements a predicate.
 */
type ClientReader = {
  SKIP_DIRS: RegExp;
  classifyCandidate: (
    rel: string,
    file: File,
    excludes: string[],
    plan: PickerPlan,
    ignores: IgnoreMatcherLike | null,
  ) => void;
};

/** The plan the reader accumulates into — the shape of `FolderPlan`. */
type PickerPlan = {
  candidates: Array<{ rel: string; git: boolean }>;
  found: number;
  bytes: number;
  dropped: ReturnType<typeof emptyDroppedFiles>;
  overCap: boolean;
  setAside: Set<string>;
};

type IgnoreMatcherLike = {
  add: (dir: string, text: string) => void;
  isIgnored: (rel: string, kind: "file" | "dir") => boolean;
};

type ClientGitignore = { IgnoreMatcher: new () => IgnoreMatcherLike };

/** Import the frontend module the same URL the browser's bundler resolves. */
async function importClient<T>(rel: string): Promise<T> {
  const spec = new URL(rel, import.meta.url).href;
  return (await import(/* @vite-ignore */ spec)) as unknown as T;
}

/** What one walk over one folder learned, in the two numbers the screen shows. */
type WalkResult = {
  /** files the folder offered, `.git` excluded — the number the two add up to */
  files: number;
  /** paths in the history branch: sent in their own budget, never scanned */
  gitFiles: number;
  /** what the browser's reader admitted to the read */
  admitted: number;
  /** what the scan read of those — the number printed under "Scan complete" */
  analysed: number;
  dropped: ReturnType<typeof emptyDroppedFiles>;
  setAside: string[];
};

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

/** One `const NAME = <expr>;` literal read out of a source file. */
function constExpr(rel: string, name: string): string {
  const m = new RegExp(`const ${name} = ([^;]+);`).exec(read(rel));
  expect(m, `${rel} no longer declares const ${name} = <literal>;`).toBeTruthy();
  return m![1]!.trim();
}

const evaluate = (expr: string): number =>
  expr.split("*").reduce((acc, factor) => acc * Number(factor.trim().replace(/_/g, "")), 1);

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
      "backend/tests/public-surface-claims.test.ts",
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
  }, // reads to the next person as a broken claim, which it is not. // default as soon as the machine is busy — and a guard that times out under load // A walk of the whole checkout, `.git` included, needs longer than vitest's 5 s
  30_000);

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

  it("G — ARCHITECTURE names the real sort key and every route file", () => {
    const arch = read("docs/ARCHITECTURE.md");
    const mapper = read("backend/src/utils/cityMapper.ts");
    expect(mapper, "the sort key changed shape — re-read it before re-wording").toMatch(
      /roleWeight\(f\) \* 1_000_000 \+ worst \* 1000/,
    );
    expect(
      arch,
      "the detailFiles sentence claims a Threat×√LOC weight that no code holds",
    ).not.toMatch(/√LOC|Threat×√|Math\.sqrt/);
    expect(arch, "the sentence must name the additive key").toMatch(/roleWeight/);
    for (const file of readdirSync(path.join(REPO, "backend/src/server/routes"))) {
      expect(
        arch,
        `docs/ARCHITECTURE.md's route list omits ${file} — add it where routes are listed`,
      ).toContain(file.replace(".ts", ""));
    }
  });

  it("H — UI_REVIEW cites the clip guard, not a README line number", () => {
    const review = read("docs/UI_REVIEW.md");
    expect(
      review,
      "a `README.md:<n>` citation rots the moment the README moves — name the guard instead",
    ).not.toMatch(/README\.md:\d+/);
    expect(review).toContain("backend/tests/beleg-04-demo-clip.test.ts");
  });

  it("I — .env.example admits the one frontend variable and carries no line-number pointer", () => {
    const env = read(".env.example");
    const vite = read("frontend/vite.config.ts");
    expect(vite, "the proxy stopped reading BACKEND_PORT?").toContain(
      'process.env.BACKEND_PORT ?? "4000"',
    );
    expect(env, ".env.example must document BACKEND_PORT with the truth").toContain("BACKEND_PORT");
    expect(env).toMatch(/vite\.config\.ts/);
    expect(env, "the frontend reads one variable — the file may not say otherwise").not.toMatch(
      /reads no environment variables/,
    );
    expect(
      env,
      "symbol+path references, not line numbers — index.ts:<n> pointers go stale",
    ).not.toMatch(/index\.ts:\d/);
  });

  it("J — GETTING_STARTED names the real demo label and pastes the real proxy lines", () => {
    const guide = read("docs/GETTING_STARTED.md");
    expect(guide, "the only demo CTA is the string i18n.ts carries").toContain(
      read("frontend/src/i18n.ts").match(/en: "(Explore demo)"/)![1]!,
    );
    expect(guide).not.toMatch(/explore a demo city first/i);
    expect(guide, "the proxy snippet must be the shipped one — 127.0.0.1 and BACKEND_PORT").toMatch(
      /127\.0\.0\.1:\$\{process\.env\.BACKEND_PORT/,
    );
    expect(guide, "the old localhost literal belongs to the bug that was fixed").not.toMatch(
      /'\/api': 'http:\/\/localhost:4000'/,
    );
  });
});
