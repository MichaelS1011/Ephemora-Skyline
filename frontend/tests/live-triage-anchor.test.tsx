// @vitest-environment jsdom
/**
 * One number, once — the triage denominator under a live delta.
 *
 * The dock prints two numbers on ONE line (`ActionBar.tsx:382-388`): the stepper
 * `triageCursor + 1 / triageTotal`, both read off the store, and `· N open`,
 * counted from the city by `queue` (`ActionBar.tsx:180-189`, deps `cityData`).
 * The voice of the queue reads the same store total (`TriageAnnouncer.tsx:29`).
 *
 * `applyLiveCityData` (`useStore.ts:1042-1057`) is the door the live watch uses:
 * `tick()` posts the changed files to `/api/analyze-local/<id>/live`, re-reads
 * `/api/result/<id>/city` and hands that city over (`live/session.ts:325`). It
 * replaced `cityData` and `reviews` and never touched `triageTotal`, which only
 * `startTriage`/`nextTriage`/`prevTriage` and `reanchorTriage`
 * (`useStore.ts:799-823`, hung on `setThreatFilter:1269` / `setRuleFilter:1275`)
 * ever re-anchored. So one save in the watched folder, while a round was
 * running, moved the counted half of that line and left the denominator where
 * it was: "2 / 3 · 4 open" over a queue of five, or "5 / 6" over a queue of two.
 *
 * These cases drive the real store actions against the mounted dock.
 */
import { act } from "react";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActionBar } from "../src/components/ActionBar";
import { openTriageCount, triageList, useStore } from "../src/stores/useStore";
import { bucketKeyFor, findingKey, saveReviews } from "../src/reviews";
import type { CityData, CityFile } from "../src/city/types";
import { city as buildCity, file as buildFile, finding } from "./helpers/cityFixture";

/** One scan, re-read. A live delta is the SAME visit, so the id stays. */
const SCAN = "11111111-2222-4333-8444-555555555555";

function fileWith(filePath: string, count: number): CityFile {
  return buildFile(
    filePath,
    "TypeScript",
    Array.from({ length: count }, (_unused, i) =>
      finding({
        type: `RULE_${i}`,
        ruleId: `RULE_${i}`,
        severity: "P0",
        line: i + 1,
        message: `finding ${i} in ${filePath}`,
      }),
    ),
  );
}

function cityWith(...files: CityFile[]): CityData {
  return buildCity({ analysisId: SCAN, files });
}

let container: HTMLDivElement | undefined;
let root: Root | undefined;

const host = (): HTMLDivElement => {
  expect(container, "the dock is not mounted").toBeDefined();
  return container as HTMLDivElement;
};

async function mountDock(): Promise<void> {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(createElement(ActionBar)));
}

/** The numbers the dock prints on its triage line. */
function dock(): { at: number; of: number; open: number | null; label: string } {
  const group = Array.from(host().querySelectorAll('[role="group"]')).find((g) =>
    g.querySelector(".tabular-nums"),
  );
  expect(group, "the dock shows no triage stepper").toBeDefined();
  const raw = group!.querySelector(".tabular-nums")!.textContent ?? "";
  const frac = /(\d+)\s*\/\s*(\d+)/.exec(raw);
  expect(frac, `the stepper does not print a fraction: "${raw}"`).toBeTruthy();
  const open = /·\s*(\d+)/.exec(raw);
  return {
    at: Number(frac![1]),
    of: Number(frac![2]),
    open: open ? Number(open[1]) : null,
    label: group!.getAttribute("aria-label") ?? "",
  };
}

/**
 * The invariant the reader stands on: every number on that line is counted from
 * the city currently on screen, the open count cannot outnumber the denominator,
 * and the position cannot stand past the last entry of the queue.
 */
function expectDockHoldsTheQueue(): void {
  const s = useStore.getState();
  expect(s.cityData, "no city on screen").toBeTruthy();
  const list = triageList(s.cityData!, s.threatFilter, s.ruleFilter);
  const open = openTriageCount(list, s.reviews);
  const shown = dock();
  expect(s.triageTotal, "the store's denominator is not the queue it steps").toBe(list.length);
  expect(shown.of, "the dock's denominator must be the length of that same queue").toBe(
    list.length,
  );
  expect(shown.open, "the open count must come from that same queue").toBe(open);
  expect(
    shown.open,
    "open findings can never outnumber the total the stepper prints",
  ).toBeLessThanOrEqual(shown.of);
  expect(shown.at, "the position can never stand past the last entry").toBeLessThanOrEqual(
    shown.of,
  );
  expect(shown.at).toBe(s.triageCursor + 1);
  // The a11y name carries the same two numbers; a screen reader must not be
  // told a different total than the eye is shown.
  const [labelAt, labelOf] = (shown.label.match(/\d+/g) ?? []).map(Number);
  expect(labelAt, "the stepper's aria-label counts another position").toBe(s.triageCursor + 1);
  expect(labelOf, "the stepper's aria-label counts another total").toBe(list.length);
  const focused = list[s.triageCursor];
  expect(
    focused ? findingKey(focused.file.id, focused.index) : null,
    "the cursor must point at the finding it says it points at",
  ).toBe(s.focusedFindingKey);
}

