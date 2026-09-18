'use client';

import { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { CityFile } from '../city/types';
import { languageColor, ENV } from '../city/palette';
import { useStore } from '../stores/useStore';

// ── Facade textures (shared cache — window grids are expensive) ────────────

interface FacadeTextures {
  map: THREE.CanvasTexture;
  emissive: THREE.CanvasTexture;
}

const facadeCache = new Map<string, FacadeTextures>();

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function getFacadeTextures(color: string, w: number, h: number, alarm: boolean, seed: number): FacadeTextures {
  const key = `${color}|${Math.round(w * 4)}|${Math.round(h * 4)}|${alarm ? 1 : 0}|${seed % 9}`;
  const hit = facadeCache.get(key);
  if (hit) return hit;
  if (facadeCache.size > 500) {
    for (const t of facadeCache.values()) {
      t.map.dispose();
      t.emissive.dispose();
    }
    facadeCache.clear();
  }

  const W = 128;
  const H = 256;
  const wall = new THREE.Color(color).multiplyScalar(0.34);
  const wallHex = `#${wall.getHexString()}`;
  const litColor = alarm ? ENV.windowAlarm : ENV.windowWarm;
  const litCool = alarm ? '#ff8f9a' : ENV.windowCool;

  const rng = mulberry32(seed * 7919 + Math.round(w * 8) + Math.round(h * 3));

  const albedo = document.createElement('canvas');
  albedo.width = W;
  albedo.height = H;
  const aCtx = albedo.getContext('2d')!;
  aCtx.fillStyle = wallHex;
  aCtx.fillRect(0, 0, W, H);

  const emissive = document.createElement('canvas');
  emissive.width = W;
  emissive.height = H;
  const eCtx = emissive.getContext('2d')!;
  eCtx.fillStyle = '#000000';
  eCtx.fillRect(0, 0, W, H);

  const cols = 4;
  const rows = 9;
  const cellW = W / cols;
  const cellH = H / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * cellW + cellW * 0.28;
      const y = r * cellH + cellH * 0.26;
      const ww = cellW * 0.44;
      const wh = cellH * 0.4;
      const lit = rng() < 0.52;
      aCtx.fillStyle = lit ? '#2a2418' : '#0d1017';
      aCtx.fillRect(x, y, ww, wh);
      if (lit) {
        const warm = rng() < 0.82;
        eCtx.fillStyle = warm ? litColor : litCool;
        eCtx.fillRect(x, y, ww, wh);
      }
    }
  }

  const map = new THREE.CanvasTexture(albedo);
  map.colorSpace = THREE.SRGBColorSpace;
  const emissiveMap = new THREE.CanvasTexture(emissive);
  emissiveMap.colorSpace = THREE.SRGBColorSpace;
  const textures = { map, emissive: emissiveMap };
  facadeCache.set(key, textures);
  return textures;
}

// ── Building ───────────────────────────────────────────────────────────────

export interface BuildingProps {
  file: CityFile;
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  isLandmark?: boolean;
  dimmed?: boolean;
  /** Construction cinematic: epoch ms when this building starts to rise. */
  appearAt?: number;
  constructing?: boolean;
  /** When false (district skylines), the tower is decorative: no click/hover. */
  interactive?: boolean;
}

