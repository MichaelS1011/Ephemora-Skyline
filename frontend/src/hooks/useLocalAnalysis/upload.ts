import { t, type Lang } from "../../i18n";
import { configPayload, loadExcludes } from "../../config/scanProfiles";
import { useStore } from "../../stores/useStore";
import type { DroppedFiles } from "../../city/types";
import type { AnalysisState, FolderPlan, LocalFile } from "../useLocalAnalysis";
import type { LiveFileMeta } from "../../live/types";
import { hasSubtleCrypto, sha256Hex } from "../../live/files";

/**
 * The upload half of the local flow, split out of `useLocalAnalysis.ts` (K3):
 * read the classified candidates into their wire payload and POST them once to
 * `/api/analyze-local`. The hook owns every state cell and passes them in as
 * `deps`; nothing here holds state of its own.
 */

/** The per-file wall of the history branch — a 9 MB pack file is too large. */
const GIT_MAX_FILE_BYTES = 8 * 1024 * 1024;

/** Files between two counter updates while reading */
export const COUNTER_EVERY = 25;

type Ref<T> = { current: T };

export interface ReadAndUploadDeps {
  langRef: Ref<Lang>;
  cancelledRef: Ref<boolean>;
  runRef: Ref<number>;
  setCollected: (c: { files: number; bytes: number; total: number }) => void;
  setDropped: (d: DroppedFiles) => void;
  setFoundFiles: (n: number) => void;
  setState: (state: AnalysisState) => void;
  setErrorMessage: (s: string) => void;
  setErrorDetail: (s: string) => void;
  setReadingLine: (l: Lang, read: number, total: number) => void;
  uploadAndAnalyze: (
    name: string,
    files: LocalFile[],
    clientDropped: DroppedFiles,
    run: number,
  ) => Promise<void>;
  addDropped: (dropped: DroppedFiles, key: keyof DroppedFiles, by?: number) => DroppedFiles;
  bytesLine: (lang: Lang, files: number, bytes: number) => string;
  noSourceLine: (lang: Lang) => string;
  readPayload: (file: File, rel: string) => Promise<{ content: string; encoding?: "base64" }>;
  /** Does the backend analyze this path? Support files ride along but are never in the live manifest. */
  isAnalyzedByServer: (rel: string) => boolean;
  maxTotalBytes: number;
  maxPathLen: number;
  gitMaxTotalBytes: number;
}

function buildLiveManifest(
  sources: ReadonlyArray<{ path: string; content: string; size: number; mtime: number }>,
): Promise<LiveFileMeta[]> {
  if (!hasSubtleCrypto()) return Promise.resolve([]);
  return (async () => {
    const manifest: LiveFileMeta[] = [];
    for (const source of sources) {
      manifest.push({
        path: source.path,
        // The server hashes the staged UTF-8 bytes of exactly this content.
        sha: await sha256Hex(new TextEncoder().encode(source.content).buffer as ArrayBuffer),
        size: source.size,
        mtime: source.mtime,
      });
    }
    return manifest;
  })();
}

/**
 * Read the classified candidates and upload them. One loop for both pickers,
 * so the counter moves the same way however the folder was picked — and a file
 * the reader cannot open lands in a bucket that travels with the upload.
 *
 * The hashes for the live manifest are computed in parallel with the upload:
 * the scan never waits for a feature it may not use, and by the time the
 * poller returns a city the manifest is ready.
 */
export async function readAndUpload(
  deps: ReadAndUploadDeps,
  plan: FolderPlan,
  rootName: string,
  run: number,
): Promise<LiveFileMeta[] | null> {
  const l = deps.langRef.current;
  const payload: LocalFile[] = [];
  /** Content whose hash becomes the manifest a live watch starts from */
  const manifestSources: Array<{ path: string; content: string; size: number; mtime: number }> = [];
  let accounting = plan.dropped;
  let totalBytes = 0;
  let gitBytes = 0;
  const total = plan.candidates.length;
  for (const { rel, file, git } of plan.candidates) {
    if (deps.cancelledRef.current || deps.runRef.current !== run) return null;
    if (git) {
      /**
       * Two different reasons, two different numbers. A 9 MB pack file is
       * genuinely too large; the 1,470th loose object is not — the history
       * budget of 15 MB merely filled up. Reporting the second case as
       * "too large or unreadable" tells the user their repository is
       * unusual when it is the tool that stopped reading.
       */
      if (file.size > GIT_MAX_FILE_BYTES) {
        accounting = deps.addDropped(accounting, "tooLarge");
        continue;
      }
      if (gitBytes + file.size > deps.gitMaxTotalBytes) {
        accounting = deps.addDropped(accounting, "gitBudget");
        continue;
      }
    } else if (totalBytes + file.size > deps.maxTotalBytes) {
      deps.setCollected({ files: payload.length, bytes: totalBytes, total });
      deps.setDropped(accounting);
      deps.setErrorMessage(deps.bytesLine(l, payload.length, totalBytes));
      deps.setErrorDetail(
        `over ${Math.round(deps.maxTotalBytes / 1024 / 1024)} MB of source — ${t(l, "cap.excludeLabel")}`,
      );
      deps.setState("error");
      return null;
    }
    try {
      const read = await deps.readPayload(file, rel);
      payload.push({
        path: rel,
        content: read.content,
        ...(read.encoding ? { encoding: read.encoding } : {}),
      });
      if (!git && deps.isAnalyzedByServer(rel)) {
        manifestSources.push({
          path: rel,
          content: read.content,
          size: file.size,
          mtime: file.lastModified,
        });
      }
    } catch {
      accounting = deps.addDropped(accounting, "unreadable");
      continue;
    }
    if (git) gitBytes += file.size;
    else totalBytes += file.size;
    const read = payload.length;
    if (read % COUNTER_EVERY === 0 || read === total) {
      deps.setCollected({ files: read, bytes: totalBytes, total });
      deps.setDropped(accounting);
      deps.setReadingLine(l, read, total);
    }
  }
  if (deps.cancelledRef.current || deps.runRef.current !== run) return null;
  deps.setCollected({ files: payload.length, bytes: totalBytes, total });
  deps.setFoundFiles(plan.found);
  deps.setDropped(accounting);
  if (payload.length === 0) {
    deps.setErrorMessage(deps.noSourceLine(l));
    deps.setErrorDetail(
      `${accounting.pathTooLong} over ${deps.maxPathLen} chars, ${accounting.unreadable} unreadable`,
    );
    deps.setState("error");
    return null;
  }
  const manifestPromise = buildLiveManifest(manifestSources);
  await deps.uploadAndAnalyze(rootName, payload, accounting, run);
  return manifestPromise;
}

