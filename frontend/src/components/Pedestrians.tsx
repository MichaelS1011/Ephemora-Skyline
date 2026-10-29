"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { useStore } from "../stores/useStore";
import { t } from "../i18n";
import {
  ROLE_GLYPH,
  epheRoleOf,
  onDuty,
  pickCallable,
  roleBearers,
  type RoleBearers,
  type EpheRole,
  type GuideRequest,
} from "../city/epheRoles";
import { planPolyline, stripeGeometry, type RoutePoint } from "../city/routeLine";
import { approachNode, graphPath, nearestNode, type SidewalkNetwork } from "../city/sidewalks";
import { epheKey, type EpheIdentity } from "../city/epheIdentity";
import { boneGeometry } from "../city/epheBody";
import { ephePresenceIdentity, plotOpenFindings, presenceSeats } from "../city/epheDuty";
import { lookFor } from "../epheLook";
import {
  STOP_BOARD,
  STOP_POST,
  VEHICLE_BOXES,
  VEHICLE_WHEELS,
  deriveTransit,
  distanceToSegment,
  wheelRoll,
  standOnLane,
  type StreetPlate,
  type Transit,
} from "../city/openWorldStreets";
import { prefersReducedMotion, reducedSettle } from "../city/motion";
import { calledGesture, owesWave, WAVE_HOLD_S } from "../city/residentGreeting";
import { useWaveRhythm } from "../hooks/useWaveRhythm";
import {
  ACCEL,
  armSwing,
  footCycle,
  GAIT_RATE,
  PIVOT_STRIDE,
  pivotMarch,
  ramp,
  socialStep,
  strideAmplitude,
  strideBlend,
  STRIDE_RAMP,
  UMSEHEN,
  umsehenBogen,
  WAVE,
  waveHeight,
  waveLateral,
} from "../city/epheGait";
import type { BuildSite } from "../city/layout";
import { ENV, EPHE_PALETTE } from "../city/palette";
import {
  BADGE_EXTRA_HUD,
  BADGE_FALLBACK,
  BADGE_MAX_SHIFT,
  HUD_SURFACES,
  hudBoxes,
  placeBadge,
  type Box,
} from "../city/labelPlacement";
import { surfaceMatrix, surfacePoint } from "../city/worldSurface";
import { useWorldSurface } from "../render/WorldSurface";

/**
 * The role mark's own placement pass — measured, not guessed.
 *
 * x8_badge_geometry.mjs (2026-10-26, real scan at 1600 × 1000): the security
 * badge on a tour step lands at (1240.2, 521.9) while the dossier covers
 * (1178, 130, 400 × 775) — the mark is in the DOM, worn, and invisible;
 * `elementFromPoint` at its centre returns the panel's own text. The rule lives
 * in `placeBadge` (pure, tested); this is only the reading of the live window.
 * Same cadence as the arc plate: HUD rects are re-read at 4 Hz, not per frame,
 * because seven `getBoundingClientRect` calls per frame is a layout read on a
 * scene that is trying to hold 60.
 */
const BADGE_HUD_REFRESH_MS = 250;
const _badgePunkt = new THREE.Vector3();

/**
 * The Ephe's — the citizens of Ephemora Skyline.
 *
 * They live on the EMPTY world already (wandering the ground), and once
 * the city stands they settle into full everyday life, Sims-style:
 * - they WALK THE SIDEWALK GRAPH: along the curbs between the buildings,
 *   crossing the streets only at crosswalks — never through plots
 * - some leave their buildings, some go inside (grow/shrink at the door)
 * - a taxi stops at the curb: someone walks up and gets in, someone steps
 *   out and walks away
 * - a bus stops at the bus stop: waiting Ephe's board, others step out
 * - pairs stop and chat under tiny speech bubbles full of 0s and 1s
 * - bodies come in all shapes: small, tall, broad, slim
 * - while the city is being built, walkers in yellow hats carry a block
 *   (coloured by the language the unit is made of) to the plot that is about
 *   to rise, set it on the roof as the tower comes up, and stroll on
 *
 * Five instanced draws carry the whole crowd, including arms and hands
 * (body, head, face band, eyes, and one eleven-slot limb pass per figure);
 * +2 carry builders' helmets and blocks, +2 are the ground marks every figure
 * gets a slot in (contact patch, and one shared selection ring), +2 carry the
 * street and its traffic. Nothing here draws per figure: a city of 72 residents
 * costs the same crowd draws as a city of 6.
 */

interface StreetLine {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
}

export interface HomeSpot {
  x: number;
  z: number;
  doorX: number;
  doorZ: number;
  /** The file standing on this plot, as the payload names it (EA-01). */
  unitId: string | null;
}

type Mode =
  | "walk"
  | "called"
  | "enter"
  | "inside"
  | "exit"
  | "chat"
  | "waitBus"
  | "boarding"
  | "toTaxi"
  | "inTaxi"
  | "toSite"
  | "guide"
  | "work";

interface Ephe {
  x: number;
  z: number;
  angle: number;
  speed: number;
  // body shape — like people
  fat: number; // 0.8 .. 1.5
  tall: number; // 0.75 .. 1.3
  phase: number;
  /** Integrated from distance travelled, so a turning or waiting resident
   *  does not keep walking in place. */
  gait: number;
  /** Current walking speed, eased toward target: nobody reaches a full
   *  stride in one frame, and nobody sheds it in one frame either. */
  vel: number;
  /** 0 standing … 1 full stride. Eases the legs in at a start and brings
   *  the feet home at an arrival, so neither ends in a pose the figure
   *  would have to teleport out of. */
  blend: number;
  /** Stride amplitude while turning on the spot, ramped so a figure that
   *  stops to pivot does not halve its step in a single frame. 1 otherwise. */
  pivotAmp: number;
  /** True while turning on the spot rather than cutting a corner. */
  pivot: boolean;
  color: THREE.Color;
  // walk target
  tx: number;
  tz: number;
  pause: number;
  /** How far the rest pose has taken hold, 0 = walking stance, 1 = resting. */
  restBlend: number;
  mode: Mode;
  home: number; // home spot index
  anim: number; // grow/shrink 0..1
  chatPartner: number;
  chatUntil: number;
  /** Simulation time until which the resident stands and waves at the reader. */
  greetUntil: number;
  /** 005-B: set once the Explorer has walked its errand and turned to the
   *  target — the arrival the panel waits for before it says anything. */
  guideArrived: boolean;
  /**
   * §07.11 — simulation time at which the arriving guide started its look-around,
   * or null while it is not looking. Read only in the arrived branch, and it
   * clears itself when the sweep is home, so a new errand never inherits an old
   * one's phase.
   */
  umsehenSeit: number | null;
  /**
   * 005-B: this figure carries the Explorer role. The crew and the transit
   * picks skip it on purpose: a resident that can be handed to a bus or a build
   * site is not a guide, and a guide that got called away mid-errand is the
   * shadow the brief warns about — a figure that appears to lead you somewhere
   * and then does something else.
   */
  isExplorer: boolean;
  /** B11 — the same exclusion for the resident that follows the security tour. */
  isSecurity: boolean;
  /** B12 — and for the resident that carries the maintenance errand. */
  isMaintenance: boolean;
  /**
   * EPHE-AI EA-01 — where this figure lives, in terms that survive a re-scan
   * and a level change: the plot it is a citizen of, and its seat there. The
   * array index is not an identity (the crowd is rebuilt per level), so
   * anything that has to remember a figure reads this instead.
   */
  identity: EpheIdentity;
  hidden: boolean; // inside a building / in a vehicle
  ride: "taxi" | "bus" | null;
  // sidewalk graph state
  node: number; // node currently heading for (or standing at)
  prev: number; // node came from — avoids immediate backtracking
  path: number[]; // planned node hops (route to a goal)
  finalX: number | null; // off-graph goal after the path ends (door, curb slot)
  finalZ: number;
  siteIndex: number; // build site currently worked, -1 otherwise
  hustle: number; // builders hurry; everyone else strolls
  /** Facing offset while turning: the visor leads the shoulders into a corner. */
  look: number;
  /** Arm-swing personality; a crowd of identical pendulums reads mechanical. */
  armStyle: number;
  /** Smoothed personal-space side-step, applied to the drawing only. The path
   *  stays on the sidewalk graph, so crosswalks and doors keep their contract. */
  px: number;
  pz: number;
  /** Pace through a crowd: 1 alone, lower behind a slower resident. */
  avoid: number;
}

const WALKER_COLORS = EPHE_PALETTE.jackets;

export type EpheGesture = "idle" | "chat" | "carry" | "lift" | "greet" | "point" | "rest";

/**
 * The body plan of one resident, in units of the 1.35-tall person.
 *
 * It used to be a capsule from 0.10 to 0.82 with a head sitting on top of it:
 * no legs at all, a torso that reached within 0.10 of the ground, and a
 * silhouette that read as one pale blob at every distance the city is actually
 * looked at. The plan below is what a person's outline is made of — crown 1.35,
 * head 1.094…1.35, coat 0.68…1.10, hip 0.70, knee 0.40, ankle 0.10 — so the legs
 * are the lower half of the figure the way they are on a body, and the gait has
 * something to bend. `openCityLifeFraming.test.ts` budgets exactly 1.35 of
 * height for the ≥3 px rule, so the crown is a contract, not a taste choice.
 */
export const FIGURE = {
  crown: 1.35,
  /**
   * Measured against a human body: the leg is the lower half (hip 0.70 of 1.35),
   * the head is a seventh of the height, and the coat runs from the shoulder to
   * the hip without reaching for the floor. The shipped figure had a torso that
   * ended 0.10 above the ground, a head of a quarter of the body, and no leg at
   * all — which is why it read as a ball with boots.
   *
   * What each mass is worth ON SCREEN is a different number in each direction,
   * because the district camera looks down at 0.68 rad: a vertical world unit
   * lands on 0.7776 of a screen unit and a horizontal one on the whole of it.
   * At the small end of the measured band (a 20 px resident) that is 14.82 px
   * per unit up and 19.05 across; at the large end (30 px) 22.22 up and 28.58
   * across. In the 20 px column, from the top: head 4.88 px wide and 3.79 px
   * tall, face 3.35 × 3.07 px, coat 7.05 px wide and 8.0 px tall, sleeve and
   * hand 2.86 px, thigh 2.86 px, the standing gap between the ankles 1.91 px.
   * Nothing here has room for detail below about 0.05 units, which is why the
   * face is one band and not a nose.
   */
  headY: 1.222,
  headR: 0.128,
  bodyY: 0.89,
  bodyHalf: 0.21,
  /** The coat's widest point, which is its hem. See `coat` below. */
  bodyR: 0.185,
  hipY: 0.7,
  kneeY: 0.4,
  ankleY: 0.1,
  /** above the torso centre */
  shoulderY: 0.16,
  hipWidth: 0.062,
  shoulderWidth: 0.19,
  /**
   * The coat's own outline, as (radius, height) pairs in local units, from the
   * hem at −0.21 to the top of the shoulders at +0.21. It is a LATHE, not a
   * capsule, for one measurable reason: a capsule's bottom is a dome, so the
   * coat faded into the legs over its own radius (0.175 units = 2.6 px of the
   * 20 px figure) and the waist line the operator's luminance profile picked
   * up at y = 370-373 was a 3-row gradient, not an edge. This profile ends on a
   * flat hem at a radius 0.048 units wider than the legs under it, which is a
   * 0.91 px ledge at the small end of the band and 1.37 px at the large end,
   * and it narrows to 0.086 at the shoulder line so the head sits on a collar
   * rather than on a pill.
   */
  coat: [
    [0, -0.21],
    [0.185, -0.21],
    [0.181, -0.14],
    [0.172, -0.05],
    [0.161, 0.04],
    [0.15, 0.115],
    [0.126, 0.172],
    [0.086, 0.205],
    [0, 0.21],
  ] as const,
  /**
   * The face band, as half-extents and an offset from the skull's centre. The
   * band's vertical centre sits `faceY` BELOW the head's centre so the hair
   * owns the top 37% of the skull and the skin the lower 63% — the split the
   * reference image measures (hair 0-13%, face 13-35% of the figure's height).
   */
  faceY: -0.0475,
  faceR: 0.088,
  faceUp: 0.0805,
  faceDip: 0.032,
  faceAt: 0.0954,
  /** The hair cap: a dark mass IN FRONT of the top of the face band, so the
   *  hairline is an occlusion edge and not a shading gradient. */
  capY: 0.063,
  capR: 0.145,
  capUp: 0.055,
  capDip: 0.115,
  capAt: 0.02,
  /** The eye marks, which have to clear the face band's own surface. */
  eyeY: -0.03,
  eyeAt: 0.118,
  eyeSide: 0.038,
} as const;

/**
 * The limb pass's slots per figure. Ten of them are the body; the eleventh is
 * the hair cap, which is why it lives here and not in a mesh of its own: one
 * more instanced mesh is one more draw call for the whole crowd, and the
 * crowd's budget is eleven.
 */
export const LIMB_SLOTS = 11;

/**
 * The rest pose's measurement switch: `?ruhe=0` turns the posture off and
 * leaves everything else alone.
 *
 * It exists because the crowd's pauses come from `Math.random()`, so two builds
 * cannot be compared frame for frame — the same figure is walking in one and
 * resting in the other by chance. Only a same-build toggle separates the pose
 * from the crowd's own noise, and that separation is the measurement.
 */
const RUHE_AN = (() => {
  if (typeof window === "undefined") return true;
  try {
    return new URLSearchParams(window.location.search).get("ruhe") !== "0";
  } catch {
    return true;
  }
})();
export const LIMB = {
  bootR: 0,
  bootL: 1,
  sleeveR: 2,
  sleeveL: 3,
  handR: 4,
  handL: 5,
  thighR: 6,
  thighL: 7,
  shinR: 8,
  shinL: 9,
  cap: 10,
} as const;

/**
 * How far above the ground plane the contact patch is drawn.
 *
 * It used to be 0.016, which is under every flat thing a resident can stand on:
 * the kerb boxes are 0.08 tall centred at y=0.04 (top 0.08) and they are drawn
 * ON `CURB_OFFSET` = 2.18 — the exact line the sidewalk graph puts its nodes
 * on — and the zebra tops out at 0.07. So the patch was depth-clipped by the
 * stone under the figure's own feet: for a slim resident (radius 0.285 against
 * a 0.275 half-width band) about 96% of the disc was hidden, and for a broad
 * one (0.4275) still about 62%. 0.09 clears the highest paint in the world by
 * 0.01 units — 0.15 px on screen, and 40 steps of the depth buffer at the
 * district camera's 36-54 unit range, which is enough to stop the fight. The
 * lift itself is 0.09 of the figure's 1.35 units, i.e. 1.33 px at the small end
 * of the size band and 2.0 px at the large end.
 * `ephe-readability.test.ts` checks it against the real plate list.
 */
export const CONTACT_PATCH_Y = 0.09;

/**
 * The called resident's mark, as an annulus in the ground plane.
 *
 * `selection` is gold on a pale plaza: 1.39:1 against the ground and 1.48:1
 * against a plot, which no amount of opacity fixes. The hue is the operator's
 * accent and stays. What was fixable is the band: the ground plane is seen at
 * the overview's 0.68 rad elevation, so the ring's near and far edges are
 * foreshortened by sin(0.68) = 0.629 while its sides keep their whole width —
 * 0.1 units of gold was 2.67 px at the sides and 1.2 px across the top and the
 * bottom of the ellipse at the small end of the band, i.e. half the ring was
 * landing on a single pixel. 0.17 units is 3.24 px and 2.04 px there, and 4.86
 * px and 3.05 px at the large end. The outer radius holds at 0.5: 19.1 px wide
 * and 12.0 px tall at the small end, so the mark stays the size of a person and
 * not of a block.
 */
export const SELECTION_RING = { inner: 0.33, outer: 0.5 } as const;

/**
 * The azimuth a called figure holds when the clock is frozen.
 *
 * Reduced motion stops the crowd by holding `dt` at 0, and every turn in the
 * loop is a ramp over `dt` — including the called figure's turn to the lens. So
 * the one gesture that says "this is the resident you picked" never arrives:
 * the wave stays off because its deadline runs on the same frozen clock, and
 * the body keeps showing its back. What is left is the gold ring, 1.39:1 on the
 * plaza and 1.48:1 on a plot, which is a weak cue at any size and the only cue
 * here.
 *
 * The turn cannot be re-animated — that is motion the reader asked not to have.
 * It can be *finished*: the ramp has a target, `atan2(lens - figure)` on the
 * ground plane, and setting that target once is a change of posture, not of
 * motion. So the call site writes it in the effect the click already runs, once,
 * and the loop keeps writing the same angle every frame without moving it.
 * Repeating the write lands on the same number (it is a fixed point), which is
 * what makes this a snap rather than an animation.
 *
 * With motion allowed the angle comes back untouched: the ramp in the `called`
 * branch owns that turn, and a direct write would teleport a body the reader is
 * watching walk. No clock, no rate and no distance enter this function, so it
 * cannot become a per-frame loop of its own.
 */
export function calledSnapAngle(
  reduced: boolean,
  angle: number,
  at: { x: number; z: number },
  lens: { x: number; z: number },
): number {
  return reduced ? Math.atan2(lens.x - at.x, lens.z - at.z) : angle;
}

export interface EpheLimbPose {
  footX: number;
  footY: number;
  footZ: number;
  handX: number;
  handY: number;
  handZ: number;
  /** How far the knee leads the hip→ankle line, in figure widths forward. The
   *  leg is two segments, so a stride has to bend somewhere. */
  kneeForward: number;
}

/** Local-space gait and task pose. Reuses the caller's scratch object: ten limb
 *  instances add no per-frame allocations or extra crowd draw calls. */