const stepperCell = (): Element | null =>
  host().querySelector('[role="group"] .tabular-nums') ?? null;

async function applyLive(next: CityData): Promise<void> {
  await act(async () => useStore.getState().applyLiveCityData(next));
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  useStore.setState({ ...useStore.getInitialState() }, true);
  window.localStorage.clear();
});

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  container = undefined;
  root = undefined;
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("a live delta under a running triage", () => {
  it("anchors the denominator on start, so the first reading is the baseline", async () => {
    act(() =>
      useStore.getState().setCityData(cityWith(fileWith("src/a.ts", 2), fileWith("src/b.ts", 2))),
    );
    act(() => useStore.getState().setBuildPhase("built"));
    await mountDock();
    act(() => useStore.getState().startTriage());
    expectDockHoldsTheQueue();
    expect(dock().of).toBe(4);
  });

  it("follows the queue when the delta adds findings", async () => {
    act(() =>
      useStore.getState().setCityData(cityWith(fileWith("src/a.ts", 2), fileWith("src/b.ts", 2))),
    );
    act(() => useStore.getState().setBuildPhase("built"));
    await mountDock();
    act(() => useStore.getState().startTriage());
    expect(dock().of).toBe(4);

    await applyLive(
      cityWith(fileWith("src/a.ts", 2), fileWith("src/b.ts", 2), fileWith("src/c.ts", 2)),
    );
    expectDockHoldsTheQueue();
  });

  it("never lets the open count outnumber the denominator it prints beside", async () => {
    act(() => useStore.getState().setCityData(cityWith(fileWith("src/a.ts", 2))));
    act(() => useStore.getState().setBuildPhase("built"));
    await mountDock();
    act(() => useStore.getState().startTriage());

    await applyLive(cityWith(fileWith("src/a.ts", 5)));
    expectDockHoldsTheQueue();
  });

  it("counts the verdicts the delta brings from the same data", async () => {
    const before = cityWith(fileWith("src/a.ts", 3));
    // A verdict recorded in this project's bucket — the copy a live delta re-reads.
    saveReviews(bucketKeyFor(before), { [findingKey("f-src/a.ts", 0)]: "reviewed" });
    act(() => useStore.getState().setCityData(before));
    act(() => useStore.getState().setBuildPhase("built"));
    expect(useStore.getState().reviews).toEqual({ "f-src/a.ts#0": "reviewed" });
    await mountDock();
    // The round opens on the first finding that still needs a verdict.
    act(() => useStore.getState().startTriage());
    expectDockHoldsTheQueue();
    const cursorBefore = useStore.getState().triageCursor;

    await applyLive(cityWith(fileWith("src/a.ts", 3), fileWith("src/b.ts", 2)));
    expectDockHoldsTheQueue();
    const s = useStore.getState();
    expect(s.triageTotal).toBe(5);
    expect(dock().open).toBe(4);
    expect(s.triageCursor, "the judged finding stays judged — no jump back to entry one").toBe(
      cursorBefore,
    );
  });

  it("pulls a cursor the delta ran past back inside the queue", async () => {
    act(() =>
      useStore
        .getState()
        .setCityData(
          cityWith(fileWith("src/a.ts", 2), fileWith("src/b.ts", 2), fileWith("src/c.ts", 2)),
        ),
    );
    act(() => useStore.getState().setBuildPhase("built"));
    await mountDock();
    act(() => useStore.getState().startTriage());
    for (let i = 0; i < 4; i++) act(() => useStore.getState().nextTriage());
    expect(useStore.getState().triageCursor).toBe(4);
    expectDockHoldsTheQueue();

    await applyLive(cityWith(fileWith("src/a.ts", 2)));
    expectDockHoldsTheQueue();
    const s = useStore.getState();
    expect(s.triageCursor).toBeLessThanOrEqual(1);
    expect(s.triageTotal).toBe(2);
  });

  it("keeps the reader on the finding they were on, without flying the camera", async () => {
    const before = cityWith(fileWith("src/a.ts", 3), fileWith("src/b.ts", 1));
    act(() => useStore.getState().setCityData(before));
    act(() => useStore.getState().setBuildPhase("built"));
    await mountDock();
    act(() => useStore.getState().startTriage());
    act(() => useStore.getState().nextTriage());
    const focusedBefore = useStore.getState().focusedFindingKey;
    const selectedBefore = JSON.stringify(useStore.getState().selectedUnit);
    expect(focusedBefore).toBeTruthy();

    await applyLive(
      cityWith(fileWith("src/a.ts", 3), fileWith("src/b.ts", 1), fileWith("src/c.ts", 2)),
    );
    expectDockHoldsTheQueue();
    const s = useStore.getState();
    expect(s.triageActive).toBe(true);
    expect(
      s.focusedFindingKey,
      "a live delta must not send the reader back to the first finding",
    ).toBe(focusedBefore);
    expect(
      JSON.stringify(s.selectedUnit),
      "the finding survived the delta, so the camera stays put",
    ).toBe(selectedBefore);
  });

  it("ends the round when the delta fixes every finding away", async () => {
    act(() => useStore.getState().setCityData(cityWith(fileWith("src/a.ts", 2))));
    act(() => useStore.getState().setBuildPhase("built"));
    await mountDock();
    act(() => useStore.getState().startTriage());

    await applyLive(cityWith(buildFile("src/a.ts", "TypeScript")));
    const s = useStore.getState();
    expect(s.triageActive).toBe(false);
    expect(s.triageTotal).toBe(0);
    expect(stepperCell(), "a stepper counting down to nothing is not a stepper").toBeNull();
  });

  it("starts no round for a city nobody is triaging", async () => {
    act(() => useStore.getState().setCityData(cityWith(fileWith("src/a.ts", 2))));
    act(() => useStore.getState().setBuildPhase("built"));
    await mountDock();

    await applyLive(cityWith(fileWith("src/a.ts", 4)));
    const s = useStore.getState();
    expect(s.triageActive).toBe(false);
    expect(s.triageTotal).toBe(0);
    expect(s.triageCursor).toBe(0);
    expect(stepperCell()).toBeNull();
  });
});

