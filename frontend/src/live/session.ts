/**
 * The live watch loop.
 *
 * It owns the picked folder's handle after the Landing screen is gone: poll
 * metadata (name, size, mtime), debounce, hash only what changed, send the
 * complete manifest plus the changed bytes, then swap the city in place.
 *
 * Run identity: every session has a token and a `stopped` flag; every async
 * branch checks them before writing. A delta that was overtaken by a full
 * scan, a new folder or a Landing teardown cannot paint the screen.
 *
 * Scope: the delta route runs built-in rules only. Project-wide engines keep
 * their full-scan answers, and the result names them as stale.
 */
import { useStore } from "../stores/useStore";
import {
  classifyCandidate,
  emptyPlan,
  isAnalyzedByServer,
  MAX_FILE_BYTES,
  MAX_TOTAL_BYTES,
  GIT_MAX_TOTAL_BYTES,
  SKIP_DIRS,
  type FolderPlan,
  type LocalFile,
} from "../hooks/useLocalAnalysis";
import type { DirEntry, DirHandle } from "../hooks/useLocalAnalysis/picker";
import { applyPreview } from "../hooks/useLocalAnalysis/preview";
import { IgnoreMatcher } from "../config/gitignore";
import { configPayload, loadExcludes } from "../config/scanProfiles";
import { t } from "../i18n";
import type { CityData, DroppedFiles } from "../city/types";
import { decodeUtf8, fileToBase64, hasSubtleCrypto, sha256Hex } from "./files";
import { EMPTY_LIVE_STATE, type LiveFileMeta, type PendingLiveScan } from "./types";

const POLL_MS = 3000;
const LARGE_POLL_MS = 8000;
/** Above this many analyzed files, metadata polls are spaced further apart. */
const LARGE_FOLDER = 5000;
/** Two quick saves become one delta. */
const DEBOUNCE_MS = 700;
const GIT_MAX_FILE_BYTES = 8 * 1024 * 1024;
const FULL_SCAN_TIMEOUT_MS = 20 * 60 * 1000;
/** Artifact folders the backend also refuses; `.git` is not walked live. */
const EXTRA_ARTIFACTS =
  /^(?:\.git|\.nyc_output|playwright-report|test-results|blob-report|storybook-static)$/i;

interface Session {
  pending: PendingLiveScan;
  stopped: boolean;
  paused: boolean;
  rescanning: boolean;
  busy: boolean;
  snapshot: Map<string, LiveFileMeta>;
  timer: ReturnType<typeof setTimeout> | null;
  controller: AbortController | null;
  unsubscribe: (() => void) | null;
  /** First time the server said the manifest is not ready; hash registration follows the scan. */
  noLiveSince: number | null;
}

let session: Session | null = null;

const live = () => useStore.getState().setLiveState;

