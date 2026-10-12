// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTestRunner } from "../src/hooks/useTestRunner";
import { useStore } from "../src/stores/useStore";

let root: Root;
let host: HTMLDivElement;
let run: (files?: string[]) => Promise<void>;
function Harness() {
  run = useTestRunner().runTests;
  return null;
}
const reply = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});
beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  useStore.setState({ ...useStore.getInitialState(), analysisId: "own-project" }, true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(createElement(Harness)));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  useStore.setState(useStore.getInitialState(), true);
});
describe("project test execution experience", () => {
  it("keeps skipped tests distinct and maps results to the project-relative file", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(reply({ runId: "r" }))
      .mockResolvedValueOnce(
        reply({
          status: "complete",
          result: {
            totalTests: 2,
            passedTests: 0,
            failedTests: 0,
            skippedTests: 2,
            files: [
              {
                path: "frontend/tests/a.test.ts",
                status: "skipped",
                tests: 2,
                skippedTests: 2,
                failures: [],
              },
            ],
          },
        }),
      );
    vi.stubGlobal("fetch", fetch);
    await act(async () => run(["frontend/tests/a.test.ts"]));
    expect(useStore.getState().testResults["frontend/tests/a.test.ts"]?.status).toBe("skipped");
    expect(useStore.getState().testRun.stage).toBe("0 passed · 0 failed · 2 skipped");
    expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual({
      files: ["frontend/tests/a.test.ts"],
    });
    expect(vi.getTimerCount()).toBe(0);
  });
  it("does not apply a late response to a different project", async () => {
    let resolve!: (value: unknown) => void;
    const fetch = vi.fn().mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const pending = run();
    useStore.setState({ analysisId: "new-project", testRun: { status: "idle", stage: "" } });
    resolve(reply({ runId: "old-run" }));
    await pending;
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(useStore.getState().testRun.status).toBe("idle");
  });
  it("continues a run after closing the initiating card", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(reply({ runId: "r" }))
      .mockResolvedValueOnce(reply({ status: "running" }))
      .mockResolvedValueOnce(reply({ status: "failed", error: "Missing fixture" }));
    vi.stubGlobal("fetch", fetch);
    await run();
    await act(async () => root.render(null));
    await vi.advanceTimersByTimeAsync(1500);
    expect(useStore.getState().testRun.status).toBe("failed");
    expect(useStore.getState().testRun.stage).toContain("Missing fixture");
    expect(vi.getTimerCount()).toBe(0);
  });
  it("does not overlap slow status requests", async () => {
    let resolve!: (value: unknown) => void;
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(reply({ runId: "r" }))
      .mockReturnValueOnce(
        new Promise((r) => {
          resolve = r;
        }),
      );
    vi.stubGlobal("fetch", fetch);
    const pending = run();
    await Promise.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(6000);
    expect(fetch).toHaveBeenCalledTimes(2);
    resolve(reply({ status: "running" }));
    await pending;
    expect(vi.getTimerCount()).toBe(1);
  });
  it("reports an expired run immediately with recovery guidance", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(reply({ runId: "r" }))
        .mockResolvedValueOnce(reply({}, 404)),
    );
    await run();
    expect(useStore.getState().testRun.status).toBe("failed");
    expect(useStore.getState().testRun.stage).toContain("Scan the folder again");
    expect(vi.getTimerCount()).toBe(0);
  });
  it("blocks a second start while a run is active", async () => {
    useStore.setState({ testRun: { status: "running", stage: "running" } });
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await run();
    expect(fetch).not.toHaveBeenCalled();
  });
});
