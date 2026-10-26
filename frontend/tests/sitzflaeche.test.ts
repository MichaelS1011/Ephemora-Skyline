import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { ENV } from "../src/city/palette";
import { SEAT, seatGeometry, seatPlacement } from "../src/city/seatSurface";
import { bankUnterPlakette, verdeckungsanteil } from "../src/city/seatVisibility";
import { contrast } from "./colourMath";

/**
 * §07.13a — die Sitzfläche als Ort.
 *
 * Der Schritt ist in zwei Runden geteilt: diese baut die Fläche (ein Objekt, das
 * zeigt, wo Ruhe einen Platz hat, und das auf den Zeiger antwortet), die nächste
 * schickt einen Bewohner hin. Die Latte stand vor dem Bau in sechs Punkten fest
 * und wird hier in genau sechs describe-Blöcken nachgeprüft: geschlossene
 * Geometrie aus einem Material, Größe fürs Ziel, Kontrast lage für lage,
 * Platzierung an der eigenen Mulde, Antwort auf den Zeiger, zuletzt die
 * Verdeckung durch das eigene Schild.
 */
const SRC = readFileSync(resolve(import.meta.dirname, "../src/city/seatSurface.ts"), "utf8");
const palRead = readFileSync(resolve(import.meta.dirname, "../src/city/palette.ts"), "utf8");
const DISTRICT = readFileSync(
  resolve(import.meta.dirname, "../src/components/District.tsx"),
  "utf8",
);
const BETRIEBSMASS = 12.75; // Px pro Welteinheit auf der Platte (Z-03 gemessen)
const HOCH = 0.7776; // ein vertikales Welt-Unit landet auf 0,7776 Screen-Units
const FLACH = Math.sin(0.68); // eine flache Welttiefe verliert sin(0,68) an der Blickachse

/** Der Sitz-Block in District.tsx, von seiner eigenen Klammer begrenzt. */
const sitzBlock = (() => {
  const anfang = DISTRICT.indexOf("{seat && SEAT_GEO && (");
  const ende = DISTRICT.indexOf(")}", anfang);
  expect(anfang).toBeGreaterThan(-1);
  return DISTRICT.slice(anfang, ende + 2);
})();

const geo = seatGeometry();
/** `noUncheckedIndexedAccess` lässt einen Pufferzugriff als `number | undefined`
 *  stehen; die Achse einesBuilders ist aber gesetzt — hier als eine Zahl. */
const achse = (i: number): number => Number(pos.array[i]);
const farbe = (i: number): string =>
  [col.array[i * 3], col.array[i * 3 + 1], col.array[i * 3 + 2]]
    .map((x) => +Number(x).toFixed(3))
    .join(",");
const pos = geo?.getAttribute("position") as unknown as { array: ArrayLike<number> };
const col = geo?.getAttribute("color") as unknown as { array: ArrayLike<number> };

