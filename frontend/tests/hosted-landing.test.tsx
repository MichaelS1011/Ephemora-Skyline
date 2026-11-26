// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnalyzePanel } from "../src/components/AnalyzePanel";
import App from "../src/App";
import { Landing } from "../src/components/Landing";
import { t } from "../src/i18n";
import { useStore } from "../src/stores/useStore";
import { city } from "./helpers/cityFixture";

vi.mock("../src/components/WorldCanvas", () => ({
  default: () => <div data-testid="hosted-world-stub" />,
}));

vi.mock("../src/hooks/useLocalAnalysis", () => ({
  useLocalAnalysis: () => ({
    state: "idle",
    notice: "",
    errorMessage: "",
    analysisProgress: 0,
    analysisStage: "",
    collected: { files: 0, bytes: 0, total: 0 },
    foundFiles: 0,
    elapsedSec: 0,
    budgetWaitSec: 0,
    stages: [],
    pickFolder: vi.fn(),
    openAlternativePicker: vi.fn(),
    canUseAlternativePicker: false,
    cancel: vi.fn(),
    isPicking: false,
    isAnalyzing: false,
  }),
}));

const pendingId = "12345678-1234-1234-1234-123456789abc";
let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  );
  localStorage.clear();
  localStorage.setItem("ephemora-skyline-pending-run:v1", pendingId);
  localStorage.setItem("ephemora-skyline-arrival-stage:v1", "done");
  localStorage.setItem(
    "ephemora-skyline-scan-excludes",
    JSON.stringify(["private-project/generated"]),
  );
  localStorage.setItem(
    "ephemora-skyline-recent:v1",
    JSON.stringify([
      { id: "older-local-scan", folder: "private-project", openedAt: 1, findings: 1, files: 1 },
    ]),
  );
  useStore.setState({
    cityData: null,
    isLoading: false,
    firstRun: false,
    prefs: { ...useStore.getState().prefs, lang: "en", updateCheck: true },
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("hosted app permalink", () => {
  it("loads the baked city through the app without constructing a backend request", async () => {
    vi.stubEnv("VITE_HOSTED_DEMO", "1");
    const demo = city({ analysisId: "demo-001", totalFiles: 74 });
    const fetchSpy = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => demo,
    }));
    vi.stubGlobal("fetch", fetchSpy);
    window.history.replaceState({}, "", "/?city=demo-001");

    try {
      await act(async () => {
        root.render(createElement(App));
      });

      expect(fetchSpy).toHaveBeenCalledOnce();
      expect(fetchSpy.mock.calls[0]?.[0]).toBe("/demo/city.json");
      expect(fetchSpy.mock.calls.flat().join(" ")).not.toContain("/api");
      expect(useStore.getState().cityData?.analysisId).toBe("demo-001");
      expect(useStore.getState().analysisId).toBe("demo-001");
      expect(host.querySelector('[data-testid="hosted-world-stub"]')).not.toBeNull();
      expect(host.querySelector('[data-testid="forge-mode-select"]')).toBeNull();
    } finally {
      window.history.replaceState({}, "", "/");
    }
  });
});

describe("hosted landing ignores local run history", () => {
  it("does not poll local history or mount local scan controls", async () => {
    vi.stubEnv("VITE_HOSTED_DEMO", "1");
    useStore.setState({ firstRun: true });
    localStorage.setItem("ephemora-skyline-arrival-stage:v1", "welcome");
    const fetchSpy = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => ({ status: "complete" }),
    }));
    vi.stubGlobal("fetch", fetchSpy);

    await act(async () => {
      root.render(createElement(Landing));
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(host.textContent).not.toContain("private-project");
    expect(host.textContent).not.toContain("private-project/generated");
    expect(host.querySelector('a[href*="older-local-scan"]')).toBeNull();
    expect(host.querySelector(".primary-button")).toBeNull();
    expect(host.querySelector(".scan-settings")).toBeNull();
    expect(host.querySelector('input[name="scanExcludes"]')).toBeNull();
    expect(host.querySelector(".landing-welcome")).toBeNull();
    expect(host.querySelector(".landing-guide")).toBeNull();
    expect(host.querySelector(".start-replay")).toBeNull();
    expect(host.querySelector(".landing-network")).toBeNull();
    expect(host.textContent).toContain(t("en", "landing.hostedBadge"));
    expect(host.textContent).not.toContain(t("en", "landing.localBadge"));
  });

  it("keeps the local picker, settings and disclosure in the counter-case", async () => {
    vi.stubEnv("VITE_HOSTED_DEMO", "0");
    const fetchSpy = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => ({ status: "complete", copies: 0, bytes: 0, stale: 0 }),
    }));
    vi.stubGlobal("fetch", fetchSpy);

    await act(async () => {
      root.render(createElement(Landing));
    });
    expect(
      fetchSpy.mock.calls.some(([input]) => String(input) === `/api/status/${pendingId}`),
    ).toBe(true);
    expect(host.querySelector('a[href*="older-local-scan"]')).not.toBeNull();
    expect(host.querySelector(".primary-button")).not.toBeNull();
    expect(host.querySelector(".scan-settings")).not.toBeNull();
    expect(host.querySelector<HTMLInputElement>('input[name="scanExcludes"]')?.value).toBe(
      "private-project/generated",
    );
    expect(host.querySelector(".start-replay")).not.toBeNull();
    expect(host.querySelector(".landing-network")).not.toBeNull();
  });

  it("names the hosted analyze control as the release destination it opens", async () => {
    vi.stubEnv("VITE_HOSTED_DEMO", "1");
    const open = vi.fn();
    vi.stubGlobal("open", open);

    await act(async () => {
      root.render(createElement(AnalyzePanel));
    });
    const trigger = host.querySelector<HTMLButtonElement>(".analyze-trigger")!;
    expect(trigger.getAttribute("aria-label")).toBe(t("en", "landing.hostedNoteLink"));
    expect(trigger.getAttribute("title")).toBe(t("en", "landing.hostedNoteLink"));
    act(() => trigger.click());
    expect(open).toHaveBeenCalledWith(
      "https://github.com/MichaelS1011/Ephemora-Skyline/releases/latest",
      "_blank",
      "noopener,noreferrer",
    );
    expect(host.querySelector("#analyze-panel")).toBeNull();
  });
});
