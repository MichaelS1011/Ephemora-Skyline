"use client";

import { useEffect, useMemo, useRef } from "react";
import { useThree } from "@react-three/fiber";
import type { PerspectiveCamera } from "three";
import { useStore } from "../stores/useStore";
import { defaultOverviewPath } from "../city/overview";
import { armRevealPulse, getDirLayout, overviewShot, REVEAL_FLIGHT_MS } from "../city/layout";
import { prefersReducedMotion } from "../city/motion";
import { OPEN_WORLD_DIRECT_STEP, buildOpenWorld } from "../city/openWorldStreets";
import { ENV } from "../city/palette";
import { FLAT_SURFACE, surfaceForLayout } from "../city/worldSurface";
import { WorldSurfaceContext } from "../render/WorldSurface";
import { SkyDome } from "../render/SkyDome";
import { SUN_POSITION } from "../render/sky";
import {
  grownFootprint,
  groundFrameRadius,
  makeGroundMaterial,
  setGroundFrame,
  makeSurfaceGroundGeometry,
} from "../render/ground";
import { CELL_SPREAD } from "./HeatCells";
import { CameraRig } from "./CameraRig";
import { CityTree } from "./CityTree";
import { Pedestrians } from "./Pedestrians";
import "../design/world.css";

/** How long a lost context gets to restore itself before the app offers a rebuild. */
const CONTEXT_RESTORE_WAIT_MS = 1500;

/** The empty world's crowd is smaller than a city's, and its street network is
 *  built once at module scope, not per render. */
const OPEN_WORLD_COUNT = 46;

/**
 * The atmosphere's near and far plane, in world units, for a level of `bounds`.
 *
 * Exported because the number is a contract, not a taste: the far-zoom heat
 * grid is unlit and sits on this floor, and `tests/worldPicture.test.ts` holds
 * the fog to being a thin wash at the distance where that grid is on screen
 * (the far-LOD exit) and at the outer clamp the camera is built with. At the
 * shipped `bounds * 2.2 / bounds * 4 + 220` the level behind the grid reached a
 * rendered floor of #314248 — darker than the `safe` tile on it — and the two
 * calmest heat levels fell to 1.0 and 2.07 contrast against their own ground.
 */
export function fogRange(bounds: number): [number, number] {
  return [bounds * 6, bounds * 9 + 600];
}

/**
 * The frame's own grade — see `design/world.css`.
 *
 * It lives here because this is the component that owns what the picture is
 * lit by, and it is DOM because the grade must not depend on which rendering
 * path the graphics preference chose. It is built imperatively rather than
 * returned as JSX: inside `<Canvas>` the reconciler is three's, and a `<div>`
 * reaching it is a boot error, not a portal.
 */
function WorldGrade() {
  const { gl } = useThree();
  useEffect(() => {
    const host = gl.domElement.parentElement;
    if (!host) return;
    const el = document.createElement("div");
    el.className = "world-grade";
    el.setAttribute("aria-hidden", "true");
    host.appendChild(el);
    return () => {
      el.remove();
    };
  }, [gl]);
  return null;
}

/**
 * The world at the end of the day: the model lit to its own values, the
 * atmosphere behind it, and a screen-space grade that costs no GPU frame.
 *
 * The lights used to sum to ~1.5× over the surfaces they fell on — measured:
 * the ground plane rendered at 220 of 255 while its own albedo is 183, and the
 * frame's brightest object was a zebra crossing. A city whose floor is brighter
 * than its facades cannot carry a measurement, so the key light now does the
 * shaping and the ambient term stops washing it out. `toneMappingExposure`
 * dropped with it, for the same reason: the midtones were sitting in the
 * shoulder of the curve, where ACES desaturates hardest — which is the other
 * half of why twenty-four language colours arrived on screen as four.
 */
