import * as THREE from "three";
import type { DirLayout, StreetLine } from "./layout";

/** Curvature is a view of the drawn land, never a score for code volume. */
export interface WorldSurface {
  centre: { x: number; z: number };
  extent: number;
  strength: number;
  radius: number;
}

export const SURFACE_LIMITS = {
  flatExtent: 45,
  globeExtent: 180,
  maxSlope: 0.34,
  detailStrength: 0.4,
  roadSegment: 7,
} as const;

export const FLAT_SURFACE: WorldSurface = {
  centre: { x: 0, z: 0 },
  extent: 0,
  strength: 0,
  radius: Infinity,
};

/** The data-bearing plots, excluding the layout's empty framing margin.
 * Wide perimeter roads around a two-file town must not turn it into a globe. */
export function surfaceFootprint(layout: DirLayout): number {
  let extent = 0;
  const { centre } = layout;
  for (const plot of [...layout.blocks, ...layout.buildings]) {
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        extent = Math.max(
          extent,
          Math.hypot(
            plot.x + sx * (plot.w / 2 + 2) - centre.x,
            plot.z + sz * (plot.d / 2 + 2) - centre.z,
          ),
        );
      }
  }
  return extent;
}

export function makeWorldSurface(
  extent: number,
  centre: { x: number; z: number } = FLAT_SURFACE.centre,
  detail = false,
): WorldSurface {
  const safeExtent = Math.max(0, Number.isFinite(extent) ? extent : 0);
  const t = THREE.MathUtils.clamp(
    (safeExtent - SURFACE_LIMITS.flatExtent) /
      (SURFACE_LIMITS.globeExtent - SURFACE_LIMITS.flatExtent),
    0,
    1,
  );
  const strength = t * t * (3 - 2 * t) * (detail ? SURFACE_LIMITS.detailStrength : 1);
  return {
    centre: { ...centre },
    extent: safeExtent,
    strength,
    radius: strength === 0 ? Infinity : safeExtent / (SURFACE_LIMITS.maxSlope * strength),
  };
}

export function surfaceForLayout(layout: DirLayout, detail = false): WorldSurface {
  const land = surfaceFootprint(layout);
  const surface = makeWorldSurface(land, layout.centre, detail);
  // Road ends extend beyond the data-bearing city. Include them in the radius
  // ruler so their slope stays bounded, without using them to trigger curvature.
  const extent = layout.streets.reduce(
    (r, s) =>
      Math.max(
        r,
        Math.hypot(s.x1 - layout.centre.x, s.z1 - layout.centre.z) + 2,
        Math.hypot(s.x2 - layout.centre.x, s.z2 - layout.centre.z) + 2,
      ),
    land,
  );
  return {
    ...surface,
    extent,
    radius:
      surface.strength === 0 ? Infinity : extent / (SURFACE_LIMITS.maxSlope * surface.strength),
  };
}

/** The upper sphere, continued as a tangent beyond the visible hemisphere.
 * The continuation keeps free-flight coordinates finite outside city land. */
export function surfaceHeight(surface: WorldSurface, x: number, z: number): number {
  if (surface.strength === 0) return 0;
  const r = Math.hypot(x - surface.centre.x, z - surface.centre.z);
  const limit = surface.radius * 0.9;
  const at = Math.min(r, limit);
  // Rationalized sag avoids subtracting nearly equal radii at the flat end.
  const h = -(at * at) / (Math.sqrt(surface.radius * surface.radius - at * at) + surface.radius);
  if (r <= limit) return h;
  const slope = -limit / Math.sqrt(surface.radius * surface.radius - limit * limit);
  return h + (r - limit) * slope;
}

export function surfaceNormal(
  surface: WorldSurface,
  x: number,
  z: number,
  out = new THREE.Vector3(),
): THREE.Vector3 {
  if (surface.strength === 0) return out.set(0, 1, 0);
  let dx = x - surface.centre.x;
  let dz = z - surface.centre.z;
  const r = Math.hypot(dx, dz);
  const limit = surface.radius * 0.9;
  if (r > limit) {
    dx *= limit / r;
    dz *= limit / r;
  }
  return out
    .set(dx, Math.sqrt(Math.max(0, surface.radius ** 2 - dx * dx - dz * dz)), dz)
    .normalize();
}

const normal = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0);
const p = new THREE.Vector3();
const rotation = new THREE.Quaternion();
const tangentRotation = new THREE.Matrix4();
const instanceMatrix = new THREE.Matrix4();

/** Altitude follows the local normal, so tower height keeps its meaning. */
export function surfacePoint(
  surface: WorldSurface,
  x: number,
  y: number,
  z: number,
  out = new THREE.Vector3(),
): THREE.Vector3 {
  if (surface.strength === 0) return out.set(x, y, z);
  surfaceNormal(surface, x, z, normal);
  return out.set(x, surfaceHeight(surface, x, z), z).addScaledVector(normal, y);
}

export function surfaceQuaternion(
  surface: WorldSurface,
  x: number,
  z: number,
  out = new THREE.Quaternion(),
): THREE.Quaternion {
  return out.setFromUnitVectors(up, surfaceNormal(surface, x, z, normal));
}

/** Allocation-free; setMatrixAt copies the returned scratch immediately. */
export function surfaceMatrix(surface: WorldSurface, flat: THREE.Matrix4): THREE.Matrix4 {
  if (surface.strength === 0) return flat;
  p.setFromMatrixPosition(flat);
  const x = p.x,
    y = p.y,
    z = p.z;
  surfaceQuaternion(surface, x, z, rotation);
  tangentRotation.makeRotationFromQuaternion(rotation);
  surfacePoint(surface, x, y, z, p);
  // Multiplication preserves zero-scale hidden crew/cargo and any shear;
  // decomposing a collapsed matrix would introduce NaN quaternions.
  return instanceMatrix.multiplyMatrices(tangentRotation, flat).setPosition(p);
}

/** Long tangent boxes would bridge the curved ground. Short sections bound
 * that error and keep the same endpoints and road width. */
export function surfaceStreetSegments(surface: WorldSurface, street: StreetLine): StreetLine[] {
  if (surface.strength === 0) return [street];
  const length = Math.hypot(street.x2 - street.x1, street.z2 - street.z1);
  const count = Math.max(1, Math.ceil(length / SURFACE_LIMITS.roadSegment));
  return Array.from({ length: count }, (_, i) => ({
    ...street,
    x1: THREE.MathUtils.lerp(street.x1, street.x2, i / count),
    z1: THREE.MathUtils.lerp(street.z1, street.z2, i / count),
    x2: THREE.MathUtils.lerp(street.x1, street.x2, (i + 1) / count),
    z2: THREE.MathUtils.lerp(street.z1, street.z2, (i + 1) / count),
  }));
}
