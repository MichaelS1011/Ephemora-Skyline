"use client";

import type * as THREE from "three";
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";

/**
 * Ambient dust — warm and cool motes drifting over the city.
 * Purely decorative; spread scales with the current district bounds.
 */

const DUST_COLORS: Array<[number, number, number]> = [
  [1.0, 0.82, 0.55], // warm amber
  [0.62, 0.85, 1.0], // cool blue
  [1.0, 0.65, 0.45], // ember
];

export function ParticleField({ count = 200, bounds = 60 }: { count?: number; bounds?: number }) {
  const pointsRef = useRef<THREE.Points>(null);

  const { positions, colors } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const spread = bounds + 25;
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * spread * 2;
      pos[i * 3 + 1] = Math.random() * (bounds * 0.5 + 18) + 1;
      pos[i * 3 + 2] = (Math.random() - 0.5) * spread * 2;
      const c = DUST_COLORS[i % DUST_COLORS.length]!;
      col[i * 3] = c[0];
      col[i * 3 + 1] = c[1];
      col[i * 3 + 2] = c[2];
    }
    return { positions: pos, colors: col };
  }, [count, bounds]);

  useFrame(({ clock }) => {
    const points = pointsRef.current;
    if (!points) return;
    const t = clock.elapsedTime;
    const attr = points.geometry.attributes.position as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    for (let i = 0; i < count; i++) {
      const ox = positions[i * 3]!;
      const oy = positions[i * 3 + 1]!;
      const oz = positions[i * 3 + 2]!;
      arr[i * 3] = ox + Math.sin(t * 0.25 + oy * 0.08) * 0.9;
      arr[i * 3 + 1] = oy + Math.sin(t * 0.18 + ox * 0.05) * 0.5;
      arr[i * 3 + 2] = oz + Math.cos(t * 0.22 + oy * 0.06) * 0.7;
    }
    attr.needsUpdate = true;
  });

  return (
    <points key={bounds} ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial vertexColors size={0.35} transparent opacity={0.5} sizeAttenuation />
    </points>
  );
}
