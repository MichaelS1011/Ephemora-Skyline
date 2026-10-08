"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { DirLayout } from "../city/layout";
import { CURB_OFFSET, type SidewalkNetwork } from "../city/sidewalks";
import { ENV } from "../city/palette";
import { COMPLEXITY_TICKS, heightForComplexity } from "../city/mapping";
import { reducedSettle } from "../city/motion";
import { t } from "../i18n";
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

const LANE_OFFSET = 0.95; // car center offset from the street centerline
const CROSSWALK_BARS = [-1.65, -1.1, -0.55, 0, 0.55, 1.1, 1.65];

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
      return items;
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
    return items;
  }, [layout, sidewalks]);

  const curbRef = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = curbRef.current;
    if (!mesh) return;
    curbData.forEach((c, i) => {
      dummy.position.set(c.x, 0.04, c.z);
      dummy.rotation.set(0, c.rotY, 0);
      dummy.scale.set(c.len, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.count = curbData.length;
    mesh.instanceMatrix.needsUpdate = true;
    dummy.scale.setScalar(1);
  }, [curbData]);

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
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.count = zebraData.length;
    mesh.instanceMatrix.needsUpdate = true;
  }, [zebraData]);

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
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.count = dashData.length;
    mesh.instanceMatrix.needsUpdate = true;
  }, [dashData]);

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
      poles.setMatrixAt(i, dummy.matrix);
      dummy.position.set(l.x, 3.1, l.z);
      dummy.updateMatrix();
      heads.setMatrixAt(i, dummy.matrix);
    });
    poles.count = lampData.length;
    heads.count = lampData.length;
    poles.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
  }, [lampData]);

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
      trunks.setMatrixAt(i, dummy.matrix);
      dummy.position.set(t.x, 1.5 * t.s, t.z);
      dummy.updateMatrix();
      crowns.setMatrixAt(i, dummy.matrix);
      dummy.position.set(t.x, 2.28 * t.s, t.z);
      dummy.updateMatrix();
      tops.setMatrixAt(i, dummy.matrix);
    });
    trunks.count = treeData.length;
    crowns.count = treeData.length;
    tops.count = treeData.length;
    trunks.instanceMatrix.needsUpdate = true;
    crowns.instanceMatrix.needsUpdate = true;
    tops.instanceMatrix.needsUpdate = true;
    dummy.scale.setScalar(1);
  }, [treeData]);

  // ── Ambient traffic keeping to the right lane ───────────────────────────
  const carData = useMemo(() => {
    const lanes = [...layout.streets].sort((a, b) => {
      const la = Math.hypot(a.x2 - a.x1, a.z2 - a.z1);
      const lb = Math.hypot(b.x2 - b.x1, b.z2 - b.z1);
      return lb - la;
    });
    const items: Array<{
      lane: number;
      t: number;
      speed: number;
      dir: 1 | -1;
      color: THREE.Color;
    }> = [];
    const palette = ["#ffe9c4", "#ff6a4d", "#bfe8ff", "#ffd9a0"];
    for (let i = 0; i < Math.min(24, lanes.length * 2); i++) {
      items.push({
        lane: i % Math.max(1, lanes.length),
        t: (i * 0.37) % 1,
        speed: 3.5 + ((i * 13) % 40) / 10,
        dir: i % 2 === 0 ? 1 : -1,
        color: new THREE.Color(palette[i % palette.length]!),
      });
    }
    return { lanes, items };
  }, [layout]);

  const carRef = useRef<THREE.InstancedMesh>(null);
  const cabinRef = useRef<THREE.InstancedMesh>(null);
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
    if (!mesh || !cabins) return;
    carData.items.forEach((c, i) => {
      const lane = carData.lanes[c.lane];
      if (!lane) return;
      const len = Math.hypot(lane.x2 - lane.x1, lane.z2 - lane.z1);
      c.t += ((dt * c.speed) / Math.max(len, 1)) * c.dir;
      // U-turn at the end of the street instead of wrapping through traffic
      if (c.t > 1) {
        c.t = 1;
        c.dir = -1;
      } else if (c.t < 0) {
        c.t = 0;
        c.dir = 1;
      }
      const ux = (lane.x2 - lane.x1) / len;
      const uz = (lane.z2 - lane.z1) / len;
      // right-hand side of the travel direction
      const lx = lane.x1 + (lane.x2 - lane.x1) * c.t + uz * LANE_OFFSET * c.dir;
      const lz = lane.z1 + (lane.z2 - lane.z1) * c.t - ux * LANE_OFFSET * c.dir;
      const rotY = -Math.atan2(uz * c.dir, ux * c.dir);
      dummy.position.set(lx, 0.28, lz);
      dummy.rotation.set(0, rotY, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      dummy.position.set(lx, 0.44, lz);
      dummy.updateMatrix();
      cabins.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    cabins.instanceMatrix.needsUpdate = true;
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
      {layout.streets.map((s, i) => {
        const len = Math.hypot(s.x2 - s.x1, s.z2 - s.z1);
        if (len < 3) return null;
        const angle = -Math.atan2(s.z2 - s.z1, s.x2 - s.x1);
        return (
          <mesh
            key={`street-${i}`}
            position={[(s.x1 + s.x2) / 2, 0.02, (s.z1 + s.z2) / 2]}
            rotation={[0, angle, 0]}
          >
            <boxGeometry args={[len + 3.4, 0.05, 3.8]} />
            <meshStandardMaterial color={ENV.road} roughness={0.96} />
          </mesh>
        );
      })}

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

      {/* Traffic — body + cabin */}
      <instancedMesh
        ref={carRef}
        args={[undefined, undefined, Math.max(1, carCount)]}
        frustumCulled={false}
        visible={active}
      >
        <boxGeometry args={[0.85, 0.22, 0.42]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh
        ref={cabinRef}
        args={[undefined, undefined, Math.max(1, carCount)]}
        frustumCulled={false}
        visible={active}
      >
        <boxGeometry args={[0.5, 0.2, 0.36]} />
        <meshStandardMaterial color={ENV.road} roughness={0.3} metalness={0.4} />
      </instancedMesh>

      {/* The height rail, standing in the picture — see the mast memo above */}
      {mast && (
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
          <Html
            center
            distanceFactor={60}
            position={[1.6, MAST_TOP / 2 + 2, 0]}
            zIndexRange={[8, 0]}
          >
            <div className="cf-mast">
              <div className="cf-mast-title">{t(lang, "hud.heightComplexity")}</div>
              <div className="cf-mast-ticks">
                {[...COMPLEXITY_TICKS].reverse().map((c) => (
                  <div key={c}>{c.toFixed(2)}</div>
                ))}
              </div>
            </div>
          </Html>
        </group>
      )}
    </group>
  );
}