export function Building({ file, x, z, w, d, h, isLandmark = false, dimmed = false, appearAt, constructing = false, interactive = true }: BuildingProps) {
  const setSelectedUnit = useStore((s) => s.setSelectedUnit);
  const selectedUnit = useStore((s) => s.selectedUnit);
  const setHoveredId = useStore((s) => s.setHoveredId);
  const selected = selectedUnit?.kind === 'file' && selectedUnit.id === file.id;

  const facadeColor = languageColor(file.language);
  const alarm = file.threatLevel === 'critical' || file.threatLevel === 'high';
  const seed = useMemo(() => {
    let hash = 0;
    for (let i = 0; i < file.path.length; i++) hash = (hash * 31 + file.path.charCodeAt(i)) | 0;
    return Math.abs(hash);
  }, [file.path]);

  const isTower = h >= 12;
  const stepped = h >= 17;
  const bodyH = stepped ? h * 0.72 : h;
  const towerH = stepped ? h - bodyH : 0;
  const roofType = h < 9 ? 'gable' : 'flat';

  const facade = useMemo(
    () => getFacadeTextures(facadeColor, w, bodyH, alarm, seed),
    [facadeColor, w, bodyH, alarm, seed],
  );

  const materials = useMemo(() => {
    const side = new THREE.MeshStandardMaterial({
      map: facade.map,
      emissiveMap: facade.emissive,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.85,
      roughness: 0.75,
      metalness: 0.1,
      transparent: dimmed,
      opacity: dimmed ? 0.12 : 1,
    });
    const roof = new THREE.MeshStandardMaterial({
      color: '#11141d',
      roughness: 0.9,
      transparent: dimmed,
      opacity: dimmed ? 0.12 : 1,
    });
    return [side, side, roof, roof, side, side];
  }, [facade, dimmed]);

  useEffect(() => {
    return () => {
      for (const m of materials) m.dispose();
    };
  }, [materials]);

  const beaconRef = useRef<THREE.Mesh>(null);
  const beamRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    // Subtle window flicker — the city breathes
    const mat = materials[0] as THREE.MeshStandardMaterial;
    if (!dimmed) mat.emissiveIntensity = 0.82 + Math.sin(t * 0.7 + seed) * 0.07;
    if (beaconRef.current) {
      const s = 0.8 + Math.abs(Math.sin(t * 2.4 + seed)) * 0.6;
      beaconRef.current.scale.setScalar(s);
    }
    if (beamRef.current) {
      const bm = beamRef.current.material as THREE.MeshBasicMaterial;
      bm.opacity = 0.05 + Math.abs(Math.sin(t * 1.3)) * 0.09;
    }
    if (ringRef.current) {
      ringRef.current.rotation.z = t * 0.6;
    }
  });

  const handleClick = (e: { stopPropagation: () => void }): void => {
    e.stopPropagation();
    setSelectedUnit({ kind: 'file', id: file.id });
  };

  const handleOver = (e: { stopPropagation: () => void }): void => {
    e.stopPropagation();
    setHoveredId(file.id);
    document.body.style.cursor = 'pointer';
  };

  const handleOut = (): void => {
    setHoveredId(null);
    document.body.style.cursor = 'auto';
  };

  const pointerProps = interactive
    ? { onClick: handleClick, onPointerOver: handleOver, onPointerOut: handleOut }
    : {};

  const alarmColor = file.threatLevel === 'critical' ? ENV.windowAlarm : '#ff9a3d';

  const groupRef = useRef<THREE.Group>(null);

  // Construction cinematic — the building rises out of the ground
  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;
    if (!constructing || appearAt === undefined) {
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
    const k = Math.min(1, (now - appearAt) / 700);
    const ease = 1 - Math.pow(1 - k, 3);
    g.scale.y = Math.max(0.001, ease);
  });

  return (
    <group ref={groupRef} position={[x, 0, z]}>
      {/* Foundation slab */}
      <mesh position={[0, 0.18, 0]}>
        <boxGeometry args={[w + 0.55, 0.36, d + 0.55]} />
        <meshStandardMaterial color="#0e1219" roughness={0.95} transparent={dimmed} opacity={dimmed ? 0.1 : 1} />
      </mesh>

      {/* Main body */}
      <mesh
        position={[0, bodyH / 2 + 0.3, 0]}
        material={materials}
        {...pointerProps}
      >
        <boxGeometry args={[w, bodyH, d]} />
      </mesh>

      {/* Stepped tower section */}
      {stepped && (
        <mesh
          position={[0, bodyH + 0.3 + towerH / 2, 0]}
          material={materials}
          {...pointerProps}
        >
          <boxGeometry args={[w * 0.62, towerH, d * 0.62]} />
        </mesh>
      )}

      {/* Roof */}
      {roofType === 'gable' ? (
        <mesh position={[0, bodyH + 0.3 + 0.85, 0]} rotation={[0, Math.PI / 4, 0]}>
          <coneGeometry args={[Math.max(w, d) * 0.78, 1.7, 4]} />
          <meshStandardMaterial
            color={new THREE.Color(facadeColor).multiplyScalar(0.5)}
            roughness={0.8}
            transparent={dimmed}
            opacity={dimmed ? 0.12 : 1}
          />
        </mesh>
      ) : (
        <mesh position={[0, bodyH + (stepped ? 0.3 : 0.55) + 0.12, 0]}>
          <boxGeometry args={[w + 0.25, 0.24, d + 0.25]} />
          <meshStandardMaterial color="#171c29" roughness={0.85} transparent={dimmed} opacity={dimmed ? 0.1 : 1} />
        </mesh>
      )}

      {/* Antenna for towers / landmark */}
      {(isTower || isLandmark) && (
        <mesh position={[0, h + (stepped ? 0.6 : 1.0) + 1.3, 0]}>
          <cylinderGeometry args={[0.05, 0.09, 2.4, 6]} />
          <meshStandardMaterial color="#3a4256" roughness={0.6} />
        </mesh>
      )}

      {/* Alarm beacon */}
      {alarm && (
        <mesh ref={beaconRef} position={[0, h + (stepped ? 0.6 : 1.0) + 0.35, 0]}>
          <sphereGeometry args={[0.28, 10, 10]} />
          <meshBasicMaterial color={alarmColor} />
        </mesh>
      )}

      {/* Landmark beam — the lighthouse of the city */}
      {isLandmark && (
        <mesh ref={beamRef} position={[0, h + 22, 0]}>
          <cylinderGeometry args={[0.32, 0.55, 44, 8, 1, true]} />
          <meshBasicMaterial color={ENV.windowAlarm} transparent opacity={0.08} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      )}

      {/* Selection ring */}
      {selected && (
        <mesh ref={ringRef} position={[0, 0.09, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[Math.max(w, d) * 0.72, Math.max(w, d) * 0.95, 40]} />
          <meshBasicMaterial color={ENV.selection} transparent opacity={0.85} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}
