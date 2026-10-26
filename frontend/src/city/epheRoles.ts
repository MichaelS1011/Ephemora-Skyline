/**
 * Ephe roles (005-B) — what a resident is for when it is not walking.
 *
 * A role is a task, not a costume. The brief's own rule: every new resident
 * state has to carry a recognisable job, and every new visual has to come from
 * a data source. So this module holds the two things that can be decided
 * without a renderer — which figure carries which role, and what it is allowed
 * to say — and the picture of it lives in `Pedestrians.tsx`.
 */

import { COMPLEXITY_WEIGHTS, NORM_REFERENCE, cyclomaticFactor } from "./mapping";
import type { CityFile } from "./types";

export type EpheRole = "explorer" | "security" | "maintenance";

/**
 * The badge glyphs. Shapes before colours, and each one a different shape: the
 * three roles must stay apart for a reader who cannot separate the hues, and
 * the crowd's own rule forbids a new mesh per role.
 */
export const ROLE_GLYPH: Record<EpheRole, string> = {
  explorer: "➤",
  security: "⛨",
  maintenance: "⚒",
};

/**
 * Which of the `count` residents carries the Explorer role.
 *
 * Deterministic and index-based like the rest of the crowd (`makeEphe` picks
 * colours the same way), so the same city shows the same figure as its guide
 * across reloads. The first resident is deliberately not the pick: index 0 is
 * the figure the arrival greeting tends to call, and one body doing both reads
 * as a prop rather than a citizen.
 */
export function explorerIndex(count: number): number | null {
  if (count < 3) return null;
  return 1 + (Math.floor(count / 3) % (count - 2));
}

/**
 * The everyday Security seat, by crowd size alone.
 *
 * Deliberately a different figure from the Explorer: one resident doing two
 * jobs is one resident that is late for one of them. The offset is prime-sized
 * so the two never collide for any crowd the city actually builds.
 */
export function securityIndex(count: number): number | null {
  if (count < 6) return null;
  const i = (explorerIndex(count)! + 1 + Math.floor(count / 5)) % count;
  return i === explorerIndex(count) ? null : i;
}

/**
 * Whether a figure is spoken for, and therefore not available to be taken away
 * by the city's own job picks — the build crew, a taxi, a bus stop, a doorway.
 *
 * Two things make a figure unavailable: it carries one of the three jobs, or
 * the reader has claimed it by name. The second is newer and was earned by a
 * measurement: after a reload, fourteen presses of `C` never reached the
 * resident called Atlas, because it had walked into its own building and the
 * caller only picks bodies it can see. A resident somebody named is not
 * scenery, and it has to be findable again.
 */
export function onDuty(
  e: { isExplorer: boolean; isSecurity: boolean; isMaintenance: boolean },
  claimed: boolean,
): boolean {
  return claimed || e.isExplorer || e.isSecurity || e.isMaintenance;
}

/**
 * Which of the visible candidates answers `C`.
 *
 * The caller hands over what it measured — every figure on screen, unoccluded
 * and walking, with how well it sits in the call band — and this decides. A
 * claimed resident is taken before the nearest stranger: `C` picks the closest
 * body, that choice is deterministic for a camera pose, and without the
 * preference a reader who named a figure could never call it again.
 *
 * `null` means nothing visible qualified; the caller still holds its distance
 * fallback and decides what to do with that.
 */
export function pickCallable(
  candidates: readonly { at: number; score: number; claimed: boolean }[],
): number | null {
  let best: number | null = null;
  let bestScore = Infinity;
  let mine: number | null = null;
  let mineScore = Infinity;
  for (const c of candidates) {
    if (c.claimed) {
      if (c.score < mineScore) {
        mineScore = c.score;
        mine = c.at;
      }
    } else if (c.score < bestScore) {
      bestScore = c.score;
      best = c.at;
    }
  }
  return mine ?? best;
}

/**
 * Which resident carries the Maintenance role.
 *
 * Three jobs need three bodies for the same reason as above, so this picks the
 * first free index walking forward from the Security figure, starting one past
 * the next seat and never landing on index 0 — the figure `explorerIndex`
 * already avoids for the arrival greeting. The search is the guarantee, not the
 * offset: a crowd of six — the floor `crowdFor` builds for a small level — has
 * exactly three free residents left, and a formula that only happened not to
 * collide would have to be re-proved for every crowd size.
 */
