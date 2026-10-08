import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  SECURITY_ENGINES,
  isUncheckedClean,
  mergeEngineGaps,
  missingEnginesForFile,
  scanVerdict,
} from "../src/city/provenance";
import type { ScanProvenance } from "../src/city/types";

/**
 * S10, one truth: the engine list.
 *
 * The city axis (`scanVerdict`, from `provenance.ts`'s own table) and the
 * per-file axis (the payload's `unverifiedBy`, from
 * `backend/src/services/security/scan-depth.ts`) were two lists, and they had
 * drifted. Measured on the payload this machine holds as `demo-001`: the city
 * axis names THREE engines (`gitleaks, semgrep, npm audit`), the payload names
 * TWO (`gitleaks, semgrep`) across 73 of 73 files — 67 of which look clean on
 * screen. The dependency audit was therefore claimed as a gap where nothing
 * could have been audited (this demo has no lockfile at all, and
 * `dependency-adapter.ts:45-52` refuses to run without one), while a real
 * lockfile in a real repo would have carried no gap at all on its panel.
 *
 * One table now answers both questions, and these tests pin it against the
 * backend source: change the coverage on one side and this file fails.
 */

const BACKEND_SCAN_DEPTH = new URL(
  "../../backend/src/services/security/scan-depth.ts",
  import.meta.url,
);