describe("one seat, one geometry, one material", () => {
  it("builds a closed box out of six quads", () => {
    expect(geo).not.toBeNull();
    expect(pos.array.length / 3).toBe(36);
    expect(col.array.length / 3).toBe(36);
  });

  it("stands on the slab and stops at its own crown", () => {
    const ys = Array.from({ length: 36 }, (_, i) => achse(i * 3 + 1));
    expect(Math.min(...ys)).toBeCloseTo(0, 9);
    expect(Math.max(...ys)).toBeCloseTo(SEAT.kronenY - SEAT.slabY, 6);
  });

  it("carries exactly two inks: a bright crown over a dark frame", () => {
    const kronen = new Set(Array.from({ length: 6 }, (_, i) => farbe(i)));
    const flanken = new Set(Array.from({ length: 30 }, (_, i) => farbe(6 + i)));
    expect(kronen.size).toBe(1);
    expect(flanken.size).toBe(1);
    // und es sind genau die beiden Token-Töne, die das Welt-Ink kennt
    const [kronenTon] = [...kronen];
    const [flankenTon] = [...flanken];
    const als = (hex: string): string => {
      const c = new THREE.Color(hex);
      return [c.r.toFixed(3), c.g.toFixed(3), c.b.toFixed(3)].map((x) => +x).join(",");
    };
    expect(kronenTon).toBe(als(ENV.curb));
    expect(flankenTon).toBe(als(ENV.arcCasing));
    expect(kronenTon).not.toBe(flankenTon);
  });

  it("names no colour of its own", () => {
    expect(SRC).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(ENV.arcCasing).toBeTruthy();
  });

  it("is placed by the district, not by the seat", () => {
    expect(DISTRICT).toMatch(
      /const seat = useMemo\(\(\) => \(SITZ_AN \? seatPlacement\(w, d\) : null\), \[w, d\]\);/,
    );
    expect(DISTRICT).toMatch(/\{seat && SEAT_GEO && \(/);
    // geteilt, nicht je Bezirk gebaut: die Bank hat auf jeder Platte dieselbe Größe
    expect(DISTRICT).toMatch(/const SEAT_GEO: THREE\.BufferGeometry \| null = seatGeometry\(\);/);
  });
});

describe("the seat is big enough to be aimed at", () => {
  it("lifts its crown at least two pixels above the slab at the operating measure", () => {
    const px = (SEAT.kronenY - SEAT.slabY) * BETRIEBSMASS * HOCH;
    expect(px).toBeGreaterThanOrEqual(2);
  });

  it("shows at least two pixels of seat depth", () => {
    expect(SEAT.tiefe * BETRIEBSMASS * FLACH).toBeGreaterThanOrEqual(2);
  });

  it("is at least two residents long", () => {
    // FIGURE.bodyR 0,185 → 0,37 Einheiten Schulterbreite, plus Standabstand
    expect(SEAT.laenge / (2 * 0.37)).toBeGreaterThanOrEqual(2);
  });
});

describe("contrast, measured layer by layer", () => {
  // Alle Töne, die der Palette-Modul überhaupt kennt — die Liste wird mit dem
  // Modul groß, nicht mit diesem Test.
  const PALETTE = [
    ...new Set((palRead.match(/"#[0-9a-fA-F]{6}"/g) ?? []).map((h) => h.slice(1, -1))),
  ];

  it("knows the whole palette", () => {
    expect(PALETTE.length).toBeGreaterThanOrEqual(90);
  });

  it("frames the ground it stands on at ≥2,5:1", () => {
    const BOeden = [ENV.plot, ENV.ground, ENV.curb];
    const zahl = BOeden.map((g) => contrast(ENV.arcCasing, g));
    expect(Math.min(...zahl)).toBeGreaterThanOrEqual(2.5);
    expect(Math.min(...zahl)).toBeGreaterThanOrEqual(6.63 - 0.01);
  });

  it("keeps crown against frame at ≥3:1", () => {
    expect(contrast(ENV.curb, ENV.arcCasing)).toBeGreaterThanOrEqual(3);
  });

  it("carries every palette tone on at least one of its two layers", () => {
    const ohne = PALETTE.filter(
      (t) => Math.max(contrast(ENV.arcCasing, t), contrast(ENV.curb, t)) < 2.5,
    );
    expect(ohne).toEqual([]);
    const schwachste = Math.min(
      ...PALETTE.map((t) => Math.max(contrast(ENV.arcCasing, t), contrast(ENV.curb, t))),
    );
    expect(schwachste).toBeGreaterThanOrEqual(2.71 - 0.01);
  });

  it("keeps the failed first build on record", () => {
    // ENV.curb als Flanke: 2,10:1 auf der eigenen Platte. ENV.plotEdge als Krone:
    // drei Töne, die von keiner Schicht getragen wurden. Beide Bauweisen sind
    // verworfen, und der Test hält die Zahl, nicht nur das Urteil.
    expect(contrast(ENV.curb, ENV.plot)).toBeLessThan(2.5);
    const versaege = ["#863e49", "#9f0063", "#46525d"];
    for (const tone of versaege) {
      expect(Math.max(contrast(ENV.arcCasing, tone), contrast(ENV.plotEdge, tone))).toBeLessThan(
        2.5,
      );
    }
  });

  it("pays the one edge the crown cannot carry by tone", () => {
    // Die Krone IST der Bordsteinton: gegen den Stein hinter der Bank misst sie
    // 1,00:1. Das Gehäuse-Ink trägt diese Kante — dieselbe Arbeit, die es am
    // gewählten Turm tut.
    expect(contrast(ENV.curb, ENV.curb)).toBeCloseTo(1, 6);
    expect(contrast(ENV.arcCasing, ENV.curb)).toBeGreaterThanOrEqual(2.5);
  });
});

describe("placement keeps the margin it was given", () => {
  const kerbInnen = 1.1 - 0.15; // Steinmitt achse minus halbe Steinbreite
  const bandInnen = 1.35; // DISTRICT_BAND.abstand — dort beginnt das Risiko-Ink
  const plattenRand = 1.2; // die Platte selbst ragt w/2 + 1,2

  it("sits between the tower field and the kerb stone on a real plot", () => {
    const p = seatPlacement(24, 18);
    expect(p).not.toBeNull();
    const zOffset = p!.z - 18 / 2;
    expect(zOffset + SEAT.tiefe / 2).toBeLessThanOrEqual(kerbInnen);
    expect(zOffset - SEAT.tiefe / 2).toBeGreaterThan(0);
  });

  it("never reaches the risk band, on any plot", () => {
    for (const d of [4, 6, 11, 24, 60]) {
      if (!seatPlacement(60, d)) continue;
      const p = seatPlacement(60, d)!;
      expect(p.z - d / 2 + SEAT.tiefe / 2).toBeLessThan(bandInnen);
    }
  });

  it("stays on the slab", () => {
    for (const w of [12.4, 16, 24, 60]) {
      const p = seatPlacement(w, 12)!;
      expect(Math.abs(p.x) + SEAT.laenge / 2).toBeLessThanOrEqual(w / 2 + plattenRand);
    }
  });

  it("keeps clear of the side stones", () => {
    for (const w of [12.4, 16, 24, 60]) {
      const p = seatPlacement(w, 12)!;
      expect(Math.abs(p.x) - SEAT.laenge / 2).toBeLessThan(w / 2 + kerbInnen);
    }
  });

  it("stays clear of its own nameplate, or it is not placed", () => {
    // Das Schild hängt mittig über dem Rand und misst bis 116,8 Px (4,58
    // Einheiten halbe Breite). Eine Bank, die darin steht, ist kein Ziel.
    for (const w of [12.4, 16, 24, 60]) {
      const p = seatPlacement(w, 12)!;
      expect(p.x + SEAT.laenge / 2).toBeLessThanOrEqual(-SEAT.plaketteHalbeWelt + 0.0001);
    }
    // Die Weltregel ist nur die Vorfilterung; gemessen am engsten Fall: 12,3 ist
    // zu schmal, 12,4 geht gerade noch, und die Projektion entscheidet danach.
    expect(seatPlacement(12.3, 12)).toBeNull();
    expect(seatPlacement(8, 12)).toBeNull();
    expect(SEAT.plaketteHalbeWelt).toBeCloseTo(116.8 / 2 / 12.75, 2);
  });

  it("is outside the group strip row in z", () => {
    // die Reihe steht bei d/2 - barD/2 - 0,6, also innerhalb des Feldes
    const p = seatPlacement(24, 12)!;
    expect(p.z - SEAT.tiefe / 2).toBeGreaterThan(12 / 2);
  });

  it("refuses a plot that is too small for furniture", () => {
    expect(seatPlacement(3.9, 12)).toBeNull();
    expect(seatPlacement(24, 3.9)).toBeNull();
    expect(seatPlacement(0, 12)).toBeNull();
    expect(seatPlacement(-5, 12)).toBeNull();
    expect(seatPlacement(Number.NaN, 12)).toBeNull();
    expect(seatPlacement(24, Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("the seat answers the pointer the plot already answers", () => {
  it("takes the district's own click, over and out", () => {
    expect(sitzBlock).toContain("onClick={handleClick}");
    expect(sitzBlock).toContain("onPointerOver={handleOver}");
    expect(sitzBlock).toContain("onPointerOut={handleOut}");
  });

  it("adds no verb and no second handler", () => {
    expect((sitzBlock.match(/on[A-Z]\w+=/g) ?? []).length).toBe(3);
    expect(sitzBlock).not.toMatch(/setSelected|drillIn\(|useStore/);
  });

  it("costs one mesh and no instance", () => {
    expect((sitzBlock.match(/<mesh[\s>]/g) ?? []).length).toBe(1);
    expect(sitzBlock).not.toContain("instancedMesh");
  });

  it("has a mark the palette cannot produce, for the plate's eye", () => {
    expect(DISTRICT).toContain('get("sitzmarke") === "1"');
    expect(DISTRICT).toContain("SEAT_GEO_MARKE ?? SEAT_GEO");
    expect(DISTRICT).not.toMatch(/setHSL[^)]*#/);
    expect(seatGeometry(new THREE.Color().setHSL(0.83, 1, 0.5))).not.toBeNull();
  });

  it("is findable in the scene, so the plate can aim at it", () => {
    expect(sitzBlock).toContain('name="sitz"');
  });

  it("has a switch, so the plate can compare the build against itself", () => {
    expect(DISTRICT).toContain('get("sitz") !== "0"');
    expect(DISTRICT).toContain("SITZ_AN ? seatPlacement(w, d) : null");
  });

  it("is drawn without a raycast hijack and without a new render order", () => {
    expect(sitzBlock).not.toContain("raycast=");
    expect(sitzBlock).not.toContain("renderOrder");
  });
});

describe("§07.13a-Fix — the screen, not the world, has the last word", () => {
  const r = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

  it("sees a free bench as free", () => {
    expect(verdeckungsanteil(r(0, 0, 20, 10), r(30, 0, 20, 10))).toBe(0);
    expect(verdeckungsanteil(r(0, 0, 20, 10), r(10, 10, 20, 10))).toBe(0);
  });

  it("sees a fully covered bench as covered", () => {
    expect(verdeckungsanteil(r(0, 0, 20, 10), r(-10, -10, 60, 40))).toBe(1);
  });

  it("measures the share, so the threshold is a number and not a mood", () => {
    // Hälfte der Bank unter der Plakette
    // Plakette (-10,-10,20,20) deckt die linke Hälfte der Bank ab: 100 von 200 Px.
    expect(verdeckungsanteil(r(0, 0, 20, 10), r(-10, -10, 20, 20))).toBeCloseTo(0.5, 6);
  });

  it("refuses a rectangle with no area", () => {
    expect(verdeckungsanteil(r(0, 0, 0, 10), r(0, 0, 20, 20))).toBe(0);
  });

  it("hides on MORE than half, and keeps a bench that is merely clipped", () => {
    // Die Regel, vor dem Bau aufgeschrieben: > 1/2. Eine Bank, die halb unter
    // ihrem Schild steht, ist noch ein Ziel; eine, die ganz darunter liegt, ist
    // ein Klick auf ein Schild.
    expect(verdeckungsanteil(r(0, 0, 20, 10), r(-10, -10, 20, 20))).not.toBeGreaterThan(0.5);
    // 21 × 21 statt 20 × 20: 121 von 200 = 0,605 — die Bank verschwindet.
    expect(verdeckungsanteil(r(0, 0, 20, 10), r(-10, -10, 21, 21))).toBeGreaterThan(0.5);
  });

  it("asks the camera only when the camera moved", () => {
    expect(DISTRICT).toContain("state.camera.position");
    expect(DISTRICT).toMatch(/Math\.abs\(k\.x - zuletzt\.x\)[^;]*> 0\.02/);
    expect(DISTRICT).toContain("state.size.width !== zuletzt.breite");
    // Absicht pruefen, nicht den Zeilenumbruch: das Formatierwerkzeug des
    // Pre-Commit-Hooks darf diese Zeile umbrechen, ohne dass die Wache stirbt.
    expect(DISTRICT).toMatch(
      /sitzMesh\.visible\s*=\s*!bankUnterPlakette\(\s*sitzMesh,\s*plakette,\s*state\.camera,\s*state\.gl\.domElement,?\s*\);/,
    );
    expect(DISTRICT.match(/useFrame\(/g) ?? []).toHaveLength(1);
  });

  it("binds the mesh and the plate it compares", () => {
    expect(DISTRICT).toContain("ref={sitzRef}");
    expect(DISTRICT).toContain("ref={plaketteRef}");
    expect(DISTRICT).toContain("const sitzRef = useRef<THREE.Mesh>(null);");
    expect(DISTRICT).toContain("const plaketteRef = useRef<HTMLDivElement>(null);");
  });

  it("keeps the pre-filter, so an empty plot never asks the camera", () => {
    expect(seatPlacement(8, 12)).toBeNull();
    expect(bankUnterPlakette).toBeTypeOf("function");
  });
});