export function maintenanceIndex(count: number): number | null {
  if (count < 6) return null;
  const explorer = explorerIndex(count);
  const security = securityIndex(count);
  if (explorer === null || security === null) return null;
  for (let step = 2; step <= count; step++) {
    // Annotated on purpose: without it the compiler resolves `i` through the
    // two narrowed seat constants and reports a circular inference (TS7022).
    const i: number = (security + step) % count;
    if (i !== 0 && i !== explorer && i !== security) return i;
  }
  return null;
}

/**
 * Which job a figure carries, read off the flags it was built with. The card
 * asks this instead of recomputing `explorerIndex(walkers.length)`: the crowd
 * belongs to the renderer, and a second copy of the arithmetic in the UI is a
 * second thing to drift.
 */
export function epheRoleOf(e: {
  isExplorer: boolean;
  isSecurity: boolean;
  isMaintenance: boolean;
}): EpheRole | null {
  if (e.isExplorer) return "explorer";
  if (e.isSecurity) return "security";
  if (e.isMaintenance) return "maintenance";
  return null;
}

/**
 * What a guide is allowed to claim about two files.
 *
 * The city's edges are directed: `from` imports `to`. A sentence about a change
 * is only ever true one way, so the caller hands over the pair and gets back
 * the direction the graph actually holds — or nothing. Returning `null` is the
 * point: no edge, no sentence, no guide.
 */
export interface GuideClaim {
  /** The file doing the importing — the one that has to be re-read. */
  importerPath: string;
  /** The file being imported — the one the reader selected. */
  importedPath: string;
  /** Named imports behind the edge, as the payload states them. */
  weight: number;
}

/**
 * Resolve the claim behind a guide request: reader selected `selectedPath`,
 * asks to be led to `targetPath`. Only an edge between those two files answers,
 * and only in the direction the edge says.
 */
export function guideClaimFor(
  edges: ReadonlyArray<{ from: string; to: string; weight: number }>,
  paths: ReadonlyMap<string, string>,
  selectedId: string,
  targetId: string,
): GuideClaim | null {
  if (selectedId === targetId) return null;
  for (const edge of edges) {
    const from = paths.get(edge.from);
    const to = paths.get(edge.to);
    if (!from || !to) continue; // an edge to a file the city does not name says nothing
    if (edge.from === targetId && edge.to === selectedId) {
      return { importerPath: from, importedPath: to, weight: edge.weight };
    }
    if (edge.from === selectedId && edge.to === targetId) {
      return { importerPath: from, importedPath: to, weight: edge.weight };
    }
  }
  return null;
}

/**
 * What a finding-bearing file lets the Security resident say.
 *
 * Counted from the findings the payload carries, with the worst one's rule,
 * line and provenance — the same fields the tour panel shows. Nothing here
 * judges whether the finding is real; that is the reader's verdict, and it is
 * already a door in the dossier.
 */
export interface SecurityClaim {
  path: string;
  name: string;
  count: number;
  worst: "P0" | "P1" | "P2";
  ruleId: string;
  line: number;
  /** Which scanner answered, or "no scanner" for a built-in note. */
  provenance: string;
}

/** The claim for a tour stop, or null when the file carries nothing to show. */
export function securityClaimFor(file: {
  path: string;
  name: string;
  findings: readonly {
    severity: "P0" | "P1" | "P2";
    ruleId?: string;
    line: number;
    provenance?: string;
  }[];
}): SecurityClaim | null {
  if (file.findings.length === 0) return null;
  const order = { P0: 0, P1: 1, P2: 2 } as const;
  const worst = file.findings.reduce(
    (a, b) => (order[b.severity] < order[a.severity] ? b : a),
    file.findings[0]!,
  );
  return {
    path: file.path,
    name: file.name,
    count: file.findings.length,
    worst: worst.severity,
    ruleId: worst.ruleId ?? worst.severity,
    line: worst.line,
    provenance: worst.provenance ?? "built-in",
  };
}

