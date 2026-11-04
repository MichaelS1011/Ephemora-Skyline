"use client";

import * as THREE from "three";
import { roleLandmarkRoof, type RoleLandmarkKind } from "../city/landmarks";

/**
 * A small role crown drawn on a building's roof. The risk landmark keeps its
 * own beam (`Building.isLandmark`); these props only say what the file DOES in
 * the project. Shared geometries/materials, no assets, no frame loop.
 */

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_CYLINDER = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
const UNIT_CONE = new THREE.ConeGeometry(0.5, 1, 6);
const UNIT_PYRAMID = new THREE.ConeGeometry(0.5, 1, 4);
const UNIT_TORUS = new THREE.TorusGeometry(0.5, 0.14, 6, 12);

const STONE = new THREE.MeshStandardMaterial({ color: "#d8d0bd", roughness: 0.85 });
const ROOF = new THREE.MeshStandardMaterial({ color: "#4f5560", roughness: 0.7, metalness: 0.2 });
const METAL = new THREE.MeshStandardMaterial({ color: "#38425a", roughness: 0.55, metalness: 0.4 });
const BOOK = new THREE.MeshStandardMaterial({ color: "#b88a4a", roughness: 0.8 });
const LIGHT = new THREE.MeshBasicMaterial({ color: "#ffe6b8", toneMapped: false });
const BEAM = new THREE.MeshBasicMaterial({
  color: "#ffe2b0",
  transparent: true,
  opacity: 0.18,
  depthWrite: false,
  side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending,
  toneMapped: false,
});

const WATCH_LEGS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];
const GEAR_TEETH = Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 4);

function Lighthouse({ h }: { h: number }) {
  const towerH = h * 0.9;
  const topY = 0.18 + towerH;
  return (
    <group>
      <mesh
        geometry={UNIT_CYLINDER}
        material={STONE}
        position={[0, 0.09, 0]}
        scale={[0.55, 0.18, 0.55]}
      />
      <mesh
        geometry={UNIT_CYLINDER}
        material={STONE}
        position={[0, 0.18 + towerH / 2, 0]}
        scale={[0.4, towerH, 0.4]}
      />
      <mesh
        geometry={UNIT_CYLINDER}
        material={METAL}
        position={[0, topY + 0.04, 0]}
        scale={[0.52, 0.08, 0.52]}
      />
      <mesh
        geometry={UNIT_CYLINDER}
        material={LIGHT}
        position={[0, topY + 0.22, 0]}
        scale={[0.3, 0.28, 0.3]}
      />
      <mesh
        geometry={UNIT_CONE}
        material={ROOF}
        position={[0, topY + 0.42, 0]}
        scale={[0.44, 0.28, 0.44]}
      />
      <mesh
        geometry={UNIT_CONE}
        material={BEAM}
        position={[0, topY + 1.35, 0]}
        scale={[1.1, 2.2, 1.1]}
      />
    </group>
  );
}

function Library({ h }: { h: number }) {
  const bodyH = h * 0.7;
  return (
    <group>
      <mesh geometry={UNIT_BOX} material={STONE} position={[0, 0.1, 0]} scale={[1.5, 0.2, 1.1]} />
      <mesh
        geometry={UNIT_BOX}
        material={STONE}
        position={[0, 0.2 + bodyH / 2, 0]}
        scale={[1.2, bodyH, 0.9]}
      />
      {[-0.42, 0.42].map((px) => (
        <mesh
          key={px}
          geometry={UNIT_CYLINDER}
          material={STONE}
          position={[px, 0.2 + bodyH / 2, 0.44]}
          scale={[0.08, bodyH * 0.9, 0.08]}
        />
      ))}
      <mesh
        geometry={UNIT_PYRAMID}
        material={ROOF}
        position={[0, 0.2 + bodyH + 0.18, 0]}
        scale={[1.6, 0.36, 1.2]}
        rotation={[0, Math.PI / 4, 0]}
      />
      {[0, 1, 2].map((i) => (
        <mesh
          key={i}
          geometry={UNIT_BOX}
          material={BOOK}
          position={[0.44, 0.23 + i * 0.07, 0.55]}
          scale={[0.34, 0.06, 0.22]}
          rotation={[0, i * 0.12, 0]}
        />
      ))}
    </group>
  );
}

