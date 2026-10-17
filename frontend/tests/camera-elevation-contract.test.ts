// @vitest-environment jsdom
/**
 * The camera-elevation contract: every scripted flight states its own angle.
 *
 * approachFromCurrentDirection inherits the live viewing angle when a request
 * carries no `elevation` — which is exactly how the security tour drifted to a
 * near-vertical eye line (the finding this guard pins). User-driven gestures
 * keep the inheritance on purpose; SCRIPTED flights must not. The rule reads
 * the store's own producers, so renaming or adding a fly path without an
 * elevation goes red here.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const storeSrc = readFileSync(resolve(here, "../src/stores/useStore.ts"), "utf-8");
const sceneSrc = readFileSync(resolve(here, "../src/components/CityScene.tsx"), "utf-8");
const rigSrc = readFileSync(resolve(here, "../src/components/CameraRig.tsx"), "utf-8");

describe("every scripted flight states its elevation", () => {
  it("the FlyRequest type documents the drift it prevents", () => {
    expect(storeSrc).toMatch(/building\/tour[\s\S]{0,40}must pass an explicit value/);
  });

  it("all four building/overview producers in the store carry elevation", () => {
    // flyToDirOverview + navigateToFile + focusBuilding each build one literal
    const literals = storeSrc.match(/flyRequest: \{[\s\S]*?\},\n/g) ?? [];
    const withElevation = literals.filter((l) => /elevation/.test(l));
    // the fifth match is the interface default (`flyRequest: null`) and the
    // reset helper — both spread or omit; only the three shot literals matter
    expect(withElevation.length, `${literals.length} literals found`).toBeGreaterThanOrEqual(3);
  });

  it("CityScene's reveal flight passes the overviewShot elevation", () => {
    expect(sceneSrc).toMatch(/requestFly\(\{[\s\S]*?elevation:[\s\S]*?\}\)/);
  });

  it("the crane flies at a fixed, moderate elevation", () => {
    const m = rigSrc.match(/CRANE_ELEVATION = ([0-9.]+|Math\.PI \/ \d+)/);
    expect(m, "CRANE_ELEVATION is defined").not.toBeNull();
    const value = m![1]!.startsWith("Math")
      ? Math.PI / Number(m![1]!.split("/")[1]!.trim())
      : Number(m![1]);
    // between a street walk (0.05) and a drone survey (0.6) — the user reads
    // the city from across the street, not from a helicopter
    expect(value).toBeGreaterThan(0.1);
    expect(value).toBeLessThan(0.6);
  });

  it("the tour hops through navigateToFile, which sets an elevation", () => {
    // FindingsPanel click → navigateToFile → flyRequest with elevation. If the
    // panel ever calls requestFly directly again, this breaks first.
    const panelSrc = readFileSync(resolve(here, "../src/components/FindingsPanel.tsx"), "utf-8");
    expect(panelSrc).toMatch(/navigateToFile\(/);
    expect(panelSrc, "the panel must not hand-roll its own flight").not.toMatch(/flyRequest:/);
  });
});
