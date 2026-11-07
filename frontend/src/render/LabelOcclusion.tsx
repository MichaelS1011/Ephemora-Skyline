"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ComponentProps,
  type RefObject,
} from "react";
import { Html } from "@react-three/drei";
import type { Object3D } from "three";

/**
 * The solid city volumes a DOM label may hide behind. The provider is set by
 * `CityTree` around exactly the plots and towers — roads, the crowd and the
 * arcs are not in it, because a passing resident or a thin dependency line
 * must not erase a label.
 */
export const LabelOccludersContext = createContext<Object3D | null>(null);

/** Keep a label through a short crossing, then fade. A tower edge can cut the
 *  camera ray for a frame or two while the reader orbits; hiding on that frame
 *  would make every plate flicker. */
const HIDE_AFTER_MS = 140;
const SHOW_AFTER_MS = 90;

type OccludableHtmlProps = ComponentProps<typeof Html>;

export function OccludableHtml({ children, ...props }: OccludableHtmlProps) {
  const occluder = useContext(LabelOccludersContext);
  const [occluded, setOccluded] = useState(false);
  const [hidden, setHidden] = useState(false);
  const occlude = useMemo(
    () => (occluder ? ([{ current: occluder }] as RefObject<Object3D>[]) : undefined),
    [occluder],
  );

  useEffect(() => {
    if (occluded === hidden) return;
    const timer = window.setTimeout(
      () => setHidden(occluded),
      occluded ? HIDE_AFTER_MS : SHOW_AFTER_MS,
    );
    return () => window.clearTimeout(timer);
  }, [occluded, hidden]);

  return (
    <Html {...props} occlude={occlude} onOcclude={setOccluded}>
      <div
        className="label-occludable"
        data-occluded={hidden ? "true" : undefined}
        aria-hidden={hidden || undefined}
      >
        {children}
      </div>
    </Html>
  );
}
