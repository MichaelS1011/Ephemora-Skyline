"use client";

import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { DirLayout } from "../city/layout";
import { ENV } from "../city/palette";

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
  /**
   * When a building is selected, static file arcs collapse to ONLY that
   * building's edges (idle cities show no file arcs at all — the
   * DependencyFlows particles take over).
   */
  selectedFileId?: string | null;
  /**
   * DEPENDENCIES view mode (spec §14): the buildings recede and the arcs
   * take the stage — thicker tubes, brighter opacity and an amber tint so
   * the dependency veins read as the city's active layer.
   */
  highlight?: boolean;
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

export function CityConnections({
  layout,
  fileConnections,
  dirConnections,
  showDirArcs,
  showFileArcs = true,
  selectedFileId = null,
  highlight = false,
}: ConnectionProps) {
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
      if (selectedFileId && conn.from !== selectedFileId && conn.to !== selectedFileId) continue;
      const a = buildingPos.get(conn.from);
      const b = buildingPos.get(conn.to);
      if (!a || !b || (a.x === b.x && a.z === b.z)) continue;
      geos.push(arcGeometry(a.x, a.y, a.z, b.x, b.y, b.z, highlight ? 0.09 : 0.05));
    }
    return geos;
  }, [fileConnections, buildingPos, showFileArcs, selectedFileId, highlight]);

  // ── Dir → dir arcs (overview architecture map) ───────────────────────────
  const dirGeos = useMemo(() => {
    if (!showDirArcs) return [];
    const geos: THREE.TubeGeometry[] = [];
    for (const conn of dirConnections) {
      if (geos.length >= DIR_ARCS_MAX) break;
      const a = conn.from === "" ? { x: 0, z: 0 } : blockPos.get(conn.from);
      const b = conn.to === "" ? { x: 0, z: 0 } : blockPos.get(conn.to);
      if (!a || !b) continue;
      geos.push(arcGeometry(a.x, 3.2, a.z, b.x, 3.2, b.z, highlight ? 0.16 : 0.1));
    }
    return geos;
  }, [dirConnections, blockPos, showDirArcs, highlight]);

  const fileMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(highlight ? "#e8b23c" : ENV.connection),
        transparent: true,
        opacity: highlight ? 0.55 : 0.25,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    [highlight],
  );
  const dirMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color("#e8b23c"),
        transparent: true,
        opacity: highlight ? 0.65 : 0.3,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    [highlight],
  );

  useEffect(() => {
    return () => {
      for (const g of fileGeos) g.dispose();
      for (const g of dirGeos) g.dispose();
    };
  }, [fileGeos, dirGeos]);

  useEffect(() => {
    return () => {
      fileMat.dispose();
      dirMat.dispose();
    };
  }, [fileMat, dirMat]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    // In DEPENDENCIES mode the pulsing baseline rides higher — the mode must
    // never pulse the arcs back down to their idle subtlety.
    // One shared material per arc group: EVERY arc pulses. The old code
    // attached the animated ref to arc #0 only, so the rest stayed frozen at
    // their static mount opacity (#16b).
    fileMat.opacity = highlight ? 0.55 + Math.sin(t * 1.6) * 0.12 : 0.22 + Math.sin(t * 1.6) * 0.1;
    dirMat.opacity = highlight
      ? 0.65 + Math.sin(t * 1.1 + 1) * 0.1
      : 0.3 + Math.sin(t * 1.1 + 1) * 0.1;
  });

  return (
    <group>
      {fileGeos.map((geo, i) => (
        <mesh key={`fa-${i}`} geometry={geo} material={fileMat} />
      ))}
      {dirGeos.map((geo, i) => (
        <mesh key={`da-${i}`} geometry={geo} material={dirMat} />
      ))}
    </group>
  );
}
