/**
 * A lost graphics context throws nothing — the city simply stops being drawn
 * and the chrome around it goes on claiming "1 of 6 plots carries a critical
 * finding" over flat ground. Measured before this existed: 87 KB of city
 * before the loss, 5 KB of empty ground after, no sentence anywhere.
 *
 * The first fix tried the polite route — ask three.js to restore the context —
 * and it answered synchronously while the next frames stayed empty. So the
 * contract under test is narrower and honest: a lost context raises the flag,
 * the flag is only cleared by `webglcontextrestored`, and the reader's rebuild
 * starts from a torn-down scene.
 */
import { describe, expect, it, vi } from "vitest";
import { useStore } from "../src/stores/useStore";

describe("the lost-context flag", () => {
  const reset = (): void => useStore.setState({ sceneRebuildAt: null });

  it("starts empty, so a healthy canvas shows no sentence", () => {
    reset();
    expect(useStore.getState().sceneRebuildAt).toBeNull();
  });

  it("is raised by a loss and carries a change, not just a truth", () => {
    reset();
    useStore.getState().onContextLost();
    const first = useStore.getState().sceneRebuildAt;
    expect(first).not.toBeNull();
    expect(Number.isFinite(first)).toBe(true);
    // a second loss while the sentence is up must still read as a new event
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.now() + 10));
    useStore.getState().onContextLost();
    expect(useStore.getState().sceneRebuildAt!).toBeGreaterThan(first!);
    vi.useRealTimers();
  });

  it("is cleared only by a restore the canvas actually confirmed", () => {
    reset();
    useStore.getState().onContextLost();
    expect(useStore.getState().sceneRebuildAt).not.toBeNull();
    useStore.getState().onContextRestored();
    expect(useStore.getState().sceneRebuildAt).toBeNull();
  });

  it("comes back after the reader rebuilds, so a second loss is still told", () => {
    reset();
    useStore.getState().onContextLost();
    useStore.getState().onContextRestored();
    useStore.getState().onContextLost();
    expect(useStore.getState().sceneRebuildAt).not.toBeNull();
  });
});
