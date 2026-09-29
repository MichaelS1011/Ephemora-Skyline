"use client";

import { useMemo, useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { CityFile } from "../city/types";
import { languageColor, ENV } from "../city/palette";
import { materialState, erosionState } from "../city/mapping";
import { useStore } from "../stores/useStore";

// ── Facade textures (shared cache — window grids are expensive) ────────────

interface FacadeTextures {
  map: THREE.CanvasTexture;
  emissive: THREE.CanvasTexture;
}

const facadeCache = new Map<string, FacadeTextures>();
const FACADE_CACHE_MAX = 2000;

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

function getFacadeTextures(
  color: string,
  w: number,
  h: number,
  alarm: boolean,
  seed: number,
): FacadeTextures {
  // v2: ground-floor plinth, windowless parapet row, dark floors, lintel bands
  const key = `v2|${color}|${Math.round(w * 4)}|${Math.round(h * 4)}|${alarm ? 1 : 0}|${seed % 9}`;
  const hit = facadeCache.get(key);
  if (hit) {
    // LRU refresh — eviction must target the least-recently-used entry,
    // never dispose textures still referenced by active materials
    facadeCache.delete(key);
    facadeCache.set(key, hit);
    return hit;
  }
  while (facadeCache.size >= FACADE_CACHE_MAX) {
    const oldestKey = facadeCache.keys().next().value;
    if (oldestKey === undefined) break;
    const oldest = facadeCache.get(oldestKey);
    if (oldest) {
      oldest.map.dispose();
      oldest.emissive.dispose();
    }
    facadeCache.delete(oldestKey);
  }

  const W = 128;
  const H = 256;
  const wall = new THREE.Color(color).multiplyScalar(0.34);
  const wallHex = `#${wall.getHexString()}`;
  const litColor = alarm ? ENV.windowAlarm : ENV.windowWarm;
  const litCool = alarm ? "#ff8f9a" : ENV.windowCool;

  const rng = mulberry32(seed * 7919 + Math.round(w * 8) + Math.round(h * 3));

  const albedo = document.createElement("canvas");
  albedo.width = W;
  albedo.height = H;
  const aCtx = albedo.getContext("2d")!;
  aCtx.fillStyle = wallHex;
  aCtx.fillRect(0, 0, W, H);

  const emissive = document.createElement("canvas");
  emissive.width = W;
  emissive.height = H;
  const eCtx = emissive.getContext("2d")!;
  eCtx.fillStyle = "#000000";
  eCtx.fillRect(0, 0, W, H);

  const cols = 4;
  // Row 0 = windowless parapet / roof line, rows 1..8 = floors,
  // row 9 = ground floor (storefront zone) — reads as a real base.
  const rows = 10;
  const cellW = W / cols;
  const cellH = H / rows;

  // Ground-floor plinth band: slightly darker + more neutral than the facade
  const plinth = new THREE.Color(wallHex).multiplyScalar(0.72);
  aCtx.fillStyle = `#${plinth.getHexString()}`;
  aCtx.fillRect(0, H - cellH * 1.15, W, cellH * 1.15);

  // Subtle lintel colour (a touch lighter than the wall) for window heads
  const lintel = new THREE.Color(wallHex).lerp(new THREE.Color("#ffffff"), 0.09);
  const lintelHex = `#${lintel.getHexString()}`;

  // Occasional fully dark floors (offices with the lights off)
  const darkFloor: boolean[] = [];
  for (let r = 0; r < rows; r++) darkFloor.push(rng() < 0.09);

  for (let r = 1; r <= 9; r++) {
    const ground = r === 9;
    for (let c = 0; c < cols; c++) {
      const x = c * cellW + cellW * 0.28;
      const y = r * cellH + cellH * 0.26;
      const ww = ground ? cellW * 0.56 : cellW * 0.44;
      const wh = ground ? cellH * 0.46 : cellH * 0.4;

      // Lintel band above the window head
      aCtx.fillStyle = lintelHex;
      aCtx.fillRect(x, y - cellH * 0.05, ww, Math.max(1.5, cellH * 0.05));

      const lit = ground ? rng() < 0.2 : !darkFloor[r] && rng() < 0.52;
      aCtx.fillStyle = ground ? "#07090d" : lit ? "#2a2418" : "#0d1017";
      aCtx.fillRect(x, y, ww, wh);
      if (lit) {
        const warm = ground ? rng() < 0.95 : rng() < 0.82;
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

// ── Shared detail resources (module-level, NEVER disposed per building) ────
// Rooftop clutter reuses one unit box + one unit cylinder, scaled per mesh —
// zero extra geometry allocations and at most +2 meshes per building.

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_CYLINDER = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);

const DETAIL_MATERIALS = {
  metal: new THREE.MeshStandardMaterial({ color: "#2a3244", roughness: 0.6, metalness: 0.35 }),
  dark: new THREE.MeshStandardMaterial({ color: "#161c29", roughness: 0.9 }),
};
const DETAIL_MATERIALS_DIMMED = {
  metal: new THREE.MeshStandardMaterial({
    color: "#2a3244",
    roughness: 0.6,
    metalness: 0.35,
    transparent: true,
    opacity: 0.12,
  }),
  dark: new THREE.MeshStandardMaterial({
    color: "#161c29",
    roughness: 0.9,
    transparent: true,
    opacity: 0.12,
  }),
};

// Radial ground glow under the selected building (one shared texture)
let groundGlowTexture: THREE.CanvasTexture | null = null;
function getGroundGlowTexture(): THREE.CanvasTexture {
  if (groundGlowTexture) return groundGlowTexture;
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,0.85)");
  g.addColorStop(0.35, "rgba(255,255,255,0.3)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  groundGlowTexture = new THREE.CanvasTexture(c);
  return groundGlowTexture;
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

export function Building({
  file,
  x,
  z,
  w,
  d,
  h,
  isLandmark = false,
  dimmed = false,
  appearAt,
  constructing = false,
  interactive = true,
}: BuildingProps) {
  const setSelectedUnit = useStore((s) => s.setSelectedUnit);
  const selectedUnit = useStore((s) => s.selectedUnit);
  const setHoveredId = useStore((s) => s.setHoveredId);
  const selected = selectedUnit?.kind === "file" && selectedUnit.id === file.id;

  const cityMeta = useStore((s) => s.cityData?.meta);
  const facadeColor = languageColor(file.language);
  const alarm = file.threatLevel === "critical" || file.threatLevel === "high";
  // Metric→visual mapping: graphite (healthy) / glass (dead code) / alarm
  const matState = materialState(file);
  const erosion = erosionState(file, cityMeta);
  // Category 1 (structure): raw bytes — bloat LOC hides renders as a
  // massive near-black monolith regardless of language
  const monolith = (file.bytes ?? 0) >= 150_000;
  // Category 6 (testing): a solid coverage report shields the building;
  // live test results override it — failures crack the shield open
  const testResult = useStore((s) => s.testResults[file.path]);
  const shielded =
    (cityMeta?.coverage ?? false) &&
    (file.coveragePct ?? 0) >= 80 &&
    testResult?.status !== "failed";
  const testsFailing = testResult?.status === "failed";
  const testsPassing = testResult?.status === "passed";
  // Category 2 (statics): circular import — red warning ring at the base
  const inCycle = (cityMeta?.cycles ?? false) && !!file.inCycle;
  const seed = useMemo(() => {
    let hash = 0;
    for (let i = 0; i < file.path.length; i++) hash = (hash * 31 + file.path.charCodeAt(i)) | 0;
    return Math.abs(hash);
  }, [file.path]);

  const isTower = h >= 12;
  const stepped = h >= 17;
  const bodyH = stepped ? h * 0.72 : h;
  const towerH = stepped ? h - bodyH : 0;
  const roofType = h < 9 ? "gable" : "flat";

  // ── Deterministic per-building variety (same seed → same city) ──────────
  // At most +2 extra meshes: one rooftop clutter item + optionally an annex.
  const vrng = mulberry32((seed ^ 0x51ab) >>> 0);
  const clutterRoll = vrng();
  const clutter: "tank" | "ac" | "vent" | "chimney" | "none" =
    roofType === "flat"
      ? clutterRoll < 0.26
        ? "tank"
        : clutterRoll < 0.58
          ? "ac"
          : clutterRoll < 0.78
            ? "vent"
            : "none"
      : clutterRoll < 0.35
        ? "chimney"
        : "none";
  const spread = stepped ? 0.3 : 0.42;
  const clutterX = (vrng() - 0.5) * w * spread;
  const clutterZ = (vrng() - 0.5) * d * spread;
  // Rooftop clutter sits on the tower deck when stepped, else on the roof slab
  const clutterBaseY = stepped ? h + 0.34 : bodyH + 0.55 + 0.26;
  const antennaH = 1.8 + ((seed % 97) / 97) * 1.8;
  const antennaOffX = ((seed % 13) - 6) * 0.07;

  // Occasional annex — a lower wing against the main volume (Sims-like massing)
  const annexRoll = vrng();
  const hasAnnex = !stepped && h >= 4 && h <= 15 && w >= 2.2 && d >= 2.2 && annexRoll < 0.24;
  const annexW = Math.max(1.1, w * 0.34);
  const annexD = Math.max(1.1, d * 0.34);
  const annexH = Math.max(1.4, h * (0.3 + vrng() * 0.18));
  const annexX = (w + annexW) / 2 - 0.12;
  const annexZ = (vrng() - 0.5) * Math.max(0, d - annexD) * 0.8;

  // Glass buildings (dead code) need no facade textures at all
  const facade = useMemo(
    () => (matState === "glass" ? null : getFacadeTextures(facadeColor, w, bodyH, alarm, seed)),
    [matState, facadeColor, w, bodyH, alarm, seed],
  );

  const materials = useMemo(() => {
    if (monolith) {
      // Bloat monolith: near-black, featureless slab — reads as wasted space
      const side = new THREE.MeshStandardMaterial({
        color: "#0c0c0b",
        roughness: 0.35,
        metalness: 0.55,
        transparent: dimmed,
        opacity: dimmed ? 0.12 : 1,
      });
      const roof = new THREE.MeshStandardMaterial({
        color: "#0a0a09",
        roughness: 0.3,
        metalness: 0.6,
        transparent: dimmed,
        opacity: dimmed ? 0.1 : 1,
      });
      return [side, side, roof, roof, side, side];
    }
    if (matState === "glass") {
      const side = new THREE.MeshPhysicalMaterial({
        color: "#d8cdb4",
        roughness: 0.12,
        metalness: 0.05,
        transparent: true,
        opacity: dimmed ? 0.05 : 0.26,
        transmission: 0.55,
        thickness: 0.6,
      });
      const roof = new THREE.MeshStandardMaterial({
        color: "#1a2530",
        roughness: 0.4,
        transparent: true,
        opacity: dimmed ? 0.08 : 0.45,
      });
      return [side, side, roof, roof, side, side];
    }
    const side = new THREE.MeshStandardMaterial({
      map: facade!.map,
      emissiveMap: facade!.emissive,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: matState === "alarm" ? 1.15 : 0.55,
      // Eroded hotspots read as rough, coarse concrete; healthy code as
      // smooth matte graphite. Language stays as the window-glow accent.
      roughness: erosion === "eroded" ? 0.97 : erosion === "weathered" ? 0.94 : 0.82,
      metalness: 0.06,
      transparent: dimmed,
      opacity: dimmed ? 0.12 : 1,
    });
    const roof = new THREE.MeshStandardMaterial({
      color: erosion === "stable" || erosion === "unknown" ? "#191917" : "#171310",
      roughness: 0.9,
      transparent: dimmed,
      opacity: dimmed ? 0.12 : 1,
    });
    return [side, side, roof, roof, side, side];
  }, [facade, dimmed, matState, erosion, monolith]);

  useEffect(() => {
    return () => {
      for (const m of materials) m.dispose();
    };
  }, [materials]);

  const beaconRef = useRef<THREE.Mesh>(null);
  const beamRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const cycleRef = useRef<THREE.Mesh>(null);
  const groupRef = useRef<THREE.Group>(null);
  // Construction cinematic finished — stop touching scale every frame
  const buildDoneRef = useRef(false);
  // Hover highlight: target 0/1, eased toward every frame (no React re-render)
  const hoverTargetRef = useRef(0);
  const hoverGlowRef = useRef(0);

  // Single frame callback per building (flicker + hover + construction combined)
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;

    // Construction cinematic — the building rises out of the ground
    const g = groupRef.current;
    if (g && !buildDoneRef.current) {
      if (!constructing || appearAt === undefined) {
        if (g.scale.y !== 1) g.scale.y = 1;
        g.visible = true;
        buildDoneRef.current = true;
      } else {
        const now = Date.now();
        if (now < appearAt) {
          g.visible = false;
        } else {
          g.visible = true;
          const k = Math.min(1, (now - appearAt) / 700);
          const ease = 1 - Math.pow(1 - k, 3);
          g.scale.y = Math.max(0.001, ease);
          if (k >= 1) buildDoneRef.current = true;
        }
      }
    }

    // Subtle window flicker — the city breathes. Hover eases in a warm boost
    // on top of the flicker baseline instead of fighting it. Glass has no
    // emissive map — nothing to flicker.
    const mat = materials[0] as THREE.MeshStandardMaterial;
    if (!dimmed && matState !== "glass") {
      const target = hoverTargetRef.current;
      const cur = hoverGlowRef.current;
      const next = Math.abs(target - cur) < 0.005 ? target : cur + (target - cur) * 0.16;
      hoverGlowRef.current = next;
      mat.emissiveIntensity = 0.82 + next * 0.75 + Math.sin(t * 0.7 + seed) * 0.07;
    }
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
    if (cycleRef.current) {
      cycleRef.current.rotation.z = t * 1.4;
    }
    if (glowRef.current) {
      const gm = glowRef.current.material as THREE.MeshBasicMaterial;
      gm.opacity = 0.34 + Math.sin(t * 2.2) * 0.14;
    }
  });

  const handleClick = (e: { stopPropagation: () => void }): void => {
    e.stopPropagation();
    setSelectedUnit({ kind: "file", id: file.id });
  };

  const handleOver = (e: { stopPropagation: () => void }): void => {
    e.stopPropagation();
    hoverTargetRef.current = 1;
    setHoveredId(file.id);
    document.body.style.cursor = "pointer";
  };

  const handleOut = (): void => {
    hoverTargetRef.current = 0;
    setHoveredId(null);
    document.body.style.cursor = "auto";
  };

  // Unmount while hovered would leak the pointer cursor
  useEffect(() => {
    return () => {
      if (hoverTargetRef.current === 1) document.body.style.cursor = "auto";
    };
  }, []);

  const pointerProps = interactive
    ? { onClick: handleClick, onPointerOver: handleOver, onPointerOut: handleOut }
    : {};

  const alarmColor = file.threatLevel === "critical" ? ENV.windowAlarm : "#ff9a3d";
  const detailMats = dimmed ? DETAIL_MATERIALS_DIMMED : DETAIL_MATERIALS;

  return (
    <group ref={groupRef} position={[x, 0, z]}>
      {/* Foundation slab */}
      <mesh position={[0, 0.18, 0]}>
        <boxGeometry args={[w + 0.55, 0.36, d + 0.55]} />
        <meshStandardMaterial
          color="#141412"
          roughness={0.95}
          transparent={dimmed}
          opacity={dimmed ? 0.1 : 1}
        />
      </mesh>

      {/* Main body */}
      <mesh position={[0, bodyH / 2 + 0.3, 0]} material={materials} {...pointerProps}>
        <boxGeometry args={[w, bodyH, d]} />
      </mesh>

      {/* Stepped tower section */}
      {stepped && (
        <mesh position={[0, bodyH + 0.3 + towerH / 2, 0]} material={materials} {...pointerProps}>
          <boxGeometry args={[w * 0.62, towerH, d * 0.62]} />
        </mesh>
      )}

      {/* Occasional annex — lower wing reusing the body's facade materials */}
      {hasAnnex && (
        <mesh position={[annexX, annexH / 2 + 0.3, annexZ]} material={materials} {...pointerProps}>
          <boxGeometry args={[annexW, annexH, annexD]} />
        </mesh>
      )}

      {/* Git erosion: warning band + scaffolding on churn hotspots */}
      {(erosion === "eroded" || erosion === "weathered") && (
        <group>
          <mesh position={[0, 0.62, 0]}>
            <boxGeometry args={[w + 0.34, 0.44, d + 0.34]} />
            <meshStandardMaterial
              color="#ff9a3d"
              emissive="#ff9a3d"
              emissiveIntensity={0.32}
              roughness={0.6}
              transparent={dimmed}
              opacity={dimmed ? 0.1 : 1}
            />
          </mesh>
          {erosion === "eroded" &&
            (
              [
                [-1, -1],
                [1, -1],
                [-1, 1],
                [1, 1],
              ] as const
            ).map(([sx, sz]) => (
              <mesh
                key={`${sx}${sz}`}
                position={[sx * (w / 2 + 0.24), (bodyH + 0.3) / 2 + 0.5, sz * (d / 2 + 0.24)]}
              >
                <cylinderGeometry args={[0.09, 0.09, bodyH + 0.9, 6]} />
                <meshStandardMaterial
                  color="#c7cdd8"
                  roughness={0.5}
                  metalness={0.4}
                  transparent={dimmed}
                  opacity={dimmed ? 0.1 : 0.85}
                />
              </mesh>
            ))}
        </group>
      )}

      {/* Live test result: failures crack the building (red wireframe), passes glow green at the base */}
      {testsFailing && (
        <mesh position={[0, (h + 0.3) / 2 + 0.4, 0]}>
          <boxGeometry args={[w + 1.3, h + 1.6, d + 1.3]} />
          <meshBasicMaterial
            color="#ff2e4d"
            wireframe
            transparent
            opacity={dimmed ? 0.1 : 0.55}
            toneMapped={false}
          />
        </mesh>
      )}
      {testsPassing && (
        <mesh position={[0, 0.32, 0]}>
          <boxGeometry args={[w + 0.8, 0.3, d + 0.8]} />
          <meshStandardMaterial
            color="#29d398"
            emissive="#29d398"
            emissiveIntensity={0.4}
            roughness={0.5}
          />
        </mesh>
      )}

      {/* Test coverage shield — well-tested code sits inside a light-blue field */}
      {shielded && (
        <mesh position={[0, (h + 0.3) / 2 + 0.4, 0]}>
          <boxGeometry args={[w + 1.1, h + 1.4, d + 1.1]} />
          <meshPhysicalMaterial
            color="#d8c9a3"
            transparent
            opacity={dimmed ? 0.05 : 0.14}
            roughness={0.05}
            transmission={0.7}
            thickness={0.4}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* Circular import warning: slowly rotating red ring at the base */}
      {inCycle && (
        <mesh ref={cycleRef} position={[0, 0.12, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[Math.max(w, d) * 0.95, 0.09, 8, 40]} />
          <meshStandardMaterial
            color="#ff2e4d"
            emissive="#ff2e4d"
            emissiveIntensity={0.9}
            toneMapped={false}
          />
        </mesh>
      )}

      {/* Roof */}
      {roofType === "gable" ? (
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
          <meshStandardMaterial
            color="#171c29"
            roughness={0.85}
            transparent={dimmed}
            opacity={dimmed ? 0.1 : 1}
          />
        </mesh>
      )}

      {/* Rooftop clutter — one seeded item: water tank / AC unit / vent / chimney */}
      {clutter === "tank" && (
        <mesh
          geometry={UNIT_CYLINDER}
          material={detailMats.metal}
          position={[clutterX, clutterBaseY + 0.5, clutterZ]}
          scale={[0.9, 1.0, 0.9]}
        />
      )}
      {clutter === "ac" && (
        <mesh
          geometry={UNIT_BOX}
          material={detailMats.metal}
          position={[clutterX, clutterBaseY + 0.28, clutterZ]}
          scale={[1.0, 0.55, 0.8]}
        />
      )}
      {clutter === "vent" && (
        <mesh
          geometry={UNIT_BOX}
          material={detailMats.dark}
          position={[clutterX, clutterBaseY + 0.35, clutterZ]}
          scale={[0.45, 0.7, 0.45]}
        />
      )}
      {clutter === "chimney" && (
        <mesh
          geometry={UNIT_BOX}
          material={detailMats.dark}
          position={[w * 0.26, bodyH + 0.3 + 1.0, d * 0.26]}
          scale={[0.4, 1.1, 0.4]}
        />
      )}

      {/* Antenna for towers / landmark — height + offset vary per seed */}
      {(isTower || isLandmark) && (
        <mesh position={[antennaOffX, h + (stepped ? 0.6 : 1.0) + antennaH / 2, antennaOffX]}>
          <cylinderGeometry args={[0.05, 0.09, antennaH, 6]} />
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
        <>
          <mesh ref={beamRef} position={[0, h + 22, 0]}>
            <cylinderGeometry args={[0.32, 0.55, 44, 8, 1, true]} />
            <meshBasicMaterial
              color={ENV.windowAlarm}
              transparent
              opacity={0.08}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
          {/* Warm street-level glow pooling around the landmark (no shadows) */}
          <pointLight
            position={[0, Math.min(h * 0.6, 10), 0]}
            color="#ffd9a8"
            intensity={h * 4}
            distance={h * 6 + 40}
            decay={2}
          />
        </>
      )}

      {/* Selection ring + pooled ground glow */}
      {selected && (
        <>
          <mesh ref={ringRef} position={[0, 0.09, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[Math.max(w, d) * 0.72, Math.max(w, d) * 0.95, 40]} />
            <meshBasicMaterial
              color={ENV.selection}
              transparent
              opacity={0.85}
              side={THREE.DoubleSide}
            />
          </mesh>
          <mesh ref={glowRef} position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[Math.max(w, d) * 3.4, Math.max(w, d) * 3.4]} />
            <meshBasicMaterial
              map={getGroundGlowTexture()}
              color={ENV.selection}
              transparent
              opacity={0.4}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        </>
      )}
    </group>
  );
}