function Watchtower({ h }: { h: number }) {
  const legH = h * 0.45;
  const cabinH = h * 0.3;
  return (
    <group>
      {WATCH_LEGS.map(([sx, sz]) => (
        <mesh
          key={`${sx}-${sz}`}
          geometry={UNIT_BOX}
          material={METAL}
          position={[sx * 0.32, legH / 2, sz * 0.32]}
          scale={[0.06, legH, 0.06]}
        />
      ))}
      <mesh
        geometry={UNIT_BOX}
        material={ROOF}
        position={[0, legH + 0.04, 0]}
        scale={[0.85, 0.08, 0.85]}
      />
      <mesh
        geometry={UNIT_BOX}
        material={STONE}
        position={[0, legH + 0.08 + cabinH / 2, 0]}
        scale={[0.64, cabinH, 0.64]}
      />
      <mesh
        geometry={UNIT_BOX}
        material={METAL}
        position={[0, legH + 0.08 + cabinH + 0.02, 0]}
        scale={[0.72, 0.05, 0.72]}
      />
      <mesh
        geometry={UNIT_PYRAMID}
        material={ROOF}
        position={[0, legH + 0.1 + cabinH + 0.18, 0]}
        scale={[1.0, 0.32, 1.0]}
        rotation={[0, Math.PI / 4, 0]}
      />
    </group>
  );
}

function Factory({ h }: { h: number }) {
  const hallH = Math.min(0.45, h * 0.2);
  return (
    <group>
      <mesh geometry={UNIT_BOX} material={STONE} position={[0, 0.15, 0]} scale={[1.4, 0.3, 1.1]} />
      <mesh
        geometry={UNIT_BOX}
        material={STONE}
        position={[0, 0.3 + hallH / 2, 0]}
        scale={[1.1, hallH, 0.8]}
      />
      <mesh
        geometry={UNIT_CYLINDER}
        material={ROOF}
        position={[0.45, 0.3 + h / 2, 0]}
        scale={[0.22, h, 0.22]}
      />
      <mesh
        geometry={UNIT_CYLINDER}
        material={METAL}
        position={[0.45, 0.3 + h + 0.04, 0]}
        scale={[0.32, 0.08, 0.32]}
      />
      <group position={[-0.32, 1.0, 0.08]}>
        <mesh geometry={UNIT_TORUS} material={METAL} scale={[0.6, 0.6, 0.6]} />
        {GEAR_TEETH.map((a) => (
          <mesh
            key={a}
            geometry={UNIT_BOX}
            material={METAL}
            position={[Math.cos(a) * 0.32, Math.sin(a) * 0.32, 0]}
            rotation={[0, 0, a]}
            scale={[0.1, 0.16, 0.08]}
          />
        ))}
      </group>
    </group>
  );
}

export interface RoleLandmarkProps {
  kind: RoleLandmarkKind;
  x: number;
  z: number;
  h: number;
  w: number;
  d: number;
}

export function RoleLandmark({ kind, x, z, h, w, d }: RoleLandmarkProps) {
  const roof = roleLandmarkRoof(kind, w, d, h);
  return (
    <group position={[x, roof.baseY, z]} scale={roof.scale}>
      {kind === "lighthouse" && <Lighthouse h={roof.bodyHeight} />}
      {kind === "library" && <Library h={roof.bodyHeight} />}
      {kind === "watchtower" && <Watchtower h={roof.bodyHeight} />}
      {kind === "factory" && <Factory h={roof.bodyHeight} />}
    </group>
  );
}
