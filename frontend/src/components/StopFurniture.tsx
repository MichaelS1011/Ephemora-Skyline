import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import type { Transit } from "../city/openWorldStreets";
import { stopFurnitureParts, stopFurniturePose } from "../city/stopFurniture";

interface StopFurnitureProps {
  /** The kerb point the stop sign already stands on. */
  transit: Transit;
  /** A hamlet still gets a bench and a bin; a bus line also gets a shelter. */
  bus: boolean;
}

const _matrix = new THREE.Object3D();
const _color = new THREE.Color();

/**
 * Street furniture at the stop sign. The sign itself is one instanced plate in
 * `Pedestrians`; this group adds the things a rider stands beside — a bench, a
 * bin, and, once the street runs a bus, a shallow shelter. All boxes share one
 * unit geometry and one material, so a stop costs one draw call and the layout
 * is pure/testable in `city/stopFurniture.ts`.
 */
export function StopFurniture({ transit, bus }: StopFurnitureProps) {
  const pose = useMemo(() => stopFurniturePose(transit), [transit]);
  const parts = useMemo(() => stopFurnitureParts(bus), [bus]);
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    parts.forEach((part, i) => {
      _matrix.position.set(part.x, part.y, part.z);
      _matrix.scale.set(part.w, part.h, part.d);
      _matrix.updateMatrix();
      mesh.setMatrixAt(i, _matrix.matrix);
      mesh.setColorAt(i, _color.set(part.color));
    });
    mesh.count = parts.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [parts]);

  return (
    <group position={[pose.x, 0.02, pose.z]} rotation={[0, pose.rotY, 0]}>
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, Math.max(1, parts.length)]}
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="white" roughness={0.86} metalness={0.04} />
      </instancedMesh>
    </group>
  );
}
