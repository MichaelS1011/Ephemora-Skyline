/**
 * The car's drive law — the arithmetic and every number in it, no meshes.
 *
 * Same split the flight law states for the aircraft: `driveMotion.ts` owns what
 * a reader's input does to the car, `components/DriveCar.tsx` owns the body, and
 * `components/CameraRig.tsx` owns the camera. Nothing here touches React, three
 * or the store: the state is a plain object the rig mutates in place, so a frame
 * allocates nothing.
 *
 * What it deliberately does NOT share with the aircraft: a car cannot turn on
 * the spot, cannot climb, and hits the ground. Those three are the reason this is
 * a second law rather than a mode of `pilotMotion` — a car whose nose spins while
 * it stands still would be a car the reader does not believe.
 *
 * The mode's promise matches the aircraft's: no crash, no damage, no fail state.
 * A building pushes and costs airspeed; the wall is where the level stops being
 * drawn. Both are numbers here, derived from numbers that already ship.
 */
/** How fast the car may go forward, in world units per second. */
export const DRIVE_SPEED_MAX = 9;
/** Reverse is a parking gear, not a second forward gear. */
export const DRIVE_SPEED_REVERSE = 3;
/** How hard the pedal pulls, per second. */
export const DRIVE_ACCEL = 6;
/** How hard the brake bites — the one number a reader feels immediately. */
export const DRIVE_BRAKE = 14;
/** Rolling resistance when nobody touches the pedals, per second. */
export const DRIVE_DRAG = 1.8;
/** Distance between the axles: the wheelbase every turn is computed from. */
export const DRIVE_WHEELBASE = 1.9;
/** Full lock of the front wheels, in radians. */
export const DRIVE_STEER_MAX = 0.55;
/** How fast the wheel follows the key, per second — a car steers progressively. */
export const DRIVE_STEER_RATE = 4.5;
/**
 * How much of the lock is left at top speed. A full 0,55 rad lock at 9 units/s
 * would sweep a 3,1-unit circle at 2,9 rad/s — a fairground ride. At the top of
 * the band 38 % of the lock remains, which is 1,05 rad/s: still tighter than the
 * aircraft's 0,70, because a car at city speed does out-turn a tow plane.
 */
export const DRIVE_LOCK_AT_SPEED = 0.38;

/**
 * Where the chase camera stands, in the car's own frame: low and close, because
 * the point of this seat is the street rather than the city. The aircraft's
 * chase distance (12 back, 9 up) frames a district; at street level it frames a
 * roof. 5,5 back and 2,6 up keeps the car's own roof in the lower third and the
 * next junction in the middle.
 */
export const DRIVE_CAM_BACK = 8;
export const DRIVE_CAM_UP = 3.6;
export const DRIVE_CAM_LOOK_AHEAD = 13;
export const DRIVE_CAM_LOOK_UP = 1.1;

/** Half the car's width plus a margin, as one clearance figure. */
export const DRIVE_HULL_CLEAR = 1.1;
/** How far ahead of a wall the push begins, in world units. */
export const DRIVE_PUSH_SOFT = 3.5;

export interface DriveState {
  /** Level coordinates, the same ones the layout and the towers use. */
  x: number;
  z: number;
  /** Heading in radians, the same yaw convention the aircraft uses. */
  heading: number;
  /** Forward speed in world units per second; negative is reverse. */
  speed: number;
  /** The road wheel's own angle, smoothed toward the input. */
  steer: number;
}

export interface DriveInput {
  /** -1 … 1; positive is forward, negative is brake and then reverse. */
  throttle: number;
  /** -1 … 1; positive steers right. */
  steer: number;
}

export interface DriveLimits {
  wall: number;
  centreX: number;
  centreZ: number;
}

export const DRIVE_INPUT_IDLE: DriveInput = Object.freeze({ throttle: 0, steer: 0 });

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** A fresh state at a given spot, facing along `heading`. */
export function driveStateAt(over: Partial<DriveState> = {}): DriveState {
  return { x: 0, z: 0, heading: 0, speed: 0, steer: 0, ...over };
}

/**
 * One step of the drive law. Mutates `state` in place and returns it.
 *
 * The turn is the bicycle model, not a heading rate: `yaw = speed / wheelbase ×
 * tan(steer)`. That single expression is what makes a standing car hold still
 * under a held key, a slow car turn tighter than a fast one, and reverse steer
 * the other way round — three behaviours a reader checks without being told.
 */