/** The backend's own per-file table, read out of its source — the drift pin. */
function backendPerFileTable(): Array<{ key: string; languages: "all" | string[] }> {
  const src = readFileSync(BACKEND_SCAN_DEPTH, "utf8");
  const entries =
    src.match(/\{\s*key:\s*"(\w+)",[\s\S]*?languages:\s*(?:"all"|new Set\(\[[\s\S]*?\]\))/g) ?? [];
  return entries.map((entry) => {
    const key = entry.match(/key:\s*"(\w+)"/)?.[1]!;
    if (/"all"/.test(entry)) return { key, languages: "all" as const };
    const set = entry.match(/new Set\(\[([\s\S]*?)\]\)/)?.[1] ?? "";
    return { key, languages: [...set.matchAll(/"([^"]+)"/g)].map((m) => m[1]!) };
  });
}

const ALL_ON: ScanProvenance = {
  regex: true,
  gitleaks: true,
  semgrep: true,
  dependencies: true,
  osv: true,
  ruff: true,
};

/** What the file axis would name for one file of this payload. */
const onFile = (
  path: string,
  language: string,
  p: ScanProvenance = { ...ALL_ON, dependencies: false },
) => missingEnginesForFile({ path, language }, p);

describe("one engine table for both axes", () => {
  it("names exactly the engines the backend attributes to a file", () => {
    const backend = backendPerFileTable();
    expect(backend.length).toBeGreaterThan(0);
    const mine = SECURITY_ENGINES.filter((e) => e.perFile).map((e) => ({
      key: e.key as string,
      languages: e.fileLanguages === "all" ? ("all" as const) : [...e.fileLanguages],
    }));
    expect(mine.map((e) => e.key).sort()).toEqual(backend.map((e) => e.key).sort());
    for (const spec of mine) {
      const other = backend.find((e) => e.key === spec.key)!;
      expect([spec.key, spec.languages]).toEqual([other.key, other.languages]);
    }
  });

  it("does not call a docs file unverified by a scanner that never reads docs", () => {
    const off: ScanProvenance = { ...ALL_ON, semgrep: false };
    expect(onFile("docs/README.md", "Markdown", off)).toEqual([]);
    expect(onFile("src/app.ts", "TypeScript", off)).toEqual(["semgrep"]);
    expect(onFile("queries/users.sql", "SQL", off)).toEqual(["semgrep"]);
    // gitleaks reads everything, so its absence is a gap for every file
    expect(onFile("docs/README.md", "Markdown", { ...ALL_ON, gitleaks: false })).toEqual([
      "gitleaks",
    ]);
    expect(onFile("src/main.py", "Python", { ...ALL_ON, ruff: false })).toEqual(["ruff"]);
  });

  it("names the dependency audit on the lockfile, where its findings would live", () => {
    expect(onFile("package-lock.json", "JSON")).toEqual(["npm audit"]);
    expect(
      onFile("package-lock.json", "JSON", { ...ALL_ON, dependencies: false, osv: false }),
    ).toEqual(["npm audit", "osv-scanner"]);
    expect(onFile("src/app.ts", "TypeScript")).toEqual([]);
    expect(
      onFile("src/app.ts", "TypeScript", { ...ALL_ON, dependencies: false, gitleaks: false }),
    ).toEqual(["gitleaks"]);
  });

  it("holds every lockfile of every ecosystem to the CVE scan", () => {
    const off: ScanProvenance = { ...ALL_ON, osv: false };
    for (const path of [
      "package-lock.json",
      "requirements.txt",
      "Services/Go/go.mod",
      "Gemfile.lock",
      "yarn.lock",
      "pom.xml",
    ]) {
      expect([path, onFile(path, "JSON", off)]).toEqual([path, ["osv-scanner"]]);
    }
  });

  it("keeps a project without a lockfile from claiming a gap that cannot exist", () => {
    const languages = { TypeScript: 900, JavaScript: 100 };
    const without = ["src/app.ts", "src/main.js", "docs/README.md"];
    expect(scanVerdict({ ...ALL_ON, dependencies: false }, 0, languages, without)).toEqual({
      kind: "clear",
    });
    expect(
      scanVerdict({ ...ALL_ON, dependencies: false }, 0, languages, [
        ...without,
        "package-lock.json",
      ]),
    ).toEqual({ kind: "shallow", missing: ["npm audit"] });
    // a caller that only knows the languages keeps the looser fallback
    expect(scanVerdict({ ...ALL_ON, dependencies: false }, 0, languages)).toEqual({
      kind: "shallow",
      missing: ["npm audit"],
    });
  });

  it("answers both axes with the same engine names", () => {
    const cases: Array<{
      p: ScanProvenance;
      files: Record<string, string>;
      langs: Record<string, number>;
    }> = [
      {
        p: {
          ...ALL_ON,
          gitleaks: false,
          semgrep: false,
          dependencies: false,
          osv: false,
          ruff: false,
        },
        files: {
          "src/app.ts": "TypeScript",
          "package-lock.json": "JSON",
          "src/util.py": "Python",
          "requirements.txt": "Config",
          "docs/README.md": "Markdown",
        },
        langs: { TypeScript: 100, Python: 50, JSON: 400, Config: 20, Markdown: 10 },
      },
      {
        p: { ...ALL_ON, semgrep: false },
        files: { "docs/README.md": "Markdown" },
        langs: { Markdown: 10 },
      },
      {
        p: { ...ALL_ON, ruff: false, osv: false },
        files: { "app/main.py": "Python" },
        langs: { Python: 30 },
      },
      {
        p: { ...ALL_ON, dependencies: false },
        files: { "src/app.ts": "TypeScript" },
        langs: { TypeScript: 10 },
      },
    ];
    for (const { p, files, langs } of cases) {
      const paths = Object.keys(files);
      const fileAxis = new Set(paths.flatMap((path) => onFile(path, files[path]!, p)));
      const verdict = scanVerdict(p, 0, langs, paths);
      const cityAxis = verdict.kind === "shallow" ? verdict.missing : [];
      // every engine the file axis names is a real gap of the project, and the
      // project axis names no engine that no file of this payload needed
      expect([...fileAxis].sort()).toEqual(cityAxis.sort());
    }
  });
});

interface Probe {
  id?: string;
  unverifiedBy?: string[];
}

/** The three file lists a payload carries — the same ones the merger walks. */
function allProbeFiles(city: unknown): Map<string, Probe> {
  const root = city as {
    tree: { detailFiles?: Probe[]; children?: unknown[] };
    additionalFiles?: Probe[];
  };
  const out = new Map<string, Probe>();
  const take = (list?: Probe[]) => (list ?? []).forEach((f) => out.set(f.id ?? "", f));
  const stack: unknown[] = [root.tree];
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== "object") continue;
    const dir = node as { detailFiles?: Probe[]; districtFiles?: Probe[]; children?: unknown[] };
    take(dir.detailFiles);
    take(dir.districtFiles);
    if (Array.isArray(dir.children)) for (const c of dir.children) stack.push(c);
  }
  take(root.additionalFiles);
  return out;
}