/**
 * What the Maintenance resident is allowed to say about a building.
 *
 * Exactly one metric (005-B12): `cyclomaticComplexity`, the number the dossier
 * already prints as `cx`. Everything here is derived from that number and from
 * the mapping that turns it into a shape — no second metric, no verdict about
 * whether the file is worth refactoring. A reader who wants that reads the
 * findings; this one answers "what is this number, and what does it do to what
 * I am looking at".
 */
export interface MaintenanceClaim {
  path: string;
  name: string;
  /** The metric as the payload ships it, and as the dossier prints it. */
  cyclomatic: number;
  /**
   * Decision points behind it. Not a second measurement: the analyzer defines
   * the metric as `1 + one per decision point` (`backend/src/services/analyzer/
   * metrics.ts`), so subtracting the 1 restates its own rule.
   */
  decisions: number;
  /**
   * This metric's current share, in percent, of the 0..1 complexity value the
   * height is built from — `COMPLEXITY_WEIGHTS.cyclomatic` times the same
   * `cyclomaticFactor` the renderer uses. Share of the *value*, not of the
   * height: the height rail bends that value with an exponent.
   */
  heightSharePercent: number;
  /** Where the metric reaches its full share (`NORM_REFERENCE.cyclomatic`). */
  saturatesAt: number;
  saturated: boolean;
}

/**
 * The claim for a file, or null when the metric has nothing to say.
 *
 * Two refusals, both about what the number IS:
 * - a data file carries `cx` 1 by construction (the analyzer gives a lockfile,
 *   a schema or a SQL migration no behaviour), so a sentence about decision
 *   points would describe a constant, not the file;
 * - `cx` 1 in any other file means zero decision points — true, but nothing a
 *   resident should cross a level to point at.
 */
export function maintenanceClaimFor(file: CityFile): MaintenanceClaim | null {
  if (file.role === "data" || file.cyclomaticComplexity < 2) return null;
  const share = COMPLEXITY_WEIGHTS.cyclomatic * cyclomaticFactor(file);
  return {
    path: file.path,
    name: file.name,
    cyclomatic: file.cyclomaticComplexity,
    decisions: file.cyclomaticComplexity - 1,
    heightSharePercent: Math.round(share * 100),
    saturatesAt: NORM_REFERENCE.cyclomatic,
    saturated: file.cyclomaticComplexity >= NORM_REFERENCE.cyclomatic,
  };
}

/**
 * The errand, and which role is on it. A union on purpose: the import claim and
 * the finding claim answer different questions, and a single shape with two
 * optional halves is how one of them ends up rendered for the other.
 */
export type GuideRequest =
  | { role: "explorer"; targetFileId: string; x: number; z: number; claim: GuideClaim }
  | { role: "security"; targetFileId: string; x: number; z: number; claim: SecurityClaim }
  | { role: "maintenance"; targetFileId: string; x: number; z: number; claim: MaintenanceClaim };

/** The clearance a guide is aimed past the façade — the sidewalk's own gap. */
export const FRONTAGE_GAP = 0.8;

/**
 * MASTER-2027 §07.11 — the frontage a guide is sent to: the side the reader is
 * looking at.
 *
 * This used to be one hard-coded side: `{ x, z: z + d/2 + 0.8 }`. The comment
 * beside it told the truth about the failure it replaced — a guide that walks
 * into the tower it is explaining ends up hidden behind it — but it only moved
 * the point outside the footprint, not onto a side that faces the lens.
 * Measured with the errand running: the arrival sat at canvas (319, 401), the
 * middle of the target's own facade, and across 8 s of frames not one pixel
 * changed in the 34 × 42 window around the figure while 2 900 … 4 300 changed
 * elsewhere in the same picture (`umsehen-messung.json`). The guide arrived,
 * pointed and looked around behind a wall.
 *
 * So the side is the one the camera stands past: `zu` is how far the lens is
 * outside each face, which is the same ranking as "which axis is seen" but
 * takes the plot's own width into account. Ties keep the historical +z frontage
 * (the list order decides a stable sort), so a head-on view never flips the aim
 * between two clicks.
 *
 * Not solved here, and measured as unsolved: a NEIGHBOURING tower can still
 * stand between the lens and that side. Choosing a side by plan-view line of
 * sight is the wrong instrument for an elevated camera — the ray passes over
 * the neighbour's shoulder, not around it — so the question is left to the
 * camera (§07.11a) rather than answered with a model that would say „blocked"
 * where the picture shows the figure.
 */
