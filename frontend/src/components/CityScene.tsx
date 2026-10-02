"use client";

import { useEffect, useMemo, useRef } from "react";
import { Stars } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useStore } from "../stores/useStore";
import { constructionStep, getDirLayout } from "../city/layout";
import { ENV } from "../city/palette";
import { CameraRig } from "./CameraRig";
import { CityTree } from "./CityTree";
import { ParticleField } from "./ParticleField";
import { Pedestrians } from "./Pedestrians";

/**
 * The city at dusk: hemisphere skylight, warm key light, cool fill,
 * stars, fog that scales with the district you are in, and the ground.
 */
export function CityScene() {
  const cityData = useStore((s) => s.cityData);
  const focusPath = useStore((s) => s.focusPath);
  const requestFly = useStore((s) => s.requestFly);
  const buildStartedAt = useStore((s) => s.buildStartedAt);
  const { camera } = useThree();
  // Which build the crane flight was armed for — the in-city re-scan keeps
  // CityScene mounted while the city pointer changes, so the flight is
  // coupled to buildStartedAt, not to a session-wide "ever had a city" flag.
  const craneBuildRef = useRef<number | null>(null);

  // Empty world: an establishing shot close enough to SEE the Ephe's
  // strolling the ground — the world feels inhabited before it is built.
  useEffect(() => {
    if (cityData) {
      // City just appeared (new build): start the crane at street level,
      // then glide up to the overview in ONE flight timed to the build
      if (craneBuildRef.current !== buildStartedAt) {
        craneBuildRef.current = buildStartedAt;
        const layout = getDirLayout(cityData, []);
        camera.position.set(14, 2.2, 26);
        camera.lookAt(0, 1.5, 0);
        const unitTotal = layout.blocks.length + layout.buildings.length + (layout.podium ? 1 : 0);
        const flightSeconds = Math.min(
          9,
          Math.max(4, (unitTotal * constructionStep(unitTotal)) / 1000),
        );
        requestFly(0, 0, Math.max(layout.bounds * 1.75, 130), flightSeconds);
      }
      return;
    }
    craneBuildRef.current = null;
    camera.position.set(17, 10, 34);
    camera.lookAt(0, 1, 0);
  }, [cityData, buildStartedAt, camera, requestFly]);

  const bounds = useMemo(() => {
    if (!cityData) return 60;
    return getDirLayout(cityData, focusPath).bounds;
  }, [cityData, focusPath]);

  return (
    <>
      <CameraRig />

      {/* Corporate dusk: warm charcoal sky, ember sun, vermilion city glow */}
      <hemisphereLight args={["#4a463e", "#121210", 0.9]} />
      <directionalLight position={[60, 55, 30]} intensity={0.6} color="#ffd9a8" />
      <directionalLight position={[-45, 35, -35]} intensity={0.32} color="#e8c890" />
      <ambientLight intensity={0.22} />
      {/* Warm city glow pooling over the plaza — deepens the dusk, no shadows */}
      <pointLight
        position={[0, 16, 0]}
        color="#e8a070"
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

      {/* The Ephe's — ambient citizens. They live on the empty world already
          and keep walking the streets once the city has risen between them. */}
      {!cityData && <Pedestrians streets={null} count={46} bounds={42} />}

      {cityData && <CityTree />}

      <ParticleField count={200} bounds={bounds} />
    </>
  );
}
