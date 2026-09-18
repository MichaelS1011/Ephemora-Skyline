'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { DirLayout } from '../city/layout';
import { ENV } from '../city/palette';

/**
 * Import relationships as glowing arcs:
 * - file → file arcs between rendered buildings (current level)
 * - dir → dir arcs between top-level blocks (overview level) — the
 *   architecture map of the repo
 */

interface ConnectionProps {
  layout: DirLayout;
  fileConnections: Array<{ from: string; to: string; weight: number }>;
  dirConnections: Array<{ from: string; to: string; weight: number }>;
  showDirArcs: boolean;
  showFileArcs?: boolean;
}

const FILE_ARCS_MAX = 70;
const DIR_ARCS_MAX = 26;

function arcGeometry(
  x1: number,
  y1: number,
  z1: number,
  x2: number,
  y2: number,
  z2: number,
  radius: number,
): THREE.TubeGeometry {
  const start = new THREE.Vector3(x1, y1, z1);
  const end = new THREE.Vector3(x2, y2, z2);
  const dist = start.distanceTo(end);
  const mid = start.clone().add(end).multiplyScalar(0.5);
  mid.y += Math.min(dist * 0.24 + 3.5, 42);
  const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
  return new THREE.TubeGeometry(curve, 20, radius, 5, false);
}

export function CityConnections({ layout, fileConnections, dirConnections, showDirArcs, showFileArcs = true }: ConnectionProps) {
  const fileMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const dirMatRef = useRef<THREE.MeshBasicMaterial>(null);

  const buildingPos = useMemo(() => {
    const map = new Map<string, { x: number; y: number; z: number }>();
    for (const b of layout.buildings) map.set(b.file.id, { x: b.x, y: b.h + 0.6, z: b.z });
    return map;
  }, [layout]);

  const blockPos = useMemo(() => {
    const map = new Map<string, { x: number; z: number; w: number }>();
    for (const b of layout.blocks) map.set(b.dir.name, { x: b.x, z: b.z, w: b.w });
    return map;
  }, [layout]);

  // ── File → file arcs ─────────────────────────────────────────────────────
  const fileGeos = useMemo(() => {
    if (!showFileArcs) return [];
    const geos: THREE.TubeGeometry[] = [];
    for (const conn of fileConnections) {
      if (geos.length >= FILE_ARCS_MAX) break;
      const a = buildingPos.get(conn.from);
      const b = buildingPos.get(conn.to);
      if (!a || !b || (a.x === b.x && a.z === b.z)) continue;
      geos.push(arcGeometry(a.x, a.y, a.z, b.x, b.y, b.z, 0.05));
    }
    return geos;
  }, [fileConnections, buildingPos, showFileArcs]);

  // ── Dir → dir arcs (overview architecture map) ───────────────────────────
  const dirGeos = useMemo(() => {
    if (!showDirArcs) return [];
    const geos: THREE.TubeGeometry[] = [];
    for (const conn of dirConnections) {
      if (geos.length >= DIR_ARCS_MAX) break;
      const a = conn.from === '' ? { x: 0, z: 0 } : blockPos.get(conn.from);
      const b = conn.to === '' ? { x: 0, z: 0 } : blockPos.get(conn.to);
      if (!a || !b) continue;
      geos.push(arcGeometry(a.x, 3.2, a.z, b.x, 3.2, b.z, 0.1));
    }
    return geos;
  }, [dirConnections, blockPos, showDirArcs]);

  useEffect(() => {
    return () => {
      for (const g of fileGeos) g.dispose();
      for (const g of dirGeos) g.dispose();
    };
  }, [fileGeos, dirGeos]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (fileMatRef.current) fileMatRef.current.opacity = 0.22 + Math.sin(t * 1.6) * 0.1;
    if (dirMatRef.current) dirMatRef.current.opacity = 0.3 + Math.sin(t * 1.1 + 1) * 0.1;
  });

  return (
    <group>
      {fileGeos.map((geo, i) => (
        <mesh key={`fa-${i}`} geometry={geo}>
          <meshBasicMaterial
            ref={i === 0 ? fileMatRef : undefined}
            color={ENV.connection}
            transparent
            opacity={0.25}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}
      {dirGeos.map((geo, i) => (
        <mesh key={`da-${i}`} geometry={geo}>
          <meshBasicMaterial
            ref={i === 0 ? dirMatRef : undefined}
            color="#6fd4ff"
            transparent
            opacity={0.3}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}
