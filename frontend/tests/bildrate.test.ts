// @vitest-environment node
/**
 * MASTER-2027 Zielbild #14 (Z-04) — the frame rate stands in the header.
 *
 * `city/perf.ts` has measured frame times since the automatic graphics switch
 * was built; the number never left the program. Four things are held here so
 * the readout is a measurement and not a second opinion:
 *
 *   1. it is the governor's own window — one quantity, one source, so the
 *      figure and the switch that is named after it cannot disagree;
 *   2. it says nothing while the window is still filling; a rate measured from
 *      the frames since the last tab switch describes the switch, not the
 *      machine;
 *   3. it is the median, so one GC pause cannot move the number the reader is
 *      watching;
 *   4. it is published on a bound, not every frame — a readout that ticks at
 *      60 Hz is a re-render at 60 Hz, in a component whose own comment says a
 *      decision that changes nothing must not touch React state.
 *
 * The ink is the file count's ink, at the file count's size: the header's
 * legibility was measured for that pair (`globals.css:1040-1058`), and a new
 * instrument in the same row has no business re-deriving it.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { HEALTHY_MS, STRUGGLE_MS, WINDOW, frameHz, medianOf } from "../src/city/perf";

const GOVERNOR = readFileSync(
  new URL("../src/components/GfxGovernor.tsx", import.meta.url),
  "utf-8",
);
const HUD = readFileSync(new URL("../src/components/HudOverlay.tsx", import.meta.url), "utf-8");
const CSS = readFileSync(new URL("../src/design/stadt-ui.css", import.meta.url), "utf-8");

const fenster = (ms: number, n = WINDOW): number[] => Array.from({ length: n }, () => ms);

describe("the number is the governor's own window", () => {
  it("reads 60 off a 16,667 ms frame", () => {
    expect(frameHz(fenster(1000 / 60))).toBe(60);
  });

  it("reads the median, so one pause does not move the readout", () => {
    const buf = fenster(1000 / 60, WINDOW - 1);
    buf.push(180); // one collected frame, 5,5 Hz
    expect(medianOf(buf)).toBeCloseTo(1000 / 60, 3);
    expect(frameHz(buf)).toBe(60);
    // The same window would have made the governor act on the mean: 180 ms in
    // an average of 120 frames is 18,0 ms — over the HEALTHY_MS line it uses to
    // come back up. The median is what keeps number and switch honest.
    expect(buf.reduce((a, v) => a + v, 0) / buf.length).toBeGreaterThan(HEALTHY_MS);
  });

  it("says nothing while the window is still filling", () => {
    expect(frameHz(fenster(1000 / 60, WINDOW - 1))).toBeNull();
    expect(frameHz([])).toBeNull();
    // …including right after a tab switch, which is exactly when a naive
    // counter would print its loudest lie.
  });

  it("refuses a window it cannot turn into a rate", () => {
    expect(frameHz(fenster(0))).toBeNull();
    expect(frameHz(fenster(-5))).toBeNull();
    expect(frameHz(fenster(Number.NaN))).toBeNull();
  });

  it("brackets the thresholds the switch decides from", () => {
    // A reader who sees the number and the switch disagree needs a reason, so
    // the two rates the machine acts on have to be expressible in it.
    expect(frameHz(fenster(STRUGGLE_MS))).toBe(45);
    expect(frameHz(fenster(HEALTHY_MS))).toBe(57);
  });
});

describe("the wiring publishes it without running the app at React speed", () => {
  it("takes the rate from the buffer the decision already reads", () => {
    expect(GOVERNOR).toContain("const hz = frameHz(buf)");
    expect(GOVERNOR).toContain(
      "autoGfxDecision(\n      store.prefs.gfxLite || store.autoGfxLite,\n      buf,",
    );
  });

  it("gates the write on both a moved value and a passed interval", () => {
    expect(GOVERNOR).toMatch(
      /hz !== null && hz !== store\.frameHz && jetzt - zuletzt\.current > PUBLISH_MS/,
    );
    const ms = Number(GOVERNOR.match(/const PUBLISH_MS = (\d+)/)?.[1]);
    expect(ms).toBeGreaterThanOrEqual(250);
    expect(ms).toBeLessThanOrEqual(1000);
  });

  it("adds no second frame loop", () => {
    expect(GOVERNOR.match(/useFrame\(/g) ?? []).toHaveLength(1);
  });

  it("renders nothing before the first full window", () => {
    expect(HUD).toContain("{frameHz !== null && (");
    expect(HUD).toContain("const frameHz = useStore((s) => s.frameHz);");
  });

  it("keeps the store's empty state empty", () => {
    const store = readFileSync(new URL("../src/stores/useStore.ts", import.meta.url), "utf-8");
    expect(store).toContain("frameHz: null,");
    expect(store).toContain("setFrameHz: (v) => set({ frameHz: v }),");
  });
});

describe("the readout is the header's own instrument", () => {
  const regel = CSS.slice(CSS.indexOf(".workspace-fps {"), CSS.indexOf(".workspace-fps > span"));
  const dateien = CSS.slice(
    CSS.indexOf(".workspace-files {"),
    CSS.indexOf("/* The door to the search field."),
  );

  it("wears the file count's ink and size", () => {
    expect(regel).toContain("color: var(--brand-ink)");
    expect(dateien).toContain("color: var(--brand-ink)");
    expect(regel.match(/font-size: (\d+px)/)?.[1]).toBe(dateien.match(/font-size: (\d+px)/)?.[1]);
  });

  it("keeps its digits from shuffling the row", () => {
    expect(regel).toContain("font-variant-numeric: tabular-nums");
    expect(regel).toContain("white-space: nowrap");
  });
});
