import type { CityData } from "./city/types";
import { readStoredJson, type StoredRead } from "./storageRead";

/**
 * The cities this machine has opened.
 *
 * The backend keeps the newest 20 completed cities in memory and mirrors them
 * to an owner-only archive, so a visit from yesterday can still answer after a
 * restart (`backend/src/server/run-archive.ts`). The address carries one city,
 * but nothing carried the LIST — so every visit started at the folder picker
 * again, even the tenth one that day.
 *
 * This is a local index of what was opened here, in this browser. It is not a
 * catalogue of scan results: it names the folder, the time and what the scan
 * measured. Whether the city still answers is a fact about the server and its
 * archive, so the index never claims to know.
 */

export interface RecentCity {
  /** The scan's id — what `?city=` resolves. */
  id: string;
  /** The folder's basename, as the scan named it. NOT a path: the browser never learns one. */
  folder: string;
  /** Epoch ms of the last time this browser showed this city. */
  openedAt: number;
  /** Findings the scan measured in it. */
  findings: number;
  /** Files the scan read. */
  files: number;
}

/** The browser's own list bound, kept equal to the server's archive. */
export const CITY_STORE_MAX = 20;

const KEY = "ephemora-skyline-recent:v1";

function read(): RecentCity[] {
  const result = recentCitiesRead();
  return result.state === "read" ? result.value : [];
}

/**
 * The index of cities this browser opened answers three states, not two —
 * the pattern prefs.ts shipped (`StoredRead` in storageRead.ts). The old
 * `catch → []` made a corrupt index identical to "never opened a city", and
 * it was a data-loss door with a timer on it: the next city anyone opened
 * ran `recordCityVisit`, whose read said empty, and the write that followed
 * stored that empty over the file. The unreadable bytes now stay verbatim
 * under `ephemora-skyline-recent:v1:unreadable` before any write can reach the key,
 * and the entry screen says the difference out loud (`landing.recentUnreadable`).
 */
export function recentCitiesRead(): StoredRead<RecentCity[]> {
  return readStoredJson(KEY, (parsed) =>
    Array.isArray(parsed)
      ? parsed.filter(
          (e): e is RecentCity =>
            !!e &&
            typeof (e as RecentCity).id === "string" &&
            typeof (e as RecentCity).folder === "string" &&
            typeof (e as RecentCity).openedAt === "number",
        )
      : undefined,
  );
}

function write(entries: RecentCity[]): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(entries));
    return true;
  } catch {
    // Storage disabled or full: the index is a convenience, the visit is not lost
    return false;
  }
}

/**
 * Newest first.
 *
 * The stored order IS the answer: `recordCityVisit` puts the newest entry last,
 * so this simply turns the list around. Sorting by `openedAt` was the first
 * attempt and it is wrong twice over — two opens in the same millisecond tie,
 * and a stable sort then keeps the OLDER one in front.
 */
export function recentCities(): RecentCity[] {
  return read().reverse().slice(0, CITY_STORE_MAX);
}

/**
 * Has this browser shown this city before?
 *
 * That is the one question the construction cinematic turns on: the animation
 * is for the city a person is seeing for the first time, not for the tenth
 * reload of a visit they are in the middle of.
 */
export function hasCityVisit(id: string | null | undefined): boolean {
  if (!id) return false;
  return read().some((e) => e.id === id);
}

/**
 * Note the city that just arrived.
 *
 * Re-opening a city moves it to the front — the same touch the server's store
 * gives it on a read, so an actively browsed city stays at the top of both
 * lists instead of ageing out from under the person using it.
 *
 * `read()` runs FIRST and preserves any unreadable bytes in the quarantine
 * slot before this write can replace the live key — the door that used to
 * delete a corrupt index by accident is closed at the reader, not here.
 */
export function recordCityVisit(city: CityData | null): void {
  if (!city?.analysisId) return;
  const sev = city.findingsBySeverity;
  const entry: RecentCity = {
    id: city.analysisId,
    folder: city.repo.name,
    openedAt: Date.now(),
    findings: (sev?.P0 ?? 0) + (sev?.P1 ?? 0) + (sev?.P2 ?? 0),
    files: city.totalFiles,
  };
  const rest = read().filter((e) => e.id !== entry.id);
  write([...rest, entry].slice(-CITY_STORE_MAX));
}

/** Drop one entry — for a link the user deletes, not for a city that expired. */
export function forgetCityVisit(id: string): void {
  write(read().filter((e) => e.id !== id));
}
