// @vitest-environment jsdom
// The colour-blind switch is only a promise if every surface that paints a
// severity paints it through the one function that knows about the switch.
// Measured 2026-10-09 (launch-bar T4, item 8): 7 of 15 alarm surfaces switched,
// 8 did not — SecurityTour, the district plate and its strip bar, the scan
// summary accent, four InfoPanel surfaces, the minimap's alarm paint. They read
// the base palette directly, so a pilot who turned the switch on still got
// red/green where the city itself had gone vermilion/blue.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ScanSummary } from "../src/components/ScanSummary";
import { useStore } from "../src/stores/useStore";
import {
  REVIEWED_BEACON_COLOR,
  SEVERITY_COLOR,
  SEVERITY_CVD_COLOR,
  severityTextColor,
} from "../src/city/palette";
import { city, dir, file, finding, provenance } from "./helpers/cityFixture";
import type { CityData, CityFile } from "../src/city/types";

const SRC = path.resolve(import.meta.dirname, "../src");

function tsFiles(dir: string, into: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) tsFiles(full, into);
    else if (/\.(ts|tsx)$/.test(entry.name)) into.push(full);
  }
  return into;
}

/**
 * `SEVERITY_COLOR` is the unswitched half of the palette. Reading it anywhere
 * outside `palette.ts` means a surface that cannot follow the switch. The guard
 * walks the whole tree because the eight misses were eight different files.
 */
describe("jede Schweregrad-Farbe im Programm geht durch den Schalter", () => {
  it("lässt keine Fläche die Alarm-Palette direkt lesen", () => {
    const offenders = tsFiles(SRC)
      .filter((f) => !f.endsWith(path.join("city", "palette.ts")))
      .map((f) => [f, readFileSync(f, "utf-8")] as const)
      .filter(([, text]) => /SEVERITY_COLOR\s*[.[]/.test(text))
      .map(([f]) => path.relative(SRC, f));
    expect(offenders).toEqual([]);
  });

  it("berät den Schalter in jeder der gemeldeten Dateien", () => {
    for (const rel of [
      "components/SecurityTour.tsx",
      "components/District.tsx",
      "components/ScanSummary.tsx",
      "components/InfoPanel.tsx",
      "components/Minimap.tsx",
      "components/ContextCard.tsx",
      "components/HeatCells.tsx",
      "components/HudOverlay.tsx",
      "components/FindingsPanel.tsx",
      "components/SearchBar.tsx",
      "components/Tooltip.tsx",
    ]) {
      const text = readFileSync(path.join(SRC, rel), "utf-8");
      expect(text, `${rel} consults no switched colour`).toContain("severityColor(");
      expect(text, `${rel} never reads prefs.colorblind`).toContain("prefs.colorblind");
    }
  });
});

/* ── one of the eight, painted and measured in the DOM ────────────────────── */

/**
 * One building with one P0 — the alarm the summary has to paint. Built through
 * `helpers/cityFixture` so a payload change lands here once, not in a private
 * copy of the object literal.
 */
const hit = (): CityFile =>
  file("src/a.ts", "TypeScript", [
    finding({ type: "X", severity: "P0", line: 1, message: "crit", category: undefined }),
  ]);

const cityOf = (f: CityFile): CityData =>
  city({
    analysisId: "scan-1",
    languages: { TypeScript: 40 },
    totalFiles: 1,
    renderedFiles: 1,
    findingsBySeverity: { P0: 1, P1: 0, P2: 0 },
    // every security engine ran: the accent is a result, not an unproven green
    scanProvenance: provenance(),
    tree: dir({ path: "", name: "probe", detailFiles: [f] }),
  });

let container: HTMLDivElement;
let root: Root;

async function summary(colorblind: boolean): Promise<{ status: string; rule: string }> {
  if (root) await act(async () => root.unmount());
  container = document.createElement("div");
  document.body.append(container);
  useStore.setState(
    {
      ...useStore.getInitialState(),
      prefs: { ...useStore.getInitialState().prefs, lang: "de", colorblind },
      cityData: cityOf(hit()),
      buildPhase: "built",
    },
    true,
  );
  root = createRoot(container);
  await act(async () => root.render(createElement(ScanSummary)));
  // Fresh off the scan the verdict is the open card. It carries the worst
  // severity present twice over and on purpose differently: the rule at its
  // edge is the alarm signal and keeps the pure tone, the status line is a
  // 12 px sentence on glass and takes the AA-safe variant of the same switch
  // (`severityTextColor` in city/palette.ts, measured in glas-chrome.test.ts).
  const status = container.querySelector<HTMLElement>(".start-summary-status");
  const rule = container.querySelector<HTMLElement>(".start-summary-rule");
  expect(status, "the summary shows no status line at all").toBeTruthy();
  expect(rule, "the summary shows no alarm rule at all").toBeTruthy();
  return {
    status: window.getComputedStyle(status!).color,
    rule: window.getComputedStyle(rule!).backgroundColor,
  };
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  container?.remove();
  useStore.setState(useStore.getInitialState(), true);
  vi.unstubAllGlobals();
});