function demoLikeCity(provenance: ScanProvenance) {
  const files = [
    {
      id: "a",
      path: "src/app.ts",
      language: "TypeScript",
      findings: [],
      unverifiedBy: ["gitleaks"],
    },
    { id: "b", path: "package-lock.json", language: "JSON", findings: [], unverifiedBy: [] },
    {
      id: "c",
      path: "services/pay/package-lock.json",
      language: "JSON",
      findings: [],
      unverifiedBy: ["semgrep"],
    },
    {
      id: "d",
      path: "src/main.py",
      language: "Python",
      findings: [{ severity: "P2" }],
      unverifiedBy: [],
    },
  ];
  return {
    scanProvenance: provenance,
    additionalFiles: [
      { id: "e", path: "requirements.txt", language: "Config", findings: [], unverifiedBy: [] },
    ],
    tree: {
      name: "root",
      children: [
        { name: "src", children: [], detailFiles: [files[0], files[1]], districtFiles: [] },
      ],
      detailFiles: [files[2], files[3]],
      districtFiles: [],
    },
  };
}

describe("closing the per-file gap in an arriving payload", () => {
  it("adds the audit that was switched off to the file it would have read", () => {
    const city = demoLikeCity({ ...ALL_ON, dependencies: false, osv: false, ruff: false });
    const changed = mergeEngineGaps(city);
    const byId = allProbeFiles(city);
    expect(changed).toBe(4);
    // the TS file was already attributed gitleaks, and npm audit does not read it
    expect(byId.get("a")!.unverifiedBy).toEqual(["gitleaks"]);
    expect(byId.get("b")!.unverifiedBy).toEqual(["npm audit", "osv-scanner"]);
    // an engine the backend named is never subtracted, only added to
    expect(byId.get("c")!.unverifiedBy).toEqual(["npm audit", "osv-scanner", "semgrep"]);
    expect(byId.get("d")!.unverifiedBy).toEqual(["ruff"]);
    expect(byId.get("e")!.unverifiedBy).toEqual(["osv-scanner"]);
  });

  it("leaves a fully scanned city exactly as it arrived", () => {
    const city = demoLikeCity({ ...ALL_ON });
    const before = JSON.stringify(city);
    expect([mergeEngineGaps(city), JSON.stringify(city)]).toEqual([0, before]);
  });

  it("has nothing to merge when the payload carries no provenance at all", () => {
    expect(mergeEngineGaps({ tree: { children: [] }, additionalFiles: [] })).toBe(0);
    expect(mergeEngineGaps(null)).toBe(0);
  });

  it("still refuses to call an unlooked-at file clean", () => {
    expect(isUncheckedClean({ findings: [], unverifiedBy: ["osv-scanner"] })).toBe(true);
    expect(isUncheckedClean({ findings: [], unverifiedBy: [] })).toBe(false);
  });

  it("reaches the panel with the same truth the summary shows", () => {
    const p: ScanProvenance = {
      ...ALL_ON,
      gitleaks: false,
      semgrep: false,
      dependencies: false,
      osv: false,
    };
    const city = demoLikeCity(p);
    mergeEngineGaps(city);
    const files = [...allProbeFiles(city).values()].flatMap((f) => f.unverifiedBy ?? []);
    const verdict = scanVerdict(p, 0, { TypeScript: 100, Python: 30, JSON: 400, Config: 20 }, [
      "src/app.ts",
      "package-lock.json",
      "services/pay/package-lock.json",
      "src/main.py",
      "requirements.txt",
    ]);
    const missing = verdict.kind === "shallow" ? verdict.missing : [];
    expect(new Set(files)).toEqual(new Set(missing));
  });
});
