"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { DirLayout } from "../city/layout";
import type { CityData } from "../city/types";
import { reducedSettle } from "../city/motion";

/**
 * Category 2 (code statics): copy-paste clones connected by harsh yellow
 * laser threads. Cap of 30 (30 draw calls) — clone pairs can be numerous
 * and the laser only needs to be legible, not exhaustive.
 */

const LASERS_MAX = 30;
/** The pulse's midpoint — also the frozen opacity under reduced motion. */
const LASER_OPACITY = 0.55;

function laserGeometry(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
): THREE.TubeGeometry {
  const start = new THREE.Vector3(a.x, a.y, a.z);
  const end = new THREE.Vector3(b.x, b.y, b.z);
  const mid = start.clone().add(end).multiplyScalar(0.5);
  // Taut straight-ish laser — no dramatic arc, these are accusatory lines
  mid.y += Math.min(start.distanceTo(end) * 0.1 + 1.5, 14);
  const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
  return new THREE.TubeGeometry(curve, 16, 0.045, 4, false);
}

export function CloneLasers({ layout, cityData }: { layout: DirLayout; cityData: CityData }) {
  const duplicatesOn = cityData.meta.duplicates ?? false;
  const settledRef = useRef(false);

  const buildingPos = useMemo(() => {
    const map = new Map<string, { x: number; y: number; z: number }>();
    for (const b of layout.buildings) map.set(b.file.id, { x: b.x, y: b.h + 0.6, z: b.z });
    return map;
  }, [layout]);

  const geos = useMemo(() => {
    const out: THREE.TubeGeometry[] = [];
    if (!duplicatesOn) return out;
    const seen = new Set<string>();
    for (const b of layout.buildings) {
      if (out.length >= LASERS_MAX) break;
      for (const partner of b.file.clonePartners ?? []) {
        if (out.length >= LASERS_MAX) break;
        const posA = buildingPos.get(b.file.id);
        const posB = buildingPos.get(partner.id);
        if (!posA || !posB) continue; // partner not rendered at this level
        const key = [b.file.id, partner.id].sort().join("|");
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(laserGeometry(posA, posB));
      }
    }
    return out;
  }, [layout, buildingPos, duplicatesOn]);

  // ONE material for the whole bundle. Every thread used to carry its own
  // inline material, and the animated ref was attached to thread #0 only —
  // so 29 of 30 lasers sat at their mount opacity while one flickered, and
  // 30 materials had to be bound for 30 identical tubes (same bug class as
  // the arc group's #16b). Shared: they pulse together and cost one bind.
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: "#ffe14d",
        transparent: true,
        opacity: LASER_OPACITY,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );

  useEffect(() => {
    return () => {
      for (const g of geos) g.dispose();
    };
  }, [geos]);

  useEffect(() => () => material.dispose(), [material]);

  useFrame(({ clock }) => {
    // Reduced motion: the threads hold their midpoint. Their existence is the
    // finding — a strobe on top of it would only tire the eye.
    if (
      reducedSettle(settledRef, () => {
        material.opacity = LASER_OPACITY;
      })
    )
      return;
    // Harsh flicker — lasers should feel uncomfortable
    material.opacity = LASER_OPACITY + Math.sin(clock.elapsedTime * 6) * 0.2;
  });

  if (geos.length === 0) return null;
  return (
    <group>
      {geos.map((geo, i) => (
        <mesh key={`clone-${i}`} geometry={geo} material={material} />
      ))}
    </group>
  );
}
