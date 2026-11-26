import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  path.resolve(process.cwd(), "../.github/workflows/pages.yml"),
  "utf8",
);
const at = (needle: string): number => {
  const index = workflow.indexOf(needle);
  expect(index, `${needle} is missing from pages.yml`).toBeGreaterThanOrEqual(0);
  return index;
};

describe("Pages publishes only a gated static hosted build", () => {
  it("runs lint, typecheck, the complete tests and the dependency audit before the frontend build", () => {
    const lint = at("npm run lint");
    const types = at("npm run type-check");
    const tests = at("npm test");
    const audit = at("node scripts/audit-gate.mjs");
    const build = at('VITE_HOSTED_DEMO=1 npm run build --workspace frontend -- --base="$BASE"');
    const upload = at("actions/upload-pages-artifact@v4");

    expect(lint).toBeLessThan(types);
    expect(types).toBeLessThan(tests);
    expect(tests).toBeLessThan(audit);
    expect(audit).toBeLessThan(build);
    expect(build).toBeLessThan(upload);
  });

  it("keeps the demo-city check and builds under the repository base path", () => {
    expect(workflow).toContain("node scripts/demo-city.mjs --check");
    expect(workflow).toContain('BASE="/${GITHUB_REPOSITORY#*/}/"');
    expect(workflow).toContain("VITE_HOSTED_DEMO=1");
    expect(workflow).toContain("path: frontend/dist");
  });

  it("gives the build no Pages write token and fails on an empty artifact", () => {
    const build = workflow.slice(workflow.indexOf("  build:"), workflow.indexOf("  deploy:"));
    const deploy = workflow.slice(workflow.indexOf("  deploy:"));
    expect(build).toContain("permissions:\n      contents: read");
    expect(build).not.toContain("pages: write");
    expect(build).not.toContain("id-token: write");
    expect(deploy).toContain("permissions:\n      pages: write\n      id-token: write");
    expect(build).toContain("if-no-files-found: error");
  });

  it("reacts to root quality gates and lockfile changes, not only frontend files", () => {
    const triggers = workflow.slice(0, workflow.indexOf("concurrency:"));
    for (const changed of [
      '"backend/**"',
      '"package.json"',
      '"package-lock.json"',
      '"scripts/**"',
      '".github/workflows/ci.yml"',
    ]) {
      expect(triggers).toContain(changed);
    }
  });
});
