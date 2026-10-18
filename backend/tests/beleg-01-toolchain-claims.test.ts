import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import path from "path";

/**
 * BELEG-02 — the tool-chain numbers the public documents name.
 *
 * Every claim below is a sentence in README.md, docs/GETTING_STARTED.md or
 * docs/ARCHITECTURE.md. The DATA is never the sentence: it is the manifest that
 * npm resolved, the config file the runner reads, or the workflow file GitHub
 * acts on. A number that cannot be looked up is not a measurement, so each test
 * looks it up.
 */

const REPO = path.resolve(import.meta.dirname, "../..");
const read = (rel: string): string => readFileSync(path.join(REPO, rel), "utf-8");
const json = <T>(rel: string): T => JSON.parse(read(rel)) as T;

/** The version npm actually resolved for a workspace, hoisted or nested. */
function resolvedVersion(name: string, workspace?: "frontend" | "backend"): string {
  const candidates = [
    workspace ? `${workspace}/node_modules/${name}/package.json` : null,
    `node_modules/${name}/package.json`,
  ].filter((c): c is string => c !== null);
  for (const rel of candidates) {
    if (existsSync(path.join(REPO, rel))) return json<{ version: string }>(rel).version;
  }
  throw new Error(`${name} is not installed (looked in: ${candidates.join(", ")})`);
}

/** "5.9.3" → "5.9"; "0.186.0" → "0.186". */
const minor = (v: string): string => v.split(".").slice(0, 2).join(".");

/** Where the same package is installed more than once, those are the copies. */
function installedCopies(name: string): string[] {
  return ["node_modules", "frontend/node_modules", "backend/node_modules"]
    .filter((dir) => existsSync(path.join(REPO, `${dir}/${name}/package.json`)))
    .map((dir) => json<{ version: string }>(`${dir}/${name}/package.json`).version);
}

describe("the runtime the documents ask for (README.md:63, docs/GETTING_STARTED.md:22-27)", () => {
  const engines = json<{ engines: { node: string; npm: string } }>("package.json").engines;

  it("matches the Node versions required by the installed Vite runtime", () => {
    const vite = json<{ engines: { node: string } }>("node_modules/vite/package.json");
    expect(engines.node).toBe(vite.engines.node);
    expect(read("README.md")).toContain("Node 20.19+ or 22.12+");
  });

  it("asks for npm 10 or newer", () => {
    // README.md:26 "and **npm >= 10**", GETTING_STARTED.md:25 "≥ 10.0.0"
    expect(engines.npm).toBe(">=10.0.0");
  });

  it("declares the requirement in the one manifest npm reads for the install", () => {
    // Neither workspace repeats it: an `engines` block in a workspace would be a
    // second number to keep true. GETTING_STARTED.md:22 calls the table the
    // prerequisites, so the root manifest has to carry it.
    const root = json<Record<string, unknown>>("package.json");
    expect(root["engines"]).toBeDefined();
    expect(json<Record<string, unknown>>("backend/package.json")["engines"]).toBeUndefined();
    expect(json<Record<string, unknown>>("frontend/package.json")["engines"]).toBeUndefined();
  });
});

describe("the versions the badges and the stack tables name", () => {
  it("runs React 19 (README.md:9)", () => {
    expect(minor(resolvedVersion("react"))).toBe("19.2");
    expect(resolvedVersion("react").startsWith("19.")).toBe(true);
  });

  it("runs three.js revision 186 (README.md:10)", () => {
    // the badge reads r186; three versions the revision as 0.<revision>.<patch>
    expect(minor(resolvedVersion("three"))).toBe("0.186");
    expect(resolvedVersion("@types/three").startsWith("0.186.")).toBe(true);
  });

  it("runs React Three Fiber 9 and drei (docs/ARCHITECTURE.md:131-133, 182-183)", () => {
    expect(minor(resolvedVersion("@react-three/fiber", "frontend"))).toBe("9.7");
    expect(resolvedVersion("@react-three/drei", "frontend").split(".")[0]).toBe("10");
  });

  it("runs postprocessing 3, Zustand 5, Vite 8 and Tailwind (docs/ARCHITECTURE.md:184-187)", () => {
    expect(resolvedVersion("@react-three/postprocessing").split(".")[0]).toBe("3");
    expect(resolvedVersion("zustand").split(".")[0]).toBe("5");
    expect(resolvedVersion("vite").split(".")[0]).toBe("8");
    expect(resolvedVersion("tailwindcss").split(".")[0]).toBe("3");
  });

  it("builds with Rolldown, as the stack table claims (docs/ARCHITECTURE.md:186)", () => {
    const vite = json<{ dependencies: Record<string, string> }>("node_modules/vite/package.json");
    expect(Object.keys(vite.dependencies)).toContain("rolldown");
  });

  it("lints with ESLint 9 and @typescript-eslint 8 on a flat config (docs/ARCHITECTURE.md:176, 12)", () => {
    expect(resolvedVersion("eslint").split(".")[0]).toBe("9");
    expect(resolvedVersion("@typescript-eslint/eslint-plugin").split(".")[0]).toBe("8");
    // Flat Config v9 means eslint.config.js at the root, not .eslintrc.*
    expect(existsSync(path.join(REPO, "eslint.config.js"))).toBe(true);
    expect(existsSync(path.join(REPO, ".eslintrc.json"))).toBe(false);
  });

  it("orchestrates with Turborepo and hooks commits through Husky + lint-staged (docs/ARCHITECTURE.md:174, 178)", () => {
    expect(resolvedVersion("turbo").split(".")[0]).toBe("2");
    const hook = read(".husky/pre-commit").trim();
    expect(hook).toContain("lint-staged");
    const root = json<{ "lint-staged"?: Record<string, string[]> }>("package.json");
    expect(Object.keys(root["lint-staged"] ?? {}).length).toBeGreaterThan(0);
  });
});

