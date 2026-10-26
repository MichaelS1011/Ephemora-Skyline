import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { HUD_SURFACES } from "../src/city/labelPlacement";

/**
 * The label keeps out of the HUD by knowing where the HUD is. That knowledge is
 * a list of seven class names, and a list like this rots in silence: rename
 * `.panel-info` and the plate starts sitting on the dossier, with every test
 * still green because nothing checks the list against the tree.
 */
const SRC = path.resolve(import.meta.dirname, "../src");

const source = (): string => {
  const parts: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(tsx?|css)$/.test(entry)) parts.push(readFileSync(full, "utf-8"));
    }
  };
  walk(SRC);
  return parts.join("\n");
};

const ALL = source();

describe("the surfaces the import label keeps clear of", () => {
  it("names every one of them", () => {
    expect(HUD_SURFACES.length).toBeGreaterThanOrEqual(8);
  });

  it("finds every class it lists still painted somewhere in the tree", () => {
    const missing = HUD_SURFACES.map((s) => s.slice(1)).filter(
      (cls) => !new RegExp(`\\b${cls}\\b`).test(ALL),
    );
    expect(missing, `renamed away: ${missing.join(", ")}`).toEqual([]);
  });

  it("still covers the four surfaces that were measured on top of the plate", () => {
    // The header, the mode bar, the announcement strip and the dossier each
    // covered the label in a real frame on 2026-10-22.
    for (const cls of [
      "workspace-header",
      "workspace-breadcrumbs",
      "workspace-modes",
      "start-summary-strip-slot",
      "panel-info",
    ]) {
      expect(HUD_SURFACES, cls).toContain(`.${cls}`);
    }
  });
});

describe("the plate is placed by the rule, not by the camera", () => {
  const file = readFileSync(path.resolve(SRC, "components/CityConnections.tsx"), "utf-8");

  it("hands drei its own position rule", () => {
    expect(file).toContain("calculatePosition={calculatePosition}");
  });

  it("no longer shrinks with distance", () => {
    // `distanceFactor` is what made the label 1.12 px at the far camera. Without
    // it drei renders the plate at its CSS size and scale 1.
    expect(file).not.toMatch(/distanceFactor/);
  });

  it("leaves the arc itself alone", () => {
    // Folge-003 is a label fix. The casing, the two direction cores and the
    // pulse are the previous round's work and must not move with it.
    expect(file).toContain("ENV.arcCasing");
    expect(file).toContain("ENV.importOut");
    expect(file).toContain("ENV.importIn");
    expect(file).toContain("reducedSettle(");
  });
});

/**
 * MASTER-2027 Z-02 — every neighbour tower carries a plate of its own.
 *
 * The target frame names the relationship at both ends of it. The city drew one
 * plate so far, and §06.07 measured that in the demo arrival that plate lay
 * 100 % under the open context card (6 410 px, the same area in two loads): the
 * one sentence the scene knew how to say was the one the reader could not read.
 * These guards hold the four things that make the change a rule and not a
 * coincidence — one plate per neighbour, a gap kept from every other plate, the
 * numbers read from the payload, and no geometry bought to do it.
 */
describe("Z-02 — the neighbour plates", () => {
  const datei = readFileSync(path.resolve(SRC, "components/CityConnections.tsx"), "utf-8");

  it("draws one plate per neighbour, only while a building is selected", () => {
    expect(datei).toContain("const NACHBARN_MAX = 6;");
    expect(datei).toMatch(/if \(!selectedFileId \|\| !showFileArcs\) return \[\];/);
    expect(datei).toContain("const gesehen = new Set<string>();");
    expect(datei).toContain('className="cf-plate cf-plate-neighbour"');
    // The plate rides the neighbour's own roof, not the arc's apex.
    expect(datei).toMatch(/const anker = a\.from === selectedFileId \? a\.end : a\.start;/);
  });

  it("keeps the gap to every other plate by reserving it inflated", () => {
    // `placeLabel` calls 1 px of contact "no contact" and a plate reads the
    // previous frame of a sibling placed after it; measured, that left 9 px² of
    // overlap. The distance is the rule now, not the outcome.
    expect(datei).toContain("const PLATE_ABSTAND = 4;");
    expect(datei).toMatch(/w: b\.w \+ PLATE_ABSTAND \* 2/);
    expect(datei).toMatch(/h: b\.h \+ PLATE_ABSTAND \* 2/);
    // Both positioners use it — the arc plate and the neighbour plates.
    expect(datei).toContain("const anderePlatten = (eigenes: string)");
    expect((datei.match(/anderePlatten\("/g) ?? []).length).toBe(1);
    expect((datei.match(/anderePlatten\(id\)/g) ?? []).length).toBe(1);
  });

  it("quotes the payload for its two numbers", () => {
    expect(datei).toMatch(/loc: gebaeude\.file\.linesOfCode/);
    expect(datei).toMatch(/funde: gebaeude\.file\.findings\.length/);
    expect(datei).toMatch(/n\.funde === 1 \? "plate\.findingsOne" : "plate\.findingsMany"/);
    expect(datei).toContain('"plate.findingsNone"');
  });

  it("buys no geometry and no instance to say it", () => {
    const block = datei.slice(datei.indexOf("{nachbarn.map"), datei.indexOf("{dirGeos.map"));
    expect(block.length).toBeGreaterThan(80);
    expect(block).not.toContain("<mesh");
    expect(block).not.toContain("instancedMesh");
    expect(block).not.toContain("Geometry");
    expect(datei.match(/<instancedMesh/g) ?? []).toHaveLength(0);
  });

  it("speaks both languages on every new line", () => {
    const dict = readFileSync(path.resolve(SRC, "i18n/dict.ts"), "utf-8");
    for (const key of [
      "plate.lines",
      "plate.findingsOne",
      "plate.findingsMany",
      "plate.findingsNone",
    ]) {
      const stelle = dict.indexOf(`"${key}"`);
      expect(stelle, `${key} fehlt`).toBeGreaterThan(-1);
      const zweig = dict.slice(stelle, stelle + 220);
      expect(zweig, `${key} ohne englische Zeile`).toContain("en:");
      expect(zweig, `${key} ohne deutsche Zeile`).toContain("de:");
    }
  });
});
