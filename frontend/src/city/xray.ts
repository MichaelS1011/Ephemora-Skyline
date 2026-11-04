/**
 * X-RAY / BLUEPRINT lens — which structural layers the one city can show.
 *
 * The lens is deliberately additive: it never asks the payload for a field it
 * does not already carry. Every decision here reads a value the city holds
 * (`fileConnections`, `dirConnections`, `file.inCycle`, `file.coveragePct`,
 * `file.clonePartners`, `file.findings`) plus the scan's own `meta` switches,
 * so a layer with no data behind it stays off instead of drawing an empty
 * claim.
 */

/** Brightness the city's bodies fall back to under the lens. */
export const XRAY_BUILDING_FACTOR = 0.22;

/** The shield reads as a field, not as the old barely-there haze. */
export const XRAY_SHIELD_OPACITY = 0.3;
export const XRAY_SHIELD_TRANSMISSION = 0.35;
export const XRAY_SHIELD_EMISSIVE = 0.2;

/** The cycle ring keeps its existing colour and gets a clearer stroke. */
export const XRAY_CYCLE_RING_OPACITY = 0.95;

/** The coverage threshold the city already uses for a shield. */
export const XRAY_SHIELD_MIN_COVERAGE = 80;

export type XrayLayer = "imports" | "flows" | "cycles" | "findings" | "coverage" | "clones";

/** The fields of one file the lens is allowed to read. */
export interface XrayFileFacts {
  inCycle?: boolean;
  coveragePct?: number;
  clonePartners?: ReadonlyArray<unknown>;
  findings: ReadonlyArray<unknown>;
}

/** The city facts behind the lens — nothing computed, nothing guessed. */
export interface XraySource {
  fileConnections: ReadonlyArray<{ from: string; to: string }>;
  dirConnections: ReadonlyArray<{ from: string; to: string }>;
  files: ReadonlyArray<XrayFileFacts>;
  /** Which optional dimensions the scan actually ran. */
  meta: { cycles: boolean; coverage: boolean; duplicates: boolean };
}

export interface XrayLayerPlan {
  /** Multiplier for building bodies; the overlays keep their own brightness. */
  buildingFactor: number;
  /** Static import arcs (directory and file edges). */
  importArcs: boolean;
  /** Animated file-to-file dependency streams. */
  dependencyFlows: boolean;
  /** Circular-import plinth rings. */
  cycleRings: boolean;
  /** Finding bars and alarm beacons. */
  findings: boolean;
  /** Coverage shields around well-tested buildings. */
  coverageShields: boolean;
  /** Copy-paste clone lasers. */
  cloneLasers: boolean;
  /** Only the layers this payload can honestly support, in reading order. */
  active: readonly XrayLayer[];
}

/**
 * Resolve the lens for one level. Bodies always recede to the same floor; each
 * overlay is on only when its own payload field is present. Directory edges
 * alone are enough for the static arc map (the overview has no file edges), but
 * a dependency FLOW needs a real file edge.
 */
export function xrayLayerPlan(source: XraySource): XrayLayerPlan {
  const files = source.files;
  const importArcs = source.fileConnections.length > 0 || source.dirConnections.length > 0;
  const dependencyFlows = source.fileConnections.length > 0;
  const cycleRings = source.meta.cycles && files.some((f) => !!f.inCycle);
  const findings = files.some((f) => f.findings.length > 0);
  const coverageShields =
    source.meta.coverage && files.some((f) => (f.coveragePct ?? -1) >= XRAY_SHIELD_MIN_COVERAGE);
  const cloneLasers =
    source.meta.duplicates && files.some((f) => (f.clonePartners?.length ?? 0) > 0);

  const active: XrayLayer[] = [];
  if (importArcs) active.push("imports");
  if (dependencyFlows) active.push("flows");
  if (cycleRings) active.push("cycles");
  if (findings) active.push("findings");
  if (coverageShields) active.push("coverage");
  if (cloneLasers) active.push("clones");

  return {
    buildingFactor: XRAY_BUILDING_FACTOR,
    importArcs,
    dependencyFlows,
    cycleRings,
    findings,
    coverageShields,
    cloneLasers,
    active,
  };
}
