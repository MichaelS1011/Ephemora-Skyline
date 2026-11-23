import { useEffect, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { EffectComposer, Bloom, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { CityScene } from "./CityScene";
import { GfxGovernor } from "./GfxGovernor";
import { SceneBoundary } from "./SurfaceBoundary";
import { useStore } from "../stores";
import { WORLD_FOV_DEG } from "../city/worldFraming";
import { writePoseParam, type CameraPose } from "../urlState";

/**
 * The 3D world, lifted out of `App.tsx` so the start screen can paint without
 * three.js. This file owns every import that pulls in `three`, `@react-three/*`
 * or `postprocessing`; App mounts it through `React.lazy`, so a person who
 * only wants to drop a folder downloads the chrome first and the world as a
 * background chunk, instead of waiting for ~1 MB of 3D to parse before the
 * first frame. The empty-world backdrop and the chrome stay in App; only the
 * canvas subtree moved, verbatim. `tests/waypoint.test.tsx` pins the fov
 * literal by reading THIS file's source — the mount point and its guard
 * travel together.
 */

/** How long a restored pose is held against scripted flights after it is set. */
const POSE_GRAB_MS = 320;
/** Write the camera to the address once the pilot has stopped for this long. */
const POSE_SETTLE_MS = 700;
/** The Canvas below mounts on a 52° vertical field — the digit stays literal
 * because `tests/waypoint.test.tsx` pins the app's camera by reading this
 * file's source. The one source of the number is
 * `city/worldFraming.WORLD_FOV_DEG`; the tie lets the compiler notice if the
 * source moves (no literal overlap → TS2367), the guard notices if this
 * mount-point digit does. */
const _CANVAS_FOV_TIE = WORLD_FOV_DEG === 52;

const samePose = (a: CameraPose, b: CameraPose): boolean =>
  Math.abs(a.x - b.x) < 0.05 &&
  Math.abs(a.y - b.y) < 0.05 &&
  Math.abs(a.z - b.z) < 0.05 &&
  Math.abs(a.yaw - b.yaw) < 0.005 &&
  Math.abs(a.pitch - b.pitch) < 0.005;

const _euler = new THREE.Euler();

function poseOf(camera: THREE.Camera): CameraPose {
  _euler.setFromQuaternion(camera.quaternion, "YXZ");
  return {
    x: camera.position.x,
    y: camera.position.y,
    z: camera.position.z,
    yaw: _euler.y,
    pitch: _euler.x,
  };
}

function applyPose(camera: THREE.Camera, p: CameraPose): void {
  camera.position.set(p.x, p.y, p.z);
  camera.rotation.order = "YXZ";
  camera.rotation.set(p.pitch, p.yaw, 0);
}

/**
 * The camera end of the address.
 *
 * Lives inside the canvas because a pose is the one piece of state the store
 * only ever receives second-hand: the rig reports where it put the camera, and
 * a flight is derived from where the camera already is
 * (`approachFromCurrentDirection` keeps the viewing direction). So the address
 * can ask for a flight, but it cannot ask to be put back — that needs something
 * standing at the camera itself.
 *
 * Mount AFTER CityScene so the frame write lands after the rig's and the crane's
 * for the duration of the grab, and is the last word on the frame.
 */
function VisitCamera() {
  const { camera } = useThree();
  const poseRequest = useStore((s) => s.poseRequest);
  const buildPhase = useStore((s) => s.buildPhase);
  const cityOnScreen = useStore((s) => s.cityData !== null);
  const requestBuildSkip = useStore((s) => s.requestBuildSkip);

  const requested = useRef<CameraPose | null>(null);
  const armed = useRef<CameraPose | null>(null);
  const grabUntil = useRef(0);
  const skipped = useRef(false);
  const sample = useRef<CameraPose | null>(null);
  const settledAt = useRef(0);
  const written = useRef<CameraPose | null>(null);

  useEffect(() => {
    if (!poseRequest) return;
    requested.current = poseRequest.pose;
    armed.current = poseRequest.pose;
    grabUntil.current = Date.now() + POSE_GRAB_MS;
    skipped.current = false;
    applyPose(camera, poseRequest.pose);
    written.current = poseRequest.pose;
  }, [poseRequest, camera]);

  // A shared link opened on a city this machine has never seen plays the
  // construction cinematic AND carries a pose. The crane owns the camera for
  // the length of the build, so the returning pilot is put back a second time
  // once the city stands — otherwise the address asks for one view and the
  // screen shows the crane's. The reveal glide to the overview is not armed for
  // such a visit at all (CityScene.tsx:137); what is left to overwrite is the
  // build, and under reduced motion that glide was an instant write no skip
  // could reach: 3 of 4 reloads lost the pose, 8,577–185,254 units away.
  useEffect(() => {
    const want = requested.current;
    if (buildPhase !== "built" || !want || samePose(poseOf(camera), want)) return;
    armed.current = want;
    grabUntil.current = Date.now() + POSE_GRAB_MS;
    skipped.current = false;
  }, [buildPhase, camera]);

  useFrame(() => {
    const now = Date.now();
    // The open world's camera is not a visit. Without this gate the landing
    // page would carry a `cam=` parameter for a city that is not on screen.
    if (!cityOnScreen) {
      requested.current = null;
      armed.current = null;
      sample.current = null;
      written.current = null;
      settledAt.current = 0;
      return;
    }
    // A flight is not a visit. Writing `?cam=` while somebody is flying would
    // promise a reload a flight it cannot start (a reload always lands free),
    // and the address would churn every second of the flight.
    if (useStore.getState().cameraMode === "pilot") {
      sample.current = null;
      settledAt.current = 0;
      return;
    }
    const held = armed.current;
    if (held && now < grabUntil.current) {
      applyPose(camera, held);
      // A flight scripted for this arrival (the glide out to the overview) must
      // not drag the returning pilot away. Asked from the frame, not the effect:
      // the rig clears a tween in the commit AFTER the one that armed it.
      if (!skipped.current) {
        skipped.current = true;
        requestBuildSkip();
      }
      return;
    }
    if (held) armed.current = null;

    const live = poseOf(camera);
    if (!sample.current || !samePose(live, sample.current)) {
      sample.current = live;
      settledAt.current = now;
      return;
    }
    if (
      settledAt.current > 0 &&
      now - settledAt.current >= POSE_SETTLE_MS &&
      !(written.current && samePose(live, written.current))
    ) {
      written.current = live;
      settledAt.current = 0;
      writePoseParam(live);
    }
  });

  return null;
}

export interface WorldCanvasProps {
  /** The pixel ratio budget, chosen by App so the wrapper class and the canvas agree. */
  dpr: [number, number];
  /** The lite path: no bloom pass, capped pixel ratio (see GfxGovernor / perf.ts). */
  lite: boolean;
  /** The scene graph threw inside the canvas — App tears the world down and offers a rebuild. */
  onSceneFail: () => void;
}

export default function WorldCanvas({ dpr, lite, onSceneFail }: WorldCanvasProps) {
  return (
    <Canvas
      camera={{ position: [0, 100, 150], fov: 52, near: 0.5, far: 1600 }}
      dpr={dpr}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
    >
      <SceneBoundary origin="scene" onFail={onSceneFail}>
        <CityScene />
        {/* The frame budget speaks through perf.ts: struggling windows drop
          to the lite path, healthy ones take it back after the longer
          streak. A hand on the manual switch ends it for the visit. */}
        <GfxGovernor />
        {/* After CityScene on purpose: the pose of the address is the last
          word on the frame, and a scripted flight of this arrival has to
          be asked away from inside a frame, not from an effect. */}
        <VisitCamera />
      </SceneBoundary>
      {/* gfxLite skips the bloom pass entirely — the one expensive
        post-processing step — and caps the pixel ratio above.
        The ToneMapping effect is not a look choice: `<EffectComposer>`
        renders the scene with the renderer's own tone mapping turned off,
        so without it the full-quality path shows the city un-tone-mapped
        and the sky changes value with the graphics preference (measured:
        the upper band rendered 202,223,239 with the composer against
        211,219,224 without it). Same curve as the direct path, so both
        quality settings show one picture. */}
      {!lite && (
        <EffectComposer enableNormalPass={false}>
          <Bloom luminanceThreshold={0.9} intensity={0.22} mipmapBlur />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        </EffectComposer>
      )}
    </Canvas>
  );
}
