// FARBBAND — the alarm band inside the 3D city has to follow the colour switch.
//
// Why these numbers and not a taste: the shipped pale alarm window `#ff8f9a`
// sits 6.12 ΔE00 from a calm window `#d9cfae` under simulated deuteranopia, and
// the two loudest beacon classes sit 10.26 apart. For a deuteranope that is one
// colour painted twice, which is the exact thing the README promises cannot
// happen. The switch has to reach the windows, the curb and the threat table —
// and the branch it reaches has to be measured, not asserted from a name.
import { describe, it, expect } from "vitest";
import {
  ENV,
  SEVERITY_COLOR,
  SEVERITY_CVD_COLOR,
  THREAT_COLOR,
  alarmWindowColors,
  curbAlarmColor,
  landmarkBeamColor,
  threatColor,
} from "../src/city/palette";
import { worstSeharten, contrast } from "./colourMath";

/** Every alarm tone has to stand off these, in both branches. */
const CALM_WARM = "#ffc470"; // ENV.windowWarm
const CALM_COOL = ENV.windowCool;
const CALM_CURB = "#3a4a68";
const EROSION = "#ff9a3d"; // the scaffolding band, painted in the same frame
const PLAZA = ENV.plot;

describe("Das Alarmband der Stadt folgt dem Schalter", () => {
  it("lässt den ungeschalteten Zweig byte-identisch bei dem, was ausgeliefert ist", () => {
    expect(alarmWindowColors(false)).toEqual({ lit: "#ff4d5e", pale: "#ff8f9a" });
    expect(curbAlarmColor(false)).toBe("#ff4d5e");
    expect(landmarkBeamColor(false)).toBe("#ff4d5e");
    for (const level of ["critical", "high", "medium", "low", "safe"] as const) {
      expect(threatColor(level, false), level).toBe(THREAT_COLOR[level]);
    }
  });

  it("schaltet die Fenster auf den Ton der farbarmen Schweregrad-Tabelle", () => {
    const { lit, pale } = alarmWindowColors(true);
    expect(lit).toBe(SEVERITY_CVD_COLOR.P1);
    // The pale is never a second hand-picked hex: it is the lit tone mixed
    // toward white by the factor the shipped pair implies (0.372).
    const mix = (h: string, t: number): string =>
      "#" +
      [1, 3, 5]
        .map((i) => {
          const v = parseInt(h.slice(i, i + 2), 16);
          return Math.round(v + t * (255 - v))
            .toString(16)
            .padStart(2, "0");
        })
        .join("");
    expect(pale).toBe(mix(lit, 0.372));
    expect(mix("#ff4d5e", 0.372), "derselbe Faktor muss das ausgelieferte Paar erzeugen").toBe(
      "#ff8f9a",
    );
  });

  it("hält den Bordstein im farbarmen Zweig beim Warnton, nicht beim Fensterton", () => {
    // Measured: the blue window tone against the calm curb is 14,60 ΔE00 at the
    // worst vision type, the vermilion is 42,77. The curb and the windows do not
    // share a hue by accident — they share it because they have different
    // neighbours to stand off.
    expect(curbAlarmColor(true)).toBe(SEVERITY_CVD_COLOR.P0);
    expect(landmarkBeamColor(true)).toBe(SEVERITY_CVD_COLOR.P0);
  });

  it("gibt die Schweregrad-Stufen der Stadt über denselben Schalter wie die Beacon-Farbe", () => {
    expect(threatColor("critical", true)).toBe(SEVERITY_CVD_COLOR.P0);
    expect(threatColor("high", true)).toBe(SEVERITY_CVD_COLOR.P1);
    expect(threatColor("medium", true)).toBe(SEVERITY_CVD_COLOR.P2);
    expect(threatColor("critical", false)).toBe(SEVERITY_COLOR.P0);
    expect(threatColor("high", false)).toBe(SEVERITY_COLOR.P1);
    expect(threatColor("medium", false)).toBe(SEVERITY_COLOR.P2);
    // `low` and `safe` are not severities: one is the reviewed calm green, the
    // other a legibility-pinned floor tone. Neither may move with the switch.
    expect(threatColor("low", true)).toBe(THREAT_COLOR.low);
    expect(threatColor("safe", true)).toBe(THREAT_COLOR.safe);
  });
});

describe("Jeder Alarmton hält seinen Mindestabstand — im Zweig, den der Schalter trägt", () => {
  const FLOOR = 12;
  const { lit, pale } = alarmWindowColors(true);
  const curb = curbAlarmColor(true);

  it("farbarm: Fenster gegen ruhige Fenster, Erosionsband und Plaza", () => {
    for (const [foe, label] of [
      [CALM_WARM, "ruhiges Warmfenster"],
      [CALM_COOL, "ruhiges Kühlfenster"],
      [EROSION, "Erosionsband"],
    ] as const) {
      for (const [tone, tl] of [
        [lit, "hell"],
        [pale, "blass"],
      ] as const) {
        expect(
          worstSeharten(tone, foe),
          `farbarm/${tl} ${tone} gegen ${label} ${foe}`,
        ).toBeGreaterThanOrEqual(FLOOR);
      }
    }
    expect(contrast(lit, PLAZA), "farbarmes Alarmfenster gegen Plaza").toBeGreaterThanOrEqual(2);
  });

  it("farbarm: Bordstein gegen ruhigen Bordstein und Plaza", () => {
    expect(worstSeharten(curb, CALM_CURB)).toBeGreaterThanOrEqual(FLOOR);
    expect(worstSeharten(curb, PLAZA)).toBeGreaterThanOrEqual(FLOOR);
  });

  /**
   * The standard branch is pinned at its measured values, not at the floor —
   * it is the look the product ships and the frames were shot in. Pinning the
   * two numbers that are too small is what keeps them from getting smaller:
   * the pale alarm window is 6,12 ΔE00 from a calm window for a deuteranope,
   * and the lit one is 11,77 from the scaffolding band. Both are open points
   * for the default branch and both are named in the report.
   */
  it("Standardzweig: die beiden bekannten Unterschreitungen stehen als Zahl im Test", () => {
    const shipped = alarmWindowColors(false);
    expect(worstSeharten(shipped.pale, CALM_COOL)).toBeCloseTo(6.12, 1);
    expect(worstSeharten(shipped.lit, EROSION)).toBeCloseTo(11.77, 1);
  });

  it("verweigert den Ton, an dem die Messung gescheitert ist: blass über Vermilion", () => {
    // The obvious choice — take the CVD P0 vermilion for the windows too — was
    // measured and rejected: its derived pale lands 6,35 ΔE00 from the
    // scaffolding band, the same defect class this lane exists to close.
    const vermilionPale = "#e59a5f";
    expect(worstSeharten(vermilionPale, EROSION)).toBeLessThan(FLOOR);
  });
});
