/**
 * The pilot's flight law — the arithmetic and every number in it, no meshes.
 *
 * Split of responsibility, same rule `airshowMotion.ts` states for the show:
 * `components/BannerPlane.tsx` owns the aircraft's meshes and its frame loop,
 * `components/CameraRig.tsx` owns the camera, and this module owns *what a
 * player's input does* to the aircraft. Nothing here touches React, three.js or
 * the store: the state is a plain object the rig mutates in place, so a frame
 * allocates nothing.
 *
 * The mode's promise is "gentle": there is no crash, no damage and no fail
 * state. A tower pushes instead of stopping, the ground holds at the height of
 * the towed cloth, and the wall is the distance at which the level would stop
 * being drawn as buildings. All three are numbers here, chosen by measurement,
 * and three of them are derived from numbers that already exist rather than
 * restated (see `PILOT_FLOOR_AGL`, `PILOT_CEIL`, `PILOT_SPEED_START`).
 */
import { BANNER_DROP, BANNER_H, BANK_MAX, CITY_TOP, SPEED } from "./airshowMotion";

/** One scale for the whole aircraft while a person flies it: the show's scale
 *  is derived from the camera's distance (`airshowScaleFor`), and with the
 *  camera sitting on the aircraft that feedback loop would make it breathe. */
export const PILOT_SCALE = 1;

/**
 * The lowest the hull may fly. Not the street: the towed cloth hangs
 * `BANNER_DROP` below the hull and is `BANNER_H` tall, so anything under this
 * drags a 26 × 5,2 plate through the asphalt. One unit of air on top of the
 * cloth's lower edge, derived from the two constants that place it.
 */
export const PILOT_FLOOR_AGL = BANNER_DROP + BANNER_H / 2 + 1;

/** The ceiling is the tallest framing the world flies through — one number,
 *  imported, not a second 130. */
export const PILOT_CEIL = CITY_TOP;

/** Airspeed band in world units per second. The show flies at `SPEED` (13);
 *  a person starts there and may ask for more or less. */
export const PILOT_SPEED_MIN = 6;
export const PILOT_SPEED_MAX = 30;
export const PILOT_SPEED_START = SPEED;

/** How fast the throttle moves the airspeed, in units per second per second. */
export const PILOT_THROTTLE_RATE = 12;

/** Full stick rates, per second. Yaw is deliberately slower than a first-person
 *  shooter's turn: 0,9 rad/s is a wide, readable bank around a district. */
export const PILOT_YAW_RATE = 0.9;
export const PILOT_CLIMB_RATE = 11;
/** How quickly the wings follow the stick (bank), per second. */
export const PILOT_ROLL_RATE = 2.4;

/** Half the wingspan (4,6) plus a margin, as one clearance figure. */
export const PILOT_HULL_CLEAR = 2.6;

/** How far ahead of a tower the air starts pushing, in world units. Inside it
 *  the push grows linearly, so a reader feels the tower before touching it. */
export const PUSH_SOFT = 7;

/** The chase camera: far enough back to keep the towed cloth in frame (the
 *  cloth trails `BANNER_BACK` = 16 and is 26 wide), high enough to read the
 *  city behind it. These two were framed on the demo level, not guessed. */
export const CHASE_BACK = 44;
export const CHASE_UP = 16;
/** Where the chase camera looks: slightly ahead of and below the hull, so the
 *  aircraft sits in the lower third and the city fills the upper frame. */
export const CHASE_LOOK_AHEAD = 8;
export const CHASE_LOOK_DROP = 5;

/** The pilot's eye inside the hull, in the aircraft's own frame (metres above
 *  the hull's origin and ahead of it). The canopy box's roof is at 0,725, so
 *  this sits just above it and looks over the nose. */
export const PILOT_SEAT_Y = 0.86;
export const PILOT_SEAT_Z = 0.05;

export interface PilotState {
  /** Level coordinates, the same ones the layout and the towers use. */
  x: number;
  z: number;
  /** Height above the local ground, not above zero. */
  agl: number;
  /** Heading in radians, atan2(x, z) convention like the show's yaw. */
  heading: number;
  /** Bank in radians, positive rolling right. */
  bank: number;
  speed: number;
}

export interface PilotInput {
  /** -1 … 1 each; 0 means the key is not held. */
  throttle: number;
  yaw: number;
  pitch: number;
  roll: number;
}

export interface PilotLimits {
  /** Radius the aircraft may not leave, in level coordinates. */
  wall: number;
  centreX: number;
  centreZ: number;
}

export const PILOT_INPUT_IDLE: PilotInput = Object.freeze({
  throttle: 0,
  yaw: 0,
  pitch: 0,
  roll: 0,
});

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** A fresh state where the show's aircraft currently is, so entering the mode
 *  is a handover and not a teleport. */
export function pilotStateAt(over: Partial<PilotState> = {}): PilotState {
  return {
    x: 0,
    z: 0,
    agl: 40,
    heading: 0,
    bank: 0,
    speed: PILOT_SPEED_START,
    ...over,
  };
}

/**
 * One step of the flight law. Mutates `state` in place and returns it.
 *
 * Gentle by construction: nothing in here can end the flight. The stick moves
 * the nose, the throttle moves the airspeed, the bank follows the stick — and
 * the three hard numbers (floor, ceiling, wall) clamp instead of punishing.
 * Whether the towers push is a separate call (`pushOutOfTowers`) because it
 * needs the level's boxes and this function needs none.
 */
