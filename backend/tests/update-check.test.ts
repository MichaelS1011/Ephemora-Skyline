import { describe, it, expect, vi, afterEach } from "vitest";
import { isNewerVersion, currentVersion } from "../src/server/routes/update-check.js";

/**
 * Version comparison plus the update route with `fetch` stubbed: no child
 * process and no network reach this file, so it stays as-is — nothing here
 * can time out under foreign load.
 */
describe("isNewerVersion", () => {
  it("detects a higher minor/patch/major", () => {
    expect(isNewerVersion("0.2.0", "0.1.0")).toBe(true);
    expect(isNewerVersion("0.1.1", "0.1.0")).toBe(true);
    expect(isNewerVersion("1.0.0", "0.9.9")).toBe(true);
  });

  it("treats equal and older versions as no update", () => {
    expect(isNewerVersion("0.1.0", "0.1.0")).toBe(false);
    expect(isNewerVersion("0.0.9", "0.1.0")).toBe(false);
  });

  it("tolerates a v prefix and unparsable tags", () => {
    expect(isNewerVersion("v0.2.0", "0.1.0")).toBe(true);
    expect(isNewerVersion("not-a-version", "0.1.0")).toBe(false);
  });
});

describe("GET /api/update/check", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  async function call(githubStatus: number | "throw", githubBody: unknown) {
    vi.resetModules();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        if (githubStatus === "throw") throw new Error("network down");
        return new Response(JSON.stringify(githubBody), { status: githubStatus });
      }),
    );
    const { handleUpdateCheck } = await import("../src/server/routes/update-check.js");
    const json = vi.fn();
    const res = { json } as unknown as import("express").Response;
    await handleUpdateCheck({} as never, res);
    return (json as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Record<string, unknown>;
  }

  it("reports an available update when a newer release exists", async () => {
    const data = await call(200, {
      tag_name: "v99.0.0",
      html_url: "https://github.com/x/r/releases/tag/v99.0.0",
    });
    expect(data.updateAvailable).toBe(true);
    expect(data.latest).toBe("v99.0.0");
    expect(data.current).toBe(currentVersion());
  });

  it("answers calmly when no release exists yet (404)", async () => {
    const data = await call(404, { message: "Not Found" });
    expect(data.updateAvailable).toBe(false);
    expect(data.latest).toBeNull();
    expect(data.offline).toBeUndefined();
  });

  it("answers offline instead of failing when GitHub is unreachable", async () => {
    const data = await call("throw", null);
    expect(data.updateAvailable).toBe(false);
    expect(data.offline).toBe(true);
  });
});
