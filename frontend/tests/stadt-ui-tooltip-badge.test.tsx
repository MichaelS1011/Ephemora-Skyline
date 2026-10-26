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
import {
  SEVERITY_CVD_COLOR,
  UNCHECKED_COLOR,
  severityColor,
  severityTextColor,
} from "../src/city/palette";
import { missingEnginesForDistrict, uncheckedFileCount } from "../src/city/provenance";
import { addSeverityCounts, city, dir, file, finding, provenance } from "./helpers/cityFixture";
import type { CityData, CityDir, CityFinding, Severity } from "../src/city/types";

type Counts = { P0: number; P1: number; P2: number };

const ZERO: Counts = { P0: 0, P1: 0, P2: 0 };

/** The findings only carry the district's count onto each building; the badge
 *  reads the counts, so no kind of mistake is claimed here. */
const sample = (severity: Severity, message: string): CityFinding =>
  finding({ type: "SAMPLE", severity, line: 1, message, category: undefined });

/**
 * `unverifiedBy` marks every file the way the payload marks a file whose
 * covering engines did not run; `n` is how many files the plot holds. An
 * `aggregate` level ships no file list — the shape an upper district has.
 *
 * The counts, the file count and the unverified total are declared here because
 * the badge is what they are measured against; lines, languages and the weighted
 * risk follow from the buildings, the way `cityMapper.ts` adds them up.
 */
function district(
  path: string,
  counts: Counts,
  opts: { unverifiedBy?: string[]; n?: number; language?: string; aggregate?: boolean } = {},
): CityDir {
  const { unverifiedBy = [], n = 1, language = "TypeScript", aggregate = false } = opts;
  const findings = [
    ...Array.from({ length: counts.P0 }, () => sample("P0", "crit")),
    ...Array.from({ length: counts.P1 }, () => sample("P1", "high")),
    ...Array.from({ length: counts.P2 }, () => sample("P2", "med")),
  ];
  const files = Array.from({ length: n }, (_, i) =>
    file(
      `${path}/a${i}.${language === "Markdown" ? "md" : "ts"}`,
      language,
      findings,
      unverifiedBy,
    ),
  );
  return dir({
    path,
    fileCount: n,
    unverifiedFiles: unverifiedBy.length > 0 ? n : undefined,
    // an aggregate level ships no buildings, so its own language map is the only
    // truth about which engine would have looked here
    languages: { [language]: 40 * n },
    findingsBySeverity: counts,
    detailFiles: aggregate ? [] : files,
    remainingFiles: aggregate ? n : 0,
  });
}

/** `enginesRan` is the difference between a checked sweep and an empty folder. */
const cityOf = (dirs: CityDir[], enginesRan = false): CityData =>
  city({
    analysisId: "scan-1",
    findingsBySeverity: dirs.reduce<Counts>(
      (acc, d) => addSeverityCounts(acc, d.findingsBySeverity),
      ZERO,
    ),
    // demo-001's own state: the two security engines were switched off.
    unverifiedEngines: enginesRan ? [] : ["gitleaks", "semgrep"],
    scanProvenance: provenance({
      gitleaks: enginesRan,
      semgrep: enginesRan,
      dependencies: false,
      osv: false,
      ruff: false,
    }),
    tree: dir({ path: "", name: "probe", children: dirs }),
  });

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
      cityData: cityOf([dir], over.enginesRan ?? false),
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
    // Same grade, two inks: the WORD rides the shell's ladder, the unchecked
    // signal stays on the badge's wash and border — colour is never alone.
    // jsdom folds the 8-digit hex washes into rgba(), so the triplet is the
    // carrier the assertion reads.
    expect(badge()!.style.color).toBe("var(--meta-strong)");
    expect(badge()!.style.background).toContain(rgb(UNCHECKED_COLOR).slice(4, -1));
    expect(badge()!.style.border).toContain(rgb(UNCHECKED_COLOR).slice(4, -1));
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
    expect(missingEnginesForDistrict(docs, cityOf([docs]).scanProvenance)).toEqual(["gitleaks"]);
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
    expect(missingEnginesForDistrict(checked, cityOf([checked]).scanProvenance)).toEqual([]);
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
    // Same grade, two inks (the rule the unchecked line already follows): the
    // WORD rides `severityTextColor`, the alarm tone stays on the wash and the
    // border. Measured on the plate, the colour-blind P0 area tone as a word is
    // 4,04:1 and the P1 blue 3,06:1 — under the house step; the word ink lifts
    // both over 4,5. `glas-chrome.test.ts` owns those ratios.
    expect(badge()!.style.color).toBe(rgb(severityTextColor("P0", true)));
    expect(badge()!.style.background).toContain(rgb(SEVERITY_CVD_COLOR.P0).slice(4, -1));
    expect(badge()!.style.border).toContain(rgb(SEVERITY_CVD_COLOR.P0).slice(4, -1));
    expect(severityTextColor("P0", true)).not.toBe(SEVERITY_CVD_COLOR.P0);
    expect(severityColor("P2", true)).toBe(SEVERITY_CVD_COLOR.P2);
  });
});
