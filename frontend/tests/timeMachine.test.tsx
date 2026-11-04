// @vitest-environment jsdom
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TimeMachine } from "../src/components/TimeMachine";
import { openTimeMachine } from "../src/components/timeMachineBus";
import { timeMachineText } from "../src/components/timeMachineCopy";
import { useStore } from "../src/stores/useStore";
import { city } from "./helpers/cityFixture";

const RECENT_KEY = "ephemora-skyline-recent:v1";
const NOW = city({
  analysisId: "scan-now",
  repo: { owner: "local", name: "shop", branch: "main" },
  totalFiles: 12,
  totalLines: 1000,
  renderedFiles: 9,
  findingsBySeverity: { P0: 2, P1: 1, P2: 0 },
});
const OLD = city({
  analysisId: "scan-old",
  repo: { owner: "local", name: "shop", branch: "main" },
  totalFiles: 10,
  totalLines: 900,
  renderedFiles: 8,
  findingsBySeverity: { P0: 1, P1: 1, P2: 3 },
});

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  window.localStorage.clear();
  window.localStorage.setItem(
    RECENT_KEY,
    JSON.stringify([
      { id: "scan-old", folder: "shop", openedAt: 1_700_000_000_000, findings: 5, files: 10 },
      { id: "scan-now", folder: "shop", openedAt: 1_800_000_000_000, findings: 3, files: 12 },
    ]),
  );
  useStore.setState({
    ...useStore.getState(),
    cityData: NOW,
    analysisId: "scan-now",
    prefs: { ...useStore.getState().prefs, lang: "en" },
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

async function show(element: ReactElement) {
  await act(async () => root.render(element));
}

function text(): string {
  return (host.textContent || "").replace(/\s+/g, " ").trim();
}

describe("the City Time Machine", () => {
  it("lists the same folder's eras and diffs a selected one against now", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => OLD });
    vi.stubGlobal("fetch", fetchMock);
    const open = vi.fn();

    await show(<TimeMachine currentId="scan-now" onOpenCity={open} />);
    await act(async () => openTimeMachine());
    expect(text()).toContain(timeMachineText("en", { key: "title" }));
    expect(text()).toContain(timeMachineText("en", { key: "current" }));

    const eras = host.querySelectorAll<HTMLButtonElement>(".tm-era");
    expect(eras).toHaveLength(2);
    await act(async () => eras[1]!.click());
    await act(async () => void (await Promise.resolve()));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/result/scan-old/city",
      expect.objectContaining({ headers: { Accept: "application/json" } }),
    );
    expect(text()).toContain(timeMachineText("en", { key: "diffTitle" }));
    expect(text()).toContain("+2");
    expect(text()).toContain("+100");
    expect(text()).toContain("+1");
  });

  it("says an era is unavailable instead of inventing numbers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }),
    );

    await show(<TimeMachine currentId="scan-now" onOpenCity={vi.fn()} />);
    await act(async () => openTimeMachine());
    const eras = host.querySelectorAll<HTMLButtonElement>(".tm-era");
    await act(async () => eras[1]!.click());
    await act(async () => void (await Promise.resolve()));

    expect(text()).toContain(timeMachineText("en", { key: "expiredTitle" }));
    expect(text()).not.toContain(timeMachineText("en", { key: "diffTitle" }));
  });

  it("returns to now through the same local loader", async () => {
    const open = vi.fn();
    await show(<TimeMachine currentId="scan-now" onOpenCity={open} />);
    await act(async () => openTimeMachine());

    const back = [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) =>
      (b.textContent || "").includes(timeMachineText("en", { key: "return" })),
    );
    await act(async () => back!.click());
    expect(open).toHaveBeenCalledWith("scan-now");
  });
});
