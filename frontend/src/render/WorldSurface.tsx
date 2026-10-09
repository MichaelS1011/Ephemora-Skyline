import { createContext, useContext, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import {
  FLAT_SURFACE,
  surfacePoint,
  surfaceQuaternion,
  type WorldSurface,
} from "../city/worldSurface";

export const WorldSurfaceContext = createContext<WorldSurface>(FLAT_SURFACE);
export const useWorldSurface = (): WorldSurface => useContext(WorldSurfaceContext);

/** Real group transforms: DOM anchors and raycasting follow the same land. */
export function SurfaceAnchor({ x, z, children }: { x: number; z: number; children: ReactNode }) {
  const surface = useWorldSurface();
  const pose = useMemo(
    () => ({
      position: surfacePoint(surface, x, 0, z),
      quaternion: surfaceQuaternion(surface, x, z),
    }),
    [surface, x, z],
  );
  return (
    <group position={pose.position} quaternion={pose.quaternion}>
      <group position={[-x, 0, -z]}>{children}</group>
    </group>
  );
}

/** Noninteractive connection geometry is already sampled along its curves.
 * Bend its vertices in world space; moving particles use the same mapping.
 * Interactive objects use actual transforms instead (SurfaceAnchor/matrices). */
export function SurfaceCurves({ children }: { children: ReactNode }) {
  const surface = useWorldSurface();
  const group = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    if (!group.current || surface.strength === 0) return;
    const seen = new Set<THREE.Material>();
    const restore: Array<() => void> = [];
    group.current.traverse((object) => {
      const drawable = object as THREE.Mesh;
      if (!drawable.material) return;
      const culled = object.frustumCulled;
      object.frustumCulled = false;
      restore.push(() => {
        object.frustumCulled = culled;
      });
      for (const material of Array.isArray(drawable.material)
        ? drawable.material
        : [drawable.material]) {
        if (seen.has(material)) continue;
        seen.add(material);
        const before = material.onBeforeCompile;
        const key = material.customProgramCacheKey;
        material.onBeforeCompile = (shader, renderer) => {
          before.call(material, shader, renderer);
          shader.uniforms.uSurfaceCentre = {
            value: new THREE.Vector2(surface.centre.x, surface.centre.z),
          };
          shader.uniforms.uSurfaceCurvature = { value: 1 / surface.radius };
          shader.vertexShader =
            `uniform vec2 uSurfaceCentre; uniform float uSurfaceCurvature;\n` +
            shader.vertexShader.replace(
              "#include <project_vertex>",
              `
              vec4 surfaceWorld = modelMatrix * vec4(transformed, 1.0);
              vec2 surfaceOffset = surfaceWorld.xz - uSurfaceCentre;
              vec2 unitOffset = surfaceOffset * uSurfaceCurvature;
              float surfaceY = sqrt(max(0.0, 1.0-dot(unitOffset,unitOffset)));
              vec3 surfaceN = normalize(vec3(unitOffset.x, surfaceY, unitOffset.y));
              float surfaceSag = -dot(surfaceOffset,unitOffset)/(1.0+surfaceY);
              surfaceWorld.xyz = vec3(surfaceWorld.x, surfaceSag, surfaceWorld.z) + surfaceN*surfaceWorld.y;
              vec4 mvPosition = viewMatrix * surfaceWorld;
              gl_Position = projectionMatrix * mvPosition;
            `,
            );
        };
        material.customProgramCacheKey = () =>
          `${key.call(material)}:worldSurface:${surface.radius}:${surface.centre.x}:${surface.centre.z}`;
        material.needsUpdate = true;
        restore.push(() => {
          material.onBeforeCompile = before;
          material.customProgramCacheKey = key;
          material.needsUpdate = true;
        });
      }
    });
    return () => restore.forEach((undo) => undo());
  }, [surface, children]);
  return <group ref={group}>{children}</group>;
}
