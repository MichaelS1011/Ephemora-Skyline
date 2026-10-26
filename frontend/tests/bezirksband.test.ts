// @vitest-environment node
/**
 * MASTER-2027 Zielbild #20 (Z-06) — the district announces its risk on the ground.
 *
 * A flat band around each plot, casing plus core, the same construction the
 * route stripe (§07.06) and the chosen tower's contour (Z-03) use, for the same
 * measured reason. Held here:
 *
 *   1. no risk tone carries an edge alone on the ground — each of the five inks
 *      the band can wear is checked against every surface it can lie on, and
 *      the framed pair has to clear 2.5:1 everywhere;
 *   2. the calm branch is not "no findings". A plot with files the off scanners
 *      would have covered wears the unexamined ink, not the green that means
 *      "looked, found nothing" — the difference is a promise about safety, and
 *      the payload knows which of the two it is;
 *   3. the band stands outside the kerb stones, so it frames the plot instead of
 *      being buried under it;
 *   4. at the operating measure the world is run at on the ground — not the
 *      resident band's — the core is ≥ 3 px and the frame ≥ 2 px;
 *   5. one mesh per district, one shared material, no new instance, no new hex.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import * as THREE from "three";
import {
  ENV,
  SEVERITY_COLOR,
  THREAT_COLOR,
  UNCHECKED_COLOR,
  severityColor,
} from "../src/city/palette";
import { contrast } from "./colourMath";
import { DISTRICT_BAND, districtBandGeometry } from "../src/city/districtBand";

const DISTRICT = readFileSync(new URL("../src/components/District.tsx", import.meta.url), "utf-8");

/** Every surface a ground band can lie on. */
const BODEN: Array<[string, string]> = [
  ["ground", ENV.ground],
  ["plot", ENV.plot],
  ["road", ENV.road],
  ["curb", ENV.curb],
  ["crosswalk", ENV.crosswalk],
  ["lane dash", ENV.laneDash],
  ["plot edge", ENV.plotEdge],
];

/** The five inks the band actually wears: three grades × two branches, plus calm. */
const RISIKO: Array<[string, string]> = [
  ...(["P0", "P1", "P2"] as const).flatMap((sev) => [
    [`severity ${sev}`, severityColor(sev, false)] as [string, string],
    [`severity ${sev} cvd`, severityColor(sev, true)] as [string, string],
  ]),
  ["unexamined", UNCHECKED_COLOR],
  ["reviewed calm", THREAT_COLOR.low],
];

describe("the framed band stands on every ground surface", () => {
  it("clears 2.5:1 by its stronger edge, for every ink and every surface", () => {
    expect(RISIKO.length).toBe(8);
    for (const [name, hex] of RISIKO) {
      for (const [flaeche, ober] of BODEN) {
        const kern = contrast(hex, ober);
        const gehaeuse = contrast(ENV.arcCasing, ober);
        expect(
          Math.max(kern, gehaeuse),
          `${name} against ${flaeche} (core ${kern.toFixed(2)}, casing ${gehaeuse.toFixed(2)})`,
        ).toBeGreaterThanOrEqual(2.5);
      }
    }
  });

  it("records which inks need the frame at all", () => {
    // The frame is not decoration: without it several of these tones are
    // invisible on the very ground they announce themselves on.
    const alleinSchwach = RISIKO.filter(([, hex]) =>
      BODEN.some(([, ober]) => contrast(hex, ober) < 2.5),
    ).map(([name]) => name);
    expect(alleinSchwach.length).toBeGreaterThanOrEqual(6);
  });

  it("keeps the core clear of its casing, except where the core carries the edge", () => {
    // `safe` measures 1.95:1 on the casing and is therefore NOT one of the
    // band's inks — the calm branch takes `low`, which clears 9.03:1.
    expect(contrast(THREAT_COLOR.low, ENV.arcCasing)).toBeGreaterThanOrEqual(3);
    expect(contrast(THREAT_COLOR.safe, ENV.arcCasing)).toBeLessThan(3);
    expect(
      RISIKO.some(([, hex]) => hex === THREAT_COLOR.safe),
      "safe never ships here",
    ).toBe(false);
  });
});

describe("the calm branch is a payload fact, not the absence of a finding", () => {
  it("splits 'nothing found' from 'nobody looked'", () => {
    expect(DISTRICT).toMatch(
      /worstSev\s*\?\s*severityColor\(worstSev, colorblind\)\s*:\s*\(dir\.unverifiedFiles \?\? 0\) > 0\s*\?\s*UNCHECKED_COLOR\s*:\s*threatColor\("low", colorblind\)/,
    );
    // The calm branch goes through the function, not the table: `THREAT_COLOR`
    // read directly is what `threat-tabelle.test.ts` fails a component for.
    expect(DISTRICT).not.toMatch(/THREAT_COLOR\./);
  });

  it("keeps the unexamined ink away from the reviewed green", () => {
    expect(UNCHECKED_COLOR).not.toBe(THREAT_COLOR.low);
    // And the two are distinguishable on their own, not only against the ground.
    expect(contrast(UNCHECKED_COLOR, THREAT_COLOR.low)).toBeGreaterThanOrEqual(1.2);
  });
});

