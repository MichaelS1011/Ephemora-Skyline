'use client';

import { useMemo, useRef } from 'react';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import type * as THREE from 'three';
import type { BlockPlacement } from '../city/layout';
import { ENV, SEVERITY_COLOR } from '../city/palette';
import { useStore } from '../stores/useStore';
import { Building } from './Building';

/**
 * A district — a BUILT plot: curb, nameplate and a skyline of up to six
 * real towers (the subtree's most at-risk + largest files). Clicking the
 * plot dives in: the full neighbourhood opens underneath the camera.
 */

export interface DistrictProps {
  placement: BlockPlacement;
  /** Epoch ms when this district starts to rise. */
  appearAt: number;
  constructing: boolean;
}

export function District({ placement, appearAt, constructing }: DistrictProps) {
  const drillIn = useStore((s) => s.drillIn);
  const setHoveredId = useStore((s) => s.setHoveredId);

  const { dir, x, z, w, d, skyline } = placement;
  const hasP0 = dir.findingsBySeverity.P0 > 0;

  const curbColor = hasP0 ? ENV.windowAlarm : '#2c3852';
  const curbIntensity = useMemo(() => (hasP0 ? 1.1 : 0.3), [hasP0]);

  const handleClick = (e: { stopPropagation: () => void }): void => {
    e.stopPropagation();
    drillIn(dir.name);
  };

  const handleOver = (e: { stopPropagation: () => void }): void => {
    e.stopPropagation();
    setHoveredId(`block:${dir.path}`);
    document.body.style.cursor = 'pointer';
  };

  const handleOut = (): void => {
    setHoveredId(null);
    document.body.style.cursor = 'auto';
  };

  const groupRef = useRef<THREE.Group>(null);

  // Construction / drill-in rise
  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;
    if (!constructing) {
      if (g.scale.y !== 1) g.scale.y = 1;
      g.visible = true;
      return;
    }
    const now = Date.now();
    if (now < appearAt) {
      g.visible = false;
      return;
    }
    g.visible = true;
    const k = Math.min(1, (now - appearAt) / 550);
    const ease = 1 - Math.pow(1 - k, 3);
    g.scale.y = Math.max(0.001, ease);
  });

  return (
    <group ref={groupRef} position={[x, 0, z]}>
      {/* Plot — dark asphalt lot */}
      <mesh position={[0, 0.09, 0]} onClick={handleClick} onPointerOver={handleOver} onPointerOut={handleOut}>
        <boxGeometry args={[w + 2.4, 0.18, d + 2.4]} />
        <meshStandardMaterial color="#161c29" roughness={0.95} />
      </mesh>

      {/* Curb — subtle frame; alarm-red when P0 lives inside */}
      {([
        [0, -d / 2 - 1.1, w + 2.8, 0],
        [0, d / 2 + 1.1, w + 2.8, 0],
        [-w / 2 - 1.1, 0, 0, d + 2.8],
        [w / 2 + 1.1, 0, 0, d + 2.8],
      ] as Array<[number, number, number, number]>).map(([ex, ez, ew, ed], i) => (
        <mesh key={i} position={[ex, 0.16, ez]}>
          <boxGeometry args={[ew || 0.3, 0.22, ed || 0.3]} />
          <meshStandardMaterial color={curbColor} emissive={curbColor} emissiveIntensity={curbIntensity} roughness={0.7} />
        </mesh>
      ))}

      {/* The skyline — real buildings of this subtree */}
      {skyline.map((b, i) => (
        <Building
          key={b.file.id}
          file={b.file}
          x={b.x}
          z={b.z}
          w={b.w}
          d={b.d}
          h={b.h}
          interactive={false}
          appearAt={appearAt + 250 + i * 90}
          constructing={constructing}
        />
      ))}

      {/* Podium marker — files not individually rendered */}
      {dir.remainingFiles > 0 && (
        <group position={[w / 2 - 1.4, 0, d / 2 - 1.4]}>
          <mesh position={[0, 0.5, 0]} onClick={handleClick} onPointerOver={handleOver} onPointerOut={handleOut}>
            <boxGeometry args={[2.2, 1, 2.2]} />
            <meshStandardMaterial color="#1c2434" roughness={0.9} />
          </mesh>
          <mesh position={[0, 1.06, 0]}>
            <boxGeometry args={[2.3, 0.08, 2.3]} />
            <meshStandardMaterial color={ENV.plotEdge} emissive={ENV.plotEdge} emissiveIntensity={0.35} />
          </mesh>
          <Html center distanceFactor={44} position={[0, 1.7, 0]} zIndexRange={[8, 0]}>
            <div
              style={{
                fontFamily: "'JetBrains Mono', ui-monospace, Menlo, monospace",
                fontSize: 9,
                color: '#8fa3c4',
                background: 'rgba(6, 9, 20, 0.75)',
                border: '1px solid rgba(90,120,180,0.35)',
                borderRadius: 3,
                padding: '1px 5px',
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
              }}
            >
              +{dir.remainingFiles}
            </div>
          </Html>
        </group>
      )}

      {/* Nameplate — a street sign at the plot edge, not a floating label */}
      <Html center distanceFactor={52} position={[0, 0.6, d / 2 + 2.2]} zIndexRange={[8, 0]}>
        <div
          style={{
            fontFamily: "'JetBrains Mono', ui-monospace, Menlo, monospace",
            fontSize: 10,
            color: hasP0 ? '#ffb3bc' : '#a9bbdd',
            background: 'rgba(6, 9, 20, 0.82)',
            border: `1px solid ${hasP0 ? 'rgba(255,46,77,0.5)' : 'rgba(90,120,180,0.4)'}`,
            borderRadius: 3,
            padding: '2px 7px',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            textAlign: 'center',
          }}
        >
          {dir.name}
          {hasP0 && <span style={{ color: SEVERITY_COLOR.P0, marginLeft: 5 }}>●</span>}
          <span style={{ opacity: 0.6, marginLeft: 6, fontSize: 8 }}>{dir.fileCount}</span>
        </div>
      </Html>
    </group>
  );
}
