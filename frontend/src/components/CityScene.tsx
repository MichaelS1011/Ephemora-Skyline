"use client";

import { useMemo } from "react";
import { Stars } from "@react-three/drei";
import { useStore } from "../stores/useStore";
import { getDirLayout } from "../city/layout";
import { ENV } from "../city/palette";
import { CameraRig } from "./CameraRig";
import { CityTree } from "./CityTree";
import { ParticleField } from "./ParticleField";

/**
 * The city at dusk: hemisphere skylight, warm key light, cool fill,
 * stars, fog that scales with the district you are in, and the ground.
 */
export function CityScene() {
  const cityData = useStore((s) => s.cityData);
  const focusPath = useStore((s) => s.focusPath);

  const bounds = useMemo(() => {
    if (!cityData) return 60;
    return getDirLayout(cityData, focusPath).bounds;
  }, [cityData, focusPath]);

  return (
    <>
      <CameraRig />

      {/* Dusk lighting: blue hemisphere sky, warm low sun, cool city glow */}
      <hemisphereLight args={["#42568c", "#0c0f18", 0.9]} />
      <directionalLight position={[60, 55, 30]} intensity={0.6} color="#ffd9a8" />
      <directionalLight position={[-45, 35, -35]} intensity={0.32} color="#7fb0ff" />
      <ambientLight intensity={0.22} />
      {/* Cool city glow pooling over the plaza — deepens the dusk, no shadows */}
      <pointLight
        position={[0, 16, 0]}
        color="#7fb0ff"
        intensity={bounds * 2.4}
        distance={bounds * 2.2 + 60}
        decay={2}
      />

      {/* Atmosphere scales with the current district size */}
      <fog attach="fog" args={[ENV.fog, bounds * 1.4, bounds * 4 + 220]} />
      <Stars radius={260} depth={70} count={2600} factor={3.4} saturation={0} fade speed={0.6} />

      {/* Asphalt ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
        <planeGeometry args={[1200, 1200]} />
        <meshStandardMaterial color={ENV.ground} roughness={0.96} metalness={0.02} />
      </mesh>

      {cityData && <CityTree />}

      <ParticleField count={200} bounds={bounds} />
    </>
  );
}