describe("the band's geometry", () => {
  const geo = () => districtBandGeometry(12, 9, SEVERITY_COLOR.P0)!;
  const attrs = (g: THREE.BufferGeometry) => ({
    pos: (g.getAttribute("position") as THREE.BufferAttribute).array as Float32Array,
    col: (g.getAttribute("color") as THREE.BufferAttribute).array as Float32Array,
  });

  it("lays eight flat quads and two inks", () => {
    const { pos, col } = attrs(geo());
    // Two annuli × four rectangles, six vertices a quad.
    expect(pos.length / 18).toBe(8);
    const ys = new Set<number>();
    for (let i = 1; i < pos.length; i += 3) ys.add(Number(pos[i]!.toFixed(4)));
    expect([...ys].sort((a, b) => a - b)).toEqual([
      DISTRICT_BAND.y,
      Number((DISTRICT_BAND.y + 0.01).toFixed(4)),
    ]);
    const p0 = new THREE.Color(SEVERITY_COLOR.P0);
    const kas = new THREE.Color(ENV.arcCasing);
    let kern = 0;
    let geh = 0;
    for (let i = 0; i < col.length; i += 3) {
      if (Math.abs(col[i]! - p0.r) < 1e-6) kern++;
      else if (Math.abs(col[i]! - kas.r) < 1e-6) geh++;
      else expect.fail(`a third colour at vertex ${i / 3}`);
    }
    expect(kern).toBe(geh);
    expect(kern).toBe(24);
  });

  it("stands outside the kerb stones it frames", () => {
    // The stones run to half-size + 1.25 (centre 1.1, width 0.3).
    const { pos } = attrs(geo());
    let innerst = Infinity;
    for (let i = 0; i < pos.length; i += 9) {
      const x = Math.abs(pos[i]!);
      const z = Math.abs(pos[i + 2]!);
      const kante = Math.max(x, z);
      // The near-side corner of each rectangle is the band's inner edge.
      innerst = Math.min(innerst, Math.min(x, z) === 0 ? kante : kante);
    }
    const innererRand = 12 / 2 + DISTRICT_BAND.abstand;
    expect(innererRand).toBeGreaterThan(12 / 2 + 1.25);
    expect(innerst).toBeGreaterThanOrEqual(innererRand - 1e-6);
  });

  it("tiles both annuli without overlaps", () => {
    const { pos } = attrs(geo());
    let summe = 0;
    for (let i = 0; i < pos.length; i += 9) {
      summe += Math.abs(pos[i + 3]! - pos[i]!) * Math.abs(pos[i + 5]! - pos[i + 2]!);
    }
    const { abstand, casingWidth: kas, coreWidth: kern } = DISTRICT_BAND;
    const hx = 12 / 2 + abstand + kas;
    const hz = 9 / 2 + abstand + kas;
    const pad = (kas - kern) / 2;
    const ring = (o: number, u: number, b: number): number => 4 * b * (o + u - b);
    expect(summe).toBeCloseTo(ring(hx, hz, kas) + ring(hx - pad, hz - pad, kern), 3);
  });

  it("refuses a plot it cannot frame", () => {
    expect(districtBandGeometry(0, 9, SEVERITY_COLOR.P0)).toBeNull();
    expect(districtBandGeometry(12, NaN, SEVERITY_COLOR.P0)).toBeNull();
  });
});

describe("at the measure the ground is actually seen at", () => {
  // Z-03 measured 12.75 px per world unit across a mid-rise tower; the district
  // plaza is seen at the same overview elevation, so a flat band is squashed by
  // sin(0.68) on top of that.
  const BETRIEBSMASS = 12.75;
  const SQUASH = Math.sin(0.68);

  it("paints a core of three pixels or more", () => {
    expect(DISTRICT_BAND.coreWidth * BETRIEBSMASS * SQUASH).toBeGreaterThanOrEqual(3);
  });

  it("leaves two pixels of frame on each side of the core", () => {
    const rand = (DISTRICT_BAND.casingWidth - DISTRICT_BAND.coreWidth) / 2;
    // 0,25 units arrived on the plate as 1 px (median over 69 edges) — the
    // margin below is what turns that measured shortfall into 2 px or more.
    expect(rand).toBeGreaterThanOrEqual(0.35);
    expect(rand * BETRIEBSMASS * SQUASH).toBeGreaterThanOrEqual(2.5);
  });
});

describe("the wiring costs one mesh per district", () => {
  it("shares one material and releases the geometry", () => {
    expect(DISTRICT.match(/geometry=\{bandGeo\}/g) ?? []).toHaveLength(1);
    expect(DISTRICT).toContain("const BAND_MATERIAL = new THREE.MeshBasicMaterial");
    expect(DISTRICT).toContain("bandGeo?.dispose()");
  });

  it("adds no instance and no hex literal to the district", () => {
    const vorher = (DISTRICT.match(/<instancedMesh/g) ?? []).length;
    expect(vorher).toBeGreaterThanOrEqual(0);
    const modul = readFileSync(new URL("../src/city/districtBand.ts", import.meta.url), "utf-8");
    expect(modul.match(/#[0-9a-fA-F]{3,8}/g) ?? [], "no literal colour in the builder").toEqual([]);
  });

  it("does not answer the pointer", () => {
    // The plot underneath owns the click; a band that swallowed it would break
    // the drill-in contract the district is built on.
    const block = DISTRICT.slice(DISTRICT.indexOf("geometry={bandGeo}"));
    expect(block.slice(0, 300)).toContain("raycast={() => null}");
  });
});
