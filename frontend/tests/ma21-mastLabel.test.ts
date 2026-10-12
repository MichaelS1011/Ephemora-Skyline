import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { contrast, deltaE00, lab } from "./colourMath";
import { ENV } from "../src/city/palette";

/**
 * MAST-21 — die Beschriftung der Höhenmesslatte in der Welt.
 *
 * Der Maßstab ist ≥ 4,5:1 für jeden Text, der in der Welt steht, auch dort, wo
 * bewusst kein Glas liegt (Beschluss 10.10.: der Ausfall einer Verglasung über
 * der hellen Stadt war gemessen 1,83:1).
 *
 * Gemessen wurde im laufenden Bild einer lokalen Headless-Sonde (nicht
 * ausgeliefert), Demo-Stadt über das sichtbare Control, 1600 × 1000, reduced
 * motion, Grundpose; Zähler sind Median über vollständige RGB-Tripel eines
 * Laufs, nie Perzentile je Kanal. Die Zahlen dieses Falles:
 *
 *   vorher  Skala 0,2953 → 11 px deklariert kommen als 3,25 px an.
 *           Grund unter den Glyphen: #121210 (Modus 100 %, Eigenstreuung 0 —
 *           die Platte ist undurchsichtig, die Welt erreichte sie nie).
 *           Glyphkern-Median #5c6168 → 3,01:1. Mit jeder noch so leicht
 *           angetuschten Pixel des Feldes: #353a42 → 1,64:1.
 *   nachher Skala 1,0 → die deklarierten 11 px kommen als 11 px an.
 *           Glyphkern-Median #7b8da8 → 5,55:1 (1× Bildschirm),
 *                            #8ea3c4 → 7,31:1 (2× Bildschirm; der Kern ist da
 *           exakt die deklarierte Tinte, ΔE00 0,00).
 *
 * Der Hebel ist die ankommende Größe, nicht die Farbe: bei der gemessenen
 * Deckung des Feldes (Median 0,28) erreicht kein Tripel aus Tinte und Platte
 * mehr als 2,54:1 — durchgerechnet über alle 65 536 Graupaare.
 */
const SRC = path.resolve(import.meta.dirname, "../src");
const read = (rel: string): string => readFileSync(path.join(SRC, rel), "utf-8");

/** Der Block einer CSS-Regel, exakt nach dem Selektor. */
function regel(css: string, wahl: string): string {
  const i = css.indexOf(`${wahl} {`);
  expect(i, `keine Regel "${wahl} {" im ausgelieferten Stand`).toBeGreaterThan(-1);
  return css.slice(i, css.indexOf("}", i) + 1);
}

/** Der Wert einer Erklärung, oder ein Fall mit Name. */
function wert(block: string, eigenschaft: string): string {
  const m = block.match(new RegExp(`${eigenschaft}:\\s*([^;]+);`));
  expect(m, `${eigenschaft} fehlt in der Plattenregel`).toBeDefined();
  return m![1]!.trim();
}

/** Der Html-Öffner, an dem die Mast-Beschriftung hängt. */
function mastHtml(): string {
  const text = read("components/RoadSystem.tsx");
  const i = text.indexOf('className="cf-mast"');
  expect(i, "die Mast-Beschriftung steht nicht mehr in RoadSystem.tsx").toBeGreaterThan(-1);
  const start = text.lastIndexOf("<Html", i);
  expect(start, "über der Mast-Beschriftung steht kein <Html>").toBeGreaterThan(-1);
  return text.slice(start, i);
}

describe("die Beschriftung der Höhenmesslatte", () => {
  const css = read("design/city-funktion.css");
  const platte = regel(css, ".cf-mast");
  const titel = regel(css, ".cf-mast-title");
  const grund = wert(platte, "background");
  const tinten = [wert(platte, "color"), wert(titel, "color")];

  it("skaaliert ihren Aufdruck nicht mit der Welt kleiner", () => {
    // distanceFactor={60} setzte die Platte in der Übersicht auf Skala 0,2953:
    // aus 11 px deklariert wurden 3,25 px auf dem Bildschirm, und kein Pixel
    // des Feldes erreichte die deklarierte Tinte (beste Deckung 0,64). Der
    // Glyphkern maß dadurch 3,01:1 — die Größe, nicht die Farbe, ist der Grund.
    expect(mastHtml(), "der Aufdruck wird wieder mit dem Abstand kleiner").not.toMatch(
      /distanceFactor/,
    );
  });

  it("frisst den Kameragriff nicht, der hinter ihr liegt", () => {
    // Die Platte ist eine Messung, kein Ziel. `.cf-mast` erklärt
    // pointer-events: none; drei's Wrapper braucht es sonst frisst die Fläche
    // den Drag — gemessen, indem ein Griff in ihrer Mitte die Kamera nicht
    // mehr drehte.
    expect(mastHtml(), "der Wrapper nimmt der Stadt den Drag weg").toMatch(
      /pointerEvents:\s*"none"/,
    );
  });

  it("steht auf einer undurchsichtigen Platte, nicht auf einem Glas", () => {
    expect(grund, "die Platte ist nicht mehr deckungsvoll").toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(platte, "auf der Welt liegt ein Glas — Beschluss 10.10.").not.toMatch(/backdrop-filter/);
  });

  it("hält jede Tinte, die sie trägt, über 4,5 auf dieser Platte", () => {
    const erwartet = ["7.31", "12.29"];
    tinten.forEach((tinte, i) => {
      const k = contrast(tinte, grund);
      expect(k, `${tinte} auf ${grund} fällt unter 4,5`).toBeGreaterThanOrEqual(4.5);
      expect(k.toFixed(2), `${tinte} auf ${grund} ist nicht die gemeldete Zahl`).toBe(erwartet[i]!);
    });
  });

  it("lässt keinen hellen Welten-Grund die Tinte allein tragen", () => {
    // Die vier hellen Gründe, hinter die das Label fallen kann. Keiner von
    // ihnen trägt die Tinte auch nur annähernd — was sie hält, ist die Platte.
    const gruende = [
      ["Plaza", ENV.plot],
      ["Grund", ENV.ground],
      ["Nebel", ENV.fog],
      ["Zebrastreifen", ENV.crosswalk],
    ] as const;
    for (const [name, ground] of gruende) {
      for (const tinte of tinten) {
        const aufPlatte = contrast(tinte, grund);
        const aufWelt = contrast(tinte, ground);
        expect(aufWelt, `${name} ${ground} trüge ${tinte} allein`).toBeLessThan(4.5);
        expect(
          aufWelt,
          `${name} ${ground} wäre besser als die Platte — die wäre dann überflüssig`,
        ).toBeLessThan(aufPlatte);
      }
    }
  });

  it("hat ihre gemeldeten Pixelzahlen selbst nachgerechnet", () => {
    // Kein Glaube an den Bericht: die Tripel der Sonde, gegen dieselbe
    // colourMath-Rechnung, die der Bericht nennt.
    const vorherKern = "#5c6168";
    const nachherKern1x = "#7b8da8";
    const nachherKern2x = "#8ea3c4";
    expect(contrast(vorherKern, grund).toFixed(2)).toBe("3.01");
    expect(contrast(nachherKern1x, grund).toFixed(2)).toBe("5.55");
    expect(contrast(nachherKern2x, grund).toFixed(2)).toBe("7.31");
    // Auf einem 2×-Bildschirm kommt die deklarierte Tinte exakt an.
    expect(deltaE00(lab(nachherKern2x), lab(tinten[0]!))).toBe(0);
    expect(deltaE00(lab(vorherKern), lab(tinten[0]!))).toBeGreaterThan(20);
  });
});
