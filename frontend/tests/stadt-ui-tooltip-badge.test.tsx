// @vitest-environment jsdom
// The district badge had two holes, both measured against demo-001 (17 districts):
// — it stopped at P1, so a plot whose only findings are medium fell into the
//   "keine Funde" branch and wore the green of a checked sweep (1 district);
// — it never asked which engines ran, while 9 of the 17 districts hold nothing
//   but files the switched-off engines never looked at (the file line has
//   answered this since `isUncheckedClean`; the district line painted it green).
// The badge also never read the colour-blind preference.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Tooltip } from "../src/components/Tooltip";
import { useStore } from "../src/stores/useStore";
import { SEVERITY_CVD_COLOR, UNCHECKED_COLOR, severityColor } from "../src/city/palette";
import { missingEnginesForDistrict, uncheckedFileCount } from "../src/city/provenance";
import type { CityData, CityDir, CityFile } from "../src/city/types";

type Counts = { P0: number; P1: number; P2: number };

const ZERO: Counts = { P0: 0, P1: 0, P2: 0 };

/**
 * `unverifiedBy` marks every file the way the payload marks a file whose
 * covering engines did not run; `n` is how many files the plot holds. An
 * `aggregate` level ships no file list — the shape an upper district has.
 */
function district(
  path: string,
  counts: Counts,
  opts: { unverifiedBy?: string[]; n?: number; language?: string; aggregate?: boolean } = {},
): CityDir {
  const { unverifiedBy = [], n = 1, language = "TypeScript", aggregate = false } = opts;
  const ext = language === "Markdown" ? "md" : "ts";
  const files = Array.from({ length: n }, (_, i) => ({
    id: `f-${path}-${i}`,
    name: `a${i}.${ext}`,
    path: `${path}/a${i}.${ext}`,
    language,
    linesOfCode: 40,
    cyclomaticComplexity: 2,
    threatLevel:
      counts.P0 > 0 ? "critical" : counts.P1 > 0 ? "high" : counts.P2 ? "medium" : "safe",
    findings: [
      ...Array.from({ length: counts.P0 }, () => ({ severity: "P0", line: 1, message: "crit" })),
      ...Array.from({ length: counts.P1 }, () => ({ severity: "P1", line: 1, message: "high" })),
      ...Array.from({ length: counts.P2 }, () => ({ severity: "P2", line: 1, message: "med" })),
    ],
    unverifiedBy,
  })) as unknown as CityFile[];
  return {
    name: path.split("/").pop() ?? path,
    path,
    fileCount: n,
    unverifiedFiles: unverifiedBy.length > 0 ? n : 0,
    linesOfCode: 40 * n,
    languages: { [language]: 40 * n },
    findingsBySeverity: counts,
    threatScore: counts.P0 + counts.P1 + counts.P2,
    topFindings: [],
    children: [],
    detailFiles: aggregate ? [] : files,
    remainingFiles: aggregate ? n : 0,
    districtFiles: [],
  } as unknown as CityDir;
}

/** `enginesRan` is the difference between a checked sweep and an empty folder. */
const city = (dirs: CityDir[], enginesRan = false): CityData =>
  ({
    repo: { owner: "local", name: "probe", branch: "main" },
    analysisId: "scan-1",
    languages: { TypeScript: 40 },
    totalFiles: dirs.length,
    renderedFiles: dirs.length,
    findingsBySeverity: dirs.reduce<Counts>(
      (acc, d) => ({
        P0: acc.P0 + d.findingsBySeverity.P0,
        P1: acc.P1 + d.findingsBySeverity.P1,
        P2: acc.P2 + d.findingsBySeverity.P2,
      }),
      ZERO,
    ),
    fileConnections: [],
    dirConnections: [],
    meta: {},
    unverifiedEngines: enginesRan ? [] : ["gitleaks", "semgrep"],
    // demo-001's own state: the two security engines were switched off.
    scanProvenance: {
      regex: true,
      gitleaks: enginesRan,
      semgrep: enginesRan,
      dependencies: false,
      osv: false,
      ruff: false,
    },
    tree: { name: "probe", path: "", children: dirs, detailFiles: [], districtFiles: [] },
  }) as unknown as CityData;

let container: HTMLDivElement;
let root: Root;

async function hover(
  dir: CityDir,
  over: { colorblind?: boolean; enginesRan?: boolean } = {},
): Promise<void> {
  if (root) {
    await act(async () => root.unmount());
    container.remove();
  }
  container = document.createElement("div");
  document.body.append(container);
  useStore.setState(
    {
      ...useStore.getInitialState(),
      prefs: {
        ...useStore.getInitialState().prefs,
        lang: "de",
        colorblind: over.colorblind ?? false,
      },
      cityData: city([dir], over.enginesRan ?? false),
      buildPhase: "built",
      hoveredId: `block:${dir.path}`,
    },
    true,
  );
  root = createRoot(container);
  await act(async () => root.render(createElement(Tooltip)));
}

