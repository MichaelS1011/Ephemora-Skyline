import { useCallback } from "react";
import { t } from "../i18n";
import { useStore, type TestFileResultInfo } from "../stores/useStore";

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 14 * 60 * 1000;

/** A run survives closing its file card. Recursive polling prevents overlapping
 * requests; a project change never receives the previous project's results. */
export function useTestRunner() {
  const runTests = useCallback(async (files?: string[]): Promise<void> => {
    const state = useStore.getState();
    const analysisId = state.analysisId;
    if (!analysisId || ["installing", "running"].includes(state.testRun.status)) return;
    const lang = state.prefs.lang;
    const current = () => useStore.getState().analysisId === analysisId;
    const update = (status: "installing" | "running" | "complete" | "failed", stage: string) => {
      if (current()) useStore.getState().setTestRun({ status, stage });
    };
    useStore.setState({
      testResults: files
        ? Object.fromEntries(
            Object.entries(state.testResults).filter(([path]) => !files.includes(path)),
          )
        : {},
    });
    update("installing", t(lang, "test.preparing"));
    try {
      const res = await fetch(`/api/tests/${encodeURIComponent(analysisId)}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(files ? { files } : {}),
      });
      const data = (await res.json()) as { runId?: string; error?: string };
      if (!current()) return;
      if (!res.ok || !data.runId) {
        update("failed", `${t(lang, "test.failed")}${data.error ? `: ${data.error}` : ""}`);
        return;
      }
      const runId = data.runId;
      const started = Date.now();
      const poll = async (): Promise<void> => {
        if (!current()) return;
        if (Date.now() - started > POLL_TIMEOUT_MS) {
          update("failed", t(lang, "test.timeout"));
          return;
        }
        try {
          const response = await fetch(`/api/tests/run/${encodeURIComponent(runId)}`);
          if (!current()) return;
          if (response.status === 404) {
            update("failed", t(lang, "test.expired"));
            return;
          }
          if (!response.ok) throw new Error("poll failed");
          const result = (await response.json()) as {
            status: string;
            error?: string;
            result?: {
              totalTests: number;
              failedTests: number;
              passedTests?: number;
              skippedTests?: number;
              failedSuites?: number;
              files: TestFileResultInfo[];
            };
          };
          if (!current()) return;
          if (result.status === "installing" || result.status === "running") {
            update(
              result.status,
              t(lang, result.status === "installing" ? "test.installing" : "test.running"),
            );
          } else if (result.status === "failed") {
            update("failed", `${t(lang, "test.failed")}${result.error ? `: ${result.error}` : ""}`);
            return;
          } else if (result.status === "complete" && result.result) {
            const summary = result.result;
            useStore.getState().setTestResults(summary.files);
            const skipped = summary.skippedTests ?? 0;
            const passed =
              summary.passedTests ?? summary.totalTests - summary.failedTests - skipped;
            update(
              "complete",
              t(lang, "test.summary", { passed, failed: summary.failedTests, skipped }) +
                (summary.failedSuites
                  ? ` · ${t(lang, "test.failedSuites", { count: summary.failedSuites })}`
                  : ""),
            );
            return;
          } else {
            update("failed", t(lang, "test.noResults"));
            return;
          }
        } catch {
          /* Transient connection failures retry within the deadline. */
        }
        if (current()) setTimeout(() => void poll(), POLL_INTERVAL_MS);
      };
      await poll();
    } catch {
      update("failed", t(lang, "test.backend"));
    }
  }, []);
  return { runTests };
}