export function stepDrive(
  state: DriveState,
  input: DriveInput,
  dt: number,
  limits: DriveLimits,
): DriveState {
  const step = Math.min(Math.max(dt, 0), 0.1);

  // Pedal: forward accelerates, backward brakes and then reverses. Coasting
  // loses speed toward zero from whichever side it is on.
  if (input.throttle > 0) state.speed += DRIVE_ACCEL * input.throttle * step;
  else if (input.throttle < 0)
    state.speed += (state.speed > 0 ? DRIVE_BRAKE : DRIVE_ACCEL) * input.throttle * step;
  else {
    const drop = DRIVE_DRAG * step;
    state.speed = Math.abs(state.speed) <= drop ? 0 : state.speed - Math.sign(state.speed) * drop;
  }
  state.speed = clamp(state.speed, -DRIVE_SPEED_REVERSE, DRIVE_SPEED_MAX);

  // The wheel follows the key progressively, and gives up lock as speed rises.
  const lock =
    DRIVE_STEER_MAX *
    (1 - (1 - DRIVE_LOCK_AT_SPEED) * Math.min(1, Math.abs(state.speed) / DRIVE_SPEED_MAX));
  const wantSteer = clamp(input.steer * lock, -DRIVE_STEER_MAX, DRIVE_STEER_MAX);
  const follow = Math.min(1, DRIVE_STEER_RATE * step);
  state.steer += (wantSteer - state.steer) * follow;

  // Bicycle model. At a standstill `speed` is 0 and the nose does not move,
  // whatever the wheel does — the honest difference from the aircraft.
  state.heading += (state.speed / DRIVE_WHEELBASE) * Math.tan(state.steer) * step;

  state.x += Math.sin(state.heading) * state.speed * step;
  state.z += Math.cos(state.heading) * state.speed * step;

  // The same soft collar the aircraft's wall uses: pressed back inside it, held
  // at it, never through it.
  const dx = state.x - limits.centreX;
  const dz = state.z - limits.centreZ;
  const dist = Math.hypot(dx, dz);
  if (dist > limits.wall) {
    state.x = limits.centreX + (dx / dist) * limits.wall;
    state.z = limits.centreZ + (dz / dist) * limits.wall;
    state.speed *= 0.5;
  }
  return state;
}

/** One tower, in the shape `worldFraming.dataPlots()` already returns. */
export interface DriveTower {
  readonly x: number;
  readonly z: number;
  readonly w: number;
  readonly d: number;
  readonly top: number;
}

let touched = false;

/**
 * Buildings push the car, they never stop it dead. Unlike the aircraft there is
 * no flying over a roof: a car is on the ground, so every footprint is solid. The
 * push leaves through the nearer face and keeps the heading, so sliding along a
 * facade is what a reader gets instead of a wall to fight.
 */
export function pushCarOutOfTowers(state: DriveState, towers: readonly DriveTower[]): boolean {
  touched = false;
  for (const t of towers) {
    const halfW = t.w / 2 + DRIVE_HULL_CLEAR;
    const halfD = t.d / 2 + DRIVE_HULL_CLEAR;
    const dx = state.x - t.x;
    const dz = state.z - t.z;
    const px = Math.abs(dx) - halfW;
    const pz = Math.abs(dz) - halfD;
    if (px > DRIVE_PUSH_SOFT || pz > DRIVE_PUSH_SOFT) continue;

    if (px <= 0 && pz <= 0) {
      touched = true;
      if (px > pz) state.x = t.x + (dx >= 0 ? 1 : -1) * (halfW + 0.01);
      else state.z = t.z + (dz >= 0 ? 1 : -1) * (halfD + 0.01);
      state.speed *= 0.25;
      continue;
    }
    touched = true;
    const strength = 1 - Math.max(px, pz) / DRIVE_PUSH_SOFT;
    const nudge = strength * Math.max(Math.abs(state.speed), 2) * 0.06;
    if (px > pz) state.x += (dx >= 0 ? 1 : -1) * nudge;
    else state.z += (dz >= 0 ? 1 : -1) * nudge;
  }
  return touched;
}

/** The wall a driver may reach: the camera's collar and the far-LOD exit, the
 *  nearer of the two — one `min()`, the same promise the aircraft's wall makes. */
export function driveWall(collar: number, farLodExit: number): number {
  return Math.min(collar, farLodExit);
}

/** Who may take the seat, as one law every door asks (key, dock, header). */
export type DriveRefusal = "noCity" | "building" | "tour" | null;

export function driveRefusal(state: {
  hasCity: boolean;
  building: boolean;
  tour: boolean;
}): DriveRefusal {
  if (!state.hasCity) return "noCity";
  if (state.building) return "building";
  if (state.tour) return "tour";
  return null;
}

/** The one number the header shows while a person drives: whole units per second. */
export function driveReadout(st: DriveState): { spd: number } {
  return { spd: Math.round(Math.abs(st.speed)) };
}

/** The flag the frame loops read imperatively — a store write per frame would
 *  re-render every building (same pattern as `pilotMotion.isFlying`). */
let driving = false;
export const isDriving = (): boolean => driving;
export const setDriving = (next: boolean): void => {
  driving = next;
};

const car = driveStateAt();
let started = false;

export const driveState = (): DriveState => car;

/** Seed the drive where the reader is standing: at the level's edge facing in,
 *  so the first thing they see is the city ahead instead of a wall behind. */
export function startDrive(x: number, z: number, heading: number): DriveState {
  car.x = x;
  car.z = z;
  car.heading = heading;
  car.speed = 0;
  car.steer = 0;
  started = true;
  return car;
}

export const driveStarted = (): boolean => started;
export function stopDrive(): void {
  started = false;
}

/** How far a car leans into a corner: a real body rolls OUTWARD, so the sign is
 *  the opposite of the aircraft's wing-down bank. One function for the same
 *  reason `rollAngle` is one: the body and the camera may not disagree. */
export function carRoll(steer: number, speed: number): number {
  const lean = -Math.sign(steer) * Math.min(1, Math.abs(speed) / DRIVE_SPEED_MAX) * 0.045;
  // A standing car leans by nothing — and "nothing" must be +0, not −0, or two
  // equal states compare unequal under Object.is.
  return lean === 0 ? 0 : lean;
}
