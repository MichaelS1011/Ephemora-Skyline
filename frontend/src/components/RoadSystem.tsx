"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { surfaceMatrix, surfaceStreetSegments } from "../city/worldSurface";
import { SurfaceAnchor, useWorldSurface } from "../render/WorldSurface";
import type { DirLayout, StreetLine } from "../city/layout";
import { CURB_OFFSET, type SidewalkNetwork } from "../city/sidewalks";
import { ENV } from "../city/palette";
import { CAR_SHAPE, FLEET_LIVERY, deriveTransit, wheelRoll } from "../city/openWorldStreets";
import { ramp } from "../city/epheGait";
import {
  FLEET_ACCEL,
  FLEET_BRAKE,
  FLEET_CORNER_YAW,
  FLEET_GAP,
  FLEET_HOLD_LIMIT,
  FLEET_LANE_OFFSET,
  chooseContinuation,
  cornerCurve,
  cornerLook,
  curveAt,
  curvatureSpeed,
  followLook,
  followSpeed,
  isDrivable,
  isStraightOn,
  nodeCorner,
  slewYaw,
  streetContinuations,
  turnAroundLength,
  turnAroundSpeed,
  type FleetContinuation,
  type FleetCurve,
} from "../city/fleetMotion";

export { wheelRoll };
import { COMPLEXITY_TICKS, heightForComplexity } from "../city/mapping";
import { heightAxisKey } from "../city/heightAxis";
import { useLodFar } from "../hooks/useLodFar";
import { reducedSettle } from "../city/motion";
import { formatDecimal, t } from "../i18n";
import { useStore } from "../stores/useStore";
import "../design/city-funktion.css";

/**
 * Streets & city furniture, Minecraft-flavoured: asphalt strips between
 * plots, concrete curbs framing every street, zebra crossings where the
 * Ephe's cross, lane dashes, warm streetlights and blocky street trees
 * lined along the sidewalks. Ambient traffic keeps to the right lane.
 * `active=false` = construction site: traffic and lamp heads off.
 * Everything repeated uses InstancedMesh so a whole district costs a
 * handful of draw calls.
 */

const dummy = new THREE.Object3D();
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);
const rollQ = new THREE.Quaternion();

/** How close a car must be to a junction before the right-of-way check. */
const JUNCTION_LOOK = 3.2;
const CROSSWALK_BARS = [-1.65, -1.1, -0.55, 0, 0.55, 1.1, 1.65];

/** A corner through a intersection: a cubic that leaves one street's outgoing
 *  lane tangentially and arrives in the next one's incoming lane the same way. */
interface FleetBend {
  kind: "bend";
  k: number;
  curve: FleetCurve;
  /** The curve's own length — the turn is advanced by distance, not by clock. */
  length: number;
  /** The speed this corner allows; the car ramps toward it, never jumps to it. */
  speed: number;
  nextSeg: number;
  nextT: number;
  nextDir: 1 | -1;
  nodeX: number;
  nodeZ: number;
}

/** The dead-end turnaround: a half circle around the node, so a car that has
 *  nowhere to go comes back on the other side of the street instead of
 *  reversing on the spot. */
interface FleetArc {
  kind: "arc";
  k: number;
  length: number;
  speed: number;
  ux: number;
  uz: number;
  dir: 1 | -1;
  nodeX: number;
  nodeZ: number;
}

type FleetTurn = FleetBend | FleetArc;

/** What a car will do at the node it is driving toward. Decided early, so the
 *  brake belongs to the corner and not to the turn itself. */
interface FleetPlan {
  pick: FleetContinuation | null;
  speed: number;
  curve: FleetCurve | null;
}

interface FleetCar {
  lane: number;
  t: number;
  cruise: number;
  v: number;
  dir: 1 | -1;
  color: THREE.Color;
  /** A fleet of identical cars is a stamp. This one is ±8 %. */
  scale: number;
  /** Metres driven — what turns the wheels, so they spin with the car. */
  odometer: number;
  turn: FleetTurn | null;
  plan: FleetPlan | null;
  /** How long this car has been waiting at a junction mouth it cannot land in. */
  hold: number;
  /**
   * Set when a corner or a handover has just put this car at the entry of a
   * street, and cleared once it has driven a bumper's length into it. A car that
   * arrives where another one stands must be the one that gives way: measured on
   * the live fleet, 83 frames had two cars on the same spot, and the old
   * index-order tie-break let the lower-indexed arrival drive through.
   */
  arrived: boolean;
  /**
   * The heading the body is DRAWN with. It follows the pose it is on, but only
   * at a rate a car can turn (`FLEET_CORNER_YAW`): the corner that has to keep
   * the old shape leaves the street pointing at the node, and without this the
   * body snapped a full 90° in one frame — measured as the fleet's worst yaw
   * step, 1,57 rad. Limited, the same corner reads as a skid rather than a cut.
   */
  yaw: number;
}

const laneLength = (lane: StreetLine): number =>
  Math.max(Math.hypot(lane.x2 - lane.x1, lane.z2 - lane.z1), 0.001);

/**
 * What leaving `lane` at this node means: which street the car takes, how fast
 * that corner allows, and the curve it drives. A dead end plans no street and no
 * curve — the caller turns the car around on a half circle instead.
 *
 * The plan is asked for twice by design and cached the first time: once a
 * street-width before the node, so the braking happens on the straight, and once
 * at the node for a car that arrived there in a single long frame.
 */