describe("der Scan-Bescheid schaltet mit", () => {
  it("paints the alarm of the switch the user set", async () => {
    const plain = await summary(false);
    const cvd = await summary(true);
    const asRgb = (hex: string): string => {
      const n = parseInt(hex.slice(1), 16);
      return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
    };
    // The signal: the rule paints the shipped alarm of the switch it is under.
    expect(plain.rule, "the default alarm is the shipped red").toBe(asRgb(SEVERITY_COLOR.P0));
    expect(cvd.rule, "the colour-blind alarm is the vermilion").toBe(asRgb(SEVERITY_CVD_COLOR.P0));
    // The word: the same switch, its readable variant, and still a different
    // colour per switch position — a switch that reaches the dot but not the
    // sentence is half a switch.
    expect(plain.status).toBe(asRgb(severityTextColor("P0", false)));
    expect(cvd.status).toBe(asRgb(severityTextColor("P0", true)));
    expect(cvd.status).not.toBe(plain.status);
    expect(plain.status).not.toBe(plain.rule);
  });
});

/* ── the clean branch is the one branch the switch does not reach ─────── */

/**
 * The per-file probe above only asks whether a file mentions `severityColor(`
 * and `prefs.colorblind` anywhere — it ran green (3/3, measured 2026-10-25)
 * while the clean branch of the summary chain painted `#29d398` inline,
 * bypassing `REVIEWED_BEACON_COLOR` that every beacon surface reads
 * (Tooltip.tsx:175/215). This guard reads the accent/statusInk chain itself
 * and allows no hex literal inside it; the positive control proves the probe
 * can turn red — a guard that cannot fail is not a gate.
 */
describe("der Clean-Akzent der ScanSummary liest das Beacon-Token, keine Inline-Hex", () => {
  const summarySrc = readFileSync(path.join(SRC, "components", "ScanSummary.tsx"), "utf-8");
  const from = summarySrc.indexOf("const accent = preview");
  const to = summarySrc.indexOf("const status = demo", from);
  if (from < 0 || to < 0) {
    throw new Error("ScanSummary accent/statusInk chain not found — guard is blind");
  }
  const chain = summarySrc.slice(from, to);
  const HEX_LITERAL = /["']#[0-9a-fA-F]{3,8}["']/;

  it("hält keine Inline-Hex in der accent/statusInk-Kette", () => {
    const hit = chain.match(HEX_LITERAL);
    expect(hit, `inline hex in chain: ${hit?.join(", ")}`).toBeNull();
  });

  it("trägt das Beacon-Token in beiden Clean-Zweigen", () => {
    expect(chain.match(/REVIEWED_BEACON_COLOR/g)).toHaveLength(2);
  });

  it("Das Token ist unverändert #29d398 — der Austausch ändert keinen Pixelton", () => {
    expect(REVIEWED_BEACON_COLOR).toBe("#29d398");
  });

  it("Positive Kontrolle: eine injizierte Hex macht die Wache rot", () => {
    const injected = chain.replace("REVIEWED_BEACON_COLOR", '"#29d398"');
    expect(HEX_LITERAL.test(injected)).toBe(true);
  });
});