export function frontageTowards(
  plot: { x: number; z: number; w: number; d: number },
  cameraX: number,
  cameraZ: number,
  gap: number = FRONTAGE_GAP,
): { x: number; z: number } {
  const seiten = [
    { x: plot.x, z: plot.z + plot.d / 2 + gap, zu: cameraZ - (plot.z + plot.d / 2) },
    { x: plot.x, z: plot.z - plot.d / 2 - gap, zu: plot.z - plot.d / 2 - cameraZ },
    { x: plot.x + plot.w / 2 + gap, z: plot.z, zu: cameraX - (plot.x + plot.w / 2) },
    { x: plot.x - plot.w / 2 - gap, z: plot.z, zu: plot.x - plot.w / 2 - cameraX },
  ].sort((a, b) => b.zu - a.zu);
  return { x: seiten[0]!.x, z: seiten[0]!.z };
}

/**
 * EPHE task #4 — a role is worn where the work is (the village rule).
 *
 * `explorerIndex`, `securityIndex` and `maintenanceIndex` answer "which body,
 * by crowd size alone". That made the Security resident a costume: it stood at
 * whatever seat the arithmetic handed out, and the plot it lived on had nothing
 * to do with the findings it is supposed to carry. The villager rule is the
 * other way round — a resident takes the profession of the work-block it
 * claims — so the security figure is derived from where the crowd is actually
 * seated by `city/epheDuty`, on the plot with the most work still undecided.
 *
 * The honest half: a role with no work is not worn. In a city where every
 * finding carries a verdict there is nothing to secure, and a badge on a
 * resident would then be decoration claiming a fact the queue does not hold.
 *
 * The bearers come back together because they have to be separate bodies: one
 * resident doing two jobs is one resident that is late for one of them.
 */
export interface RoleWork {
  /** Open findings on the plot; 0 means nothing to secure there. */
  open: number;
}

/**
 * Which seated figure stands on the heaviest open plot.
 *
 * Figure 0 is the resident the arrival greeting tends to call, so it takes the
 * badge only when nobody else stands on that plot — a greeter that is also the
 * security figure reads as one prop doing two things. Ties are settled by the
 * heaviest load itself, and the lowest figure index above the greeter wins, so
 * the same scan shows the same resident. `null` when no plot has open work.
 */
export function securityBearerFromWork(
  seats: readonly number[],
  plots: readonly RoleWork[],
): number | null {
  let heaviest = 0;
  for (const plot of plots) if (plot && plot.open > heaviest) heaviest = plot.open;
  if (heaviest === 0) return null;
  for (let i = 1; i < seats.length; i++) {
    if (plots[seats[i]!]?.open === heaviest) return i;
  }
  return plots[seats[0]!]?.open === heaviest ? 0 : null;
}

export interface RoleBearers {
  explorer: number | null;
  security: number | null;
  maintenance: number | null;
}

/**
 * The job bearers for one crowd, distinct by construction.
 *
 * Explorer and Maintenance keep the everyday arithmetic — their work is a walk
 * the renderer schedules, not a plot the queue points at. Security comes from
 * the work when the work exists, and the other two give way when the work seat
 * lands on them, because a job that walks off with two bodies is a citizen that
 * has been deleted.
 */
export function roleBearers(
  seats: readonly number[],
  plots: readonly RoleWork[],
  count: number,
): RoleBearers {
  let explorer = explorerIndex(count);
  let security = securityBearerFromWork(seats, plots);
  let maintenance = maintenanceIndex(count);
  if (security !== null && security === explorer) explorer = null;
  if (security !== null && security === maintenance) maintenance = null;
  if (maintenance !== null && maintenance === explorer) maintenance = null;
  return { explorer, security, maintenance };
}
