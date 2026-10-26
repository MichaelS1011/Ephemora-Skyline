/**
 * The source files behind the demo's two grounded import relationships.
 *
 * Every other import edge in the demo city is drawn from a seeded random
 * generator — illustrative data, and the panel says the city was never scanned.
 * These fixtures are different: the text below is real TypeScript, and the edges
 * between these files are produced by the same `scanFileStructure` the analyzer
 * runs over a user's code. Nothing here asserts a relationship that the source
 * does not contain.
 *
 * The line counts are not free. The demo states each file's code/comment/blank
 * split as arithmetic over its `loc`, and the city draws a tower from that
 * number, so a fixture that disagreed with it would be a second kind of fiction
 * — and would move a tower in a city a recorded clip already shows. Each source
 * therefore lands exactly on the numbers `getDemoResult()` publishes for its
 * path, and `demo-import-grounding.test.ts` fails if they drift.
 */

export interface DemoFixture {
  /** The path the demo city knows this file by. */
  path: string;
  /** Source text handed to the same extractor a real scan uses. */
  content: string;
}

/**
 * The importer. Its `import { useDebounced } from "./useDebounce"` is the whole
 * basis of the edge — the demo does not declare the relationship anywhere else.
 */
export const USE_SCROLL_POSITION: DemoFixture = {
  path: "frontend/src/hooks/useScrollPosition.ts",
  content: `// Where the page is scrolled to, published at a rate the UI can afford.
//
// A scroll listener that writes state on every event turns a wheel gesture into
// dozens of renders. The debounce is therefore not an optimisation here but the
// hook's own contract: callers get the settled position, not the intermediate.

import { useCallback, useEffect, useRef, useState } from "react";
import { useDebounced } from "./useDebounce";

export interface ScrollPosition {
  x: number;
  y: number;
  /** How far the page can still travel downward, in pixels. */
  remaining: number;
  /** 0 at the top, 1 where the page can travel no further. */
  progress: number;
  /** True once the reader has passed the fold the layout reserves. */
  pastFold: boolean;
}

const IDLE: ScrollPosition = {
  x: 0,
  y: 0,
  remaining: 0,

  progress: 0,
  pastFold: false,
};

/** The fold the demo's sections measure themselves against. */
export const FOLD_PX = 320;

function read(): ScrollPosition {
  const x = window.scrollX;
  const y = window.scrollY;
  const tallest = Math.max(
    document.documentElement.scrollHeight - window.innerHeight,
    0,
  );
  return {
    x,
    y,
    remaining: Math.max(0, tallest - y),
    progress: tallest > 0 ? Math.min(1, y / tallest) : 0,
    pastFold: y > FOLD_PX,
  };
}

export function useScrollPosition(
  wait = 150,
): ScrollPosition & { refresh: () => void; scrollToTop: () => void } {
  const [position, setPosition] = useState<ScrollPosition>(IDLE);
  const last = useRef<ScrollPosition>(IDLE);
  const dragging = useRef(false);
  const publish = useCallback((next: ScrollPosition): void => {
    last.current = next;
    setPosition(next);
  }, []);
  const commit = useDebounced(() => publish(read()), wait);

  const onScroll = useCallback((): void => {
    if (dragging.current) publish(read());
    else commit();
  }, [commit, publish]);
  const onTouchStart = useCallback((): void => {
    dragging.current = true;
  }, []);
  const onTouchEnd = useCallback((): void => {
    dragging.current = false;
    commit.flush();
  }, [commit]);
  const refresh = useCallback((): void => {
    publish(read());
  }, [publish]);
  // Returning the reader to the top is an explicit act, so it bypasses the
  // debounce entirely: the value the caller sees is the value they asked for.
  const scrollToTop = useCallback((): void => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    commit.cancel();
    publish({ ...IDLE });
  }, [commit, publish]);

  useEffect(() => {
    publish(read());
  }, [publish]);
  // Resizing changes how far the page can travel without moving the reader, so
  // the settled position is republished rather than left describing the old box.
  useEffect(() => {
    const onResize = (): void => commit();
    window.addEventListener("resize", onResize, { passive: true });
    return () => window.removeEventListener("resize", onResize);
  }, [commit]);

  // Passive, because a scroll listener that calls preventDefault would block
  // the compositor while the browser waits to find out that it never does.
  useEffect(() => {
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [onScroll]);

  useEffect(() => {
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [onTouchStart, onTouchEnd]);

  return { ...position, refresh, scrollToTop };
}`,
};

