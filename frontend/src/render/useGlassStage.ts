import { useEffect, useRef } from "react";
import {
  MIN_INTERVAL_MS,
  applyGlassStage,
  backdropLuminance,
  glassAlphaFor,
} from "./backdropLuminance";

/**
 * Every panel that floats over the city, by the class its own component writes.
 * A panel that is not on screen costs nothing; a panel that appears mid-visit
 * (the search field, the map) is picked up on the next tick.
 */
const GLASS_SURFACES = [
  ".workspace-header",
  ".workspace-modes .glass",
  ".start-summary",
  ".start-summary-strip",
  ".action-dock-row",
  ".panel-context-card",
  ".panel-info",
  ".city-minimap",
  ".workspace-heatmap",
  ".city-coach",
];

/**
 * Read the picture behind each glass panel and give that panel the stage it
 * needs — see `backdropLuminance.ts` for the ramp and `tests/glas-chrome.test.ts`
 * for the floor it may not cross.
 *
 * It is a timer and not a frame subscription on purpose: the answer changes when
 * the camera moves, and a held frame must not make the chrome breathe. The
 * hysteresis in `applyGlassStage` is the second half of that.
 */
export function useGlassStage(hostRef: { current: HTMLElement | null }): void {
  const seen = useRef(new WeakMap<HTMLElement, number>());

  useEffect(() => {
    const tick = (): void => {
      const host = hostRef.current;
      if (!host) return;
      const canvas = host.querySelector<HTMLCanvasElement>("canvas");
      if (!canvas || canvas.width === 0) return;
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      // The panels are siblings of the canvas, not its children — they live in
      // the overlay App mounts beside the world — so the query starts at the
      // shell, while the picture being sampled is the canvas the ref holds.
      const shell = host.closest<HTMLElement>(".app-shell") ?? document;
      for (const selector of GLASS_SURFACES) {
        for (const el of shell.querySelectorAll<HTMLElement>(selector)) {
          const rect = el.getBoundingClientRect();
          if (rect.width < 4 || rect.height < 4) continue;
          const Y = backdropLuminance(canvas, rect, viewport);
          if (Y === null) continue;
          applyGlassStage(el, glassAlphaFor(Y), seen.current);
        }
      }
    };
    const id = window.setInterval(tick, MIN_INTERVAL_MS);
    tick();
    return () => window.clearInterval(id);
  }, [hostRef]);
}
