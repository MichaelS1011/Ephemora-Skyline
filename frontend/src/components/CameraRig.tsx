import { useEffect, useMemo, useRef } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { useStore } from "../stores/useStore";
import type { CameraInfo } from "../stores/useStore";
import { getDirLayout } from "../city/layout";
import type { CraneShot } from "../city/layout";
import { getKeyboardMark } from "../interaction/keyboardMark";
import { fitWorldOverview, WORLD_FOV_DEG } from "../city/worldFraming";
import { STANDARD_AZIMUTH, fitAnsicht, isAnsicht } from "../city/cameraPresets";
import { currentVisit } from "../urlState";
import {
  FLAT_SURFACE,
  surfaceForLayout,
  surfaceHeight,
  surfacePoint,
  surfaceQuaternion,
  type WorldSurface,
} from "../city/worldSurface";

/** Shortest signed distance between two headings, so ±π does not look like a jump. */
function angleDelta(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Camera rig — the user is the pilot, in two modes:
 *
 * FREE (default)  — drag looks around freely, WASD/QE walks, the wheel
 *                   dollies along the view. Selection never moves the camera.
 * ORBIT           — double-click a building: the camera circles ITS viewpoint
 *                   for inspection. Esc returns to free flight.
 *
 * The arrow keys turn the camera around the current level in BOTH modes:
 * left/right sweep the azimuth, up/down raise and lower the viewpoint, and
 * the distance to the city is preserved — so unlike a dolly, a turn can
 * never lose the thing being looked at.
 *
 * Flight requests set up short, gentle tweens toward a point of interest in
 * BOTH modes, but control is NEVER taken away: the tween is aborted the
 * instant the user drags, scrolls, walks or turns, and the camera reports its
 * real position to the Minimap.
 *
 * While a city is being built the construction crane drives the view instead:
 * CityTree publishes one shot per 100 ms, sized for whatever actually stands,
 * and the rig eases toward it continuously (craneAdvance) — the city grows, the
 * frame opens up, no cut. A hand on the camera stops the crane for good.
 */

export interface XYZ {
  x: number;
  y: number;
  z: number;
}

interface Tween {
  fromPos: THREE.Vector3;
  toPos: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  t: number;
  dur: number;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Camera position for a flight to `target`, arriving at `distance`.
 *
 * By default it KEEPS the user's viewing direction: the vector from the old
 * orbit target to the camera (its azimuth + elevation) is reused around the
 * new target, so a flight never drags the camera to a fixed south-east
 * vantage the user never chose.
 *
 * The construction crane passes its own `elevation`: the azimuth is still the
 * live one — the camera stays on the side of the city it is on — but the height
 * is the shot's, because a crane that inherits a street-level eye line cannot
 * show a plot and a tower in the same frame.
 *
 * Degenerate case (camPos == camTarget — no direction to preserve, e.g. the
 * very first flight of a freshly loaded city): falls back to the legacy
 * south-east formula.
 */
export function approachFromCurrentDirection(
  camPos: XYZ,
  camTarget: XYZ,
  target: XYZ,
  distance: number,
  elevation?: number,
): XYZ {
  const ox = camPos.x - camTarget.x;
  const oz = camPos.z - camTarget.z;
  const oy = camPos.y - camTarget.y;
  const offsetLen = Math.hypot(ox, oy, oz);
  if (offsetLen < 1e-9) {
    // Legacy default approach — the pre-pilot fixed south-east vantage.
    return {
      x: target.x + distance * 0.4,
      y: distance * 0.75,
      z: target.z + distance * 0.75,
    };
  }
  const horizRadius = Math.hypot(ox, oz);
  // Only a straight-down view has no azimuth to carry; the standard heading
  // (worldFraming's one azimuth) supplies one so an elevation-carrying flight
  // still has a side to sit on.
  const azimuth = horizRadius < 1e-9 ? STANDARD_AZIMUTH : Math.atan2(oz, ox);
  const el = elevation ?? Math.atan2(oy, horizRadius);
  const horiz = Math.cos(el) * distance;
  return {
    x: target.x + Math.cos(azimuth) * horiz,
    y: target.y + Math.sin(el) * distance,
    z: target.z + Math.sin(azimuth) * horiz,
  };
}

/**
 * Short, snappy flight duration derived from the target distance:
 * 0.35 s floor (a hop), 1.6 s cap (a cross-city glide) by default.
 * Callers with an explicit duration (the built-city reveal) win.
 */
export function flightDuration(distance: number, cap = 1.6): number {
  return Math.min(cap, Math.max(0.35, 0.35 + distance / 220));
}

/** Derive free-look yaw/pitch from a live camera quaternion (YXZ order). */
export function deriveLookAngles(quat: THREE.Quaternion): { yaw: number; pitch: number } {
  const e = new THREE.Euler(0, 0, 0, "YXZ");
  e.setFromQuaternion(quat, "YXZ");
  return { yaw: e.y, pitch: e.x };
}

/** Polar limits of the turntable: above the ground, off the zenith pole. */
export const TURN_MIN_PHI = 0.12;
export const TURN_MAX_PHI = Math.PI / 2 - 0.04;

// Scratch for the turntable math — no per-frame allocation while turning.
const _offset = new THREE.Vector3();
const _sph = new THREE.Spherical();

/**
 * One turntable step: carry `pos` around `pivot` by `dTheta` (azimuth) and
 * `dPhi` (polar) at UNCHANGED distance — which is what keeps the city in
 * frame, unlike a dolly. Returns null when the camera sits exactly on the
 * pivot (no radius to swing).
 */
export function turntableStep(
  pos: XYZ,
  pivot: XYZ,
  dTheta: number,
  dPhi: number,
): { x: number; y: number; z: number } | null {
  _offset.set(pos.x - pivot.x, pos.y - pivot.y, pos.z - pivot.z);
  _sph.setFromVector3(_offset);
  if (_sph.radius < 1e-3) return null;
  _sph.theta += dTheta;
  _sph.phi = Math.min(TURN_MAX_PHI, Math.max(TURN_MIN_PHI, _sph.phi + dPhi));
  _offset.setFromSpherical(_sph);
  return { x: pivot.x + _offset.x, y: pivot.y + _offset.y, z: pivot.z + _offset.z };
}

// ── Camera navigation — reusable module-level vectors (no per-frame alloc) ──
// WASD/QE walk the camera along its own axes; the arrow keys turn it around
// the city. Both are tracked in one set so the typing/dialog guard covers
// both.
const WALK_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE"]);
const TURN_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]);
const isNavKey = (code: string): boolean => WALK_KEYS.has(code) || TURN_KEYS.has(code);
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _move = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _look = new THREE.Vector3();
const _euler = new THREE.Euler(0, 0, 0, "YXZ");
const _pivot = new THREE.Vector3();

