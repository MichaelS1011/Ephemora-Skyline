import type { DirHandle } from "../hooks/useLocalAnalysis/picker";

/** One analyzed file as the watcher remembers it between polls. */
export interface LiveFileMeta {
  path: string;
  /** SHA-256 of the bytes the server analyzed */
  sha: string;
  /** Metadata used to decide whether a file needs a re-read */
  size: number;
  mtime: number;
}

/**
 * What a finished folder scan hands to the watch loop. The handle outlives the
 * Landing screen, which is why this lives in the store rather than in the hook.
 */
export interface PendingLiveScan {
  analysisId: string;
  name: string;
  handle: DirHandle;
  manifest: LiveFileMeta[];
  excludes: string[];
}

export type LiveStatus = "off" | "watching" | "paused" | "updating" | "rescanning" | "error";

export interface LiveState {
  status: LiveStatus;
  analysisId: string | null;
  /** When the last delta landed; null until the first one does. */
  lastSyncAt: number | null;
  changed: number;
  added: number;
  removed: number;
  refreshed: number;
  /** Engines whose answer is from the full scan, per the last delta. */
  stale: string[];
  error: string;
  /** Why the loop stopped, for the banner's own wording. */
  errorCode: "" | "ended" | "failed";
  /** Progress of a full re-scan, so the banner has a number on it. */
  progress: number;
}

export const EMPTY_LIVE_STATE: LiveState = {
  status: "off",
  analysisId: null,
  lastSyncAt: null,
  changed: 0,
  added: 0,
  removed: 0,
  refreshed: 0,
  stale: [],
  error: "",
  errorCode: "",
  progress: 0,
};