describe("every door a city comes in through anchors the triage total", () => {
  const store = readFileSync(
    path.resolve(import.meta.dirname, "../src/stores/useStore.ts"),
    "utf-8",
  );
  const impl = store.slice(store.indexOf("export const useStore = create"));

  /** The argument text of the call whose opening parenthesis sits at `open`. */
  function callBlock(src: string, open: number): string {
    let depth = 0;
    for (let i = open; i < src.length; i += 1) {
      if (src[i] === "(") depth += 1;
      else if (src[i] === ")") {
        depth -= 1;
        if (depth === 0) return src.slice(open + 1, i);
      }
    }
    throw new Error("an opening parenthesis in useStore.ts never closes");
  }

  /** The store action (or the create-closure helper) a character offset sits in. */
  function enclosing(src: string, offset: number): { name: string; body: string } {
    const lineStart = src.lastIndexOf("\n", offset) + 1;
    const lines = src.slice(0, lineStart).split("\n");
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const action = /^ {4}([A-Za-z][\w$]*): \([^)]*\)[^\n]*=> \{$/.exec(lines[i] ?? "");
      const helper = /^ {2}const ([A-Za-z][\w$]*) = [^\n]*=> \{$/.exec(lines[i] ?? "");
      const found = action ?? helper;
      if (!found) continue;
      const close = action ? /^ {4}\},$/ : /^ {2}\};$/;
      const rest = src.slice(src.indexOf(lines[i]!)!).split("\n");
      const end = rest.findIndex((line, n) => n > 0 && close.test(line));
      return { name: found[1]!, body: rest.slice(0, end === -1 ? rest.length : end).join("\n") };
    }
    throw new Error(`no store action wraps offset ${offset}`);
  }

  /** Every `set({...})` in the store implementation that writes `cityData`. */
  const writers: { name: string; body: string; block: string }[] = (() => {
    const out: { name: string; body: string; block: string }[] = [];
    const calls = /\bset\(/g;
    let hit: RegExpExecArray | null;
    while ((hit = calls.exec(impl)) !== null) {
      const open = hit.index + hit[0].length - 1;
      const block = callBlock(impl, open);
      if (!/^\s*cityData:/m.test(block)) continue;
      out.push({ ...enclosing(impl, open), block });
    }
    return out;
  })();

  it("knows its own doors — a new writer has to be named here first", () => {
    expect(writers.length, "the scan found no cityData writer; it cannot be green").toBeGreaterThan(
      0,
    );
    expect(writers.map((w) => w.name).sort()).toEqual([
      "applyLiveCityData",
      "setCityData",
      "teardownVisit",
    ]);
  });

  it("anchors or derives the triage total wherever it replaces the city", () => {
    const stale = writers
      .filter((w) => !w.block.includes("triageTotal") && !w.body.includes("reanchorTriage("))
      .map((w) => w.name);
    expect(stale, `${stale.join(", ")} replaces cityData and leaves triageTotal behind`).toEqual(
      [],
    );
  });

  it("ends the round when the visit is torn down, instead of carrying it to the Landing", async () => {
    const initial = useStore.getInitialState();
    expect(initial.cityData).toBeNull();
    expect(initial.triageTotal).toBe(0);
    expect(initial.triageActive).toBe(false);

    act(() => useStore.getState().setCityData(cityWith(fileWith("src/a.ts", 2))));
    act(() => useStore.getState().setBuildPhase("built"));
    await mountDock();
    act(() => useStore.getState().startTriage());
    expect(useStore.getState().triageTotal).toBe(2);
    act(() => useStore.getState().resetToLanding());
    const s = useStore.getState();
    expect(s.cityData).toBeNull();
    expect(s.triageActive).toBe(false);
    expect(s.triageTotal).toBe(0);
  });
});
