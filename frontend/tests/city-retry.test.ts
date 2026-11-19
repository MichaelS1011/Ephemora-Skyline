// @vitest-environment jsdom
/**
 * The finish line of the local flow, measured in isolation:
 * — `fetchCityData` (polling.ts) used to hand a fully completed scan to a
 *   single unguarded GET: one proxy blip and the city was lost. It now asks
 *   again — with a short backoff, and it waits out a 409 `still_analyzing`
 *   instead of declaring a living scan dead. 404 stays instant, and a run
 *   that moved on is never answered.
 * — `uploadAndAnalyze` (upload.ts) must answer the server's structured
 *   refusals with the dictionary's sentences: the raw server wording belongs
 *   on the detail line, never in the headline.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchCityData, type FetchCityDataDeps } from "../src/hooks/useLocalAnalysis/polling";
import { uploadAndAnalyze, type UploadAndAnalyzeDeps } from "../src/hooks/useLocalAnalysis/upload";
import { t } from "../src/i18n";
import type { CityData, DroppedFiles } from "../src/city/types";
import type { LocalFile } from "../src/hooks/useLocalAnalysis";

const ID = "11111111-2222-4333-8444-555555555555";

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return {
    ok: status < 400,
    status,
    json: async () => body,
    headers: { get: (k: string) => headers[k] ?? headers[k.toLowerCase()] ?? null },
  } as unknown as Response;
}

const cityBody = { analysisId: ID, totalFiles: 3 } as unknown as CityData;

function makeFetchDeps(over: Partial<FetchCityDataDeps> = {}): FetchCityDataDeps {
  return {
    langRef: { current: "en" },
    abortRef: { current: null },
    runRef: { current: 0 },
    setErrorMessage: vi.fn(),
    setErrorDetail: vi.fn(),
    setState: vi.fn(),
    noSourceLine: () => "no source line",
    setCityData: vi.fn(),
    setAnalysisId: vi.fn(),
    setDropped: vi.fn(),
    ...over,
  };
}

function makeUploadDeps(over: Partial<UploadAndAnalyzeDeps> = {}): UploadAndAnalyzeDeps {
  return {
    langRef: { current: "en" },
    setErrorMessage: vi.fn(),
    setErrorDetail: vi.fn(),
    setAnalysisProgress: vi.fn(),
    setStageOf: vi.fn(),
    setState: vi.fn(),
    setDropped: vi.fn(),
    abortRef: { current: null },
    runRef: { current: 0 },
    jobIdRef: { current: null },
    waitingRef: { current: false },
    pollStatus: vi.fn(),
    maxFiles: 200,
    capLine: (_l, found, max) => `found ${found}, max ${max}`,
    bytesLine: (_l, files, bytes) => `${files} files, ${bytes} bytes`,
    noSourceLine: () => "no source line",
    ...over,
  };
}

describe("fetchCityData — the guarded city GET", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  async function stubFetch(...replies: Array<Response | Error>) {
    const fetchMock = vi.fn(async () => {
      const next = replies.shift();
      if (next instanceof Error) throw next;
      if (!next) throw new Error("stub exhausted");
      return next;
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("a 500 at the finish line is asked again, not mourned", async () => {
    const fetchMock = await stubFetch(
      jsonResponse({ error: "bad gateway" }, 500),
      jsonResponse(cityBody),
    );
    const deps = makeFetchDeps();

    const run = fetchCityData(deps, ID, 0);
    await vi.advanceTimersByTimeAsync(1_000); // 500ms backoff, then the second ask
    await run;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(deps.setCityData).toHaveBeenCalledWith(cityBody);
    expect(deps.setState).toHaveBeenLastCalledWith("success");
    expect(deps.setErrorMessage).not.toHaveBeenCalled();
  });

  it("a rejected fetch — a blip, not a verdict — is also asked again", async () => {
    const fetchMock = await stubFetch(new Error("network down"), jsonResponse(cityBody));
    const deps = makeFetchDeps();

    const run = fetchCityData(deps, ID, 0);
    await vi.advanceTimersByTimeAsync(1_000);
    await run;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(deps.setCityData).toHaveBeenCalledWith(cityBody);
    expect(deps.setState).toHaveBeenLastCalledWith("success");
  });

  it("409 still_analyzing is waited out, not called a failure", async () => {
    const fetchMock = await stubFetch(
      jsonResponse({ error: "scan still running", code: "still_analyzing" }, 409, {
        "Retry-After": "2",
      }),
      jsonResponse(cityBody),
    );
    const deps = makeFetchDeps();

    const run = fetchCityData(deps, ID, 0);
    await vi.advanceTimersByTimeAsync(2_100); // honor Retry-After: 2, then the second ask
    await run;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(deps.setCityData).toHaveBeenCalledWith(cityBody);
    expect(deps.setState).toHaveBeenLastCalledWith("success");
  });

  it("an unwell city eventually says so — honestly, with the status in the detail", async () => {
    const fetchMock = await stubFetch(
      jsonResponse({}, 500),
      jsonResponse({}, 500),
      jsonResponse({}, 500),
    );
    const deps = makeFetchDeps();

    const run = fetchCityData(deps, ID, 0);
    await vi.advanceTimersByTimeAsync(60_000);
    await run;

    expect(fetchMock).toHaveBeenCalledTimes(3); // two retries, then the give-up
    expect(deps.setErrorMessage).toHaveBeenCalledWith(t("en", "scan.cityLoadFailed"));
    expect(deps.setErrorDetail).toHaveBeenCalledWith("HTTP 500");
    expect(deps.setState).toHaveBeenLastCalledWith("error");
    expect(deps.setCityData).not.toHaveBeenCalled();
  });

  it("a 404 is answered at once — an unknown id will not appear on the third try", async () => {
    const fetchMock = await stubFetch(jsonResponse({ error: "no such analysis" }, 404));
    const deps = makeFetchDeps();

    await fetchCityData(deps, ID, 0);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(deps.setErrorMessage).toHaveBeenCalledWith(t("en", "app.permalinkError"));
    expect(deps.setErrorDetail).toHaveBeenCalledWith("HTTP 404");
    expect(deps.setState).toHaveBeenLastCalledWith("error");
  });

  it("a run that moved on is never answered", async () => {
    const fetchMock = await stubFetch(jsonResponse({}, 500), jsonResponse(cityBody));
    const deps = makeFetchDeps();

    const run = fetchCityData(deps, ID, 0);
    await vi.advanceTimersByTimeAsync(0); // first ask resolves into a backoff wait
    deps.runRef.current = 1; // the user picked another folder while we waited
    await vi.advanceTimersByTimeAsync(2_000);
    await run;

    expect(fetchMock).toHaveBeenCalledTimes(1); // never asked again after being abandoned
    expect(deps.setCityData).not.toHaveBeenCalled();
    expect(deps.setErrorMessage).not.toHaveBeenCalled();
    expect(deps.setState).not.toHaveBeenCalled();
  });

  it("an empty city is reported as no source, not as success", async () => {
    await stubFetch(jsonResponse({ totalFiles: 0 } as unknown as CityData));
    const deps = makeFetchDeps();

    await fetchCityData(deps, ID, 0);

    expect(deps.setErrorMessage).toHaveBeenCalledWith("no source line");
    expect(deps.setState).toHaveBeenLastCalledWith("error");
    expect(deps.setCityData).not.toHaveBeenCalled();
  });
});

describe("uploadAndAnalyze — structured refusals", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("duplicate_path gets the dictionary's sentence; the server's words stay the detail", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ error: "two files claim the same rel path", code: "duplicate_path" }, 400),
    );
    vi.stubGlobal("fetch", fetchMock);
    const deps = makeUploadDeps();
    const files: LocalFile[] = [{ path: "a.ts", content: "const a = 1;" }];
    const dropped = {} as DroppedFiles;

    await uploadAndAnalyze(deps, "fixture", files, dropped, 0);

    expect(deps.setErrorMessage).toHaveBeenCalledWith(t("en", "scan.duplicatePath"));
    expect(deps.setErrorDetail).toHaveBeenCalledWith("two files claim the same rel path");
    expect(deps.setDropped).toHaveBeenCalledWith(dropped);
    expect(deps.setState).toHaveBeenLastCalledWith("error");
  });

  it("a rate limit gets the countdown, never the server's raw phrase", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(
        { error: "you are going too fast", code: "rate_limited", retryAfterSeconds: 90 },
        429,
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const deps = makeUploadDeps();

    await uploadAndAnalyze(
      deps,
      "fixture",
      [{ path: "a.ts", content: "x" }],
      {} as DroppedFiles,
      0,
    );

    expect(deps.setErrorMessage).toHaveBeenCalledWith(
      `${t("en", "limit.hit", { s: 90 })} — ${t("en", "cap.hint")}`,
    );
    expect(deps.setErrorDetail).toHaveBeenCalledWith("you are going too fast");
    expect(deps.setState).toHaveBeenLastCalledWith("error");
  });
});
