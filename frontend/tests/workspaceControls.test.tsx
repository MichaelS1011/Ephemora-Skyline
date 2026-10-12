// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActionBar } from "../src/components/ActionBar";
import { FindingsPanel } from "../src/components/FindingsPanel";
import { useStore } from "../src/stores/useStore";
import type { CityData } from "../src/city/types";

const city: CityData = {
  repo: { owner: "local", name: "sample", branch: "main" },
  totalFiles: 1,
  renderedFiles: 1,
  totalLines: 20,
  languages: { TypeScript: 1 },
  findingsBySeverity: { P0: 1, P1: 0, P2: 1 },
  fileConnections: [],
  dirConnections: [],
  meta: {
    churn: false,
    deadCode: false,
    duplicates: false,
    cycles: false,
    coverage: false,
    blame: false,
  },
  tree: {
    name: "sample",
    path: "",
    fileCount: 1,
    linesOfCode: 20,
    languages: { TypeScript: 1 },
    findingsBySeverity: { P0: 1, P1: 0, P2: 1 },
    threatScore: 3,
    topFindings: [],
    children: [],
    remainingFiles: 0,
    districtFiles: [],
    detailFiles: [
      {
        id: "file:server.ts",
        name: "server.ts",
        path: "server.ts",
        language: "TypeScript",
        linesOfCode: 20,
        cyclomaticComplexity: 1,
        threatLevel: "critical",
        findings: [
          {
            severity: "P0",
            type: "EVAL_USAGE",
            line: 3,
            message: "Untrusted input can reach eval and execute arbitrary code in this process.",
          },
          {
            severity: "P2",
            type: "DEBUG_LOG",
            line: 9,
            message: "Debug output may expose request details.",
          },
        ],
      },
    ],
  },
};

let container: HTMLDivElement;
let root: Root;

function button(text: string): HTMLButtonElement {
  const result = Array.from(container.querySelectorAll("button")).find((element) =>
    element.textContent?.includes(text),
  );
  if (!result) throw new Error(`Button not found: ${text}`);
  return result;
}

async function click(element: HTMLElement): Promise<void> {
  await act(async () => element.click());
}

async function press(key: string): Promise<void> {
  await act(async () =>
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
    ),
  );
}

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  useStore.setState(
    {
      ...useStore.getInitialState(),
      cityData: city,
      buildPhase: "built",
      analysisId: "saved-scan",
    },
    true,
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root.render(
      <>
        <ActionBar />
        <FindingsPanel />
      </>,
    ),
  );
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("city action menu", () => {
  it("supports arrow navigation, Escape, and focus restoration", async () => {
    const more = button("More");
    await click(more);
    expect(more.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(button("Run tests"));
    await press("ArrowDown");
    expect(document.activeElement).toBe(button("City image or video"));
    await press("End");
    expect(document.activeElement).toBe(button("Copy city link"));
    await press("Escape");
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(more);
  });

  it("closes when clicking outside", async () => {
    await click(button("More"));
    await act(async () => document.body.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    expect(container.querySelector('[role="menu"]')).toBeNull();
  });

  it("skips unavailable actions in a demo city", async () => {
    await act(async () => useStore.setState({ analysisId: null }));
    await click(button("More"));
    expect(button("Run tests").disabled).toBe(true);
    expect(button("Copy city link").disabled).toBe(true);
    expect(document.activeElement).toBe(button("City image or video"));
  });

  it("explains clipboard failures instead of failing silently", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("Denied")) },
    });
    await click(button("More"));
    await click(button("Copy city link"));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Copy the address from your browser",
    );
  });

  it("opens the image and video studio from one menu action", async () => {
    const onOpen = vi.fn();
    window.addEventListener("ephemora:open-share-studio", onOpen, { once: true });
    await click(button("More"));
    await click(button("City image or video"));
    expect(onOpen).toHaveBeenCalledOnce();
    expect(container.querySelector('[role="menu"]')).toBeNull();
  });
});

describe("findings panel", () => {
  it.each([false, true])(
    "opens the mobile list from file details when showFindings is %s",
    async (showFindings) => {
      vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
      await act(async () =>
        useStore.setState({
          showFindings,
          selectedUnit: { kind: "file", id: "file:details.ts" },
        }),
      );
      await click(button("Findings"));
      expect(useStore.getState().selectedUnit).toBeNull();
      expect(useStore.getState().showFindings).toBe(true);
    },
  );

  it("preserves desktop selection while toggling the findings list", async () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
    const selectedUnit = { kind: "file" as const, id: "file:details.ts" };
    await act(async () => useStore.setState({ showFindings: true, selectedUnit }));
    await click(button("Findings"));
    expect(useStore.getState().selectedUnit).toEqual(selectedUnit);
    expect(useStore.getState().showFindings).toBe(false);
  });

  it("synchronizes priority filters and offers recovery from an empty filter", async () => {
    await click(button("Findings"));
    // The chip is labelled in the vocabulary the header uses; P0/P1/P2 stay in
    // the data and in the tooltip.
    expect(button("High")).toBeTruthy();
    await click(button("High"));
    expect(useStore.getState().threatFilter).toBe("P1");
    expect(container.textContent).toContain("No High findings in this scan.");
    await click(button("Show all priorities"));
    expect(useStore.getState().threatFilter).toBe("all");
    expect(container.textContent).toContain(
      "Untrusted input can reach eval and execute arbitrary code in this process.",
    );
    expect(container.textContent).toContain("Debug output may expose request details.");
  });

  it("lets Escape close the menu before the findings panel", async () => {
    const findings = button("Findings");
    findings.focus();
    await click(findings);
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Close findings list");
    await click(button("More"));
    await press("Escape");
    expect(useStore.getState().showFindings).toBe(true);
    expect(container.querySelector('[role="menu"]')).toBeNull();
    await press("Escape");
    expect(useStore.getState().showFindings).toBe(false);
    expect(document.activeElement).toBe(findings);
  });

  it("leaves the findings open while file details own Escape", async () => {
    await click(button("Findings"));
    await act(async () =>
      useStore.setState({ selectedUnit: { kind: "file", id: "file:details.ts" } }),
    );
    await press("Escape");
    expect(useStore.getState().showFindings).toBe(true);
  });

  it.each(["combobox", "dialog"])("leaves Escape to a focused %s", async (role) => {
    await click(button("Findings"));
    const surface = document.createElement(role === "combobox" ? "input" : "div");
    surface.setAttribute("role", role);
    surface.tabIndex = -1;
    container.append(surface);
    surface.focus();
    await press("Escape");
    expect(useStore.getState().showFindings).toBe(true);
    surface.remove();
  });
});
