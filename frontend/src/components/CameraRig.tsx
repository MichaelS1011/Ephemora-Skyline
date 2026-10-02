import { useEffect, useRef } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { useStore } from "../stores/useStore";

/**
 * Camera rig — the user is the pilot, in two modes:
 *
 * FREE (default)  — drag looks around freely, WASD/QE walks, the wheel
 *                   dollies along the view. Selection never moves the camera.
 * ORBIT           — double-click a building: the camera circles ITS viewpoint
 *                   for inspection. Esc returns to free flight.
 *
 * Flight requests set up short, gentle tweens toward a point of interest in
 * BOTH modes, but control is NEVER taken away: the tween is aborted the
 * instant the user drags, scrolls or walks, and the camera reports its real
 * position to the Minimap.
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
 * Camera position for a flight to `target`, arriving at `distance` while
 * KEEPING the user's current viewing direction: the vector from the old
 * orbit target to the camera (its azimuth + elevation) is reused around the
 * new target, so a flight never drags the camera to a fixed south-east
 * vantage the user never chose.
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
): XYZ {
  const ox = camPos.x - camTarget.x;
  const oy = camPos.y - camTarget.y;
  const oz = camPos.z - camTarget.z;
  const offsetLen = Math.hypot(ox, oy, oz);
  if (offsetLen < 1e-9) {
    // Legacy default approach — the pre-pilot fixed south-east vantage.
    return {
      x: target.x + distance * 0.4,
      y: distance * 0.75,
      z: target.z + distance * 0.75,
    };
  }
  const s = distance / offsetLen;
  return { x: target.x + ox * s, y: target.y + oy * s, z: target.z + oz * s };
}

/**
 * Short, snappy flight duration derived from the target distance:
 * 0.35 s floor (a hop), 1.6 s cap (a cross-city glide) by default.
 * Callers with an explicit duration (e.g. the construction crane) win.
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

// ── WASD/QE walk — reusable module-level vectors (no per-frame allocation) ──
const WALK_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE"]);
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _move = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _look = new THREE.Vector3();
const _euler = new THREE.Euler(0, 0, 0, "YXZ");

function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || typeof el.tagName !== "string") return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable === true;
}

function dialogOpen(): boolean {
  return !!document.querySelector('[aria-modal="true"]');
}

export function CameraRig() {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const { camera, gl } = useThree();
  const flyRequest = useStore((s) => s.flyRequest);
  const setCameraInfo = useStore((s) => s.setCameraInfo);
  const cityData = useStore((s) => s.cityData);
  const cameraMode = useStore((s) => s.cameraMode);

  const tweenRef = useRef<Tween | null>(null);
  const lastNonce = useRef(-1);
  const frameCount = useRef(0);
  // The first flight after a fresh city load has no user-established
  // viewpoint yet — it keeps the legacy fallback approach; every later
  // flight preserves the direction the user is looking from.
  const firstFlightRef = useRef(true);
  const pressedKeys = useRef<Set<string>>(new Set());

  // Free-look state — synced from the LIVE camera pose whenever a drag
  // starts (never from stale state), so mode switches never jump.
  const look = useRef({ yaw: 0, pitch: 0 });
  const dragging = useRef(false);
  const lastPointer = useRef({ x: 0, y: 0 });
  // Mirrors cameraMode for the frame loop / listeners (no stale closures).
  const modeRef = useRef<"free" | "orbit">(cameraMode);
  modeRef.current = cameraMode;

  // A fresh city resets the viewpoint: the next flight uses the fallback.
  useEffect(() => {
    firstFlightRef.current = true;
  }, [cityData]);

  // A skip hands control back immediately: the construction crane flight
  // must not keep gliding while the user already skipped the cinematic
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
      controls.target.copy(camera.position).addScaledVector(_dir, 12);
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
    };
    controls.addEventListener("start", abortTween);

    const onPointerDown = (e: PointerEvent) => {
      if (modeRef.current !== "free" || e.button !== 0) return;
      dragging.current = true;
      lastPointer.current = { x: e.clientX, y: e.clientY };
      const { yaw, pitch } = deriveLookAngles(camera.quaternion);
      look.current = { yaw, pitch };
      tweenRef.current = null; // the user takes over
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
      tweenRef.current = null;
      if (modeRef.current !== "free") return; // orbit mode: OrbitControls zooms
      // Dolly along the view direction — the wheel walks you into the city.
      camera.getWorldDirection(_dir);
      const step = -e.deltaY * 0.012 * Math.max(2, camera.position.y * 0.15 + 4);
      camera.position.addScaledVector(_dir, step);
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

  // ── WASD/QE walk — key tracking (guarded against typing + dialogs) ───────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!WALK_KEYS.has(e.code)) return;
      // Typing or an open modal dialog owns the keyboard — drop all walk
      // keys so no stale held key keeps gliding behind the dialog.
      if (isTypingTarget(e.target) || dialogOpen()) {
        pressedKeys.current.clear();
        return;
      }
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
    // y); every other caller keeps the ground-level default.
    const toTarget = new THREE.Vector3(x, flyRequest.targetY ?? 1.5, z);

    const controls = controlsRef.current;
    const fromPos = camera.position.clone();
    const fromTarget = controls ? controls.target.clone() : new THREE.Vector3();

    // Direction-preserving approach once the user has a real viewpoint;
    // the very first flight of a fresh city keeps the legacy fallback
    // (modeled by collapsing camPos onto camTarget — the helper's
    // degenerate case).
    const preserve = !!controls && !firstFlightRef.current;
    const anchor = preserve
      ? { x: fromTarget.x, y: fromTarget.y, z: fromTarget.z }
      : { x: fromPos.x, y: fromPos.y, z: fromPos.z };
    const pos = approachFromCurrentDirection(
      { x: fromPos.x, y: fromPos.y, z: fromPos.z },
      anchor,
      { x: toTarget.x, y: toTarget.y, z: toTarget.z },
      distance,
    );
    const toPos = new THREE.Vector3(pos.x, pos.y, pos.z);
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
    // A caller supplied duration (e.g. the construction crane flight) wins;
    // otherwise the flight stays short and snappy (0.35–1.6 s).
    tweenRef.current = {
      fromPos,
      toPos,
      fromTarget,
      toTarget,
      t: 0,
      dur: flyRequest.duration ?? flightDuration(distance),
    };
  }, [flyRequest, camera, cameraMode]);

  // ── Per-frame tween + walk + camera reporting ────────────────────────────
  useFrame((_, delta) => {
    const free = modeRef.current === "free";
    const controls = controlsRef.current;
    if (!controls) return;

    // Walk: WASD/QE. Any walk key also aborts a running tween — the user
    // takes over. In ORBIT mode camera + target move together (the circle
    // follows); in FREE mode only the camera moves along its own axes.
    const keys = pressedKeys.current;
    if (keys.size > 0) {
      // Re-check the guard per frame: a dialog may have opened (or focus
      // moved into an input) while a key was already held down.
      if (isTypingTarget(document.activeElement) || dialogOpen()) {
        keys.clear();
      } else {
        tweenRef.current = null;
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
          // Never walk below the ground.
          const nextY = camera.position.y + _move.y;
          if (nextY < 1) _move.y = 1 - camera.position.y;
          camera.position.add(_move);
          if (!free) {
            controls.target.add(_move);
            controls.update();
          }
        }
      }
    }

    const tween = tweenRef.current;
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

    frameCount.current++;
    if (frameCount.current % 6 === 0) {
      if (free) {
        // Free flight reports the VIEW heading (minimap cone) and the
        // distance to the city core (drives the LOD tiers).
        camera.getWorldDirection(_dir);
        setCameraInfo({
          x: camera.position.x,
          z: camera.position.z,
          angle: Math.atan2(_dir.x, _dir.z),
          dist: camera.position.length(),
        });
      } else {
        setCameraInfo({
          x: camera.position.x,
          z: camera.position.z,
          angle: Math.atan2(
            camera.position.x - controls.target.x,
            camera.position.z - controls.target.z,
          ),
          dist: camera.position.distanceTo(controls.target),
        });
      }
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enabled={cameraMode === "orbit"}
      maxPolarAngle={Math.PI / 2.05}
      minDistance={3}
      maxDistance={520}
      enableDamping
      dampingFactor={0.11}
      rotateSpeed={0.85}
      zoomSpeed={1.15}
      panSpeed={1.0}
      screenSpacePanning
    />
  );
}
