import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";

/**
 * `.env.example` used to advertise a GitHub token, a clone depth, a clone
 * timeout and a WebSocket URL that no line of code reads, while five variables
 * the process does read were missing from it. A settings file that is half
 * fiction teaches the reader to distrust all of it, so the pairing is checked
 * mechanically: documented keys must have a reader, readers must be documented.
 */
const REPO = path.resolve(import.meta.dirname, "../..");
const read = (rel: string): string => readFileSync(path.join(REPO, rel), "utf-8");

function backendSources(): string {
  const out: string[] = [];
  const walk = (rel: string): void => {
    for (const entry of readdirSync(path.join(REPO, rel), { withFileTypes: true })) {
      const child = path.posix.join(rel, entry.name);
      if (entry.isDirectory()) walk(child);
      else if (entry.name.endsWith(".ts")) out.push(read(child));
    }
  };
  walk("backend/src");
  return out.join("\n");
}

const SRC = backendSources();
const EXAMPLE = read(".env.example");
const documented = [...EXAMPLE.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]!);

/** Keys that are not ours to read, with the reason they stay in the file */
const NOT_READ_BY_US: Record<string, string> = {
  NODE_ENV: "consumed by Express and Node themselves (error rendering, JSON spacing)",
};

/** Names the process reads through a parameter or a constant, not `process.env.X` */
const READ_INDIRECTLY = ["HOST", "FRONTEND_ORIGIN", "SKYLINE_OFFLINE"];

/** Reads that are the platform's contract rather than a user setting */
const NOT_A_SETTING = ["PATH"];

describe("the environment example", () => {
  it("documents only keys a line of code reads", () => {
    for (const key of documented) {
      const read =
        SRC.includes(`process.env.${key}`) ||
        READ_INDIRECTLY.includes(key) ||
        !!NOT_READ_BY_US[key];
      expect(read, `${key} is documented but nothing reads it`).toBe(true);
    }
  });

  it("leaves no reader undocumented", () => {
    const readDirectly = [...SRC.matchAll(/process\.env[.[]"?'’]*([A-Z][A-Z0-9_]+)/g)].map(
      (m) => m[1]!,
    );
    const missing = [
      ...new Set([...readDirectly, ...READ_INDIRECTLY.filter((k) => SRC.includes(`"${k}"`))]),
    ].filter(
      (key) => !documented.includes(key) && !NOT_READ_BY_US[key] && !NOT_A_SETTING.includes(key),
    );
    expect(missing, `read by the process, absent from .env.example: ${missing.join(", ")}`).toEqual(
      [],
    );
  });

  it("keeps the two exception lists honest", () => {
    // an exception that no longer has a reader is a key that should be gone
    for (const key of Object.keys(NOT_READ_BY_US)) {
      expect(documented, `${key} is excepted but not documented`).toContain(key);
      expect(SRC.includes(`process.env.${key}`), `${key} is now read; drop the exception`).toBe(
        false,
      );
    }
    for (const key of NOT_A_SETTING) {
      expect(SRC.includes(`process.env.${key}`), `${key} is no longer read`).toBe(true);
    }
  });

  it("tells the truth about the frontend reading nothing", () => {
    const frontend = read("frontend/src/findings/fixes.ts");
    expect(frontend).toContain("process.env.API_KEY"); // example text, not a read
    const live = [...readdirSync(path.join(REPO, "frontend/src"), { recursive: true })]
      .filter((f) => String(f).endsWith(".ts") || String(f).endsWith(".tsx"))
      .map((f) => read(path.join("frontend/src", String(f))))
      .join("\n");
    expect(live.match(/import\.meta\.env\.[A-Z0-9_]+/g) ?? []).toEqual([]);
  });
});