/** Height of the turntable axis — matches the y a flight aims at. */
export const PIVOT_Y = 1.5;
/** Street level — nothing the pilot flies through goes below it. */
export const GROUND_Y = 1;
/** How far ahead the free camera's orbit anchor sits on its own view axis.
 * One number, three sites (orbit entry, share-flight interpolation, the
 * live-view anchor a preserved flight reads) — all of them this distance. */
const VIEW_ANCHOR_DIST = 12;

/** Where a level is: its plaza centre. Organic cells are not centred on the
 *  world origin, so the frame that holds a city is not the frame that holds
 *  the coordinate system. */
export interface LevelCentre {
  x: number;
  z: number;
}
const ORIGIN: LevelCentre = { x: 0, z: 0 };

/**
 * Keep the pilot inside the world.
 *
 * The free-fly dolly had no bound at all while the walk always floored at
 * GROUND_Y — which is exactly why WASD could never lose the city and the
 * wheel could: dollying toward the ground drove the camera under the ground
 * plane, and from below the frame is nothing but the clear colour (measured:
 * the world collapses to a single colour after ~10 notches of inward scroll).
 * The outer limit is the camera's own collar, `cityClampRadius` below — the
 * ONE arithmetic for it, shared with the orbit's max distance. It is NOT the
 * fog's far plane: CityScene hazes at `bounds * 9 + 600` (fogRange), which at
 * the demo level is 680 units further out than the collar's 460. Unifying
 * them would move the shipped view, so the difference stands — reported, and
 * pinned by `tests/kamera-konstanten.test.ts`. What the guard in
 * `tests/worldPicture.test.ts` does promise is that at the collar the fog is
 * still a thin wash (< 0.35), so clamping there cuts nothing the user could
 * still see — and no overview flight can reach it, since the tallest possible
 * framing is 129 units (mapping.ts caps a building at 34, voxels at 1.4x)
 * while the ceiling is never below 220.
 *
 * The bound is a sphere around the LEVEL, not around the origin: an organic
 * layout's plaza sits up to 92 m off the origin, and a bound centred on the
 * origin would let the pilot walk out of the fog while still inside it.
 */
export function cityClampRadius(bounds: number): number {
  return bounds * 4 + 220;
}

export function clampToCity(
  pos: XYZ,
  bounds: number | null,
  centre: LevelCentre = ORIGIN,
  surface: WorldSurface = FLAT_SURFACE,
): XYZ {
  let { x, y, z } = pos;
  if (bounds !== null) {
    const maxR = cityClampRadius(bounds);
    const dy = pos.y - PIVOT_Y;
    const dx = pos.x - centre.x;
    const dz = pos.z - centre.z;
    const r = Math.hypot(dx, dy, dz);
    if (r > maxR) {
      const s = maxR / r;
      x = centre.x + dx * s;
      y = PIVOT_Y + dy * s;
      z = centre.z + dz * s;
    }
  }
  const floor = surfaceHeight(surface, x, z) + GROUND_Y;
  if (y < floor) y = floor;
  return { x, y, z };
}

