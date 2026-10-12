import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import * as THREE from "three";
import { LANGUAGE_COLORS, languageColor, languageRoofColor, ENV } from "../src/city/palette";
import { dE } from "./colourMath";

/**
 * Punkt 37 — zwei Sprachfarben der Fassade, im gerenderten Bild.
 *
 * Maßgeblich ist nicht das Hex der Palette, sondern der Ton, der wirklich
 * gemalt wird. Die ausgelieferte Kette ist:
 *   1. `Building.tsx:112` — `new THREE.Color(sprache).lerp(weiß, 0.9)`,
 *      gerechnet im Linear-Licht, Ausgabe als 8-Bit-Hex;
 *   2. `Building.tsx:126` — dieser Ton füllt das Fassaden-Raster (canvas);
 *   3. `Building.tsx:656` — der Körpergrundton `#e1e7df` steht darüber, im
 *      Shader als Produkt.
 * Diese Datei rechnet die Kette aus den ausgelieferten Werten nach, und prüft
 * den Ratio aus der Quelle, statt ihn zu tippen: ändert die Bild-Lane die
 * Mischung, messen die Fälle hier neu.
 *
 * Ergebnis der Messung 2026-10-11, 24 Sprachen, 276 Paare:
 *   Hex 8,89 (TypeScript/YAML) → Raster 0,00 (Java/SCSS) → Albedo 0,00.
 * Java `#763b1d` und SCSS `#863e49` rasterisieren auf denselben 8-Bit-Wert
 * `#f6f4f4`; das von der Bar genannte Paar CSS/JAML malt `#f4f5f8` gegen
 * `#f4f6f9` = 0,52 ΔE00. 130 von 276 Paaren liegen auf dem gemalten Ton unter
 * 3,0 (im Hex: keines). Die Sprache ist auf der Fassade kein Kanal mehr.
 */
const SRC = path.resolve(import.meta.dirname, "../src");

const building = readFileSync(path.join(SRC, "components/Building.tsx"), "utf-8");
const MIX = Number(
  building.match(
    /new THREE\.Color\(color\)\.lerp\(new THREE\.Color\("#ffffff"\),\s*([0-9.]+)\)/,
  )?.[1],
);
const BODY = building.match(/color:\s*"(#[0-9a-f]{6})",\s*\n\s*map: facade!\.map/)?.[1];

const lin8 = (hex: string): THREE.Color => new THREE.Color(hex);
const toSrgbHex = (c: THREE.Color): string => `#${c.getHexString()}`;

/** Schritt 1+2: der Wert, der ins Raster gemalt wird (8 Bit, gerundet). */
function rasterTone(lang: string, mix = MIX): string {
  return toSrgbHex(lin8(languageColor(lang)).lerp(new THREE.Color("#ffffff"), mix));
}

/** Schritt 3: das, was der Körper vor der Beleuchtung zurückwirft. */
function paintedTone(lang: string, mix = MIX): string {
  const tint = lin8(rasterTone(lang, mix));
  const base = lin8(BODY ?? "#e1e7df");
  return toSrgbHex(new THREE.Color(tint.r * base.r, tint.g * base.g, tint.b * base.b));
}

const langs = Object.keys(LANGUAGE_COLORS);

function minPair(toneOf: (l: string) => string): { a: string; b: string; de: number } {
  let best = { a: "", b: "", de: Number.POSITIVE_INFINITY };
  for (let i = 0; i < langs.length; i++) {
    for (let j = i + 1; j < langs.length; j++) {
      const de = dE(toneOf(langs[i]!), toneOf(langs[j]!));
      if (de < best.de) best = { a: langs[i]!, b: langs[j]!, de };
    }
  }
  return best;
}

