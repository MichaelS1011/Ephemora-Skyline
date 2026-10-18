"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { graphPath, nearestNode, type SidewalkNetwork } from "../city/sidewalks";
import {
  STOP_BOARD,
  STOP_POST,
  VEHICLE_BOXES,
  VEHICLE_WHEELS,
  deriveTransit,
  standOnLane,
  type StreetPlate,
  type Transit,
} from "../city/openWorldStreets";
import { prefersReducedMotion, reducedSettle } from "../city/motion";
import { ACCEL, pivotMarch, ramp, strideBlend } from "../city/epheGait";
import type { BuildSite } from "../city/layout";
import { EPHE_PALETTE } from "../city/palette";
import { surfaceMatrix, surfacePoint } from "../city/worldSurface";
import { useWorldSurface } from "../render/WorldSurface";

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
 * Five instanced draws carry the whole crowd, including arms and hands;
 * +2 carry builders' helmets and blocks. Traffic shares two instanced draws,
 * and conversations use a three-sprite pool.
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
}

type Mode =
  | "walk"
  | "enter"
  | "inside"
  | "exit"
  | "chat"
  | "waitBus"
  | "boarding"
  | "toTaxi"
  | "inTaxi"
  | "toSite"
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
  /** True while turning on the spot rather than cutting a corner. */
  pivot: boolean;
  color: THREE.Color;
  // walk target
  tx: number;
  tz: number;
  pause: number;
  mode: Mode;
  home: number; // home spot index
  anim: number; // grow/shrink 0..1
  chatPartner: number;
  chatUntil: number;
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
}

const WALKER_COLORS = EPHE_PALETTE.jackets;

export type EpheGesture = "idle" | "chat" | "carry" | "lift";

