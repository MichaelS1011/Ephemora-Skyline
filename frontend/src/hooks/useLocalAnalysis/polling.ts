import { t, type Lang } from "../../i18n";
import type { CityData, DroppedFiles } from "../../city/types";
import type { AnalysisState } from "../useLocalAnalysis";

/**
 * The polling half of the local flow, split out of `useLocalAnalysis.ts` (K3):
 * ask `/api/status` until the job is complete, then load the finished city.
 * The hook owns every state cell and passes them in as `deps`; the interval
 * and the timeout live here, where they are used.
 */

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 20 * 60 * 1000;

type Ref<T> = { current: T };

export interface FetchCityDataDeps {
  langRef: Ref<Lang>;
  abortRef: Ref<AbortController | null>;
  runRef: Ref<number>;
  setErrorMessage: (s: string) => void;
  setErrorDetail: (s: string) => void;
  setState: (state: AnalysisState) => void;
  noSourceLine: (lang: Lang) => string;
  setCityData: (data: CityData) => void;
  setAnalysisId: (id: string) => void;
  setDropped: (d: DroppedFiles | null) => void;
}

export async function fetchCityData(
  deps: FetchCityDataDeps,
  id: string,
  run: number,
): Promise<void> {
  try {
    const res = await fetch(`/api/result/${encodeURIComponent(id)}/city`, {
      signal: deps.abortRef.current?.signal,
    });
    if (deps.runRef.current !== run) return;
    if (!res.ok) {
      // A link the server does not know is not a broken folder — it says so.
      deps.setErrorMessage(
        res.status === 404
          ? t(deps.langRef.current, "app.permalinkError")
          : t(deps.langRef.current, "scan.cityLoadFailed"),
      );
      deps.setErrorDetail(`HTTP ${res.status}`);
      deps.setState("error");
      return;
    }
    const data = (await res.json()) as CityData & { error?: string };
    if (data.error) {
      deps.setErrorMessage(t(deps.langRef.current, "scan.cityLoadFailed"));
      deps.setErrorDetail(data.error);
      deps.setState("error");
      return;
    }
    if (data.totalFiles === 0) {
      deps.setErrorMessage(deps.noSourceLine(deps.langRef.current));
      deps.setErrorDetail("the scan finished with no file in the city");
      deps.setState("error");
      return;
    }
    deps.setCityData(data);
    deps.setAnalysisId(id);
    window.history.replaceState(null, "", `?city=${encodeURIComponent(id)}`);
    // The scan's own counts win over the reader's: they include what only
    // the server could see.
    deps.setDropped(data.dropped ?? null);
    deps.setState("success");
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") return;
    if (deps.runRef.current !== run) return;
    deps.setErrorMessage(t(deps.langRef.current, "scan.cityLoadFailed"));
    deps.setErrorDetail(err instanceof Error ? err.message : String(err));
    deps.setState("error");
  }
}

export interface PollStatusDeps {
  langRef: Ref<Lang>;
  abortRef: Ref<AbortController | null>;
  runRef: Ref<number>;
  pollTimerRef: Ref<ReturnType<typeof setInterval> | null>;
  budgetWaitRef: Ref<number>;
  stopPolling: () => void;
  setBudgetWaitSec: (n: number) => void;
  publishStage: () => void;
  setErrorMessage: (s: string) => void;
  setErrorDetail: (s: string) => void;
  setState: (state: AnalysisState) => void;
  setAnalysisProgress: (n: number) => void;
  setStageOf: (raw: string | null) => void;
  fetchCityData: (id: string, run: number) => Promise<void>;
}

export function pollStatus(deps: PollStatusDeps, id: string, run: number): void {
  const startedAt = Date.now();
  let notFoundStreak = 0;
  // One request at a time: the tick fires every POLL_INTERVAL_MS while the
  // backend is busy scanning and slow to answer, so without this the queue
  // grew by one pending fetch per tick and late answers wrote progress out
  // of order.
  let inFlight = false;
  /** while the read budget is closed, ticks count down instead of fetching */
  let budgetUntil = 0;
  deps.stopPolling();
  deps.pollTimerRef.current = setInterval(() => {
    if (deps.runRef.current !== run) {
      deps.stopPolling();
      return;
    }
    const now = Date.now();
    if (budgetUntil > now) {
      // A closed budget is a wait with a number on it, not a frozen bar.
      const left = Math.ceil((budgetUntil - now) / 1000);
      if (left !== deps.budgetWaitRef.current) {
        deps.budgetWaitRef.current = left;
        deps.setBudgetWaitSec(left);
        deps.publishStage();
      }
      return;
    }
    if (inFlight) return;
    inFlight = true;
    void (async () => {
      try {
        if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
          deps.stopPolling();
          deps.setErrorMessage(t(deps.langRef.current, "scan.timedOut"));
          deps.setErrorDetail(`no answer within ${Math.round(POLL_TIMEOUT_MS / 60000)} min`);
          deps.setState("error");
          return;
        }
        const res = await fetch(`/api/status/${encodeURIComponent(id)}`, {
          signal: deps.abortRef.current?.signal,
        });
        if (deps.runRef.current !== run) return;
        if (res.status === 429) {
          const body = (await res.json().catch(() => ({}))) as {
            retryAfterSeconds?: number;
          };
          const header = Number(res.headers.get("RateLimit-Reset"));
          const seconds =
            body.retryAfterSeconds ??
            (Number.isFinite(header) && header > 0 ? header : Math.ceil(15 * 60));
          budgetUntil = Date.now() + seconds * 1000;
          deps.budgetWaitRef.current = seconds;
          deps.setBudgetWaitSec(seconds);
          deps.publishStage();
          return;
        }
        if (!res.ok) {
          // 404 = the job is gone (backend restarted) — not transient.
          // Other codes get a short grace period before giving up.
          notFoundStreak = res.status === 404 ? notFoundStreak + 1 : 0;
          if (notFoundStreak >= 3) {
            deps.stopPolling();
            deps.setErrorMessage(t(deps.langRef.current, "scan.jobGone"));
            deps.setErrorDetail("analysis job not found (404)");
            deps.setState("error");
          }
          return;
        }
        notFoundStreak = 0;
        if (deps.budgetWaitRef.current !== 0) {
          deps.budgetWaitRef.current = 0;
          deps.setBudgetWaitSec(0);
        }
        const data = (await res.json()) as {
          status?: string;
          progress?: number;
          stage?: string;
          error?: string;
        };
        if (typeof data.progress === "number") {
          deps.setAnalysisProgress(Math.min(100, Math.max(0, data.progress)));
        }
        if (typeof data.stage === "string" && data.stage) deps.setStageOf(data.stage);
        if (data.status === "complete") {
          deps.stopPolling();
          deps.setStageOf("Complete");
          void deps.fetchCityData(id, run);
        } else if (data.status === "failed") {
          deps.stopPolling();
          deps.setErrorMessage(t(deps.langRef.current, "scan.serverFailed"));
          deps.setErrorDetail(data.error ?? "the scan failed on the server");
          deps.setState("error");
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        // network hiccup — retry on next tick
      } finally {
        inFlight = false;
      }
    })();
  }, POLL_INTERVAL_MS);
}
