"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { CAR_SHAPE, FLEET_LIVERY } from "../city/openWorldStreets";
import { carRoll, driveState, isDriving } from "../city/driveMotion";
import { surfaceHeight } from "../city/worldSurface";
import { useWorldSurface } from "../render/WorldSurface";

/**
 * The car a reader drives.
 *
 * One body, one cabin, four wheels — six meshes for ONE car, deliberately not the
 * fleet's instanced renderer: the fleet draws dozens of cars from four instanced
 * meshes, while a car the reader steers has its own transform, its own lean and
 * its own front wheels. Proportions and paint are the fleet's own (`CAR_SHAPE`,
 * `FLEET_LIVERY`), so this cannot drift into a second kind of vehicle.
 *
 * Visible only while somebody drives: `isDriving()` is the channel the seat
 * writes, so a city nobody drives in gets no extra mesh from this file.
 */
// Inside the body's width (half-width 0,475), not outside it: at 0,62 the four
// wheels stood beside the car like a toy's, which is exactly how the first
// drive frame read.
const WHEEL_PITCH = 0.42;
const FRONT_Z = CAR_SHAPE.wheel.z + 0.28;
const REAR_Z = -(CAR_SHAPE.wheel.z + 0.28);

export function DriveCar() {
  const surface = useWorldSurface();
  const frame = useRef<THREE.Group>(null);
  const frontAxle = useRef<THREE.Group>(null);
  const wheels = useRef<THREE.Mesh[]>([]);
  const odometer = useRef(0);

  const wheelGeo = useMemo(() => {
    const g = new THREE.CylinderGeometry(
      CAR_SHAPE.wheel.r,
      CAR_SHAPE.wheel.r,
      CAR_SHAPE.wheel.t,
      12,
    );
    // A wheel's axle lies across the car, not up it.
    g.rotateX(Math.PI / 2);
    return g;
  }, []);
  const wheelMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#2b2f33", roughness: 0.9, metalness: 0 }),
    [],
  );
  const bodyMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({ color: FLEET_LIVERY[0], roughness: 0.55, metalness: 0.15 }),
    [],
  );
  const cabinMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({ color: FLEET_LIVERY[3], roughness: 0.35, metalness: 0.1 }),
    [],
  );

  useFrame((_state, delta) => {
    const g = frame.current;
    if (!g) return;
    const on = isDriving();
    g.visible = on;
    if (!on) return;
    const st = driveState();
    g.position.set(st.x, surfaceHeight(surface, st.x, st.z), st.z);
    // Yaw first, then the body's outward lean: a cornering car rolls away from
    // the turn, which is the opposite sign to the aircraft's wing-down bank.
    g.rotation.set(0, st.heading, carRoll(st.steer, st.speed), "YXZ");
    if (frontAxle.current) frontAxle.current.rotation.y = st.steer;
    odometer.current += st.speed * Math.min(delta, 0.1);
    const roll = odometer.current / CAR_SHAPE.wheel.r;
    for (const w of wheels.current) if (w) w.rotation.z = roll;
  });

  return (
    <group ref={frame} visible={false} raycast={() => null}>
      {/* Length along z (the nose), width along x — the fleet's numbers, turned
          into the heading convention the drive law speaks. */}
      <mesh material={bodyMat} raycast={() => null} position={[0, CAR_SHAPE.body.y, 0]}>
        <boxGeometry args={[CAR_SHAPE.body.d, CAR_SHAPE.body.h, CAR_SHAPE.body.w]} />
      </mesh>
      <mesh material={cabinMat} raycast={() => null} position={[0, CAR_SHAPE.cabin.y, -0.1]}>
        <boxGeometry args={[CAR_SHAPE.cabin.d, CAR_SHAPE.cabin.h, CAR_SHAPE.cabin.w]} />
      </mesh>
      <group ref={frontAxle}>
        {[-1, 1].map((side) => (
          <mesh
            key={`f${side}`}
            ref={(m) => {
              if (m) wheels.current[side < 0 ? 0 : 1] = m;
            }}
            geometry={wheelGeo}
            material={wheelMat}
            position={[side * WHEEL_PITCH, CAR_SHAPE.wheel.y, FRONT_Z]}
            raycast={() => null}
          />
        ))}
      </group>
      {[-1, 1].map((side) => (
        <mesh
          key={`r${side}`}
          ref={(m) => {
            if (m) wheels.current[side < 0 ? 2 : 3] = m;
          }}
          geometry={wheelGeo}
          material={wheelMat}
          position={[side * WHEEL_PITCH, CAR_SHAPE.wheel.y, REAR_Z]}
          raycast={() => null}
        />
      ))}
    </group>
  );
}
