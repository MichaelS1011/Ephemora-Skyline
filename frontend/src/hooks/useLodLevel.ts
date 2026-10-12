"use client";

import { useEffect, useState } from "react";
import { useStore } from "../stores/useStore";
import { useLodFar } from "./useLodFar";

/**
 * Stepped semantic zoom on top of the existing far-LOD logic. Three tiers:
 *   0 = Skyline  — the city as one heat grid (the old lodFar threshold:
 *                  dist > max(170, bounds × 4.8), with hysteresis)
 *   1 = District — far enough to read whole blocks (dist ≥ bounds × 0.8)
 *   2 = Near     — street level (dist < bounds × 0.8)
 *
 * A WRAPPER over useLodFar, never a fork: HeatCells/HeatmapToggle keep using
 * useLodFar directly, the threshold logic exists exactly once.
 */

export type LodLevel = 0 | 1 | 2;

/** Near-tier threshold relative to the level bounds. */
const RELATIVE_NEAR = 0.8;
/** Hysteresis: leaving the near tier happens a bit later than entering. */
const RELATIVE_NEAR_EXIT = 0.95;

export function useLodLevel(bounds: number): LodLevel {
  const far = useLodFar(bounds);
  const dist = useStore((s) => s.cameraInfo.dist);
  const nearEnter = bounds * RELATIVE_NEAR;
  const nearExit = bounds * RELATIVE_NEAR_EXIT;
  const [near, setNear] = useState(dist < nearEnter);
  useEffect(() => {
    setNear((prev) => (prev ? dist < nearExit : dist < nearEnter));
  }, [dist, nearEnter, nearExit]);
  if (far) return 0;
  return near ? 2 : 1;
}

/** Stepped-zoom thresholds, exported for tests and the HUD hint. */
export const LOD_LEVEL_THRESHOLDS = { RELATIVE_NEAR, RELATIVE_NEAR_EXIT } as const;
