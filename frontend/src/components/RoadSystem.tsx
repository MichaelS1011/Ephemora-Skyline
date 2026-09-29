"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { DirLayout } from "../city/layout";
import { ENV } from "../city/palette";

/**
 * Streets & city furniture: plot slabs, lane dashes, warm streetlights,
 * dusk trees and ambient traffic. Everything repeated uses InstancedMesh
 * so a whole district costs a handful of draw calls.
 */

const dummy = new THREE.Object3D();

export function RoadSystem({ layout }: { layout: DirLayout }) {
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

  // ── Streetlights at block corners ───────────────────────────────────────
  const lampData = useMemo(() => {
    const items: Array<{ x: number; z: number }> = [];
    for (const b of layout.blocks) {
      const offs: Array<[number, number]> = [
        [b.w / 2 + 1.1, b.d / 2 + 1.1],
        [-b.w / 2 - 1.1, b.d / 2 + 1.1],
        [b.w / 2 + 1.1, -b.d / 2 - 1.1],
        [-b.w / 2 - 1.1, -b.d / 2 - 1.1],
      ];
      for (const [ox, oz] of offs) items.push({ x: b.x + ox, z: b.z + oz });
    }
    return items.slice(0, 180);
  }, [layout]);

  const poleRef = useRef<THREE.InstancedMesh>(null);
  const headRef = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const poles = poleRef.current;
    const heads = headRef.current;
    if (!poles || !heads) return;
    lampData.forEach((l, i) => {
      dummy.rotation.set(0, 0, 0);
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

  // ── Trees near block corners (dusk-park feel) ───────────────────────────
  const treeData = useMemo(() => {
    const items: Array<{ x: number; z: number; s: number }> = [];
    for (const b of layout.blocks) {
      const seed = b.dir.path.length * 31 + b.dir.name.length;
      const count = (seed % 3) + 1;
      for (let i = 0; i < count; i++) {
        const angle = ((seed * (i + 3)) % 628) / 100;
        const r = Math.max(b.w, b.d) / 2 + 2.4;
        items.push({
          x: b.x + Math.cos(angle) * r,
          z: b.z + Math.sin(angle) * r,
          s: 0.75 + ((seed + i * 17) % 50) / 100,
        });
      }
    }
    return items.slice(0, 120);
  }, [layout]);

  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const crownRef = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const trunks = trunkRef.current;
    const crowns = crownRef.current;
    if (!trunks || !crowns) return;
    treeData.forEach((t, i) => {
      dummy.rotation.set(0, i * 1.3, 0);
      dummy.position.set(t.x, 0.5 * t.s, t.z);
      dummy.scale.setScalar(t.s);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      dummy.position.set(t.x, 1.45 * t.s, t.z);
      dummy.updateMatrix();
      crowns.setMatrixAt(i, dummy.matrix);
    });
    trunks.count = treeData.length;
    crowns.count = treeData.length;
    trunks.instanceMatrix.needsUpdate = true;
    crowns.instanceMatrix.needsUpdate = true;
    dummy.scale.setScalar(1);
  }, [treeData]);

  // ── Ambient traffic on the street grid ──────────────────────────────────
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
    for (let i = 0; i < Math.min(20, lanes.length * 2); i++) {
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
  useLayoutEffect(() => {
    const mesh = carRef.current;
    if (!mesh) return;
    carData.items.forEach((c, i) => mesh.setColorAt(i, c.color));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [carData]);

  useFrame((_, delta) => {
    const mesh = carRef.current;
    if (!mesh) return;
    carData.items.forEach((c, i) => {
      const lane = carData.lanes[c.lane];
      if (!lane) return;
      const len = Math.hypot(lane.x2 - lane.x1, lane.z2 - lane.z1);
      c.t = (c.t + ((delta * c.speed) / Math.max(len, 1)) * c.dir + 1) % 1;
      const x = lane.x1 + (lane.x2 - lane.x1) * c.t;
      const z = lane.z1 + (lane.z2 - lane.z1) * c.t;
      dummy.position.set(x, 0.28, z);
      dummy.rotation.set(0, -Math.atan2(lane.z2 - lane.z1, lane.x2 - lane.x1), 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
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
            <meshStandardMaterial color="#1b1b18" roughness={0.96} />
          </mesh>
        );
      })}

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
      >
        <sphereGeometry args={[0.17, 8, 8]} />
        <meshBasicMaterial color={ENV.streetlight} toneMapped={false} />
      </instancedMesh>

      {/* Trees */}
      <instancedMesh
        ref={trunkRef}
        args={[undefined, undefined, Math.max(1, treeData.length)]}
        frustumCulled={false}
      >
        <cylinderGeometry args={[0.09, 0.14, 1.1, 5]} />
        <meshStandardMaterial color="#3d3226" roughness={0.95} />
      </instancedMesh>
      <instancedMesh
        ref={crownRef}
        args={[undefined, undefined, Math.max(1, treeData.length)]}
        frustumCulled={false}
      >
        <icosahedronGeometry args={[0.85, 0]} />
        <meshStandardMaterial color="#2c5f49" roughness={0.9} flatShading />
      </instancedMesh>

      {/* Traffic */}
      <instancedMesh
        ref={carRef}
        args={[undefined, undefined, Math.max(1, carCount)]}
        frustumCulled={false}
      >
        <boxGeometry args={[0.85, 0.22, 0.42]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </group>
  );
}
