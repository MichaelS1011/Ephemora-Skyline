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
