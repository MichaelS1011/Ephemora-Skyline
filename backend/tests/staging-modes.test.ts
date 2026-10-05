import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

/**
 * The staged copy is the user's own source tree, dropped under the shared
 * /tmp. Three leaks were measured there: the staging root itself came out of
 * umask at 0755, every base64-payload file (the `.git` contents) was written
 * with no mode at all and landed world-readable, and the gitleaks adapter
 * copied the scanned file into a temp dir with the same omission.
 *
 * A live scan now shows `-rw-------` for both the text file and `.git/config`
 * and `drwx------` for the root. This file pins the calls that produced that,
 * because `server/index.ts` cannot be imported in a test: importing it calls
 * listen() and sweeps $TMPDIR, which would delete the very copies being checked.
 */
const REPO = path.resolve(import.meta.dirname, "../..");
const read = (rel: string): string => readFileSync(path.join(REPO, rel), "utf-8");

describe("the staged copy's permissions", () => {
  const analyze = read("backend/src/server/routes/local-analyze.ts");

  it("owns the staging root instead of inheriting umask", () => {
    expect(analyze).toMatch(/fs\.mkdir\(root, \{ recursive: true, mode: 0o700 \}\)/);
    expect(analyze).toMatch(/fs\.chmod\(root, 0o700\)/);
  });

  it("writes every staged file owner-only, base64 payloads included", () => {
    const writes = [...analyze.matchAll(/await fs\.writeFile\(([^;]*);/gs)].map((m) => m[1]!);
    expect(writes.length).toBeGreaterThan(0);
    for (const w of writes) {
      expect(w, `writeFile without a mode: ${w.trim()}`).toContain("mode: 0o600");
    }
  });

  it("keeps the engine's temp copy of the scanned file owner-only", () => {
    const gitleaks = read("backend/src/services/security/adapters/gitleaks-adapter.ts");
    expect(gitleaks).toMatch(/writeFile\(tmpFile, content, \{ encoding: "utf-8", mode: 0o600 \}\)/);
  });
});
