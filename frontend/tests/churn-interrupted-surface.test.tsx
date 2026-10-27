// @vitest-environment jsdom
/**
 * The Git-Mauer as a state on the surfaces (Auftrag #25).
 *
 * When `.git` arrives CUT OFF (a pack over the 8 MB upload wall, the log dies
 * on `unable to read tree`), the city must not claim "No .git folder in this
 * upload" — the folder's .git DID arrive. The ScanSummary drop list names the
 * interruption, and the heat toggle's disabled CHURN/TIME tips name it too.
 * Nothing here changes the old sentences: with an absent .git the surfaces say
 * exactly what they said before, and the gitBudget row + its churn clause
 * stand untouched.
 *
 * Copy lives in `startCopy.ts` (the BRIDGE), not `dict.ts` — dict.ts is the
 * legend lane's file today; the bridge hands its keys over when the text lane
 * takes them.
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ScanSummary } from "../src/components/ScanSummary";
import { HeatmapToggle } from "../src/components/HeatmapToggle";
import { useStore } from "../src/stores/useStore";
import type { DroppedFiles } from "../src/city/types";
import { city, file } from "./helpers/cityFixture";

const DROP_ALL: DroppedFiles = {
  pathTooLong: 0,
  unsafePath: 0,
  tooLarge: 1, // the skipped 48 MB pack is honestly "too large"
  unreadable: 0,
  excluded: 0,
  gitIgnored: 0,
  gitBudget: 0,
  unsupportedFormat: 0,
};

const CUT_PROVENANCE = {
  regex: true,
  gitleaks: false,
  semgrep: false,
  churn: false,
  churnInterrupted: true,
};

const INTACT_PROVENANCE = { ...CUT_PROVENANCE, churnInterrupted: undefined };

let host: HTMLDivElement;
let root: Root;

async function mount(node: Parameters<Root["render"]>[0]): Promise<void> {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root.render(node);
  });
}

function useCityData(c: ReturnType<typeof city>, lang: "en" | "de" = "en"): void {
  const initial = useStore.getInitialState();
  useStore.setState(
    {
      ...initial,
      prefs: { ...initial.prefs, lang },
      cityData: c,
      analysisId: c.analysisId ?? "mauer-1",
      buildPhase: "built",
      heatChannel: "threat",
      heatDateMs: null,
    },
    true,
  );
}

const churnButton = (): HTMLButtonElement | undefined =>
  [...host.querySelectorAll<HTMLButtonElement>('button[role="radio"]')].find(
    (b) => b.textContent === "CHURN",
  );
const timeButton = (): HTMLButtonElement | undefined =>
  [...host.querySelectorAll<HTMLButtonElement>('button[role="radio"]')].find(
    (b) => b.textContent === "TIME",
  );

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("ScanSummary: the cut history is said, not swallowed", () => {
  it("English card names the interruption when the log died", async () => {
    useCityData(
      city({
        meta: {
          churn: false,
          deadCode: false,
          duplicates: false,
          cycles: false,
          coverage: false,
          blame: false,
        },
        dropped: DROP_ALL,
        scanProvenance: CUT_PROVENANCE,
        files: [file("a.ts", "TypeScript")],
      }),
    );
    await mount(createElement(ScanSummary));
    const text = (host.textContent ?? "").replace(/\s+/g, " ");
    expect(text).toContain("the git history arrived cut off");
    // the existing statements still stand next to it — the tooLarge row names
    // the skipped pack in the words it has always used
    expect(text).toContain("1 file was too large or unreadable");
  });

  it("German card says it in German", async () => {
    useCityData(
      city({
        meta: {
          churn: false,
          deadCode: false,
          duplicates: false,
          cycles: false,
          coverage: false,
          blame: false,
        },
        dropped: DROP_ALL,
        scanProvenance: CUT_PROVENANCE,
        files: [file("a.ts", "TypeScript")],
      }),
      "de",
    );
    await mount(createElement(ScanSummary));
    const text = (host.textContent ?? "").replace(/\s+/g, " ");
    expect(text).toContain("die Git-Geschichte kam abgeschnitten an");
  });

  it("an intact scan without the flag grows no new sentence (old payloads keep their words)", async () => {
    useCityData(
      city({
        meta: {
          churn: false,
          deadCode: false,
          duplicates: false,
          cycles: false,
          coverage: false,
          blame: false,
        },
        dropped: DROP_ALL,
        scanProvenance: INTACT_PROVENANCE,
        files: [file("a.ts", "TypeScript")],
      }),
    );
    await mount(createElement(ScanSummary));
    const text = (host.textContent ?? "").replace(/\s+/g, " ");
    expect(text).not.toContain("cut off");
    expect(text).not.toContain("abgeschnitten");
  });
});

describe("HeatmapToggle: the disabled CHURN/TIME tips tell the true reason", () => {
  it("with a cut-off history the CHURN tip refuses to claim there is no .git", async () => {
    useCityData(
      city({
        meta: {
          churn: false,
          deadCode: false,
          duplicates: false,
          cycles: false,
          coverage: false,
          blame: false,
        },
        scanProvenance: CUT_PROVENANCE,
        files: [file("a.ts", "TypeScript")],
      }),
    );
    await mount(createElement(HeatmapToggle));
    const tip = churnButton()?.getAttribute("data-tip") ?? "";
    expect(tip).toContain("cut off");
    expect(tip).not.toContain("No .git folder");
    const time = timeButton()?.getAttribute("data-tip") ?? "";
    expect(time).toContain("cut off");
  });

  it("without the flag the old honest sentences stand untouched", async () => {
    useCityData(
      city({
        meta: {
          churn: false,
          deadCode: false,
          duplicates: false,
          cycles: false,
          coverage: false,
          blame: false,
        },
        scanProvenance: INTACT_PROVENANCE,
        files: [file("a.ts", "TypeScript")],
      }),
    );
    await mount(createElement(HeatmapToggle));
    expect(churnButton()?.getAttribute("data-tip")).toContain("No .git folder");
    expect(timeButton()?.getAttribute("data-tip")).toContain("no scan moment or no git dates");
  });
});
