/**
 * The one set of numbers the shipped world is framed by.
 *
 * These constants live apart from `worldFraming.ts` for one hard reason:
 * that module computes fits with three.js, and `layout.ts` needs
 * `WORLD_PIVOT_Y` on the start screen's critical path — a static import of
 * the framing module there would drag ~1 MB of 3D into the entry chunk
 * before a single canvas exists. `worldFraming.ts` re-exports everything
 * here, so every other consumer keeps importing from one familiar place;
 * the pure readers (`layout.ts`) import from this file directly.
 */

export const WORLD_OVERVIEW_ELEVATION = 0.68;
/** Height of the turntable axis and the eye line a level flight aims at over
 * bare ground — ONE measure, read by `CameraRig.PIVOT_Y` and by the `targetY`
 * floors of `layout.overviewShot` / `layout.craneShot`. */
export const WORLD_PIVOT_Y = 1.5;
/** The heading a level is drawn from — south-east, the overview flight's own.
 * The ONE azimuth for the shipped view: `cameraPresets.STANDARD_AZIMUTH` is
 * this constant, not a restatement, and no default below re-types it. */
export const WORLD_AZIMUTH = Math.atan2(0.75, 0.4);
/** The camera the app mounts with (`WorldCanvas.tsx`) — every fit assumes it.
 * The ONE fov of the world: `waypoint.CAMERA_FOV_DEG` and
 * `cameraPresets.PRESET_FOV_DEG` are this constant, not restatements. Two
 * digits stay written down — the Canvas `fov: 52` in `WorldCanvas.tsx` and
 * the `CHIP_FOV_DEG = 52` in `CityTree.tsx` — because the waypoint and
 * typeFloor guards read the shipped source text; each of those files carries
 * a compile-time tie to this line, so the number cannot move silently. */
export const WORLD_FOV_DEG = 52;
export const WORLD_OVERVIEW_PADDING = { top: 0.6, bottom: 0.76, horizontal: 0.88 } as const;