/**
 * The body plan of one resident, in units of the 1.35-tall person.
 *
 * It used to be a capsule from 0.10 to 0.82 with a head sitting on top of it:
 * no legs at all, a torso that reached within 0.10 of the ground, and a
 * silhouette that read as one pale blob at every distance the city is actually
 * looked at. The plan below is what a person's outline is made of — crown 1.35,
 * head 0.95…1.35, torso 0.41…0.95, hip 0.45, knee 0.26, ankle 0.08 — so the legs
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
   */
  headY: 1.24,
  headR: 0.11,
  bodyY: 0.89,
  bodyHalf: 0.21,
  bodyR: 0.175,
  hipY: 0.7,
  kneeY: 0.4,
  ankleY: 0.1,
  /** above the torso centre */
  shoulderY: 0.16,
  hipWidth: 0.085,
  shoulderWidth: 0.19,
} as const;

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
): void {
  const step = Math.max(-1, Math.min(1, stride)) * side;
  out.footX = side * 0.12;
  out.footY = 0.078 + Math.max(0, step) * 0.045;
  out.footZ = step * 0.13;
  // A knee never bends backwards: it leads as the leg comes forward and pushes
  // off behind, and stays slightly bent while standing so the leg is not a pole.
  out.kneeForward = 0.022 + Math.max(0, step) * 0.05;
  out.handX = side * 0.28;
  // A hanging arm ends below the hip, not at it: 0.45 put the hands beside the
  // waistband, where they read as two extra lumps on a snowman.
  out.handY = 0.5;
  out.handZ = -step * 0.1;
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

const WALK_SPEED = 2.3;

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
): Ephe {
  const shape = ((i * 61) % 100) / 100;
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
    pivot: false,
    color: new THREE.Color(WALKER_COLORS[i % WALKER_COLORS.length]!),
    tx: 0,
    tz: 0,
    pause: 0,
    mode: "walk",
    home: homes.length > 0 ? i % homes.length : -1,
    anim: 1,
    chatPartner: -1,
    chatUntil: 0,
    hidden: false,
    ride: null,
    node: 0,
    prev: -1,
    path: [],
    finalX: null,
    finalZ: 0,
    siteIndex: -1,
    hustle: 1,
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
  /** Re-arms whenever motion comes back, so the next reduced period parks the
   *  traffic once rather than every frame. */
  const trafficSettledRef = useRef(false);
  const spriteRefs = useRef<Array<THREE.Sprite | null>>([null, null, null]);

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

  const walkers = useMemo<Ephe[]>(
    () => Array.from({ length: crowd }, (_, i) => makeEphe(i, bounds, network, homes, crowd)),
    [crowd, bounds, network, homes],
  );

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
    taxi: { mode: 0, timer: 6, phase: 0, passenger: -1, stand: 1 },
    // bus state: 0 drive, 1 dwell. `canDwell` is the departure latch: once the
    // bus has served a stop it may not dwell again on the same approach.
    bus: { mode: 0, timer: 0, seg: 0, t: 0.2, dir: 1, dropped: 0, canDwell: true },
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
    sim.current.bus.canDwell = true;
    sim.current.traffic.placed = false;
  }

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const scratchColor = useMemo(() => new THREE.Color(), []);
  /**
   * The figure's body plan, in units of the 1.35-tall person. See the exported
   * `FIGURE` above for what each number is and why the plan changed.
   */
  const bodyGeo = useMemo(
    () => new THREE.CapsuleGeometry(FIGURE.bodyR, FIGURE.bodyHalf * 2 - FIGURE.bodyR * 2, 4, 10),
    [],
  );
  const headGeo = useMemo(() => new THREE.SphereGeometry(FIGURE.headR, 12, 8), []);
  const faceGeo = useMemo(() => new THREE.SphereGeometry(1, 10, 6), []);
  const eyeGeo = useMemo(() => new THREE.SphereGeometry(0.032, 6, 4), []);
  // Boots, thighs, shins, sleeves and hands share one unit sphere, coloured per
  // instance — the legs are stretched spheres for the same reason the arms are:
  // a figure costs one draw call for all ten of its limbs, not ten.
  const limbGeo = useMemo(() => new THREE.SphereGeometry(1, 8, 6), []);
  // The disc under a figure. Without it a body stands on the ground plane with a
  // hard contact edge and reads as floating; measured as `contactLumaDelta`, the
  // crowd sat at −2.8 to −3.6, i.e. the ground under a figure was BRIGHTER than
  // the ground behind it. Rotated flat here once, so the per-frame write is a
  // position and a scale.
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
  // The street is two geometries and no more: a unit box and a unit cylinder,
  // scaled and coloured per instance. Asphalt, kerb, zebra bars, lane dashes,
  // block pads, both vehicle bodies, the sign board are boxes; the sign post and
  // the four wheels are cylinders. That is what keeps the open world at two
  // extra draw calls instead of one mesh per stripe (180+ of them).
  const plateGeo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const postGeo = useMemo(() => new THREE.CylinderGeometry(1, 1, 1, 10), []);
  const trafficDummy = useMemo(() => new THREE.Object3D(), []);
  const rollQ = useMemo(() => new THREE.Quaternion(), []);
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
    if (limbRef.current) limbRef.current.count = crowd * 10;
    walkers.forEach((e, i) => {
      mesh.setColorAt(i, e.color);
      const shellHex = EPHE_PALETTE.shells[i % EPHE_PALETTE.shells.length]!;
      const trouserHex = EPHE_PALETTE.trousers[i % EPHE_PALETTE.trousers.length]!;
      headRef.current?.setColorAt(i, scratchColor.set(shellHex));
      for (let side = 0; side < 2; side++) {
        // 0-1 boots · 2-3 sleeves · 4-5 hands · 6-7 thighs · 8-9 shins.
        // Each write sets the scratch colour itself: `scratchColor` is one shared
        // object, so holding it in a variable across the loop hands whatever was
        // set last to everything after it — which is how the legs came out the
        // colour of the hands.
        limbRef.current?.setColorAt(i * 10 + side, scratchColor.set(EPHE_PALETTE.boots));
        limbRef.current?.setColorAt(i * 10 + 2 + side, e.color);
        limbRef.current?.setColorAt(i * 10 + 4 + side, scratchColor.set(shellHex));
        limbRef.current?.setColorAt(i * 10 + 6 + side, scratchColor.set(trouserHex));
        limbRef.current?.setColorAt(i * 10 + 8 + side, scratchColor.set(trouserHex));
      }
    });
    for (const ref of [bodyRef, headRef, limbRef]) {
      if (ref.current?.instanceColor) ref.current.instanceColor.needsUpdate = true;
    }
  }, [walkers, crowd, scratchColor]);

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
          pose.x + Math.sin(pose.rot) * wheel.z,
          wheel.y,
          pose.z + Math.cos(pose.rot) * wheel.z,
        );
        // laid on its side (axle along X), then yawed with the vehicle
        td.quaternion
          .setFromAxisAngle(AXIS_Y, pose.rot)
          .multiply(rollQ.setFromAxisAngle(AXIS_Z, Math.PI / 2));
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
    sim.current.traffic.taxi = { x: st.taxiCurb.x, z: st.taxiCurb.z, rot: Math.atan2(ux, uz) };
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
  const walkToward = (e: Ephe, dt: number, arrive = ARRIVE): boolean => {
    const dx = e.tx - e.x;
    const dz = e.tz - e.z;
    const dist = Math.hypot(dx, dz);
    if (dist < arrive) return true;
    const want = Math.atan2(dx, dz);
    let diff = want - e.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    e.angle += Math.max(-TURN_SPEED * dt, Math.min(TURN_SPEED * dt, diff));
    const turning = Math.abs(diff) > TURN_IN_PLACE;
    e.pivot = turning;
    // A start is a ramp, not a switch.
    e.vel = ramp(e.vel, turning ? 0 : e.speed * e.hustle, ACCEL, dt);
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
    const to = nearestNode(network, x, z);
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
    let best = -1;
    let bestD = Infinity;
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
        const i = randomVisibleWalker((e) => e.mode === "walk" && e.pause <= 0);
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
      const target = standOnLane(st.taxiLane, TAXI_STANDS[taxi.stand]!);
      taxi.timer -= dt;
      if (taxi.mode === 0) {
        // driving along its lane to the kerb it is working
        const dx = target.x - pose.x;
        const dz = target.z - pose.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.4 || taxi.timer <= 0) {
          pose.x = target.x;
          pose.z = target.z;
          taxi.mode = 1;
          taxi.timer = 6.5;
          taxi.phase = taxi.phase === 0 ? 1 : 0; // alternate pickup / dropoff
          if (taxi.phase === 1) {
            const i = randomVisibleWalker(
              (e) => e.mode === "walk" && e.pause <= 0 && e.chatPartner < 0,
            );
            if (i >= 0) {
              const e = walkers[i]!;
              e.mode = "toTaxi";
              e.ride = "taxi";
              routeTo(e, target.x, target.z);
              taxi.passenger = i;
            }
          } else {
            // step-out: a hidden passenger appears at the kerb
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
        } else {
          const ang = Math.atan2(dx, dz);
          pose.x += Math.sin(ang) * Math.min(6 * dt, d);
          pose.z += Math.cos(ang) * Math.min(6 * dt, d);
          pose.rot = ang;
        }
      } else if (taxi.mode === 1 && taxi.timer <= 0) {
        taxi.mode = 2;
        taxi.timer = 3 + Math.random() * 3;
      } else if (taxi.mode === 2 && taxi.timer <= 0) {
        taxi.mode = 0;
        taxi.timer = 20;
        taxi.stand = (taxi.stand + 1) % TAXI_STANDS.length;
        taxi.passenger = -1;
      }
      // passengers walk to the taxi during dwell
      if (taxi.passenger >= 0) {
        const e = walkers[taxi.passenger]!;
        if (e.mode === "toTaxi" && Math.hypot(e.x - target.x, e.z - target.z) < 0.8) {
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
        const seg = S.busSeg;
        if (seg) {
          const len = Math.max(Math.hypot(seg.x2 - seg.x1, seg.z2 - seg.z1), 0.001);
          bus.t += ((dt * 5.5) / len) * bus.dir;
          if (bus.t > 1 || bus.t < 0) {
            // pick a connected segment
            const endX = bus.dir > 0 ? seg.x2 : seg.x1;
            const endZ = bus.dir > 0 ? seg.z2 : seg.z1;
            const nexts = (streets ?? []).filter(
              (s) =>
                (Math.hypot(s.x1 - endX, s.z1 - endZ) < 2 && s !== seg) ||
                (Math.hypot(s.x2 - endX, s.z2 - endZ) < 2 && s !== seg),
            );
            if (nexts.length > 0) {
              const n = nexts[Math.floor(Math.random() * nexts.length)]!;
              const fromStart = Math.hypot(n.x1 - endX, n.z1 - endZ) < 2;
              S.busSeg = n;
              bus.t = fromStart ? 0 : 1;
              bus.dir = fromStart ? 1 : -1;
            } else {
              bus.dir *= -1;
              bus.t = THREE.MathUtils.clamp(bus.t, 0, 1);
            }
          }
          const x = seg.x1 + (seg.x2 - seg.x1) * bus.t;
          const z = seg.z1 + (seg.z2 - seg.z1) * bus.t;
          // keep to the right lane of the travel direction
          const ux = (seg.x2 - seg.x1) / len;
          const uz = (seg.z2 - seg.z1) / len;
          pose.x = x + uz * 1.0 * bus.dir;
          pose.z = z - ux * 1.0 * bus.dir;
          pose.rot = Math.atan2(seg.x2 - seg.x1, seg.z2 - seg.z1) + (bus.dir > 0 ? 0 : Math.PI);
          // arrive at the stop?
          const dStop = Math.hypot(x - st.stopPoint.x, z - st.stopPoint.z);
          // The departure latch: a crowd that keeps refilling at the kerb would
          // otherwise re-trigger the dwell on the very next frame and the bus
          // would stand at its own sign for the rest of the session (measured:
          // 0.1 units travelled in eight seconds). It has to clear the stop
          // before it may stop again.
          if (!bus.canDwell && dStop > BUS_LEAVE_STOP) bus.canDwell = true;
          const waiting = walkers.filter((e) => e.mode === "waitBus").length;
          if (bus.canDwell && dStop < 3 && (waiting > 0 || bus.dropped <= 0)) {
            bus.mode = 1;
            bus.timer = 5.5;
            bus.canDwell = false;
            bus.dropped = (bus.dropped + 1) % 3;
          }
        }
      } else {
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
          bus.mode = 0; // riders without a stop stay on board until the next pass
          // The kerb is empty the instant the bus leaves. On the idle tick
          // alone it stayed empty for seconds (measured: someone waiting in
          // 45.8% of frames, 64.3% with a 2.5–5 s tick), so a departure hands
          // the queue straight to the refill — which is what a real stop does:
          // the next passenger walks up while the bus is still pulling out.
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
            (e) => e.mode === "walk" && e.pause <= 0 && e.chatPartner < 0,
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
          // walk is not a reason to skip it — only a chat or a ride is.
          if (w.mode !== "walk" || w.chatPartner >= 0 || w.hidden) continue;
          let best = -1;
          let bestD = Infinity;
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
        if (e.pause > 0) {
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
      if (moving) e.gait += (travelled * 5.5) / e.tall;
      // A pivot flag left over from a walk must not make a chatting or
      // working figure march, so the mode has to agree.
      const turning = !moving && e.pivot && e.mode === "walk";
      if (turning) e.gait += dt * 7;
      e.blend = strideBlend(e.blend, moving || turning, dt);
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

      dummy.position.set(e.x, y, e.z);
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
      dummy.position.set(e.x, headY, e.z);
      dummy.scale.set(headW, e.tall * grow * visibleScale, headW);
      dummy.updateMatrix();
      heads.setMatrixAt(i, surfaceMatrix(surface, dummy.matrix));

      // Ceramic heads, an ink visor and two pearl eyes carry the facing direction.
      // Limbs reuse a single instanced sphere mesh for boots, thighs, shins,
      // sleeves and hands.
      const forwardX = Math.sin(e.angle);
      const forwardZ = Math.cos(e.angle);
      const width = e.fat * grow * visibleScale;
      dummy.rotation.set(0, e.angle, 0);
      // The visor sits ON the head: the head is 0.15 across, so the face band
      // goes at 0.11 in front of the centre, not at 0.2 where it floated off the
      // skull as soon as the head stopped being a melon.
      dummy.position.set(e.x + forwardX * 0.082 * headW, headY, e.z + forwardZ * 0.082 * headW);
      dummy.scale.set(0.085 * headW, 0.055 * vScale, 0.03 * headW);
      dummy.updateMatrix();
      faceRef.current?.setMatrixAt(i, surfaceMatrix(surface, dummy.matrix));
      const gesture: EpheGesture =
        e.mode === "chat"
          ? "chat"
          : e.mode === "work"
            ? "lift"
            : e.mode === "toSite"
              ? "carry"
              : "idle";
      /** A limb is a stretched sphere between two joints, so the leg and the arm
       *  share one helper: mid-point, direction, half-length. */
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
      for (let side = 0; side < 2; side++) {
        const lateral = side === 0 ? -1 : 1;
        dummy.position.set(
          e.x + (forwardX * 0.098 + forwardZ * lateral * 0.038) * headW,
          headY + 0.02 * vScale,
          e.z + (forwardZ * 0.098 - forwardX * lateral * 0.038) * headW,
        );
        // Pearl eyes at 0.7 of their old size: on a 0.15 head two full-size
        // spheres read as googly eyes rather than a face.
        dummy.scale.setScalar(vScale * 0.5);
        dummy.updateMatrix();
        eyeRef.current?.setMatrixAt(i * 2 + side, surfaceMatrix(surface, dummy.matrix));
        writeEpheLimbPose(limbPose, stride, lateral, gesture, now * 2.8 + e.phase);
        const footX = e.x + (forwardZ * limbPose.footX + forwardX * limbPose.footZ) * width;
        const footYw = limbPose.footY * vScale;
        const footZ = e.z + (-forwardX * limbPose.footX + forwardZ * limbPose.footZ) * width;
        dummy.rotation.set(0, e.angle, 0);
        dummy.scale.set(0.1 * width, 0.075 * vScale, 0.17 * width);
        dummy.position.set(footX, footYw, footZ);
        dummy.updateMatrix();
        limbRef.current?.setMatrixAt(i * 10 + side, surfaceMatrix(surface, dummy.matrix));

        // The leg: hip → knee → ankle. The knee holds its own height and leads
        // the hip→ankle line to the side that is striding, which is what turns
        // two spheres into a bending leg instead of a hanging one.
        const hipX = e.x + forwardZ * lateral * FIGURE.hipWidth * width;
        const hipZ = e.z - forwardX * lateral * FIGURE.hipWidth * width;
        const hipYw = FIGURE.hipY * vScale;
        const kneeLead = limbPose.kneeForward * width;
        const kneeX = (hipX + footX) / 2 + forwardX * kneeLead;
        const kneeY = FIGURE.kneeY * vScale;
        const kneeZ = (hipZ + footZ) / 2 + forwardZ * kneeLead;
        const ankleYw = footYw + 0.055 * vScale;
        writeBone(i * 10 + 6 + side, hipX, hipYw, hipZ, kneeX, kneeY, kneeZ, 0.085 * width);
        writeBone(i * 10 + 8 + side, kneeX, kneeY, kneeZ, footX, ankleYw, footZ, 0.07 * width);

        const handX = e.x + (forwardZ * limbPose.handX + forwardX * limbPose.handZ) * width;
        const handY = (limbPose.handY + bob) * vScale;
        const handZ = e.z + (-forwardX * limbPose.handX + forwardZ * limbPose.handZ) * width;
        const shoulderX = e.x + forwardZ * lateral * FIGURE.shoulderWidth * width;
        const shoulderY = y + FIGURE.shoulderY * vScale;
        const shoulderZ = e.z - forwardX * lateral * FIGURE.shoulderWidth * width;
        writeBone(
          i * 10 + 2 + side,
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
        limbRef.current?.setMatrixAt(i * 10 + 4 + side, surfaceMatrix(surface, dummy.matrix));
      }

      if (shadows) {
        // The contact patch, flat on the ground under the figure's own feet.
        const reach = visibleScale > 0 ? 0.95 * width : 0;
        dummy.rotation.set(0, 0, 0);
        dummy.position.set(e.x, 0.016, e.z);
        dummy.scale.set(reach, reach, 1);
        dummy.updateMatrix();
        shadows.setMatrixAt(i, surfaceMatrix(surface, dummy.matrix));
      }

      if (hats) {
        // only builders wear the hat; everyone else collapses to scale 0
        const builder = (e.mode === "work" || e.mode === "toSite") && visibleScale > 0;
        dummy.position.set(e.x, headY + 0.1 * vScale, e.z);
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
            x: e.x + Math.sin(e.angle) * reach * width,
            y: (overhead ? 1.46 : 0.62) * vScale,
            z: e.z + Math.cos(e.angle) * reach * width,
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
    // the sign and the two vehicles, written from their poses every frame so a
    // still frame (dt = 0) is still a complete frame
    placeTraffic();
  });

  return (
    <group frustumCulled={false}>
      <instancedMesh ref={bodyRef} args={[bodyGeo, undefined, count]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.85} metalness={0.02} />
      </instancedMesh>
      <instancedMesh ref={headRef} args={[headGeo, undefined, count]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.78} />
      </instancedMesh>

      <instancedMesh ref={faceRef} args={[faceGeo, undefined, count]} frustumCulled={false}>
        <meshStandardMaterial color={EPHE_PALETTE.visor} roughness={0.75} />
      </instancedMesh>
      <instancedMesh ref={eyeRef} args={[eyeGeo, undefined, count * 2]} frustumCulled={false}>
        <meshBasicMaterial color={EPHE_PALETTE.eyes} />
      </instancedMesh>
      <instancedMesh ref={limbRef} args={[limbGeo, undefined, count * 10]} frustumCulled={false}>
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

      {/* Builder hats — only in the scene while build sites are scheduled */}
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
