// @vitest-environment node
/**
 * MASTER-2027 Zielbild #21 (Z-05) — the layer view's four numbers.
 *
 * The acceptance the step was sold on is one sentence: the four percentages
 * agree with the channel values of the payload. So the tests do not look at
 * the rendered bar; they count the same files a second way, with the shipped
 * fixture builder, and require the module's four numbers to match. Three more
 * things are held, because each is a way a share can lie:
 *
 *   1. an absent field is not an answer — a file with no `coveragePct` did not
 *      fail coverage, no report ran, and the row must not count it either way;
 *   2. an empty plaza gives 0 %, not NaN and not 100 %;
 *   3. the block stands where the arrival word budget has room, which is the
 *      foldable colour key — not the project card that is on screen at arrival.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { DICT } from "../src/i18n/dict";
import type { CityFile } from "../src/city/types";
import {
  LAYER_LABEL,
  LAYER_ORDER,
  layerShares,
  plazaFiles,
  type LayerKey,
} from "../src/city/layerShares";
import { dir, file, finding } from "./helpers/cityFixture";

const HUD = readFileSync(new URL("../src/components/HudOverlay.tsx", import.meta.url), "utf-8");
const CARD = readFileSync(new URL("../src/components/ContextCard.tsx", import.meta.url), "utf-8");
const VIEW = readFileSync(new URL("../src/components/LayerView.tsx", import.meta.url), "utf-8");

/** A plaza of `n` files, `answered` of which answer the given layer. */
function plaza(n: number, answered: Partial<Record<LayerKey, number>>): CityFile[] {
  const out: CityFile[] = [];
  for (let i = 0; i < n; i++) {
    out.push(
      file(
        `src/mod${i}.ts`,
        "TypeScript",
        i < (answered.security ?? 0) ? [finding()] : [],
        undefined,
        {
          linesOfCode: 40,
          importCount: i < (answered.dependencies ?? 0) ? 3 : undefined,
          coveragePct: i < (answered.coverage ?? 0) ? 80 : undefined,
        },
      ),
    );
  }
  return out;
}

const pct = (liste: ReturnType<typeof layerShares>, key: LayerKey): number | null =>
  liste.find((l) => l.key === key)!.pct;

describe("the four numbers are the payload's own", () => {
  it("counts each layer over the same files, independently", () => {
    const shares = layerShares(plaza(50, { security: 6, dependencies: 20, coverage: 31 }));
    // Counted here by hand, from the fixture, not by re-running the module.
    expect(shares.find((s) => s.key === "structure")!.answered).toBe(50);
    expect(shares.find((s) => s.key === "security")!.answered).toBe(6);
    expect(shares.find((s) => s.key === "dependencies")!.answered).toBe(20);
    expect(shares.find((s) => s.key === "coverage")!.answered).toBe(31);
    expect(pct(shares, "structure")).toBe(100);
    expect(pct(shares, "security")).toBe(12);
    expect(pct(shares, "dependencies")).toBe(40);
    expect(pct(shares, "coverage")).toBe(62);
    // Every row carries its own denominator, so the reader can check it.
    for (const s of shares) expect(s.total).toBe(50);
  });

  it("rounds to whole percent without inventing a file", () => {
    const shares = layerShares(plaza(3, { security: 1, coverage: 2 }));
    expect(pct(shares, "security")).toBe(33);
    expect(pct(shares, "coverage")).toBe(67);
    // The answer count survives the rounding: 1 of 3, not 33 of 100.
    expect(shares.find((s) => s.key === "security")!.answered).toBe(1);
  });

  it("treats an absent field as no answer, and a zero as a read", () => {
    // `importCount: 0` means the reader looked and found nothing: the layer
    // ran, the file is not one of the dependent ones. `undefined` means the
    // layer never saw the file at all.
    const mitNull = file("src/a.ts", "TypeScript", [], undefined, { importCount: 0 });
    const abhaengig = file("src/a2.ts", "TypeScript", [], undefined, { importCount: 4 });
    const ohne = file("src/b.ts", "TypeScript");
    const nurNull = layerShares([mitNull]);
    expect(nurNull.find((s) => s.key === "dependencies")!.read).toBe(1);
    expect(nurNull.find((s) => s.key === "dependencies")!.answered).toBe(0);
    expect(pct(nurNull, "dependencies")).toBe(0);
    expect(pct(layerShares([ohne]), "dependencies")).toBeNull();
    expect(pct(layerShares([mitNull, abhaengig]), "dependencies")).toBe(50);
    // Coverage: 0 % covered is an answer; no report is not.
    expect(
      pct(
        layerShares([file("src/c.ts", "TypeScript", [], undefined, { coveragePct: 0 })]),
        "coverage",
      ),
    ).toBe(0);
    expect(pct(layerShares([ohne]), "coverage")).toBeNull();
  });

  it("counts the plaza, not just the towers one district draws", () => {
    // The demo's own shape: an empty root, every file inside the children. A
    // share taken from `detailFiles` alone is four zeroes at the moment the
    // reader arrives, which is the bug this walk exists to avoid.
    const wurzel = dir({
      name: "demo-city",
      path: "",
      fileCount: 6,
      detailFiles: [],
      children: [
        dir({ name: "src", path: "src", fileCount: 2, detailFiles: plaza(2, { security: 1 }) }),
        dir({ name: "test", path: "test", fileCount: 4, detailFiles: plaza(4, { coverage: 2 }) }),
      ],
    });
    expect(plazaFiles(wurzel)).toHaveLength(6);
    const shares = layerShares(plazaFiles(wurzel));
    expect(shares[0]!.total).toBe(6);
    expect(pct(shares, "security")).toBe(Math.round((100 * 1) / 6));
    expect(pct(shares, "coverage")).toBe(Math.round((100 * 2) / 6));
    expect(dir({ detailFiles: [] }).detailFiles).toHaveLength(0);
  });

  it("gives no number for an empty plaza, never NaN", () => {
    const shares = layerShares([]);
    expect(shares).toHaveLength(4);
    for (const s of shares) {
      // Nothing was read, so nothing can be reported — and the block itself
      // stays off screen at total 0 (LayerView), rather than showing four dashes.
      expect(s.pct, s.key).toBeNull();
      expect(s.total).toBe(0);
      expect(s.read).toBe(0);
    }
  });

  it("ignores a non-finite coverage reading", () => {
    const kaputt = file("src/d.ts", "TypeScript", [], undefined, { coveragePct: Number.NaN });
    expect(pct(layerShares([kaputt]), "coverage")).toBeNull();
  });
});