export function stepPilot(
  state: PilotState,
  input: PilotInput,
  dt: number,
  limits: PilotLimits,
): PilotState {
  const step = Math.min(Math.max(dt, 0), 0.1);

  state.speed = clamp(
    state.speed + input.throttle * PILOT_THROTTLE_RATE * step,
    PILOT_SPEED_MIN,
    PILOT_SPEED_MAX,
  );
  state.heading += input.yaw * PILOT_YAW_RATE * step * (state.speed / PILOT_SPEED_START);
  state.agl = clamp(state.agl + input.pitch * PILOT_CLIMB_RATE * step, PILOT_FLOOR_AGL, PILOT_CEIL);

  // The wings lean into a turn without being asked: a banked aircraft turns,
  // and asking the reader for two axes to do one thing is not a game.
  const wantBank = clamp(input.roll * BANK_MAX + input.yaw * BANK_MAX * 0.55, -BANK_MAX, BANK_MAX);
  const follow = Math.min(1, PILOT_ROLL_RATE * step);
  state.bank += (wantBank - state.bank) * follow;

  state.x += Math.cos(state.heading) * state.speed * step;
  state.z += Math.sin(state.heading) * state.speed * step;

  // The wall is a soft edge: from `PILOT_WALL_SOFT` inside it the aircraft is
  // pressed back toward the level, and at the wall it stops moving outward.
  const dx = state.x - limits.centreX;
  const dz = state.z - limits.centreZ;
  const dist = Math.hypot(dx, dz);
  if (dist > limits.wall - PILOT_WALL_SOFT) {
    const over = dist - (limits.wall - PILOT_WALL_SOFT);
    const push = Math.min(1, over / PILOT_WALL_SOFT);
    const toward = Math.max(
      0,
      -(dx * Math.cos(state.heading) + dz * Math.sin(state.heading)) / dist,
    );
    state.x -= (dx / dist) * push * state.speed * step * (0.4 + toward);
    state.z -= (dz / dist) * push * state.speed * step * (0.4 + toward);
  }
  if (dist > limits.wall) {
    const nx = limits.centreX + (dx / dist) * limits.wall;
    const nz = limits.centreZ + (dz / dist) * limits.wall;
    state.x = nx;
    state.z = nz;
  }
  return state;
}

/** How far inside the wall the push starts, in world units. */
export const PILOT_WALL_SOFT = 18;

/** One tower, in the shape `worldFraming.dataPlots()` already returns. */
export interface PilotTower {
  readonly x: number;
  readonly z: number;
  readonly w: number;
  readonly d: number;
  readonly top: number;
}

let touched = false;

/**
 * The towers push, they never stop. Two bands:
 *
 * - **soft**, up to `PUSH_SOFT` outside the grown footprint and below the
 *   roof: the state is nudged away with a growing factor, so the reader feels
 *   air moving around the building and can turn;
 * - **hard**, inside the footprint: the aircraft is squeezed out through the
 *   nearer face and loses a little airspeed to the contact. Nothing else
 *   happens — the heading is untouched, so the next step continues the turn
 *   the reader was already flying, and the outward step is what makes it slide
 *   along the facade instead of sticking to it.
 *
 * Returns whether any tower interfered this step. Allocation-free by
 * construction: the caller passes the level's boxes, this writes into `state`.
 */
export function pushOutOfTowers(state: PilotState, towers: readonly PilotTower[]): boolean {
  touched = false;
  for (const t of towers) {
    const halfW = t.w / 2 + PILOT_HULL_CLEAR;
    const halfD = t.d / 2 + PILOT_HULL_CLEAR;
    const dx = state.x - t.x;
    const dz = state.z - t.z;
    // Below the roof (+ one hull) the body is solid; above it the air is clear.
    if (state.agl > t.top + PILOT_HULL_CLEAR) continue;
    const px = Math.abs(dx) - halfW;
    const pz = Math.abs(dz) - halfD;
    if (px > PUSH_SOFT || pz > PUSH_SOFT) continue;

    if (px <= 0 && pz <= 0) {
      // Hard: leave through the nearer face, keep the heading, pay some airspeed.
      touched = true;
      if (px > pz) state.x = t.x + (dx >= 0 ? 1 : -1) * (halfW + 0.01);
      else state.z = t.z + (dz >= 0 ? 1 : -1) * (halfD + 0.01);
      state.speed = Math.max(PILOT_SPEED_MIN, state.speed * PILOT_CONTACT_DRAG);
      continue;
    }

    // Soft: nudge away along the axis with the smaller penetration, falling off.
    touched = true;
    const strength = 1 - Math.max(px, pz) / PUSH_SOFT;
    const nudge = strength * state.speed * PILOT_PUSH_GAIN;
    if (px > pz) state.x += (dx >= 0 ? 1 : -1) * nudge;
    else state.z += (dz >= 0 ? 1 : -1) * nudge;
  }
  return touched;
}

/** What one contact costs: 8 % of the airspeed, floored at the minimum. */
export const PILOT_CONTACT_DRAG = 0.92;
/** How hard the soft band pushes per second of flight, as a share of airspeed. */
export const PILOT_PUSH_GAIN = 0.06;

/** The wall a pilot may reach: the camera's own collar and the distance at
 *  which the level stops being drawn, whichever is nearer. Callers pass the
 *  two existing numbers; this is the one `min()` that makes the promise. */
export function pilotWall(collar: number, farLodExit: number): number {
  return Math.min(collar, farLodExit);
}

/**
 * The flight flag, as a module channel rather than a store field — the frame
 * loops that need it (`BannerPlane`, `CameraRig`) read it imperatively, and a
 * store write per frame would re-render hundreds of buildings. Same pattern as
 * `interaction/keyboardMark.ts`.
 */
let flying = false;
export const isFlying = (): boolean => flying;
export const setFlying = (next: boolean): void => {
  flying = next;
};
