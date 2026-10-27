/**
 * The airshow's own decisions — where the aircraft flies, how it leans, what
 * the banner says and how big it lands on the screen.
 *
 * The split is the one `fleetMotion.ts` sets: `BannerPlane` owns the meshes and
 * the frame loop, this module owns the arithmetic and every number in it.
 *
 * The shape is a **racetrack, not a circle**, and that is a readability
 * decision rather than a taste one. A towed banner is a flat cloth whose face
 * is perpendicular to the direction it is pulled: on a circle it shows its
 * front for half a lap and its back for the other half, so a reader standing
 * where the overview camera stands gets a mirrored URL or an edge half the
 * time. On two straights joined by turns outside the readable band, the cloth
 * faces that reader down the whole leg — which is also how real banner aircraft
 * are flown over a beach.
 *
 * What is deliberately not here: a frustum model. The overview the reader lands
 * in is a fitted `worldFraming.fitWorldPoints`, not a closed-form pose, so
 * whether the banner is in shot is answered by the frames and their pixels,
 * never by an approximation of the camera. The
 * component reads the live camera for one thing only — which way the audience
 * is — and that is a direction, not a projection.
 */

/** The voxel rail: a crown stands 1.4× its building (`city/voxels.ts`). */
export const CROWN_RAIL = 1.4;
/** Never less clear air between the tallest crown and the hull. */
export const ALT_MIN_CLEARANCE = 9;
/** And never less than this share of the crown, so a tall level gets a tall sky. */
export const ALT_SKY_SHARE = 0.22;
/** Floor for a world with nothing to clear — the empty streets of the start screen. */
export const ALT_FLOOR = 12;

/** Highest crown any building can reach: 34 (`mapping.heightForComplexity`) × 1.4. */
export const CROWN_MAX = 34 * CROWN_RAIL;
/** The tallest framing the camera rig ever flies through (`CameraRig.CITY_TOP`). */
export const CITY_TOP = 130;

/** Half a straight, in eye distances: long enough to read, short enough to come back. */
export const LEG_HALF_K = 0.9;
export const LEG_HALF_MIN = 40;
export const LEG_HALF_MAX = 420;
/** How far outside the level's own half-extent the straights run. */
export const LEG_OUTSIDE_K = 1.35;
/** Distance between the two straights; the turns live here, not in the readable band. */
export const TRACK_GAP = 30;

/**
 * Cloth size in world units at the reference distance, and how far it hangs
 * behind and below the hull. The ratio is the canvas's own 5:1, so no axis of
 * the type is stretched.
 *
 * Sized from the screen, not from the city: 26 units at the demo overview
 * measures ≈ 420 px of a 1440-px frame. The first cut was 40 and it filled the
 * start screen edge to edge — an invitation that covers the room is not an
 * invitation. `EYE_REF` is what keeps that proportion when the reader zooms.
 */
export const BANNER_W = 26;
export const BANNER_H = 5.2;
/** The eye distance the cloth is sized for: the demo level's fitted overview. */
export const EYE_REF = 91;
export const SCALE_MIN = 0.4;
/** Past the heat grid's own threshold the show is hidden anyway, so the ceiling only has to cover the distances a reader is actually flown at (≤ 288 at the demo level). */
export const SCALE_MAX = 2.4;

/** How big the whole airshow has to be to hold its share of the frame. */
export function airshowScaleFor(eyeDistance: number): number {
  return Math.min(SCALE_MAX, Math.max(SCALE_MIN, eyeDistance / EYE_REF));
}
export const BANNER_DROP = 11;
export const BANNER_BACK = 16;

/**
 * The address on the second line. Not in the dictionary: it is not translated,
 * and a key whose German value is a copy of its English one is exactly what
 * `tests/panelI18n.test.tsx` exists to refuse. It names the person to write to
 * rather than a repository, because the question the banner asks — may I put
 * something here? — is answered by a person, not by a clone.
 */
export const BANNER_ADDRESS = "github.com/MichaelS1011";

/** Speed along the path, the roll a turn asks for, and the rest between passes.
 *  34 was the first number and it was wrong: at the shipped framing the cloth is
 *  273 px wide for a 26-unit banner (10,5 px per unit), so the address swept past
 *  a fixed point of the screen in 0,76 s and crossed the whole 1440-px frame in
 *  4,0 s — nobody reads a towed banner at that speed, and the show stopped being
 *  an invitation and became a flicker. At 13 the banner's own length takes 2,0 s
 *  and one crossing takes 10,5 s. */
export const SPEED = 13;
export const GRAVITY = 60;
export const BANK_MAX = 0.45;
/** Rest between passes, in travelled world units: the show is a fly-past, not a
 *  spinner. Scaled with the slower speed so the gap stays near five seconds. */
export const PASS_REST = 60;

/** The camera's own frame, from `App.tsx`'s `fov: 52` and the shipped aspect. */
export const VERTICAL_HALF_FOV_DEG = 26;
export const ASPECT = 1.6;

