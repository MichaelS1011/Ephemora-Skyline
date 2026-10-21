/**
 * The content-hash manifest a live delta is measured against.
 *
 * A full scan already read every file, so the manifest is built from the
 * staged copy at the moment that scan finishes: path → SHA-256. A live run
 * then needs no re-read of unchanged files — the client sends the hashes it
 * kept and the contents of what changed, and only those contents are analyzed.
 *
 * The registry is deliberately in RAM, like the staged copies and the result
 * store. A restart ends live mode for every scan; the city itself is gone
 * then too, so there is nothing left to keep in step with.
 */
import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import type { ResolvedScanConfig } from "../services/security/scan-config.js";

export interface LiveSession {
  /** project-relative path → SHA-256 of the exact staged bytes */
  shas: Map<string, string>;
  /** The config the full scan ran under — the live rules must be the same */
  config?: ResolvedScanConfig;
  registeredAt: number;
}

const LIVE_SESSIONS = new Map<string, LiveSession>();
/** A long-lived server must not keep every scan's manifest forever. */
const MAX_SESSIONS = 40;

export function sha256Hex(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Hash every analyzed file of a finished scan. Returns false when the copy
 * could not be fully read — live mode stays off for that scan rather than
 * running against a manifest that covers less than the result claims.
 */
export async function registerLiveManifest(
  analysisId: string,
  dir: string,
  files: ReadonlyArray<{ path: string }>,
  config?: ResolvedScanConfig,
): Promise<boolean> {
  const shas = new Map<string, string>();
  for (const file of files) {
    const target = path.resolve(dir, file.path);
    if (!target.startsWith(dir + path.sep)) return false;
    try {
      shas.set(file.path, sha256Hex(await fs.readFile(target)));
    } catch {
      return false;
    }
  }
  LIVE_SESSIONS.set(analysisId, { shas, config, registeredAt: Date.now() });
  while (LIVE_SESSIONS.size > MAX_SESSIONS) {
    const oldest = LIVE_SESSIONS.keys().next().value;
    if (oldest === undefined) break;
    LIVE_SESSIONS.delete(oldest);
  }
  return true;
}

export function getLiveManifest(analysisId: string): ReadonlyMap<string, string> | undefined {
  return LIVE_SESSIONS.get(analysisId)?.shas;
}

export function getLiveConfig(analysisId: string): ResolvedScanConfig | undefined {
  return LIVE_SESSIONS.get(analysisId)?.config;
}

/** Replace the manifest after a delta; the caller owns the new set's truth. */
export function updateLiveManifest(analysisId: string, shas: Map<string, string>): void {
  const entry = LIVE_SESSIONS.get(analysisId);
  if (entry) {
    entry.shas = shas;
    entry.registeredAt = Date.now();
  } else {
    LIVE_SESSIONS.set(analysisId, { shas, registeredAt: Date.now() });
  }
}

export function deleteLiveSession(analysisId: string): void {
  LIVE_SESSIONS.delete(analysisId);
}

/** Tests only: forget every session between cases. */
export function resetLiveSessions(): void {
  LIVE_SESSIONS.clear();
}
