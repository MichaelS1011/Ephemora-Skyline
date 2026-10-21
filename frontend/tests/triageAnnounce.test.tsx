// @vitest-environment jsdom
// WCAG 4.1.3 (UX finding 7): a triage step moves the camera and the panel,
// but a screen reader heard only the button it had just left. The announcer is
// one live region that stays mounted, so its sentence changes with the queue.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TriageAnnouncer } from "../src/components/TriageAnnouncer";
import { useStore } from "../src/stores/useStore";
import type { CityData, CityFile } from "../src/city/types";

function makeFile(id: string, rule: string): CityFile {
  return {
    id,
    name: `${id}.ts`,
    path: `src/${id}.ts`,
    language: "TypeScript",
    linesOfCode: 10,
    cyclomaticComplexity: 1,
    threatLevel: "critical",
    findings: [
      {
        type: rule,
        label: "Rule class",
        labelDe: "Regelklasse",
        ruleId: rule,
        severity: "P0",
        line: 7,
        message: "scanner sentence",
      },
    ],
  } as unknown as CityFile;
}

function makeCity(files: CityFile[]): CityData {
  return {
    repo: { owner: "test", name: "repo", branch: "main" },
    analysisId: "scan-1",
    languages: { TypeScript: 10 * files.length },
    totalFiles: files.length,
    renderedFiles: files.length,
    threatScore: 1,
    findingsBySeverity: { P0: files.length, P1: 0, P2: 0 },
    fileConnections: [],
    dirConnections: [],
    meta: {},
    tree: {
      name: "root",
      path: "",
      fileCount: files.length,
      linesOfCode: 10 * files.length,
      findingsBySeverity: { P0: files.length, P1: 0, P2: 0 },
      children: [],
      detailFiles: files,
      remainingFiles: 0,
      districtFiles: [],
    },
  } as unknown as CityData;
}

const city = makeCity([makeFile("auth", "SQL_INJECTION"), makeFile("routes", "XSS")]);

let container: HTMLDivElement;
let root: Root;

async function mount(): Promise<void> {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<TriageAnnouncer />));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
}

const announced = (): string =>
  container.querySelector("[data-triage-announcer]")?.textContent ?? "";

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  useStore.setState(
    {
      ...useStore.getInitialState(),
      prefs: { ...useStore.getInitialState().prefs, lang: "de" },
      cityData: city,
      buildPhase: "built",
    },
    true,
  );
});

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  container?.remove();
  useStore.setState(useStore.getInitialState(), true);
  vi.unstubAllGlobals();
});

describe("the triage queue announces its steps", () => {
  it("stays silent outside a triage", async () => {
    await mount();
    expect(announced()).toBe("");
  });

  it("names position, file, line, severity and rule in German", async () => {
    await mount();
    await act(async () => useStore.getState().startTriage());
    expect(announced()).toContain("Triage 1 von 2");
    expect(announced()).toContain("auth.ts");
    expect(announced()).toContain("Zeile 7");
    expect(announced()).toContain("Kritisch");
    expect(announced()).toContain("Regelklasse");
  });

  it("changes with the step — not only with the camera", async () => {
    await mount();
    await act(async () => useStore.getState().startTriage());
    const first = announced();
    await act(async () => useStore.getState().nextTriage());
    expect(announced()).toContain("Triage 2 von 2");
    expect(announced()).toContain("routes.ts");
    expect(announced()).not.toBe(first);
  });

  it("speaks the panel's language", async () => {
    useStore.setState({ prefs: { ...useStore.getState().prefs, lang: "en" } });
    await mount();
    await act(async () => useStore.getState().startTriage());
    expect(announced()).toContain("Triage 1 of 2");
    expect(announced()).toContain("line 7");
    expect(announced()).toContain("Critical");
  });

  it("is a polite live region, not a focus trap", async () => {
    await mount();
    const region = container.querySelector("[data-triage-announcer]");
    expect(region?.getAttribute("role")).toBe("status");
    expect(region?.getAttribute("aria-live")).toBe("polite");
  });
});
