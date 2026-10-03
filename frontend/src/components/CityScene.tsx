"use client";

import { useEffect, useMemo, useRef } from "react";
import { Stars } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useStore } from "../stores/useStore";
import { getDirLayout, OVERVIEW_FACTOR } from "../city/layout";
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
  const buildPhase = useStore((s) => s.buildPhase);
  const { camera, gl } = useThree();

  // ACES has a toe steep enough to floor an entire dusk scene: measured on a
  // built city it left 78 % of all pixels under 20/255, so nothing had shape.
  // The exposure lifts the mid-tones out of the toe while leaving the
  // highlight rolloff that keeps the lit windows from clipping.
  useEffect(() => {
    gl.toneMappingExposure = 1.35;
    return () => {
      gl.toneMappingExposure = 1;
    };
  }, [gl]);
  // Which build the crane flight was armed for — the in-city re-scan keeps
  // CityScene mounted while the city pointer changes, so the flight is
  // coupled to buildStartedAt, not to a session-wide "ever had a city" flag.
  const craneBuildRef = useRef<number | null>(null);
  const overviewRef = useRef<number | null>(null);

  // Empty world: an establishing shot close enough to SEE the Ephe's
  // strolling the ground — the world feels inhabited before it is built.
  useEffect(() => {
    if (cityData) {
      // City just appeared (new build): the crane starts at street level and
      // CityTree keeps it framed on whatever stands while the centre is built
      // and pulls it back as the rings fill (layout.craneShot). Pulling out to
      // the overview here would spend the whole construction flying away from
      // the figures the user came to watch; that reveal is the 'built' effect
      // below.
      if (craneBuildRef.current !== buildStartedAt) {
        craneBuildRef.current = buildStartedAt;
        camera.position.set(14, 2.2, 26);
        camera.lookAt(0, 1.5, 0);
      }
      return;
    }
    craneBuildRef.current = null;
    overviewRef.current = null;
    camera.position.set(17, 10, 34);
    camera.lookAt(0, 1, 0);
  }, [cityData, buildStartedAt, camera, requestFly]);

  // City stands → rise out to the overview the user came for.
  useEffect(() => {
    if (!cityData || buildPhase !== "built") return;
    // only for the build this crane is armed for, and only once
    if (craneBuildRef.current !== buildStartedAt || overviewRef.current === buildStartedAt) return;
    overviewRef.current = buildStartedAt;
    const layout = getDirLayout(cityData, []);
    // The same factor the crane's last shot used, on the one geometry the
    // crane did not include (bounds carries the street margin) — so the
    // handover from crane to reveal is a short, continuous glide.
    requestFly({
      x: 0,
      z: 0,
      distance: Math.max(layout.bounds * OVERVIEW_FACTOR, 130),
      duration: 2.6,
    });
  }, [cityData, buildPhase, buildStartedAt, requestFly]);

  const bounds = useMemo(() => {
    if (!cityData) return 60;
    return getDirLayout(cityData, focusPath).bounds;
  }, [cityData, focusPath]);

  return (
    <>
      <CameraRig />

      {/* Corporate dusk: warm charcoal sky, ember sun, vermilion city glow */}
      {/* The canvas has no clear colour of its own, so past the edge of the
          ground plane the world dissolved into the HUD's page charcoal. */}
      <color attach="background" args={[ENV.skyTop]} />
      <hemisphereLight args={["#5d594d", "#2a2823", 1.2]} />
      <directionalLight position={[60, 55, 30]} intensity={0.9} color="#ffd9a8" />
      <directionalLight position={[-45, 35, -35]} intensity={0.5} color="#e8c890" />
      <ambientLight intensity={0.5} />
      {/* Warm city glow pooling over the plaza — deepens the dusk, no shadows */}
      <pointLight
        position={[0, 16, 0]}
        color="#e8a070"
        intensity={bounds * 2.4}
        distance={bounds * 2.2 + 60}
        decay={2}
      />

      {/* Atmosphere scales with the current district size. `near` starts past
          the far edge of the plaza, so the city itself is never hazed away. */}
      <fog attach="fog" args={[ENV.fog, bounds * 2.2, bounds * 4 + 220]} />
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