function planCorner(
  lanes: StreetLine[],
  lengths: number[],
  lane: StreetLine,
  seg: number,
  nodeX: number,
  nodeZ: number,
  dir: 1 | -1,
  seed: number,
): FleetPlan {
  const len = lengths[seg]!;
  const ux = (lane.x2 - lane.x1) / len;
  const uz = (lane.z2 - lane.z1) / len;
  const fromX = nodeX + uz * FLEET_LANE_OFFSET * dir;
  const fromZ = nodeZ - ux * FLEET_LANE_OFFSET * dir;
  const pick = chooseContinuation(streetContinuations(lanes, seg, nodeX, nodeZ), seed);
  if (!pick) {
    // Nowhere to go: the half circle around the node, at the speed a circle of
    // one lane offset allows.
    return { pick: null, speed: turnAroundSpeed(), curve: null };
  }
  const next = lanes[pick.seg]!;
  const nlen = lengths[pick.seg]!;
  const nux = (next.x2 - next.x1) / nlen;
  const nuz = (next.z2 - next.z1) / nlen;
  const toX = next.x1 + (next.x2 - next.x1) * pick.entryT + nuz * FLEET_LANE_OFFSET * pick.dir;
  const toZ = next.z1 + (next.z2 - next.z1) * pick.entryT - nux * FLEET_LANE_OFFSET * pick.dir;
  if (isStraightOn(pick.angle)) {
    // No curve, no corner pace: the street goes on and the car keeps its speed.
    return { pick, speed: Infinity, curve: null };
  }
  const curve = cornerCurve(
    fromX,
    fromZ,
    ux * dir,
    uz * dir,
    toX,
    toZ,
    nux * pick.dir,
    nuz * pick.dir,
  );
  // A corner the two lane ends cannot be swept through without doubling back
  // keeps the shape that does not loop. This is the fleet's known gap: a proper
  // fix starts the turn before the node, which needs a junction model.
  const path = isDrivable(curve) ? curve : nodeCorner(fromX, fromZ, nodeX, nodeZ, toX, toZ);
  return { pick, speed: curvatureSpeed(path.curvature), curve: path };
}

/** Top of the measuring mast — the saturated end of the mapping height rail. */
const MAST_TOP = heightForComplexity(1);

/** Extruded side profile of one car body, in the car's local frame (length +X,
 *  height +Y), centred on the CAR_SHAPE body origin so the per-frame write
 *  stays a position, a yaw and a scale. A box cannot taper — this outline can:
 *  bumper, rising hood, flat beltline, kicked tail, and a wheel arch cut into
 *  the sill at every axle, so the tyre separates from the flank it used to be
 *  swallowed by. The bevel is the shoulder: one chamfer, not a step. */
function carBodyProfile(): THREE.ExtrudeGeometry {
  const { body, wheel } = CAR_SHAPE;
  const hl = body.w / 2;
  const yb = -0.19; // sill line: the rocker's bottom edge
  const arch = wheel.r + 0.05; // arch clears the tyre, the gap is the edge
  const s = new THREE.Shape();
  s.moveTo(-hl, -0.13);
  s.lineTo(-hl + 0.09, yb);
  s.absarc(-wheel.x, yb, arch, Math.PI, 0, true);
  s.lineTo(wheel.x - arch, yb);
  s.absarc(wheel.x, yb, arch, Math.PI, 0, true);
  s.lineTo(hl - 0.09, yb);
  s.lineTo(hl, -0.13);
  s.lineTo(hl, 0.02);
  s.lineTo(hl - 0.07, 0.06); // nose corner
  s.lineTo(0.3, 0.14); // hood, rising to the beltline
  s.lineTo(0.08, 0.17);
  s.lineTo(-0.56, 0.18); // flat deck to the tail
  s.lineTo(-hl + 0.07, 0.12);
  s.lineTo(-hl, 0.06); // tail corner
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: body.d,
    bevelEnabled: true,
    bevelThickness: 0.045,
    bevelSize: 0.05,
    bevelSegments: 1,
    curveSegments: 10,
  });
  geo.computeBoundingBox();
  const c = geo.boundingBox!.getCenter(new THREE.Vector3());
  geo.translate(-c.x, 0, -c.z);
  return geo;
}

/** The rocker band: the same sill, drawn as its own thin plate in front of the
 *  flank. It exists because the instance colour cannot stop halfway up a door
 *  — as a separate part it carries its own vertex colour (0.55) and, more than
 *  that, its own top edge: the beltline the fleet never had. */
function carSillBand(): THREE.ExtrudeGeometry {
  const { body, wheel } = CAR_SHAPE;
  const hl = body.w / 2;
  const yb = -0.19;
  const arch = wheel.r + 0.03;
  const s = new THREE.Shape();
  s.moveTo(-hl + 0.02, -0.06);
  s.lineTo(-hl + 0.11, yb);
  s.absarc(-wheel.x, yb, arch, Math.PI, 0, true);
  s.lineTo(wheel.x - arch, yb);
  s.absarc(wheel.x, yb, arch, Math.PI, 0, true);
  s.lineTo(hl - 0.11, yb);
  s.lineTo(hl - 0.02, -0.06);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: body.d + 0.014,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.012,
    bevelSegments: 1,
    curveSegments: 8,
  });
  geo.computeBoundingBox();
  const c = geo.boundingBox!.getCenter(new THREE.Vector3());
  geo.translate(-c.x, 0, -c.z);
  return geo;
}

/** One merged instance body: profile + sill band, vertex-coloured zone by zone
 *  (1.0 paint, 0.55 rocker) — multiplied with the per-instance livery, so the
 *  zones ride along with every coat the city hands out. Merged at build time
 *  into a single non-indexed BufferGeometry: one draw, no shared wall. */
function carBodyGeometry(): THREE.BufferGeometry {
  const parts: Array<[THREE.ExtrudeGeometry, number]> = [
    [carBodyProfile(), 1],
    [carSillBand(), 0.55],
  ];
  let total = 0;
  for (const [g] of parts) total += g.getAttribute("position").count;
  const position = new Float32Array(total * 3);
  const normal = new Float32Array(total * 3);
  const color = new Float32Array(total * 3);
  let off = 0;
  for (const [g, shade] of parts) {
    const p = g.getAttribute("position") as THREE.BufferAttribute;
    const n = g.getAttribute("normal") as THREE.BufferAttribute;
    position.set(p.array as Float32Array, off * 3);
    normal.set(n.array as Float32Array, off * 3);
    for (let i = 0; i < p.count; i++) {
      color[(off + i) * 3] = shade;
      color[(off + i) * 3 + 1] = shade;
      color[(off + i) * 3 + 2] = shade;
    }
    off += p.count;
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(normal, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(color, 3));
  return geo;
}

/** The greenhouse: one extruded profile with a raked A-pillar, a long roof and
 *  a raked C-pillar — a wedge, not a second brick. Its deep skirt hides inside
 *  the body so the two parts meet at a real edge (roof line, belt line) and
 *  never at a coincident face. */
function carCabinGeometry(): THREE.BufferGeometry {
  const { cabin } = CAR_SHAPE;
  const hh = cabin.h / 2;
  const s = new THREE.Shape();
  s.moveTo(-0.5, -hh - 0.12); // skirt, buried in the body
  s.lineTo(0.34, -hh - 0.12);
  s.lineTo(0.3, 0.02); // A-pillar, raked
  s.lineTo(0.12, hh - 0.02);
  s.lineTo(-0.22, hh); // long roof
  s.lineTo(-0.42, 0.0); // C-pillar, raked
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: cabin.d,
    bevelEnabled: true,
    bevelThickness: 0.035,
    bevelSize: 0.04,
    bevelSegments: 1,
    curveSegments: 4,
  });
  geo.computeBoundingBox();
  const c = geo.boundingBox!.getCenter(new THREE.Vector3());
  geo.translate(-c.x, 0, -c.z);
  return geo;
}

