import { afterEach, describe, expect, it, vi } from "vitest";
import { cityLinkNotice, readRunArchiveBounds } from "../src/cityLifetime";
import * as hosted from "../src/demo/hosted";
import { t } from "../src/i18n";
import { fetchBackendReviews, pushBackendReviews, resetBackendVerdicts } from "../src/reviews";

type ApiFetch = (makeUrl: () => RequestInfo | URL, init?: RequestInit) => Promise<Response | null>;
type ApiHref = (makeUrl: () => string) => string | null;

function apiFetch(): ApiFetch {
  const candidate = (hosted as unknown as { localApiFetch?: ApiFetch }).localApiFetch;
  expect(candidate, "owned backend calls need one central hosted gate").toBeTypeOf("function");
  return candidate!;
}

function apiHref(): ApiHref {
  const candidate = (hosted as unknown as { localApiHref?: ApiHref }).localApiHref;
  expect(candidate, "backend links need the same central hosted gate").toBeTypeOf("function");
  return candidate!;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("central hosted backend policy", () => {
  it("refuses a request before its URL factory runs", async () => {
    vi.stubEnv("VITE_HOSTED_DEMO", "1");
    const fetchSpy = vi.fn();
    const makeUrl = vi.fn(() => "/api/health");
    vi.stubGlobal("fetch", fetchSpy);

    await expect(apiFetch()(makeUrl)).resolves.toBeNull();
    expect(makeUrl).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("keeps the local request contract unchanged", async () => {
    vi.stubEnv("VITE_HOSTED_DEMO", "0");
    const answer = { ok: true } as Response;
    const fetchSpy = vi.fn(async () => answer);
    const makeUrl = vi.fn(() => "/api/health");
    const init = { headers: { Accept: "application/json" } };
    vi.stubGlobal("fetch", fetchSpy);

    await expect(apiFetch()(makeUrl, init)).resolves.toBe(answer);
    expect(makeUrl).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith("/api/health", init);
  });

  it("does not construct a backend link in hosted mode", () => {
    vi.stubEnv("VITE_HOSTED_DEMO", "1");
    const makeUrl = vi.fn(() => "/api/result/demo-001/sarif");
    expect(apiHref()(makeUrl)).toBeNull();
    expect(makeUrl).not.toHaveBeenCalled();

    vi.stubEnv("VITE_HOSTED_DEMO", "0");
    expect(apiHref()(makeUrl)).toBe("/api/result/demo-001/sarif");
  });
});

describe("owned backend helpers fail closed when hosted", () => {
  it("does not read, write or reset verdicts over /api", async () => {
    vi.stubEnv("VITE_HOSTED_DEMO", "1");
    const fetchSpy = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    vi.stubGlobal("fetch", fetchSpy);

    await expect(fetchBackendReviews("demo-001", "project")).resolves.toEqual({ state: "absent" });
    expect(pushBackendReviews("demo-001", "project", {})).toBeUndefined();
    await expect(resetBackendVerdicts()).resolves.toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not ask /api/health and tells the truth about the static demo link", async () => {
    vi.stubEnv("VITE_HOSTED_DEMO", "1");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(readRunArchiveBounds()).resolves.toBeNull();
    await expect(cityLinkNotice("en")).resolves.toBe(t("en", "actions.linkCopiedHosted"));
    await expect(cityLinkNotice("de")).resolves.toBe(t("de", "actions.linkCopiedHosted"));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
