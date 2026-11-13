// @vitest-environment jsdom
/**
 * The second visit's question, asked without a click.
 *
 * "What changed since the scan of 11 Oct" is the one question a developer
 * asks on coming back, and a card that waits for a click answers it only to
 * people who knew to ask. So the row asks on arrival — silently, once, and
 * only when an earlier scan of the same folder exists.
 *
 * Two harness facts found while writing this, both real: the card draws only
 * once the build is done (CityTree raises `built`), and a spy that outlives
 * its case makes the next case count the last one's calls.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContextCard } from "../src/components/ContextCard";
import { SinceLastScan } from "../src/components/SinceLastScan";
import { useStore } from "../src/stores/useStore";
import { city } from "./helpers/cityFixture";
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the comparison asks on arrival", () => {
  it("asks once when an earlier scan of this folder exists", async () => {
    window.localStorage.clear();
    useStore.setState({ focusPath: [] });
    useStore.getState().setCityData(city({ analysisId: "scan-1" }));
    useStore.getState().setCityData(city({ analysisId: "scan-2" }));
    // the card draws once the build is done — CityTree raises this in the app
    useStore.setState({ buildPhase: "built" });
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          before: "scan-1",
          after: "scan-2",
          checked: 0,
          present: [],
          gone: [],
          moved: [],
          unknown: [],
        }),
        { status: 200 },
      ),
    );
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(<ContextCard />));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(spy.mock.calls.filter((c) => String(c[0]).includes("/api/verify"))).toHaveLength(1);
    expect(host.querySelector("[data-since-last-scan]")?.getAttribute("data-since-last-scan")).toBe(
      "ran",
    );
    await act(async () => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });
  it("stays quiet on a first visit — no question, no sentence", async () => {
    window.localStorage.clear();
    useStore.setState({ verify: { status: "idle" } as never });
    useStore.setState({ focusPath: [] });
    useStore.getState().setCityData(city({ analysisId: "scan-first" }));
    useStore.setState({ buildPhase: "built" });
    const spy = vi.spyOn(globalThis, "fetch");
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(<ContextCard />));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(spy.mock.calls.filter((c) => String(c[0]).includes("/api/verify"))).toHaveLength(0);
    expect(host.querySelector("[data-since-last-scan]")?.getAttribute("data-since-last-scan")).toBe(
      "idle",
    );
    await act(async () => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });
});

describe("the new count is the door to the new findings", () => {
  const report = {
    before: "scan-1",
    after: "scan-2",
    checked: 2,
    present: [],
    gone: [],
    moved: [],
    newFindings: [
      {
        fingerprint: "fp-new",
        path: "src/new.ts",
        line: 3,
        type: "SQL_INJECTION",
        ruleId: "regex:SQL_INJECTION",
        severity: "P0",
      },
    ],
    newBySeverity: { P0: 1, P1: 0, P2: 0 },
    comparable: { ok: true, reasons: [] },
    unknown: [],
  };

  function mount(): { host: HTMLDivElement; root: ReturnType<typeof createRoot> } {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    return { host, root };
  }

  it("opens the findings panel with the new filter on", async () => {
    window.localStorage.clear();
    useStore.setState(useStore.getInitialState(), true);
    useStore.getState().setCityData(city({ analysisId: "scan-2" }));
    useStore.setState({
      showFindings: false,
      newFindingsOnly: false,
      verify: { status: "ran", report, beforeId: "scan-1" } as never,
    });
    const { host, root } = mount();
    await act(async () => root.render(<SinceLastScan lang="en" previousScan={false} />));
    const button = host.querySelector<HTMLButtonElement>("[data-since-new]");
    expect(button?.textContent).toContain("1 new");
    await act(async () => button?.click());
    expect(useStore.getState().showFindings).toBe(true);
    expect(useStore.getState().newFindingsOnly).toBe(true);
    await act(async () => root.unmount());
    host.remove();
  });

  it("replaces the counts with the reason a cross-scan comparison is not valid", async () => {
    window.localStorage.clear();
    useStore.setState(useStore.getInitialState(), true);
    useStore.getState().setCityData(city({ analysisId: "scan-2" }));
    useStore.setState({
      verify: {
        status: "ran",
        beforeId: "scan-1",
        report: {
          ...report,
          comparable: { ok: false, reasons: ["different-engines"] },
        },
      } as never,
    });
    const { host, root } = mount();
    await act(async () => root.render(<SinceLastScan lang="en" previousScan={false} />));
    expect(host.querySelector("[data-verify-not-comparable]")).not.toBeNull();
    expect(host.textContent).toContain("different scanners");
    expect(host.textContent).not.toContain("1 new");
    expect(host.textContent).not.toContain("unchanged");
    await act(async () => root.unmount());
    host.remove();
  });
});
