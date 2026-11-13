"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { DirLayout } from "../city/layout";
import { parkedCars, PARKED_GLASS, PARKED_PAINT, PARKED_TYRE } from "../city/streetParking";
import { surfaceMatrix } from "../city/worldSurface";
import { useWorldSurface } from "../render/WorldSurface";
import { useLodFar } from "../hooks/useLodFar";

const dummy = new THREE.Object3D();
const bodyPaint = new THREE.Color();

/**
 * The kerb row: still cars along the street, in the same surface frame as the
 * asphalt and kerbs. Body, glazing, wheels and one flat contact patch share
 * four draw calls no matter how many cars stand. Hidden in the heat-grid tier,
 * where a car is smaller than a tile and would only add flicker.
 */
export function StreetParking({ layout, active = true }: { layout: DirLayout; active?: boolean }) {
  const surface = useWorldSurface();
  const far = useLodFar(layout.bounds);
  const cars = useMemo(() => parkedCars(layout), [layout]);
  const bodyRef = useRef<THREE.InstancedMesh>(null);
  const glassRef = useRef<THREE.InstancedMesh>(null);
  const wheelRef = useRef<THREE.InstancedMesh>(null);
  const shadowRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const body = bodyRef.current;
    const glass = glassRef.current;
    const wheels = wheelRef.current;
    const shadows = shadowRef.current;
    if (!body || !glass || !wheels || !shadows) return;
    dummy.rotation.order = "YXZ";
    cars.forEach((car, i) => {
      dummy.position.set(car.x, 0.34, car.z);
      dummy.rotation.set(0, car.rotY, 0);
      dummy.scale.set(car.length, 0.55, 1.55);
      dummy.updateMatrix();
      body.setMatrixAt(i, surfaceMatrix(surface, dummy.matrix));
      body.setColorAt(i, bodyPaint.set(PARKED_PAINT[car.paint] ?? PARKED_PAINT[0]));
      // A flat contact patch under the body, same yaw and footprint, so the
      // car is planted on the asphalt instead of hovering over it.
      dummy.position.set(car.x, 0.035, car.z);
      dummy.rotation.set(-Math.PI / 2, car.rotY, 0);
      dummy.scale.set(car.length + 0.4, 1.9, 1);
      dummy.updateMatrix();
      shadows.setMatrixAt(i, surfaceMatrix(surface, dummy.matrix));
      dummy.position.set(car.x, 0.86, car.z);
      dummy.scale.set(car.length * 0.54, 0.5, 1.3);
      dummy.updateMatrix();
      glass.setMatrixAt(i, surfaceMatrix(surface, dummy.matrix));
      // Four wheel blocks per car, in the car's own frame: the axis across
      // the body is local Z, so the offsets rotate with the yaw.
      const cos = Math.cos(car.rotY);
      const sin = Math.sin(car.rotY);
      for (let w = 0; w < 4; w++) {
        const lx = (w < 2 ? 1 : -1) * car.length * 0.31;
        const lz = w % 2 === 0 ? 0.68 : -0.68;
        dummy.position.set(car.x + cos * lx + sin * lz, 0.27, car.z - sin * lx + cos * lz);
        dummy.rotation.set(0, car.rotY, 0);
        dummy.scale.set(0.55, 0.54, 0.28);
        dummy.updateMatrix();
        wheels.setMatrixAt(i * 4 + w, surfaceMatrix(surface, dummy.matrix));
      }
    });
    body.count = cars.length;
    glass.count = cars.length;
    wheels.count = cars.length * 4;
    shadows.count = cars.length;
    body.instanceMatrix.needsUpdate = true;
    glass.instanceMatrix.needsUpdate = true;
    wheels.instanceMatrix.needsUpdate = true;
    shadows.instanceMatrix.needsUpdate = true;
    if (body.instanceColor) body.instanceColor.needsUpdate = true;
    dummy.scale.setScalar(1);
  }, [cars, surface]);

  if (!active || far || cars.length === 0) return null;

  return (
    <group>
      <instancedMesh
        ref={shadowRef}
        args={[undefined, undefined, Math.max(1, cars.length)]}
        frustumCulled={false}
        raycast={() => null}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color={PARKED_TYRE} transparent opacity={0.28} depthWrite={false} />
      </instancedMesh>
      <instancedMesh
        ref={bodyRef}
        args={[undefined, undefined, Math.max(1, cars.length)]}
        frustumCulled={false}
        raycast={() => null}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="white" roughness={0.62} metalness={0.18} />
      </instancedMesh>
      <instancedMesh
        ref={glassRef}
        args={[undefined, undefined, Math.max(1, cars.length)]}
        frustumCulled={false}
        raycast={() => null}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={PARKED_GLASS} roughness={0.24} metalness={0.35} />
      </instancedMesh>
      <instancedMesh
        ref={wheelRef}
        args={[undefined, undefined, Math.max(1, cars.length * 4)]}
        frustumCulled={false}
        raycast={() => null}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={PARKED_TYRE} roughness={0.9} />
      </instancedMesh>
    </group>
  );
}