describe("TypeScript: the one number the documents may not disagree about", () => {
  const installed = resolvedVersion("typescript");

  it("resolves to one installed compiler, not to two that answer to different names", () => {
    expect(installedCopies("typescript")).toEqual([installed]);
  });

  it("is the 5.9 line the README badge shows (README.md:8)", () => {
    expect(minor(installed)).toBe("5.9");
  });

  /**
   * docs/ARCHITECTURE.md:175 says "TypeScript 5.8 — typing". The repository
   * resolves a 5.9 compiler (see the test above), and README.md:8 badges 5.9.
   * This test is deliberately not a copy of either sentence: it reads the minor
   * out of the architecture table and compares it with the compiler on disk.
   * While the two differ the test stays red and the finding is reported.
   */
  it("matches the minor docs/ARCHITECTURE.md names (docs/ARCHITECTURE.md:175)", () => {
    const claimed = [...read("docs/ARCHITECTURE.md").matchAll(/TypeScript (\d+\.\d+)/g)].map(
      (m) => m[1]!,
    );
    expect(claimed.length, "no TypeScript version found in docs/ARCHITECTURE.md").toBeGreaterThan(
      0,
    );
    expect([...new Set(claimed)], "the architecture table names more than one version").toEqual([
      minor(installed),
    ]);
  });

  it("is not contradicted by the README badge either", () => {
    const badge = /typescript-(\d+\.\d+)/.exec(read("README.md"))?.[1];
    expect(badge, "no TypeScript badge in README.md").toBe(minor(installed));
  });
});

describe("the gates the README tells a reader to run (README.md:74-86)", () => {
  const root = json<{ scripts: Record<string, string> }>("package.json");
  const gateCommands = ["lint", "type-check", "test", "build"];

  it("ships a script for each of the four named gate commands", () => {
    for (const command of gateCommands) {
      expect(root.scripts[command], `npm run ${command} does not exist`).toBeTruthy();
    }
    // and each one goes through turbo, so both workspaces are gated
    for (const command of gateCommands) {
      expect(root.scripts[command]).toContain(`turbo run ${command}`);
    }
  });

  it("has the audit gate the fifth line of the block runs", () => {
    expect(existsSync(path.join(REPO, "scripts/audit-gate.mjs"))).toBe(true);
  });

  it("accepts exactly one advisory by name, the braces one it states", () => {
    // README.md:51: "Today one advisory is accepted: `braces` (GHSA-vfj7-8cjw-p6xm)"
    const gate = read("scripts/audit-gate.mjs");
    const allowed = gate.slice(gate.indexOf("const ALLOWED"), gate.indexOf("function audit"));
    const accepted = [
      ...new Set(
        [...allowed.matchAll(/GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}/g)].map((m) => m[0]),
      ),
    ];
    expect(accepted).toEqual(["GHSA-vfj7-8cjw-p6xm"]);
    // README.md:87 "except those explicitly accepted … with a reason and a re-check date"
    expect(allowed).toContain("why:");
    expect(allowed).toContain("recheck:");
    // …and the tree carries the fixed release the override asks for
    expect(json<{ overrides: Record<string, string> }>("package.json").overrides.braces).toBe(
      "^3.0.3",
    );
  });
});

describe("the names and cadences a reader can check (README.md:11, docs/GETTING_STARTED.md:40)", () => {
  it("is called codecity-cyberdefense in the package manifest (GETTING_STARTED.md:40)", () => {
    expect(json<{ name: string }>("package.json").name).toBe("codecity-cyberdefense");
  });

  it("asks Dependabot weekly, as the badge claims (README.md:11)", () => {
    const workflow = read(".github/dependabot.yml");
    const intervals = [...workflow.matchAll(/interval:\s*"?"?(\w+)/g)].map((m) => m[1]!);
    expect(intervals.length).toBeGreaterThan(0);
    expect(new Set(intervals)).toEqual(new Set(["weekly"]));
  });

  it("keeps the two workspaces the README's install line promises (README.md:68)", () => {
    expect(json<{ workspaces: string[] }>("package.json").workspaces).toEqual([
      "frontend",
      "backend",
    ]);
  });
});
