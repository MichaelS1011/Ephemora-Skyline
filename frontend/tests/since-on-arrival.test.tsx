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
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
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
