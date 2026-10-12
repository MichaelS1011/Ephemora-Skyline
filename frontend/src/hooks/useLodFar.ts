"use client";

import { useEffect, useState } from "react";
import { useStore } from "../stores/useStore";

/**
 * Distance-based LOD switch with hysteresis. The threshold is RELATIVE to
 * the current level's bounds: drilling into a large district flies the
 * camera further out in absolute terms, but that must not flip the view
 * into heat-cell mode — only zooming far beyond the city's own extent
 * does. Hysteresis (exit closer than enter) prevents flicker while
 * hovering around the threshold.
 */

// A fitted 38° overview needs more eye distance than the old low-angle crop.
// The city stays geometric through that complete view; further zoom uses cells.
const RELATIVE_ENTER = 4.8;
const RELATIVE_EXIT = 3.8;
const ABSOLUTE_FLOOR = 170; // small levels never collapse before this

export function useLodFar(bounds: number): boolean {
  const dist = useStore((s) => s.cameraInfo.dist);
  const enter = Math.max(ABSOLUTE_FLOOR, bounds * RELATIVE_ENTER);
  const exit = Math.max(ABSOLUTE_FLOOR * 0.7, bounds * RELATIVE_EXIT);
  const [far, setFar] = useState(dist > enter);
  useEffect(() => {
    setFar((prev) => (prev ? dist > exit : dist > enter));
  }, [dist, enter, exit]);
  return far;
}

/** Heat-cell mode thresholds, exported for tests and the HUD hint. */
export const LOD_THRESHOLDS = { RELATIVE_ENTER, RELATIVE_EXIT, ABSOLUTE_FLOOR } as const;
