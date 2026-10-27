"use client";

import { useEffect, useMemo, useRef } from "react";
import { useThree } from "@react-three/fiber";
import type { PerspectiveCamera } from "three";
import { useStore } from "../stores/useStore";
import { defaultOverviewPath } from "../city/overview";
import { armRevealPulse, getDirLayout, overviewShot, REVEAL_FLIGHT_MS } from "../city/layout";
import { prefersReducedMotion } from "../city/motion";
import {
  BAUBEGINN_POSE,
  LEERWELT_POSE,
  blickwinkelFür,
  fitAnsicht,
  isAnsicht,
} from "../city/cameraPresets";
import { currentVisit } from "../urlState";
import { OPEN_WORLD_DIRECT_STEP, buildOpenWorld } from "../city/openWorldStreets";
import { ENV } from "../city/palette";
import { FLAT_SURFACE, surfaceForLayout } from "../city/worldSurface";
import {
  dataPlots,
  plotWorldPoints,
  fitWorldPoints,
  HERO_FRAMING,
  WORLD_FOV_DEG,
  WORLD_OVERVIEW_ELEVATION,
} from "../city/worldFraming";
import { surfacePoint } from "../city/worldSurface";
import { WorldSurfaceContext } from "../render/WorldSurface";
import { SkyDome } from "../render/SkyDome";
import { LIGHT_RIG, SUN_POSITION } from "../render/sky";
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
import { BannerPlane } from "./BannerPlane";
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
  const shareHero = useStore((s) => s.shareHero);
  const buildStartedAt = useStore((s) => s.buildStartedAt);
  const buildPhase = useStore((s) => s.buildPhase);
  const lang = useStore((s) => s.prefs.lang);
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
        camera.position.set(
          centre.x + BAUBEGINN_POSE.dx,
          BAUBEGINN_POSE.y,
          centre.z + BAUBEGINN_POSE.dz,
        );
        camera.lookAt(centre.x, BAUBEGINN_POSE.targetY, centre.z);
      }
      return;
    }
    craneBuildRef.current = null;
    overviewRef.current = null;
    camera.position.set(...LEERWELT_POSE.position);
    camera.lookAt(...LEERWELT_POSE.target);
  }, [cityData, buildStartedAt, camera, requestFly]);

  // City stands → fly to the presentation view. The crane pulled back during
  // construction; this final flight settles the camera into the frontal
  // overview position the user sees when interacting with the finished city.
  useEffect(() => {
    if (!cityData || buildPhase !== "built") return;
    if (craneBuildRef.current !== buildStartedAt || overviewRef.current === buildStartedAt) return;
    overviewRef.current = buildStartedAt;
    if (poseRequest && !shareHero) return;
    if (shareHero) {
      // A share take owns its last frame: fly to the same fitted pose the
      // take opened on, so the result-first hook and the ending are one shot
      // and the platform loop has nowhere to jump. The build director's last
      // crane shot must not keep writing the camera after the flight lands.
      useStore.getState().setCraneFraming(null);
      requestFly({
        position: shareHero.position,
        target: shareHero.target,
        duration: REVEAL_FLIGHT_MS / 1000,
      });
    } else {
      const path = defaultOverviewPath(cityData);
      const layout = getDirLayout(cityData, path);
      // §06.01 — an address that names a view gets that framing on arrival.
      // The name is honoured inside the reveal, not by a second flight after
      // it: measured, a hook that flew first was simply overwritten by this
      // one (0 Px difference). An address that also names a district or a file
      // keeps the reveal: the place outranks the angle.
      const besuch = currentVisit();
      const benannt =
        besuch.district.length === 0 && !besuch.filePath && isAnsicht(besuch.ansicht)
          ? besuch.ansicht
          : null;
      if (benannt) {
        const fitted = fitAnsicht(
          benannt,
          layout,
          surfaceForLayout(layout, path.length > 0),
          gl.domElement.clientWidth / Math.max(1, gl.domElement.clientHeight),
        );
        requestFly({
          position: fitted.position,
          target: fitted.target,
          duration: REVEAL_FLIGHT_MS / 1000,
        });
      } else {
        const tallest = Math.max(
          0,
          ...layout.blocks.flatMap((b) => b.skyline.map((s) => s.h)),
          ...layout.buildings.map((b) => b.h),
        );
        const shot = overviewShot(layout.bounds, tallest);
        requestFly({
          x: layout.centre.x,
          z: layout.centre.z,
          distance: shot.dist,
          targetY: shot.targetY,
          elevation: shot.elevation,
          duration: REVEAL_FLIGHT_MS / 1000,
        });
      }
    }
    const pulse = armRevealPulse(cityData, Date.now(), prefersReducedMotion());
    if (pulse) useStore.setState({ revealPulse: pulse });
  }, [cityData, buildPhase, buildStartedAt, requestFly, poseRequest, shareHero]);

  /**
   * Z-01 (§07.11) — a guide the reader cannot see is a guide that did not walk.
   *
   * Measured: the Explorer reached its target, pointed, looked around, and
   * across eight seconds not one pixel of it changed on the plate, because a
   * neighbouring tower stood between the lens and the kerb it was sent to
   * (`umsehen-messung.json`, and the same wall ends §07.06's route line out of
   * frame). So when an errand opens — and once more when the figure arrives —
   * the camera frames the target's frontage from the nearest direction with a
   * clear line to it.
   *
   * Three rules the flight obeys, all of them deliberate: it happens **once**
   * per errand, at hand-over, and never again while the reader watches — a
   * second flight at the arrival was built first and measured away, because its
   * own motion (112 212 of 113 739 changed pixels in the frame after the
   * arrival) is the camera, not the guide, and it landed on top of the
   * look-around it was supposed to reveal; an address that names a view or a
   * pose keeps its own framing, because a place the reader typed outranks a
   * place the app chose; and under reduced motion nothing flies at all — there
   * is no walk to follow there either (§04.12).
   */
  const guide = useStore((s) => s.guide);
  const geflogenRef = useRef<string | null>(null);
  useEffect(() => {
    if (!cityData || !guide) {
      geflogenRef.current = null;
      return;
    }
    if (prefersReducedMotion()) return;
    const schluessel = `${guide.role}|${guide.targetFileId}`;
    if (geflogenRef.current === schluessel) return;
    const layout = getDirLayout(cityData, focusPath);
    const plot = layout.buildings.find((b) => b.file.id === guide.targetFileId);
    if (!plot) {
      // Not drawn on this level: the errand was refused elsewhere, and a camera
      // that flew to an invisible building would be the app's mistake, not the
      // reader's.
      return;
    }
    const surface = surfaceForLayout(layout, focusPath.length > 0);
    const plots = dataPlots(layout);
    const ziel = plots.find((s) => s.x === plot.x && s.z === plot.z) ?? {
      x: plot.x,
      z: plot.z,
      w: plot.w,
      d: plot.d,
      top: plot.h + 1.5,
    };
    const rand = surfacePoint(surface, guide.x, 0.9, guide.z);
    const kamera = camera.position;
    const azimut = blickwinkelFür(
      { x: rand.x, y: rand.y, z: rand.z },
      Math.max(18, Math.hypot(kamera.x - rand.x, kamera.y - rand.y, kamera.z - rand.z) * 0.6),
      WORLD_OVERVIEW_ELEVATION,
      plots.filter((s) => s !== ziel),
      Math.atan2(kamera.z - rand.z, kamera.x - rand.x),
    );
    const fitted = fitWorldPoints(
      [...plotWorldPoints([ziel], surface), surfacePoint(surface, guide.x, 0, guide.z)],
      gl.domElement.clientWidth / Math.max(1, gl.domElement.clientHeight),
      azimut,
      WORLD_FOV_DEG,
      HERO_FRAMING,
    );
    geflogenRef.current = schluessel;
    requestFly({ position: fitted.position, target: fitted.target, duration: 1.4 });
  }, [cityData, guide, focusPath, camera, gl, requestFly]);

  const frame = useMemo(() => {
    if (!cityData)
      return {
        bounds: 60,
        centre: { x: 0, z: 0 },
        radius: 60,
        tallest: 0,
        surface: FLAT_SURFACE,
      };
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
      // The tallest thing the airshow has to stay above; 0 over bare streets.
      tallest: layout.buildings.reduce((m, b) => Math.max(m, b.h), 0),
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
      <hemisphereLight args={[LIGHT_RIG.hemiSky, LIGHT_RIG.hemiGround, LIGHT_RIG.hemiIntensity]} />
      <directionalLight
        position={SUN_POSITION}
        intensity={LIGHT_RIG.sunIntensity}
        color={LIGHT_RIG.sunColor}
      />
      <directionalLight
        position={LIGHT_RIG.fillPosition}
        intensity={LIGHT_RIG.fillIntensity}
        color={LIGHT_RIG.fillColor}
      />
      <ambientLight intensity={LIGHT_RIG.ambientIntensity} />
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

      {/* §04.12 — the airshow: one aircraft and the invitation it tows, outside
          the city branch on purpose, because the empty world is the first thing
          a stranger sees. It owns no DOM surface, no focus stop and no click
          target; the track is sized from the live camera inside the component. */}
      <BannerPlane
        bounds={frame.bounds}
        centre={frame.centre}
        tallest={frame.tallest}
        lang={lang}
        active={buildPhase !== "constructing" || shareHero !== null}
      />
    </WorldSurfaceContext.Provider>
  );
}
