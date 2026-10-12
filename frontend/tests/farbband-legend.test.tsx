// @vitest-environment jsdom
// FARBBAND — the key has to say what the map shows.
//
// The legend row for the alarm windows is the only place the city explains
// itself, and it is drawn from a hard-coded swatch. Switching the windows to the
// colour-saver tone without moving the swatch would make the legend describe a
// picture that is no longer on screen — which is worse than the gap it closes.
import { describe, it, expect, afterEach, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { LegendRow, markerLegend } from "../src/components/CoachMarks";
import { alarmWindowColors, complexityColor } from "../src/city/palette";

/** The normal-vision ramp's middle stop, read off the ramp itself rather than typed twice. */
const HEAT_NORMAL_MID = complexityColor(0.5);
import { t } from "../src/i18n";

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

let root: Root | null = null;
function renderRow(marker: ReturnType<typeof markerLegend>[number]): HTMLElement {
  const host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(createElement(LegendRow, { marker })));
  return host;
}
afterEach(() => {
  root?.unmount();
  root = null;
  document.body.innerHTML = "";
});

const alarmRow = (colorblind: boolean) => {
  const rows = markerLegend(colorblind);
  const found = rows.find((r) => r.swatch.background === alarmWindowColors(colorblind).lit);
  return found;
};

describe("Die Legende beschreibt das Bild, das gerade gemalt wird", () => {
  it("hat in beiden Zweigen dieselbe Zahl Zeilen — der Schalter blendet nichts aus", () => {
    expect(markerLegend(true).length).toBe(markerLegend(false).length);
  });

  it("zeigt im Standardzweig den Ton, mit dem die Fenster gemalt werden", () => {
    const row = alarmRow(false);
    expect(row, "keine Legendenzeile malt den ausgelieferten Fensterton").toBeDefined();
    expect(row!.swatch.background).toBe("#ff4d5e");
  });

  it("zeigt im farbarmen Zweig den blauen Fensterton und sagt nicht mehr ‚rot'", () => {
    const row = alarmRow(true);
    expect(
      row,
      "die Legende bleibt beim ausgelieferten Rot, obwohl die Fenster blau werden",
    ).toBeDefined();
    expect(row!.swatch.background).toBe(alarmWindowColors(true).lit);
    for (const lang of ["en", "de"] as const) {
      const label = t(lang, row!.label);
      expect(label.toLowerCase(), `Zeile heißt weiterhin nach Rot (${label})`).not.toMatch(
        /red|rot/,
      );
    }
  });

  it("lässt in beiden Zweigen denselben Satz über die Funde stehen", () => {
    const normal = alarmRow(false)!;
    const cvd = alarmRow(true)!;
    expect(cvd.meaning).toBe(normal.meaning);
    for (const lang of ["en", "de"] as const) {
      expect(t(lang, cvd.meaning)).toBe(t(lang, normal.meaning));
    }
  });

  it("malt den Ton bis in das Span, das im DOM steht", () => {
    const rgb = (h: string): string =>
      `rgb(${[1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).join(", ")})`;
    for (const colorblind of [false, true] as const) {
      const host = renderRow(alarmRow(colorblind)!);
      const chip = host.querySelector("span[style]");
      expect(chip, "kein Swatch im DOM").not.toBeNull();
      // The DOM reports a background as rgb(), so the comparison is spelled the
      // way the browser spells it — a hex-vs-rgb mismatch here would otherwise
      // read as "the swatch never arrives".
      expect(
        (chip as HTMLElement).style.background,
        `Zweig ${colorblind ? "farbarm" : "Standard"}`,
      ).toBe(rgb(alarmWindowColors(colorblind).lit));
    }
  });

  it("zeichnet die Komplexitäts-Rampe in der Legende so, wie sie gemalt wird", () => {
    const normal = markerLegend(false).find((r) => r.label === "legend.heat")!;
    const cvd = markerLegend(true).find((r) => r.label === "legend.heat")!;
    expect(normal.swatch.background).toContain(HEAT_NORMAL_MID);
    expect(cvd.swatch.background).not.toBe(normal.swatch.background);
    expect(cvd.swatch.background).toContain("#0072b2");
    expect(cvd.swatch.background).toContain("#753300");
  });
});
