"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { DirLayout } from "../city/layout";
import { useStore } from "../stores/useStore";
import { reducedSettle } from "../city/motion";

/**
 * Dependency particle streams — shown while a building is selected.
 *
 * - outgoing imports (this file depends on X): violet particles flowing
 *   AWAY from the selected roof
 * - incoming imports (X depends on this file): cyan particles flowing IN
 * - circular dependencies (both directions with the same file): both
 *   streams pulse red
 *
 * The static tube arcs stay hidden while nothing is selected — idle cities
 * are calmer and one whole draw-call family cheaper.
 */

interface FlowProps {
  layout: DirLayout;
  fileConnections: Array<{ from: string; to: string; weight: number }>;
}

const PARTICLES_PER_CURVE = 90;
const CURVES_MAX = 24; // ≈ 2160 particles worst case
const IN_COLOR = new THREE.Color("#37e6ff"); // cyan — data flowing in
const OUT_COLOR = new THREE.Color("#b06bff"); // violet — data flowing out
const CYCLE_COLOR = new THREE.Color("#ff2e4d"); // red — circular dependency
/** Curve sampler scratch — one per module, not one per particle per frame. */
const _point = new THREE.Vector3();

function flowCurve(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
): THREE.QuadraticBezierCurve3 {
  const start = new THREE.Vector3(a.x, a.y, a.z);
  const end = new THREE.Vector3(b.x, b.y, b.z);
  const dist = start.distanceTo(end);
  const mid = start.clone().add(end).multiplyScalar(0.5);
  mid.y += Math.min(dist * 0.24 + 3.5, 42);
  return new THREE.QuadraticBezierCurve3(start, mid, end);
}

interface FlowCurve {
  curve: THREE.QuadraticBezierCurve3;
  direction: "in" | "out";
  circular: boolean;
  speed: number; // particles/s along the curve
  offset: number; // per-particle phase spacing
}

export function DependencyFlows({ layout, fileConnections }: FlowProps) {
  const selectedUnit = useStore((s) => s.selectedUnit);
  const selectedId = selectedUnit?.kind === "file" ? selectedUnit.id : null;
  const pointsRef = useRef<THREE.Points>(null);
  const colorAttr = useRef<THREE.BufferAttribute | null>(null);

  const buildingPos = useMemo(() => {
    const map = new Map<string, { x: number; y: number; z: number }>();
    for (const b of layout.buildings) map.set(b.file.id, { x: b.x, y: b.h + 0.6, z: b.z });
    return map;
  }, [layout]);

  const flows = useMemo<FlowCurve[]>(() => {
    if (!selectedId) return [];
    const outgoing = new Set<string>();
    const incoming = new Set<string>();
    for (const c of fileConnections) {
      if (c.from === selectedId) outgoing.add(c.to);
      if (c.to === selectedId) incoming.add(c.from);
    }
    const curves: FlowCurve[] = [];
    for (const c of fileConnections) {
      if (curves.length >= CURVES_MAX) break;
      if (c.from !== selectedId && c.to !== selectedId) continue;
      const a = buildingPos.get(c.from);
      const b = buildingPos.get(c.to);
      if (!a || !b || (a.x === b.x && a.z === b.z)) continue;
      const direction = c.from === selectedId ? "out" : "in";
      const other = c.from === selectedId ? c.to : c.from;
      const circular = outgoing.has(other) && incoming.has(other);
      curves.push({
        curve: flowCurve(a, b),
        direction,
        circular,
        speed: 0.12 + Math.min(c.weight, 10) * 0.02, // heavier imports flow faster
        offset: 1 / PARTICLES_PER_CURVE,
      });
    }
    return curves;
  }, [selectedId, fileConnections, buildingPos]);

  const particleCount = flows.length * PARTICLES_PER_CURVE;

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(particleCount * 3), 3));
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(particleCount * 3), 3));
    return geo;
    // Recreate only when the TOPOLOGY changes; per-frame data mutates in place
  }, [particleCount]);

  useEffect(() => {
    colorAttr.current = geometry.getAttribute("color") as THREE.BufferAttribute;
    // Static per-flow colors written once per topology change
    const colors = colorAttr.current;
    if (colors) {
      for (let f = 0; f < flows.length; f++) {
        const flow = flows[f]!;
        const base = flow.circular ? CYCLE_COLOR : flow.direction === "in" ? IN_COLOR : OUT_COLOR;
        for (let p = 0; p < PARTICLES_PER_CURVE; p++) {
          const i = (f * PARTICLES_PER_CURVE + p) * 3;
          colors.array[i] = base.r;
          colors.array[i + 1] = base.g;
          colors.array[i + 2] = base.b;
        }
      }
      colors.needsUpdate = true;
    }
    return () => geometry.dispose();
  }, [geometry, flows]);

  const elapsedRef = useRef(0);
  const settledRef = useRef(false);

  /**
   * Lay every particle on its curve at stream time `t`. `t = 0` is the frozen
   * frame reduced motion needs AND the first frame's layout — the buffer starts
   * as zeros, so this must run at least once or all particles pile up at the
   * world origin as one bright blob.
   */
  const write = (t: number): void => {
    const pos = geometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const v = _point;

    for (let f = 0; f < flows.length; f++) {
      const flow = flows[f]!;
      const base = flow.circular ? 0.55 + Math.abs(Math.sin(t * 3.2)) * 0.45 : 1; // cycle pulse dims/brightens
      for (let p = 0; p < PARTICLES_PER_CURVE; p++) {
        const idx = f * PARTICLES_PER_CURVE + p;
        // Head-tail spacing; direction decides which end moves first
        let u = (p * flow.offset + t * flow.speed) % 1;
        if (flow.direction === "out") u = 1 - u;
        flow.curve.getPoint(u, v);
        const i = idx * 3;
        arr[i] = v.x;
        arr[i + 1] = v.y;
        arr[i + 2] = v.z;
        // Circular flows pulse via per-frame alpha approximation: brighten
        // the color toward white in sync with the pulse
        if (flow.circular) {
          const colors = colorAttr.current;
          if (colors) {
            const cIdx = idx * 3;
            const k = 0.6 + base * 0.4;
            colors.array[cIdx] = CYCLE_COLOR.r * k + (1 - k);
            colors.array[cIdx + 1] = CYCLE_COLOR.g * k;
            colors.array[cIdx + 2] = CYCLE_COLOR.b * k;
          }
        }
      }
    }
    pos.needsUpdate = true;
    if (colorAttr.current && flows.some((f) => f.circular)) colorAttr.current.needsUpdate = true;
  };

  useFrame((_, delta) => {
    if (!selectedId || flows.length === 0) return;
    // Reduced motion: the streams hold their spread along the curve. Direction
    // is still readable — the in/out colour split carries it without movement.
    if (reducedSettle(settledRef, () => write(0))) return;
    elapsedRef.current += delta;
    write(elapsedRef.current);
  });

  if (!selectedId || flows.length === 0) return null;

  return (
    <points ref={pointsRef} geometry={geometry} frustumCulled={false}>
      <pointsMaterial
        size={0.55}
        vertexColors
        transparent
        opacity={0.95}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        sizeAttenuation
        toneMapped={false}
      />
    </points>
  );
}
