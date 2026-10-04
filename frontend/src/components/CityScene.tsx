"use client";

import { useEffect, useMemo, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { useStore } from "../stores/useStore";
import { getDirLayout, OVERVIEW_FACTOR } from "../city/layout";
import { ENV } from "../city/palette";
import { CameraRig } from "./CameraRig";
import { CityTree } from "./CityTree";
import { Pedestrians } from "./Pedestrians";

/**
 * A daylight city: broad skylight, warm key light, cool fill,
 * distant haze that scales with the district you are in, and the ground.
 */
export function CityScene() {
  const cityData = useStore((s) => s.cityData);
  const focusPath = useStore((s) => s.focusPath);
  const requestFly = useStore((s) => s.requestFly);
  const buildStartedAt = useStore((s) => s.buildStartedAt);
  const buildPhase = useStore((s) => s.buildPhase);
  const { camera, gl } = useThree();

  // Preserve daylight midtones without clipping light facades.
  useEffect(() => {
    gl.toneMappingExposure = 1.1;
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

      {/* Soft daylight keeps buildings and citizens readable without glow. */}
      {/* The canvas has no clear colour of its own, so past the edge of the
          ground plane the world dissolved into the HUD's page charcoal. */}
      <color attach="background" args={[ENV.skyTop]} />
      <hemisphereLight args={["#e5f4ff", "#9caeb2", 2.2]} />
      <directionalLight position={[60, 55, 30]} intensity={2.1} color="#fff4df" />
      <directionalLight position={[-45, 35, -35]} intensity={0.85} color="#c6e4ff" />
      <ambientLight intensity={0.65} />
      {/* Atmosphere scales with the current district size. `near` starts past
          the far edge of the plaza, so the city itself is never hazed away. */}
      <fog attach="fog" args={[ENV.fog, bounds * 2.2, bounds * 4 + 220]} />
      {/* Asphalt ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
        <planeGeometry args={[1200, 1200]} />
        <meshStandardMaterial color={ENV.ground} roughness={0.96} metalness={0.02} />
      </mesh>

      {/* The Ephe's — ambient citizens. They live on the empty world already
          and keep walking the streets once the city has risen between them. */}
      {!cityData && <Pedestrians streets={null} count={46} bounds={42} />}

      {cityData && <CityTree />}
    </>
  );
}
