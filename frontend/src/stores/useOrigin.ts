import { create } from "zustand";

/**
 * What this page can answer.
 *
 * Three of them, and the difference decides which sentences are true:
 *  - `live`:   a scan server is here — scans, verdicts, comparisons, exports.
 *  - `demo`:   sample data, no scanner ran (the shipped demo city).
 *  - `file`:   one exported city, carried in the page. There is no server, so
 *              nothing on screen may claim that a scan just ran, that a test
 *              can be started, or that "since your last scan" will compare.
 *
 * Measured before this existed: an exported folder's banner read "Scan
 * complete" over a city nobody had scanned in that folder — a sentence the
 * product forbids itself everywhere else. A per-component guess from three
 * other fields is what made that possible, so the origin has one cell.
 */
export type PageOrigin = "live" | "demo" | "file";

export const useOrigin = create<{ origin: PageOrigin; setOrigin: (origin: PageOrigin) => void }>(
  (set) => ({
    origin: "live",
    setOrigin: (origin) => set({ origin }),
  }),
);

/** True when the page is a file and therefore carries no live server. */
export const isStandalone = (origin: PageOrigin): boolean => origin === "file";