/** The crane's eye line: 21° below the horizon — the angle at which a plot and
 *  the crown rising out of it both fit the same frame. */
export const CRANE_ELEVATION = 0.42;
/** Per-second exponential closure toward the shot: quick enough to keep up
 *  with a 20 s build, slow enough that the pull-back reads as one move. */
const CRANE_FOLLOW_RATE = 2.2;

/**
 * One crane step: ease the camera `delta` seconds toward the shot sized for
 * whatever stands right now.
 *
 * The pivot is the city centre and the azimuth stays the live one, so the
 * crane only ever changes DISTANCE and HEIGHT — it never rotates the view away
 * from the side the user is standing on. Exponential closure instead of a
 * from/to tween is what makes a 10 Hz stream of growing shots read as one
 * continuous pull-back rather than a new flight per district.
 */
export function craneAdvance(
  camPos: XYZ,
  camTarget: XYZ,
  shot: CraneShot,
  delta: number,
): { pos: XYZ; target: XYZ } {
  const target = { x: shot.x ?? 0, y: shot.targetY, z: shot.z ?? 0 };
  const want = approachFromCurrentDirection(camPos, camTarget, target, shot.dist, CRANE_ELEVATION);
  const k = 1 - Math.exp(-CRANE_FOLLOW_RATE * delta);
  return {
    pos: {
      x: camPos.x + (want.x - camPos.x) * k,
      y: camPos.y + (want.y - camPos.y) * k,
      z: camPos.z + (want.z - camPos.z) * k,
    },
    target,
  };
}

// ── "Have I flown away from the city?" ─────────────────────────────────────
// The tallest framing any overview flight reaches is 129 (mapping.ts caps a
// building at 34, voxels at 1.4x), and nothing the pilot flies through goes
// below GROUND_Y — so the level's box spans that band in y and ±bounds in x/z.
const CITY_TOP = 130;
const _projView = new THREE.Matrix4();
const _frustum = new THREE.Frustum();
const _corner = new THREE.Vector3();

/**
 * How much of the level is inside `test`?
 *
 * A 3×3 grid across the ground footprint plus the four corners of its
 * silhouette at `CITY_TOP`. The eight hull corners alone were wrong in both
 * directions: a pilot standing in the middle of the city looking at the
 * horizon has every corner beside or behind them and would be told they had
 * lost the city, while a single far corner poking into frame is not a city
 * worth looking at. The grid asks the question the screen actually answers: how
 * much of the town square do I see?
 */
function cityPointsInFrustum(
  bounds: number,
  top: number,
  centre: LevelCentre,
  test: (p: THREE.Vector3) => boolean,
  surface: WorldSurface,
): number {
  let seen = 0;
  for (const sx of [-1, 0, 1])
    for (const sz of [-1, 0, 1]) {
      surfacePoint(surface, centre.x + sx * bounds, GROUND_Y, centre.z + sz * bounds, _corner);
      if (test(_corner)) seen++;
    }
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      surfacePoint(surface, centre.x + sx * bounds, top, centre.z + sz * bounds, _corner);
      if (test(_corner)) seen++;
    }
  return seen;
}

/**
 * Did the pilot lose the city, and is it back?
 *
 * Lost once nothing of the level's ground grid or silhouette reaches the
 * frustum; found again once a third of it does (3 of the 9 ground points). The
 * two bars differ on purpose — a city that flickers across the threshold at the
 * edge of frame would hand out a hint the user learns to ignore. Measured on
 * the demo city: eight wheel notches over open ground take the frame from 333
 * distinct colours to 49, and the same collapse happens flying 8+ notches INTO
 * a building, which is why the hint is not a pure zoom-out story.
 */
export function cityFrameState(
  camera: THREE.Camera,
  bounds: number | null,
  wasLost: boolean,
  centre: LevelCentre = ORIGIN,
  top = CITY_TOP,
  surface: WorldSurface = FLAT_SURFACE,
): "lost" | "found" {
  if (bounds === null) return "found";
  _frustum.setFromProjectionMatrix(
    _projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
  );
  const seen = cityPointsInFrustum(bounds, top, centre, (p) => _frustum.containsPoint(p), surface);
  if (wasLost) return seen >= 3 ? "found" : "lost";
  return seen >= 1 ? "found" : "lost";
}

/** The level the pilot is in: its half-extent, where it stands, and how tall
 *  the tallest thing on it is. Null with no city loaded. */
interface CityFrame {
  bounds: number;
  centre: LevelCentre;
  /** Top of the tallest geometry — the frustum rescue's ceiling. */
  top: number;
  /** The plots on this level, for the keyboard's district mark. */
  blocks: ReturnType<typeof getDirLayout>["blocks"];
  surface: WorldSurface;
  layout: ReturnType<typeof getDirLayout>;
}
function useCityFrame(): CityFrame | null {
  const cityData = useStore((s) => s.cityData);
  const focusPath = useStore((s) => s.focusPath);
  // Memoised: the frame loop reads this every frame and drilling into a
  // district is what changes it.
  return useMemo(() => {
    if (!cityData) return null;
    const layout = getDirLayout(cityData, focusPath);
    const tallest = Math.max(
      0,
      ...layout.blocks.flatMap((b) => b.skyline.map((s) => s.h)),
      ...layout.buildings.map((b) => b.h),
    );
    return {
      bounds: layout.bounds,
      centre: layout.centre,
      top: Math.max(2, tallest),
      blocks: layout.blocks,
      surface: surfaceForLayout(layout, focusPath.length > 0),
      layout,
    };
  }, [cityData, focusPath]);
}

