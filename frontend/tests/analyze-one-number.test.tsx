// @vitest-environment jsdom
/**
 * One number, once on the screen.
 *
 * The house rule is written down in the first-run note of the design record —
 * memory/project-first-run-und-silhouette-2026-10-18.md:18: "jede Zahl darf
 * auf einem Schirm nur einmal stehen." While a scan ran with the analyze panel
 * open, `analysisProgress` stood twice on the same plate: once as "▲ 42%" in
 * the toggle label (AnalyzePanel.tsx:134) and once as "42%" above the progress
 * bar (AnalyzePanel.tsx:28) — two carriers, and not even the same string
 * format. The bar is the carrier of the quantity (it also carries it as
 * aria-valuenow); the toggle keeps a WORD so a closed panel still says that
 * something runs. These cases mount the real panel at a known progress and
 * count the elements that render the number.
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnalyzePanel } from "../src/components/AnalyzePanel";
import { useStore } from "../src/stores/useStore";

const PROGRESS = 42;

vi.mock("../src/hooks/useLocalAnalysis", async (importOriginal) => {
  const actual = await importOriginal<object>();
  return {
    ...actual,
    useLocalAnalysis: () => ({
      state: "analyzing",
      notice: "",
      errorMessage: "",
      analysisProgress: PROGRESS,
      analysisStage: "scan",
      collected: { files: 0, bytes: 0, total: 0 },
      pickFolder: () => undefined,
      openAlternativePicker: () => undefined,
      canUseAlternativePicker: false,
      cancel: () => undefined,
      isPicking: false,
      isAnalyzing: true,
    }),
  };
});

let host: HTMLDivElement;
let root: Root;

async function mount(lang: "en" | "de", open: boolean): Promise<void> {
  const initial = useStore.getInitialState();
  useStore.setState(
    { ...initial, prefs: { ...initial.prefs, lang }, buildPhase: "built", analysisId: null },
    true,
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root.render(createElement(AnalyzePanel));
  });
  if (open) {
    await act(async () => {
      host.querySelector<HTMLButtonElement>(".analyze-trigger")?.click();
    });
  }
}

async function unmount(): Promise<void> {
  await act(async () => root.unmount());
  host.remove();
}

/** Leaf elements whose own text renders the number — the reader sees each one. */
function numberLeaves(needle: string): HTMLElement[] {
  return Array.from(host.querySelectorAll<HTMLElement>("*")).filter(
    (el) => el.children.length === 0 && (el.textContent ?? "").includes(needle),
  );
}

const trigger = (): HTMLElement => host.querySelector<HTMLButtonElement>(".analyze-trigger")!;

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});

afterEach(async () => {
  await unmount();
  vi.unstubAllGlobals();
});

describe("the running scan names its percentage once (memory/project-first-run-und-silhouette-2026-10-18.md:18)", () => {
  it("with the panel open, exactly one element on the plate renders 42%", async () => {
    await mount("en", true);
    const carriers = numberLeaves(`${PROGRESS}%`);
    expect(
      carriers.map((el) => el.textContent),
      "the toggle and the bar both print the same percentage",
    ).toHaveLength(1);
    expect(carriers[0]?.closest('[role="progressbar"]')).not.toBeNull();
  });

  it("the toggle keeps a word for running, not the number (EN)", async () => {
    await mount("en", true);
    expect(trigger().textContent).not.toContain(`${PROGRESS}%`);
    expect(trigger().textContent).toMatch(/ANALYZING/i);
  });

  it("the toggle keeps a word for running, not the number (DE)", async () => {
    await mount("de", true);
    expect(trigger().textContent).not.toContain(`${PROGRESS}%`);
    expect(trigger().textContent).toMatch(/ANALYSE LÄUFT/i);
  });

  it("with the panel closed the word still shows and no number is painted", async () => {
    await mount("en", false);
    expect(trigger().textContent).toMatch(/ANALYZING/i);
    expect(numberLeaves(`${PROGRESS}%`)).toHaveLength(0);
  });

  it("the bar still carries the quantity for assistive tech", async () => {
    await mount("en", true);
    const bar = host.querySelector('[role="progressbar"]');
    expect(bar?.getAttribute("aria-valuenow")).toBe(String(PROGRESS));
    expect(bar?.getAttribute("aria-label")).toContain(String(PROGRESS));
  });
});
