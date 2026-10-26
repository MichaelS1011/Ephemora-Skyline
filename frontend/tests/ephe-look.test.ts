// @vitest-environment jsdom
import path from "path";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  EPHE_DEFAULT_LOOK,
  type EpheLook,
  clearEpheLook,
  hasStoredLook,
  lookFor,
  readEpheLook,
  saveEpheLook,
} from "../src/epheLook";
import { EPHE_MARKS, EPHE_PALETTE, EPHE_VARIANTS, epheOutfit } from "../src/city/palette";
import { useStore } from "../src/stores/useStore";

/**
 * MASTER-2027 §04.09 — the look the reader picked survives the browser.
 *
 * The rule that makes a store honest is the read side: a value this build would
 * not write must not come back as a chip the panel cannot offer. An older build
 * could have stored a jacket index that §04.06 rejected as a band foot, and a
 * hand-edited key can hold anything, so both fall back — to the shipped jacket
 * and to no mark — rather than rendering a fourth chip or an invisible shape.
 */

const KEY = "codecity-ephe-look:v1";

const writeRaw = (value: string): void => {
  localStorage.setItem(KEY, value);
};

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe("the stored look", () => {
  it("starts at the shipped figure on a fresh browser", () => {
    expect(readEpheLook()).toEqual({ jacket: 0, mark: "none" });
    expect(hasStoredLook()).toBe(false);
    expect(EPHE_DEFAULT_LOOK.jacket).toBe(EPHE_VARIANTS[0]);
  });

  it("writes what it reads, for every offered jacket and mark", () => {
    for (const jacket of EPHE_VARIANTS) {
      for (const mark of EPHE_MARKS) {
        localStorage.clear();
        expect(saveEpheLook({ jacket, mark })).toBe(true);
        expect(readEpheLook(), `jacket ${jacket}, mark ${mark}`).toEqual({ jacket, mark });
        expect(hasStoredLook()).toBe(true);
      }
    }
  });

  it("keeps the key small enough to be one resident, not a wardrobe", () => {
    saveEpheLook({ jacket: 7, mark: "diamond" });
    expect((localStorage.getItem(KEY) ?? "").length).toBeLessThan(64);
  });

  it("refuses a jacket that is not on offer, and keeps the mark it can show", () => {
    // 3 and 5 are real palette columns that §04.06 rejected — a stored 3 must
    // not become a chip the vitrine never drew.
    writeRaw('{"jacket":3,"mark":"dot"}');
    expect(readEpheLook()).toEqual({ jacket: 0, mark: "dot" });
    writeRaw('{"jacket":"7","mark":"dot"}');
    expect(readEpheLook().jacket).toBe(0);
    writeRaw('{"jacket":null,"mark":"none"}');
    expect(readEpheLook()).toEqual({ jacket: 0, mark: "none" });
  });

  it("refuses a mark it cannot draw, and keeps the jacket", () => {
    writeRaw('{"jacket":7,"mark":"star"}');
    expect(readEpheLook()).toEqual({ jacket: 7, mark: "none" });
    writeRaw('{"jacket":1,"mark":42}');
    expect(readEpheLook()).toEqual({ jacket: 1, mark: "none" });
  });

  it("falls back on garbage instead of throwing at the first paint", () => {
    for (const raw of ["", "{", "null", "[]", '"none"', '{"jacket":{}}']) {
      writeRaw(raw);
      expect(readEpheLook(), raw).toEqual({ jacket: 0, mark: "none" });
    }
  });

  it("says when storage took the write, and when it did not", () => {
    const real = Storage.prototype.setItem;
    expect(saveEpheLook({ jacket: 1, mark: "none" })).toBe(true);
    Storage.prototype.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    try {
      expect(saveEpheLook({ jacket: 1, mark: "dot" })).toBe(false);
    } finally {
      Storage.prototype.setItem = real;
    }
  });

  it("deletes the whole look, and the flag goes with it", () => {
    saveEpheLook({ jacket: 7, mark: "diamond" });
    expect(hasStoredLook()).toBe(true);
    clearEpheLook();
    expect(hasStoredLook()).toBe(false);
    expect(readEpheLook()).toEqual({ jacket: 0, mark: "none" });
  });

  it("is one key, named for what it holds", () => {
    saveEpheLook({ jacket: 1, mark: "dot" });
    expect(Object.keys(localStorage)).toEqual([KEY]);
  });
});

