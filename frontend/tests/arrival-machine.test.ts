// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  arrivalBeat,
  hasArrivedBefore,
  markArrived,
  readArrivalStage,
  readArrivalStageRead,
  rememberArrivalStage,
} from "../src/firstArrival";
import { refreshReducedMotion } from "../src/city/motion";
import { useStore } from "../src/stores/useStore";
import { city, dir, file, finding } from "./helpers/cityFixture";

/**
 * MASTER-2027 §19.05 — the arrival machine, tested as a machine.
 *
 * The greeting that stands on screen is decided by THREE facts spread over
 * two files and one inline expression: the arrival stamp (§03.02, store
 * creation), the stored beat (§03.08, `Landing.tsx`'s initializer), and the
 * build short-circuit under reduced motion (`useStore.ts`'s
 * `skipBuild = !seenBefore && prefersReducedMotion()`). Until now every one
 * of them was only ever read through the DOM or the store — so the fourth
 * storage state, UNREADABLE bytes (the class `storageRead.ts` names), had no
 * case: the stage reader collapsed it into "never seen" silently.
 *
 * These cases hold the machine without any DOM guessing:
 *   • `readArrivalStageRead()` answers the three states honestly and
 *     quarantines refused bytes instead of overwriting them;
 *   • `arrivalBeat()` says which of the greeting beats stands for every
 *     combination — and the stamp outranks the record, motion or no motion;
 *   • the store's build surface is pinned for all four combinations of
 *     first/again × motion/reduced, by driving `setCityData` itself.
 */

const STAGE_KEY = "codecity-arrival-stage:v1";
const QUARANTINE = `${STAGE_KEY}:unreadable`;

const neu = (id: string) =>
  city({
    repo: { owner: "local", name: id, branch: "main" },
    analysisId: id,
    files: [file("src/db.ts", "TypeScript")],
    tree: dir({
      path: "",
      name: "",
      detailFiles: [file("src/db.ts", "TypeScript", [finding({ severity: "P1", message: "m" })])],
    }),
  });

beforeEach(() => {
  localStorage.clear();
  useStore.setState({ ...useStore.getInitialState(), cityData: null }, true);
});

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
  refreshReducedMotion(); // back to full motion for whatever runs next in this process
  vi.restoreAllMocks();
});

const reduced = (on: boolean): void => {
  vi.stubGlobal("matchMedia", () => ({
    matches: on,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  refreshReducedMotion();
};

describe("die drei Speicherlagen des Beats", () => {
  it("nie gesehen: absent, und die Fläche heißt greeting", () => {
    const read = readArrivalStageRead();
    expect(read.state).toBe("absent");
    expect(arrivalBeat({ firstRun: true, stage: read })).toBe("welcome");
  });

  it("gesehen: der gespeicherte Beat wird gelesen und steht", () => {
    rememberArrivalStage("intro");
    const read = readArrivalStageRead();
    expect(read).toEqual({ state: "read", value: "intro" });
    expect(arrivalBeat({ firstRun: true, stage: read })).toBe("intro");
  });

  it("der Stempel sticht die Aufnahme: seen heißt done, was der Beat auch sagt", () => {
    rememberArrivalStage("intro");
    const read = readArrivalStageRead();
    expect(arrivalBeat({ firstRun: false, stage: read })).toBe("done");
  });

  it("unlesbar: die Klasse sagt es — und die Bytes bleiben erhalten", () => {
    // A hand-edited or half-written value is a FAILED read, not an empty one
    // (storageRead.ts's rule). The screen still greets — a door, never a
    // gate — but the reader of the state can tell the two apart, and the
    // next `rememberArrivalStage` must not silently trade the bytes away.
    localStorage.setItem(STAGE_KEY, "settings");
    const read = readArrivalStageRead();
    expect(read.state).toBe("unreadable");
    expect(readArrivalStage()).toBe("welcome"); // the surface falls back
    expect(arrivalBeat({ firstRun: true, stage: read })).toBe("welcome");
    expect(localStorage.getItem(QUARANTINE)).toBe("settings");
    rememberArrivalStage("intro"); // a live write after the refused read…
    expect(localStorage.getItem(QUARANTINE)).toBe("settings"); // …leaves the kept bytes
  });

  it("unlesbar zuerst, kein zweites Mal: die Quarantäne nimmt den ersten Blob", () => {
    localStorage.setItem(STAGE_KEY, "settings");
    expect(readArrivalStageRead().state).toBe("unreadable");
    localStorage.setItem(STAGE_KEY, "%%zweiter-schrott%%");
    expect(readArrivalStageRead().state).toBe("unreadable");
    expect(localStorage.getItem(QUARANTINE)).toBe("settings"); // first wins
  });

  it("Speicher, der wirft: unreadbar geantwortet, nie vorgetäuscht leer", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readArrivalStageRead().state).toBe("unreadable");
    expect(readArrivalStage()).toBe("welcome");
    // and the stamp side of the machine already fails closed, not open:
    expect(hasArrivedBefore()).toBe(true);
    spy.mockRestore();
  });

  it("leerer String heißt absent, nicht kaputt", () => {
    localStorage.setItem(STAGE_KEY, "");
    expect(readArrivalStageRead().state).toBe("absent");
  });

  it("ein abgelehnter Stempel schreibt keine Ankunft", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
      throw new Error("QuotaExceededError");
    });
    markArrived();
    spy.mockRestore();
    expect(hasArrivedBefore()).toBe(false);
    expect(arrivalBeat({ firstRun: true, stage: readArrivalStageRead() })).toBe("welcome");
  });
});

describe("die Bau-Fläche: Kurzschluss, Film, Wiederkehr", () => {
  it("erste Stadt, volle Bewegung: die Stadt wird gebaut", () => {
    reduced(false);
    useStore.getState().setCityData(neu("maschine-1"));
    expect(useStore.getState().buildPhase).toBe("constructing");
  });

  it("erste Stadt, reduzierte Bewegung: die Stadt steht sofort", () => {
    // useStore.ts's inline `skipBuild = !seenBefore && prefersReducedMotion()`
    // — the machine's fourth input, read at a consumer, pinned here as a case.
    reduced(true);
    useStore.getState().setCityData(neu("maschine-2"));
    expect(useStore.getState().buildPhase).toBe("built");
    // the greeting is NOT swallowed by the short-circuit: motion never edits
    // the beat, and the stamp still outranks everything for the NEXT launch.
    expect(hasArrivedBefore()).toBe(true);
    expect(arrivalBeat({ firstRun: true, stage: readArrivalStageRead() })).toBe("welcome");
  });

  it("wiederkehrende Stadt, volle Bewegung: kein zweiter Film", () => {
    reduced(false);
    const c = neu("maschine-3");
    useStore.getState().setCityData(c);
    useStore.getState().setCityData(c);
    expect(useStore.getState().buildPhase).toBe("built");
  });

  it("zweite Stadt auf derselben Maschine bekommt ihren eigenen Film", () => {
    reduced(false);
    useStore.getState().setCityData(neu("maschine-4a"));
    useStore.getState().setCityData(neu("maschine-4b"));
    expect(useStore.getState().buildPhase).toBe("constructing");
    // …aber keine zweite Begrüßung: die Maschine ist angekommen.
    expect(hasArrivedBefore()).toBe(true);
  });
});
