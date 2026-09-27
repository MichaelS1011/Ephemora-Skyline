import { useEffect, useRef } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { useStore } from "../stores/useStore";

/**
 * Camera rig — click-to-fly navigation with eased transitions.
 * Owns the OrbitControls so flights can disable user input mid-tween
 * and report the real camera position to the Minimap.
 */

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

export function CameraRig() {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();
  const flyRequest = useStore((s) => s.flyRequest);
  const setCameraInfo = useStore((s) => s.setCameraInfo);

  const tweenRef = useRef<Tween | null>(null);
  const lastNonce = useRef(-1);
  const frameCount = useRef(0);

  // ── React to fly requests ────────────────────────────────────────────────
  useEffect(() => {
    if (!flyRequest || flyRequest.nonce === lastNonce.current) return;
    lastNonce.current = flyRequest.nonce;

    const { x, z, distance } = flyRequest;
    const toPos = new THREE.Vector3(x + distance * 0.4, distance * 0.75, z + distance * 0.75);
    const toTarget = new THREE.Vector3(x, 1.5, z);

    const controls = controlsRef.current;
    const fromPos = camera.position.clone();
    const fromTarget = controls ? controls.target.clone() : new THREE.Vector3();

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion || !controls) {
      camera.position.copy(toPos);
      if (controls) {
        controls.target.copy(toTarget);
        controls.update();
      }
      return;
    }
    tweenRef.current = { fromPos, toPos, fromTarget, toTarget, t: 0, dur: 1.3 };
  }, [flyRequest, camera]);

  // ── Per-frame tween + camera reporting ───────────────────────────────────
  useFrame((_, delta) => {
    const controls = controlsRef.current;
    const tween = tweenRef.current;

    if (controls) controls.enabled = !tween;

    if (tween && controls) {
      tween.t = Math.min(1, tween.t + delta / tween.dur);
      const e = easeInOutCubic(tween.t);
      camera.position.lerpVectors(tween.fromPos, tween.toPos, e);
      controls.target.lerpVectors(tween.fromTarget, tween.toTarget, e);
      controls.update();
      if (tween.t >= 1) tweenRef.current = null;
    }

    frameCount.current++;
    if (frameCount.current % 6 === 0) {
      setCameraInfo({
        x: camera.position.x,
        z: camera.position.z,
        angle: controls
          ? Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z)
          : 0,
      });
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      maxPolarAngle={Math.PI / 2.15}
      minDistance={9}
      maxDistance={520}
      enableDamping
      dampingFactor={0.09}
    />
  );
}
