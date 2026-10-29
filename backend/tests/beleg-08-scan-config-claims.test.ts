import { describe, it, expect, vi } from "vitest";
import { mkdtemp, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import {
  CATEGORY_IDS,
  FINDING_CATEGORIES,
  categoryInfo,
  categoryOf,
} from "../src/services/security/categories.js";
import {
  MAX_CUSTOM_PATTERNS,
  defaultScanConfig,
  profilePreset,
  resolveConfig,
} from "../src/services/security/scan-config.js";
import { SecurityScanner } from "../src/services/security/scanner.js";

/**
 * Every `execFile("docker" | "semgrep" | …)` the product makes during this file is
 * recorded here instead of run — the offline switch is about which command the
 * adapter chooses, and no scanner binary is asked to execute anything.
 */
const calls = vi.hoisted(() => [] as string[][]);

vi.mock("child_process", () => ({
  execFile: (
    cmd: string,
    args: string[],
    optionsOrCallback: unknown,
    callback?: (err: unknown, stdout: string, stderr: string) => void,
  ) => {
    const done =
      typeof optionsOrCallback === "function" ? (optionsOrCallback as typeof callback) : callback;
    calls.push([cmd, ...args]);
    // `docker --version` succeeds, `docker image inspect` says: not on this disk
    if (args[0] === "--version") done?.(null, "Docker version 27.0.0", "");
    else if (args[0] === "image") done?.(new Error("Unable to find image locally"), "", "");
    else done?.(null, "", "");
  },
}));

/**
 * BELEG-02 — the scan-configuration table the README prints.
 *
 * Claim source: README.md:110-117 (the profile table, the "nine switchable
 * categories", the
 * custom-pattern sentence) and README.md:114/91 with docs/GETTING_STARTED.md:81-85
 * (the offline switch and what it closes). Data source: the presets
 * `resolveConfig()` applies, the category table the scanner derives from, the
 * custom patterns a scan actually runs, and the child-process calls the Semgrep
 * adapter makes. No sentence is read back out of the README.
 */

describe("nine categories a scan can be switched by (README.md:150)", () => {
  /**
   * The README's sentence names nine groups in order. The labels below are what
   * FINDING_CATEGORIES carries; the count and the order are the claim.
   */
  const documented = [
    { id: "injection", label: "Injection & execution" },
    { id: "secrets", label: "Secrets" },
    { id: "crypto", label: "Cryptography" },
    { id: "transport", label: "Transport & certificates" },
    { id: "exposure", label: "Data exposure" },
    { id: "dependencies", label: "Dependencies & supply chain" },
    { id: "permissions", label: "Permissions & destructive actions" },
    { id: "hygiene", label: "Code hygiene" },
    { id: "unclassified", label: "Not classified" },
  ] as const;

  it("offers nine, in the order the sentence lists them", () => {
    expect(FINDING_CATEGORIES).toHaveLength(9);
    expect(CATEGORY_IDS).toEqual(documented.map((d) => d.id));
  });

  it("names each one what the sentence names it", () => {
    for (const entry of documented) {
      expect(categoryInfo(entry.id).label, `category ${entry.id} is labelled differently`).toBe(
        entry.label,
      );
    }
  });

  it("keeps the last bucket for the rule that cites no CWE the taxonomy knows", () => {
    // docs/SCANNERS.md:7 "a bucket for findings whose rule carries no CWE the taxonomy knows"
    expect(categoryOf("MYSTERY_RULE")).toBe("unclassified");
    expect(categoryOf("MYSTERY_RULE", "CWE-999999")).toBe("unclassified");
    expect(categoryInfo("unclassified").meaning).toContain("no CWE");
    // and a known CWE never lands there
    for (const cwe of [89, 798, 326, 319, 532, 1104, 732, 22]) {
      expect(categoryOf("ANY_TYPE", `CWE-${cwe}`)).not.toBe("unclassified");
    }
  });

  it("can be switched per scan, and refuses a name it does not know", () => {
    const { config, errors } = resolveConfig({ enabledCategories: ["injection", "secrets"] });
    expect(errors).toEqual([]);
    expect(config.enabledCategories).toEqual(["injection", "secrets"]);
    expect(resolveConfig({ enabledCategories: ["whatever"] }).errors.join(" ")).toContain(
      "unknown category",
    );
  });
});

describe("the profile table (README.md:110-115)", () => {
  const base = defaultScanConfig();

  it("offers the four profiles the table has rows for", () => {
    const ids = ["quick", "standard", "deep", "custom"] as const;
    for (const id of ids) expect(profilePreset(id)).toBeDefined();
    expect(resolveConfig({ profile: "custom" }).errors).toEqual([]);
  });

  it("quick: heuristics, secrets and dependency advisories, critical only, no AST, no OSV, no Python lint", () => {
    const preset = profilePreset("quick")!;
    expect(preset.severityThreshold).toBe("P0");
    expect(preset.tools).toMatchObject({ semgrep: false, osv: false, ruff: false });
    expect(preset.tools!.gitleaks).toBe(true);
    expect(preset.tools!.dependencies).toBe(true);
    expect(preset.disabledFindingTypes).toContain("CONSOLE_USAGE");
  });

  it("standard: every check the row lists", () => {
    // the preset is empty because "standard" IS the default — so the default has
    // to carry every engine the row names, or the row is a promise about nothing
    expect(base.tools).toMatchObject({
      gitleaks: true,
      semgrep: true,
      dependencies: true,
      osv: true,
      ruff: true,
    });
    expect(base.tools.gitleaksHistory).toBe(false);
    expect(resolveConfig().config.profile).toBe("standard");
  });

  it("deep: standard plus the secret scan of the git history", () => {
    const preset = profilePreset("deep")!;
    expect(preset.tools!.gitleaksHistory).toBe(true);
    for (const engine of ["gitleaks", "semgrep", "dependencies", "osv", "ruff"] as const) {
      expect(preset.tools![engine], `deep switched ${engine} off`).toBe(base.tools[engine]);
    }
  });
});

describe("your own patterns (docs/SCANNERS.md:9)", () => {
  const pattern = {
    id: "NO_DIRECT_DOM",
    regex: "document\\.getElementById",
    severity: "P2" as const,
    message: "Direct DOM lookup in a component",
    fix: "use a ref",
    cwe: "CWE-79",
    languages: ["typescript"],
    fileExtensions: [".ts", ".tsx"],
  };

  it("carries severity, message, suggested fix, CWE and the language gate onto the finding", async () => {
    const scanner = new SecurityScanner(
      undefined,
      resolveConfig({ customPatterns: [pattern] }).config,
    );
    const issues = await scanner.scanFile(
      "src/view.tsx",
      "const n = document.getElementById('x');\n",
    );
    const hit = issues.find((i) => i.type === "CUSTOM_NO_DIRECT_DOM");
    expect(hit, "the custom pattern did not fire").toBeTruthy();
    expect(hit!.severity).toBe("P2");
    expect(hit!.message).toBe("Direct DOM lookup in a component");
    expect(hit!.fix).toBe("use a ref");
    expect(hit!.cwe).toBe("CWE-79");
    expect(categoryOf(hit!.type, hit!.cwe)).toBe("injection");
    // the gate held: a python file is not typescript
    const other = await scanner.scanFile("src/view.py", "document.getElementById('x')\n");
    expect(other.map((i) => i.type)).not.toContain("CUSTOM_NO_DIRECT_DOM");
  });

  it("stops at the twenty-five the sentence names", () => {
    // README.md:118 "up to 25 regular expressions"; backend/tests/scan-config.test.ts:74
    // already shows a longer list being cut, this pins the number itself.
    expect(MAX_CUSTOM_PATTERNS).toBe(25);
    const many = Array.from({ length: 26 }, (_, i) => ({
      id: `P_${i}`,
      regex: "abc",
      severity: "P1" as const,
      message: "msg",
    }));
    const { config, errors } = resolveConfig({ customPatterns: many });
    expect(config.customPatterns).toHaveLength(MAX_CUSTOM_PATTERNS);
    expect(errors.join(" ")).toContain(`truncated to ${MAX_CUSTOM_PATTERNS}`);
  });

  it("runs the ReDoS canary before a pattern is ever run (README.md:118)", () => {
    // README.md:118 "each validated against a ReDoS canary before it runs"
    const rejected = resolveConfig({
      customPatterns: [{ id: "BLOWUP", regex: "(a|aa)*b", severity: "P1", message: "x" }],
    });
    expect(rejected.errors.join(" "), "a blowup pattern was accepted").not.toBe("");
    expect(rejected.config.customPatterns).toHaveLength(0);
    // and the canary is a run, not a shape guess: an exponentially bad but
    // syntactically plain pattern is caught on its runtime, not its look
    const slow = resolveConfig({
      customPatterns: [{ id: "SLOW", regex: "(a+)+b", severity: "P1", message: "x" }],
    });
    expect(slow.errors.join(" ")).toMatch(/ReDoS|backtracking|canary/);
  });
});

describe("the docker fallback the offline switch closes (README.md:99, README.md:103, docs/GETTING_STARTED.md:81)", () => {
  const previous = process.env["SKYLINE_OFFLINE"];
  /**
   * `SEMGREP_DOCKER=0` is how a machine says "my Docker is not an engine source"
   * — the CI test job sets it, so that no badge depends on an image pull. Both
   * branches below therefore name the switch themselves instead of inheriting
   * it: on a laptop with Docker running they would otherwise say opposite things
   * from a runner.
   */
  const previousDockerSwitch = process.env["SEMGREP_DOCKER"];
  const schalteUm = (wert?: string) => {
    if (wert === undefined) delete process.env["SEMGREP_DOCKER"];
    else process.env["SEMGREP_DOCKER"] = wert;
  };

  it("inspects the named image instead of pulling it, and runs no container", async () => {
    calls.length = 0;
    const { SemgrepAdapter } = await import("../src/services/security/adapters/semgrep-adapter.js");
    const dir = await mkdtemp(path.join(tmpdir(), "beleg-docker-"));
    await writeFile(path.join(dir, "a.ts"), "eval(user);\n", "utf-8");
    process.env["SKYLINE_OFFLINE"] = "1";
    schalteUm(undefined);
    try {
      const adapter = new SemgrepAdapter();
      // no binary on PATH, docker present, nothing cached
      Object.assign(adapter, { binaryAvailable: false, dockerAvailable: null });
      const issues = await adapter.scanBatch(dir, new Map([["a.ts", "eval(user);\n"]]));
      expect(issues).toEqual([]);

      const inspected = calls.filter((c) => c[1] === "image");
      expect(inspected, "the offline path never asked the local image store").toHaveLength(1);
      // README.md:99 names this image and this tag
      expect(inspected[0]![3]).toBe("semgrep/semgrep:1.162.0");
      expect(
        calls.filter((c) => c[1] === "run"),
        "offline pulled a container anyway",
      ).toEqual([]);
    } finally {
      if (previous === undefined) delete process.env["SKYLINE_OFFLINE"];
      else process.env["SKYLINE_OFFLINE"] = previous;
      schalteUm(previousDockerSwitch);
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("asks nothing of the image store on a machine that refused Docker as an engine source", async () => {
    calls.length = 0;
    const { SemgrepAdapter } = await import("../src/services/security/adapters/semgrep-adapter.js");
    const dir = await mkdtemp(path.join(tmpdir(), "beleg-nodocker-"));
    await writeFile(path.join(dir, "a.ts"), "eval(user);\n", "utf-8");
    process.env["SKYLINE_OFFLINE"] = "1";
    // what `.github/workflows/ci.yml` sets for the test job
    schalteUm("0");
    try {
      const adapter = new SemgrepAdapter();
      Object.assign(adapter, { binaryAvailable: false, dockerAvailable: null });
      const issues = await adapter.scanBatch(dir, new Map([["a.ts", "eval(user);\n"]]));
      expect(issues).toEqual([]);
      // the refusal is the first thing the fallback reads: no version probe, no
      // inspect, no container — the engine reports itself as not run instead
      expect(calls.filter((c) => c[0] === "docker")).toEqual([]);
    } finally {
      if (previous === undefined) delete process.env["SKYLINE_OFFLINE"];
      else process.env["SKYLINE_OFFLINE"] = previous;
      schalteUm(previousDockerSwitch);
      await rm(dir, { recursive: true, force: true });
    }
  });
});
