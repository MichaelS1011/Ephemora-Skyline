/**
 * One address for a finding — the camera flight and the screen-edge waypoint
 * read the SAME arithmetic.
 *
 * Until this file existed, only `flyToVoxel` knew where a finding's voxel
 * lives in the world. A reader standing in the city could not see WHERE the
 * next open finding was without opening the dock and stepping the queue.
 * The edge signal in `HudOverlay` needed the same target; copying the formula
 * there would have made the sign and the flight able to disagree. So the
 * transform — placement + section base + cell (the renderer's transform, plus
 * the 0.3 body lift Building applies to its voxel group) — lives here once.
 *
 * The off-screen test is deliberately an XZ view-cone test, not a full
 * projection: the HTML layer above the city has `cameraInfo` (x, z, angle,
 * mode), not the live frustum. A target whose bearing falls inside the
 * horizontal cone counts as "in the picture" and shows nothing — the sign can
 * stay silent about a target the vertical frame might still clip, but it can
 * never claim a direction the camera is already facing.
 */
import type { CityData } from "./types";
import { findFileById, getDirLayout } from "./layout";
import { findVoxelForLine } from "./voxels";
import { WORLD_FOV_DEG } from "./worldFraming";

/** A world point a flight can land on and an edge sign can point at. */
export interface WorldTarget {
  x: number;
  y: number;
  z: number;
}

/**
 * The voxel world target for one finding line, or null when the file,
 * placement or line has no materialized cell. Byte-for-byte the arithmetic
 * `flyToVoxel` used to inline (Voxel-focus V3).
 */
export function worldTargetForFinding(
  city: CityData,
  fileId: string,
  line: number,
): WorldTarget | null {
  const hit = findFileById(city, fileId);
  if (!hit) return null;
  const layout = getDirLayout(city, hit.chain);
  const placement = layout.buildings.find((b) => b.file.id === fileId);
  const voxels = placement?.voxels;
  if (!placement || !voxels) return null;
  const found = findVoxelForLine(voxels, line);
  if (!found) return null;
  const section = voxels.sections[found.sectionIndex]!;
  const s = voxels.voxelSize;
  return {
    x: placement.x + section.base.x + found.cell.x * s,
    y: 0.3 + (found.cell.y + 0.5) * s,
    z: placement.z + section.base.z + found.cell.z * s,
  };
}

/**
 * The perspective camera's vertical field of view, degrees. The one number
 * the cone test and the app's camera share — it lives in
 * `worldFraming.WORLD_FOV_DEG` and this is that constant, not a restatement.
 * `tests/waypoint.test.tsx` still pins it against the literal in App.tsx.
 */
export const CAMERA_FOV_DEG = WORLD_FOV_DEG;

/** Which screen edge the signal belongs to. */
export type EdgeSide = "left" | "right" | "behind";

export interface EdgeSignal {
  side: EdgeSide;
  /** Straight-line XZ distance from the camera to the target, in city units. */
  distance: number;
}

/** Wrap a bearing difference into (-π, π]. */
function normalizeBearing(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/**
 * The edge signal for one world target seen from the reported camera, or null
 * when the target sits inside the horizontal view cone — "in the picture".
 *
 * `cam.angle` is mode-dependent, exactly as CameraRig reports it: free flight
 * gives the view heading (atan2(dir.x, dir.z)); orbit gives the direction from
 * the pivot TO the camera, so the viewer faces angle + π.
 *
 * Sign convention (three.js, y-up): a positive bearing difference is a turn
 * from the view heading toward the camera's LEFT, so delta > 0 → "left".
 * |delta| beyond 135° is "behind" — the reader must turn, not sidestep.
 */
export function edgeSignalForWaypoint(
  target: WorldTarget,
  cam: { x: number; z: number; angle: number },
  mode: "free" | "orbit",
  viewportAspect: number,
): EdgeSignal | null {
  const dx = target.x - cam.x;
  const dz = target.z - cam.z;
  const distance = Math.hypot(dx, dz);
  if (distance < 1e-6) return null;
  const heading = mode === "orbit" ? cam.angle + Math.PI : cam.angle;
  const delta = normalizeBearing(Math.atan2(dx, dz) - heading);
  const aspect = Math.max(0.5, Math.min(4, viewportAspect));
  const halfCone = Math.atan(Math.tan((CAMERA_FOV_DEG * Math.PI) / 360) * aspect);
  if (Math.abs(delta) <= halfCone) return null;
  const side: EdgeSide =
    Math.abs(delta) > (3 * Math.PI) / 4 ? "behind" : delta > 0 ? "left" : "right";
  return { side, distance };
}
