"use client";

import { useCallback, useRef } from "react";
import { useStore } from "../stores/useStore";

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 12 * 60 * 1000; // install + run

/**
 * Runs the project's OWN tests from the staged copy on the local backend
 * (vitest/jest — the runner the project already uses). Results land in the
 * store per file, so the city can react: green shield for passing files,
 * cracks for failures.
 */
export function useTestRunner() {
  const setTestRun = useStore((s) => s.setTestRun);
  const setTestResults = useStore((s) => s.setTestResults);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  const runTests = useCallback(
    async (files?: string[]): Promise<void> => {
      const analysisId = useStore.getState().analysisId;
      if (
        !analysisId ||
        useStore.getState().testRun.status === "installing" ||
        useStore.getState().testRun.status === "running"
      ) {
        return;
      }
      stopPolling();
      setTestRun({ status: "installing", stage: "Preparing…" });

      try {
        const res = await fetch(`/api/tests/${encodeURIComponent(analysisId)}/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(files ? { files } : {}),
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          setTestRun({ status: "failed", stage: err.error ?? "Could not start the test run" });
          return;
        }
        const { runId } = (await res.json()) as { runId: string };

        const started = Date.now();
        pollTimer.current = setInterval(async () => {
          if (Date.now() - started > POLL_TIMEOUT_MS) {
            stopPolling();
            setTestRun({ status: "failed", stage: "Test run timed out" });
            return;
          }
          try {
            const poll = await fetch(`/api/tests/run/${encodeURIComponent(runId)}`);
            const data = (await poll.json()) as {
              status: "installing" | "running" | "complete" | "failed";
              stage?: string;
              error?: string;
              result?: {
                runner: string;
                totalTests: number;
                failedTests: number;
                files: Array<{
                  path: string;
                  status: "passed" | "failed";
                  tests: number;
                  failures: Array<{ name: string; message: string }>;
                }>;
              };
            };
            if (data.status === "installing" || data.status === "running") {
              setTestRun({ status: data.status, stage: data.stage ?? "" });
              return;
            }
            stopPolling();
            if (data.status === "failed") {
              setTestRun({ status: "failed", stage: data.error ?? "Test run failed" });
              return;
            }
            if (data.result) {
              setTestResults(data.result.files);
              setTestRun({
                status: "complete",
                stage: `${data.result.totalTests - data.result.failedTests}/${data.result.totalTests} tests passed`,
              });
            }
          } catch {
            /* transient poll error — next tick retries */
          }
        }, POLL_INTERVAL_MS);
      } catch {
        setTestRun({ status: "failed", stage: "Could not reach the local backend" });
      }
    },
    [setTestRun, setTestResults, stopPolling],
  );

  return { runTests };
}
