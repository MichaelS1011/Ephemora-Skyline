"use client";

/**
 * The governor's body: one useFrame loop that feeds perf.ts the frame times
 * the renderer actually took, and carries the streak between decisions. It
 * writes to the store only when the machine says MOVE — a decision that
 * changes nothing must not touch React state at 60 Hz.
 *
 * Tab hidden ⇒ rAF stops ⇒ the long gap between the last frame and the first
 * one back is a tab-switch, not a struggling GPU: gaps over half a second
 * drop the sample AND the streak, so returning to the app never dims it.
 */
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useStore } from "../stores/useStore";
import { WINDOW, autoGfxDecision, frameHz } from "../city/perf";

const TAB_SWITCH_S = 0.5;
/** How often the header's number may be rewritten, in ms. */
const PUBLISH_MS = 500;

export function GfxGovernor() {
  const samples = useRef<number[]>([]);
  const streak = useRef(0);
  const zuletzt = useRef(0);

  useFrame((state, delta) => {
    const store = useStore.getState();
    if (store.gfxAutoDisabled || store.buildPhase === "constructing") return;
    if (delta > TAB_SWITCH_S) {
      samples.current = [];
      streak.current = 0;
      return;
    }
    const ms = delta * 1000;
    const buf = samples.current;
    buf.push(ms);
    if (buf.length > WINDOW) buf.shift();
    // The header's number is this window, not a second measurement. Published
    // at most twice a second and only once the rounded rate has moved: a
    // readout that ticks at 60 Hz is a re-render at 60 Hz. The renderer's own
    // clock is the timebase, so the gate stops with the frames.
    const hz = frameHz(buf);
    const jetzt = state.clock.elapsedTime;
    if (hz !== null && hz !== store.frameHz && jetzt - zuletzt.current > PUBLISH_MS / 1000) {
      zuletzt.current = jetzt;
      store.setFrameHz(hz);
    }
    const { move, streak: next } = autoGfxDecision(
      store.prefs.gfxLite || store.autoGfxLite,
      buf,
      streak.current,
    );
    streak.current = next;
    if (move === "toLite") {
      store.setAutoGfxLite(true);
      buf.length = 0;
    } else if (move === "toFull") {
      store.setAutoGfxLite(false);
      buf.length = 0;
    }
  });

  return null;
}
