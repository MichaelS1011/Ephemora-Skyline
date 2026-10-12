// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The dev proxy used to name the backend's port twice — once as a default in the
 * backend, once as a literal here. A second checkout therefore ran its own
 * backend on another port and its frontend kept talking to the *first* one, so a
 * server-side edit looked like it did nothing. The target now follows
 * BACKEND_PORT; this guard keeps the two facts that made the literal necessary:
 * loopback by number, and 4000 as the answer when nothing is set.
 */
const config = readFileSync(path.resolve(import.meta.dirname, "../vite.config.ts"), "utf-8");

describe("the dev server's proxy to the backend", () => {
  it("follows BACKEND_PORT instead of hardcoding a second default", () => {
    expect(config).toMatch(
      /target:\s*`http:\/\/127\.0\.0\.1:\$\{process\.env\.BACKEND_PORT \?\? "4000"\}`/,
    );
    expect(config, "no port left to drift").not.toContain('"http://127.0.0.1:4000"');
  });

  it("still names loopback by number, not by host name", () => {
    // `localhost` resolves to ::1 first on this platform and nothing listens there
    expect(config).toContain("http://127.0.0.1:");
    expect(config).not.toMatch(/target:\s*["'`]http:\/\/localhost/);
  });

  it("keeps the dev port the origin guard expects by default", () => {
    expect(config).toMatch(/port:\s*3010/);
  });
});
