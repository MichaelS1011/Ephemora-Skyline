import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { GitleaksAdapter } from "../src/services/security/adapters/gitleaks-adapter.js";
import { relativeToClone } from "../src/services/security/adapter.js";
import { leakPath } from "../src/services/security/adapters/gitleaks-adapter.js";

/**
 * The key contract between a batch adapter and the merge in scanner.ts.
 *
 * gitleaks runs with `--source <clonePath>` and reports the file paths it is
 * given — ABSOLUTE ones. scanner.ts looks batch findings up by the repo-
 * relative path the analyzer recorded. The two never met, and every real
 * secret finding vanished in the merge with no error anywhere to show it.
 * The batch-merge contract test could not catch that: it stubs
 * scanRepository and hands back an already-relative key.
 */

// Same resolution order the adapter uses: PATH, then the usual prefixes.
function findBinary(): string | null {
  for (const candidate of ["gitleaks", "/opt/homebrew/bin/gitleaks", "/usr/local/bin/gitleaks"]) {
    try {
      execFileSync(candidate, ["version"], { stdio: "ignore", timeout: 5000 });
      return candidate;
    } catch {
      // next
    }
  }
  return null;
}

describe("relativeToClone", () => {
  it("turns a reported path under the scan root into the merge key", () => {
    expect(relativeToClone("/clone/x", "/clone/x/app/config.ts")).toBe("app/config.ts");
    // a root handed in with its trailing slash is the same root
    expect(relativeToClone("/clone/x/", "/clone/x/app/config.ts")).toBe("app/config.ts");
    // Windows separators arrive from tools run on a mounted path
    expect(relativeToClone("C:/clone", "C:\\clone\\app\\config.ts")).toBe("app/config.ts");
  });

  it("drops anything outside the scan root instead of keying it where nobody looks", () => {
    expect(relativeToClone("/clone/x", "/elsewhere/config.ts")).toBeUndefined();
    expect(relativeToClone("/clone/x", "/clone/xx/config.ts")).toBeUndefined();
    expect(relativeToClone("/clone/x", undefined)).toBeUndefined();
  });
});

describe("GitleaksAdapter.scanRepository keys", () => {
  const bin = findBinary();

  it.skipIf(!bin)(
    "keys findings by repo-relative path, not by the absolute path gitleaks echoed",
    async () => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), "codecity-gitleaks-keys-"));
      try {
        await fs.mkdir(path.join(dir, "app"), { recursive: true });
        await fs.writeFile(
          path.join(dir, "app", "config.ts"),
          'const pat = "ghp_aB3dE5fG7hI9jK1lM3nO5pQ7rS9tU1vW3xY5";\n',
          "utf-8",
        );

        const byFile = await new GitleaksAdapter().scanRepository(dir);
        expect(byFile, "gitleaks binary present but the scan returned null").not.toBeNull();
        const findings = byFile!.get("app/config.ts") ?? [];
        expect(findings).toHaveLength(1);
        expect(findings[0]!.type).toBe("HARDCODED_SECRET");
        expect(findings[0]!.severity).toBe("P0");
        expect(findings[0]!.line).toBe(1);
        // the absolute key is what made the finding unreachable in the merge
        expect([...byFile!.keys()]).not.toContain(path.join(dir, "app", "config.ts"));
      } finally {
        await fs.rm(dir, { recursive: true, force: true });
      }
    },
    60000,
  );
});

/**
 * The same keying question, in the other direction.
 *
 * `gitleaks detect` without `--no-git` walks commits and reports the path as
 * the commit holds it — repo-RELATIVE. The merge wants repo-relative, so the
 * relative form must pass through untouched instead of being thrown away for
 * not starting with the scan root. Before this, the shape mismatch dropped
 * every history secret, and the Deep profile scored exactly like Standard on
 * every repository — the chip promised a pass whose results nobody could see.
 */
describe("leakPath — both shapes one adapter produces", () => {
  it("keeps a commit-relative path as the merge key", () => {
    expect(leakPath("/clone/x", "config.ts")).toBe("config.ts");
    expect(leakPath("/clone/x", "./app/config.ts")).toBe("app/config.ts");
    expect(leakPath("/clone/x", "app\\config.ts")).toBe("app/config.ts");
  });

  it("still strips the absolute form the working-tree pass reports", () => {
    expect(leakPath("/clone/x", "/clone/x/app/config.ts")).toBe("app/config.ts");
    expect(leakPath("/clone/x", "/elsewhere/config.ts")).toBeUndefined();
    expect(leakPath("/clone/x", undefined)).toBeUndefined();
  });
});

describe("a secret that only lives in git history", () => {
  const bin = findBinary();
  const gitAvailable = (() => {
    try {
      execFileSync("git", ["--version"], { stdio: "ignore", timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  })();

  it.skipIf(!bin || !gitAvailable)(
    "reaches the caller with gitHistory and is absent without it",
    async () => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), "codecity-gitleaks-history-"));
      const clean = 'export const name = "app";\n';
      const committed =
        'export const name = "app";\nconst API_KEY = "aK9d2Fq7Xz4Lm8Nr1Bv5Cs3Ty6Uw0Pg2Hj4Kl";\n';
      const git = (...args: string[]): void => {
        execFileSync("git", args, { cwd: dir, stdio: "ignore" });
      };
      try {
        await fs.writeFile(path.join(dir, "config.ts"), clean);
        git("init", "-q");
        git("add", "config.ts");
        git("-c", "user.email=t@local", "-c", "user.name=t", "commit", "-qm", "first");
        await fs.writeFile(path.join(dir, "config.ts"), committed);
        git("add", "config.ts");
        git("-c", "user.email=t@local", "-c", "user.name=t", "commit", "-qm", "oops");
        await fs.writeFile(path.join(dir, "config.ts"), clean);
        git("add", "config.ts");
        git("-c", "user.email=t@local", "-c", "user.name=t", "commit", "-qm", "remove it again");

        const deep = await new GitleaksAdapter().scanRepository(dir, { gitHistory: true });
        expect(deep, "gitleaks binary present but the scan returned null").not.toBeNull();
        const fromHistory = deep!.get("config.ts") ?? [];
        expect(
          fromHistory.some((i) => i.provenance === "gitleaks-history"),
          "the committed-then-removed key must surface as a history finding",
        ).toBe(true);

        const standard = await new GitleaksAdapter().scanRepository(dir);
        expect(standard!.get("config.ts") ?? [], "the working tree holds no secret").toHaveLength(
          0,
        );
      } finally {
        await fs.rm(dir, { recursive: true, force: true });
      }
    },
    90000,
  );
});
