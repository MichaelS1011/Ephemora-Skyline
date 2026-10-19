import { useEffect, useRef } from "react";
import { REDUCED_TRANSPARENCY_QUERY, prefersReducedTransparency } from "../city/motion";
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
/* Only the functional layer. The reading surfaces — `.panel-card`, its file and
 * findings children, `.panel-context-card` — wear `--material-read-bg`, a fixed
 * thick plate, and the sampler must not touch them: Apple asks the text-heavy
 * layer for the standard material, and a stage that thins under 245 words of
 * 12 px text is a legibility regression dressed as a look. */
const GLASS_SURFACES = [
  ".workspace-header",
  ".workspace-modes .glass",
  ".workspace-heatmap .glass",
  ".action-dock-row",
  ".start-summary",
  ".start-summary-strip",
  ".city-coach",
];

/**
 * Apple's material carries an obligation: where the user asks for less
 * transparency, the material becomes solid. `globals.css` pins both tokens
 * opaque under that query, and an inline stage written here would win over the
 * sheet — so the sampler stands off and takes back whatever it had already
 * written. Environments without the query (the node test runner) are treated as
 * no request.
 */
function surfaces(root: ParentNode): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const selector of GLASS_SURFACES)
    for (const el of root.querySelectorAll<HTMLElement>(selector)) out.push(el);
  return out;
}

/** Exported for `tests/glas-chrome.test.ts`: clearing is the visible half — a
 *  bar that kept its inline stage would stay translucent after the request. */
export function clearGlassStages(root: ParentNode): void {
  for (const el of surfaces(root)) el.style.removeProperty("--glass-control-bg");
}

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
      if (prefersReducedTransparency()) {
        clearGlassStages(document);
        return;
      }
      const canvas = host.querySelector<HTMLCanvasElement>("canvas");
      if (!canvas || canvas.width === 0) return;
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      // The panels are siblings of the canvas, not its children — they live in
      // the overlay App mounts beside the world — so the query starts at the
      // shell, while the picture being sampled is the canvas the ref holds.
      const shell = host.closest<HTMLElement>(".app-shell") ?? document;
      for (const el of surfaces(shell)) {
        const rect = el.getBoundingClientRect();
        if (rect.width < 4 || rect.height < 4) continue;
        const Y = backdropLuminance(canvas, rect, viewport);
        if (Y === null) continue;
        applyGlassStage(el, glassAlphaFor(Y), seen.current);
      }
    };
    const id = window.setInterval(tick, MIN_INTERVAL_MS);
    tick();
    // Mid-session the request can arrive while stages are on screen: drop them
    // and forget the hysteresis, so a later lift starts from the sheet again.
    const mq =
      typeof window.matchMedia === "function"
        ? window.matchMedia(REDUCED_TRANSPARENCY_QUERY)
        : null;
    const onChange = (): void => {
      seen.current = new WeakMap();
      clearGlassStages(document);
    };
    mq?.addEventListener?.("change", onChange);
    return () => {
      window.clearInterval(id);
      mq?.removeEventListener?.("change", onChange);
    };
  }, [hostRef]);
}