export function crownTop(tallest: number): number {
  return tallest * CROWN_RAIL;
}

/**
 * The flight ceiling.
 *
 * Two rules, and they answer different questions. The crown says where a
 * building stops: the aircraft never flies through one. The camera says where
 * the sky is: an object at the reader's eye height plus half a frame is in the
 * upper middle of what they can see, which is where a fly-past belongs. A
 * constant altitude gets one of the two wrong — the first cut flew at the
 * demo's crown height and was clipped off the top of the start screen, whose
 * camera stands ten units up and forty off the ground.
 */
export function altitudeFor(tallest: number, camY = 0, eye = 0, overCity = false): number {
  const aboveCrowns = overCity ? crownTop(tallest) + ALT_MIN_CLEARANCE : 0;
  const inUpperSky = camY + 0.5 * Math.tan((VERTICAL_HALF_FOV_DEG * Math.PI) / 180) * eye;
  return Math.min(CITY_TOP, Math.max(ALT_FLOOR, aboveCrowns, inUpperSky));
}

/** How long a straight is, for a reader standing this far from the level. */
export function legHalfFor(eyeDistance: number, skyline = 0): number {
  // Outside the skyline: a straight that runs past the towers needs no altitude
  // to clear them, and it is the only place the show can fly low enough to sit
  // inside a frame that is aimed down at a city.
  return Math.min(
    LEG_HALF_MAX,
    Math.max(LEG_HALF_MIN, eyeDistance * LEG_HALF_K, skyline * LEG_OUTSIDE_K),
  );
}

/**
 * Which way the audience is, in the horizontal plane: the normal points at the
 * camera and the tangent is the direction the straights run, so a cloth facing
 * along the normal is read across the screen rather than along it.
 */
export function trackAxes(
  camX: number,
  camZ: number,
  centreX: number,
  centreZ: number,
): { nx: number; nz: number; tx: number; tz: number } {
  let nx = camX - centreX;
  let nz = camZ - centreZ;
  const len = Math.hypot(nx, nz);
  if (!(len > 0.001)) return { nx: 0, nz: 1, tx: -1, tz: 0 };
  nx /= len;
  nz /= len;
  return { nx, nz, tx: -nz, tz: nx };
}

export function lapLength(legHalf: number, gap: number = TRACK_GAP): number {
  return 4 * legHalf + 2 * Math.PI * (gap / 2);
}

export interface TrackPoint {
  /** Along the straights. */
  t: number;
  /** Across them, positive toward the audience. */
  n: number;
  /** Velocity in the same axes, so the nose and the tow bar need no extra state. */
  vt: number;
  vn: number;
  /** 1 / radius of the path here: 0 on a straight, so the roll has one source. */
  curvature: number;
}

/** Where a travelled `distance` puts the aircraft on the racetrack. */
export function onTrack(distance: number, legHalf: number, gap: number = TRACK_GAP): TrackPoint {
  const r = gap / 2;
  const straight = 2 * legHalf;
  const arc = Math.PI * r;
  const total = lapLength(legHalf, gap);
  const s = ((distance % total) + total) % total;
  if (s < straight) {
    return { t: -legHalf + s, n: r, vt: 1, vn: 0, curvature: 0 };
  }
  if (s < straight + arc) {
    const phi = (s - straight) / r;
    return {
      t: legHalf + Math.sin(phi) * r,
      n: r * Math.cos(phi),
      vt: Math.cos(phi),
      vn: -Math.sin(phi),
      curvature: 1 / r,
    };
  }
  const back = s - straight - arc;
  if (back < straight) {
    return { t: legHalf - back, n: -r, vt: -1, vn: 0, curvature: 0 };
  }
  const phi = (back - straight) / r;
  return {
    t: -legHalf - Math.sin(phi) * r,
    n: -r * Math.cos(phi),
    vt: -Math.cos(phi),
    vn: Math.sin(phi),
    curvature: 1 / r,
  };
}

/** A coordinated turn: the roll that points the lift where it has to point. */
export function bankFor(speed: number, curvature: number): number {
  if (!(curvature > 0) || !(speed > 0)) return 0;
  return Math.min(BANK_MAX, Math.atan((speed * speed * curvature) / GRAVITY));
}

/** The pose a reader who asked for no motion keeps: mid-leg, facing them, still. */
export const SETTLED_HALF_LAP = 0.25;

export function settledDistance(legHalf: number): number {
  return SETTLED_HALF_LAP * lapLength(legHalf);
}

/** Projected height of the cloth, in screen pixels, at `distance` from the camera. */
export function bannerPixelHeight(viewportH: number, distance: number): number {
  if (!(distance > 0)) return 0;
  return (
    (BANNER_H / (2 * Math.tan((VERTICAL_HALF_FOV_DEG * Math.PI) / 180) * distance)) * viewportH
  );
}