describe("the block names four layers, and only those", () => {
  it("is exactly the four the city is drawn from, in this order", () => {
    expect(LAYER_ORDER).toEqual(["structure", "security", "dependencies", "coverage"]);
    expect(layerShares([]).map((s) => s.key)).toEqual([...LAYER_ORDER]);
  });

  it("has a name in both languages for every row", () => {
    for (const key of LAYER_ORDER) {
      const dictKey = LAYER_LABEL[key];
      expect(DICT[dictKey], `${key} needs a label`).toBeDefined();
      expect(DICT[dictKey]!.en.trim().length).toBeGreaterThan(0);
      expect(DICT[dictKey]!.de.trim().length).toBeGreaterThan(0);
    }
  });

  it("says plainly that a row is a share, not a grade", () => {
    // The number is a coverage-of-data statement; without this line "Test
    // coverage 62 %" reads as "62 % of the code is tested", which the payload
    // does not say.
    expect(DICT["ctx.layerExplainer"]!.en).toMatch(/answer for/i);
    expect(DICT["ctx.layerExplainer"]!.en).toMatch(/not a grade/i);
    expect(DICT["ctx.layerExplainer"]!.de).toMatch(/Anteil/);
    expect(DICT["ctx.layerExplainer"]!.de).toMatch(/keine Note/);
  });
});

describe("it stands behind a disclosure, not on the arriving screen", () => {
  it("mounts inside the project card's colour-key disclosure", () => {
    const auf = CARD.indexOf("{legendOpen && (");
    expect(auf).toBeGreaterThan(-1);
    expect(CARD.slice(auf, CARD.indexOf(")}", auf))).toContain("<LayerView />");
    // The bottom-anchored HUD strip is where it stood first, and it grew UP
    // into the card above it: `.city-legend` is `position:absolute; bottom:…`,
    // so a tall child has nowhere to go but over its neighbour.
    expect(HUD).not.toContain("<LayerView />");
  });

  it("is off the DOM until the reader opens it", () => {
    // The arrival budget counts `textContent`, which includes hidden text — so
    // the block has to be unmounted, not merely unfolded.
    expect(CARD).toMatch(/\{legendOpen && \([\s\S]*?<LayerView \/>/);
  });

  it("draws a dash, not a zero, for a layer that never ran", () => {
    expect(VIEW).toContain('l.pct === null ? "–"');
    expect(DICT["ctx.layer.none"]!.en).toMatch(/not a zero/);
    expect(DICT["ctx.layer.none"]!.de).toMatch(/keine Null/);
  });

  it("draws no bar and no hue of its own", () => {
    expect(VIEW).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    const css = readFileSync(new URL("../src/design/stadt-ui.css", import.meta.url), "utf-8");
    const anfang = css.indexOf(".ctx-layers {");
    const block = css.slice(anfang, css.indexOf("/* Severity chips", anfang));
    expect(anfang).toBeGreaterThan(-1);
    expect(block).toContain("var(--brand-ink)");
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });
});