export function writeEpheLimbPose(
  out: EpheLimbPose,
  stride: number,
  side: -1 | 1,
  gesture: EpheGesture,
  gesturePhase = 0,
  gaitPhase?: number,
  strideAmp = 0.13,
  blend = 1,
  restBlend = 0,
): void {
  const step = Math.max(-1, Math.min(1, stride)) * side;
  out.footX = side * 0.12;
  if (gaitPhase !== undefined) {
    // The planted path: stance is linear against the distance the body covers,
    // swing lifts and returns the foot, and both ease with the start/stop blend.
    const cycle = footCycle(gaitPhase, side, strideAmp * blend);
    out.footZ = cycle.z;
    out.footY = 0.078 + cycle.lift * blend;
    out.kneeForward = 0.022 + (cycle.kneeLead - 0.022) * blend;
  } else {
    // The pose-only path (tests and task gestures) keeps its original shape.
    out.footY = 0.078 + Math.max(0, step) * 0.045;
    out.footZ = step * 0.13;
    // A knee never bends backwards: it leads as the leg comes forward and pushes
    // off behind, and stays slightly bent while standing so the leg is not a pole.
    out.kneeForward = 0.022 + Math.max(0, step) * 0.05;
  }
  out.handX = side * 0.28;
  // A hanging arm ends below the hip, not at it: 0.45 put the hands beside the
  // waistband, where they read as two extra lumps on a snowman.
  out.handY = 0.5;
  // The arm answers the legs, not the clock. With a gait phase in hand the
  // swing is the cosine the planted foot is peaked against, so the right hand
  // is back exactly where the right foot is forward; without one (tests, task
  // poses) it follows the scalar stride as it always did.
  out.handZ = gaitPhase === undefined ? -step * 0.13 : armSwing(gaitPhase, side) * 0.13 * blend;
  if (gesture === "carry") {
    out.handX = side * 0.25;
    out.handY = 0.74;
    out.handZ = 0.43;
  } else if (gesture === "lift") {
    out.handX = side * 0.28;
    out.handY = 1.22;
    out.handZ = 0.12;
  } else if (gesture === "chat" && side === 1) {
    out.handY = 0.86 + Math.sin(gesturePhase) * 0.025;
    out.handZ = 0.19;
  } else if (gesture === "greet" && side === 1) {
    // The wave has to clear the skull at EVERY point of its arc. It used to end
    // at 1.12 — inside the head's own column, moving 1.6 px peak-to-peak — and
    // round 1 raised the centre to 1.40, which put the hand's *centre* 0.74 px
    // above the crown line at the small end of the band while the sphere's
    // bottom edge (1.325) was still below it: the hand overlapped the head
    // instead of standing clear of it. `WAVE` lifts the whole arc so the hand's
    // near edge clears the crown by 0.52 px and its centre by 1.33-2.07 px at
    // 20 px, and it doubles the sideways travel to 3.62 px — 126% of the hand's
    // own 2.86 px width, which is the ratio at which a moving blob stops
    // reading as noise and starts reading as intent.
    out.handY = waveHeight(gesturePhase);
    out.handZ = WAVE.forward;
    out.handX = side * (WAVE.centre + waveLateral(gesturePhase));
  } else if (gesture === "point" && side === 1) {
    // 1.02 was 0.03 BELOW the shoulder, so the guide's arm sagged toward the
    // ground it was not pointing at; round 1 raised it to 1.18, which is 1.93 px
    // above the shoulder line at the small end of the band — a level arm, not an
    // upward one. 1.24 is 2.82 px above it against a 0.40-unit reach, so the
    // arm leaves the body's front face by 4.79 px at the worst heading and 7.62
    // px at the best, and it points slightly UP at the tower it names.
    out.handY = 1.24;
    out.handZ = 0.4;
    out.handX = side * 0.16;
  } else if (gesture === "rest") {
    // §07.12 — standing on one leg, the way a person does when they wait.
    // A figure that stops walking currently freezes with its feet together and
    // both arms dead straight down, which is the one posture the city already
    // shows for "called and attending" — so a pause read as attention, and the
    // square's waiting figures were indistinguishable from the guide's.
    //
    // Weight on the -1 leg: that foot stays under the hip and that knee stays
    // near straight. The +1 leg steps out and forward, its knee takes the bend,
    // and the arms answer one another — the hand over the free leg comes
    // forward, the other falls behind. `restBlend` is the caller's ramp, so the
    // pose arrives over a quarter-second instead of snapping: at 15-22 px per
    // unit these offsets are 2-4 px, and a 4 px jump in one frame is the pop
    // this file exists to prevent.
    const r = restBlend;
    if (side === 1) {
      out.footX = 0.12 + 0.16 * r;
      out.footZ = 0.12 * r;
      out.kneeForward = 0.022 + 0.05 * r;
      out.handZ = 0.1 * r;
    } else {
      out.handZ = -0.08 * r;
    }
    out.handX = side * (0.28 + 0.04 * r);
  }
}

/**
 * How many Ephe's this frame actually needs.
 *
 * `count` is the capacity the instanced meshes were allocated for, not a
 * quota to fill. The shipped behaviour was to stand 72 figures on a level
 * whatever stood on it: measured against the 900-file city that is 2.1
 * citizens per rendered file, against the two-file repo **36** — a crowd
 * thirty-six times the size of the thing being inspected, and the reason the
 * overview of a small repo reads as a street scene with a building in it.
 *
 * In a city the crowd follows the buildings it lives in: one figure per plaza
 * file, capped by the capacity. Six is the floor, and it is a functional one —
 * the bus stop needs a queue and the cab needs someone to pick up, and below
 * that the transit choreography stops being legible at all.
 *
 * `openWorld` is the one case where there is no data to be under: the world
 * before the first scan is an establishing shot, and its crowd IS the subject.
 * It is passed in rather than inferred from `plots === 0`, because a scanned
 * level can have an empty plaza too — the two-file repo is exactly that, its
 * files live in one sub-district — and reading that as "no city yet" gave the
 * smallest city in the test set its full 72-figure crowd and a bus line.
 */
export function crowdFor(plots: number, capacity: number, openWorld = false): number {
  if (openWorld) return capacity;
  return Math.max(Math.min(6, capacity), Math.min(capacity, plots));
}

/** A hamlet has no bus line: below this many plots the stop sign and the cab
 *  stay and the bus — the loudest single piece of traffic geometry in a small
 *  city's frame — leaves the street. */
export const BUS_MIN_PLOTS = 12;

/**
 * A 1.35-unit resident at 2.3 units/s took four steps a second: the crowd was
 * running everywhere, including while standing at a bus stop. 1.35 is a walk;
 * the planted foot cycle below is calibrated against the same distance.
 */
const WALK_SPEED = 1.35;

/**
 * The weight shift, exported so `ephe-readability.test.ts` can hold it to the
 * pixel floor instead of to an adjective.
 *
 * `idleAmp` used to be 0.012 — 0.27 px of travel, under a quarter of the pixel
 * it would have to move to be seen, so the standing "weight shift" existed only
 * in the comment. 0.03 is 0.67 px of torso, and with the head carried further
 * (on a body the sway is a lean over the weight-bearing hip, so the skull
 * describes the largest arc and the feet none) 1.04 px of head: a fifth of the
 * 4.9 px skull's own width. `idleRate` went from 0.8 to 0.62 rad/s with it, so
 * the bigger shift is slower and calmer, not busier — 10.1 s per cycle.
 * `headGain` is what makes a 7.8 px column worth moving at all.
 */
export const SWAY = {
  idleAmp: 0.03,
  idleRate: 0.62,
  walkAmp: 0.028,
  headGain: 1.55,
} as const;

const TAXI_SPEED = 6;
const BUS_SPEED = 5.5;
const VEHICLE_ACCEL = 4;
const VEHICLE_BRAKE = 8;
const VEHICLE_TURN = 3.2;
const STOP_ALIGN = 0.22;

const TURN_SPEED = 3.4;
const ARRIVE = 0.55;
/** A kerb hop ends ON the kerb node, not near it: a figure that stops half a
 *  unit short of the node carries that offset into the next hop, and the tape
 *  then reads it as off the network. 0.14 units is under the width of the
 *  figure itself, so the correction never shows in the plate. */
const NODE_ARRIVE = 0.14;
/** Further off the target direction than this (117°) and the figure stops to
 *  turn, like a person at a corner, instead of walking a wide arc. The arc is
 *  what puts a walker off the kerb line: at this speed and turn rate the radius
 *  is ~0.7 units, so a 180° turn-around at a street end swings more than a unit
 *  away from the graph before it comes back. */
const TURN_IN_PLACE = 2.05;
/** Sand helmets distinguish the crew without borrowing an alarm colour. */
const HAT_COLOR = new THREE.Color(EPHE_PALETTE.helmet);
/** One tower's rise — must stay in step with Building.tsx. */
const RISE_MS = 700;
/** A crew member is on a deadline; a stroller is not. */
const BUILDER_HUSTLE = 2.1;
/** How often the crew table is re-checked for work it can still reach. */
const BUILD_DISPATCH_S = 0.15;
/** Sidewalks follow the street grid: the route is a little longer than a
 *  straight line, and a figure handed an impossible plot just walks off. */
const GRID_ROUTE_FACTOR = 1.2;
/** Within this distance a figure steps straight to its goal instead of being
 *  routed through the street network (plot frontage, door approach). */
const DIRECT_STEP_UNITS = 12;
/** The three kerbs a cab works along its own street, as fractions of it. The
 *  middle one is the kerb `deriveTransit` picked, so the cab arrives where the
 *  crowd expects a taxi, and then it keeps driving instead of parking forever. */
const TAXI_STANDS = [0.18, 0.5, 0.82];
/** Kerb offset of a cab stand — the right-hand edge of its lane. */
const TAXI_STAND_OFFSET = 1.7;
/** Speed on the half circle at the end of the lane, so its wheels still turn. */
const TAXI_TURN_SPEED = 3.2;
/** How far the bus has to get from its stop before it may stop again — further
 *  than the 3 units that trigger a dwell, nearer than the length of its street. */
const BUS_LEAVE_STOP = 8;
/** The block has to be in the air before the rise lands — arriving in the
 *  last instants of it places nothing. */
const PLACE_PAD_MS = 150;
/** How far ahead a figure will commit to a plot. Longer than this and it
 *  spends the wait standing at an empty foundation. */
const BUILD_HORIZON_MS = 3500;

function makeEphe(
  i: number,
  bounds: number,
  net: SidewalkNetwork | null,
  homes: HomeSpot[],
  total: number,
  /** Work presence: the plot this seat belongs to, per `epheDuty`. Empty when
   *  the level has no plots, and identical to the old round-robin when no plot
   *  carries open work — the same scan then seats the same crowd. */
  seats: readonly number[],
  /** Wer die drei Arbeiten traegt — aus dem Werk gelesen, nicht aus dem Index. */
  bearers: RoleBearers,
): Ephe {
  const shape = ((i * 61) % 100) / 100;
  const home = homes.length > 0 ? (seats[i % Math.max(1, seats.length)] ?? i % homes.length) : -1;
  const e: Ephe = {
    x: 0,
    z: 0,
    angle: (i * 0.9) % (Math.PI * 2),
    speed: WALK_SPEED * (0.7 + ((i * 37) % 50) / 100),
    fat: 0.82 + shape * 0.68,
    tall: 0.78 + (((i * 29) % 100) / 100) * 0.5,
    phase: (i * 1.7) % (Math.PI * 2),
    gait: (i * 1.7) % (Math.PI * 2),
    vel: 0,
    blend: 0,
    pivotAmp: 1,
    pivot: false,
    color: new THREE.Color(WALKER_COLORS[i % WALKER_COLORS.length]!),
    tx: 0,
    tz: 0,
    pause: 0,
    restBlend: 0,
    mode: "walk",
    home,
    identity: ephePresenceIdentity(
      i,
      homes.map((h) => h.unitId),
      seats,
    ),
    anim: 1,
    chatPartner: -1,
    chatUntil: 0,
    greetUntil: 0,
    guideArrived: false,
    umsehenSeit: null,
    isExplorer: i === bearers.explorer,
    isSecurity: i === bearers.security,
    isMaintenance: i === bearers.maintenance,
    hidden: false,
    ride: null,
    node: 0,
    prev: -1,
    path: [],
    finalX: null,
    finalZ: 0,
    siteIndex: -1,
    hustle: 1,
    look: 0,
    armStyle: 0.85 + (((i * 53) % 100) / 100) * 0.3,
    px: 0,
    pz: 0,
    avoid: 1,
  };
  if (net && net.nodes.length > 0) {
    // Spread the population across the whole sidewalk network. `nodes` is
    // ordered street by street, so the index has to be spread too: taking
    // `i % nodes.length` puts every figure of a small crowd on the first one
    // or two streets (measured: all 46 standing along one kerb of the grid).
    e.node = Math.floor((i * net.nodes.length) / Math.max(1, total)) % net.nodes.length;
    const n = net.nodes[e.node]!;
    e.x = n.x;
    e.z = n.z;
  } else {
    const r = bounds * 0.5 * (((i * 41) % 100) / 100);
    const a = (i / 7) % (Math.PI * 2);
    e.x = Math.cos(a) * r;
    e.z = Math.sin(a) * r;
    e.tx = e.x;
    e.tz = e.z;
  }
  return e;
}

/** Ground wander — only for the empty world without a sidewalk network. */
function pickGroundTarget(e: Ephe, bounds: number): void {
  const r = bounds * (0.15 + Math.random() * 0.85);
  const a = Math.random() * Math.PI * 2;
  e.finalX = Math.cos(a) * r;
  e.finalZ = Math.sin(a) * r;
}

/**
 * The speech ink. Not the brand red: inside the city red belongs to findings
 * and to the selection marker, and a red glyph floating over two citizens that
 * are talking reads as an alarm going off (trafficLivery.test.ts holds the
 * distance). On the near-black plate the cream carries the same contrast.
 */
export const BUBBLE_INK = "#f2efe8";

/** Draw a tiny binary speech bubble onto a canvas texture. */
function drawBubble(ctx: CanvasRenderingContext2D, text: string): void {
  ctx.clearRect(0, 0, 160, 80);
  ctx.fillStyle = "rgba(18, 18, 16, 0.92)";
  ctx.strokeStyle = "rgba(242, 239, 232, 0.5)";
  ctx.lineWidth = 2;
  const r = 10;
  ctx.beginPath();
  ctx.roundRect(4, 4, 152, 52, r);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(70, 55);
  ctx.lineTo(80, 55);
  ctx.lineTo(76, 70);
  ctx.closePath();
  ctx.fillStyle = "rgba(18, 18, 16, 0.92)";
  ctx.fill();
  ctx.font = 'bold 17px "JetBrains Mono", monospace';
  ctx.fillStyle = BUBBLE_INK;
  ctx.textAlign = "center";
  ctx.fillText(text, 80, 38);
}

