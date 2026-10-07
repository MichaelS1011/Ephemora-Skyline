"use client";

import { useEffect, useMemo, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { useStore } from "../stores/useStore";
import { getDirLayout, OVERVIEW_FACTOR } from "../city/layout";
import { OPEN_WORLD_DIRECT_STEP, buildOpenWorld } from "../city/openWorldStreets";
import { ENV } from "../city/palette";
import { SkyDome } from "../render/SkyDome";
import { SUN_POSITION } from "../render/sky";
import {
  grownFootprint,
  groundFrameRadius,
  makeGroundMaterial,
  setGroundFrame,
} from "../render/ground";
import { CELL_SPREAD } from "./HeatCells";
import { CameraRig } from "./CameraRig";
import { CityTree } from "./CityTree";
import { Pedestrians } from "./Pedestrians";

/** The empty world's crowd is smaller than a city's, and its street network is
 *  built once at module scope, not per render. */
const OPEN_WORLD_COUNT = 46;

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

  /** The open world's own grid: streets, kerbs, zebra crossings, block pads and
   *  the graph the Ephe's walk on before any folder has been scanned. Built
   *  once — it is deterministic, and a rebuild would move the kerbs under the
   *  figures standing on them. */
  const openWorld = useMemo(() => buildOpenWorld(), []);

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

  const frame = useMemo(() => {
    if (!cityData) return { bounds: 60, centre: { x: 0, z: 0 }, radius: 60 };
    const layout = getDirLayout(cityData, focusPath);
    // The floor's ruler is what actually covers the floor: the far-zoom heat
    // cells overhang their plots by `CELL_SPREAD`, while `bounds` carries the
    // layout's 12-unit street margin. Aiming the ramp at `bounds` made the
    // untouched band drift with the size of the level — see render/ground.ts.
    const radius = groundFrameRadius(
      [
        ...layout.buildings.map((b) => grownFootprint(b, CELL_SPREAD.building)),
        ...layout.blocks.map((b) => grownFootprint(b, CELL_SPREAD.block)),
      ],
      layout.centre,
    );
    return { bounds: layout.bounds, centre: layout.centre, radius };
  }, [cityData, focusPath]);
  const { bounds } = frame;

  // The ground's haze ramp is aimed at the level that is on screen. `centre`,
  // not the world origin: an organic level's buildings sit wherever their
  // Voronoi cells put them.
  const groundMaterial = useMemo(() => makeGroundMaterial(), []);
  useEffect(() => {
    setGroundFrame(groundMaterial, frame.centre, frame.radius);
  }, [groundMaterial, frame.centre, frame.radius]);
  useEffect(() => () => groundMaterial.dispose(), [groundMaterial]);

  return (
    <>
      <CameraRig />

      {/* Soft daylight keeps buildings and citizens readable without glow. */}
      {/* The dome paints the sky; the background colour behind it is only the
          fallback for the frame before the first render, and it is the SAME
          tone the dome converges to at the horizon. */}
      <color attach="background" args={[ENV.skyTop]} />
      <SkyDome />
      <hemisphereLight args={["#e5f4ff", "#9caeb2", 2.2]} />
      <directionalLight position={SUN_POSITION} intensity={2.1} color="#fff4df" />
      <directionalLight position={[-45, 35, -35]} intensity={0.85} color="#c6e4ff" />
      <ambientLight intensity={0.65} />
      {/* Atmosphere scales with the current district size. `near` starts past
          the far edge of the plaza, so the city itself is never hazed away. */}
      <fog attach="fog" args={[ENV.fog, bounds * 2.2, bounds * 4 + 220]} />
      {/* Asphalt ground — graded toward the haze, see render/ground.ts */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} material={groundMaterial}>
        <planeGeometry args={[1200, 1200]} />
      </mesh>

      {/* The Ephe's — ambient citizens. They live on the empty world already
          and keep walking the streets once the city has risen between them.
          Before the first scan the world has its OWN small street network
          (city/openWorldStreets.ts): curbs to walk a graph along, a zebra to
          cross on, a stop to wait at — and therefore a bus and a cab to drive.
          The plates are handed to Pedestrians because the traffic that uses this
          road is driven there, and both worlds then share one box mesh and one
          cylinder mesh for all of it. */}
      {!cityData && (
        <Pedestrians
          streets={openWorld.streets}
          network={openWorld.network}
          streetPlates={openWorld.plates}
          directStep={OPEN_WORLD_DIRECT_STEP}
          count={OPEN_WORLD_COUNT}
          bounds={openWorld.bounds}
        />
      )}

      {cityData && <CityTree />}
    </>
  );
}