/** The imported. Exports the hook the fixture above calls. */
export const USE_DEBOUNCE: DemoFixture = {
  path: "frontend/src/hooks/useDebounce.ts",
  content: `// A debounce for values that change faster than the screen should re-render.
// The 150 ms default is what the demo's scroll and resize handlers settle on:
// long enough to drop the middle of a wheel gesture, short enough to feel tied.

import { useCallback, useEffect, useRef } from "react";
/** A callable plus the controls a caller needs to drive it by hand. */
export interface Debounced<A extends unknown[]> {
  (...args: A): void;
  cancel: () => void;
  flush: () => void;
  isPending: () => boolean;
}

export function useDebounced<A extends unknown[]>(
  callback: (...args: A) => void,
  wait = 150,
): Debounced<A> {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(callback);
  const pending = useRef<A | null>(null);
  // Swapped in an effect rather than during render, so a re-render that hands
  // in a fresh closure never replays a timer that is already running.
  useEffect(() => {
    latest.current = callback;
  }, [callback]);

  // A delay that changes mid-flight would otherwise let a timer armed under the
  // old value fire on the new schedule, so the pending call is dropped instead.
  useEffect(() => {
    cancel();
  }, [wait, cancel]);

  const cancel = useCallback((): void => {
    if (timer.current === null) return;
    clearTimeout(timer.current);
    timer.current = null;
    pending.current = null;
  }, []);

  const run = useCallback((): void => {
    const args = pending.current;
    timer.current = null;
    pending.current = null;
    if (args) latest.current(...args);
  }, []);

  const debounced = useCallback(
    (...args: A): void => {
      pending.current = args;
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(run, wait);
    },
    [run, wait],
  ) as Debounced<A>;

  debounced.cancel = cancel;
  debounced.flush = (): void => {
    if (timer.current !== null) run();
  };
  debounced.isPending = (): boolean => timer.current !== null;
  useEffect(() => cancel, [cancel]);
  return debounced;
}`,
};

/**
 * The third grounded file, and the reason it exists: `useScrollPosition` was a
 * dead-code candidate — it exported and nothing imported it — so the one file
 * the demo uses to show a real relationship also advertised itself as unused.
 * A diagnostics overlay reading the scroll position is the plain reason for the
 * edge, and `DebugPanel` keeps its three incoming edges untouched by grounding,
 * so the chip moves nowhere. Its finding quotes `console.log("frame", frameMs)`
 * on line 12; this source has that statement on line 12.
 */
export const DEBUG_PANEL: DemoFixture = {
  path: "frontend/src/components/DebugPanel.tsx",
  content: `// A diagnostics overlay. It reports the frame time the governor measured,
// where the reader stands in the document, and the worst frame since open —
// logging all three on every sample, which is the finding it carries.
import { useEffect, useRef } from "react";
import { useScrollPosition } from "../hooks/useScrollPosition";

const FRAME_BUDGET_MS = 16.7;

export function DebugPanel({ frameMs }: { frameMs: number }): string {
  const samples = useRef(0);
  useEffect(() => {
    console.log("frame", frameMs);
    samples.current += 1;
  }, [frameMs]);
  const worst = useRef(0);
  if (frameMs > worst.current) worst.current = frameMs;
  const { y, progress, remaining } = useScrollPosition();
  if (frameMs <= 0) return "no frames measured yet";
  const label = frameMs > FRAME_BUDGET_MS ? FRAME_LABELS.over : FRAME_LABELS.within;
  const pct = Math.round(progress * 100);
  const scroll = \`\${Math.round(y)}px of \${Math.round(remaining)} left, \${pct}%\`;
  return \`\${label} · worst \${Math.round(worst.current)}ms · \${scroll} · \${samples.current} samples\`;
}

export const FRAME_LABELS = {
  within: "within budget",
  over: "over budget",
} as const;`,
};

export const DEMO_IMPORT_FIXTURES: readonly DemoFixture[] = [
  USE_SCROLL_POSITION,
  USE_DEBOUNCE,
  DEBUG_PANEL,
];

/**
 * Count a fixture's lines the way the demo states them.
 *
 * The demo publishes a file's split as arithmetic over its code lines — 18 %
 * comment, 15 % blank, rounded down — and the city draws a tower from the code
 * figure. This is the one implementation of that split: the fixture is checked
 * against it and the spec list reads it, so the product and the guard cannot
 * each carry a formula that happens to agree today.
 */
export function fixtureLineCounts(content: string): {
  code: number;
  comment: number;
  blank: number;
  total: number;
} {
  const lines = content.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  let code = 0;
  let comment = 0;
  let blank = 0;
  for (const l of lines) {
    if (/^\s*$/.test(l)) blank++;
    else if (/^\s*(\/\/|\/\*|\*)/.test(l)) comment++;
    else code++;
  }
  return { code, comment, blank, total: lines.length };
}

/**
 * path → the code lines its own source holds. `buildFileSpecs` reads this
 * instead of its index formula, so reordering the demo's file lists can no
 * longer move a grounded file's height out from under its fixture.
 */
export const DEMO_FIXTURE_CODE_LINES: ReadonlyMap<string, number> = new Map(
  DEMO_IMPORT_FIXTURES.map((f) => [f.path, fixtureLineCounts(f.content).code]),
);
