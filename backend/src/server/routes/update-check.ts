import type { Request, Response } from "express";
import { createRequire } from "module";
import { isOffline } from "../../services/security/network-policy.js";

/**
 * GET /api/update/check — passive update notification, local-first style:
 * the BACKEND queries the public GitHub releases API (one anonymous request,
 * cached for an hour), the client never reports anything about itself. No
 * release published yet → honest "no update available". Network problems →
 * a calm offline answer, never an error banner.
 */

const REPO = "MichaelS1011/Ephemora-Skyline";
const CACHE_TTL_MS = 60 * 60 * 1000;

export interface UpdateInfo {
  current: string;
  latest: string | null;
  updateAvailable: boolean;
  releaseUrl: string | null;
  checkedAt: string;
  offline?: boolean;
}

const require = createRequire(import.meta.url);

export function currentVersion(): string {
  // routes/ → server/ → src|dist/ → backend/. In an installed package the
  // backend manifest is not shipped (npm keeps manifests out of `files`), so
  // the package's own manifest one level above is the same version and always
  // there. Measured: the installed launcher died on ENOENT for
  // backend/package.json before this fallback existed.
  const candidates = ["../../../package.json", "../../../../package.json"];
  for (const candidate of candidates) {
    try {
      const version = (require(candidate) as { version?: unknown }).version;
      if (typeof version === "string" && version.length > 0) return version;
    } catch {
      /* next candidate */
    }
  }
  return "0.0.0";
}

/** Compare dotted numeric versions ("v" prefix tolerated). */
export function isNewerVersion(latest: string, current: string): boolean {
  const parse = (v: string): [number, number, number] => {
    const m = v
      .trim()
      .replace(/^v/i, "")
      .match(/^(\d+)\.(\d+)\.(\d+)/);
    if (!m) return [0, 0, 0];
    return [Number(m[1]), Number(m[2]), Number(m[3])];
  };
  const [a1, a2, a3] = parse(latest);
  const [b1, b2, b3] = parse(current);
  if (a1 !== b1) return a1 > b1;
  if (a2 !== b2) return a2 > b2;
  return a3 > b3;
}

let cache: { at: number; data: UpdateInfo } | null = null;

function build(latest: string | null, url: string | null, offline?: boolean): UpdateInfo {
  const current = currentVersion();
  return {
    current,
    // The GitHub release carries a TAG ("v0.4.0"), the manifest carries a
    // VERSION ("0.3.0"), and both are shown in one sentence by the More menu
    // ("You are on 0.3.0" / "Version v0.4.0 is available"). The payload field
    // is a version, so the tag's decoration comes off here, at the one
    // boundary where the tag enters this program. `releaseUrl` keeps the tag —
    // it is an address, not a number.
    latest: latest === null ? null : latest.replace(/^v/i, ""),
    updateAvailable: latest !== null && isNewerVersion(latest, current),
    releaseUrl: url,
    checkedAt: new Date().toISOString(),
    offline: offline || undefined,
  };
}

export async function handleUpdateCheck(_req: Request, res: Response): Promise<void> {
  if (isOffline()) {
    // SKYLINE_OFFLINE is a claim about this machine; answering it from cache
    // would still be honest, fetching would not.
    res.json(build(null, null, true));
    return;
  }
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    res.json(cache.data);
    return;
  }
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: {
        "User-Agent": "Ephemora-Skyline",
        Accept: "application/vnd.github+json",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (r.status === 404) {
      // No release published yet — normal for a fresh project
      cache = { at: Date.now(), data: build(null, null) };
    } else if (r.ok) {
      const j = (await r.json()) as { tag_name?: string; html_url?: string };
      cache = { at: Date.now(), data: build(j.tag_name ?? null, j.html_url ?? null) };
    } else {
      cache = { at: Date.now(), data: build(null, null, true) };
    }
  } catch {
    // Offline / rate-limited: answer calmly, the client shows nothing scary
    res.json(build(null, null, true));
    return;
  }
  res.json(cache.data);
}