export function CityScene() {
  const cityData = useStore((s) => s.cityData);
  const focusPath = useStore((s) => s.focusPath);
  const requestFly = useStore((s) => s.requestFly);
  const poseRequest = useStore((s) => s.poseRequest);
  const buildStartedAt = useStore((s) => s.buildStartedAt);
  const buildPhase = useStore((s) => s.buildPhase);
  const { camera, gl } = useThree();

  /**
   * A graphics context the browser takes away is not an exception — nothing
   * throws, the canvas simply keeps its last frame while the renderer goes
   * quiet, and the chrome around it goes on stating "1 of 6 plots carries a
   * critical finding" over an empty picture. Measured: 87 KB of city before,
   * 5 KB of flat ground after, no sentence anywhere. Restoring the context is
   * the browser's own call, so the honest answer is to say what happened and
   * offer to rebuild the canvas, not to wait.
   */
  const onContextLost = useStore((s) => s.onContextLost);
  const onContextRestored = useStore((s) => s.onContextRestored);
  useEffect(() => {
    const canvas = gl.domElement;
    // three's own `forceContextRestore()` answers synchronously and sets its
    // internal flag to "restored" while the frames stay empty (measured — it
    // is what three calls in `onContextRestore` before `initGLContext()` has
    // anything to draw with). A restore is therefore only believed once the
    // canvas says `webglcontextrestored`; until then the reader sees the
    // sentence instead of a frame that pretends to be a city.
    let restoreTimer = 0;
    const lost = (event: Event): void => {
      // without preventDefault the browser never even offers a restore
      event.preventDefault();
      onContextLost?.();
      window.clearTimeout(restoreTimer);
      restoreTimer = window.setTimeout(() => onContextLost?.(), CONTEXT_RESTORE_WAIT_MS);
    };
    const restored = (): void => {
      window.clearTimeout(restoreTimer);
      onContextRestored?.();
    };
    canvas.addEventListener("webglcontextlost", lost);
    canvas.addEventListener("webglcontextrestored", restored);
    return () => {
      window.clearTimeout(restoreTimer);
      canvas.removeEventListener("webglcontextlost", lost);
      canvas.removeEventListener("webglcontextrestored", restored);
    };
  }, [gl, onContextLost, onContextRestored]);

  /** The open world's own grid: streets, kerbs, zebra crossings, block pads and
   *  the graph the Ephe's walk on before any folder has been scanned. Built
   *  once — it is deterministic, and a rebuild would move the kerbs under the
   *  figures standing on them. */
  const openWorld = useMemo(() => buildOpenWorld(), []);

  // Keep the model at its own values instead of lifting it into the shoulder
  // of the tone curve, where the language colours collapse into each other.
  useEffect(() => {
    gl.toneMappingExposure = 1.0;
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
        const { centre } = getDirLayout(cityData, defaultOverviewPath(cityData));
        // Frontal establishing shot: the camera starts close and low, looking
        // straight at the construction from a human eye-line. As buildings rise,
        // the crane pulls back smoothly to the presentation distance — the zoom
        // out IS the reveal, not a separate flight after it.
        camera.position.set(centre.x + 14, 6, centre.z + 18);
        camera.lookAt(centre.x, 2.5, centre.z);
      }
      return;
    }
    craneBuildRef.current = null;
    overviewRef.current = null;
    camera.position.set(17, 10, 34);
    camera.lookAt(0, 1, 0);
  }, [cityData, buildStartedAt, camera, requestFly]);

  // City stands → fly to the presentation view. The crane pulled back during
  // construction; this final flight settles the camera into the frontal
  // overview position the user sees when interacting with the finished city.
  useEffect(() => {
    if (!cityData || buildPhase !== "built") return;
    if (craneBuildRef.current !== buildStartedAt || overviewRef.current === buildStartedAt) return;
    overviewRef.current = buildStartedAt;
    if (poseRequest) return;
    const layout = getDirLayout(cityData, defaultOverviewPath(cityData));
    const tallest = Math.max(
      0,
      ...layout.blocks.flatMap((b) => b.skyline.map((s) => s.h)),
      ...layout.buildings.map((b) => b.h),
    );
    const shot = overviewShot(layout.bounds, tallest);
    requestFly({
      x: layout.centre.x,
      z: layout.centre.z,
      distance: Math.min(shot.dist, 85),
      targetY: shot.targetY,
      elevation: 0.28,
      duration: REVEAL_FLIGHT_MS / 1000,
    });
    const pulse = armRevealPulse(cityData, Date.now(), prefersReducedMotion());
    if (pulse) useStore.setState({ revealPulse: pulse });
  }, [cityData, buildPhase, buildStartedAt, requestFly, poseRequest]);

  const frame = useMemo(() => {
    if (!cityData) return { bounds: 60, centre: { x: 0, z: 0 }, radius: 60, surface: FLAT_SURFACE };
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
    return {
      bounds: layout.bounds,
      centre: layout.centre,
      radius,
      surface: surfaceForLayout(layout, focusPath.length > 0),
    };
  }, [cityData, focusPath]);
  const { bounds } = frame;
  useEffect(() => {
    const view = camera as PerspectiveCamera;
    const previous = view.far;
    const globeDepth = frame.surface.radius <= 1200 ? frame.surface.radius * 2 + 1000 : 0;
    view.far = Math.max(1600, bounds * 12 + 900, globeDepth);
    view.updateProjectionMatrix();
    return () => {
      view.far = previous;
      view.updateProjectionMatrix();
    };
  }, [camera, bounds, frame.surface]);

  // The ground's haze ramp is aimed at the level that is on screen. `centre`,
  // not the world origin: an organic level's buildings sit wherever their
  // Voronoi cells put them.
  const groundMaterial = useMemo(() => makeGroundMaterial(), []);
  const groundGeometry = useMemo(() => makeSurfaceGroundGeometry(frame.surface), [frame.surface]);
  useEffect(() => () => groundGeometry.dispose(), [groundGeometry]);
  useEffect(() => {
    setGroundFrame(groundMaterial, frame.centre, frame.radius, frame.surface.strength);
  }, [groundMaterial, frame.centre, frame.radius, frame.surface]);
  useEffect(() => () => groundMaterial.dispose(), [groundMaterial]);

  return (
    <WorldSurfaceContext.Provider value={frame.surface}>
      <CameraRig />
      <WorldGrade />

      {/* Soft daylight keeps buildings and citizens readable without glow. */}
      {/* The dome paints the sky; the background colour behind it is only the
          fallback for the frame before the first render, and it is the SAME
          tone the dome converges to at the horizon. */}
      <color attach="background" args={[ENV.skyTop]} />
      <SkyDome />
      {/* Four terms, and one job each. The hemisphere is the sky: cool from
          above, the asphalt's own colour bouncing back from below. The key is
          the sun at 25° elevation — low enough that a plot's two visible
          facades land on different sides of it, which is the shape cue a reader
          uses before any colour. The fill is the opposite sky, and the ambient
          term is what is left after both: it was 0.65, and at 0.65 it added a
          flat third to every facade, which is exactly the amount that turns
          twenty-four language colours into four. */}
      <hemisphereLight args={["#cfe3f2", "#4a5560", 1.15]} />
      <directionalLight position={SUN_POSITION} intensity={1.5} color="#ffd9ac" />
      <directionalLight position={[-45, 35, -35]} intensity={0.4} color="#9fc4e8" />
      <ambientLight intensity={0.25} />
      {/* Atmosphere scales with the current district size.
          The seam at the horizon is NOT this fog's job — `render/ground.ts`
          carries the floor into the haze tone with its own ramp, which is what
          lets the quad's rim meet the sky exactly. This fog is perspective
          depth for the open ground beyond, and it therefore starts well past
          the far edge of the level: measured at `bounds * 2.2` it pulled a
          far-zoom level down to a rendered floor of #314248, which is DARKER
          than the `safe` heat tile (#3b4a63) sitting on it — the calmest level
          of the heat grid had contrast 1.0 against its own ground, and the
          `unchecked` tile 2.07 where the shipped guard asks for 2.5. A dusk
          atmosphere may not eat a measurement. */}
      <fog attach="fog" args={[ENV.fog, ...fogRange(bounds)]} />
      {/* Asphalt ground — graded toward the haze, see render/ground.ts */}
      <mesh geometry={groundGeometry} material={groundMaterial} />

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
    </WorldSurfaceContext.Provider>
  );
}
