// @vitest-environment jsdom
/**
 * The governor's contract with the store: the manual switch outranks the
 * machine for the rest of the visit, the auto flag is runtime-only (never
 * saved), and the App reads the two as one.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const src = (p: string) => readFileSync(resolve(here, "../src", p), "utf-8");

describe("manual switch beats the governor", () => {
  it("touching gfxLite disables the automation and clears the auto flag", () => {
    const store = src("stores/useStore.ts");
    const setPref = store.slice(store.indexOf("setPref: (key, value)"));
    expect(setPref).toMatch(
      /if \(key === "gfxLite"\) set\(\{ prefs, autoGfxLite: false, gfxAutoDisabled: true \}\)/,
    );
  });

  it("the auto flag is a store field, not a pref — it never reaches localStorage", () => {
    const store = src("stores/useStore.ts");
    const prefs = src("prefs.ts");
    expect(store).toMatch(/autoGfxLite: false,/);
    expect(prefs, "gfxLite stays the only graphics pref").not.toMatch(/autoGfx/);
  });

  it("App reads manual OR auto for the quality path, and the governor lives in the Canvas", () => {
    const app = src("App.tsx");
    expect(app).toMatch(/s\.prefs\.gfxLite \|\| s\.autoGfxLite/);
    expect(app).toMatch(/<GfxGovernor \/>/);
    // inside the Canvas — the governor needs useFrame
    expect(app.indexOf("<GfxGovernor />")).toBeGreaterThan(app.indexOf("<CityScene />"));
    expect(app.indexOf("<GfxGovernor />")).toBeLessThan(app.indexOf("</Canvas>"));
  });

  it("the governor yields during construction and after a tab switch", () => {
    const gov = src("components/GfxGovernor.tsx");
    expect(gov).toMatch(/gfxAutoDisabled \|\| store\.buildPhase === "constructing"/);
    expect(gov).toMatch(/delta > TAB_SWITCH_S/);
  });
});
