import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pollStatus, type PollStatusDeps } from "../src/hooks/useLocalAnalysis/polling";
import { t } from "../src/i18n";

/**
 * The poller owes the reader two things this file guards: the first answer
 * must not wait a whole interval (a submitted job is often already queued),
 * and a run that goes quiet for ten minutes must say so in words on the stage
 * line — `scan.stalling`, both languages, never a colour-only signal.
 */

const ID = "11111111-2222-4333-8444-555555555555";

function statusResponse(body: Record<string, unknown>): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    headers: { get: () => null },
  } as unknown as Response;
}

function makeDeps(over: Partial<PollStatusDeps> = {}): PollStatusDeps {
  return {
    langRef: { current: "en" },
    abortRef: { current: null },
    runRef: { current: 1 },
    pollTimerRef: { current: null },
    budgetWaitRef: { current: 0 },
    stalledRef: { current: false },
    stopPolling: vi.fn(() => {
      const timer = deps.pollTimerRef.current;
      if (timer !== null) clearInterval(timer);
      deps.pollTimerRef.current = null;
    }),
    setBudgetWaitSec: vi.fn(),
    publishStage: vi.fn(),
    setErrorMessage: vi.fn(),
    setErrorDetail: vi.fn(),
    setState: vi.fn(),
    setAnalysisProgress: vi.fn(),
    setStageOf: vi.fn(),
    fetchCityData: vi.fn(async () => {}),
    ...over,
  };
}

let deps: PollStatusDeps;

beforeEach(() => {
  vi.useFakeTimers();
  deps = makeDeps();
});

afterEach(() => {
  if (deps.pollTimerRef.current !== null) clearInterval(deps.pollTimerRef.current);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** let the pending fetch promise settle under fake timers */
async function flush(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

describe("pollStatus: the first answer is immediate", () => {
  it("fetches status before the first interval elapses", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(statusResponse({ status: "running", progress: 5, stage: "Reading" }));
    pollStatus(deps, ID, 1);
    // No clock advanced at all — the old poller sat silent for two seconds here.
    await flush();
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/status/${ID}`,
      expect.objectContaining({ signal: undefined }),
    );
    expect(deps.setAnalysisProgress).toHaveBeenCalledWith(5);
  });
});

describe("pollStatus: the stall nudge", () => {
  it("says it in words once ten minutes pass without a move, both languages", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(statusResponse({ status: "running", progress: 40, stage: "Analysing" }));
    pollStatus(deps, ID, 1);
    await flush();
    expect(deps.stalledRef.current).toBe(false);

    // Ten minutes of the same bar: the hint flips on with a publish, as text.
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000 + 4000);
    expect(deps.stalledRef.current).toBe(true);
    expect(deps.publishStage).toHaveBeenCalled();
    // dictionary-driven in both languages, never an empty stand-in
    for (const lang of ["en", "de"] as const) {
      expect(t(lang, "scan.stalling").trim().length).toBeGreaterThan(10);
    }
    expect(fetchMock).toHaveBeenCalled();
  });

  it("falls silent again as soon as the server moves", async () => {
    let body: Record<string, unknown> = { status: "running", progress: 40, stage: "Analysing" };
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => statusResponse(body));
    pollStatus(deps, ID, 1);
    await flush();
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000 + 4000);
    expect(deps.stalledRef.current).toBe(true);

    body = { status: "running", progress: 41, stage: "Analysing" };
    await vi.advanceTimersByTimeAsync(2000);
    expect(deps.stalledRef.current).toBe(false);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("a fresh run starts without a stale hint", async () => {
    deps.stalledRef.current = true; // left over from a previous run
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      statusResponse({ status: "running", progress: 0, stage: "Queued" }),
    );
    pollStatus(deps, ID, 2);
    expect(deps.stalledRef.current).toBe(false);
    await flush();
  });
});
