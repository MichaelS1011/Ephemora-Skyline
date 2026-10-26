// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  hasArrivedBefore,
  markArrived,
  readArrivalStage,
  rememberArrivalStage,
} from "../src/firstArrival";
import { useStore } from "../src/stores/useStore";
import { city, dir, file } from "./helpers/cityFixture";

/**
 * MASTER-2027 §03.02 — a clear detection of first use.
 *
 * The first arrival gets a quiet greeting, every later one drops back into the
 * work. That turns on one fact nothing on screen carried: whether ANY city has
 * ever stood open HERE. `hasCityVisit` answers per city, so a second folder read
 * as a first visit; the recent list can be empty while a person has used the app
 * for a week. This is the sticky stamp under both — written once, at the single
 * place a city arrives, and never written again.
 */

const KEY = "codecity-first-arrival:v1";
const ARRIVED = city({
  repo: { owner: "local", name: "auth-app", branch: "main" },
  analysisId: "scan-1",
  files: [file("src/db.ts", "TypeScript")],
  tree: dir({ path: "", detailFiles: [file("src/db.ts", "TypeScript")] }),
});

beforeEach(() => {
  localStorage.clear();
  useStore.setState({ ...useStore.getInitialState(), cityData: null }, true);
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("reading the stamp", () => {
  it("says nobody has arrived while the key is absent", () => {
    expect(hasArrivedBefore()).toBe(false);
  });

  it("says someone has arrived once the stamp is set", () => {
    window.localStorage.setItem(KEY, "1");
    expect(hasArrivedBefore()).toBe(true);
  });

  it("reads a storage that throws as arrived, never as brand-new on every reload", () => {
    // A browser that will not let us read must not greet a long-time user as a
    // newcomer on every paint.
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementationOnce(() => {
      throw new Error("blocked");
    });
    expect(hasArrivedBefore()).toBe(true);
    spy.mockRestore();
  });

  it("treats any other value as not-yet-stamped", () => {
    window.localStorage.setItem(KEY, "0");
    expect(hasArrivedBefore()).toBe(false);
  });
});

describe("writing the stamp", () => {
  it("sets it on the first call", () => {
    markArrived();
    expect(window.localStorage.getItem(KEY)).toBe("1");
    expect(hasArrivedBefore()).toBe(true);
  });

  it("never rewrites what is already stamped", () => {
    markArrived();
    const spy = vi.spyOn(Storage.prototype, "setItem");
    markArrived();
    markArrived();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("survives a refused write without claiming arrival", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
      throw new Error("QuotaExceededError");
    });
    markArrived();
    spy.mockRestore();
    // Nothing remembered: the next launch asks again rather than assume.
    expect(hasArrivedBefore()).toBe(false);
  });
});

describe("the app stamps the one place a city arrives", () => {
  it("marks arrival when a first city reaches the screen", () => {
    expect(hasArrivedBefore()).toBe(false);
    useStore.getState().setCityData(ARRIVED);
    expect(hasArrivedBefore()).toBe(true);
  });

  it("stamps even a city that carries no analysis id", () => {
    // Arrival is the fact a city stood open, not the fact it was recorded in the
    // recent list — a payload with no id still counts as seen.
    const bare = city({
      repo: { owner: "local", name: "x", branch: "main" },
      files: [file("a.ts", "TypeScript")],
      tree: dir({ path: "", detailFiles: [file("a.ts", "TypeScript")] }),
    });
    useStore.getState().setCityData(bare);
    expect(hasArrivedBefore()).toBe(true);
  });

  it("leaves the current visit's firstRun reading alone, and stamps for the next", () => {
    useStore.setState({ firstRun: true });
    useStore.getState().setCityData(ARRIVED);
    // This visit still reads firstRun true (the welcome gets to play); the disk
    // is stamped so the NEXT launch reads false.
    expect(useStore.getState().firstRun).toBe(true);
    expect(hasArrivedBefore()).toBe(true);
  });

  it("does not stamp an empty screen (no city)", () => {
    useStore.getState().setCityData(null);
    expect(hasArrivedBefore()).toBe(false);
  });
});

/**
 * MASTER-2027 §03.08 — the setup progress kept on this machine.
 *
 * The claims this block holds: the record mirrors the beat on screen (forward
 * AND back), it holds one word out of three and no project data, an unreadable
 * or hand-edited value falls back to the greeting rather than stranding the
 * reader, and a refused write claims no progress.
 */
describe("the setup progress is stored locally", () => {
  const STAGE_KEY = "codecity-arrival-stage:v1";

  it("opens on the greeting while the reader has done nothing", () => {
    expect(readArrivalStage()).toBe("welcome");
    expect(localStorage.getItem(STAGE_KEY)).toBeNull();
  });

  it("keeps the beat the reader reached", () => {
    rememberArrivalStage("intro");
    expect(localStorage.getItem(STAGE_KEY)).toBe("intro");
    expect(readArrivalStage()).toBe("intro");
  });

  it("keeps a skip, so a reload does not greet someone who declined", () => {
    rememberArrivalStage("done");
    expect(readArrivalStage()).toBe("done");
  });

  it("follows the reader back, not only forward", () => {
    // Back from the introduction must resume on the greeting: a record that only
    // moved ahead would put the reader past a step they had just left.
    rememberArrivalStage("intro");
    rememberArrivalStage("welcome");
    expect(readArrivalStage()).toBe("welcome");
  });

  it("holds one word out of three — no folder, no name, no path", () => {
    for (const stage of ["welcome", "intro", "done"] as const) {
      localStorage.clear();
      rememberArrivalStage(stage);
      const raw = localStorage.getItem(STAGE_KEY) ?? "";
      expect(raw).toMatch(/^(welcome|intro|done)$/);
      expect(raw.length).toBeLessThanOrEqual("welcome".length);
    }
  });

  it("reads a value it does not know as the greeting", () => {
    localStorage.setItem(STAGE_KEY, "settings");
    expect(readArrivalStage()).toBe("welcome");
  });

  it("does not rewrite a beat that has not changed", () => {
    rememberArrivalStage("intro");
    const spy = vi.spyOn(Storage.prototype, "setItem");
    rememberArrivalStage("intro");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("survives a refused write without claiming a progress", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => rememberArrivalStage("intro")).not.toThrow();
    spy.mockRestore();
    expect(readArrivalStage()).toBe("welcome");
  });

  it("survives a storage that refuses to be read", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readArrivalStage()).toBe("welcome");
    expect(() => rememberArrivalStage("intro")).not.toThrow();
    spy.mockRestore();
  });
});