/** Upper bound of the upload body in bytes, for the 413 sentence. */
export function clientBytesOf(files: LocalFile[]): number {
  let bytes = 0;
  for (const file of files) bytes += file.content.length;
  return bytes;
}

export interface UploadAndAnalyzeDeps {
  langRef: Ref<Lang>;
  setErrorMessage: (s: string) => void;
  setErrorDetail: (s: string) => void;
  setAnalysisProgress: (n: number) => void;
  setStageOf: (raw: string | null) => void;
  setState: (state: AnalysisState) => void;
  setDropped: (d: DroppedFiles) => void;
  abortRef: Ref<AbortController | null>;
  runRef: Ref<number>;
  jobIdRef: Ref<string | null>;
  waitingRef: Ref<boolean>;
  pollStatus: (id: string, run: number) => void;
  maxFiles: number;
  capLine: (lang: Lang, found: number, max: number) => string;
  bytesLine: (lang: Lang, files: number, bytes: number) => string;
  noSourceLine: (lang: Lang) => string;
}

/**
 * POST the payload and hand the job id to the poller. The server's own words
 * stay on the detail line; the headline is the dictionary's sentence.
 */
export async function uploadAndAnalyze(
  deps: UploadAndAnalyzeDeps,
  name: string,
  files: LocalFile[],
  clientDropped: DroppedFiles,
  run: number,
): Promise<void> {
  const l = deps.langRef.current;
  deps.setErrorMessage("");
  deps.setErrorDetail("");
  deps.setAnalysisProgress(0);
  deps.setStageOf(null);
  deps.setState("analyzing");
  const controller = new AbortController();
  deps.abortRef.current = controller;
  try {
    const { scanProfile: profile, scanCategories, scanPacks } = useStore.getState();
    const res = await fetch("/api/analyze-local", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        files,
        config: configPayload(profile, scanCategories, scanPacks, loadExcludes()),
        // the reader's own accounting: only it knows how many paths it never
        // opened, and the city total has to carry that number
        dropped: clientDropped,
      }),
      signal: controller.signal,
    });
    if (deps.runRef.current !== run) return;
    const data = (await res.json().catch(() => ({}))) as {
      id?: string;
      error?: string;
      code?: string;
      found?: number;
      max?: number;
      retryAfterSeconds?: number;
    };
    if (!res.ok || typeof data.id !== "string") {
      // The server's explanation goes to the detail line; what the user reads
      // first is the dictionary's sentence, in their language.
      deps.setErrorDetail(data.error ?? `HTTP ${res.status}`);
      if (res.status === 429 || data.code === "rate_limited") {
        const header = Number(res.headers.get("RateLimit-Reset"));
        const seconds =
          data.retryAfterSeconds ??
          (Number.isFinite(header) && header > 0 ? header : Math.ceil(15 * 60));
        deps.setErrorMessage(`${t(l, "limit.hit", { s: seconds })} — ${t(l, "cap.hint")}`);
      } else if (data.code === "too_many_files") {
        deps.setErrorMessage(
          `${deps.capLine(l, data.found ?? files.length, data.max ?? deps.maxFiles)} — ${t(l, "cap.hint")}`,
        );
      } else if (data.code === "no_source") {
        deps.setErrorMessage(deps.noSourceLine(l));
      } else if (res.status === 413) {
        deps.setErrorMessage(deps.bytesLine(l, files.length, clientBytesOf(files)));
      } else {
        deps.setErrorMessage(t(l, "scan.uploadHttpStatus", { status: res.status }));
      }
      deps.setDropped(clientDropped);
      deps.setState("error");
      return;
    }
    deps.jobIdRef.current = data.id;
    deps.waitingRef.current = true;
    deps.pollStatus(data.id, run);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") return; // cancelled
    if (deps.runRef.current !== run) return;
    deps.setErrorMessage(t(deps.langRef.current, "scan.uploadFailed"));
    deps.setErrorDetail(err instanceof Error ? err.message : String(err));
    deps.setState("error");
  }
}
