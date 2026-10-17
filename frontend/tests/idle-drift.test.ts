// @vitest-environment jsdom
/**
 * The idle drift: the city keeps moving when nobody touches it, and stops the
 * moment anybody does. Three rules, each with a counter-case:
 *   1. a still camera begins to orbit after the threshold,
 *   2. any manual input (pointer/key/wheel) resets the clock — the drift must
 *      never fight the pilot,
 *   3. prefers-reduced-motion means no drift, ever.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const rigSrc = readFileSync(resolve(here, "../src/components/CameraRig.tsx"), "utf-8");
const storeSrc = readFileSync(resolve(here, "../src/stores/useStore.ts"), "utf-8");

describe("idle drift", () => {
  it("only runs in orbit mode, free of every competing camera owner", () => {
    const block = rigSrc.slice(
      rigSrc.indexOf("// Idle drift"),
      rigSrc.indexOf("// The bracket pair's mark"),
    );
    expect(block.length, "the drift block was found").toBeLessThan(rigSrc.length);
    for (const guard of ["!free", "!tween", "!crane", "keys.size === 0", "!dragging.current"]) {
      expect(block, `drift yields to ${guard}`).toContain(guard);
    }
  });

  it("waits four seconds of stillness before it moves", () => {
    expect(rigSrc).toMatch(/idleThreshold = 4/);
    expect(rigSrc).toMatch(/now - manualAt > idleThreshold \* 1000/);
  });

  it("respects prefers-reduced-motion through a cached query, not per frame", () => {
    expect(rigSrc).toMatch(/reducedMotionRef\.current/);
    // the media query itself may appear elsewhere (flights); inside the drift
    // block only the ref may decide
    const block = rigSrc.slice(
      rigSrc.indexOf("// Idle drift"),
      rigSrc.indexOf("// The bracket pair's mark"),
    );
    expect(block, "no matchMedia call per frame").not.toContain("matchMedia");
  });

  it("every pointer gesture stamps cameraManualAt, which restarts the wait", () => {
    // noteCameraManual is the single clock; OrbitControls' own "start" event
    // covers rotate/zoom/pan, so wheel and drag both land there.
    expect(storeSrc).toMatch(/noteCameraManual: \(\)/);
    expect(rigSrc).toMatch(/addEventListener\("start", abortTween\)/);
    // abortTween is the function that stamps — verify it calls the store action
    const abortBody = rigSrc.slice(
      rigSrc.indexOf("const abortTween"),
      rigSrc.indexOf("controls.addEventListener"),
    );
    expect(abortBody).toMatch(/noteCameraManual\(\)/);
  });

  it("recenters the pivot on the city centre while drifting", () => {
    const block = rigSrc.slice(
      rigSrc.indexOf("// Idle drift"),
      rigSrc.indexOf("// The bracket pair's mark"),
    );
    expect(block).toMatch(/controls\.target\.set\(centre\.x/);
    expect(block).toMatch(/controls\.update\(\)/);
  });
});
