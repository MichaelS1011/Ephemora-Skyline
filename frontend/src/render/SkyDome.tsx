"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import {
  SKY_FRAGMENT_SHADER,
  SKY_RADIUS,
  SKY_SEGMENTS,
  SKY_STOPS,
  SKY_SUN_DIRECTION,
  SKY_VERTEX_SHADER,
} from "./sky";

/**
 * The graded sky around the model — one sphere, one draw call, no texture.
 *
 * It replaces a single-colour background fill. The mesh is pinned to the far
 * plane by its own vertex shader, so it needs no per-frame work: nothing here
 * moves, animates or reads the clock, which is also why it is not part of the
 * reduced-motion surface — there is nothing to still.
 */
export function SkyDome() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uHorizon: { value: new THREE.Color(SKY_STOPS.horizon) },
          uZenith: { value: new THREE.Color(SKY_STOPS.zenith) },
          uSun: { value: new THREE.Color(SKY_STOPS.sun) },
          uSunDir: {
            value: new THREE.Vector3(...SKY_SUN_DIRECTION),
          },
        },
        vertexShader: SKY_VERTEX_SHADER,
        fragmentShader: SKY_FRAGMENT_SHADER,
        side: THREE.BackSide,
        depthWrite: false,
        // The dome IS the atmosphere; haze must not wash the haze out.
        fog: false,
      }),
    [],
  );

  useEffect(() => () => material.dispose(), [material]);

  return (
    <mesh material={material} frustumCulled={false} renderOrder={-1000} raycast={() => null}>
      <sphereGeometry args={[SKY_RADIUS, SKY_SEGMENTS[0], SKY_SEGMENTS[1]]} />
    </mesh>
  );
}