function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || typeof el.tagName !== "string") return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable === true;
}

function dialogOpen(): boolean {
  return !!document.querySelector('[aria-modal="true"]');
}

/**
 * HUD elements that own their keys. The minimap aims its marker with the arrow
 * keys, and a camera that turns while the reader is placing a marker makes the
 * two hands fight over the same four keys. The minimap declares itself with
 * `data-key-owner`; nothing else in the HUD steers the view.
 */
function ownsTheKeys(el: EventTarget | null): boolean {
  const node = el as HTMLElement | null;
  return !!node?.closest?.("[data-key-owner]");
}

/** The keyboard's own colour: the accent every keycap in the HUD wears. */
const MARKER_COLOR = "#e8b23c";

export function CameraRig() {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const markRef = useRef<THREE.Mesh>(null);
  const { camera, gl } = useThree();
  const flyRequest = useStore((s) => s.flyRequest);
  const shareHero = useStore((s) => s.shareHero);
  const setCameraInfo = useStore((s) => s.setCameraInfo);
  const setCityLostView = useStore((s) => s.setCityLostView);
  const cityData = useStore((s) => s.cityData);
  const cameraMode = useStore((s) => s.cameraMode);
  const tourActive = useStore((s) => s.tourActive);
  // Read through a ref so the wheel listener and the frame loop never close
  // over a stale level.
  const cityFrame = useCityFrame();
  const boundsRef = useRef<CityFrame | null>(cityFrame);
  boundsRef.current = cityFrame;

  const tweenRef = useRef<Tween | null>(null);
  const lastNonce = useRef(-1);
  const frameCount = useRef(0);
  /** Last answer the rig gave about the city being out of frame. */
  const lostRef = useRef(false);
  /** Seconds accumulated since that question was last asked. */
  const lostCheckAt = useRef(0);
  /** The pose last handed to the HUD — the frame loop only writes when it moved. */
  const lastReported = useRef<CameraInfo | null>(null);
  // The first flight after a fresh city load has no user-established
  // viewpoint yet — it keeps the legacy fallback approach; every later
  // flight preserves the direction the user is looking from.
  const firstFlightRef = useRef(true);
  const pressedKeys = useRef<Set<string>>(new Set());

  // Free-look state — synced from the LIVE camera pose whenever a drag
  // starts (never from stale state), so mode switches never jump.
  const look = useRef({ yaw: 0, pitch: 0 });
  const dragging = useRef(false);
  const reducedMotionRef = useRef(
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const lastPointer = useRef({ x: 0, y: 0 });
  // Mirrors cameraMode for the frame loop / listeners (no stale closures).
  const modeRef = useRef<"free" | "orbit">(cameraMode);
  modeRef.current = cameraMode;

  // A fresh city resets the viewpoint: the next flight uses the fallback.
  useEffect(() => {
    firstFlightRef.current = true;
    lostRef.current = false;
    setCityLostView(false);
  }, [cityData, setCityLostView]);

  // A skip hands control back immediately: no flight scripted for the
  // cinematic may keep gliding while the user has already skipped it
  const buildSkipAt = useStore((s) => s.buildSkipAt);
  useEffect(() => {
    if (buildSkipAt) tweenRef.current = null;
  }, [buildSkipAt]);

  // ── Mode transitions — must be jump-free ─────────────────────────────────
  // Entering ORBIT: anchor the orbit target where the user currently looks
  // (~12 units ahead on the view axis), so the circle centers on what they
  // see. Entering FREE: nothing to move — the drag handler derives the look
  // angles from the live camera pose at pointerdown. Runs BEFORE the
  // fly-request effect (declaration order) so focusBuilding's flight tweens
  // from the freshly anchored target.
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    if (cameraMode === "orbit") {
      camera.getWorldDirection(_dir);
      controls.target.copy(camera.position).addScaledVector(_dir, VIEW_ANCHOR_DIST);
      controls.enabled = true;
      controls.update();
    } else {
      // FREE: OrbitControls step aside entirely; the free-fly controller
      // owns camera position + rotation. Never call controls.update() here.
      controls.enabled = false;
    }
  }, [cameraMode, camera]);

  // ── The camera always belongs to the user ────────────────────────────────
  // ORBIT mode: OrbitControls' 'start' event aborts a running tween.
  // FREE mode: pointerdown aborts the tween AND starts the drag-look; the
  // wheel dollies along the view. controls.enabled is never toggled to
  // block input — both controllers yield to the user instantly.
  useEffect(() => {
    const controls = controlsRef.current;
    const el = gl.domElement;
    if (!controls) return;
    const abortTween = () => {
      tweenRef.current = null;
      // a hand is on the camera — the construction crane yields for good
      useStore.getState().noteCameraManual();
    };
    controls.addEventListener("start", abortTween);

    const onPointerDown = (e: PointerEvent) => {
      if (modeRef.current !== "free" || e.button !== 0) return;
      dragging.current = true;
      lastPointer.current = { x: e.clientX, y: e.clientY };
      const { yaw, pitch } = deriveLookAngles(camera.quaternion);
      look.current = { yaw, pitch };
      abortTween(); // the user takes over
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging.current || modeRef.current !== "free") return;
      const dx = e.clientX - lastPointer.current.x;
      const dy = e.clientY - lastPointer.current.y;
      lastPointer.current = { x: e.clientX, y: e.clientY };
      look.current.yaw -= dx * 0.0032;
      look.current.pitch = Math.max(-1.55, Math.min(1.55, look.current.pitch - dy * 0.0032));
      camera.rotation.order = "YXZ";
      camera.rotation.set(look.current.pitch, look.current.yaw, 0);
    };
    const onPointerUp = () => {
      dragging.current = false;
    };
    const onWheel = (e: WheelEvent) => {
      abortTween();
      if (modeRef.current !== "free") return; // orbit mode: OrbitControls zooms
      // Dolly along the view direction — the wheel walks you into the city.
      camera.getWorldDirection(_dir);
      const step = -e.deltaY * 0.012 * Math.max(2, camera.position.y * 0.15 + 4);
      camera.position.addScaledVector(_dir, step);
      const f = boundsRef.current;
      const kept = clampToCity(camera.position, f?.bounds ?? null, f?.centre ?? ORIGIN, f?.surface);
      camera.position.set(kept.x, kept.y, kept.z);
    };
    el.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    el.addEventListener("wheel", onWheel, { passive: true });
    return () => {
      controls.removeEventListener("start", abortTween);
      el.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("wheel", onWheel);
    };
  }, [gl, camera]);

  // ── Camera navigation keys — guarded against typing, dialogs and the tour ─
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isNavKey(e.code)) return;
      // Typing, an open modal dialog, or a HUD element that steers its own
      // arrows owns the keyboard — drop all held keys so no stale key keeps
      // gliding behind it.
      if (isTypingTarget(e.target) || dialogOpen() || ownsTheKeys(e.target)) {
        pressedKeys.current.clear();
        return;
      }
      // The security tour navigates on the arrow keys; it keeps them.
      if (TURN_KEYS.has(e.code) && useStore.getState().tourActive) return;
      pressedKeys.current.add(e.code);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      pressedKeys.current.delete(e.code);
    };
    const onBlur = () => {
      pressedKeys.current.clear();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  // ── React to fly requests ────────────────────────────────────────────────
  useEffect(() => {
    if (!flyRequest || flyRequest.nonce === lastNonce.current) return;
    lastNonce.current = flyRequest.nonce;

    const { x, z, distance } = flyRequest;
    // Voxel-focus flights set an explicit target height (the voxel's world
    // y); every other caller keeps the ground-level default — the same
    // turntable-axis height the arrow keys pivot around.
    let toTarget = surfacePoint(
      boundsRef.current?.surface ?? FLAT_SURFACE,
      x,
      flyRequest.targetY ?? PIVOT_Y,
      z,
    );

    const controls = controlsRef.current;
    const fromPos = camera.position.clone();
    const fromTarget = controls ? controls.target.clone() : new THREE.Vector3();

    // A fitted share pose is already a position and a target in world space.
    // Fly it directly: the usual approachFromCurrentDirection would preserve
    // whatever azimuth the pilot happened to leave, which is exactly what a
    // fitted portrait crop cannot tolerate.
    if (flyRequest.position && flyRequest.target) {
      const explicitTarget = new THREE.Vector3(
        flyRequest.target.x,
        flyRequest.target.y,
        flyRequest.target.z,
      );
      const explicitPos = new THREE.Vector3(
        flyRequest.position.x,
        flyRequest.position.y,
        flyRequest.position.z,
      );
      firstFlightRef.current = false;
      // In free mode the controls target is stale (lookAt never writes it).
      // Interpolate the view axis from where the camera actually looks.
      const explicitFrom = fromTarget.clone();
      if (cameraMode === "free") {
        camera.getWorldDirection(_dir);
        explicitFrom.copy(fromPos).addScaledVector(_dir, VIEW_ANCHOR_DIST);
      }
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduceMotion || !controls || flyRequest.duration === 0) {
        camera.position.copy(explicitPos);
        if (cameraMode === "free") {
          camera.lookAt(explicitTarget);
        } else if (controls) {
          controls.target.copy(explicitTarget);
          controls.update();
        }
        return;
      }
      tweenRef.current = {
        fromPos,
        toPos: explicitPos,
        fromTarget: explicitFrom,
        toTarget: explicitTarget,
        t: 0,
        dur: flyRequest.duration ?? flightDuration(distance),
      };
      return;
    }

    // Direction-preserving approach once the user has a real viewpoint;
    // the very first flight of a fresh city keeps the legacy fallback
    // (modeled by collapsing camPos onto camTarget — the helper's
    // degenerate case).
    //
    // In FREE mode the orbit target is stale: `camera.lookAt()` moves the view
    // and never touches `controls.target`, so the vector the helper would read
    // is the one the last ORBIT flight left behind — often the world origin.
    // Measured: clicking the minimap on a plot and pressing Enter on the marker
    // the same click had just placed changed 931 of 1000 screen cells, because
    // the second flight swung around a stale anchor and arrived at the same
    // point from a different side. The live view axis is what "keep the
    // direction" has to mean while flying free.
    const preserve = !firstFlightRef.current;
    let anchor: XYZ;
    if (modeRef.current === "free" && preserve) {
      camera.getWorldDirection(_dir);
      anchor = {
        x: fromPos.x + _dir.x * VIEW_ANCHOR_DIST,
        y: fromPos.y + _dir.y * VIEW_ANCHOR_DIST,
        z: fromPos.z + _dir.z * VIEW_ANCHOR_DIST,
      };
    } else {
      anchor = preserve && controls ? fromTarget : fromPos;
    }
    const pos = approachFromCurrentDirection(
      { x: fromPos.x, y: fromPos.y, z: fromPos.z },
      anchor,
      { x: toTarget.x, y: toTarget.y, z: toTarget.z },
      distance,
      flyRequest.elevation,
    );
    let toPos = new THREE.Vector3(pos.x, pos.y, pos.z);
    const frame = boundsRef.current;
    if (flyRequest.overview && frame) {
      const azimuth = preserve
        ? Math.atan2(fromPos.z - anchor.z, fromPos.x - anchor.x)
        : STANDARD_AZIMUTH;
      const seitenverhältnis = gl.domElement.clientWidth / Math.max(1, gl.domElement.clientHeight);
      const sicht = (camera as THREE.PerspectiveCamera).fov ?? WORLD_FOV_DEG;
      // §06.01 — an address can name the view (`?ansicht=straße`). The name is
      // resolved through the same fit the overview flight already uses, so a
      // named view is a choice of framing, never a second bit of arithmetic.
      const benannt = currentVisit().ansicht;
      const fitted = isAnsicht(benannt)
        ? fitAnsicht(benannt, frame.layout, frame.surface, seitenverhältnis, azimuth, sicht)
        : fitWorldOverview(frame.layout, frame.surface, seitenverhältnis, azimuth, sicht);
      toTarget = fitted.target;
      toPos = fitted.position;
    }
    firstFlightRef.current = false;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion || !controls) {
      camera.position.copy(toPos);
      if (cameraMode === "free") {
        camera.lookAt(toTarget);
      } else if (controls) {
        controls.target.copy(toTarget);
        controls.update();
      }
      return;
    }
    // A caller-supplied duration (the built-city reveal) wins; otherwise the
    // flight stays short and snappy (0.35–1.6 s).
    tweenRef.current = {
      fromPos,
      toPos,
      fromTarget,
      toTarget,
      t: 0,
      dur: flyRequest.duration ?? flightDuration(distance),
    };
  }, [flyRequest, camera, cameraMode, gl]);

  // ── Per-frame tween + walk + camera reporting ────────────────────────────
  useFrame((_, delta) => {
    const free = modeRef.current === "free";
    // The level the pilot is in this frame — its extent, its centre, its top.
    const frame = boundsRef.current;
    const centre = frame?.centre ?? ORIGIN;
    const controls = controlsRef.current;
    if (!controls) return;

    // Navigation: WASD/QE walk, arrow keys turn. Any nav key also aborts a
    // running tween — the user takes over. In ORBIT mode camera + target move
    // together (the circle follows); in FREE mode only the camera moves.
    const keys = pressedKeys.current;
    if (keys.size > 0) {
      // Re-check the guard per frame: a dialog may have opened (or focus
      // moved into an input, or the tour started) while a key was held down.
      if (
        isTypingTarget(document.activeElement) ||
        dialogOpen() ||
        tourActive ||
        ownsTheKeys(document.activeElement)
      ) {
        keys.clear();
      } else {
        tweenRef.current = null;
        useStore.getState().noteCameraManual();
        // Speed proportional to how deep the user is in the city: near =
        // slow (street level), far = fast (city overview).
        const speed = Math.min(40, Math.max(2.5, camera.position.length() * 0.25));
        // Forward on the XZ plane = view direction.
        camera.getWorldDirection(_forward);
        _forward.y = 0;
        if (_forward.lengthSq() < 1e-8) _forward.set(0, 0, -1);
        _forward.normalize();
        // Right = forward rotated −90° around Y (camera-relative strafe).
        _right.set(-_forward.z, 0, _forward.x);

        _move.set(0, 0, 0);
        if (keys.has("KeyW")) _move.add(_forward);
        if (keys.has("KeyS")) _move.sub(_forward);
        if (keys.has("KeyD")) _move.add(_right);
        if (keys.has("KeyA")) _move.sub(_right);
        let dy = 0;
        if (keys.has("KeyE")) dy += 1; // up
        if (keys.has("KeyQ")) dy -= 1; // down
        _move.y = dy;
        if (_move.lengthSq() > 0) {
          _move.normalize().multiplyScalar(speed * delta);
          // The walk shares one boundary with the dolly — same street floor,
          // same fog ceiling. The orbit target follows the delta the clamp
          // actually allowed, so the two never drift apart.
          const kept = clampToCity(
            {
              x: camera.position.x + _move.x,
              y: camera.position.y + _move.y,
              z: camera.position.z + _move.z,
            },
            frame?.bounds ?? null,
            frame?.centre ?? ORIGIN,
            frame?.surface,
          );
          _move.set(
            kept.x - camera.position.x,
            kept.y - camera.position.y,
            kept.z - camera.position.z,
          );
          camera.position.set(kept.x, kept.y, kept.z);
          if (!free) {
            controls.target.add(_move);
            controls.update();
          }
        }

        // Turntable: the arrow keys carry the camera around the current level,
        // which always sits on the world origin (flyToDirOverview assumes it).
        if (
          keys.has("ArrowLeft") ||
          keys.has("ArrowRight") ||
          keys.has("ArrowUp") ||
          keys.has("ArrowDown")
        ) {
          _pivot.set(centre.x, PIVOT_Y, centre.z);
          const dTheta = (keys.has("ArrowRight") ? 1 : 0) - (keys.has("ArrowLeft") ? 1 : 0);
          const dPhi = (keys.has("ArrowDown") ? 1 : 0) - (keys.has("ArrowUp") ? 1 : 0);
          const next = turntableStep(
            camera.position,
            _pivot,
            dTheta * 1.15 * delta,
            dPhi * 0.9 * delta,
          );
          if (next) {
            camera.position.set(next.x, next.y, next.z);
            if (free) {
              camera.lookAt(_pivot);
              // Keep the drag-look state honest: turning and dragging at the
              // same time then compose instead of fighting over rotation.
              _euler.setFromQuaternion(camera.quaternion, "YXZ");
              look.current.yaw = _euler.y;
              look.current.pitch = _euler.x;
            } else {
              controls.target.copy(_pivot);
              controls.update();
            }
          }
        }
      }
    }

    // The construction crane follows the city's size — see craneAdvance. It
    // yields within the same frame the pilot touches anything (a held key or a
    // drag), which is sooner than CityTree's 10 Hz director can notice the
    // manual stamp, and it never fights a flight that is already running.
    const tween = tweenRef.current;
    const crane =
      !tween && keys.size === 0 && !dragging.current ? useStore.getState().craneFraming : null;
    if (crane) {
      const step = craneAdvance(camera.position, controls.target, crane, delta);
      const kept = clampToCity(
        step.pos,
        frame?.bounds ?? null,
        frame?.centre ?? ORIGIN,
        frame?.surface,
      );
      camera.position.set(kept.x, kept.y, kept.z);
      _look.set(step.target.x, step.target.y, step.target.z);
      if (free) {
        camera.lookAt(_look);
        _euler.setFromQuaternion(camera.quaternion, "YXZ");
        look.current.yaw = _euler.y;
        look.current.pitch = _euler.x;
      } else {
        controls.target.copy(_look);
        controls.update();
      }
    }

    if (tween) {
      tween.t = Math.min(1, tween.t + delta / tween.dur);
      const e = easeInOutCubic(tween.t);
      camera.position.lerpVectors(tween.fromPos, tween.toPos, e);
      if (free) {
        // FREE: look directly at the lerped target point — OrbitControls is
        // disabled and must never reposition the camera here.
        _look.lerpVectors(tween.fromTarget, tween.toTarget, e);
        camera.lookAt(_look);
      } else {
        controls.target.lerpVectors(tween.fromTarget, tween.toTarget, e);
        controls.update();
      }
      if (tween.t >= 1) tweenRef.current = null;
    }

    // A share take owns its hook and its last frame. The fitted pose is held
    // while the city stands and nothing else is flying; this is what keeps the
    // result-first open and the ending identical even if a stale controls
    // target or a late stage write would otherwise swing the view away.
    if (
      shareHero &&
      useStore.getState().buildPhase === "built" &&
      !tweenRef.current &&
      !crane &&
      keys.size === 0 &&
      !dragging.current &&
      free
    ) {
      camera.position.set(shareHero.position.x, shareHero.position.y, shareHero.position.z);
      _look.set(shareHero.target.x, shareHero.target.y, shareHero.target.z);
      camera.lookAt(_look);
    }

    // Idle drift: after 4 s of no input in orbit mode, the camera slowly
    // orbits around the city centre. Any pointer/key/wheel/tween/crane input
    // kills it within the same frame. Respects prefers-reduced-motion.
    const idleThreshold = 4;
    const idleSpeed = 0.06;
    const manualAt = useStore.getState().cameraManualAt;
    const now = Date.now();
    const idleEligible =
      !free &&
      !tween &&
      !crane &&
      keys.size === 0 &&
      !dragging.current &&
      frame !== undefined &&
      now - manualAt > idleThreshold * 1000 &&
      !reducedMotionRef.current;
    if (idleEligible) {
      const angle = idleSpeed * delta;
      const dx = camera.position.x - centre.x;
      const dz = camera.position.z - centre.z;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      camera.position.x = centre.x + dx * cos - dz * sin;
      camera.position.z = centre.z + dx * sin + dz * cos;
      controls.target.set(centre.x, controls.target.y, centre.z);
      controls.update();
    }

    // The bracket pair's mark on a district plot. Read every frame rather than
    // through React state: the mark changes on a keypress, and a re-render of
    // the scene graph for one outline is not a price the world should pay.
    const markMesh = markRef.current;
    if (markMesh) {
      const mark = getKeyboardMark();
      const block = mark && frame ? frame.blocks.find((b) => b.dir.path === mark.path) : null;
      markMesh.visible = !!block;
      if (block) {
        surfacePoint(frame?.surface ?? FLAT_SURFACE, block.x, 1.4, block.z, markMesh.position);
        surfaceQuaternion(frame?.surface ?? FLAT_SURFACE, block.x, block.z, markMesh.quaternion);
        markMesh.rotateX(-Math.PI / 2);
        markMesh.scale.set(block.w / 2 + 5, block.d / 2 + 5, 1);
      }
    }

    frameCount.current++;
    // The pilot's one question they cannot ask themselves: is the city still
    // in my frame? A quarter-second beat, counted in seconds and not in
    // frames — a frame-count beat is 0.5 s on a machine drawing 60 fps and 3 s
    // on a software renderer, and the answer must not depend on which one the
    // user happens to be on.
    lostCheckAt.current += delta;
    if (lostCheckAt.current >= 0.25) {
      lostCheckAt.current = 0;
      const lost =
        cityFrameState(
          camera,
          frame?.bounds ?? null,
          lostRef.current,
          frame?.centre ?? ORIGIN,
          frame?.top ?? CITY_TOP,
          frame?.surface,
        ) === "lost";
      if (lost !== lostRef.current) {
        lostRef.current = lost;
        setCityLostView(lost);
      }
    }

    if (frameCount.current % 6 === 0) {
      const reported: CameraInfo = free
        ? (() => {
            // Free flight reports the VIEW heading (minimap cone) and the
            // distance to the city core (drives the LOD tiers).
            camera.getWorldDirection(_dir);
            return {
              x: camera.position.x,
              z: camera.position.z,
              angle: Math.atan2(_dir.x, _dir.z),
              dist: camera.position.distanceTo(_pivot.set(centre.x, PIVOT_Y, centre.z)),
            };
          })()
        : {
            x: camera.position.x,
            z: camera.position.z,
            angle: Math.atan2(
              camera.position.x - controls.target.x,
              camera.position.z - controls.target.z,
            ),
            dist: camera.position.distanceTo(controls.target),
          };
      // The HUD only ever asks "where is the camera", so a write that changes
      // nothing is a re-render for nobody: every 6th frame put a fresh object
      // into the store, even while the city stood still (5 writes per idle
      // six-second sample). Same view within a hair → say nothing.
      const last = lastReported.current;
      const moved =
        !last ||
        Math.abs(last.x - reported.x) > 0.01 ||
        Math.abs(last.z - reported.z) > 0.01 ||
        Math.abs(last.dist - reported.dist) > 0.01 ||
        Math.abs(angleDelta(last.angle, reported.angle)) > 0.004;
      if (moved) {
        lastReported.current = reported;
        setCameraInfo(reported);
      }
    }
  });

  return (
    <>
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enabled={cameraMode === "orbit"}
        maxPolarAngle={Math.PI / 2.05}
        minDistance={3}
        maxDistance={Math.max(520, cityClampRadius(cityFrame?.bounds ?? 0))}
        enableDamping
        dampingFactor={0.11}
        rotateSpeed={0.85}
        zoomSpeed={1.15}
        panSpeed={1.0}
        screenSpacePanning
      />
      {/* The district the bracket pair is standing on. Drawn over everything on
          purpose: it answers a key the user just pressed, and a mark the podium
          hides would leave the answer unverifiable. */}
      <mesh ref={markRef} visible={false} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.86, 1, 48]} />
        <meshBasicMaterial
          color={MARKER_COLOR}
          transparent
          opacity={0.92}
          depthTest={false}
          toneMapped={false}
        />
      </mesh>
    </>
  );
}
