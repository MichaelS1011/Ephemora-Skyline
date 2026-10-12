// FARBBAND — the switch has to repaint the facades, not only the panels.
//
// Facade textures are cached and shared: the cache key is built from the facade
// colour, the body size, whether the building is an alarm and a seed bucket. The
// window tone is painted *into* that texture, so a key that does not carry the
// tone serves the old facade after the switch moves — the pilot turns the
// colour-saver palette on, the panels change, the city keeps its red windows and
// nothing says so.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { facadeCacheKey } from "../src/components/Building";
import { alarmWindowColors } from "../src/city/palette";

const CALM = { lit: alarmWindowColors(false).lit, pale: alarmWindowColors(false).pale };
const CVD = alarmWindowColors(true);

describe("Der Fassaden-Cache kennt den Zweig", () => {
  it("liefert einen anderen Schlüssel, sobald der Fensterton wechselt", () => {
    const normal = facadeCacheKey("#468eff", 4, 10, false, 3, CALM);
    const cvd = facadeCacheKey("#468eff", 4, 10, false, 3, CVD);
    expect(normal).not.toBe(cvd);
  });

  it("unterscheidet Alarm von ruhig und bleibt für gleiche Eingaben gleich", () => {
    const alarm = facadeCacheKey("#468eff", 4, 10, true, 3, CALM);
    const calm = facadeCacheKey("#468eff", 4, 10, false, 3, CALM);
    expect(alarm).not.toBe(calm);
    expect(facadeCacheKey("#468eff", 4, 10, true, 3, CALM)).toBe(alarm);
    expect(facadeCacheKey("#468eff", 4, 12, true, 3, CALM)).not.toBe(alarm);
    expect(facadeCacheKey("#468eff", 4, 10, true, 4, CALM)).not.toBe(alarm);
  });

  it("wird an der einen Stelle benutzt, wo die Textur gebaut wird", () => {
    const text = readFileSync(
      path.resolve(import.meta.dirname, "../src/components/Building.tsx"),
      "utf-8",
    );
    expect(text, "facadeCacheKey existiert, aber niemand ruft sie").toMatch(
      /const key = facadeCacheKey\(/,
    );
  });
});