function clearTimer(s: Session): void {
  if (s.timer !== null) {
    clearTimeout(s.timer);
    s.timer = null;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isHidden(): boolean {
  return typeof document !== "undefined" && document.hidden;
}

/**
 * Enumerate the folder by metadata only. `getFile()` hands back the browser's
 * file snapshot; content is read only for paths the diff marks dirty.
 */
async function enumerate(s: Session, excludes: string[]): Promise<FolderPlan> {
  const plan = emptyPlan();
  const ignores = new IgnoreMatcher();
  const walk = async (dir: DirHandle, prefix: string): Promise<void> => {
    const entries: DirEntry[] = [];
    for await (const entry of dir.values()) entries.push(entry);
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    const rule = entries.find((e) => e.kind !== "directory" && e.name === ".gitignore");
    if (rule?.getFile) {
      try {
        ignores.add(prefix.replace(/\/$/, ""), await (await rule.getFile()).text());
      } catch {
        /* unreadable rule file — what it would set aside is read instead */
      }
    }
    for (const entry of entries) {
      if (s.stopped) return;
      const rel = `${prefix}${entry.name}`;
      if (entry.kind === "directory") {
        if (EXTRA_ARTIFACTS.test(entry.name) || SKIP_DIRS.test(entry.name)) continue;
        if (ignores.isIgnored(rel, "dir")) {
          if (!plan.setAside.has(rel)) {
            plan.setAside.add(rel);
            plan.dropped.gitIgnored += 1;
          }
          continue;
        }
        await walk(entry as unknown as DirHandle, `${rel}/`);
        continue;
      }
      const file = entry.getFile ? await entry.getFile().catch(() => null) : null;
      if (!file) {
        plan.dropped.unreadable += 1;
        continue;
      }
      classifyCandidate(rel, file, excludes, plan, ignores);
    }
  };
  await walk(s.pending.handle, "");
  applyPreview(plan);
  return plan;
}

/** The paths the backend analyzes, with their File handles, in plan order. */
function analyzedMap(plan: FolderPlan): Map<string, File> {
  const map = new Map<string, File>();
  for (const candidate of plan.candidates) {
    if (candidate.git) continue;
    if (!isAnalyzedByServer(candidate.rel)) continue;
    map.set(candidate.rel, candidate.file);
  }
  return map;
}

function schedule(s: Session): void {
  if (s !== session || s.stopped || s.paused || s.rescanning) return;
  clearTimer(s);
  const ms = s.snapshot.size > LARGE_FOLDER ? LARGE_POLL_MS : POLL_MS;
  s.timer = setTimeout(() => {
    void tick();
  }, ms);
}

async function readDelta(
  s: Session,
  current: Map<string, File>,
  dirty: string[],
): Promise<{ files: LocalFile[]; next: Map<string, LiveFileMeta> } | null> {
  const next = new Map(s.snapshot);
  const files: LocalFile[] = [];
  let bytes = 0;
  for (const path of dirty) {
    const file = current.get(path);
    if (!file) continue;
    if (file.size > MAX_FILE_BYTES) {
      // The full scan would have dropped it too; it leaves the live set.
      next.delete(path);
      continue;
    }
    const buffer = await file.arrayBuffer();
    if (bytes + buffer.byteLength > MAX_TOTAL_BYTES) {
      throw new Error(`over ${Math.round(MAX_TOTAL_BYTES / 1024 / 1024)} MB in one delta`);
    }
    bytes += buffer.byteLength;
    const sha = await sha256Hex(buffer);
    files.push({ path, content: decodeUtf8(buffer) });
    next.set(path, { path, sha, size: file.size, mtime: file.lastModified });
  }
  return files.length > 0 ? { files, next } : null;
}

async function fetchCity(s: Session, id: string): Promise<CityData | null> {
  const res = await fetch(`/api/result/${encodeURIComponent(id)}/city`, {
    signal: s.controller?.signal,
  });
  if (!res.ok) return null;
  return (await res.json()) as CityData;
}

async function tick(): Promise<void> {
  const s = session;
  if (!s || s.stopped || s.busy || s.paused || s.rescanning) return;
  if (isHidden() || !hasSubtleCrypto()) {
    schedule(s);
    return;
  }
  s.busy = true;
  s.controller?.abort();
  s.controller = new AbortController();
  try {
    const plan = await enumerate(s, s.pending.excludes);
    if (s !== session || s.stopped || s.rescanning) return;
    const current = analyzedMap(plan);
    const dirty: string[] = [];
    for (const [path, file] of current) {
      const known = s.snapshot.get(path);
      if (!known || known.size !== file.size || known.mtime !== file.lastModified) dirty.push(path);
    }
    const removed = [...s.snapshot.keys()].filter((path) => !current.has(path));
    if (dirty.length === 0 && removed.length === 0) {
      if (useStore.getState().live.status !== "watching") {
        live()({ status: "watching", error: "" });
      }
      return;
    }

    live()({ status: "updating", error: "" });
    // Coalesce saves: read the tree again after the debounce and diff against
    // the snapshot from the FIRST look, so a file saved twice is one delta.
    await delay(DEBOUNCE_MS);
    if (s !== session || s.stopped || s.paused || s.rescanning) return;
    const freshPlan = await enumerate(s, s.pending.excludes);
    if (s !== session || s.stopped || s.rescanning) return;
    const fresh = analyzedMap(freshPlan);

    const changedPaths: string[] = [];
    for (const [path, file] of fresh) {
      const known = s.snapshot.get(path);
      if (!known || known.size !== file.size || known.mtime !== file.lastModified) {
        changedPaths.push(path);
      }
    }
    const read = await readDelta(s, fresh, changedPaths);
    if (s !== session || s.stopped || s.rescanning) return;

    const next = read?.next ?? new Map(s.snapshot);
    for (const path of s.snapshot.keys()) {
      if (!fresh.has(path)) next.delete(path);
    }
    const manifest = [...fresh.keys()]
      .filter((path) => next.has(path))
      .map((path) => ({ path, sha: (next.get(path) as LiveFileMeta).sha }));
    if (manifest.length === 0) {
      live()({ status: "watching", error: "" });
      return;
    }

    const dropped: DroppedFiles = { ...freshPlan.dropped };
    const res = await fetch(`/api/analyze-local/${encodeURIComponent(s.pending.analysisId)}/live`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: s.controller?.signal,
      body: JSON.stringify({
        manifest,
        files: read?.files ?? [],
        dropped,
      }),
    });
    if (s !== session || s.stopped) return;
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as {
        code?: string;
        error?: string;
        retryAfterSeconds?: number;
      };
      if (res.status === 429) {
        const seconds = Math.max(1, Math.min(300, body.retryAfterSeconds ?? 60));
        s.paused = true;
        clearTimer(s);
        live()({
          status: "error",
          errorCode: "failed",
          error: t(useStore.getState().prefs.lang, "live.rateLimited", { s: seconds }),
        });
        setTimeout(() => {
          if (s !== session || s.stopped) return;
          s.paused = false;
          schedule(s);
        }, seconds * 1000);
        return;
      }
      if (res.status === 409 && body.code === "busy") return; // next tick retries
      if (
        res.status === 409 ||
        res.status === 404 ||
        body.code === "no_live_session" ||
        body.code === "no_analysis"
      ) {
        // The full scan publishes its city a moment before it finishes hashing
        // the staged copy. A big folder can take a few seconds; a brand-new
        // session must not call that "ended" on its first look.
        if (body.code === "no_live_session" || body.code === "not_ready") {
          s.noLiveSince ??= Date.now();
          if (Date.now() - s.noLiveSince < 30_000) {
            live()({ status: "watching", error: "", errorCode: "" });
            return;
          }
        }
        s.paused = true;
        clearTimer(s);
        live()({
          status: "error",
          errorCode: "ended",
          error: "",
        });
        return;
      }
      live()({
        status: "error",
        errorCode: "failed",
        error: body.error ?? `HTTP ${res.status}`,
      });
      return;
    }
    const data = (await res.json()) as {
      changed?: number;
      added?: number;
      removed?: number;
      refreshed?: number;
      paths?: string[];
      live?: { stale?: string[] };
    };
    const allowed = new Set(data.paths ?? manifest.map((entry) => entry.path));
    if (s !== session || s.stopped || s.rescanning) return;
    s.noLiveSince = null;
    s.snapshot = new Map([...next].filter(([path]) => allowed.has(path)));
    const touched = (data.changed ?? 0) + (data.added ?? 0) + (data.removed ?? 0);
    if (touched > 0) {
      const city = await fetchCity(s, s.pending.analysisId);
      if (s !== session || s.stopped || s.rescanning) return;
      if (city) useStore.getState().applyLiveCityData(city);
      live()({
        status: "watching",
        lastSyncAt: Date.now(),
        changed: data.changed ?? 0,
        added: data.added ?? 0,
        removed: data.removed ?? 0,
        refreshed: data.refreshed ?? 0,
        stale: city?.scanProvenance?.live?.stale ?? data.live?.stale ?? [],
        error: "",
        errorCode: "",
      });
    } else {
      live()({ status: "watching", error: "" });
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") return;
    if (s !== session || s.stopped) return;
    live()({
      status: "error",
      errorCode: "failed",
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    s.busy = false;
    schedule(s);
  }
}

/**
 * Stop watching without ending the session. The band stays, the snapshot
 * stays, and a resume picks up every change that happened while paused.
 */
export function pauseLiveSession(): void {
  const s = session;
  if (!s || s.stopped) return;
  s.paused = true;
  clearTimer(s);
  s.controller?.abort();
  s.controller = null;
  live()({ status: "paused", error: "", errorCode: "" });
}

export function resumeLiveSession(): void {
  const s = session;
  if (!s || s.stopped) return;
  s.paused = false;
  live()({ status: "watching", error: "", errorCode: "" });
  schedule(s);
}

/** Stop the loop and return the store to "off". Used on teardown/replacement. */
export function stopLiveSession(): void {
  const s = session;
  session = null;
  // The launch signal is spent once the loop stops; a remount must not revive
  // a folder the reader has left.
  useStore.getState().setPendingLive(null);
  if (!s) {
    live()({ ...EMPTY_LIVE_STATE });
    return;
  }
  s.stopped = true;
  clearTimer(s);
  s.controller?.abort();
  s.unsubscribe?.();
  live()({ ...EMPTY_LIVE_STATE });
}

/**
 * Start watching a finished handle-scanned folder. Idempotent for the same
 * analysis; a different one replaces the old session.
 */
export function startLiveSession(pending: PendingLiveScan): void {
  if (!hasSubtleCrypto()) return;
  if (
    session &&
    !session.stopped &&
    session.pending.analysisId === pending.analysisId &&
    session.pending.handle === pending.handle
  ) {
    return;
  }
  stopLiveSession();
  if (pending.manifest.length === 0) return;
  const s: Session = {
    pending,
    stopped: false,
    paused: false,
    rescanning: false,
    busy: false,
    snapshot: new Map(pending.manifest.map((entry) => [entry.path, entry])),
    timer: null,
    controller: null,
    unsubscribe: null,
    noLiveSince: null,
  };
  session = s;
  live()({
    ...EMPTY_LIVE_STATE,
    status: "watching",
    analysisId: pending.analysisId,
  });
  // A new city replaces the visit this session belongs to.
  s.unsubscribe = useStore.subscribe((state) => {
    if (s.stopped || s.rescanning) return;
    const id = state.cityData?.analysisId ?? null;
    if (id !== pending.analysisId) stopLiveSession();
  });
  schedule(s);
}

/** For tests and the Full-scan path: the session currently watching. */
export function currentLiveSession(): {
  analysisId: string;
  paused: boolean;
  snapshotSize: number;
} | null {
  return session
    ? {
        analysisId: session.pending.analysisId,
        paused: session.paused,
        snapshotSize: session.snapshot.size,
      }
    : null;
}

interface FullScanPayload {
  files: LocalFile[];
  manifest: LiveFileMeta[];
  dropped: DroppedFiles;
}

async function readFullFolder(s: Session, plan: FolderPlan): Promise<FullScanPayload> {
  const files: LocalFile[] = [];
  const manifest: LiveFileMeta[] = [];
  const dropped: DroppedFiles = { ...plan.dropped };
  let bytes = 0;
  let gitBytes = 0;
  for (const candidate of plan.candidates) {
    if (s.stopped) throw new Error("Live session ended");
    if (candidate.git) {
      if (candidate.file.size > GIT_MAX_FILE_BYTES) {
        dropped.tooLarge += 1;
      } else if (gitBytes + candidate.file.size > GIT_MAX_TOTAL_BYTES) {
        dropped.gitBudget += 1;
      } else {
        gitBytes += candidate.file.size;
        files.push({
          path: candidate.rel,
          content: await fileToBase64(candidate.file),
          encoding: "base64",
        });
      }
      continue;
    }
    if (bytes + candidate.file.size > MAX_TOTAL_BYTES) {
      throw new Error(`over ${Math.round(MAX_TOTAL_BYTES / 1024 / 1024)} MB of source`);
    }
    try {
      const buffer = await candidate.file.arrayBuffer();
      bytes += buffer.byteLength;
      files.push({ path: candidate.rel, content: decodeUtf8(buffer) });
      if (isAnalyzedByServer(candidate.rel)) {
        manifest.push({
          path: candidate.rel,
          sha: await sha256Hex(buffer),
          size: candidate.file.size,
          mtime: candidate.file.lastModified,
        });
      }
    } catch {
      dropped.unreadable += 1;
    }
  }
  return { files, manifest, dropped };
}

/**
 * "Full scan" from the live band: re-read the same folder through the full
 * pipeline (every engine), replace the city, and start watching the new scan.
 * A failure resumes the old watch instead of leaving the screen unobserved.
 */
export async function fullRescanLive(): Promise<void> {
  const s = session;
  if (!s || s.rescanning) return;
  const wasPaused = s.paused;
  s.rescanning = true;
  s.paused = true;
  clearTimer(s);
  // A delta already in flight must not land on the city the full scan replaces.
  s.controller?.abort();
  s.controller = null;
  const store = useStore.getState();
  store.setAnalysisProgress(0);
  live()({ status: "rescanning", progress: 0, error: "" });
  try {
    const excludes = s.pending.excludes.length > 0 ? s.pending.excludes : loadExcludes();
    const plan = await enumerate(s, excludes);
    if (plan.candidates.length === 0) throw new Error("no analyzable source files");
    const payload = await readFullFolder(s, plan);
    if (payload.files.length === 0) throw new Error("no analyzable source files");
    const config = configPayload(
      useStore.getState().scanProfile,
      useStore.getState().scanCategories,
      useStore.getState().scanPacks,
      excludes,
    );
    const res = await fetch("/api/analyze-local", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: s.pending.name,
        files: payload.files,
        config,
        dropped: payload.dropped,
      }),
    });
    const started = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
    if (!res.ok || typeof started.id !== "string") {
      throw new Error(started.error ?? `HTTP ${res.status}`);
    }
    const id = started.id;
    const deadline = Date.now() + FULL_SCAN_TIMEOUT_MS;
    for (;;) {
      if (s.stopped) return;
      if (Date.now() > deadline) throw new Error("full scan timed out");
      await delay(1000);
      const statusRes = await fetch(`/api/status/${encodeURIComponent(id)}`);
      if (!statusRes.ok) throw new Error(`HTTP ${statusRes.status}`);
      const status = (await statusRes.json()) as {
        status?: string;
        progress?: number;
        error?: string;
      };
      const progress = Math.round(status.progress ?? 0);
      useStore.getState().setAnalysisProgress(progress);
      live()({ progress });
      if (status.status === "complete") break;
      if (status.status === "failed") throw new Error(status.error ?? "scan failed");
    }
    const cityRes = await fetch(`/api/result/${encodeURIComponent(id)}/city`);
    if (!cityRes.ok) throw new Error(`city HTTP ${cityRes.status}`);
    const city = (await cityRes.json()) as CityData;
    const { handle, name } = s.pending;
    // Retire the old session before the new city changes the store id.
    s.stopped = true;
    s.unsubscribe?.();
    session = null;
    const next = useStore.getState();
    next.setCityData(city);
    next.setAnalysisId(id);
    next.setAnalysisProgress(100);
    startLiveSession({
      analysisId: id,
      name,
      handle,
      manifest: payload.manifest,
      excludes,
    });
  } catch (error) {
    s.rescanning = false;
    live()({
      status: "error",
      errorCode: "failed",
      progress: 0,
      error: error instanceof Error ? error.message : String(error),
    });
    s.paused = wasPaused;
    if (!s.paused) schedule(s);
  } finally {
    s.rescanning = false;
    useStore.getState().setAnalysisProgress(0);
  }
}

/** Tests: drop the module singleton without touching the store beyond "off". */
export function resetLiveForTests(): void {
  stopLiveSession();
}
