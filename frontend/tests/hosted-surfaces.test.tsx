// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as CityFacts from "../src/city/facts";
import { useStore } from "../src/stores/useStore";
import { useOrigin } from "../src/stores/useOrigin";
import { AskLocalModel } from "../src/components/AskLocalModel";
import { SinceLastScan } from "../src/components/SinceLastScan";
import { TimeMachine } from "../src/components/TimeMachine";
import { SourceBlock } from "../src/components/FilePanels";
import { NeighbourTowns } from "../src/components/NeighbourTowns";
import { FindingsPanel } from "../src/components/FindingsPanel";
import { OPEN_TIME_MACHINE_EVENT } from "../src/components/timeMachineBus";
import { city, file, finding } from "./helpers/cityFixture";

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

const { ruleClassMounts } = vi.hoisted(() => ({ ruleClassMounts: vi.fn() }));
vi.mock("../src/city/facts", async (importOriginal) => {
  const actual = await importOriginal<typeof CityFacts>();
  return {
    ...actual,
    useRuleClassNames: () => {
      ruleClassMounts();
      return {};
    },
  };
});

let host: HTMLDivElement;
let root: Root;

function mount(node: React.ReactNode): void {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(node));
}

beforeEach(() => {
  vi.stubEnv("VITE_HOSTED_DEMO", "1");
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
  ruleClassMounts.mockClear();
  useOrigin.setState({ origin: "live" });
  useStore.setState({ cityData: null, analysisId: null, isLoading: false });
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("hosted surfaces do not start backend modules", () => {
  it("does not mount the local-model health consumer", async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ localModel: { configured: true, model: "local" } }),
    }));
    vi.stubGlobal("fetch", fetchSpy);
    useStore.setState({ analysisId: "demo-001" });

    await act(async () => {
      mount(<AskLocalModel finding={finding({ fingerprint: "fp-1" })} />);
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(host.textContent).toBe("");
  });

  it("does not start the automatic verify request", async () => {
    const runVerify = vi.fn(async () => {});
    useStore.setState({
      cityData: city({ analysisId: "demo-001" }),
      analysisId: "demo-001",
      runVerify,
    });

    await act(async () => {
      mount(<SinceLastScan lang="en" previousScan />);
    });
    expect(runVerify).not.toHaveBeenCalled();
    expect(host.textContent).toBe("");
  });

  it("does not open the Time Machine or register a backend-backed door", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    mount(<TimeMachine currentId="demo-001" onOpenCity={vi.fn()} />);

    act(() => window.dispatchEvent(new Event(OPEN_TIME_MACHINE_EVENT)));
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not auto-load or offer source from the backend", async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ lines: [] }),
    }));
    vi.stubGlobal("fetch", fetchSpy);
    const source = file("src/demo.ts", "TypeScript", [finding()]);

    await act(async () => {
      mount(<SourceBlock file={source} analysisId="demo-001" autoLoad />);
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(host.querySelector("[data-source-block]")).toBeNull();
  });

  it("does not mount the rule-class backend consumer", () => {
    mount(<FindingsPanel />);
    expect(ruleClassMounts).not.toHaveBeenCalled();
  });

  it("keeps the rule-class consumer in local mode", () => {
    vi.stubEnv("VITE_HOSTED_DEMO", "0");
    mount(<FindingsPanel />);
    expect(ruleClassMounts).toHaveBeenCalledTimes(1);
  });

  it("does not select or fetch neighbour cities from local browser history", async () => {
    localStorage.setItem(
      "ephemora-skyline-recent:v1",
      JSON.stringify([
        { id: "older-local-scan", folder: "private-project", openedAt: 1, findings: 1, files: 1 },
      ]),
    );
    const fetchSpy = vi.fn(() => new Promise(() => {}));
    vi.stubGlobal("fetch", fetchSpy);
    useStore.setState({ cityData: city({ analysisId: "demo-001" }), analysisId: "demo-001" });

    await act(async () => {
      mount(<NeighbourTowns />);
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