export function RoadSystem({
  layout,
  sidewalks = null,
  active = true,
}: {
  layout: DirLayout;
  sidewalks?: SidewalkNetwork | null;
  active?: boolean;
}) {
  const lang = useStore((s) => s.prefs.lang);
  // The mast explains the height that is on screen: complexity up close, the
  // picked channel's measure while the far-zoom heat grid draws it (see
  // city/heightAxis — the same decision the HUD key and the card make).
  const heatChannel = useStore((s) => s.heatChannel);
  const lodFar = useLodFar(layout.bounds);
  const surface = useWorldSurface();
  const roadData = useMemo(
    () =>
      layout.streets.flatMap((s) => {
        const length = Math.hypot(s.x2 - s.x1, s.z2 - s.z1);
        if (length < 3) return [];
        const ux = (s.x2 - s.x1) / length,
          uz = (s.z2 - s.z1) / length;
        return surfaceStreetSegments(surface, {
          ...s,
          x1: s.x1 - ux * 1.7,
          z1: s.z1 - uz * 1.7,
          x2: s.x2 + ux * 1.7,
          z2: s.z2 + uz * 1.7,
        });
      }),
    [layout, surface],
  );
  const roadRef = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = roadRef.current;
    if (!mesh) return;
    roadData.forEach((s, i) => {
      dummy.position.set((s.x1 + s.x2) / 2, 0.02, (s.z1 + s.z2) / 2);
      dummy.rotation.set(0, -Math.atan2(s.z2 - s.z1, s.x2 - s.x1), 0);
      dummy.scale.set(Math.hypot(s.x2 - s.x1, s.z2 - s.z1) + 0.04, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, surfaceMatrix(surface, dummy.matrix));
    });
    mesh.count = roadData.length;
    mesh.instanceMatrix.needsUpdate = true;
    dummy.scale.setScalar(1);
  }, [roadData, surface]);
  // ── Height measuring mast ────────────────────────────────────────────────
  // The skyline's height is a measurement (synthetic complexity on the
  // 2.2..34 rail of city/mapping), so the rail stands in the picture: a pole
  // at the plaza corner opposite the podium, ticks at 0 / .25 / .5 / .75 / 1
  // complexity, one bundled label. Empty levels get no mast.
  const mast = useMemo(() => {
    const hasData = layout.buildings.length > 0 || layout.blocks.length > 0;
    if (!hasData) return null;
    const r = Math.max(layout.plazaExtent, 12) + 2.6;
    return { x: layout.plazaCenter.x - r, z: layout.plazaCenter.z - r };
  }, [layout]);

  // ── Concrete curbs framing both sides of every street ───────────────────
  // Drawn from the walking graph's own kerb stretches, so the stone stops where
  // the sidewalk stops: at the mouth of every junction, and along every plaza
  // lane the crowd is given. Without a network (nothing to walk on yet) the
  // streets still get their full-length kerbs.
  const curbData = useMemo(() => {
    const items: Array<{ x: number; z: number; rotY: number; len: number }> = [];
    const segments = () =>
      items.flatMap((c) => {
        const ux = Math.cos(c.rotY),
          uz = -Math.sin(c.rotY);
        return surfaceStreetSegments(surface, {
          x1: c.x - (ux * c.len) / 2,
          z1: c.z - (uz * c.len) / 2,
          x2: c.x + (ux * c.len) / 2,
          z2: c.z + (uz * c.len) / 2,
        }).map((s) => ({
          x: (s.x1 + s.x2) / 2,
          z: (s.z1 + s.z2) / 2,
          rotY: c.rotY,
          len: Math.hypot(s.x2 - s.x1, s.z2 - s.z1),
        }));
      });
    if (sidewalks) {
      for (const k of sidewalks.kerbs) {
        const len = Math.hypot(k.x2 - k.x1, k.z2 - k.z1);
        if (len < 0.5) continue;
        items.push({
          x: (k.x1 + k.x2) / 2,
          z: (k.z1 + k.z2) / 2,
          rotY: -Math.atan2(k.z2 - k.z1, k.x2 - k.x1),
          len,
        });
      }
      return segments();
    }
    for (const s of layout.streets) {
      const len = Math.hypot(s.x2 - s.x1, s.z2 - s.z1);
      if (len < 3) continue;
      const ux = (s.x2 - s.x1) / len;
      const uz = (s.z2 - s.z1) / len;
      const rotY = -Math.atan2(uz, ux);
      const nx = -uz;
      const nz = ux;
      const mx = (s.x1 + s.x2) / 2;
      const mz = (s.z1 + s.z2) / 2;
      // stop short of the intersection so crossings stay open
      const curbLen = len;
      for (const side of [1, -1]) {
        items.push({
          x: mx + nx * CURB_OFFSET * side,
          z: mz + nz * CURB_OFFSET * side,
          rotY,
          len: curbLen,
        });
      }
    }
    return segments();
  }, [layout, sidewalks, surface]);

  const curbRef = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = curbRef.current;
    if (!mesh) return;
    curbData.forEach((c, i) => {
      dummy.position.set(c.x, 0.04, c.z);
      dummy.rotation.set(0, c.rotY, 0);
      dummy.scale.set(c.len, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, surfaceMatrix(surface, dummy.matrix));
    });
    mesh.count = curbData.length;
    mesh.instanceMatrix.needsUpdate = true;
    dummy.scale.setScalar(1);
  }, [curbData, surface]);

  // ── Zebra stripes at the network's crosswalks ───────────────────────────
  const zebraData = useMemo(() => {
    const items: Array<{ x: number; z: number; rotY: number }> = [];
    for (const cw of sidewalks?.crosswalks ?? []) {
      const ux = Math.cos(cw.rotY);
      const uz = -Math.sin(cw.rotY);
      const nx = -uz;
      const nz = ux;
      for (const k of CROSSWALK_BARS) {
        items.push({ x: cw.x + nx * k, z: cw.z + nz * k, rotY: cw.rotY });
      }
    }
    return items;
  }, [sidewalks]);

  const zebraRef = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = zebraRef.current;
    if (!mesh) return;
    zebraData.forEach((z, i) => {
      dummy.position.set(z.x, 0.055, z.z);
      dummy.rotation.set(0, z.rotY, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, surfaceMatrix(surface, dummy.matrix));
    });
    mesh.count = zebraData.length;
    mesh.instanceMatrix.needsUpdate = true;
  }, [zebraData, surface]);

  // ── Lane dashes along every street line ─────────────────────────────────
  const dashData = useMemo(() => {
    const items: Array<{ x: number; z: number; rotY: number }> = [];
    for (const line of layout.streets) {
      const dx = line.x2 - line.x1;
      const dz = line.z2 - line.z1;
      const len = Math.hypot(dx, dz);
      if (len < 4) continue;
      const dirX = dx / len;
      const dirZ = dz / len;
      const rotY = -Math.atan2(dirZ, dirX);
      const count = Math.floor(len / 2.6);
      for (let i = 1; i < count; i++) {
        const t = i / count;
        items.push({
          x: line.x1 + dx * t + dirX * 1.2,
          z: line.z1 + dz * t + dirZ * 1.2,
          rotY,
        });
      }
    }
    return items;
  }, [layout]);

  const dashRef = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = dashRef.current;
    if (!mesh) return;
    dashData.forEach((d, i) => {
      dummy.position.set(d.x, 0.06, d.z);
      dummy.rotation.set(0, d.rotY, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, surfaceMatrix(surface, dummy.matrix));
    });
    mesh.count = dashData.length;
    mesh.instanceMatrix.needsUpdate = true;
  }, [dashData, surface]);

  // ── Streetlights lined along the sidewalks ──────────────────────────────
  const lampData = useMemo(() => {
    const items: Array<{ x: number; z: number; rotY: number }> = [];
    layout.streets.forEach((s, li) => {
      const len = Math.hypot(s.x2 - s.x1, s.z2 - s.z1);
      if (len < 6) return;
      const ux = (s.x2 - s.x1) / len;
      const uz = (s.z2 - s.z1) / len;
      const nx = -uz;
      const nz = ux;
      const rotY = -Math.atan2(uz, ux);
      const count = Math.floor(len / 16);
      for (let i = 0; i <= count; i++) {
        const side = (li + i) % 2 === 0 ? 1 : -1;
        const t = count > 0 ? i / count : 0.5;
        const jitter = (((li * 73 + i * 31) % 100) / 100 - 0.5) * 2.4;
        const t2 = Math.min(Math.max(t + jitter / len, 0.08), 0.92);
        items.push({
          x: s.x1 + (s.x2 - s.x1) * t2 + nx * (CURB_OFFSET + 0.2) * side,
          z: s.z1 + (s.z2 - s.z1) * t2 + nz * (CURB_OFFSET + 0.2) * side,
          rotY,
        });
      }
    });
    return items.slice(0, 160);
  }, [layout]);

  const poleRef = useRef<THREE.InstancedMesh>(null);
  const headRef = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const poles = poleRef.current;
    const heads = headRef.current;
    if (!poles || !heads) return;
    lampData.forEach((l, i) => {
      dummy.rotation.set(0, l.rotY, 0);
      dummy.position.set(l.x, 1.5, l.z);
      dummy.updateMatrix();
      poles.setMatrixAt(i, surfaceMatrix(surface, dummy.matrix));
      dummy.position.set(l.x, 3.1, l.z);
      dummy.updateMatrix();
      heads.setMatrixAt(i, surfaceMatrix(surface, dummy.matrix));
    });
    poles.count = lampData.length;
    heads.count = lampData.length;
    poles.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
  }, [lampData, surface]);

  // ── Blocky street trees along the sidewalks ─────────────────────────────
  const treeData = useMemo(() => {
    const items: Array<{ x: number; z: number; rotY: number; s: number }> = [];
    layout.streets.forEach((s, li) => {
      const len = Math.hypot(s.x2 - s.x1, s.z2 - s.z1);
      if (len < 8) return;
      const ux = (s.x2 - s.x1) / len;
      const uz = (s.z2 - s.z1) / len;
      const nx = -uz;
      const nz = ux;
      const count = Math.floor(len / 10);
      for (let i = 0; i < count; i++) {
        const side = (li + i) % 2 === 0 ? -1 : 1;
        const t = (i + 0.5) / count;
        const jitter = (((li * 41 + i * 17) % 100) / 100 - 0.5) * 0.7;
        items.push({
          x: s.x1 + (s.x2 - s.x1) * t + nx * (CURB_OFFSET + 0.75) * side + nx * jitter,
          z: s.z1 + (s.z2 - s.z1) * t + nz * (CURB_OFFSET + 0.75) * side + nz * jitter,
          rotY: (((li * 97 + i * 53) % 100) / 100) * Math.PI * 2,
          s: 0.8 + ((li * 29 + i * 13) % 45) / 100,
        });
      }
    });
    return items.slice(0, 140);
  }, [layout]);

  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const crownRef = useRef<THREE.InstancedMesh>(null);
  const crownTopRef = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const trunks = trunkRef.current;
    const crowns = crownRef.current;
    const tops = crownTopRef.current;
    if (!trunks || !crowns || !tops) return;
    treeData.forEach((t, i) => {
      dummy.position.set(t.x, 0.45 * t.s, t.z);
      dummy.rotation.set(0, t.rotY, 0);
      dummy.scale.setScalar(t.s);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, surfaceMatrix(surface, dummy.matrix));
      dummy.position.set(t.x, 1.5 * t.s, t.z);
      dummy.updateMatrix();
      crowns.setMatrixAt(i, surfaceMatrix(surface, dummy.matrix));
      dummy.position.set(t.x, 2.28 * t.s, t.z);
      dummy.updateMatrix();
      tops.setMatrixAt(i, surfaceMatrix(surface, dummy.matrix));
    });
    trunks.count = treeData.length;
    crowns.count = treeData.length;
    tops.count = treeData.length;
    trunks.instanceMatrix.needsUpdate = true;
    crowns.instanceMatrix.needsUpdate = true;
    tops.instanceMatrix.needsUpdate = true;
    dummy.scale.setScalar(1);
  }, [treeData, surface]);

  // ── Ambient traffic keeping to the right lane ───────────────────────────
  const carData = useMemo(() => {
    const lanes = [...layout.streets].sort((a, b) => {
      const la = Math.hypot(a.x2 - a.x1, a.z2 - a.z1);
      const lb = Math.hypot(b.x2 - b.x1, b.z2 - b.z1);
      return lb - la;
    });
    // The cab and the bus work two of these streets. Background traffic stays
    // off them: a car cannot see a vehicle owned by another component, and a
    // queue driving through the bus would give that away every few seconds.
    // Derive the transit from the UNSORTED list: `deriveTransit` picks the cab
    // street with `find`, so a sorted copy can reserve a different street than
    // the one the cab actually drives.
    const transit = deriveTransit(layout.streets);
    const reserved = new Set<StreetLine | undefined>([transit?.taxiLane, transit?.busLane]);
    const withoutTransit = lanes.filter((lane) => !reserved.has(lane));
    const drivable = withoutTransit.length > 1 ? withoutTransit : lanes;
    const items: FleetCar[] = [];
    for (let i = 0; i < Math.min(24, drivable.length * 2); i++) {
      const cruise = 3.5 + ((i * 13) % 40) / 10;
      const first = drivable[i % Math.max(1, drivable.length)]!;
      const flen = Math.max(Math.hypot(first.x2 - first.x1, first.z2 - first.z1), 0.001);
      const fdir = i % 2 === 0 ? 1 : -1;
      items.push({
        lane: i % Math.max(1, drivable.length),
        t: (i * 0.37) % 1,
        cruise,
        v: cruise,
        dir: i % 2 === 0 ? 1 : -1,
        color: new THREE.Color(FLEET_LIVERY[i % FLEET_LIVERY.length]!),
        scale: 0.92 + ((i * 7) % 17) / 100,
        odometer: 0,
        turn: null,
        plan: null,
        hold: 0,
        arrived: false,
        yaw: -Math.atan2(
          ((first.z2 - first.z1) / flen) * fdir,
          ((first.x2 - first.x1) / flen) * fdir,
        ),
      });
    }
    return { lanes: drivable, lengths: drivable.map(laneLength), items };
  }, [layout]);

  const carRef = useRef<THREE.InstancedMesh>(null);
  const cabinRef = useRef<THREE.InstancedMesh>(null);
  const wheelRef = useRef<THREE.InstancedMesh>(null);
  /** A cylinder laid on its side once: its axle is the car's local Z, so the
   *  per-frame roll is a rotation about that axis and nothing else. */
  const wheelGeo = useMemo(
    () =>
      new THREE.CylinderGeometry(
        CAR_SHAPE.wheel.r,
        CAR_SHAPE.wheel.r,
        CAR_SHAPE.wheel.t,
        12,
      ).rotateX(Math.PI / 2),
    [],
  );
  /** Built once from CAR_SHAPE and shared by the fleet — the instance matrix
   *  carries position, yaw and the ±8 % scale, exactly as it did for the box. */
  const carBodyGeo = useMemo(() => carBodyGeometry(), []);
  const carCabinGeo = useMemo(() => carCabinGeometry(), []);
  const carSettledRef = useRef(false);
  useLayoutEffect(() => {
    const mesh = carRef.current;
    if (!mesh) return;
    carData.items.forEach((c, i) => mesh.setColorAt(i, c.color));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [carData]);

  /** Advance + re-place the fleet by `dt` seconds. `dt = 0` writes the layout
   *  without moving anything — the frame reduced motion holds. */
  const stepCars = (dt: number): void => {
    const mesh = carRef.current;
    const cabins = cabinRef.current;
    const wheels = wheelRef.current;
    if (!mesh || !cabins) return;
    const cars = carData.items;
    const lanes = carData.lanes;
    const lengths = carData.lengths;

    /** Where a car stands the moment its corner is over — for a car that is not
     *  in one, where it stands now. */
    const landingOf = (o: FleetCar): { lane: number; dir: 1 | -1; t: number } => {
      const turn = o.turn;
      if (turn && turn.kind === "bend")
        return { lane: turn.nextSeg, dir: turn.nextDir, t: turn.nextT };
      if (turn) return { lane: o.lane, dir: o.dir > 0 ? -1 : 1, t: o.dir > 0 ? 1 : 0 };
      return { lane: o.lane, dir: o.dir, t: o.t };
    };

    /**
     * Is there room at the far end of this manoeuvre? A car that starts a corner
     * it cannot land in arrives inside the queue waiting there — the live fleet
     * measured 250 frames of cars standing 1,2 units apart on one lane after the
     * corners got longer. Drivers do not enter a junction they cannot clear.
     */
    const entryFree = (lane: number, dir: 1 | -1, t: number, self: FleetCar): boolean => {
      const len = lengths[lane]!;
      for (const o of cars) {
        if (o === self) continue;
        const l = landingOf(o);
        if (l.lane !== lane || l.dir !== dir) continue;
        const g = (l.t - t) * len * dir;
        if (g > -0.6 && g < FLEET_GAP) return false;
      }
      return true;
    };

    for (let i = 0; i < cars.length; i++) {
      const c = cars[i]!;
      const lane = lanes[c.lane];
      if (!lane) continue;
      const len = lengths[c.lane]!;

      // A corner is a scripted pose: no following, no new decisions until done.
      // It is advanced by DISTANCE — the car's own ramped speed over the curve's
      // length. The clock-driven version that shipped ran a smoothstep over a
      // fixed duration, which stopped the car at both ends of every corner and
      // let it dash through the middle: measured on the live fleet, ground speed
      // fell to 0,02× and rose to 1,75× inside one corner, and the nose snapped
      // 90° in a single frame because the curve's first tangent pointed at the
      // node instead of along the road.
      if (c.turn) {
        const turn = c.turn;
        c.v = ramp(c.v, turn.speed, turn.speed < c.v ? FLEET_BRAKE : FLEET_ACCEL, dt);
        const move = c.v * dt;
        c.odometer += move;
        turn.k = Math.min(1, turn.k + move / turn.length);
        if (turn.k >= 1) {
          if (turn.kind === "bend") {
            c.lane = turn.nextSeg;
            c.t = turn.nextT;
            c.dir = turn.nextDir;
            c.arrived = true;
          } else {
            c.dir = turn.dir > 0 ? -1 : 1;
            c.t = turn.dir > 0 ? 1 : 0;
            c.arrived = true;
          }
          c.turn = null;
          c.plan = null;
        }
        continue;
      }

      if (c.arrived && (c.dir > 0 ? c.t : 1 - c.t) * len > FLEET_GAP) c.arrived = false;

      // The nearest car on this side of the street: keep a real gap.
      let gap = Infinity;
      let aheadSpeed = 0;
      for (let j = 0; j < cars.length; j++) {
        if (j === i) continue;
        const o = cars[j]!;
        if (o.lane !== c.lane || o.dir !== c.dir) continue;
        const g = (o.t - c.t) * len * c.dir;
        if (g > 0.01 && g < gap) {
          gap = g;
          aheadSpeed = o.turn ? 0 : o.v;
        } else if (Math.abs(g) <= 0.01) {
          // Two cars on the same spot. Whoever got there later gives way — the
          // arrival from a corner if there is one, otherwise the higher fleet
          // index — so exactly one of them moves and neither drives through.
          const yields = c.arrived !== o.arrived ? c.arrived : j < i;
          if (yields) {
            gap = 0;
            aheadSpeed = 0;
          }
        }
      }
      let target = gap < followLook(c.cruise) ? followSpeed(c.cruise, gap, aheadSpeed) : c.cruise;

      // The corner is chosen one braking distance before the node and cached on
      // the car, so the brake belongs to the turn while the car is still on the
      // straight. The band is solved for the tightest corner the network has —
      // the turnaround — so whichever corner this is, the speed is already down
      // when the nose swings. Deciding AT the node and stepping the speed there
      // is what made the fleet lurch: up to 473 units/s² in one frame.
      const distToNode = (c.dir > 0 ? 1 - c.t : c.t) * len;
      const nodeX = c.dir > 0 ? lane.x2 : lane.x1;
      const nodeZ = c.dir > 0 ? lane.z2 : lane.z1;
      if (distToNode < cornerLook(c.cruise, turnAroundSpeed())) {
        c.plan ??= planCorner(lanes, lengths, lane, c.lane, nodeX, nodeZ, c.dir, c.odometer);
        const limit = Math.min(c.cruise, c.plan.speed);
        if (limit < target) target = limit;
      } else {
        c.plan = null;
      }

      // Right of way at a junction: when two cars arrive at the same node, the
      // closer one goes first, and equal distances are broken by fleet index.
      // The rule is a strict order, so two cars can never wait for each other.
      if (target > 0 && distToNode < JUNCTION_LOOK) {
        for (let j = 0; j < cars.length; j++) {
          if (j === i) continue;
          const o = cars[j]!;
          const ol = lanes[o.lane];
          if (!ol) continue;
          const otherX = o.turn ? o.turn.nodeX : o.dir > 0 ? ol.x2 : ol.x1;
          const otherZ = o.turn ? o.turn.nodeZ : o.dir > 0 ? ol.z2 : ol.z1;
          if (Math.hypot(otherX - nodeX, otherZ - nodeZ) > 0.9) continue;
          const otherDist = o.turn ? 0 : (o.dir > 0 ? 1 - o.t : o.t) * lengths[o.lane]!;
          if (o.turn || otherDist < distToNode - 0.3) {
            target = 0;
            break;
          }
          if (Math.abs(otherDist - distToNode) <= 0.3 && j < i) {
            target = 0;
            break;
          }
        }
      }

      c.v = ramp(c.v, target, target < c.v ? FLEET_BRAKE : FLEET_ACCEL, dt);
      const step = c.v * dt;
      if (step > 0) {
        c.odometer += step;
        c.t += (step / len) * c.dir;
      }
      if (c.t > 0 && c.t < 1) continue;

      // End of the segment: drive the corner planned a street-width back, and
      // turn around on a half circle where the network offers nothing. Never flip
      // direction in place — that was the one motion that made the fleet read as
      // a toy.
      const atEnd = c.t >= 1;
      c.t = atEnd ? 1 : 0;
      const plan =
        c.plan ?? planCorner(lanes, lengths, lane, c.lane, nodeX, nodeZ, c.dir, c.odometer);
      c.plan = null;
      const land = plan.pick
        ? { lane: plan.pick.seg, dir: plan.pick.dir, t: plan.pick.entryT }
        : { lane: c.lane, dir: (c.dir > 0 ? -1 : 1) as 1 | -1, t: c.dir > 0 ? 1 : 0 };
      if (!entryFree(land.lane, land.dir, land.t, c) && c.hold < FLEET_HOLD_LIMIT) {
        // Nowhere to land: hold at the mouth of the junction, brake modulated,
        // and take the corner the frame the room appears — or the frame the wait
        // runs out, because four cars each waiting for the next is a frozen city.
        c.hold += dt;
        c.v = ramp(c.v, 0, FLEET_BRAKE, dt);
        continue;
      }
      c.hold = 0;
      const cornerSpeedOf = Math.min(c.cruise, plan.speed);
      if (plan.pick && plan.curve) {
        const pick = plan.pick;
        c.turn = {
          kind: "bend",
          k: 0,
          curve: plan.curve,
          length: plan.curve.length,
          speed: cornerSpeedOf,
          nextSeg: pick.seg,
          nextT: pick.entryT,
          nextDir: pick.dir,
          nodeX,
          nodeZ,
        };
      } else if (plan.pick) {
        // Straight on: the next street begins where this one ends, so the car
        // simply moves onto it — no corner, no pace to give up.
        c.lane = plan.pick.seg;
        c.t = plan.pick.entryT;
        c.dir = plan.pick.dir;
        c.arrived = true;
      } else {
        const ux = (lane.x2 - lane.x1) / len;
        const uz = (lane.z2 - lane.z1) / len;
        c.turn = {
          kind: "arc",
          k: 0,
          length: turnAroundLength(),
          speed: cornerSpeedOf,
          ux,
          uz,
          dir: c.dir,
          nodeX,
          nodeZ,
        };
      }
    }

    cars.forEach((c, i) => {
      const lane = lanes[c.lane];
      if (!lane) return;
      let x: number;
      let z: number;
      let rotY: number;
      const turn = c.turn;
      if (turn) {
        // `turn.k` already advances by distance, so the pose is read at k
        // directly. The smoothstep that used to sit here is what emptied the
        // corners: its derivative is zero at both ends, so every car stopped at
        // the corner mouth and dashed through the middle.
        if (turn.kind === "bend") {
          const p = curveAt(turn.curve, turn.k);
          x = p.x;
          z = p.z;
          rotY = -Math.atan2(p.tz, p.tx);
        } else {
          const theta = turn.k * Math.PI;
          const cos = Math.cos(theta);
          const sin = Math.sin(theta);
          const rx = turn.uz * turn.dir;
          const rz = -turn.ux * turn.dir;
          x = turn.nodeX + FLEET_LANE_OFFSET * (cos * rx + sin * turn.ux * turn.dir);
          z = turn.nodeZ + FLEET_LANE_OFFSET * (cos * rz + sin * turn.uz * turn.dir);
          const tx = -sin * rx + cos * turn.ux * turn.dir;
          const tz = -sin * rz + cos * turn.uz * turn.dir;
          rotY = -Math.atan2(tz, tx);
        }
      } else {
        const len = lengths[c.lane] ?? laneLength(lane);
        const ux = (lane.x2 - lane.x1) / len;
        const uz = (lane.z2 - lane.z1) / len;
        x = lane.x1 + (lane.x2 - lane.x1) * c.t + uz * FLEET_LANE_OFFSET * c.dir;
        z = lane.z1 + (lane.z2 - lane.z1) * c.t - ux * FLEET_LANE_OFFSET * c.dir;
        rotY = -Math.atan2(uz * c.dir, ux * c.dir);
      }
      const bodyScale = c.scale;
      // The body's own nose points where it is going, but only as fast as a car
      // turns; the pose it rides can change heading faster than that.
      c.yaw = slewYaw(c.yaw, rotY, FLEET_CORNER_YAW * dt);
      dummy.position.set(x, CAR_SHAPE.body.y * bodyScale, z);
      dummy.rotation.set(0, c.yaw, 0);
      dummy.scale.setScalar(bodyScale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, surfaceMatrix(surface, dummy.matrix));
      dummy.position.set(x, CAR_SHAPE.cabin.y * bodyScale, z);
      dummy.updateMatrix();
      cabins.setMatrixAt(i, surfaceMatrix(surface, dummy.matrix));
      if (wheels) {
        // Four wheels per car, each at the car's own corners. The wheel and
        // the car share a yaw, so forward roll is always the same local sign —
        // passing `dir` here spun them backwards on every return trip.
        const roll = wheelRoll(c.odometer, 1, CAR_SHAPE.wheel.r * bodyScale);
        const cos = Math.cos(c.yaw);
        const sin = Math.sin(c.yaw);
        for (let w = 0; w < 4; w++) {
          const along = w < 2 ? CAR_SHAPE.wheel.x : -CAR_SHAPE.wheel.x;
          const across = w % 2 === 0 ? CAR_SHAPE.wheel.z : -CAR_SHAPE.wheel.z;
          dummy.position.set(
            x + (along * cos + across * sin) * bodyScale,
            CAR_SHAPE.wheel.y * bodyScale,
            z + (-along * sin + across * cos) * bodyScale,
          );
          dummy.rotation.set(0, 0, 0);
          dummy.quaternion
            .setFromAxisAngle(AXIS_Y, c.yaw)
            .multiply(rollQ.setFromAxisAngle(AXIS_Z, roll));
          dummy.scale.setScalar(bodyScale);
          dummy.updateMatrix();
          wheels.setMatrixAt(i * 4 + w, surfaceMatrix(surface, dummy.matrix));
        }
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
    cabins.instanceMatrix.needsUpdate = true;
    if (wheels) wheels.instanceMatrix.needsUpdate = true;
  };

  useFrame((_, delta) => {
    // cars are hidden on the construction site — skip the whole simulation
    if (!active) return;
    // Reduced motion: the fleet stands where it was placed, spread along the
    // lanes. A parked city still reads as a city; a moving one says nothing
    // a still one does not.
    if (reducedSettle(carSettledRef, () => stepCars(0))) return;
    stepCars(delta);
  });

  const carCount = carData.items.length;

  return (
    <group>
      {/* Street asphalt strips between plots */}
      <instancedMesh
        ref={roadRef}
        args={[undefined, undefined, Math.max(1, roadData.length)]}
        frustumCulled={false}
      >
        <boxGeometry args={[1, 0.05, 3.8]} />
        <meshStandardMaterial color={ENV.road} roughness={0.96} />
      </instancedMesh>

      {/* Concrete curbs framing the sidewalks */}
      <instancedMesh
        ref={curbRef}
        args={[undefined, undefined, Math.max(1, curbData.length)]}
        frustumCulled={false}
      >
        <boxGeometry args={[1, 0.08, 0.55]} />
        <meshStandardMaterial color={ENV.curb} roughness={0.92} />
      </instancedMesh>

      {/* Zebra crossings */}
      <instancedMesh
        ref={zebraRef}
        args={[undefined, undefined, Math.max(1, zebraData.length)]}
        frustumCulled={false}
      >
        <boxGeometry args={[2.6, 0.03, 0.45]} />
        <meshStandardMaterial color={ENV.crosswalk} roughness={0.85} />
      </instancedMesh>

      {/* Lane dashes */}
      <instancedMesh
        ref={dashRef}
        args={[undefined, undefined, Math.max(1, dashData.length)]}
        frustumCulled={false}
      >
        <boxGeometry args={[1.1, 0.04, 0.3]} />
        <meshBasicMaterial color={ENV.laneDash} toneMapped={false} />
      </instancedMesh>

      {/* Streetlights */}
      <instancedMesh
        ref={poleRef}
        args={[undefined, undefined, Math.max(1, lampData.length)]}
        frustumCulled={false}
      >
        <cylinderGeometry args={[0.05, 0.08, 3, 6]} />
        <meshStandardMaterial color="#2b3346" roughness={0.6} />
      </instancedMesh>
      <instancedMesh
        ref={headRef}
        args={[undefined, undefined, Math.max(1, lampData.length)]}
        frustumCulled={false}
        visible={active}
      >
        <sphereGeometry args={[0.17, 8, 8]} />
        <meshBasicMaterial color={ENV.streetlight} toneMapped={false} />
      </instancedMesh>

      {/* Blocky street trees — trunk, crown, crown top */}
      <instancedMesh
        ref={trunkRef}
        args={[undefined, undefined, Math.max(1, treeData.length)]}
        frustumCulled={false}
      >
        <boxGeometry args={[0.2, 0.9, 0.2]} />
        <meshStandardMaterial color="#4a3b28" roughness={0.95} />
      </instancedMesh>
      <instancedMesh
        ref={crownRef}
        args={[undefined, undefined, Math.max(1, treeData.length)]}
        frustumCulled={false}
      >
        <boxGeometry args={[1.25, 1.1, 1.25]} />
        <meshStandardMaterial color="#2f6b50" roughness={0.9} />
      </instancedMesh>
      <instancedMesh
        ref={crownTopRef}
        args={[undefined, undefined, Math.max(1, treeData.length)]}
        frustumCulled={false}
      >
        <boxGeometry args={[0.8, 0.75, 0.8]} />
        <meshStandardMaterial color="#3a7a5c" roughness={0.9} />
      </instancedMesh>

      {/* Traffic — one merged CAR_SHAPE-derived body profile (nose, hood,
          beltline, wheel arches, rocker band in vertex colours), a greenhouse
          cabin and four wheels per car. The wheels are one instanced mesh
          whose geometry is laid on its side once, so a per-frame write is a
          position, a yaw and a roll. */}
      <instancedMesh
        ref={carRef}
        args={[carBodyGeo, undefined, Math.max(1, carCount)]}
        frustumCulled={false}
        visible={active}
        name="fleet-body"
      >
        <meshStandardMaterial roughness={0.42} metalness={0.16} vertexColors />
      </instancedMesh>
      <instancedMesh
        ref={cabinRef}
        args={[carCabinGeo, undefined, Math.max(1, carCount)]}
        frustumCulled={false}
        visible={active}
      >
        <meshStandardMaterial color={ENV.road} roughness={0.3} metalness={0.4} />
      </instancedMesh>
      <instancedMesh
        ref={wheelRef}
        args={[wheelGeo, undefined, Math.max(1, carCount) * 4]}
        frustumCulled={false}
        visible={active}
      >
        <meshStandardMaterial color="#14181b" roughness={0.85} />
      </instancedMesh>

      {/* The height rail, standing in the picture — see the mast memo above */}
      {mast && (
        <SurfaceAnchor x={mast.x} z={mast.z}>
          <group position={[mast.x, 0, mast.z]}>
            <mesh position={[0, MAST_TOP / 2, 0]} raycast={() => null}>
              <boxGeometry args={[0.14, MAST_TOP, 0.14]} />
              <meshStandardMaterial color="#3a4a68" roughness={0.7} />
            </mesh>
            {COMPLEXITY_TICKS.map((c) => (
              <mesh key={c} position={[0, heightForComplexity(c), 0]} raycast={() => null}>
                <boxGeometry args={[0.95, 0.09, 0.14]} />
                <meshBasicMaterial color={ENV.plotEdge} toneMapped={false} />
              </mesh>
            ))}
            {/* The print is a screen size, not a world size. Measured on this
                machine in a local headless browser (not shipped): at the
                overview pose `distanceFactor` put the plate at 0,295 scale, so
                the declared 11 px arrived as 3,25 px. On a 1× screen the best
                coverage in the field was 0,64 — no pixel reached its declared
                colour. The glyph core against the plate measured 3,01:1, and
                taking every ink-carrying pixel of the field instead measured
                1,64:1; at that median coverage no ink/plate pair at all clears
                2,54:1, so colour is not the lever here. The label keeps its
                solid plate (Beschluss 10.10.: no glaze on world labels) and
                prints at its declared 11 px at every distance — measured 5,55:1
                on a 1× screen, 7,31:1 on a 2× screen, where the core median is
                the declared colour exactly. The plate is a measurement, not a
                target: `pointer-events: none` is already on `.cf-mast`, and
                drei's wrapper needs it too, or the chip eats the camera drag it
                stands in. */}
            <Html
              center
              position={[1.6, MAST_TOP / 2 + 2, 0]}
              zIndexRange={[8, 0]}
              style={{ pointerEvents: "none" }}
            >
              <div className="cf-mast">
                <div className="cf-mast-title">{t(lang, heightAxisKey(lodFar, heatChannel))}</div>
                <div className="cf-mast-ticks">
                  {[...COMPLEXITY_TICKS].reverse().map((c) => (
                    <div key={c}>{formatDecimal(lang, c, 2)}</div>
                  ))}
                </div>
                <div className="cf-mast-title cf-mast-roof-note">{t(lang, "hud.roofFindings")}</div>
              </div>
            </Html>
          </group>
        </SurfaceAnchor>
      )}
    </group>
  );
}
