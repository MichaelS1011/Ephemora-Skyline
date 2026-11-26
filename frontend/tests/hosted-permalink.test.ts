import { afterEach, describe, expect, it, vi } from "vitest";
import type { CityData } from "../src/city/types";
import * as hosted from "../src/demo/hosted";
import { city } from "./helpers/cityFixture";

type HostedCityLoader = (
  cityId: string,
  baseUrl: string,
) => Promise<{ kind: "city"; data: CityData } | { kind: "unsupported" }>;

function loader(): HostedCityLoader {
  const candidate = (hosted as unknown as { fetchHostedCity?: HostedCityLoader }).fetchHostedCity;
  expect(candidate, "the hosted permalink needs one tested static-city loader").toBeTypeOf(
    "function",
  );
  return candidate!;
}

function response(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("hosted permalink", () => {
  it("loads the known demo from the repository base path, never from /api", async () => {
    vi.stubEnv("VITE_HOSTED_DEMO", "1");
    const demo = city({ analysisId: "demo-001", totalFiles: 74 });
    const fetchSpy = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      response(demo),
    );
    vi.stubGlobal("fetch", fetchSpy);

    await expect(loader()("demo-001", "/Ephemora-Skyline/")).resolves.toEqual({
      kind: "city",
      data: demo,
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      "/Ephemora-Skyline/demo/city.json",
      expect.objectContaining({ headers: { Accept: "application/json" } }),
    );
    expect(fetchSpy.mock.calls.flat().join(" ")).not.toContain("/api");
  });

  it.each(["/", "/sub", "/sub/"])("keeps the baked resource under %s", async (baseUrl) => {
    const demo = city({ analysisId: "demo-001", totalFiles: 74 });
    const fetchSpy = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      response(demo),
    );
    vi.stubGlobal("fetch", fetchSpy);

    await loader()("demo-001", baseUrl);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe(hosted.demoCityPath(baseUrl));
  });

  it.each(["", "demo-002", "local-scan", "demo-001/../other", "%2Fapi%2Fhealth"])(
    "refuses unsupported id %j before constructing a URL or fetching",
    async (id) => {
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);

      await expect(loader()(id, "/Ephemora-Skyline/")).resolves.toEqual({ kind: "unsupported" });
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );

  it("refuses a baked payload that does not identify itself as the hosted demo", async () => {
    const fetchSpy = vi.fn(async () => response(city({ analysisId: "another-city" })));
    vi.stubGlobal("fetch", fetchSpy);

    await expect(loader()("demo-001", "/Ephemora-Skyline/")).rejects.toThrow(
      /baked demo identity/i,
    );
  });
});