/** The badge is the coloured line in the card that carries a count. It has no
 *  class of its own, so the test finds it by what it says — the string is
 *  itself the claim under test. */
const badge = (): HTMLElement | null =>
  [...container.querySelectorAll("span")].find(
    (s) => /Fund|keine|geprüft/.test(s.textContent ?? "") && s.style.color !== "",
  ) ?? null;

/** jsdom hands inline colours back as rgb(), the palette writes hex. */
const rgb = (hex: string): string => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  container?.remove();
  useStore.setState(useStore.getInitialState(), true);
  vi.unstubAllGlobals();
});

describe("der Bezirksknopf nennt jede Stufe, die die Stadt trägt", () => {
  it("says the medium finding the district holds", async () => {
    await hover(district("frontend/src/stores", { P0: 0, P1: 0, P2: 1 }));
    expect(badge(), "a medium-only district still says keine Funde").toBeTruthy();
    expect(badge()!.textContent).toBe("1 mittlerer Fund");
  });

  it("pluralises it where the plot holds several", async () => {
    await hover(district("frontend/src/stores", { P0: 0, P1: 0, P2: 3 }));
    expect(badge()!.textContent).toBe("3 mittlere Funde");
  });

  it("keeps the alarm it already got right", async () => {
    await hover(district("a", { P0: 2, P1: 0, P2: 3 }));
    expect(badge()!.textContent).toBe("2 kritische Funde");
    await hover(district("b", { P0: 0, P1: 1, P2: 4 }));
    expect(badge()!.textContent).toBe("1 hoher Fund");
  });
});

describe("der Bezirksknopf weiß, ob überhaupt etwas hinsah", () => {
  /**
   * demo-001 holds 9 finding-free districts and every file in all 9 is marked
   * unverified by the two switched-off engines. Green there is a claim no
   * scanner earned.
   */
  it("names the engines that did not look, instead of going green", async () => {
    await hover(
      district("backend/src/models", ZERO, {
        unverifiedBy: ["gitleaks", "semgrep"],
        n: 3,
      }),
    );
    const shown = badge()!.textContent ?? "";
    expect(shown).not.toContain("keine Funde");
    expect(shown).toBe("3 Dateien, von gitleaks, semgrep nicht geprüft");
    expect(badge()!.style.color).toBe(rgb(UNCHECKED_COLOR));
  });

  it("counts one unverified file in the singular it means", async () => {
    await hover(district("one", ZERO, { unverifiedBy: ["semgrep"], n: 1 }));
    expect(badge()!.textContent).toBe("1 Datei, von gitleaks, semgrep nicht geprüft");
  });

  it("says none only where an engine really looked and found nothing", async () => {
    await hover(district("src", ZERO, { unverifiedBy: [] }), { enginesRan: true });
    expect(badge()!.textContent).toBe("keine Funde");
    expect(badge()!.style.color).not.toBe(rgb(UNCHECKED_COLOR));
  });

  /**
   * The narrower answer the payload makes possible: gitleaks reads every file,
   * semgrep only languages with behaviour. A plot of documents is unproven
   * ground for one engine, not for two.
   */
  it("names only the engines that could have found something here", async () => {
    const docs = district("docs", ZERO, { unverifiedBy: ["gitleaks"], n: 4, language: "Markdown" });
    await hover(docs);
    expect(badge()!.textContent).toBe("4 Dateien, von gitleaks nicht geprüft");
    expect(missingEnginesForDistrict(docs, city([docs]).scanProvenance)).toEqual(["gitleaks"]);
  });

  it("falls back to the district's own count where it ships no files", async () => {
    const aggregate = district("backend/src", ZERO, {
      unverifiedBy: ["gitleaks", "semgrep"],
      n: 8,
      aggregate: true,
    });
    expect(uncheckedFileCount(aggregate)).toBe(8);
    await hover(aggregate);
    expect(badge()!.textContent).toBe("8 Dateien, von gitleaks, semgrep nicht geprüft");
  });

  it("believes the payload that marks nothing unverified", async () => {
    const checked = district("src", ZERO, { unverifiedBy: [], n: 5 });
    expect(missingEnginesForDistrict(checked, city([checked]).scanProvenance)).toEqual([]);
    expect(uncheckedFileCount(checked)).toBe(0);
  });
});

describe("die Farbe ist nicht die einzige Botschaft, aber sie schaltet mit", () => {
  it("takes the colour-blind palette when the switch is on", async () => {
    const hit = district("c", { P0: 1, P1: 0, P2: 0 });
    await hover(hit);
    const plain = badge()!.style.color;
    await hover(hit, { colorblind: true });
    expect(badge()!.style.color, "the hover badge never reads the colour-blind switch").not.toBe(
      plain,
    );
    expect(badge()!.style.color).toBe(rgb(SEVERITY_CVD_COLOR.P0));
    expect(severityColor("P2", true)).toBe(SEVERITY_CVD_COLOR.P2);
  });
});
