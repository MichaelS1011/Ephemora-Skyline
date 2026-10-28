"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useStore } from "../stores/useStore";
import { getDirLayout } from "../city/layout";
import { surfaceForLayout, surfaceMatrix } from "../city/worldSurface";
import { ENV } from "../city/palette";
import { recentCities } from "../recentCities";
import {
  TOWER_FOOT,
  TOWER_FOOT_PAD,
  hamletOffsets,
  selectNeighbourIds,
  townAnchors,
  townTowers,
  type NeighbourTower,
} from "../city/neighbourTowns";
import type { CityData } from "../city/types";

/**
 * The towns next door, drawn.
 *
 * Two `instancedMesh`es — a tower and the paved pad it stands on — and one unit
 * box scaled per instance: the hamlets of the other folders this browser has
 * scanned, on the open land OUTSIDE the belt and on the far arc, so the dock
 * never covers one. Every decision — which cities, how tall, which ink, where —
 * lives in `city/neighbourTowns.ts` and is guarded there without a renderer;
 * this file only seats the result on the curved ground.
 *
 * Two properties are the point of the picture and both are deliberate:
 *
 *  - **No name is painted.** The exported image is a pixel copy of this canvas,
 *    and the product's anonymity argument rests on names entering a frame only
 *    through `frameTexts()` behind the `showNames` switch. A folder name drawn
 *    here would leave every shared picture by construction.
 *  - **A town that cannot be fetched is not drawn.** The backend keeps twenty
 *    scans for twenty-four hours in memory; when a neighbour's id stops
 *    answering, its hamlet is gone in the same tick, rather than standing as a
 *    half-village of whatever was cached.
 */

interface Town {
  id: string;
  towers: NeighbourTower[];
}

interface PlacedTower {
  x: number;
  z: number;
  height: number;
  ink: string;
}

/** One neighbour city, or nothing when its scan has left the store. */
async function fetchTown(id: string, colorblind: boolean): Promise<Town | null> {
  try {
    const res = await fetch(`/api/result/${encodeURIComponent(id)}/city`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const city = (await res.json()) as CityData;
    const towers = townTowers(city, colorblind);
    return towers.length > 0 ? { id, towers } : null;
  } catch {
    return null;
  }
}

export function NeighbourTowns() {
  const cityData = useStore((s) => s.cityData);
  const analysisId = useStore((s) => s.analysisId);
  const colorblind = useStore((s) => s.prefs.colorblind);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const padRef = useRef<THREE.InstancedMesh>(null);

  const ids = useMemo(
    () => (cityData ? selectNeighbourIds(recentCities(), analysisId ?? null) : []),
    [cityData, analysisId],
  );

  const [towns, setTowns] = useState<Town[]>([]);
  const wanted = ids.join(",");
  useEffect(() => {
    if (ids.length === 0) {
      setTowns([]);
      return;
    }
    let cancelled = false;
    void Promise.all(ids.map((id) => fetchTown(id, colorblind))).then((list) => {
      if (cancelled) return;
      setTowns(list.filter((town): town is Town => town !== null));
    });
    return () => {
      cancelled = true;
    };
  }, [wanted, colorblind]);

  const layout = useMemo(() => (cityData ? getDirLayout(cityData, []) : null), [cityData]);
  const surface = useMemo(() => (layout ? surfaceForLayout(layout, false) : null), [layout]);

  const placed = useMemo<PlacedTower[]>(() => {
    if (!layout) return [];
    const out: PlacedTower[] = [];
    towns.forEach((town, townIndex) => {
      const anchor = townAnchors(townIndex, layout.bounds, towns.length);
      const offsets = hamletOffsets(town.towers.length);
      town.towers.forEach((tower, i) => {
        const offset = offsets[i]!;
        out.push({
          x: anchor.x + offset.x,
          z: anchor.z + offset.z,
          height: tower.height,
          ink: tower.ink,
        });
      });
    });
    return out;
  }, [towns, layout]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    const pads = padRef.current;
    if (!mesh || !pads || !surface) return;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    const pad = new THREE.Color(ENV.plot);
    placed.forEach((tower, i) => {
      dummy.position.set(tower.x, tower.height / 2, tower.z);
      dummy.scale.set(TOWER_FOOT, tower.height, TOWER_FOOT);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, surfaceMatrix(surface, dummy.matrix));
      mesh.setColorAt(i, color.set(tower.ink));
      // The pad lies flat on the ground under its tower: without it a neighbour
      // is a box in the sky, because the far ground has already dissolved into
      // the haze its base stands in.
      dummy.position.set(tower.x, 0.06, tower.z);
      dummy.scale.set(TOWER_FOOT_PAD, 0.12, TOWER_FOOT_PAD);
      dummy.updateMatrix();
      pads.setMatrixAt(i, surfaceMatrix(surface, dummy.matrix));
      pads.setColorAt(i, pad);
    });
    // A shrunk list must not leave the old hamlets standing at their old slots.
    dummy.scale.set(0, 0, 0);
    dummy.position.set(0, 0, 0);
    dummy.updateMatrix();
    for (let i = placed.length; i < mesh.count; i += 1) {
      mesh.setMatrixAt(i, dummy.matrix);
      pads.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    pads.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    if (pads.instanceColor) pads.instanceColor.needsUpdate = true;
  }, [placed, surface]);

  if (placed.length === 0) return null;
  return (
    <group name="neighbour-towns">
      <instancedMesh
        key={`towers-${placed.length}`}
        ref={meshRef}
        args={[undefined, undefined, placed.length]}
        frustumCulled={false}
        raycast={() => null}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.92} metalness={0} />
      </instancedMesh>
      <instancedMesh
        key={`pads-${placed.length}`}
        ref={padRef}
        args={[undefined, undefined, placed.length]}
        frustumCulled={false}
        raycast={() => null}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.98} metalness={0} />
      </instancedMesh>
    </group>
  );
}
