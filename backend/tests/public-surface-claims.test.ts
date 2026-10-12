import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "fs";
import path from "path";

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
  const slug = url?.match(/github\.com\/([^/]+)\/([^/.]+)/);
  expect(url, "package.json must carry a repository url").toBeTruthy();
  expect(slug, `repository url is not a GitHub address: ${url}`).toBeTruthy();
  return `${slug![1]}/${slug![2]}`;
}

function testFileCount(dir: string): number {
  return readdirSync(path.join(REPO, dir)).filter((name) => /\.(test|spec)\.(ts|tsx)$/.test(name))
    .length;
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
    const remote = gitConfig.match(/url = https:\/\/github\.com\/([^/]+)\/([^/.]+)/);
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
      expect(f, `${rel}: frontend/tests holds ${frontend} files`).toBeLessThanOrEqual(frontend);
      expect(b, `${rel}: backend/tests holds ${backend} files`).toBeLessThanOrEqual(backend);
      expect(total, `${rel}: ${f} frontend + ${b} backend does not add up to ${total}`).toBe(f + b);
      expect(total, `${rel}: the tree holds ${frontend + backend} test files`).toBeLessThanOrEqual(
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
