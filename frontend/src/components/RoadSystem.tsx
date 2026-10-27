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
  FLEET_LOOK,
  chooseContinuation,
  followSpeed,
  streetContinuations,
  turnDuration,
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

const LANE_OFFSET = 0.95; // car center offset from the street centerline
/** How close a car must be to a junction before the right-of-way check. */
const JUNCTION_LOOK = 3.2;
const CROSSWALK_BARS = [-1.65, -1.1, -0.55, 0, 0.55, 1.1, 1.65];

/** A smooth corner: a quadratic curve from the outgoing end of one street,
 *  through the junction, to the entry lane of the next. */
interface FleetBend {
  kind: "bend";
  k: number;
  dur: number;
  speed: number;
  fromX: number;
  fromZ: number;
  controlX: number;
  controlZ: number;
  toX: number;
  toZ: number;
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
  dur: number;
  speed: number;
  centerX: number;
  centerZ: number;
  ux: number;
  uz: number;
  dir: 1 | -1;
  nodeX: number;
  nodeZ: number;
}

type FleetTurn = FleetBend | FleetArc;

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
}

const laneLength = (lane: StreetLine): number =>
  Math.max(Math.hypot(lane.x2 - lane.x1, lane.z2 - lane.z1), 0.001);

/** Top of the measuring mast — the saturated end of the mapping height rail. */
const MAST_TOP = heightForComplexity(1);

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

    for (let i = 0; i < cars.length; i++) {
      const c = cars[i]!;
      const lane = lanes[c.lane];
      if (!lane) continue;
      const len = lengths[c.lane]!;

      // A corner is a scripted pose: no following, no new decisions until done.
      if (c.turn) {
        const turn = c.turn;
        turn.k = Math.min(1, turn.k + dt / turn.dur);
        c.odometer += turn.speed * dt;
        if (turn.k >= 1) {
          if (turn.kind === "bend") {
            c.lane = turn.nextSeg;
            c.t = turn.nextT;
            c.dir = turn.nextDir;
          } else {
            c.dir = turn.dir > 0 ? -1 : 1;
            c.t = turn.dir > 0 ? 1 : 0;
          }
          c.turn = null;
        }
        continue;
      }

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
        }
      }
      let target = gap < FLEET_LOOK ? followSpeed(c.cruise, gap, aheadSpeed) : c.cruise;

      // Right of way at a junction: when two cars arrive at the same node, the
      // closer one goes first, and equal distances are broken by fleet index.
      // The rule is a strict order, so two cars can never wait for each other.
      if (target > 0) {
        const distToNode = (c.dir > 0 ? 1 - c.t : c.t) * len;
        if (distToNode < JUNCTION_LOOK) {
          const nodeX = c.dir > 0 ? lane.x2 : lane.x1;
          const nodeZ = c.dir > 0 ? lane.z2 : lane.z1;
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
      }

      c.v = ramp(c.v, target, target < c.v ? FLEET_BRAKE : FLEET_ACCEL, dt);
      const step = c.v * dt;
      if (step > 0) {
        c.odometer += step;
        c.t += (step / len) * c.dir;
      }
      if (c.t > 0 && c.t < 1) continue;

      // End of the segment: follow the network where it continues, and turn
      // around on a half circle where it does not. Never flip direction in
      // place — that was the one motion that made the fleet read as a toy.
      const atEnd = c.t >= 1;
      c.t = atEnd ? 1 : 0;
      const nodeX = atEnd ? lane.x2 : lane.x1;
      const nodeZ = atEnd ? lane.z2 : lane.z1;
      const ux = (lane.x2 - lane.x1) / len;
      const uz = (lane.z2 - lane.z1) / len;
      const fromX = lane.x1 + (lane.x2 - lane.x1) * c.t + uz * LANE_OFFSET * c.dir;
      const fromZ = lane.z1 + (lane.z2 - lane.z1) * c.t - ux * LANE_OFFSET * c.dir;
      const pick = chooseContinuation(streetContinuations(lanes, c.lane, nodeX, nodeZ), c.odometer);
      if (pick) {
        const next = lanes[pick.seg]!;
        const nlen = lengths[pick.seg]!;
        const nux = (next.x2 - next.x1) / nlen;
        const nuz = (next.z2 - next.z1) / nlen;
        const toX = next.x1 + (next.x2 - next.x1) * pick.entryT + nuz * LANE_OFFSET * pick.dir;
        const toZ = next.z1 + (next.z2 - next.z1) * pick.entryT - nux * LANE_OFFSET * pick.dir;
        c.turn = {
          kind: "bend",
          k: 0,
          dur: turnDuration(Math.hypot(toX - fromX, toZ - fromZ)),
          speed: Math.min(c.v, 4.2),
          fromX,
          fromZ,
          controlX: nodeX,
          controlZ: nodeZ,
          toX,
          toZ,
          nextSeg: pick.seg,
          nextT: pick.entryT,
          nextDir: pick.dir,
          nodeX,
          nodeZ,
        };
        c.v = Math.min(c.v, 4.2);
      } else {
        c.turn = {
          kind: "arc",
          k: 0,
          dur: Math.max(0.55, (Math.PI * LANE_OFFSET) / Math.max(2, c.v)),
          speed: Math.min(c.v, 3.2),
          centerX: nodeX,
          centerZ: nodeZ,
          ux,
          uz,
          dir: c.dir,
          nodeX,
          nodeZ,
        };
        c.v = Math.min(c.v, 3.2);
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
        const k = turn.k * turn.k * (3 - 2 * turn.k);
        if (turn.kind === "bend") {
          const a = (1 - k) * (1 - k);
          const b = 2 * (1 - k) * k;
          const d = k * k;
          x = a * turn.fromX + b * turn.controlX + d * turn.toX;
          z = a * turn.fromZ + b * turn.controlZ + d * turn.toZ;
          const dx =
            2 * (1 - k) * (turn.controlX - turn.fromX) + 2 * k * (turn.toX - turn.controlX);
          const dz =
            2 * (1 - k) * (turn.controlZ - turn.fromZ) + 2 * k * (turn.toZ - turn.controlZ);
          rotY = -Math.atan2(dz, dx);
        } else {
          const theta = k * Math.PI;
          const cos = Math.cos(theta);
          const sin = Math.sin(theta);
          const rx = turn.uz * turn.dir;
          const rz = -turn.ux * turn.dir;
          x = turn.centerX + LANE_OFFSET * (cos * rx + sin * turn.ux * turn.dir);
          z = turn.centerZ + LANE_OFFSET * (cos * rz + sin * turn.uz * turn.dir);
          const tx = -sin * rx + cos * turn.ux * turn.dir;
          const tz = -sin * rz + cos * turn.uz * turn.dir;
          rotY = -Math.atan2(tz, tx);
        }
      } else {
        const len = lengths[c.lane] ?? laneLength(lane);
        const ux = (lane.x2 - lane.x1) / len;
        const uz = (lane.z2 - lane.z1) / len;
        x = lane.x1 + (lane.x2 - lane.x1) * c.t + uz * LANE_OFFSET * c.dir;
        z = lane.z1 + (lane.z2 - lane.z1) * c.t - ux * LANE_OFFSET * c.dir;
        rotY = -Math.atan2(uz * c.dir, ux * c.dir);
      }
      const bodyScale = c.scale;
      dummy.position.set(x, CAR_SHAPE.body.y * bodyScale, z);
      dummy.rotation.set(0, rotY, 0);
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
        const cos = Math.cos(rotY);
        const sin = Math.sin(rotY);
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
            .setFromAxisAngle(AXIS_Y, rotY)
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

      {/* Traffic — body, cabin and four wheels per car. The wheels are one
          instanced mesh whose geometry is laid on its side once, so a per-frame
          write is a position, a yaw and a roll. */}
      <instancedMesh
        ref={carRef}
        args={[undefined, undefined, Math.max(1, carCount)]}
        frustumCulled={false}
        visible={active}
      >
        <boxGeometry args={[CAR_SHAPE.body.w, CAR_SHAPE.body.h, CAR_SHAPE.body.d]} />
        <meshStandardMaterial roughness={0.42} metalness={0.16} />
      </instancedMesh>
      <instancedMesh
        ref={cabinRef}
        args={[undefined, undefined, Math.max(1, carCount)]}
        frustumCulled={false}
        visible={active}
      >
        <boxGeometry args={[CAR_SHAPE.cabin.w, CAR_SHAPE.cabin.h, CAR_SHAPE.cabin.d]} />
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