export function Pedestrians({
  streets = null,
  network = null,
  homes = [],
  count = 72,
  bounds = 42,
  buildSites = null,
  vehiclesActive = true,
  streetPlates = null,
  directStep = DIRECT_STEP_UNITS,
}: {
  streets?: StreetLine[] | null;
  network?: SidewalkNetwork | null;
  homes?: HomeSpot[];
  count?: number;
  bounds?: number;
  /** Rising plots with their rise start (epoch-ms) — builders walk there. */
  buildSites?: Array<BuildSite & { at: number }> | null;
  /** false hides the taxi/bus/stop entirely (their walkers keep walking). */
  vehiclesActive?: boolean;
  /** Flat street paint to draw — the open world's own grid. Absent in a city,
   *  where RoadSystem already paints the streets. */
  streetPlates?: StreetPlate[] | null;
  /** How short a hop may be to walk it straight instead of being routed over
   *  the street graph. A city uses the frontage step (a door is 2 units off the
   *  kerb); the open world passes 0, because without doors there is nothing to
   *  approach off-graph and every step should visibly follow a street. */
  directStep?: number;
}) {
  const surface = useWorldSurface();
  const { camera, scene } = useThree();
  const lang = useStore((s) => s.prefs.lang);
  const selectedResident = useStore((s) => s.selectedResident);
  const selectResident = useStore((s) => s.selectResident);
  const residentCall = useStore((s) => s.residentCall);
  const residentGreet = useStore((s) => s.residentGreet);
  const residentGreeted = useStore((s) => s.residentGreeted);
  const markResidentGreeted = useStore((s) => s.markResidentGreeted);
  // §04.10 — the two facts that decide who wears the chosen look. Subscribed, so
  // naming a resident or turning a jacket recolours the crowd in the same frame
  // rather than on the next scan.
  const epheLook = useStore((s) => s.epheLook);
  const residentNames = useStore((s) => s.residentNames);
  // Work presence (EPHE task #2): which plots still owe a decision. Read-only
  // through the queue's own exported functions — the store is not touched from
  // here, and neither is the frame loop: these two feed a render-time memo.
  const cityData = useStore((s) => s.cityData);
  const reviews = useStore((s) => s.reviews);
  const residentRingRef = useRef<THREE.InstancedMesh | null>(null);
  const bodyRef = useRef<THREE.InstancedMesh>(null);
  const headRef = useRef<THREE.InstancedMesh>(null);
  const faceRef = useRef<THREE.InstancedMesh>(null);
  const eyeRef = useRef<THREE.InstancedMesh>(null);
  const limbRef = useRef<THREE.InstancedMesh>(null);
  const shadowRef = useRef<THREE.InstancedMesh>(null);
  const hatRef = useRef<THREE.InstancedMesh>(null);
  const cargoRef = useRef<THREE.InstancedMesh>(null);
  const plateRef = useRef<THREE.InstancedMesh>(null);
  const postRef = useRef<THREE.InstancedMesh>(null);
  /** Follows the Explorer's head while an errand is open (005-B). */
  const guideRef = useRef<THREE.Group | null>(null);
  /** The same for the resident that follows the security tour (B11). */
  const securityRef = useRef<THREE.Group | null>(null);
  /** And for the resident carrying the maintenance errand (B12). */
  const maintenanceRef = useRef<THREE.Group | null>(null);
  /** Re-arms whenever motion comes back, so the next reduced period parks the
   *  traffic once rather than every frame. */
  const trafficSettledRef = useRef(false);
  const spriteRefs = useRef<Array<THREE.Sprite | null>>([null, null, null]);

  /**
   * §07.06 — the route of the resident that was sent somewhere, drawn on the
   * ground. Written once per errand and never per frame: the stripe is the plan
   * the reader agreed to, not a progress bar, so it does not creep under them
   * as the walk proceeds. `routeOwner` says which role the line belongs to,
   * because three errand effects run for one request and only the owner may
   * clear it.
   */
  const [routePlan, setRoutePlan] = useState<RoutePoint[] | null>(null);
  const routeOwner = useRef<{ role: EpheRole; bearer: Ephe } | null>(null);
  const routeMeshRef = useRef<THREE.Mesh | null>(null);

  const onGraph = !!network && network.nodes.length > 0;
  const hasStreets = !!streets && streets.length > 0;
  // Going in and out of buildings needs homes. Traffic needs a road, not a
  // floor plan — so the open world gets its taxi, its bus and its stop from the
  // street list alone, which is what made the empty world look empty.
  const cityLife = homes.length > 0 && onGraph;
  const transitReady = onGraph && hasStreets;

  /** The world before the first scan paints its own flat street plates; a
   *  scanned level leaves the streets to `RoadSystem` and passes none. That is
   *  how this component knows it is standing in a city rather than on bare
   *  ground — and it has to be read off the plates, not off an empty `homes`,
   *  because a scanned level CAN have an empty plaza: the two-file repo is
   *  exactly that, both files live in one sub-district. */
  const openWorld = !!streetPlates && streetPlates.length > 0;
  const crowd = useMemo(() => crowdFor(homes.length, count, openWorld), [count, homes, openWorld]);

  /** See {@link BUS_MIN_PLOTS}. */
  const busLine = openWorld || homes.length >= BUS_MIN_PLOTS;

  /**
   * Work presence: seat → plot, recomputed whenever the queue's verdicts
   * change. It deliberately does NOT feed the walkers memo's deps: rebuilding
   * the crowd would teleport every figure, and a resident that decides one
   * finding must not watch the whole population jump. The crowd re-reads the
   * seats where it already changes hands anyway — at build, and on the way out
   * of a doorway (the exit branch in the frame loop), never on a timer.
   */
  const presence = useMemo(() => {
    const plots = plotOpenFindings(
      homes.map((h) => h.unitId),
      cityData,
      reviews,
    );
    const seats = presenceSeats(plots, crowd);
    // The badge follows the work: the security figure is the body seated on the
    // plot with the most findings still undecided. No open work, no bearer — an
    // unearned badge would claim a fact the queue does not hold.
    return { seats, plots, bearers: roleBearers(seats, plots, crowd) };
  }, [homes, cityData, reviews, crowd]);
  const presenceRef = useRef(presence);
  presenceRef.current = presence;

  const walkers = useMemo<Ephe[]>(
    () =>
      Array.from({ length: crowd }, (_, i) =>
        makeEphe(
          i,
          bounds,
          network,
          homes,
          crowd,
          presenceRef.current.seats,
          presenceRef.current.bearers,
        ),
      ),
    [crowd, bounds, network, homes],
  );

  // Scratch space for the personal-space pass: one neighbour record per figure
  // and one output object, reused every frame. No allocation in the loop.
  const socialNeighbors = useMemo(
    () =>
      Array.from({ length: count }, () => ({
        x: 0,
        z: 0,
        angle: 0,
        moving: false,
      })),
    [count],
  );
  const socialOut = useMemo(() => ({ pushX: 0, pushZ: 0, pace: 1 }), []);

  // The canvas owns the crowd: a call request picks the nearest stroller and
  // reports the chosen index back to the store, where the card and ring read it.
  const lastCall = useRef(residentCall);
  useEffect(() => {
    if (residentCall === lastCall.current) return;
    lastCall.current = residentCall;
    // Pick a resident the reader can actually see: inside the quiet middle of
    // the frame, away from the left card, the mode bar and the dock. A ray
    // rejects anyone a tower hides. Only if nobody qualifies does the camera
    // distance decide, so C still answers when the pilot is at street level.
    const projected = new THREE.Vector3();
    const target = new THREE.Vector3();
    const ray = new THREE.Raycaster();
    // Sprites (the chat bubbles) demand a Raycaster.camera and are no
    // occluders; only solid meshes can hide a resident from the camera.
    const occluders: THREE.Object3D[] = [];
    scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) occluders.push(o);
    });
    let fallback = -1;
    let fallbackDistance = Infinity;
    // Every figure that is on screen, unoccluded and walking. Who of them
    // answers is `pickCallable`'s decision — including the rule that a resident
    // the reader named answers before the nearest stranger does.
    const names = useStore.getState().residentNames;
    const seen: { at: number; score: number; claimed: boolean }[] = [];
    for (let i = 0; i < walkers.length; i++) {
      const e = walkers[i]!;
      if (e.hidden || e.mode !== "walk") continue;
      const d = Math.hypot(e.x - camera.position.x, e.z - camera.position.z);
      if (d < fallbackDistance) {
        fallbackDistance = d;
        fallback = i;
      }
      projected.set(e.x, 1, e.z).project(camera);
      // The lower free band is where the foreground resident is largest and
      // where the card does not cover it; the upper centre is often a facade.
      if (
        projected.z < -1 ||
        projected.z > 1 ||
        Math.abs(projected.x) > 0.6 ||
        projected.y < -0.52 ||
        projected.y > -0.02
      )
        continue;
      target.set(e.x, 1, e.z);
      const distance = target.distanceTo(camera.position);
      ray.set(camera.position, target.sub(camera.position).normalize());
      const hit = ray.intersectObjects(occluders, false)[0];
      if (hit && hit.distance < distance - 0.9) continue;
      const score = projected.x * projected.x + (projected.y + 0.25) * (projected.y + 0.25);
      seen.push({ at: i, score, claimed: epheKey(e.identity) in names });
    }
    const picked = pickCallable(seen) ?? fallback;
    const e = walkers[picked];
    selectResident(
      picked,
      e ? epheKey(e.identity) : epheKey({ plot: null, seat: picked }),
      e ? epheRoleOf(e) : null,
    );
  }, [residentCall, walkers, camera, selectResident]);

  // Builders on the stage at once: most of the population, because the plots
  // that rise in the same second are scattered all over the city.
  const CREW_SIZE = Math.max(6, Math.ceil(crowd * 0.6));

  // ── Transit infrastructure (needs a street list, not a built city) ────────
  /** The stop sign, the taxi curb and the two lanes they belong to, from one
   *  derivation the open world and the city share: a vehicle is never routed on
   *  a street while its own stop sits on another. */
  const transit = useMemo<Transit | null>(
    () => (transitReady && streets && streets.length > 0 ? deriveTransit(streets) : null),
    [transitReady, streets],
  );

  // ── Crew jobs ────────────────────────────────────────────────────────────
  // A work point goes to whichever free figure can cover the ground to its
  // door before that unit's rise lands (dispatch block in the frame loop).
  // layout.ts writes one site per rising unit, in rise order, from the same
  // walk that writes the rise schedule.

  // Mutable simulation state lives in refs (no React re-renders per frame)
  const sim = useRef({
    walkers,
    transit,
    // scheduler timers
    tEnter: 4,
    tExit: 2.5,
    tChat: 5,
    tStopRefill: 3,
    tTaxi: 8,
    // build crew: which sites are worked / retired, and the dispatch tick
    build: {
      sites: null as Array<BuildSite & { at: number }> | null,
      claimed: new Map<number, number>(),
      settled: new Set<number>(),
      positioned: false,
      timer: 0,
    },
    // taxi state: 0 drive, 1 dwell, 2 drive-off pause. `stand` is which kerb it
    // is working (see TAXI_STANDS) — a cab that only ever drives to one point
    // arrives once and then stands still for the rest of the session.
    taxi: {
      mode: 0,
      timer: 6,
      phase: 0,
      passenger: -1,
      stand: 1,
      /** Travel direction along the lane; stands keep to its right-hand kerb. */
      dir: 1 as 1 | -1,
      /** True while the cab runs to the lane end to turn around there. */
      toEnd: false,
      turn: null as null | {
        k: number;
        dur: number;
        centerX: number;
        centerZ: number;
        ux: number;
        uz: number;
        dir: 1 | -1;
      },
      speed: 0,
      odometer: 0,
    },
    // bus state: 0 drive, 1 dwell. `canDwell` is the departure latch: once the
    // bus has served a stop it may not dwell again on the same approach.
    bus: {
      mode: 0,
      timer: 0,
      seg: 0,
      t: 0.2,
      dir: 1,
      dropped: 0,
      canDwell: true,
      speed: 0,
      odometer: 0,
      turn: null as null | {
        t: number;
        dur: number;
        fromX: number;
        fromZ: number;
        fromRot: number;
        toX: number;
        toZ: number;
        toRot: number;
      },
    },
    // Where the two vehicles actually are, written onto their instances by
    // placeTraffic(). The cab waits at the edge of its lane until it is called
    // to the curb; the bus starts a fifth of the way down the stop's street.
    traffic: {
      taxi: { x: 0, z: -60, rot: 0 },
      bus: { x: 0, z: -80, rot: 0 },
      placed: false,
    },
    busSeg: null as StreetLine | null,
    // chats: sprite idx → { a, b, until, textTimer, text }
    chats: [null, null, null] as Array<{
      a: number;
      b: number;
      until: number;
      textTimer: number;
      text: string;
    } | null>,
    textures: null as Array<THREE.CanvasTexture | null> | null,
    time: 0,
  });

  // A called resident leaves the everyday loop, stands and turns to the reader.
  // Deselect restores a normal stroller; no path or schedule state is lost
  // because the call is only offered for a resident that was walking.
  const previousSelected = useRef<number | null>(null);
  useEffect(() => {
    const prev = previousSelected.current;
    if (prev !== null && prev !== selectedResident) {
      const old = walkers[prev];
      if (old && old.mode === "called") {
        old.mode = "walk";
        old.path = [];
        old.finalX = null;
        old.pause = 0;
        old.look = 0;
        // The reader stopped looking. An unfinished greeting must not follow
        // them back into the everyday loop as a resident waving while walking.
        old.greetUntil = 0;
      }
    }
    if (selectedResident !== null) {
      const e = walkers[selectedResident];
      if (!e || e.hidden || e.mode !== "walk") {
        selectResident(null);
      } else {
        e.mode = "called";
        e.tx = e.x;
        e.tz = e.z;
        e.path = [];
        e.finalX = null;
        e.pause = 0;
        e.vel = 0;
        e.look = 0;
        // §04.08 — the click is the greeting's trigger, and the hold is its
        // length: `WAVE_HOLD_S` of wave, then a resident who stands and looks.
        // Under reduced motion the deadline stays 0 on purpose (see
        // `calledGesture`): the simulation clock does not run there, so a
        // greeting started here would never end.
        if (!prefersReducedMotion()) e.greetUntil = sim.current.time + WAVE_HOLD_S;
        // ...and because the same freeze holds the loop's turn at 0 rad per
        // frame, the click sets the azimuth that turn was aiming at here, once.
        // The reader sees the called resident face the lens without anything
        // moving; with motion allowed the call returns the angle untouched and
        // the ramp keeps sole charge of the turn.
        e.angle = calledSnapAngle(prefersReducedMotion(), e.angle, e, camera.position);
      }
    }
    previousSelected.current = selectedResident;
  }, [selectedResident, walkers, selectResident, sim]);
  // Fresh walkers hold no claim — a stale index would point at the previous
  // city's figures and leave a site claimed by someone who no longer exists
  if (sim.current.walkers !== walkers) {
    sim.current.build.claimed.clear();
    for (const e of walkers) {
      e.siteIndex = -1;
      e.hustle = 1;
    }
  }
  sim.current.walkers = walkers;
  sim.current.transit = transit;
  // A new build (or the empty world) restarts the crew table
  if (sim.current.build.sites !== (buildSites ?? null)) {
    sim.current.build.sites = buildSites ?? null;
    sim.current.build.claimed.clear();
    sim.current.build.settled.clear();
    sim.current.build.positioned = false;
    sim.current.build.timer = 0;
  }
  // The bus runs the street the stop sign stands on. When the transit changes
  // (a new city, or the open world arriving) the vehicles start again from
  // their own lane, so no cab is left parked at last city's curb.
  if (sim.current.busSeg !== (transit?.busLane ?? null)) {
    sim.current.busSeg = transit?.busLane ?? null;
    sim.current.bus.t = 0.2;
    sim.current.bus.dir = 1;
    sim.current.bus.mode = 0;
    sim.current.bus.speed = 0;
    sim.current.bus.odometer = 0;
    sim.current.bus.turn = null;
    sim.current.bus.canDwell = true;
    sim.current.traffic.placed = false;
    sim.current.taxi.speed = 0;
    sim.current.taxi.odometer = 0;
    sim.current.taxi.dir = 1;
    sim.current.taxi.stand = 1;
    sim.current.taxi.toEnd = false;
    sim.current.taxi.turn = null;
  }

  // When the finished city announces itself, one resident in the middle of the
  // frame stops, turns to the reader and waves. It is the same crowd as always —
  // no actor is spawned for it, and nothing is selected or focused. The greeted
  // nonce lives in the store: this component can mount after the card has
  // already spoken (the build skip does exactly that), and a remount must not
  // wave a second time. The camera arrives over a flight, so a resident is only
  // chosen once one actually projects into the frame; measured on the running
  // demo, the first instant had the camera pointed elsewhere and six eligible
  // residents projected to zero pixels.
  /** When the crowd last waved, in the simulation's own seconds. */
  const lastWaveS = useRef(0);
  const pickGreeter = useCallback((): boolean => {
    const projected = new THREE.Vector3();
    const target = new THREE.Vector3();
    const ray = new THREE.Raycaster();
    const occluders: THREE.Object3D[] = [];
    scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) occluders.push(o);
    });
    // A timer runs between frames; the camera's inverse world matrix is only
    // refreshed by the renderer. Without this the position was current and the
    // projection still pointed along the previous leg of the arrival.
    camera.updateMatrixWorld();
    let bestDistance = Infinity;
    let best = -1;
    for (let i = 0; i < walkers.length; i++) {
      const e = walkers[i]!;
      if (e.hidden || e.mode !== "walk" || e.greetUntil > sim.current.time) continue;
      projected.set(e.x, 1, e.z).project(camera);
      // The announcement card covers the top centre of the same frame; a
      // resident waving behind it is as invisible as one behind a tower.
      const behindCard = projected.y > 0.32 && Math.abs(projected.x) < 0.42;
      if (
        projected.z < -1 ||
        projected.z > 1 ||
        Math.abs(projected.x) > 0.65 ||
        projected.y < -0.8 ||
        projected.y > 0.55 ||
        behindCard
      )
        continue;
      // A resident behind a tower or a tree cannot wave at anybody. The call
      // pick has rejected these since it was built; a greeting that happens
      // behind a trunk is the same no-op.
      target.set(e.x, 1, e.z);
      const distance = target.distanceTo(camera.position);
      ray.set(camera.position, target.sub(camera.position).normalize());
      const hit = ray.intersectObjects(occluders, false)[0];
      if (hit && hit.distance < distance - 0.9) continue;
      // The nearest visible resident, not the closest to the vanishing point:
      // a wave from twenty-seven metres away is a few pixels of arm.
      if (distance < bestDistance) {
        bestDistance = distance;
        best = i;
      }
    }
    if (best < 0) return false;
    walkers[best]!.greetUntil = sim.current.time + WAVE_HOLD_S;
    lastWaveS.current = sim.current.time;
    return true;
  }, [camera, scene, sim, walkers]);

  useEffect(() => {
    if (residentGreet === 0 || residentGreeted === residentGreet) return;
    if (prefersReducedMotion()) {
      markResidentGreeted(residentGreet);
      return;
    }
    let attempts = 0;
    let timer = 0;
    let cancelled = false;
    const run = (): void => {
      if (cancelled) return;
      if (pickGreeter() || ++attempts >= 8) {
        markResidentGreeted(residentGreet);
        return;
      }
      timer = window.setTimeout(run, 350);
    };
    run();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [residentGreet, residentGreeted, markResidentGreeted, pickGreeter]);

  // The offer outlives its card — the folded strip carries the same verb — so
  // the wave does too: while nobody has taken it, one resident in the frame
  // waves again every twenty seconds. A guided flow, an open file or a called
  // resident owns the stage, and a closed card ends the offer for this city.
  const waveOwed = useCallback((): boolean => {
    if (prefersReducedMotion()) return false;
    const s = useStore.getState();
    const stageBusy =
      s.selectedResident !== null ||
      s.triageActive ||
      s.tourActive ||
      s.showFindings ||
      s.selectedUnit !== null ||
      s.cityOnly;
    return owesWave(s.residentOffer, stageBusy, sim.current.time, lastWaveS.current);
  }, [sim]);
  useWaveRhythm(waveOwed, pickGreeter);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const scratchColor = useMemo(() => new THREE.Color(), []);
  /**
   * The figure's body plan, in units of the 1.35-tall person. See the exported
   * `FIGURE` above for what each number is and why the plan changed.
   */
  const bodyGeo = useMemo(
    () =>
      new THREE.LatheGeometry(
        FIGURE.coat.map(([r, y]) => new THREE.Vector2(r, y)),
        12,
      ),
    [],
  );
  const headGeo = useMemo(() => new THREE.SphereGeometry(FIGURE.headR, 12, 8), []);
  const faceGeo = useMemo(() => new THREE.SphereGeometry(1, 10, 6), []);
  const eyeGeo = useMemo(() => new THREE.SphereGeometry(0.032, 6, 4), []);
  // Boots, thighs, shins, sleeves, hands and the hair cap share one unit tube,
  // coloured per instance — the legs are the same shape as the arms for the
  // same reason: a figure costs one draw call for all ten of its limbs, not
  // ten. It is a tube with a bevelled end and not the sphere it used to be
  // because at the size the city is looked at, a stretched sphere is a spindle
  // with a point at every joint — see `city/epheBody.ts` for the measured gap
  // under the sleeve and the pinch at the knee.
  const limbGeo = useMemo(() => boneGeometry(), []);
  // The disc under a figure. Without it a body stands on the ground plane with a
  // hard contact edge and reads as floating; measured as `contactLumaDelta`, the
  // crowd sat at −2.8 to −3.6, i.e. the ground under a figure was BRIGHTER than
  // the ground behind it. Rotated flat here once, so the per-frame write is a
  // position and a scale. Its HEIGHT is the part that had to change — see
  // `CONTACT_PATCH_Y`.
  const shadowGeo = useMemo(() => {
    const g = new THREE.CircleGeometry(0.3, 14);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
  const hatGeo = useMemo(
    () =>
      new THREE.LatheGeometry(
        [
          new THREE.Vector2(0, -0.035),
          new THREE.Vector2(0.27, -0.035),
          new THREE.Vector2(0.27, 0),
          new THREE.Vector2(0.235, 0.015),
          new THREE.Vector2(0.215, 0.085),
          new THREE.Vector2(0.165, 0.145),
          new THREE.Vector2(0.09, 0.18),
          new THREE.Vector2(0, 0.19),
        ],
        12,
      ),
    [],
  );
  const limbPose = useMemo<EpheLimbPose>(
    () => ({
      footX: 0,
      footY: 0,
      footZ: 0,
      handX: 0,
      handY: 0,
      handZ: 0,
      kneeForward: 0,
    }),
    [],
  );
  const armDirection = useMemo(() => new THREE.Vector3(), []);
  const armUp = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  // One full-size building block, not a pebble: at the framing the build
  // plays in, a 0.3-unit cube is three pixels and the choreography is lost.
  const cargoGeo = useMemo(() => new THREE.BoxGeometry(0.82, 0.82, 0.82), []);
  // One ring for the called resident, flat in the ground plane. Instanced like
  // the rest of the HUD-in-world marks: one draw for the whole city, not one.
  const selectionGeo = useMemo(() => {
    const g = new THREE.RingGeometry(SELECTION_RING.inner, SELECTION_RING.outer, 40);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
  /** §07.06 — one mesh for the whole route, built once per errand and thrown
   *  away with it. Not instanced: there is never more than one walk on screen
   *  to trace, and the crowd's instance budget stays where it is pinned. */
  const routeGeo = useMemo(
    () => (routePlan ? stripeGeometry(routePlan, surface) : null),
    [routePlan, surface],
  );
  useEffect(() => {
    return () => {
      routeGeo?.dispose();
    };
  }, [routeGeo]);
  // The street is two geometries and no more: a unit box and a unit cylinder,
  // scaled and coloured per instance. Asphalt, kerb, zebra bars, lane dashes,
  // block pads, both vehicle bodies, the sign board are boxes; the sign post and
  // the four wheels are cylinders. That is what keeps the open world at two
  // extra draw calls instead of one mesh per stripe (180+ of them).
  const plateGeo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const postGeo = useMemo(() => new THREE.CylinderGeometry(1, 1, 1, 10), []);
  const trafficDummy = useMemo(() => new THREE.Object3D(), []);
  const rollQ = useMemo(() => new THREE.Quaternion(), []);
  const spinQ = useMemo(() => new THREE.Quaternion(), []);
  const AXIS_X = useMemo(() => new THREE.Vector3(1, 0, 0), []);
  const AXIS_Y = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const AXIS_Z = useMemo(() => new THREE.Vector3(0, 0, 1), []);

  /** Instance bookkeeping: the street paint is static and comes first, then the
   *  sign board, then the vehicle parts; the post is cylinder instance 0. */
  const paintedCount = streetPlates?.length ?? 0;
  const plateInstances = paintedCount + 1 + VEHICLE_BOXES.length;
  const postInstances = 1 + VEHICLE_WHEELS.length;

  const bubbleTextures = useMemo(() => {
    const make = (): THREE.CanvasTexture => {
      const canvas = document.createElement("canvas");
      canvas.width = 160;
      canvas.height = 80;
      const tex = new THREE.CanvasTexture(canvas);
      tex.needsUpdate = true;
      return tex;
    };
    return [make(), make(), make()];
  }, []);
  sim.current.textures = bubbleTextures;

  useLayoutEffect(() => {
    const mesh = bodyRef.current;
    if (!mesh) return;
    // Capacity is `count`; the population is `crowd`. Everything after the
    // crowd's last figure is simply not drawn.
    for (const m of [bodyRef, headRef, faceRef, hatRef, cargoRef, shadowRef]) {
      if (m.current) m.current.count = crowd;
    }
    if (eyeRef.current) eyeRef.current.count = crowd * 2;
    if (limbRef.current) limbRef.current.count = crowd * LIMB_SLOTS;
    walkers.forEach((e, i) => {
      // §04.10 — a resident the reader named wears the look the reader chose;
      // every other figure keeps the crowd's own column. One colour per instance
      // is already how the crowd is dressed, so this costs no draw call and no
      // second renderer — and `epheLook.jacket` is an offered index by
      // construction (`readEpheLook`), so the pair stays index-aligned.
      const outfit = lookFor(epheLook, epheKey(e.identity) in residentNames, i);
      mesh.setColorAt(i, scratchColor.set(outfit.coat));
      const skinHex = outfit.skin;
      const trouserHex = outfit.trouser;
      const hairHex = outfit.hair;
      // Index-aligned with `jackets`, because the coat and its sleeves are one
      // garment seen in two lights, and the pairing is the whole edge.
      const sleeveHex = outfit.sleeve;
      headRef.current?.setColorAt(i, scratchColor.set(hairHex));
      faceRef.current?.setColorAt(i, scratchColor.set(skinHex));
      for (let side = 0; side < 2; side++) {
        // 0-1 boots · 2-3 sleeves · 4-5 hands · 6-7 thighs · 8-9 shins ·
        // 10 the hair cap. Each write sets the scratch colour itself:
        // `scratchColor` is one shared object, so holding it in a variable
        // across the loop hands whatever was set last to everything after it —
        // which is how the legs came out the colour of the hands.
        limbRef.current?.setColorAt(i * LIMB_SLOTS + side, scratchColor.set(EPHE_PALETTE.boots));
        limbRef.current?.setColorAt(i * LIMB_SLOTS + 2 + side, scratchColor.set(sleeveHex));
        limbRef.current?.setColorAt(i * LIMB_SLOTS + 4 + side, scratchColor.set(skinHex));
        limbRef.current?.setColorAt(i * LIMB_SLOTS + 6 + side, scratchColor.set(trouserHex));
        limbRef.current?.setColorAt(i * LIMB_SLOTS + 8 + side, scratchColor.set(trouserHex));
      }
      limbRef.current?.setColorAt(i * LIMB_SLOTS + LIMB.cap, scratchColor.set(hairHex));
    });
    for (const ref of [bodyRef, headRef, faceRef, limbRef]) {
      if (ref.current?.instanceColor) ref.current.instanceColor.needsUpdate = true;
    }
  }, [walkers, crowd, scratchColor, epheLook, residentNames]);

  // Hats and carried blocks start collapsed (scale 0) so nothing pokes out of
  // the ground before the first frame positions them; every walker gets the
  // sand instance colour up front — only builders ever scale the helmet up.
  useLayoutEffect(() => {
    for (const mesh of [hatRef.current, cargoRef.current]) {
      if (!mesh) continue;
      dummy.position.set(0, 0, 0);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(0);
      dummy.updateMatrix();
      for (let i = 0; i < crowd; i++) mesh.setMatrixAt(i, surfaceMatrix(surface, dummy.matrix));
      mesh.instanceMatrix.needsUpdate = true;
    }
    const hats = hatRef.current;
    if (hats) {
      walkers.forEach((_, i) => hats.setColorAt(i, HAT_COLOR));
      if (hats.instanceColor) hats.instanceColor.needsUpdate = true;
    }
  }, [walkers, crowd, buildSites, dummy, surface]);

  // ── the street and its traffic: two instanced meshes ─────────────────────
  // Colours are per-instance and never change; the street paint is placed once
  // because it does not move, the sign and the vehicles are re-placed every
  // frame they are on stage. Everything off stage collapses to scale 0 rather
  // than being hidden by mesh visibility, because in the open world the traffic
  // shares its mesh with the asphalt.
  useLayoutEffect(() => {
    const plates = plateRef.current;
    const posts = postRef.current;
    if (!plates || !posts) return;
    plates.count = plateInstances;
    posts.count = postInstances;
    const td = trafficDummy;
    streetPlates?.forEach((p, i) => {
      td.position.set(p.x, p.y, p.z);
      td.quaternion.setFromAxisAngle(AXIS_Y, p.rotY);
      td.scale.set(p.w, p.h, p.d);
      td.updateMatrix();
      plates.setMatrixAt(i, surfaceMatrix(surface, td.matrix));
      plates.setColorAt(i, scratchColor.set(p.color));
    });
    plates.setColorAt(paintedCount, scratchColor.set(STOP_BOARD.color));
    VEHICLE_BOXES.forEach((part, i) =>
      plates.setColorAt(paintedCount + 1 + i, scratchColor.set(part.color)),
    );
    posts.setColorAt(0, scratchColor.set(STOP_POST.color));
    VEHICLE_WHEELS.forEach((w, i) => posts.setColorAt(1 + i, scratchColor.set(w.color)));
    if (plates.instanceColor) plates.instanceColor.needsUpdate = true;
    if (posts.instanceColor) posts.instanceColor.needsUpdate = true;
    plates.instanceMatrix.needsUpdate = true;
    posts.instanceMatrix.needsUpdate = true;
    placeTraffic();
  }, [streetPlates, paintedCount, plateInstances, postInstances, surface]);

  /** Write the sign and both vehicles onto their instances. Not a simulation
   *  step: `dt` never enters here, so reduced motion still gets a full frame. */
  function placeTraffic(): void {
    const plates = plateRef.current;
    const posts = postRef.current;
    if (!plates || !posts) return;
    const S = sim.current;
    const st = S.transit;
    const on = !!st && transitReady && vehiclesActive;
    const td = trafficDummy;
    const collapse = (mesh: THREE.InstancedMesh, i: number): void => {
      td.position.set(0, -30, 0);
      td.quaternion.identity();
      td.scale.setScalar(0);
      td.updateMatrix();
      mesh.setMatrixAt(i, surfaceMatrix(surface, td.matrix));
    };
    if (!on || !st) {
      collapse(plates, paintedCount);
      for (let i = 0; i < VEHICLE_BOXES.length; i++) collapse(plates, paintedCount + 1 + i);
      collapse(posts, 0);
      for (let i = 0; i < VEHICLE_WHEELS.length; i++) collapse(posts, 1 + i);
    } else {
      td.quaternion.identity();
      td.position.set(st.stopPoint.x, STOP_POST.y, st.stopPoint.z);
      td.scale.set(STOP_POST.r, STOP_POST.h, STOP_POST.r);
      td.updateMatrix();
      posts.setMatrixAt(0, surfaceMatrix(surface, td.matrix));
      td.position.set(st.stopPoint.x, STOP_BOARD.y, st.stopPoint.z);
      td.scale.set(STOP_BOARD.w, STOP_BOARD.h, STOP_BOARD.d);
      td.updateMatrix();
      plates.setMatrixAt(paintedCount, surfaceMatrix(surface, td.matrix));
      let bi = paintedCount + 1;
      for (const part of VEHICLE_BOXES) {
        if (part.vehicle === "bus" && !busLine) {
          collapse(plates, bi++);
          continue;
        }
        const pose = part.vehicle === "taxi" ? S.traffic.taxi : S.traffic.bus;
        td.position.set(
          pose.x + Math.sin(pose.rot) * part.z,
          part.y,
          pose.z + Math.cos(pose.rot) * part.z,
        );
        td.quaternion.setFromAxisAngle(AXIS_Y, pose.rot);
        td.scale.set(part.w, part.h, part.d);
        td.updateMatrix();
        plates.setMatrixAt(bi++, surfaceMatrix(surface, td.matrix));
      }
      let wi = 1;
      for (const wheel of VEHICLE_WHEELS) {
        if (wheel.vehicle === "bus" && !busLine) {
          collapse(posts, wi++);
          continue;
        }
        const pose = wheel.vehicle === "taxi" ? S.traffic.taxi : S.traffic.bus;
        td.position.set(
          pose.x + Math.sin(pose.rot) * wheel.z + Math.cos(pose.rot) * wheel.x,
          wheel.y,
          pose.z + Math.cos(pose.rot) * wheel.z - Math.sin(pose.rot) * wheel.x,
        );
        // laid on its side (axle along X), yawed with the vehicle, then rolled
        // by the distance its odometer has covered. The same cylinder is a
        // Z-axle wheel on the background fleet, hence the opposite sign here;
        // the sign is a property of the vehicle frame, not of its heading.
        const odometer = wheel.vehicle === "taxi" ? S.taxi.odometer : S.bus.odometer;
        const spin = -wheelRoll(odometer, 1, wheel.r);
        td.quaternion
          .setFromAxisAngle(AXIS_Y, pose.rot)
          .multiply(rollQ.setFromAxisAngle(AXIS_Z, Math.PI / 2))
          .multiply(spinQ.setFromAxisAngle(AXIS_X, spin));
        td.scale.set(wheel.r, wheel.t, wheel.r);
        td.updateMatrix();
        posts.setMatrixAt(wi++, surfaceMatrix(surface, td.matrix));
      }
    }
    plates.instanceMatrix.needsUpdate = true;
    posts.instanceMatrix.needsUpdate = true;
  }

  /** Put each vehicle at the place it would be standing if the crowd were not
   *  being held still: the cab at its curb, the bus at its stop. Reduced motion
   *  has to look like a city waiting, not like a frame caught mid-drive. */
  function settleTraffic(): void {
    const st = sim.current.transit;
    if (!st) return;
    const l = st.taxiLane;
    const len = Math.max(Math.hypot(l.x2 - l.x1, l.z2 - l.z1), 0.001);
    const ux = (l.x2 - l.x1) / len;
    const uz = (l.z2 - l.z1) / len;
    const taxiT = TAXI_STANDS[1]!;
    sim.current.traffic.taxi = {
      x: l.x1 + (l.x2 - l.x1) * taxiT + uz * TAXI_STAND_OFFSET,
      z: l.z1 + (l.z2 - l.z1) * taxiT - ux * TAXI_STAND_OFFSET,
      rot: Math.atan2(ux, uz),
    };
    const b = st.busLane;
    const bl = Math.max(Math.hypot(b.x2 - b.x1, b.z2 - b.z1), 0.001);
    const bux = (b.x2 - b.x1) / bl;
    const buz = (b.z2 - b.z1) / bl;
    const t = Math.max(
      0,
      Math.min(1, ((st.stopPoint.x - b.x1) * bux + (st.stopPoint.z - b.z1) * buz) / bl),
    );
    sim.current.traffic.bus = {
      x: b.x1 + (b.x2 - b.x1) * t + buz,
      z: b.z1 + (b.z2 - b.z1) * t - bux,
      rot: Math.atan2(b.x2 - b.x1, b.z2 - b.z1),
    };
  }

  /** First placement of a fresh transit: the vehicles start at the far end of
   *  their own lane, so a cab arrives along a street instead of cutting over
   *  open ground. */
  function stageTraffic(): void {
    const S = sim.current;
    const st = S.transit;
    if (!st || S.traffic.placed) return;
    S.traffic.placed = true;
    const l = st.taxiLane;
    const len = Math.max(Math.hypot(l.x2 - l.x1, l.z2 - l.z1), 0.001);
    const ux = (l.x2 - l.x1) / len;
    const uz = (l.z2 - l.z1) / len;
    const d1 = Math.hypot(l.x1 - st.taxiCurb.x, l.z1 - st.taxiCurb.z);
    const d2 = Math.hypot(l.x2 - st.taxiCurb.x, l.z2 - st.taxiCurb.z);
    const startT = d1 >= d2 ? 0.04 : 0.96;
    const dir = d1 >= d2 ? 1 : -1;
    S.traffic.taxi = {
      x: l.x1 + (l.x2 - l.x1) * startT + uz * 0.95 * dir,
      z: l.z1 + (l.z2 - l.z1) * startT - ux * 0.95 * dir,
      rot: Math.atan2((l.x2 - l.x1) * dir, (l.z2 - l.z1) * dir),
    };
    // The staged end decides which way the cab faces; the first stand must be
    // ahead of it, or it would drive backwards down the street to reach it.
    S.taxi.dir = dir;
    S.taxi.stand = 1;
    S.taxi.toEnd = false;
    S.taxi.turn = null;
    const b = st.busLane;
    const bl = Math.max(Math.hypot(b.x2 - b.x1, b.z2 - b.z1), 0.001);
    const bux = (b.x2 - b.x1) / bl;
    const buz = (b.z2 - b.z1) / bl;
    S.traffic.bus = {
      x: b.x1 + (b.x2 - b.x1) * 0.2 + buz,
      z: b.z1 + (b.z2 - b.z1) * 0.2 - bux,
      rot: Math.atan2(b.x2 - b.x1, b.z2 - b.z1),
    };
  }

  // ── helpers ──────────────────────────────────────────────────────────────
  /** Walk the straight line to the target. `arrive` is how close counts as
   *  there; a figure turning by more than `TURN_IN_PLACE` stands and pivots
   *  first instead of cutting the corner, so its feet stay on the ground the
   *  street network actually has. */
  /**
   * A resident on the carriageway in front of a vehicle. Crossing happens on
   * zebras, so a figure within the asphalt's half width is either crossing or
   * about to; the car waits. Sidewalk figures (CURB_OFFSET ≈ 2.1) do not count.
   */
  const pedestrianOnRoadAhead = (x: number, z: number, rot: number): boolean => {
    const fx = Math.sin(rot);
    const fz = Math.cos(rot);
    const rx = Math.cos(rot);
    const rz = -Math.sin(rot);
    for (const e of walkers) {
      if (e.hidden) continue;
      if (e.mode !== "walk" && e.mode !== "waitBus" && e.mode !== "toTaxi") continue;
      const dx = e.x - x;
      const dz = e.z - z;
      const ahead = dx * fx + dz * fz;
      if (ahead < 0.4 || ahead > 7) continue;
      if (Math.abs(dx * rx + dz * rz) > 1.35) continue;
      for (const s of streets ?? []) {
        if (distanceToSegment(e.x, e.z, s) < 1.8) return true;
      }
    }
    return false;
  };

  const walkToward = (e: Ephe, dt: number, arrive = ARRIVE): boolean => {
    const dx = e.tx - e.x;
    const dz = e.tz - e.z;
    const dist = Math.hypot(dx, dz);
    if (dist < arrive) {
      e.look = ramp(e.look, 0, 4, dt);
      return true;
    }
    const want = Math.atan2(dx, dz);
    let diff = want - e.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    e.angle += Math.max(-TURN_SPEED * dt, Math.min(TURN_SPEED * dt, diff));
    const turning = Math.abs(diff) > TURN_IN_PLACE;
    e.pivot = turning;
    // The eyes arrive before the shoulders do: the visor looks into the corner
    // while the body is still coming round, then eases back to the road.
    e.look = ramp(e.look, Math.abs(diff) > 0.04 ? Math.max(-0.6, Math.min(0.6, diff)) : 0, 5, dt);
    // A start is a ramp, not a switch. `avoid` is the crowd pace for this
    // frame: full ahead, easing behind someone slower.
    e.vel = ramp(e.vel, turning ? 0 : e.speed * e.hustle * e.avoid, ACCEL, dt);
    if (turning) return false;
    const step = Math.min(e.vel * dt, dist);
    e.x += Math.sin(e.angle) * step;
    e.z += Math.cos(e.angle) * step;
    return false;
  };

  // Follow the planned route (graph hops, then the off-graph goal).
  // Returns true once the plan is exhausted and the goal is reached.
  const planStep = (e: Ephe, dt: number): boolean => {
    if (e.path.length > 0) {
      const n = network!.nodes[e.path[0]!]!;
      e.tx = n.x;
      e.tz = n.z;
      if (walkToward(e, dt, NODE_ARRIVE)) {
        // land on the kerb node it was routed to
        e.x = n.x;
        e.z = n.z;
        e.node = e.path.shift()!;
        if (e.path.length === 0 && e.finalX === null) return true;
      }
      return false;
    }
    if (e.finalX !== null) {
      e.tx = e.finalX;
      e.tz = e.finalZ;
      if (walkToward(e, dt)) {
        e.finalX = null;
        return true;
      }
      return false;
    }
    return true;
  };

  // Pick the next curb to stroll to — a random neighbour on the graph
  const graphWander = (e: Ephe): void => {
    const net = network;
    if (!net || net.nodes.length === 0) {
      pickGroundTarget(e, bounds);
      return;
    }
    const cur = net.nodes[e.node] ?? net.nodes[0]!;
    const pool = cur.adj.filter((nb) => nb !== e.prev);
    const options = pool.length > 0 ? pool : cur.adj;
    if (options.length === 0) {
      pickGroundTarget(e, bounds);
      return;
    }
    const next = options[Math.floor(Math.random() * options.length)]!;
    e.prev = e.node;
    e.node = next;
    // The hop itself has to become the plan. Setting only `tx/tz` here leaves
    // the figure with an empty `path` and no `finalX`, so `planStep` reports the
    // plan as exhausted on the very next frame and re-picks a target forever —
    // the population stands still on the kerb and only the ride/build
    // schedulers ever move it (measured: 45 of 46 figures did not change
    // position at all in six seconds).
    const n = net.nodes[next]!;
    e.tx = n.x;
    e.tz = n.z;
    e.path = [next];
    e.finalX = null;
  };

  // Route a walker to a point: graph hops to the nearest node, then a
  // short straight hop to the goal itself (door, curb slot)
  const routeTo = (e: Ephe, x: number, z: number): void => {
    // A step across the frontage does not belong on the street network: routed
    // through the grid it sends the figure down to a curb node and back, and it
    // arrives long after its own plot rose. The open world passes `directStep`
    // 0 — without doors there is nothing to approach off-graph, and a straight
    // hop there would cut a corner of the block instead of following the kerb.
    if (directStep > 0 && Math.hypot(x - e.x, z - e.z) <= directStep) {
      e.path = [];
      e.finalX = x;
      e.finalZ = z;
      return;
    }
    if (!network || network.nodes.length === 0) {
      e.finalX = x;
      e.finalZ = z;
      return;
    }
    const from = nearestNode(network, e.x, e.z);
    // The last step may not cross a carriageway: a door on this kerb is reached
    // from this kerb, not from the node diagonally across the junction.
    const to = approachNode(network, streets ?? [], x, z);
    e.path = graphPath(network, from, to);
    e.node = e.path.length > 0 ? e.path[e.path.length - 1]! : from;
    e.finalX = x;
    e.finalZ = z;
  };

  // Back on the graph after a spawn (exit, drop-off): hop to the nearest curb
  const resumeWalk = (e: Ephe): void => {
    if (!network || network.nodes.length === 0) {
      pickGroundTarget(e, bounds);
      return;
    }
    const from = nearestNode(network, e.x, e.z);
    e.node = from;
    e.prev = -1;
    e.path = [from];
    e.finalX = null;
  };

  /** The three residents that carry work: the Explorer the reader sends, the
   *  Security figure that follows the tour, and the Maintenance figure asked
   *  about a building's complexity. */
  const { explorer, security, maintenance } = presence.bearers;
  const guide = useStore((s) => s.guide);
  const cancelGuide = useStore((s) => s.cancelGuide);

  /** The badge node currently worn — the three roles are mutually exclusive,
   *  so exactly one `cf-guide-badge` is in the DOM at a time. */
  const badgeElRef = useRef<HTMLDivElement | null>(null);
  const badgeHud = useRef<{ at: number; canvas: DOMRect | null; boxes: Box[] }>({
    at: -Infinity,
    canvas: null,
    boxes: [],
  });

  /**
   * Put the role mark where the reader can see it: the figure's projected head
   * when nothing is in the way, and the nearest point outside the panel it
   * would sit on when something is (`placeBadge` — push out the short way,
   * bounded by BADGE_MAX_SHIFT; the figure itself never moves).
   */
  const badgePosition = useCallback(
    (
      object: THREE.Object3D,
      camera: THREE.Camera,
      size: { width: number; height: number },
    ): number[] => {
      _badgePunkt.setFromMatrixPosition(object.matrixWorld).project(camera);
      const anchor = {
        x: (_badgePunkt.x * size.width) / 2 + size.width / 2,
        y: -((_badgePunkt.y * size.height) / 2) + size.height / 2,
      };
      const now = Date.now();
      if (now - badgeHud.current.at > BADGE_HUD_REFRESH_MS) {
        const canvas = document.querySelector("canvas")?.getBoundingClientRect() ?? null;
        badgeHud.current = {
          at: now,
          canvas,
          boxes: hudBoxes(canvas, [...HUD_SURFACES, ...BADGE_EXTRA_HUD]),
        };
      }
      const el = badgeElRef.current;
      const plate = {
        w: el?.offsetWidth || BADGE_FALLBACK.w,
        h: el?.offsetHeight || BADGE_FALLBACK.h,
      };
      const placed = placeBadge(
        anchor,
        plate,
        { w: size.width, h: size.height },
        badgeHud.current.boxes,
        BADGE_MAX_SHIFT,
      );
      if (el) {
        const d = Math.hypot(placed.x - anchor.x, placed.y - anchor.y);
        const mark = placed.shifted ? d.toFixed(0) : null;
        if (mark === null) {
          if ("badgeShift" in el.dataset) delete el.dataset.badgeShift;
        } else if (el.dataset.badgeShift !== mark) el.dataset.badgeShift = mark;
      }
      return [placed.x, placed.y];
    },
    [],
  );

  /**
   * 005-B — hand an errand to one resident, and take it back when it ends. The
   * walk itself happens in the frame loop; this only sets the target, because an
   * errand arrives as a store write (from the dossier, or from a tour step), not
   * as a per-frame decision. `last` keeps it to one attempt per request: the
   * component re-renders for many reasons, and re-checking the figure each time
   * would let a passing bus or build site cancel a guide already on its way. A
   * figure that cannot take the errand at all — in a vehicle, inside a building,
   * mid-rise — is refused here rather than teleported.
   */
  const assignErrand = (
    role: EpheRole,
    e: Ephe | undefined,
    wanted: GuideRequest | null,
    last: { current: GuideRequest | null },
  ): void => {
    // §07.06 — the line belongs to this errand and to no other: taking the
    // errand back — refused, cancelled, handed a new crowd — takes the line
    // back with it. `role` guards it because three effects run for one request
    // and only the one that owns the line may clear it.
    const forget = (): void => {
      if (routeOwner.current?.role !== role) return;
      routeOwner.current = null;
      setRoutePlan(null);
    };
    if (!e) {
      // A crowd too small to carry this role, or a role this city does not
      // staff: the errand is taken back, not left claimed by nobody. Without
      // this the dossier would go on saying "walking" to a figure that never
      // moved.
      last.current = wanted ?? null;
      forget();
      if (wanted) cancelGuide();
      return;
    }
    if (!wanted) {
      last.current = null;
      forget();
      if (e.mode === "guide") {
        e.mode = "walk";
        e.guideArrived = false;
        resumeWalk(e);
      }
      return;
    }
    if (last.current === wanted) return;
    const busy =
      e.hidden ||
      e.mode === "inside" ||
      e.mode === "enter" ||
      e.mode === "exit" ||
      e.mode === "inTaxi" ||
      e.mode === "boarding" ||
      e.mode === "waitBus" ||
      e.mode === "toTaxi" ||
      e.mode === "toSite" ||
      e.mode === "work";
    last.current = wanted;
    if (busy) {
      forget();
      cancelGuide();
      return;
    }
    e.mode = "guide";
    e.guideArrived = false;
    e.pause = 0;
    routeTo(e, wanted.x, wanted.z);
    // §07.06 — the plan the figure now holds, drawn once: its own feet, every
    // kerb node still to come, the door at the end. `walkToward` runs each of
    // those as a straight leg, so the stripe cannot promise a route the body
    // does not take.
    routeOwner.current = { role, bearer: e };
    setRoutePlan(planPolyline(e.x, e.z, e.path, network?.nodes ?? [], e.finalX, e.finalZ));
  };

  const lastExplorer = useRef<GuideRequest | null>(null);
  const lastSecurity = useRef<GuideRequest | null>(null);
  const lastMaintenance = useRef<GuideRequest | null>(null);
  // A rebuilt crowd is a rebuilt world: the sent figure is a new object with no
  // plan, so a line carried over from the previous crowd would describe a walk
  // nobody is taking. Cleared before the three effects below, which cannot
  // bring it back — an errand already claimed returns without re-reading it.
  useEffect(() => {
    routeOwner.current = null;
    setRoutePlan(null);
  }, [walkers]);
  useEffect(() => {
    assignErrand(
      "explorer",
      explorer === null ? undefined : walkers[explorer],
      guide?.role === "explorer" ? guide : null,
      lastExplorer,
    );
  }, [guide, explorer, walkers]);
  useEffect(() => {
    assignErrand(
      "security",
      security === null ? undefined : walkers[security],
      guide?.role === "security" ? guide : null,
      lastSecurity,
    );
  }, [guide, security, walkers]);
  useEffect(() => {
    assignErrand(
      "maintenance",
      maintenance === null ? undefined : walkers[maintenance],
      guide?.role === "maintenance" ? guide : null,
      lastMaintenance,
    );
  }, [guide, maintenance, walkers]);

  const randomVisibleWalker = (pred: (e: Ephe) => boolean): number => {
    const start = Math.floor(Math.random() * walkers.length);
    for (let k = 0; k < walkers.length; k++) {
      const i = (start + k) % walkers.length;
      if (pred(walkers[i]!)) return i;
    }
    return -1;
  };

  /**
   * The eligible walker standing nearest a point. Only the bus queue uses this,
   * and for a plain reason: a stop is served by the people already on its
   * blocks. When the beltway spread the same crowd over 240 kerb nodes instead
   * of 144, a waiter drawn from anywhere spent most of its dispatch walking and
   * the sign stood empty in 54% of frames — the dispatch was happening, the
   * kerb just never filled.
   */
  const nearestWalker = (x: number, z: number, pred: (e: Ephe) => boolean): number => {
    let bestD = Infinity;
    let best = -1;
    for (let i = 0; i < walkers.length; i++) {
      const e = walkers[i]!;
      if (!pred(e) || e.hidden) continue;
      const d = Math.hypot(e.x - x, e.z - z);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  };

  /**
   * Stand the crew on the plots they are about to build.
   * The sidewalk network is the street grid, and a plot's work point is ~20
   * units from the nearest curb node — no figure can cover that between two
   * rises, so a crew drawn from the strolling population never arrives and the
   * skyline goes up empty (measured on the demo: nearest free walker 18.6 units
   * from plot 0). So the builders start where the work is: on the street side of
   * their own plot, a few units off the door. The short walk in, the block up
   * over the foundation and the set-down as the unit rises stay entirely theirs.
   * Positions follow rise order, so every district gets its share. Called once
   * per build while the ground is still bare, so nobody pops into shot.
   */
  const takePositions = (sites: Array<BuildSite & { at: number }>): void => {
    const net = network;
    for (let i = 0; i < walkers.length; i++) {
      const e = walkers[i]!;
      const site = sites[Math.floor((i * sites.length) / walkers.length)]!;
      // street side of the door, spread so a shared plot is not one pile
      const x = site.doorX + ((i % 5) - 2) * 0.7;
      const z = site.doorZ + 2.5 + (i % 4) * 1.2;
      e.x = x;
      e.z = z;
      e.tx = x;
      e.tz = z;
      e.angle = Math.atan2(site.x - x, site.z - z); // facing the plot
      e.mode = "walk";
      e.siteIndex = -1;
      e.hustle = 1;
      // stand fast until the work starts; staggered so they do not all set off
      // on the same frame when the wait is over
      e.pause = 3.2 + (i % 7) * 0.35;
      e.path = [];
      e.finalX = null;
      if (net && net.nodes.length > 0) e.node = nearestNode(net, x, z);
    }
  };

  useFrame((state, delta) => {
    // Reduced motion: the clock of the crowd stops, everything else about it
    // stays. Every quantity in this loop is integrated over `dt` (walking,
    // turning, bobbing, the taxi drive, the bubble timers), so dt = 0 holds the
    // whole population exactly where it is — Ephe's standing on the sidewalks,
    // a cab parked at the curb, nobody vanishing. The matrices keep being
    // written, so nothing is left unplaced and the city still reads as
    // inhabited.
    const dt = prefersReducedMotion() ? 0 : Math.min(delta, 0.1);
    const now = (sim.current.time += dt);
    const bodies = bodyRef.current;
    const heads = headRef.current;
    if (!bodies || !heads) return;
    // The frame loop outlives the render that selected a resident; these live
    // reads keep the greeting, the pointing arm and the ring on the right body.
    const liveResident = useStore.getState().selectedResident;
    const livePoint = useStore.getState().residentPoint;
    const S = sim.current;
    const st = S.transit;
    // Build choreography runs on the REAL clock (site `at` is epoch-ms,
    // same clock CityTree schedules its rises on); only read while sites
    // exist so the plain world stays untouched.
    const hasSites = !!buildSites && buildSites.length > 0;
    const epochNow = hasSites ? Date.now() : 0;
    const hats = hatRef.current;
    const cargos = cargoRef.current;
    const shadows = shadowRef.current;

    // Construction site: keep the vehicles off the stage. `placeTraffic`
    // collapses their instances, so an in-city re-scan (same mounted component)
    // never leaves city A's frozen taxi in city B's shot.
    stageTraffic();
    // Reduced motion holds `dt` at 0, which would leave both vehicles standing
    // where they were staged at the edge of their lane. Settle them once onto
    // the curb and the stop instead, so the still frame is a city waiting and
    // not a frame caught between two frames.
    reducedSettle(trafficSettledRef, settleTraffic);

    // ── schedulers (city life only) ────────────────────────────────────────
    if (cityLife && homes.length > 0) {
      S.tExit -= dt;
      if (S.tExit <= 0) {
        S.tExit = 2.5 + Math.random() * 3;
        const i = randomVisibleWalker((e) => e.mode === "inside");
        if (i >= 0) {
          const e = walkers[i]!;
          const h = homes[e.home % homes.length]!;
          e.mode = "exit";
          e.x = h.doorX;
          e.z = h.doorZ;
          e.anim = 0;
          e.hidden = false;
        }
      }
      S.tEnter -= dt;
      if (S.tEnter <= 0) {
        S.tEnter = 4.5 + Math.random() * 4;
        // A figure that has just stepped into a doorway is not available as a
        // guide for the next four seconds, and the reader who asked got told
        // "no free Maintenance Ephe" — so the three role figures stay on the
        // street, the same way they stay out of a taxi and off a build site.
        // A NAMED resident stays out too: measured after a reload, fourteen
        // presses of `C` never reached the one the reader had claimed, because
        // it had walked into its own building and the caller only picks bodies
        // it can see. A resident somebody called Atlas is not scenery.
        const claimed = useStore.getState().residentNames;
        const i = randomVisibleWalker(
          (e) => e.mode === "walk" && e.pause <= 0 && !onDuty(e, epheKey(e.identity) in claimed),
        );
        if (i >= 0) {
          const e = walkers[i]!;
          const h = homes[e.home % homes.length]!;
          e.mode = "enter";
          routeTo(e, h.doorX, h.doorZ);
        }
      }
    }

    // chat pairing
    S.tChat -= dt;
    if (S.tChat <= 0) {
      S.tChat = 5 + Math.random() * 4;
      const freeSprite = S.chats.findIndex((c) => c === null);
      if (freeSprite >= 0) {
        const a = randomVisibleWalker(
          (e) => e.mode === "walk" && e.pause <= 0 && e.hidden === false && e.chatPartner < 0,
        );
        if (a >= 0) {
          const ea = walkers[a]!;
          const b = randomVisibleWalker((e) => {
            if (e === ea || e.mode !== "walk" || e.hidden || e.chatPartner >= 0) return false;
            return Math.hypot(e.x - ea.x, e.z - ea.z) < 6;
          });
          if (b >= 0) {
            const eb = walkers[b]!;
            ea.mode = eb.mode = "chat";
            ea.chatPartner = b;
            eb.chatPartner = a;
            ea.chatUntil = eb.chatUntil = now + 4 + Math.random() * 3;
            let bits = "";
            for (let k = 0; k < 8; k++) bits += Math.random() < 0.5 ? "0" : "1";
            S.chats[freeSprite] = { a, b, until: ea.chatUntil, textTimer: 0, text: bits };
          }
        }
      }
    }
    for (let k = 0; k < S.chats.length; k++) {
      const c = S.chats[k];
      if (!c) continue;
      const ea = walkers[c.a]!;
      const eb = walkers[c.b]!;
      if (now > c.until || ea.mode !== "chat" || eb.mode !== "chat") {
        if (ea.mode === "chat") {
          ea.mode = "walk";
          ea.chatPartner = -1;
          resumeWalk(ea);
        }
        if (eb.mode === "chat") {
          eb.mode = "walk";
          eb.chatPartner = -1;
          resumeWalk(eb);
        }
        S.chats[k] = null;
        continue;
      }
      c.textTimer -= dt;
      if (c.textTimer <= 0) {
        c.textTimer = 0.9;
        c.text = c.text.slice(1) + (Math.random() < 0.5 ? "0" : "1");
        const tex = bubbleTextures[k];
        const ctx2d = (tex?.image as HTMLCanvasElement | undefined)?.getContext("2d");
        if (tex && ctx2d) {
          drawBubble(ctx2d, c.text);
          tex.needsUpdate = true;
        }
      }
      const sprite = spriteRefs.current[k];
      if (sprite) {
        sprite.visible = true;
        surfacePoint(
          surface,
          (ea.x + eb.x) / 2,
          2.05 + Math.sin(now * 2 + k) * 0.05,
          (ea.z + eb.z) / 2,
          sprite.position,
        );
      }
    }
    // hide unused sprites
    for (let k = 0; k < S.chats.length; k++) {
      if (!S.chats[k] && spriteRefs.current[k]) spriteRefs.current[k]!.visible = false;
    }

    // ── taxi ───────────────────────────────────────────────────────────────
    if (transitReady && vehiclesActive && st?.taxiCurb) {
      const taxi = S.taxi;
      const pose = S.traffic.taxi;
      const lane = st.taxiLane;
      const len = Math.max(Math.hypot(lane.x2 - lane.x1, lane.z2 - lane.z1), 0.001);
      const ux = (lane.x2 - lane.x1) / len;
      const uz = (lane.z2 - lane.z1) / len;
      taxi.timer -= dt;

      if (taxi.turn) {
        // Half circle around the lane end: the cab comes back on the other
        // kerb instead of spinning on the spot or driving on the wrong side.
        const turn = taxi.turn;
        turn.k = Math.min(1, turn.k + dt / turn.dur);
        const e = turn.k * turn.k * (3 - 2 * turn.k);
        const theta = e * Math.PI;
        const cos = Math.cos(theta);
        const sin = Math.sin(theta);
        const rx = turn.uz * turn.dir;
        const rz = -turn.ux * turn.dir;
        pose.x = turn.centerX + TAXI_STAND_OFFSET * (cos * rx + sin * turn.ux * turn.dir);
        pose.z = turn.centerZ + TAXI_STAND_OFFSET * (cos * rz + sin * turn.uz * turn.dir);
        const tx = -sin * rx + cos * turn.ux * turn.dir;
        const tz = -sin * rz + cos * turn.uz * turn.dir;
        pose.rot = -Math.atan2(tz, tx);
        taxi.odometer += TAXI_TURN_SPEED * dt;
        if (turn.k >= 1) {
          taxi.dir = turn.dir > 0 ? -1 : 1;
          taxi.stand = taxi.dir > 0 ? 0 : TAXI_STANDS.length - 1;
          taxi.toEnd = false;
          taxi.turn = null;
          taxi.speed = 0;
          taxi.mode = 0;
        }
      } else if (taxi.mode === 0) {
        const targetT = taxi.toEnd ? (taxi.dir > 0 ? 1 : 0) : TAXI_STANDS[taxi.stand]!;
        const target = standOnLane(lane, targetT, -TAXI_STAND_OFFSET * taxi.dir);
        const dx = target.x - pose.x;
        const dz = target.z - pose.z;
        let d = Math.hypot(dx, dz);
        const want = Math.atan2(dx, dz);
        let diff = want - pose.rot;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        pose.rot += Math.max(-VEHICLE_TURN * dt, Math.min(VEHICLE_TURN * dt, diff));
        const align = 1 - Math.min(0.65, Math.abs(diff) / Math.PI);
        const brakeSpeed = Math.sqrt(2 * VEHICLE_BRAKE * Math.max(0, d - 0.1));
        const yieldAhead = pedestrianOnRoadAhead(pose.x, pose.z, pose.rot);
        const targetSpeed = yieldAhead ? 0 : Math.min(TAXI_SPEED, brakeSpeed) * align;
        taxi.speed = ramp(
          taxi.speed,
          targetSpeed,
          targetSpeed < taxi.speed ? VEHICLE_BRAKE : VEHICLE_ACCEL,
          dt,
        );
        const step = Math.min(taxi.speed * dt, d);
        if (step > 0) {
          pose.x += Math.sin(pose.rot) * step;
          pose.z += Math.cos(pose.rot) * step;
          taxi.odometer += step;
        }
        d = Math.hypot(target.x - pose.x, target.z - pose.z);
        if (d < 0.16 && taxi.speed < 0.55) {
          pose.x = target.x;
          pose.z = target.z;
          pose.rot = want;
          taxi.speed = 0;
          if (taxi.toEnd) {
            const endX = taxi.dir > 0 ? lane.x2 : lane.x1;
            const endZ = taxi.dir > 0 ? lane.z2 : lane.z1;
            taxi.turn = {
              k: 0,
              dur: 1.2,
              centerX: endX,
              centerZ: endZ,
              ux,
              uz,
              dir: taxi.dir,
            };
          } else {
            taxi.mode = 1;
            taxi.timer = 6.5;
            taxi.phase = taxi.phase === 0 ? 1 : 0; // alternate pickup / dropoff
            if (taxi.phase === 1) {
              const i = randomVisibleWalker(
                (e) =>
                  e.mode === "walk" &&
                  e.pause <= 0 &&
                  e.chatPartner < 0 &&
                  !onDuty(e, epheKey(e.identity) in useStore.getState().residentNames),
              );
              if (i >= 0) {
                const e = walkers[i]!;
                e.mode = "toTaxi";
                e.ride = "taxi";
                routeTo(e, target.x, target.z);
                taxi.passenger = i;
              }
            } else {
              const i = randomVisibleWalker((e) => e.mode === "inTaxi" && e.ride === "taxi");
              if (i >= 0) {
                const e = walkers[i]!;
                e.mode = "exit";
                e.ride = null;
                e.x = target.x;
                e.z = target.z;
                e.anim = 0;
                e.hidden = false;
              }
              taxi.passenger = -1;
            }
          }
        }
      } else if (taxi.mode === 1) {
        taxi.speed = ramp(taxi.speed, 0, VEHICLE_BRAKE, dt);
        if (taxi.timer <= 0) {
          taxi.mode = 2;
          taxi.timer = 3 + Math.random() * 3;
        }
      } else if (taxi.mode === 2) {
        taxi.speed = 0;
        if (taxi.timer <= 0) {
          taxi.mode = 0;
          taxi.timer = 20;
          const next = taxi.stand + taxi.dir;
          if (next < 0 || next >= TAXI_STANDS.length) {
            // No more stands this way: run to the end and turn around there.
            taxi.toEnd = true;
          } else {
            taxi.stand = next;
          }
          taxi.passenger = -1;
        }
      }
      // passengers walk to the taxi during dwell
      if (taxi.passenger >= 0) {
        const e = walkers[taxi.passenger]!;
        if (e.mode === "toTaxi" && Math.hypot(e.x - pose.x, e.z - pose.z) < 0.8) {
          e.mode = "inTaxi";
          e.hidden = true;
        }
      }
    }

    // ── bus ────────────────────────────────────────────────────────────────
    if (transitReady && vehiclesActive && busLine && st?.stopPoint) {
      const bus = S.bus;
      const pose = S.traffic.bus;
      if (bus.mode === 0) {
        if (bus.turn) {
          const turn = bus.turn;
          turn.t = Math.min(1, turn.t + dt / turn.dur);
          const k = turn.t * turn.t * (3 - 2 * turn.t);
          const oldX = pose.x;
          const oldZ = pose.z;
          pose.x = THREE.MathUtils.lerp(turn.fromX, turn.toX, k);
          pose.z = THREE.MathUtils.lerp(turn.fromZ, turn.toZ, k);
          let dr = turn.toRot - turn.fromRot;
          while (dr > Math.PI) dr -= Math.PI * 2;
          while (dr < -Math.PI) dr += Math.PI * 2;
          pose.rot = turn.fromRot + dr * k;
          bus.odometer += Math.hypot(pose.x - oldX, pose.z - oldZ);
          if (turn.t >= 1) {
            pose.x = turn.toX;
            pose.z = turn.toZ;
            pose.rot = turn.toRot;
            bus.turn = null;
          }
        } else {
          const seg = S.busSeg;
          if (seg) {
            const len = Math.max(Math.hypot(seg.x2 - seg.x1, seg.z2 - seg.z1), 0.001);
            const ux = (seg.x2 - seg.x1) / len;
            const uz = (seg.z2 - seg.z1) / len;
            const waiting = walkers.filter((e) => e.mode === "waitBus").length;
            const onStopLane = seg === st.busLane;
            const stopT = onStopLane
              ? ((st.stopPoint.x - seg.x1) * ux + (st.stopPoint.z - seg.z1) * uz) / len
              : 0;
            const along = onStopLane ? (stopT - bus.t) * bus.dir * len : Infinity;
            const wantsStop = bus.canDwell && (waiting > 0 || bus.dropped <= 0);
            let targetSpeed = BUS_SPEED;
            if (wantsStop && onStopLane && along > -0.2 && along < 8) {
              targetSpeed =
                along < 0.2
                  ? 0
                  : Math.min(BUS_SPEED, Math.sqrt(2 * VEHICLE_BRAKE * Math.max(0, along - 0.1)));
            }
            if (pedestrianOnRoadAhead(pose.x, pose.z, pose.rot)) targetSpeed = 0;
            bus.speed = ramp(
              bus.speed,
              targetSpeed,
              targetSpeed < bus.speed ? VEHICLE_BRAKE : VEHICLE_ACCEL,
              dt,
            );
            bus.t += ((bus.speed * dt) / len) * bus.dir;
            bus.odometer += bus.speed * dt;

            if (bus.t > 1 || bus.t < 0) {
              const endX = bus.dir > 0 ? seg.x2 : seg.x1;
              const endZ = bus.dir > 0 ? seg.z2 : seg.z1;
              const nexts = (streets ?? []).filter(
                (s) =>
                  (Math.hypot(s.x1 - endX, s.z1 - endZ) < 2 && s !== seg) ||
                  (Math.hypot(s.x2 - endX, s.z2 - endZ) < 2 && s !== seg),
              );
              const next =
                nexts.length > 0 ? nexts[Math.floor(Math.random() * nexts.length)]! : seg;
              const nlen = Math.max(Math.hypot(next.x2 - next.x1, next.z2 - next.z1), 0.001);
              const nux = (next.x2 - next.x1) / nlen;
              const nuz = (next.z2 - next.z1) / nlen;
              const fromStart =
                next === seg ? bus.t > 1 : Math.hypot(next.x1 - endX, next.z1 - endZ) < 2;
              const entryT = fromStart ? 0 : 1;
              const newDir = fromStart ? 1 : -1;
              const toX = next.x1 + (next.x2 - next.x1) * entryT + nuz * 1.0 * newDir;
              const toZ = next.z1 + (next.z2 - next.z1) * entryT - nux * 1.0 * newDir;
              const toRot =
                Math.atan2(next.x2 - next.x1, next.z2 - next.z1) + (newDir > 0 ? 0 : Math.PI);
              bus.turn = {
                t: 0,
                dur: 0.65,
                fromX: pose.x,
                fromZ: pose.z,
                fromRot: pose.rot,
                toX,
                toZ,
                toRot,
              };
              S.busSeg = next;
              bus.t = entryT;
              bus.dir = newDir;
              bus.speed = Math.min(bus.speed, 2.5);
            } else {
              const x = seg.x1 + (seg.x2 - seg.x1) * bus.t;
              const z = seg.z1 + (seg.z2 - seg.z1) * bus.t;
              pose.x = x + uz * 1.0 * bus.dir;
              pose.z = z - ux * 1.0 * bus.dir;
              pose.rot = Math.atan2(seg.x2 - seg.x1, seg.z2 - seg.z1) + (bus.dir > 0 ? 0 : Math.PI);

              const alongAfter = onStopLane ? (stopT - bus.t) * bus.dir * len : Infinity;
              if (wantsStop && onStopLane && alongAfter < STOP_ALIGN && bus.speed < 0.45) {
                bus.t = THREE.MathUtils.clamp(stopT, 0, 1);
                const sx = seg.x1 + (seg.x2 - seg.x1) * bus.t;
                const sz = seg.z1 + (seg.z2 - seg.z1) * bus.t;
                pose.x = sx + uz * 1.0 * bus.dir;
                pose.z = sz - ux * 1.0 * bus.dir;
                bus.speed = 0;
                bus.mode = 1;
                bus.timer = 5.5;
                bus.canDwell = false;
                bus.dropped = (bus.dropped + 1) % 3;
              } else if (
                !bus.canDwell &&
                Math.hypot(pose.x - st.stopPoint.x, pose.z - st.stopPoint.z) > BUS_LEAVE_STOP
              ) {
                bus.canDwell = true;
              }
            }
          }
        }
      } else {
        bus.speed = ramp(bus.speed, 0, VEHICLE_BRAKE, dt);
        bus.timer -= dt;
        // boarding: waiting Ephe's walk in and vanish
        for (const e of walkers) {
          if (
            e.mode === "waitBus" &&
            Math.hypot(e.x - st.stopPoint.x, e.z - st.stopPoint.z) < 1.4
          ) {
            e.mode = "boarding";
            e.anim = 1;
          } else if (e.mode === "boarding") {
            e.anim -= dt * 1.6;
            if (e.anim <= 0) {
              e.mode = "inTaxi"; // hidden, riding the bus
              e.ride = "bus";
              e.hidden = true;
            }
          }
        }
        // after a moment, someone steps off
        if (bus.timer < 2.5) {
          const hidden = randomVisibleWalker((e) => e.mode === "inTaxi" && e.ride === "bus");
          if (hidden >= 0) {
            const e = walkers[hidden]!;
            e.mode = "exit";
            e.ride = null;
            e.x = st.stopPoint.x + (Math.random() - 0.5);
            e.z = st.stopPoint.z + (Math.random() - 0.5);
            e.anim = 0;
            e.hidden = false;
          }
        }
        if (bus.timer <= 0) {
          bus.mode = 0;
          S.tStopRefill = Math.min(S.tStopRefill, 0.6 + Math.random() * 0.9);
        }
      }
    }

    // ── stop refill: send walkers to wait at the bus stop ──────────────────
    if (transitReady && vehiclesActive && busLine && st?.stopPoint) {
      S.tStopRefill -= dt;
      const waiting = walkers.filter((e) => e.mode === "waitBus").length;
      if (S.tStopRefill <= 0 && waiting < 3) {
        // One arrival per tick, except at an empty kerb: there the bus is
        // already on its way back and a queue of one boards and empties again
        // before a second walker has crossed the block.
        const batch = waiting === 0 ? 2 : 1;
        S.tStopRefill = 2.5 + Math.random() * 2.5;
        for (let n = 0; n < batch && waiting + n < 3; n++) {
          const i = nearestWalker(
            st.stopPoint.x,
            st.stopPoint.z,
            (e) =>
              e.mode === "walk" &&
              e.pause <= 0 &&
              e.chatPartner < 0 &&
              !onDuty(e, epheKey(e.identity) in useStore.getState().residentNames),
          );
          if (i < 0) break;
          const e = walkers[i]!;
          const slot = waiting + n;
          e.mode = "waitBus";
          routeTo(
            e,
            st.stopPoint.x + [0, 0.9, -0.9][slot]!,
            st.stopPoint.z + [0.5, -0.4, -0.4][slot]!,
          );
        }
      }
    }

    // ── build sites: walkers become builders for the rise choreography ─────
    // NEVER-STALL: the buildings rise on a pure clock (CityTree's appearAt
    // schedule) — this choreography is decorative and must NEVER delay the
    // construction. Runs independently of vehiclesActive — builders are
    // walkers, not traffic.
    if (hasSites) {
      // once per build, before the first rise: the crew takes the curbs
      if (!S.build.positioned && epochNow < buildSites![0]!.at) {
        S.build.positioned = true;
        takePositions(buildSites!);
      }
      S.build.timer -= dt;
      if (S.build.timer <= 0) {
        S.build.timer = BUILD_DISPATCH_S;
        const sites = buildSites!;
        // Work is picked by PROXIMITY, not by rise order: consecutive sites are
        // ~20 units apart (the rise walks district by district), so a crew that
        // queued on the earliest open site would stare at a plot it can never
        // reach while the rest of the city went up empty. Each free figure
        // takes the nearest plot it can still get to before that rise lands,
        // within the next few seconds — no figure stands waiting at a plot that
        // rises in half a minute.
        for (let b = 0; b < walkers.length && S.build.claimed.size < CREW_SIZE; b++) {
          const w = walkers[b]!;
          // A figure standing at a plot is exactly the one to use, so a paused
          // walk is not a reason to skip it — only a chat or a ride is. And the
          // three role figures are never the crew: each one is somebody's guide.
          if (
            w.mode !== "walk" ||
            w.chatPartner >= 0 ||
            w.hidden ||
            onDuty(w, epheKey(w.identity) in useStore.getState().residentNames)
          )
            continue;
          let bestD = Infinity;
          let best = -1;
          for (let i = 0; i < sites.length; i++) {
            if (S.build.claimed.has(i) || S.build.settled.has(i)) continue;
            const s = sites[i]!;
            // time left to set the block on this unit's roof
            const slackMs = s.at + RISE_MS - PLACE_PAD_MS - epochNow;
            if (slackMs <= 0) {
              S.build.settled.add(i); // rise has landed: it needs nobody
              continue;
            }
            if (slackMs > BUILD_HORIZON_MS) continue;
            // sidewalks follow the grid, so a long approach is routed further
            // than a straight line; a frontage step is the straight line itself
            const d = Math.hypot(w.x - s.doorX, w.z - s.doorZ);
            const route = d <= DIRECT_STEP_UNITS ? d : d * GRID_ROUTE_FACTOR;
            if (route > (w.speed * BUILDER_HUSTLE * slackMs) / 1000) continue;
            if (d < bestD) {
              bestD = d;
              best = i;
            }
          }
          if (best < 0) continue;
          const site = sites[best]!;
          w.mode = "toSite";
          w.siteIndex = best;
          w.hustle = BUILDER_HUSTLE;
          w.pause = 0;
          routeTo(w, site.doorX, site.doorZ);
          S.build.claimed.set(best, b);
          if (cargos) {
            cargos.setColorAt(b, scratchColor.set(site.color));
            if (cargos.instanceColor) cargos.instanceColor.needsUpdate = true;
          }
        }
      }
    }

    // ── personal space ─────────────────────────────────────────────────────
    // One pass over the current positions before anyone steps: walkers ease
    // behind residents ahead, and every nearby resident gives them a side-step
    // to the right. The side-step is smoothed and applied to the drawing only;
    // e.x/e.z stay on the sidewalk graph, so the crosswalk and door contracts
    // are untouched. The pass is skipped under reduced motion (dt = 0).
    if (dt > 0) {
      let nearby = 0;
      for (const o of walkers) {
        if (o.hidden) continue;
        const slot = socialNeighbors[nearby]!;
        slot.x = o.x;
        slot.z = o.z;
        slot.angle = o.angle;
        slot.moving =
          o.pause <= 0 &&
          o.vel > 0.05 &&
          (o.mode === "walk" || o.mode === "waitBus" || o.mode === "toSite" || o.mode === "toTaxi");
        nearby++;
      }
      for (const e of walkers) {
        const walking =
          e.mode === "walk" || e.mode === "waitBus" || e.mode === "toSite" || e.mode === "toTaxi";
        if (!walking) {
          e.avoid = 1;
          e.px = ramp(e.px, 0, 5, dt);
          e.pz = ramp(e.pz, 0, 5, dt);
          continue;
        }
        socialStep(e.x, e.z, e.angle, socialNeighbors, socialOut, nearby);
        e.avoid = socialOut.pace;
        e.px = ramp(e.px, socialOut.pushX, 6, dt);
        e.pz = ramp(e.pz, socialOut.pushZ, 6, dt);
      }
    }

    /** A limb is a stretched sphere between two joints, so the leg and the arm
     *  share one helper: mid-point, direction, half-length. Hoisted out of the
     *  per-figure loop: it closes over nothing that changes, and declaring it
     *  inside cost one fresh closure per figure per frame — 72 of them, 4320 a
     *  second, all of it garbage for the sake of a helper that never varies. */
    const writeBone = (
      slot: number,
      ax: number,
      ay: number,
      az: number,
      bx: number,
      by: number,
      bz: number,
      radius: number,
    ) => {
      dummy.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
      armDirection.set(bx - ax, by - ay, bz - az);
      const length = armDirection.length();
      dummy.quaternion.setFromUnitVectors(armUp, armDirection.normalize());
      dummy.scale.set(radius, length / 2, radius);
      dummy.updateMatrix();
      limbRef.current?.setMatrixAt(slot, surfaceMatrix(surface, dummy.matrix));
    };

    // ── walkers ────────────────────────────────────────────────────────────
    walkers.forEach((e, i) => {
      const previousX = e.x;
      const previousZ = e.z;
      let visibleScale = 1;
      if (
        e.hidden ||
        ((e.mode === "enter" || e.mode === "exit" || e.mode === "boarding") && e.anim <= 0)
      ) {
        visibleScale = 0;
      }

      if (e.mode === "walk" || e.mode === "waitBus" || e.mode === "toTaxi") {
        if (e.greetUntil > now) {
          // Let go of the stroll for a wave: turn to the reader, plant the feet,
          // then walk on. The path is untouched, so no route is lost.
          const want = Math.atan2(camera.position.x - e.x, camera.position.z - e.z);
          let diff = want - e.angle;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          e.angle += Math.max(-4 * dt, Math.min(4 * dt, diff));
          e.vel = ramp(e.vel, 0, ACCEL, dt);
          e.look = 0;
        } else if (e.pause > 0) {
          e.pause -= dt;
        } else if (planStep(e, dt)) {
          // plan exhausted: waitBus stands at its slot, walkers stroll on
          if (e.mode === "waitBus") {
            e.pause = 1 + Math.random();
          } else {
            if (Math.random() < 0.22) e.pause = 0.7 + Math.random() * 2.2;
            graphWander(e);
          }
        }
      } else if (e.mode === "called") {
        // Stand, turn to the person who called, and wait. Once the guide card
        // has chosen a destination, the same body turns and points at it.
        const want = livePoint
          ? Math.atan2(livePoint.x - e.x, livePoint.z - e.z)
          : Math.atan2(camera.position.x - e.x, camera.position.z - e.z);
        let diff = want - e.angle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        e.angle += Math.max(-4 * dt, Math.min(4 * dt, diff));
        e.vel = ramp(e.vel, 0, ACCEL, dt);
        e.look = 0;
      } else if (e.mode === "guide") {
        // 005-B: the Explorer is on the errand the reader gave it. It walks the
        // sidewalk graph to the target building's own plot point, stops inside
        // it, and turns to face what it was sent to — the same body turn the
        // called resident already uses, so no second animation is invented.
        const g = useStore.getState().guide;
        if (!g) {
          e.mode = "walk";
          e.guideArrived = false;
          resumeWalk(e);
        } else if (!e.guideArrived) {
          if (planStep(e, dt) && Math.hypot(e.x - g.x, e.z - g.z) < 1.6) {
            e.guideArrived = true;
            e.tx = e.x;
            e.tz = e.z;
            e.finalX = null;
            e.path = [];
          }
        } else {
          const want = Math.atan2(g.x - e.x, g.z - e.z);
          let diff = want - e.angle;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          // §07.11 — arrival is not a full stop. Once the target is in front of
          // it, the guide takes in the block: one sweep of the shoulders, the
          // visor leading as it does in every corner, home again after
          // `UMSEHEN.dauer`. Driven by simulation time, so a stopped clock is a
          // figure that never left its target (`umsehenBogen(0)` is 0), and the
          // panel's sentence keeps its old moment: it waits for the first face
          // toward the target, which is the frame the sweep starts in.
          if (e.umsehenSeit !== null && (now - e.umsehenSeit) / UMSEHEN.dauer >= 1)
            e.umsehenSeit = null;
          if (e.umsehenSeit === null && Math.abs(diff) < 0.14) e.umsehenSeit = now;
          const kehr = umsehenBogen(
            e.umsehenSeit === null ? 0 : (now - e.umsehenSeit) / UMSEHEN.dauer,
          );
          let dreh = want + kehr - e.angle;
          while (dreh > Math.PI) dreh -= Math.PI * 2;
          while (dreh < -Math.PI) dreh += Math.PI * 2;
          e.angle += Math.max(-4 * dt, Math.min(4 * dt, dreh));
          e.look = ramp(
            e.look,
            Math.abs(dreh) > 0.04 ? Math.max(-0.6, Math.min(0.6, dreh)) : 0,
            5,
            dt,
          );
          e.vel = ramp(e.vel, 0, ACCEL, dt);
          // Reported once, and only once the turn is essentially done: the
          // panel waits for this before it says anything, so an explanation
          // never arrives while the figure is still walking.
          if (Math.abs(diff) < 0.14) {
            const st = useStore.getState();
            if (st.guidePhase !== "arrived") st.setGuidePhase("arrived");
          }
        }
      } else if (e.mode === "enter") {
        if (planStep(e, dt)) {
          e.anim -= dt * 1.5;
          if (e.anim <= 0) {
            e.mode = "inside";
            e.hidden = true;
          }
        }
      } else if (e.mode === "exit") {
        e.anim = Math.min(1, e.anim + dt * 1.6);
        if (e.anim >= 1) {
          e.mode = "walk";
          resumeWalk(e);
        }
      } else if (e.mode === "chat") {
        // face the partner, gentle bob only
        const p = walkers[e.chatPartner];
        if (p) {
          const want = Math.atan2(p.x - e.x, p.z - e.z);
          let diff = want - e.angle;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          e.angle += Math.max(-2 * dt, Math.min(2 * dt, diff));
          e.look = ramp(e.look, 0, 4, dt);
        }
      } else if (e.mode === "boarding") {
        // handled in the bus block (shrink)
        e.anim = Math.max(0, e.anim - dt * 1.6);
      } else if (e.mode === "toSite") {
        const site = buildSites?.[e.siteIndex];
        if (!site) {
          // site list changed under us — never stall, stroll on
          e.siteIndex = -1;
          e.hustle = 1;
          resumeWalk(e);
          e.mode = "walk";
        } else {
          if (planStep(e, dt) && Math.hypot(e.x - site.doorX, e.z - site.doorZ) < 1.2) {
            // at the plot edge: stand still and face the site once
            e.mode = "work";
            e.tx = e.x;
            e.tz = e.z;
            e.angle = Math.atan2(site.x - e.x, site.z - e.z);
          }
          // NEVER-STALL: the rise is pure clock — an overdue site is long
          // done, so the builder gives up instead of wasting time
          if (epochNow > site.at + RISE_MS) {
            S.build.claimed.delete(e.siteIndex);
            S.build.settled.add(e.siteIndex);
            e.siteIndex = -1;
            e.hustle = 1;
            resumeWalk(e);
            e.mode = "walk";
          }
        }
      } else if (e.mode === "work") {
        const site = buildSites?.[e.siteIndex];
        if (!site || epochNow > site.at + RISE_MS) {
          // block set on the roof — rejoin everyday life, and be free for the
          // next site the moment the dispatch tick comes round
          if (e.siteIndex >= 0) {
            S.build.claimed.delete(e.siteIndex);
            S.build.settled.add(e.siteIndex);
          }
          e.siteIndex = -1;
          e.hustle = 1;
          resumeWalk(e);
          e.mode = "walk";
        }
      }

      // ── render transform ─────────────────────────────────────────────────
      const travelled = Math.hypot(e.x - previousX, e.z - previousZ);
      const moving = dt > 0 && travelled > 0.00001;
      if (moving) e.gait += (travelled * GAIT_RATE) / e.tall;
      // A pivot flag left over from a walk must not make a chatting or
      // working figure march, so the mode has to agree.
      const turning = !moving && e.pivot && e.mode === "walk";
      if (turning) e.gait += dt * 7;
      e.blend = strideBlend(e.blend, moving || turning, dt);
      // Ramped, not switched: a figure that stops to pivot arrives with `blend`
      // already at 1, so dropping the step to 40% in one frame would move the
      // planted foot 3.8 px in an instant — the exact pop this whole file is
      // about. Same 4-per-second rate the stride itself uses.
      e.pivotAmp = ramp(e.pivotAmp, turning ? PIVOT_STRIDE : 1, STRIDE_RAMP, dt);
      // §07.12 — the rest pose arrives and leaves on the same ramp the stride
      // uses, and only for a walker that is standing: a figure that is greeting,
      // working, chatting, pointing or being called keeps its own posture.
      const resting = RUHE_AN && e.mode === "walk" && !moving && !turning && e.pause > 0;
      e.restBlend = ramp(e.restBlend, resting ? 1 : 0, STRIDE_RAMP, dt);
      const stride = moving
        ? Math.sin(e.gait) * e.blend
        : turning
          ? pivotMarch(e.gait) * e.blend
          : 0;
      const grow =
        e.mode === "exit" || e.mode === "enter"
          ? Math.max(e.anim, 0)
          : e.mode === "boarding"
            ? Math.max(e.anim, 0)
            : 1;
      // work bob: gentle up/down plus a small nod — same sin(now*9)*0.04
      // pattern the chat idle uses
      const bob = moving
        ? Math.abs(stride) * 0.035
        : e.mode === "work"
          ? Math.sin(now * 9) * 0.04
          : 0;
      const y = (FIGURE.bodyY + bob) * e.tall * grow;
      const vScale = e.tall * grow * visibleScale;

      // A walk is a weight shifting from one foot to the other, not a body
      // gliding above them. The stance foot stays planted; the hips, chest,
      // head and arms lean a little over it. Waiting figures keep a smaller,
      // slower version of the same shift so the square does not freeze — the
      // numbers and why they had to grow are on `SWAY`.
      const forwardX = Math.sin(e.angle);
      const forwardZ = Math.cos(e.angle);
      const sway = moving
        ? Math.sin(e.gait) * SWAY.walkAmp * e.blend
        : Math.sin(now * SWAY.idleRate + e.phase) * SWAY.idleAmp;
      const swayX = forwardZ * sway;
      const swayZ = -forwardX * sway;
      const headSwayX = swayX * SWAY.headGain;
      const headSwayZ = swayZ * SWAY.headGain;
      // Personal space is a drawing offset: the path, crosswalk and door
      // contracts still read e.x/e.z. Everything the viewer sees moves.
      const renderX = e.x + e.px;
      const renderZ = e.z + e.pz;

      dummy.position.set(renderX + swayX, y, renderZ + swayZ);
      dummy.rotation.set(
        moving
          ? stride * 0.04
          : e.mode === "work"
            ? Math.sin(now * 9) * 0.04
            : Math.sin(now * 1.6 + e.phase) * 0.02,
        e.angle,
        0,
      );
      dummy.scale.set(
        e.fat * grow * visibleScale,
        e.tall * grow * visibleScale,
        e.fat * grow * visibleScale,
      );
      dummy.updateMatrix();
      bodies.setMatrixAt(i, surfaceMatrix(surface, dummy.matrix));

      // A head does not get wider just because the body is: the old figure wore
      // `fat` on all three axes, so the broadest residents had a melon on their
      // shoulders. One damped width factor, used by head, face and eyes alike.
      const headW = (1 + (e.fat - 1) * 0.25) * grow * visibleScale;
      const headY = y + (FIGURE.headY - FIGURE.bodyY) * e.tall * grow;
      dummy.position.set(renderX + headSwayX, headY, renderZ + headSwayZ);
      dummy.scale.set(headW, e.tall * grow * visibleScale, headW);
      dummy.updateMatrix();
      heads.setMatrixAt(i, surfaceMatrix(surface, dummy.matrix));

      // The Explorer's badge rides above that figure's head. It is DOM, not a
      // mesh, on purpose: the crowd is drawn in eleven instanced passes and a
      // role that added a twelfth would pay a draw call for one figure.
      if (i === security && securityRef.current) {
        securityRef.current.position.set(
          renderX + headSwayX,
          headY + FIGURE.capY * e.tall * grow + FIGURE.capUp * 2.4,
          renderZ + headSwayZ,
        );
      }
      if (i === maintenance && maintenanceRef.current) {
        maintenanceRef.current.position.set(
          renderX + headSwayX,
          headY + FIGURE.capY * e.tall * grow + FIGURE.capUp * 2.4,
          renderZ + headSwayZ,
        );
      }
      if (i === explorer && guideRef.current) {
        // Above the hair cap, which tops out at headY + capY + capUp — the
        // badge must not sit on the figure's own head.
        guideRef.current.position.set(
          renderX + headSwayX,
          headY + FIGURE.capY * e.tall * grow + FIGURE.capUp * 2.4,
          renderZ + headSwayZ,
        );
      }

      // A dark hair mass, a light face band and two ink marks carry the facing
      // direction. Limbs reuse a single instanced sphere mesh for boots, thighs,
      // shins, sleeves, hands and the hair cap.
      const width = e.fat * grow * visibleScale;
      const strideAmp = strideAmplitude(e.tall, width);
      // The face leads a corner; standing figures glance around instead of
      // staring down the same axis for as long as the page is open. The idle
      // term used to be ±0.12 rad, which moves the face band 0.19 px at the
      // small end of the size band — under a fifth of the pixel it would have
      // to cross to read as a glance. ±0.30 rad is 1.08 px, which is 22% of the
      // skull's own width, and it is still a glance and not a stare.
      const look =
        e.mode === "chat" ? 0 : e.look * 0.6 + (!moving ? Math.sin(now * 0.35 + e.phase) * 0.3 : 0);
      const faceAngle = e.angle + look;
      const faceForwardX = Math.sin(faceAngle);
      const faceForwardZ = Math.cos(faceAngle);
      dummy.rotation.set(0, faceAngle, 0);
      // The face sits ON the skull, at 0.745 of its radius in front of the
      // centre — 0.082 on the old 0.22 head, 0.0954 on the 0.256 one — so it
      // stays a patch on a head rather than a balloon off it. It hangs BELOW the
      // skull's centre by `faceY`, which puts the hairline at 37% of the head's
      // height and the skin at 63%, the split the reference image measures, and
      // takes the band from 1.63 px tall to 3.07 px at the small end of the
      // band. Its width is 69% of the skull's, against the reference's 66%.
      dummy.position.set(
        renderX + headSwayX + faceForwardX * FIGURE.faceAt * headW,
        headY + FIGURE.faceY * vScale,
        renderZ + headSwayZ + faceForwardZ * FIGURE.faceAt * headW,
      );
      dummy.scale.set(FIGURE.faceR * headW, FIGURE.faceUp * vScale, FIGURE.faceDip * headW);
      dummy.updateMatrix();
      faceRef.current?.setMatrixAt(i, surfaceMatrix(surface, dummy.matrix));
      // The cap. It is placed FORWARD of the face band's own surface, so the
      // hairline is an occlusion edge — dark in front of light — instead of the
      // shading gradient the band's top edge used to be. Its radius is 0.017
      // units past the skull's, which is 0.32 px of brim on each side at the
      // small end, and it sits under the crown so the figure's 1.35 contract
      // holds. It rides in the crowd's existing limb pass (slot 10) because a
      // new instanced mesh here is a new draw call for the whole city.
      dummy.position.set(
        renderX + headSwayX + faceForwardX * FIGURE.capAt * headW,
        headY + FIGURE.capY * vScale,
        renderZ + headSwayZ + faceForwardZ * FIGURE.capAt * headW,
      );
      dummy.scale.set(FIGURE.capR * headW, FIGURE.capUp * vScale, FIGURE.capDip * headW);
      dummy.updateMatrix();
      limbRef.current?.setMatrixAt(i * LIMB_SLOTS + LIMB.cap, surfaceMatrix(surface, dummy.matrix));
      const gesture: EpheGesture =
        e.mode === "guide"
          ? e.guideArrived
            ? "point"
            : "idle"
          : e.mode === "called"
            ? calledGesture(livePoint !== null, e.greetUntil, now)
            : e.greetUntil > now
              ? "greet"
              : e.mode === "chat"
                ? "chat"
                : e.mode === "work"
                  ? "lift"
                  : e.mode === "toSite"
                    ? "carry"
                    : resting
                      ? "rest"
                      : "idle";
      // Eleven limb instances per figure: 0-1 boots, 2-3 sleeves, 4-5 hands,
      // 6-7 thighs, 8-9 shins, 10 the hair cap — all written from one pose
      // call, all drawn in the crowd's single limb pass.
      for (let side = 0; side < 2; side++) {
        const lateral = side === 0 ? -1 : 1;
        dummy.position.set(
          renderX +
            headSwayX +
            (faceForwardX * FIGURE.eyeAt + faceForwardZ * lateral * FIGURE.eyeSide) * headW,
          headY + FIGURE.eyeY * vScale,
          renderZ +
            headSwayZ +
            (faceForwardZ * FIGURE.eyeAt - faceForwardX * lateral * FIGURE.eyeSide) * headW,
        );
        // Ink marks at 0.7 of their old size: on a head this size two full-size
        // spheres read as googly eyes rather than a face.
        dummy.scale.setScalar(vScale * 0.5);
        dummy.updateMatrix();
        eyeRef.current?.setMatrixAt(i * 2 + side, surfaceMatrix(surface, dummy.matrix));
        writeEpheLimbPose(
          limbPose,
          stride,
          lateral,
          gesture,
          now * 2.8 + e.phase,
          e.gait,
          strideAmp,
          // The pivot's shorter step rides in on the same ease the start and
          // stop use, so a figure adjusting its footing never snaps.
          e.blend * e.pivotAmp,
          e.restBlend,
        );
        if (gesture === "idle") limbPose.handZ *= e.armStyle;
        const footX = renderX + (forwardZ * limbPose.footX + forwardX * limbPose.footZ) * width;
        const footYw = limbPose.footY * vScale;
        const footZ = renderZ + (-forwardX * limbPose.footX + forwardZ * limbPose.footZ) * width;
        dummy.rotation.set(0, e.angle, 0);
        dummy.scale.set(0.1 * width, 0.075 * vScale, 0.17 * width);
        dummy.position.set(footX, footYw, footZ);
        dummy.updateMatrix();
        limbRef.current?.setMatrixAt(i * LIMB_SLOTS + side, surfaceMatrix(surface, dummy.matrix));

        // The leg: hip → knee → ankle. The knee holds its own height and leads
        // the hip→ankle line to the side that is striding, which is what turns
        // two spheres into a bending leg instead of a hanging one.
        const hipX = renderX + swayX * 0.6 + forwardZ * lateral * FIGURE.hipWidth * width;
        const hipZ = renderZ + swayZ * 0.6 - forwardX * lateral * FIGURE.hipWidth * width;
        const hipYw = FIGURE.hipY * vScale;
        const kneeLead = limbPose.kneeForward * width;
        const kneeX = (hipX + footX) / 2 + forwardX * kneeLead;
        const kneeY = FIGURE.kneeY * vScale;
        const kneeZ = (hipZ + footZ) / 2 + forwardZ * kneeLead;
        const ankleYw = footYw + 0.055 * vScale;
        // The thigh is 0.075, not 0.085: with the hip joint pulled in to 0.062
        // that puts the leg's outer edge 0.137 from the centre line against the
        // coat's 0.185 hem, which is the 0.91 px waist ledge the hem needs. At
        // 0.085 the legs reached 0.170 and the coat had no flank at all.
        writeBone(i * LIMB_SLOTS + 6 + side, hipX, hipYw, hipZ, kneeX, kneeY, kneeZ, 0.075 * width);
        writeBone(
          i * LIMB_SLOTS + 8 + side,
          kneeX,
          kneeY,
          kneeZ,
          footX,
          ankleYw,
          footZ,
          0.07 * width,
        );

        const handX =
          renderX + swayX + (forwardZ * limbPose.handX + forwardX * limbPose.handZ) * width;
        const handY = (limbPose.handY + bob) * vScale;
        const handZ =
          renderZ + swayZ + (-forwardX * limbPose.handX + forwardZ * limbPose.handZ) * width;
        const shoulderX = renderX + swayX + forwardZ * lateral * FIGURE.shoulderWidth * width;
        const shoulderY = y + FIGURE.shoulderY * vScale;
        const shoulderZ = renderZ + swayZ - forwardX * lateral * FIGURE.shoulderWidth * width;
        writeBone(
          i * LIMB_SLOTS + 2 + side,
          shoulderX,
          shoulderY,
          shoulderZ,
          handX,
          handY,
          handZ,
          0.075 * width,
        );
        dummy.rotation.set(0, e.angle, 0);
        dummy.position.set(handX, handY, handZ);
        dummy.scale.set(0.075 * width, 0.075 * vScale, 0.075 * width);
        dummy.updateMatrix();
        limbRef.current?.setMatrixAt(
          i * LIMB_SLOTS + 4 + side,
          surfaceMatrix(surface, dummy.matrix),
        );
      }

      if (shadows) {
        // The contact patch, flat on the ground under the figure's own feet. It
        // follows the feet, not the sway: a weight shift does not move where a
        // body touches down.
        const reach = visibleScale > 0 ? 0.95 * width : 0;
        dummy.rotation.set(0, 0, 0);
        dummy.position.set(renderX, CONTACT_PATCH_Y, renderZ);
        dummy.scale.set(reach, reach, 1);
        dummy.updateMatrix();
        shadows.setMatrixAt(i, surfaceMatrix(surface, dummy.matrix));
      }

      if (hats) {
        // only builders wear the hat; everyone else collapses to scale 0
        const builder = (e.mode === "work" || e.mode === "toSite") && visibleScale > 0;
        dummy.position.set(renderX + headSwayX, headY + 0.1 * vScale, renderZ + headSwayZ);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(builder ? width : 0, builder ? vScale : 0, builder ? width : 0);
        dummy.updateMatrix();
        hats.setMatrixAt(i, surfaceMatrix(surface, dummy.matrix));
      }

      if (cargos) {
        // The block a builder carries: held out in front on the way to the
        // plot, raised overhead once it stands at the pad, then it flies onto
        // the roof and lands with the top of the rise — from there it is wall,
        // no longer cargo, and the figure walks on to the next plot.
        const site = e.siteIndex >= 0 ? buildSites?.[e.siteIndex] : undefined;
        const carrying = !!site && (e.mode === "toSite" || e.mode === "work") && visibleScale > 0;
        if (!site || !carrying) {
          dummy.rotation.set(0, 0, 0);
          dummy.scale.setScalar(0);
        } else {
          // every builder hauls the same block, so the crew reads as a crew
          const s = grow * visibleScale;
          const k = (epochNow - site.at) / RISE_MS;
          const overhead = e.mode === "work";
          const reach = overhead ? 0.12 : 0.62;
          const hand = {
            x: renderX + swayX + Math.sin(e.angle) * reach * width,
            y: (overhead ? 1.46 : 0.62) * vScale,
            z: renderZ + swayZ + Math.cos(e.angle) * reach * width,
          };
          if (k <= 0) {
            dummy.position.set(hand.x, hand.y, hand.z);
          } else {
            const lift = Math.min(1, k * 2.2);
            const ease = 1 - Math.pow(1 - Math.min(1, k), 3);
            dummy.position.set(
              THREE.MathUtils.lerp(hand.x, site.x, lift),
              THREE.MathUtils.lerp(hand.y, site.h * ease + 0.45 * s, lift),
              THREE.MathUtils.lerp(hand.z, site.z, lift),
            );
          }
          dummy.rotation.set(0, e.angle + 0.5, 0);
          dummy.scale.setScalar(s);
        }
        dummy.updateMatrix();
        cargos.setMatrixAt(i, surfaceMatrix(surface, dummy.matrix));
      }
    });
    bodies.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
    for (const mesh of [faceRef.current, eyeRef.current, limbRef.current]) {
      if (mesh) mesh.instanceMatrix.needsUpdate = true;
    }
    if (hats) hats.instanceMatrix.needsUpdate = true;
    if (cargos) cargos.instanceMatrix.needsUpdate = true;
    if (shadows) shadows.instanceMatrix.needsUpdate = true;

    // The ring is one mesh, not one per resident; it follows the called figure
    // including the personal-space side-step.
    const ring = residentRingRef.current;
    if (ring) {
      const marked = liveResident !== null ? walkers[liveResident] : undefined;
      if (marked && !marked.hidden) {
        ring.count = 1;
        // The city's visible plates sit on y=0 even where the terrain function
        // dips below it; the ring has to clear the plate, not follow the dip.
        dummy.position.set(marked.x + marked.px, 0.08, marked.z + marked.pz);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        ring.setMatrixAt(0, surfaceMatrix(surface, dummy.matrix));
        ring.instanceMatrix.needsUpdate = true;
      } else {
        ring.count = 0;
      }
    }

    // §07.06 — the stripe lives exactly as long as the walk it describes.
    // Arrival is the end of the plan, so the line goes with it instead of
    // staying on the pavement to claim a route nobody is walking any more. The
    // geometry itself is not touched here: this is one boolean per frame.
    const route = routeMeshRef.current;
    if (route) {
      const bearer = routeOwner.current?.bearer;
      route.visible = !!bearer && bearer.mode === "guide" && !bearer.guideArrived && !bearer.hidden;
    }

    // the sign and the two vehicles, written from their poses every frame so a
    // still frame (dt = 0) is still a complete frame
    placeTraffic();
  });

  return (
    <group frustumCulled={false}>
      <instancedMesh
        ref={bodyRef}
        args={[bodyGeo, undefined, count]}
        frustumCulled={false}
        onClick={(event: ThreeEvent<MouseEvent>) => {
          const id = event.instanceId;
          if (id == null) return;
          const e = walkers[id];
          if (!e || e.hidden || e.mode !== "walk") return;
          event.stopPropagation();
          selectResident(id, epheKey(e.identity), epheRoleOf(e));
        }}
      >
        <meshStandardMaterial roughness={0.85} metalness={0.02} />
      </instancedMesh>
      <instancedMesh ref={headRef} args={[headGeo, undefined, count]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.78} />
      </instancedMesh>
      <instancedMesh ref={faceRef} args={[faceGeo, undefined, count]} frustumCulled={false}>
        {/* White base, per-instance skin: the face is the light patch on a dark
            skull now, and each resident keeps their own skin tone the same way
            they keep their own coat. */}
        <meshStandardMaterial roughness={0.72} />
      </instancedMesh>
      <instancedMesh ref={eyeRef} args={[eyeGeo, undefined, count * 2]} frustumCulled={false}>
        <meshBasicMaterial color={EPHE_PALETTE.eyes} />
      </instancedMesh>
      <instancedMesh
        ref={limbRef}
        args={[limbGeo, undefined, count * LIMB_SLOTS]}
        frustumCulled={false}
      >
        <meshStandardMaterial roughness={0.9} />
      </instancedMesh>
      {/* The contact patch under every figure: one flat disc, no light of its
          own, so a body meets the ground instead of hovering over it. */}
      <instancedMesh
        ref={shadowRef}
        args={[shadowGeo, undefined, count]}
        frustumCulled={false}
        renderOrder={-1}
      >
        <meshBasicMaterial
          color={EPHE_PALETTE.contact}
          transparent
          opacity={0.26}
          depthWrite={false}
        />
      </instancedMesh>
      {/* One gold ring marks the resident the reader called. Not a second body:
          one mesh, no per-figure label, no new permanent surface. */}
      <instancedMesh
        ref={residentRingRef}
        args={[selectionGeo, undefined, 1]}
        count={0}
        frustumCulled={false}
        renderOrder={10}
      >
        <meshBasicMaterial
          color={EPHE_PALETTE.selection}
          transparent
          opacity={0.95}
          depthWrite={false}
          depthTest={false}
          side={THREE.DoubleSide}
        />
      </instancedMesh>
      {/* §07.06 — the route of the resident the reader sent, painted on the
          kerb it walks. Ink, not a new hue: `arcCasing` is the one colour in
          the world already measured to hold ≥ 3.1:1 against every surface a
          ground line can cross (plot 13.4, ground 12.6, crosswalk 8.4, kerb
          6.6, asphalt 3.1). One mesh, no new instance budget. */}
      {routeGeo && (
        <mesh ref={routeMeshRef} geometry={routeGeo} renderOrder={9} frustumCulled={false}>
          <meshBasicMaterial
            color={ENV.arcCasing}
            transparent
            opacity={0.9}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
      {/* Builder hats — only in the scene while build sites are scheduled */}{" "}
      {buildSites && (
        <instancedMesh ref={hatRef} args={[hatGeo, undefined, count]} frustumCulled={false}>
          <meshStandardMaterial roughness={0.5} />
        </instancedMesh>
      )}
      {/* The blocks in their hands — one per builder, tinted by the language
          the unit it is placing is written in */}
      {buildSites && (
        <instancedMesh ref={cargoRef} args={[cargoGeo, undefined, count]} frustumCulled={false}>
          <meshStandardMaterial roughness={0.75} metalness={0.05} />
        </instancedMesh>
      )}
      {/* The street and its traffic: two instanced meshes, one unit box and one
          unit cylinder, scaled and coloured per instance. Everything flat lives
          in the box mesh (asphalt, kerb, zebra bars, lane dashes, block pads,
          the sign board, both vehicle bodies and cabins); everything round in
          the cylinder mesh (sign post, four wheels). This is what lets the open
          world have a road network and two driving vehicles for +2 draw calls
          instead of the 10 small meshes the taxi, the bus and the stop used to
          be — and the same two meshes take 8 draw calls off a built city. */}
      <instancedMesh
        ref={plateRef}
        args={[plateGeo, undefined, plateInstances]}
        frustumCulled={false}
      >
        <meshStandardMaterial color="#ffffff" roughness={0.92} metalness={0.02} />
      </instancedMesh>
      <instancedMesh ref={postRef} args={[postGeo, undefined, postInstances]} frustumCulled={false}>
        <meshStandardMaterial color="#ffffff" roughness={0.9} metalness={0.05} />
      </instancedMesh>
      {/* 005-B — the Explorer's badge, and only while it is on an errand. A
          role the reader cannot see doing anything is decoration, so the mark
          appears with the task and goes when the task does. */}
      {guide?.role === "maintenance" && maintenance !== null && (
        <group ref={maintenanceRef}>
          <Html center zIndexRange={[9, 0]} calculatePosition={badgePosition}>
            <div
              ref={badgeElRef}
              className="cf-guide-badge cf-guide-badge-maintenance"
              role="img"
              aria-label={t(lang, "guide.maintenanceBadge")}
              title={t(lang, "guide.maintenanceBadge")}
            >
              {ROLE_GLYPH.maintenance}
            </div>
          </Html>
        </group>
      )}
      {guide?.role === "security" && security !== null && (
        <group ref={securityRef}>
          <Html center zIndexRange={[9, 0]} calculatePosition={badgePosition}>
            <div
              ref={badgeElRef}
              className="cf-guide-badge cf-guide-badge-security"
              role="img"
              aria-label={t(lang, "guide.securityBadge")}
              title={t(lang, "guide.securityBadge")}
            >
              {ROLE_GLYPH.security}
            </div>
          </Html>
        </group>
      )}
      {guide?.role === "explorer" && explorer !== null && (
        <group ref={guideRef}>
          <Html center zIndexRange={[9, 0]} calculatePosition={badgePosition}>
            {/* Glyph only, and the word in its accessible name: a resident is
                20-30 px on the district camera, and a badge that spells
                "Explorer" beside it is bigger than the figure it marks. The
                dossier says the role in words; the plaza says it in shape. */}
            <div
              ref={badgeElRef}
              className="cf-guide-badge"
              role="img"
              aria-label={t(lang, "guide.badge")}
              title={t(lang, "guide.badge")}
            >
              {ROLE_GLYPH.explorer}
            </div>
          </Html>
        </group>
      )}
      {/* Chat bubbles — binary small talk */}
      {bubbleTextures.map((tex, i) => (
        <sprite
          key={`bubble-${i}`}
          ref={(s) => {
            spriteRefs.current[i] = s;
          }}
          visible={false}
          scale={[2.3, 1.15, 1]}
        >
          <spriteMaterial map={tex} transparent toneMapped={false} depthWrite={false} />
        </sprite>
      ))}
    </group>
  );
}
