import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { HUD_SURFACES } from "../src/city/labelPlacement";

/**
 * The label keeps out of the HUD by knowing where the HUD is. That knowledge is
 * a list of class names, and a list like this rots in silence: rename
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

  it("reserves the project card B3 measured a plaque under", () => {
    // Re-measured 2026-10-29: the demo's infrastructure plaque lay 52.1 %
    // (3,355 px) under the open card at 1440x900 and 65 % (4,180 px) at
    // 1280x800. A plate the card may not cover is a plate the card must be
    // reserved against — both of the card's shapes, like the announcement's.
    for (const cls of ["panel-context-card", "context-reopen"]) {
      expect(HUD_SURFACES, cls).toContain(`.${cls}`);
    }
  });

  it("reserves the height mast's live legend", () => {
    // 2026-11-06, WebKit 1440x900: the demo's docs plaque covered the mast's
    // ticks and roof note. The legend is a measurement surface, not scenery.
    expect(HUD_SURFACES).toContain(".cf-mast");
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

describe("B3 — the district plaque obeys the same rule", () => {
  const district = readFileSync(path.resolve(SRC, "components/District.tsx"), "utf-8");

  it("hands drei its own position rule, built on placeLabel", () => {
    expect(district).toContain("calculatePosition={plakettePosition}");
    expect(district).toContain("placeLabel(");
    expect(district).toContain("hudBoxes(canvas, HUD_SURFACES)");
  });

  it("sets no second HUD read of its own rhythm", () => {
    // The plaque shares the import plate's 250 ms census — one interval, not
    // one per plot, or six districts would query the HUD six times over.
    expect(district).toContain("const HUD_REFRESH_MS = 250;");
    expect((district.match(/HUD_REFRESH_MS/g) ?? []).length).toBe(2);
  });

  it("says where its plot went when the rule had to move it", () => {
    expect(district).toContain("plate.dataset.toward");
    expect(district).toContain("plate.dataset.detached");
  });
});

/**
 * A DOM plate is painted after the WebGL canvas, so it has no depth of its own.
 * These guards hold the two ends of the fix: a curated solid-city provider, and
 * a short fade instead of a per-frame pop when the orbit crosses a tower edge.
 */
describe("labels hide behind the city, not just behind the HUD", () => {
  const wrapper = readFileSync(path.resolve(SRC, "render/LabelOcclusion.tsx"), "utf-8");
  const tree = readFileSync(path.resolve(SRC, "components/CityTree.tsx"), "utf-8");
  const css = readFileSync(path.resolve(SRC, "design/city-funktion.css"), "utf-8");

  it("hands drei the curated occluder and keeps the DOM node for the fade", () => {
    expect(wrapper).toContain("export const LabelOccludersContext");
    expect(wrapper).toContain("occlude={occlude}");
    expect(wrapper).toContain("onOcclude={setOccluded}");
    expect(wrapper).toContain('data-occluded={hidden ? "true" : undefined}');
    expect(tree).toContain('<group ref={setLabelOccluder} name="label-occluders">');
    expect(tree).toContain("<LabelOccludersContext.Provider value={labelOccluder}>");
  });

  it("puts plots and towers in the occluder group; roads, crowd and arcs stay out", () => {
    const start = tree.indexOf('name="label-occluders"');
    const group = tree.slice(start, tree.indexOf("</group>", start));
    expect(group).toContain("<District");
    expect(group).toContain("<Building");
    expect(group).not.toContain("<RoadSystem");
    expect(group).not.toContain("<Pedestrians");
    expect(group).not.toContain("<CityConnections");
  });

  it("moves every content plate onto the wrapper", () => {
    const district = readFileSync(path.resolve(SRC, "components/District.tsx"), "utf-8");
    const connections = readFileSync(path.resolve(SRC, "components/CityConnections.tsx"), "utf-8");
    const pedestrians = readFileSync(path.resolve(SRC, "components/Pedestrians.tsx"), "utf-8");
    expect(district).toContain("<OccludableHtml");
    expect((connections.match(/<OccludableHtml/g) ?? []).length).toBe(2);
    expect((pedestrians.match(/<OccludableHtml/g) ?? []).length).toBe(3);
    expect(connections).toContain('k === "bogen" ? plateRef.current : plattenRef.current.get(k)');
    expect(connections).toContain(
      'el?.closest(".label-occludable")?.getAttribute("data-occluded")',
    );
    expect(connections).toContain('!== "true"');
  });

  it("leaves the measuring mast and the far heat chips unoccluded", () => {
    const road = readFileSync(path.resolve(SRC, "components/RoadSystem.tsx"), "utf-8");
    expect(road).toContain("<Html");
    expect(road).not.toContain("OccludableHtml");
    // The far tier is tiles, not towers: its chip is the tile's only name.
    const farChip = tree.indexOf("district-label-${b.dir.path}");
    expect(farChip).toBeGreaterThan(-1);
    expect(tree.lastIndexOf("<Html", farChip)).toBeGreaterThan(-1);
  });

  it("waits through a one-frame crossing instead of flickering", () => {
    expect(wrapper).toMatch(/HIDE_AFTER_MS = 140/);
    expect(wrapper).toMatch(/SHOW_AFTER_MS = 90/);
    expect(wrapper).toContain("window.setTimeout");
    expect(wrapper).toContain("window.clearTimeout");
  });

  it("fades with a reduced-motion exit and keeps the plate in layout", () => {
    expect(css).toContain('.label-occludable[data-occluded="true"]');
    expect(css).toContain("opacity: 0");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("transition: none;");
  });
});
