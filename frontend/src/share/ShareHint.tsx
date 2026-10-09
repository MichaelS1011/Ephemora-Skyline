/**
 * The one nudge.
 *
 * It appears when a finished city is on screen, once per city, on a small card
 * in the corner, and it fades on its own. A city that already had one gets
 * none, and a closed hint is never asked again for anybody, because the second
 * question is the one people remember. It covers nothing, moves nothing, and
 * stays out of the way of a scan, a triage or a camera flight.
 *
 * "A finished city" is read two ways on purpose. A city that rose while you
 * watched it is the obvious case, and the app answers a `?city=` reload with
 * the skyline already standing (measured: the build cinematic does not replay
 * there, which is what plan.md §6 asked for), so a card that waited for the
 * transition would never appear on the visit most days actually are.
 */

import { useEffect, useRef, useState } from "react";
import { useStore } from "../stores/useStore";
import { openStudio } from "./studioBus";
import { tx } from "./fallbackCopy";
import "../design/share.css";

const STORE_KEY = "ephemora-share-hint";

interface HintState {
  /** A refusal is permanent, for every city, not just this one. */
  muted: boolean;
  /** Analysis ids that already saw the card. */
  shown: string[];
}

function load(): HintState {
  if (typeof window === "undefined") return { muted: false, shown: [] };
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return { muted: false, shown: [] };
    const parsed = JSON.parse(raw) as Partial<HintState>;
    return { muted: parsed.muted === true, shown: Array.isArray(parsed.shown) ? parsed.shown : [] };
  } catch {
    return { muted: false, shown: [] };
  }
}

function save(state: HintState): void {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch {
    // Storage off: the nudge stays session-only, which is the harmless side.
  }
}

/** The card leaves the screen on its own. It is not a queue item. */
const AUTO_HIDE_MS = 14_000;

export function ShareHint() {
  const buildPhase = useStore((s) => s.buildPhase);
  const cityData = useStore((s) => s.cityData);
  const lang = useStore((s) => s.prefs.lang);
  const triageActive = useStore((s) => s.triageActive);
  const tourActive = useStore((s) => s.tourActive);
  const isLoading = useStore((s) => s.isLoading);
  const [visible, setVisible] = useState(false);
  const hideTimer = useRef<number | null>(null);

  useEffect(() => {
    const cityKey = cityData?.analysisId;
    // A city that is still arriving, still rising, or in the middle of a queue
    // or a tour is not a moment to say anything.
    if (!cityKey || buildPhase !== "built" || isLoading || triageActive || tourActive) return;
    const state = load();
    if (state.muted || state.shown.includes(cityKey)) return;
    state.shown.push(cityKey);
    // Keep the list from growing across a long session of re-scans.
    state.shown = state.shown.slice(-24);
    save(state);
    setVisible(true);
    hideTimer.current = window.setTimeout(() => setVisible(false), AUTO_HIDE_MS);
  }, [buildPhase, cityData, isLoading, triageActive, tourActive]);

  useEffect(
    () => () => {
      if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
    },
    [],
  );

  if (!visible) return null;

  const refuse = (): void => {
    const state = load();
    state.muted = true;
    save(state);
    setVisible(false);
  };

  return (
    <div className="share-hint" role="note" aria-label={tx(lang, "hint.aria")}>
      <p className="share-hint-text">{tx(lang, "hint.text")}</p>
      <div className="share-hint-row">
        <button
          type="button"
          className="share-hint-yes"
          onClick={() => {
            setVisible(false);
            openStudio();
          }}
        >
          ● {tx(lang, "hint.action")}
        </button>
        <button type="button" className="share-hint-no" onClick={refuse}>
          {tx(lang, "hint.dismiss")}
        </button>
      </div>
    </div>
  );
}
