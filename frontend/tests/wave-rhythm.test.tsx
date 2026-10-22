// @vitest-environment jsdom
/**
 * The beat alone. `residentGreeting.test.ts` holds the rule (when a wave is
 * owed) and `Pedestrians` holds the picker (which resident is visible enough to
 * wave); this file holds the one thing between them — a timer that asks once a
 * second, waves only on a yes, and goes away with the component. A test that
 * mounted the crowd to check that would rebuild a camera, a scene and seventy
 * walkers, and would then measure its own scaffolding.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useWaveRhythm } from "../src/hooks/useWaveRhythm";

const counts = { asked: 0, waved: 0 };

function Harness({ yesEvery }: { yesEvery: number }) {
  useWaveRhythm(
    () => {
      counts.asked += 1;
      return counts.asked % yesEvery === 0;
    },
    () => {
      counts.waved += 1;
    },
    1000,
  );
  return null;
}

let host: HTMLDivElement;
let root: Root | undefined;

beforeEach(() => {
  counts.asked = 0;
  counts.waved = 0;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  const r = root;
  if (r) act(() => r.unmount());
  root = undefined;
  host.remove();
  vi.useRealTimers();
});

function mount(yesEvery: number): Root {
  const r = createRoot(host);
  root = r;
  act(() => r.render(<Harness yesEvery={yesEvery} />));
  return r;
}

describe("the wave rhythm", () => {
  it("asks once a second and waves only on a yes", () => {
    mount(3);
    act(() => vi.advanceTimersByTime(9000));
    expect(counts.asked).toBe(9);
    expect(counts.waved).toBe(3);
  });

  it("waits a full second before the first ask", () => {
    mount(1);
    act(() => vi.advanceTimersByTime(999));
    expect(counts.asked).toBe(0);
    act(() => vi.advanceTimersByTime(1));
    expect(counts.asked).toBe(1);
  });

  it("stops asking when the city stops drawing", () => {
    const r = mount(1);
    act(() => vi.advanceTimersByTime(4000));
    const asked = counts.asked;
    act(() => r.unmount());
    root = undefined;
    act(() => vi.advanceTimersByTime(10000));
    expect(counts.asked).toBe(asked);
    expect(counts.waved).toBe(4);
  });
});
