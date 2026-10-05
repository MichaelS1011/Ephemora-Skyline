import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";

/**
 * The image did not carry the rule pack. `shippedPacksRoot()` resolves
 * `<package>/rules` (backend/src/services/security/rule-packs.ts:50), the pack
 * is `default: true` — the one every profile falls back to when the user
 * selected none — and `Dockerfile.backend` copied only package.json, tsconfig,
 * src and dist. So the container listed a pack it did not have. CI has no
 * Docker job, which is exactly why this is asserted on the file itself.
 */
const REPO = path.resolve(import.meta.dirname, "../..");
const dockerfile = readFileSync(path.join(REPO, "docker/Dockerfile.backend"), "utf-8");

const stage = (name: string): string => {
  const froms = [...dockerfile.matchAll(/^FROM .*AS (\w+)$/gm)].map((m) => ({
    name: m[1]!,
    at: m.index!,
  }));
  const here = froms.find((f) => f.name === name);
  const next = froms[froms.indexOf(here!) + 1];
  return dockerfile.slice(here!.at + 1, next ? next.at : dockerfile.length);
};

describe("the backend image", () => {
  it("ships the bundled rule pack into the runner", () => {
    const runner = stage("runner");
    expect(runner).toMatch(/^COPY backend\/rules\/\s+\.\/backend\/rules\/$/m);
    // and the WORKDIR makes that path resolve where rule-packs.ts looks
    expect(runner).toMatch(/WORKDIR \/app\/backend/);
  });

  it("has a pack on disk with the name the copy claims", () => {
    const dir = path.join(REPO, "backend/rules/ephemora-core");
    const entries = readdirSync(dir);
    expect(entries).toContain("pack.json");
    const yaml = entries.filter((e) => /\.(ya?ml)$/.test(e));
    expect(yaml.length).toBeGreaterThan(0);
    const manifest = JSON.parse(readFileSync(path.join(dir, "pack.json"), "utf-8")) as {
      ruleCount: number;
      default?: boolean;
    };
    expect(manifest.default, "the pack has to be the fallback").toBe(true);
    expect(manifest.ruleCount).toBeGreaterThan(0);
  });
});
