import type { CityFinding } from "./types";

/**
 * What a tower's crown says about the file inside it.
 *
 * Height already tells complexity. Until now the roof repeated that same number
 * (`h < 9 ? "gable" : "flat"`), so from orbit every tower was one grey box with
 * one dark lid — the complaint that the city "all looks the same" was measured,
 * not tasted: the silhouette carried exactly one fact.
 *
 * The crown now carries the other one, the fact a reader most wants to see from
 * a distance: whether anything was found here, and how bad. Four shapes, ranked,
 * because a fifth would not be tellable apart at the zoom level where a district
 * is read as a whole.
 *
 * History-only findings (a secret that existed in a commit and may be gone from
 * the tree) do not change a building's crown: the building is the file as it
 * stands now, and a crown is a claim about it.
 */
export type RoofShape = "flat" | "penthouse" | "terrace" | "mast";

/** Ranked by attention, low to high — the order is the meaning. */
export const ROOF_SHAPES: readonly RoofShape[] = ["flat", "penthouse", "terrace", "mast"];

const livesHere = (f: CityFinding): boolean =>
  !f.historyCommit && f.provenance !== "gitleaks-history";

export function roofFor(findings: readonly CityFinding[]): RoofShape {
  let critical = false;
  let high = false;
  let any = false;
  for (const f of findings) {
    if (!livesHere(f)) continue;
    any = true;
    if (f.severity === "P0") critical = true;
    else if (f.severity === "P1") high = true;
  }
  if (critical) return "mast";
  if (high) return "terrace";
  if (any) return "penthouse";
  return "flat";
}

/** The two bodies a tower can be drawn as, and the height each one ends at. */
export interface CrownGeometry {
  voxelBody: boolean;
  bodyH: number;
  stepped: boolean;
  h: number;
}

/**
 * Where the crown sits, measured from the body that is actually on screen.
 *
 * A legacy tower caps at `bodyH` and grows a thinner tower above it; an opened
 * building draws its voxel stack instead, and that stack runs to `h`. The crown
 * first existed only on the legacy body, so a building lost its crown precisely
 * when the reader zoomed close enough to open it — the fact stayed, the shape
 * that told it disappeared. One function, both bodies, so the two cannot drift.
 */
export function crownBaseY(g: CrownGeometry): number {
  return g.voxelBody ? g.h + 0.12 : g.bodyH + (g.stepped ? 0.3 : 0.55) + 0.12;
}
