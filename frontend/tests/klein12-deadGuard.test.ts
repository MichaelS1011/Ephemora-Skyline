import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";
import { threatColor, THREAT_COLOR, UNCHECKED_COLOR } from "../src/city/palette";

/**
 * Punkt 35 — ein Wächter, der nichts mehr anfassen kann.
 *
 * `hudLegibility.test.ts` rechnet seit dem Tag-Ton der Welt gegen `#3a372d`,
 * einen Dämmerboden, den kein Modul mehr malt, und stützt sich dabei auf
 * `liftHexForDusk` — eine Funktion ohne Leser im Produktionsbaum. Der Fall ist
 * nicht ein zu strenger, sondern ein wirkungsloser Wächter: was er behauptet,
 * kann nicht mehr verschwinden, weil es nicht mehr im Bild ist.
 *
 * Diese Datei hält die zwei Bedingungen fest, unter denen ein Legibilitäts-
 * wächter überhaupt etwas kann:
 *   1. der Helfer, auf den er sich stützt, wird von der Bildkette gelesen;
 *   2. die Fläche, gegen die er rechnet, ist die, die das Produkt malt.
 */
const FRONTEND = path.resolve(import.meta.dirname, "..");
const SRC = path.join(FRONTEND, "src");
const TESTS = path.join(FRONTEND, "tests");

/** Der Wächter, um den es geht, plus seine Nachfolgerin. */
const GUARDS = ["hudLegibility.test.ts", "klein12-deadGuard.test.ts"];

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      out.push(...tsFiles(p));
    } else if (/\.tsx?$/.test(entry.name)) out.push(p);
  }
  return out;
}

const PRODUCTION = tsFiles(SRC).filter((f) => !f.endsWith("city/palette.ts"));

/** Liest eine Datei den Namen als Wort (Kommentare zählen nicht nachdrücklich). */
function reads(file: string, name: string): boolean {
  const text = readFileSync(file, "utf-8");
  return new RegExp(`\\b${name}\\b`).test(text);
}

/** Zugriffsfunktionen derselben Tabelle: `THREAT_COLOR` lebt, weil `threatColor`
 *  es an die Bildkette weitergibt — tot ist ein Name erst ohne diese Brücke. */
function transitivelyRead(name: string, paletteText: string, seen = new Set<string>()): boolean {
  if (seen.has(name)) return false;
  seen.add(name);
  for (const f of PRODUCTION) if (reads(f, name)) return true;
  const table = new RegExp(`\\b${name}\\b`).test(paletteText);
  if (!table) return false;
  // in welcher exportierten Funktion derselben Datei taucht der Name auf?
  for (const m of paletteText.matchAll(/export function ([A-Za-z_]\w*)[\s\S]*?\n\}/g)) {
    if (!m[1] || m[1] === name) continue;
    if (new RegExp(`\\b${name}\\b`).test(m[0]) && transitivelyRead(m[1], paletteText, seen))
      return true;
  }
  return false;
}

describe("die Wächter der Legibilität rechnen an der Bildkette", () => {
  const paletteText = readFileSync(path.join(SRC, "city/palette.ts"), "utf-8");
  const exportedHere = (s: string): boolean =>
    new RegExp(`export (?:const|function|interface|type) ${s}\\b`).test(paletteText);

  const importedNames = (): string[] => {
    const out = new Set<string>();
    for (const g of GUARDS) {
      const text = readFileSync(path.join(TESTS, g), "utf-8");
      const m = text.match(/import\s*\{([^}]*)\}\s*from\s*["'][^"']*city\/palette["']/s);
      if (!m?.[1]) continue;
      for (const raw of m[1].split(",")) {
        const name = raw.trim().split(/\s+as\s+/)[0];
        if (name && exportedHere(name)) out.add(name);
      }
    }
    return [...out];
  };

  it("stützt sich auf keinen Helfer, den die Bildkette nicht liest", () => {
    const dead: string[] = [];
    for (const name of importedNames()) {
      if (!transitivelyRead(name, paletteText)) dead.push(name);
    }
    expect(dead, `von der Bildkette unbelesene Namen im Wächter: ${dead.join(", ")}`).toEqual([]);
  });

  it("rechnet gegen den Boden, den die Stadt heute malt, nicht gegen einen gemerkten Ton", () => {
    const palette = readFileSync(path.join(SRC, "city/palette.ts"), "utf-8");
    const ground = palette.match(/ground:\s*"(#[0-9a-f]{6})"/)?.[1];
    expect(ground, "ENV.ground ist nicht zu lesen").toBeDefined();
    const stale: string[] = [];
    for (const g of GUARDS) {
      const text = readFileSync(path.join(TESTS, g), "utf-8");
      for (const m of text.matchAll(/"(#[0-9a-fA-F]{6})"/g)) {
        const hex = m[1]!.toLowerCase();
        if (hex === ground!.toLowerCase()) continue;
        // ein Ton aus der ausgelieferten Palette darf verglichen werden, ein
        // aus dem Kopf tippter Welterton nicht
        if (!new RegExp(hex, "i").test(palette)) stale.push(`${g}: ${hex}`);
      }
    }
    expect(
      stale,
      `Welt-Töne außerhalb der Palette, gegen die gerechnet wird:\n${stale.join("\n")}`,
    ).toEqual([]);
  });

  it("misst den Wert, der wirklich ins Bild geht, nicht die Tabelle dahinter", () => {
    // HeatCells malt die ruhigen Stufen aus `threatColor` und `UNCHECKED_COLOR`;
    // nur was dort ankommt, darf die Legibilität der Kacheln behaupten.
    const cells = readFileSync(path.join(SRC, "components/HeatCells.tsx"), "utf-8");
    expect(cells, "HeatCells liest threatColor nicht").toMatch(/threatColor/);
    expect(cells, "HeatCells liest UNCHECKED_COLOR nicht").toMatch(/UNCHECKED_COLOR/);
    expect(
      threatColor("safe", false),
      "die Zugriffsfunktion gibt einen anderen Ton als die gemessene Tabelle",
    ).toBe(THREAT_COLOR.safe);
    expect(UNCHECKED_COLOR, "die ruhige Stufe ist nicht die gemessene").toMatch(/^#[0-9a-f]{6}$/);
  });
});
