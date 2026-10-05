import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";

/**
 * Eight `useFrame` loops animated the city while `prefers-reduced-motion` was
 * honoured only by the stylesheet and the camera rig. A signal that has to be
 * remembered per file is a signal that gets forgotten per file, so this guard
 * makes the omission fail a test instead of a user's expectations: every file
 * that runs a frame loop is named here, and the ones this lane owns have to
 * read the shared signal.
 */
const COMPONENTS = path.resolve(import.meta.dirname, "../src/components");

/** Files whose loops this lane guarantees honour the signal. */
const MUST_HONOUR = [
  "Building.tsx",
  "ParticleField.tsx",
  "Pedestrians.tsx",
  "RoadSystem.tsx",
  "CityConnections.tsx",
  "DependencyFlows.tsx",
  "CloneLasers.tsx",
];

/**
 * Every other file with a frame loop, and why it is not in the list above.
 * A closed set: a new animated component fails here until someone decides.
 */
const KNOWN_OTHERS: Record<string, string> = {
  // Own loop, reads the query itself (CameraRig.tsx:521) — the camera is the
  // biggest mover in the scene and it already stops for reduce.
  "CameraRig.tsx": "reads prefers-reduced-motion directly",
  // Build director: it writes progress at 10 Hz and hands the crane shot to
  // CameraRig, which does honour the query. The rise timing itself is the
  // geometry lane's schedule.
  "CityTree.tsx": "schedules the build; all camera motion goes through CameraRig",
  // The honest voxel stack: staggered materialization + the focused-cell pulse.
  // OPEN GAP, one file, filed to the geometry lane — see the W2 look report.
  "VoxelMesh.tsx": "OPEN GAP: reveal stagger and highlight pulse ignore the signal",
  // The district-level reveal tween (District.tsx:65) — scale.y during the
  // build. Same class of motion as the building rise this lane already settles,
  // but the file belongs to the geometry lane.
  "District.tsx": "OPEN GAP: district reveal tween ignores the signal, filed to W1",
};

const framesIn = (name: string): string => {
  const text = readFileSync(path.join(COMPONENTS, name), "utf-8");
  return text;
};

describe("the render loops and reduced motion", () => {
  const withLoop = readdirSync(COMPONENTS)
    .filter((f) => f.endsWith(".tsx"))
    .filter((f) => framesIn(f).includes("useFrame("));

  it("names every file that runs a frame loop", () => {
    const covered = new Set([...MUST_HONOUR, ...Object.keys(KNOWN_OTHERS)]);
    for (const f of withLoop) {
      expect(covered.has(f), `${f} animates and is classified nowhere`).toBe(true);
    }
    for (const f of MUST_HONOUR) {
      expect(withLoop, `${f} no longer has a loop — update the guard`).toContain(f);
    }
  });

  it("reads the shared signal in every loop this lane owns", () => {
    for (const name of MUST_HONOUR) {
      const text = framesIn(name);
      expect(
        text.includes("city/motion"),
        `${name} animates but never asks whether the user wants stillness`,
      ).toBe(true);
      expect(text).toMatch(/prefersReducedMotion\(|reducedSettle\(/);
    }
  });

  it("keeps the camera rig honouring the query on its own terms", () => {
    expect(framesIn("CameraRig.tsx")).toContain("prefers-reduced-motion");
  });

  it("pins the open gaps to exactly the files that were filed", () => {
    const gaps = Object.entries(KNOWN_OTHERS).filter(([, why]) => why.startsWith("OPEN GAP"));
    expect(gaps.map(([f]) => f).sort()).toEqual(["District.tsx", "VoxelMesh.tsx"]);
    // and each filed file really does lack the signal — if the geometry lane adds
    // it, this test fails so the allowlist gets cleaned instead of rotting.
    for (const [name] of gaps) {
      const text = framesIn(name);
      const honours = text.includes("city/motion") || text.includes("prefers-reduced-motion");
      if (honours)
        expect(honours, `${name} now honours the signal: drop its gap entry`).toBe(false);
    }
  });
});