/**
 * MASTER-2027 §04.10 — the stored look reaches the figure in the city.
 *
 * The rule is one line wide, so the test is about its edges: only a named
 * resident wears it, the crowd keeps its own columns, and the store merges a
 * partial choice — the bug the vitrine had when the look was local state was two
 * clicks in one batch overwriting each other.
 */
describe("who wears the chosen look", () => {
  const LOOK: EpheLook = { jacket: 7, mark: "diamond" };

  it("dresses a named resident in the chosen column, whatever its index", () => {
    for (const i of [0, 1, 2, 5, 11, 46]) {
      const outfit = lookFor(LOOK, true, i);
      expect(outfit, `figure ${i}`).toEqual(epheOutfit(7));
      // and the pair is still one column, so §04.06's bands still hold
      expect(EPHE_PALETTE.sleeves.findIndex((c) => c === outfit.sleeve)).toBe(
        EPHE_PALETTE.jackets.findIndex((c) => c === outfit.coat),
      );
    }
  });

  it("leaves every unnamed figure on the crowd's own column", () => {
    for (const i of [0, 1, 2, 7, 13]) {
      expect(lookFor(LOOK, false, i)).toEqual(epheOutfit(i));
    }
  });

  it("merges a partial choice in the store, and writes it once", () => {
    useStore.getState().applyEpheLook({ jacket: 7 });
    useStore.getState().applyEpheLook({ mark: "dot" });
    expect(useStore.getState().epheLook).toEqual({ jacket: 7, mark: "dot" });
    expect(localStorage.getItem(KEY)).toBe('{"jacket":7,"mark":"dot"}');
    expect(useStore.getState().epheLookBlocked).toBe(false);
  });

  it("starts the store from what is on disk, not from a second default", () => {
    saveEpheLook({ jacket: 1, mark: "diamond" });
    useStore.setState({ epheLook: readEpheLook() });
    expect(useStore.getState().epheLook).toEqual({ jacket: 1, mark: "diamond" });
  });
});

/**
 * MASTER-2027 §04.10 — the wiring that lets the picture show the look.
 *
 * The live measurement (docs/reviews/2026-10-23-master-2027/stadtbild-messung.json)
 * found the one place where this rule can rot without any test noticing: the
 * crowd colours its figures in a layout effect, and a colour written there but
 * never flagged for upload stays in the CPU array — the resident is "dressed"
 * and the picture shows the crowd's column. Three lines are therefore pinned:
 * the flag that decides who wears the look, the state the effect re-runs on,
 * and the upload.
 */
describe("the crowd wears the look (§04.10)", () => {
  const quelle = readFileSync(
    path.resolve(import.meta.dirname, "../src/components/Pedestrians.tsx"),
    "utf-8",
  );

  it("asks the same key the card writes", () => {
    const schreiber = quelle.match(/lookFor\(epheLook,[^\n]*\);/g) ?? [];
    expect(schreiber).toHaveLength(1);
    expect(schreiber[0]).toContain("epheKey(e.identity) in residentNames");
  });

  it("re-dresses when a name arrives or a jacket turns", () => {
    const effekt = quelle.slice(
      quelle.indexOf("const outfit = lookFor("),
      quelle.indexOf("const outfit = lookFor(") + 2200,
    );
    const deps = effekt.match(/\}, \[([^\]]+)\]\);/)?.[1] ?? "";
    for (const abhaengigkeit of ["epheLook", "residentNames"])
      expect(deps, `dep list: ${deps}`).toContain(abhaengigkeit);
  });

  it("flags every colour buffer it wrote for upload", () => {
    const hochladen = quelle.match(/instanceColor\.needsUpdate = true/g) ?? [];
    // body, head, face and limbs together, plus the hats and the cargo — a
    // colour write without an upload is the invisible half of this feature
    expect(hochladen.length).toBeGreaterThanOrEqual(4);
    expect(quelle).toMatch(
      /for \(const ref of \[bodyRef, headRef, faceRef, limbRef\]\)[\s\S]{0,120}instanceColor\.needsUpdate/,
    );
  });
});