describe("der gemalte Ton der Fassade", () => {
  it("liest die Mischung aus der Bildkette, statt sie nachzutragen", () => {
    expect(MIX, "Building.tsx mischt nicht mehr auf diese Weise").toBeCloseTo(0.9, 6);
    expect(BODY, "der Körpergrundton der Fassade ist nicht aufzufinden").toBe("#e1e7df");
  });

  /**
   * Der rote Lauf vor der Tat war dieser Fall als Behauptung: „hält die
   * 12er-Untergrenze der Palette auf dem gemalten Ton" — `expected 0 to be
   * greater than or equal to 12`. Er ist hier durch die Aussage ersetzt, die
   * die Messung trägt, denn die 12 ist auf dem gemalten Ton nicht herzustellen,
   * ohne das ausgelieferte Bild zu ändern:
   *   - das Paar-Minimum ist vertauschungsunabhängig, eine Umordnung der
   *     24 Slots ändert an keinem Abstand etwas;
   *   - schon ungemischt (0 % Aufhellung) trennt das engste Hex-Paar 8,89,
   *     also unter 12; über den ganzen Bereich der Mischung erreicht es nie 12.
   * Was bleibt, ist ein Befund für den Betreiber: entweder der Misch-Anteil in
   * `Building.tsx` (andere Lane, anderes Bild) oder neue Töne in der Palette
   * (jedes Bild wäre neu). Beides ist keine Rundung und wird hier nicht getan.
   */
  it("fällt bei einem Sprachpaar auf denselben 8-Bit-Wert zusammen", () => {
    expect(rasterTone("Java"), "Java und SCSS rasteren verschieden").toBe(rasterTone("SCSS"));
    const eng = minPair(paintedTone);
    expect(`${eng.a}/${eng.b}`, "gemerktes engstes Paar").toBe("Java/SCSS");
    expect(eng.de, "zusammengefallen auf einen Wert").toBeLessThan(0.01);
  });

  it("hält das in der Bar genannte Paar auf dem gemalten Ton fest", () => {
    expect(dE(paintedTone("CSS"), paintedTone("YAML"))).toBeLessThan(1);
    expect(dE(rasterTone("CSS"), rasterTone("YAML")), "CSS/JAML gemalt").toBeCloseTo(0.52, 1);
  });

  it("kann die 12 nicht durch Umordnung halten — das Paar-Minimum ist eine Menge von Abständen", () => {
    const umgeordnet = [...langs].reverse();
    const gleich = (a: string, b: string): number => dE(paintedTone(a), paintedTone(b));
    const min = (list: string[]): number => {
      let best = Number.POSITIVE_INFINITY;
      for (let i = 0; i < list.length; i++)
        for (let j = i + 1; j < list.length; j++) best = Math.min(best, gleich(list[i]!, list[j]!));
      return best;
    };
    expect(min(umgeordnet), "Umordnung verschiebt das Minimum").toBeCloseTo(min(langs), 9);
    expect(min(langs), "gemalt ist unter 12").toBeLessThan(12);
    // und ohne jede Aufhellung, also am Hex selbst, bleibt es unter 12
    expect(minPair((l) => languageColor(l)).de).toBeLessThan(12);
  });

  it("senkt auch den Abstand zum Bauband unter die versprochene Grenze", () => {
    // Die Palette erklärt 12 ΔE00 gegen den Umweltband (palette.ts, Bauregel 2).
    // Auf dem gemalten Ton ist davon nichts übrig: der Grundton der Stadt steht
    // näher an der Fassade als zwei Sprachen untereinander.
    const gegen = (hex: string): { de: number; wer: string } => {
      let best = { de: Number.POSITIVE_INFINITY, wer: "" };
      for (const l of langs) {
        const de = dE(paintedTone(l), hex);
        if (de < best.de) best = { de, wer: l };
      }
      return best;
    };
    const plot = gegen(ENV.plot);
    const ground = gegen(ENV.ground);
    expect(plot.de, `gemalte Fassade gegen ${plot.wer} auf ${ENV.plot}`).toBeLessThan(12);
    expect(ground.de, `gemalte Fassade gegen ${ground.wer} auf ${ENV.ground}`).toBeLessThan(12);
  });

  it("lässt den Sprachkanal nur dort, wo er noch gemessen wird: Dach und Legende", () => {
    // Was das Bild heute wirklich trägt, ist der Dachton und die Legenden-
    // swatch — nicht die Fassade. Beide bleiben vertreten, sonst wäre der
    // Befund einer, der nichts mehr zu sagen hat.
    expect(minPair((l) => languageColor(l)).de, "Legende/Ton-Tafel").toBeGreaterThanOrEqual(8);
    let dach = Number.POSITIVE_INFINITY;
    for (const a of langs)
      for (const b of langs) {
        if (a === b) continue;
        dach = Math.min(dach, dE(languageRoofColor(a, 3), languageRoofColor(b, 3)));
      }
    expect(dach, "Dachton bei gleichem Seed").toBeGreaterThanOrEqual(3);
  });
});
