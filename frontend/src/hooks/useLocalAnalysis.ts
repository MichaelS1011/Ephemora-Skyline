import { useState, useEffect, useRef, useCallback } from "react";
import { useStore } from "../stores/useStore";
import type { CityData, DroppedFiles } from "../city/types";
import { configPayload, isExcludedPath, loadExcludes } from "../config/scanProfiles";
import { IgnoreMatcher } from "../config/gitignore";
import { progressLine, stageEntries, type StageEntry } from "../config/scanStages";
import { formatCount, t, type Lang } from "../i18n";

export type AnalysisState = "idle" | "collecting" | "analyzing" | "success" | "error";

/** Must mirror the backend pipeline's SUPPORTED_EXTENSIONS */
const SUPPORTED_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".rb",
  ".html",
  ".css",
  ".scss",
  ".json",
  ".yaml",
  ".yml",
  // Keep identical to SUPPORTED_EXTENSIONS in the backend orchestrator — the
  // parity test in backend/tests/scan-surface.test.ts compares the two lists.
  ".sh",
  ".bash",
  ".sql",
  ".tf",
  ".php",
  ".cs",
  ".kt",
  ".swift",
]);

/**
 * Env files carry no extension the walker can look up (".env" is a dotfile,
 * ".env.production" ends in ".production"), and the file holding the deployment
 * credentials must not be the one file the scan admits it never opened.
 * Mirrored from ENV_FILE in the backend metrics — pinned by a test.
 */
const ENV_FILE = /(^|\/)\.env(\.|$)/;

/** Directory names that never contain relevant source code */
const SKIP_DIRS =
  /^(node_modules|dist|build|out|\.next|\.nuxt|coverage|\.turbo|\.vscode|\.idea|__pycache__|\.venv|venv|target|vendor|\.pytest_cache|\.mypy_cache|\.gradle|Pods|bin|obj)$/i;

/** Dependency manifests are small text files the CVE layer (osv) needs —
 * always uploaded regardless of their extension (.txt, .lock, .toml) */
const MANIFEST_BASENAMES = new Set([
  "requirements.txt",
  "requirements-dev.txt",
  "Pipfile.lock",
  "poetry.lock",
  "pyproject.toml",
  "package-lock.json",
  "npm-shrinkwrap.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "Cargo.lock",
  "go.mod",
  "go.sum",
  "Gemfile.lock",
  "composer.lock",
]);

/** Ignore rules travel with the project so the backend can honour them — the
 * file itself is never counted as source, it has no code at all. */
const IGNORE_FILENAMES = new Set([".gitignore"]);

/** Test runners also read snapshots, documentation and text fixtures. Preserve
 * these in the local copy without treating them as analyzed source code. */
const TEST_SUPPORT_EXTENSIONS = new Set([
  ".md",
  ".txt",
  ".snap",
  ".svg",
  ".toml",
  ".xml",
  ".csv",
  ".conf",
  ".ini",
  ".properties",
]);
const TEST_SUPPORT_FILENAMES = new Set(["LICENSE", "NOTICE"]);

const isGitPath = (rel: string): boolean => rel === ".git" || rel.startsWith(".git/");

/** ArrayBuffer → base64 (binary-safe for .git packfiles) */
async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Read one file as its upload payload: source files as utf-8 text, .git
 * internals as base64 so git history survives the roundtrip byte-exact.
 */
async function readPayload(
  file: File,
  rel: string,
): Promise<{ content: string; encoding?: "base64" }> {
  if (isGitPath(rel)) {
    return { content: await fileToBase64(file), encoding: "base64" };
  }
  return { content: await file.text() };
}

/**
 * The two walls, kept in step with the backend's upload route.
 *
 * They used to contradict each other: 3,000 files at this repository's measured
 * average of 25 KB per file is 75 MB, so a folder reached the 40 MB line at about
 * 1,600 files and the file cap was never the limit it claimed to be. 10,000 files
 * and 150 MB is one promise instead of two.
 */
const MAX_FILES = 10_000;
const MAX_TOTAL_BYTES = 150 * 1024 * 1024;
const MAX_FILE_BYTES = 1.5 * 1024 * 1024;
/**
 * Mirror of MAX_PATH_LEN in the backend upload route. A path longer than this is
 * refused there, so the reader refuses it too — and counts it. Skipping them
 * quietly is how 30 of 62 files vanished from a scan the UI called complete.
 * backend/tests/upload-caps.test.ts pins the two constants to each other.
 */
const MAX_PATH_LEN = 512;
/**
 * The .git folder rides along (base64) so the backend can read real git
 * history — churn hotspots, author districts, history secrets — from a
 * purely local scan. Separate budget: git metadata must never crowd out
 * source files.
 */
export const GIT_MAX_TOTAL_BYTES = 15 * 1024 * 1024;
const GIT_MAX_FILE_BYTES = 8 * 1024 * 1024;
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 20 * 60 * 1000;
/** Files between two counter updates while reading */
const COUNTER_EVERY = 25;

interface LocalFile {
  path: string;
  content: string;
  /** set for binary .git payloads (base64) — everything else is utf-8 text */
  encoding?: "base64";
}

/** One file the folder offered, before anybody has read its bytes */
interface Candidate {
  rel: string;
  file: File;
  git: boolean;
}

/** Everything one enumeration pass learned about a folder */
interface FolderPlan {
  candidates: Candidate[];
  /** source files among them — the number the file cap is about */
  found: number;
  /** bytes of those source files, from the directory entry, never read */
  bytes: number;
  dropped: DroppedFiles;
  /** set as soon as the folder is known to be over the file cap */
  overCap: boolean;
  /**
   * The first ignored ancestor of every path set aside by the project's own
   * .gitignore. Held as a set so one ignored folder is one number, and so both
   * pickers arrive at the same count on the same rule.
   */
  setAside: Set<string>;
}

function emptyDropped(): DroppedFiles {
  return {
    pathTooLong: 0,
    unsafePath: 0,
    tooLarge: 0,
    unreadable: 0,
    excluded: 0,
    gitIgnored: 0,
    gitBudget: 0,
    unsupportedFormat: 0,
  };
}

function addDropped(dropped: DroppedFiles, key: keyof DroppedFiles, by = 1): DroppedFiles {
  return { ...dropped, [key]: dropped[key] + by };
}

function isSourceShaped(rel: string): boolean {
  const dot = rel.lastIndexOf(".");
  const ext = dot > rel.lastIndexOf("/") ? rel.slice(dot).toLowerCase() : "";
  const base = rel.split("/").pop() ?? "";
  return (
    SUPPORTED_EXTENSIONS.has(ext) ||
    TEST_SUPPORT_EXTENSIONS.has(ext) ||
    TEST_SUPPORT_FILENAMES.has(base) ||
    base === "Dockerfile" ||
    base.startsWith("Dockerfile.") ||
    base === "Makefile" ||
    ENV_FILE.test(rel) ||
    MANIFEST_BASENAMES.has(base) ||
    IGNORE_FILENAMES.has(base)
  );
}

/**
 * The first ancestor of `rel` the project's own .gitignore sets aside, or null.
 * Tested segment by segment with git's own kinds, so a folder rule prunes the
 * folder rather than its 4,000 files, and `tmp` as a file is still a file.
 */
function firstIgnoredAncestor(ignores: IgnoreMatcher, rel: string): string | null {
  const parts = rel.split("/");
  for (let i = 1; i <= parts.length; i++) {
    const soFar = parts.slice(0, i).join("/");
    if (ignores.isIgnored(soFar, i === parts.length ? "file" : "dir")) return soFar;
  }
  return null;
}

/**
 * The one selection decision, shared by both pickers: does this path join the
 * read, and if not, into which counted bucket does it fall? Nothing here opens
 * the file — that is what makes the cap answerable before 31 s of reading.
 *
 * The .gitignore answer comes first, because it is the folder's own statement
 * about what is not its source: measured on this repository on 2026-10-12, 16,968
 * of 17,360 candidates sat in local tooling folders the project already sets aside.
 */
function classifyCandidate(
  rel: string,
  file: File,
  excludes: string[],
  plan: FolderPlan,
  ignores: IgnoreMatcher | null,
): void {
  const git = isGitPath(rel);
  if (rel.split("/").some((segment) => SKIP_DIRS.test(segment))) return;
  if (!git && ignores) {
    const aside = firstIgnoredAncestor(ignores, rel);
    if (aside !== null) {
      if (!plan.setAside.has(aside)) {
        plan.setAside.add(aside);
        plan.dropped.gitIgnored += 1;
      }
      return;
    }
  }
  if (!git && !isSourceShaped(rel)) {
    plan.dropped.unsupportedFormat += 1;
    return;
  }
  if (isExcludedPath(rel, excludes)) {
    plan.dropped.excluded += 1;
    return;
  }
  if (rel.length > MAX_PATH_LEN) {
    plan.dropped.pathTooLong += 1;
    return;
  }
  if (!git && file.size > MAX_FILE_BYTES) {
    plan.dropped.tooLarge += 1;
    return;
  }
  if (git) {
    plan.candidates.push({ rel, file, git: true });
    return;
  }
  plan.bytes += file.size;
  plan.found += 1;
  plan.overCap = plan.found > MAX_FILES;
  plan.candidates.push({ rel, file, git: false });
}

function emptyPlan(): FolderPlan {
  return {
    candidates: [],
    found: 0,
    bytes: 0,
    dropped: emptyDropped(),
    overCap: false,
    setAside: new Set<string>(),
  };
}

/** One entry a directory handle hands back: a file to read, or a folder to walk into. */
type DirEntry = {
  name: string;
  kind: "file" | "directory";
  getFile?: () => Promise<File>;
};

type DirHandle = {
  name: string;
  values: () => AsyncIterable<DirEntry>;
};

function isDirHandlePickerAvailable(): boolean {
  return typeof (window as { showDirectoryPicker?: unknown }).showDirectoryPicker === "function";
}

// ── The sentences the waiting user is allowed to read ──────────────────────
// All of them come from the dictionary: a German screen that catches an English
// line mid-wait was one of the audited defects, and the server's own wording
// stays available as `errorDetail` (evidence), never as the headline.

const capLine = (lang: Lang, found: number, max: number): string =>
  t(lang, "cap.filesFound", {
    found: formatCount(lang, found),
    max: formatCount(lang, max),
  });

/** The size wall, in the two numbers that say it: files and kilobytes. */
const bytesLine = (lang: Lang, files: number, bytes: number): string =>
  `${t(lang, "analyze.filesBytes", {
    files: formatCount(lang, files),
    kb: formatCount(lang, Math.round(bytes / 1024)),
  })} — ${t(lang, "cap.hint")}`;

/** Nothing readable in the folder — said as a count and the list it accepts. */
const noSourceLine = (lang: Lang): string =>
  t(lang, "scan.noSource", {
    exts: [...SUPPORTED_EXTENSIONS].map((e) => e.slice(1)).join(", ") + ", .env",
  });

/**
 * Local-folder analysis flow: pick a folder in the browser, collect its
 * source files client-side, upload them once, then poll the backend job
 * until the city is ready. No GitHub, no clone — the code never leaves
 * the machine except to the local backend.
 *
 * What this flow owes the person waiting in front of it:
 * — an abort ends the run everywhere, server included, and no late answer can
 *   write to the screen any more;
 * — something counts while the folder is read, the same way in both pickers;
 * — every file the scan did not read is a number that reaches the result.
 */
export function useLocalAnalysis() {
  const [state, setState] = useState<AnalysisState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  /** The server's own words behind `errorMessage` — evidence, not the claim */
  const [errorDetail, setErrorDetail] = useState("");
  const [notice, setNotice] = useState("");
  const [collected, setCollected] = useState({ files: 0, bytes: 0, total: 0 });
  const [foundFiles, setFoundFiles] = useState(0);
  const [dropped, setDropped] = useState<DroppedFiles | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [budgetWaitSec, setBudgetWaitSec] = useState(0);
  const [rawStage, setRawStage] = useState<string | null>(null);

  const lang = useStore((s) => s.prefs.lang);
  const langRef = useRef(lang);
  langRef.current = lang;

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);
  const stateRef = useRef<AnalysisState>("idle");
  stateRef.current = state;
  /** Bumped by every new pick and every abort: late answers belong to no run */
  const runRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const jobIdRef = useRef<string | null>(null);
  const startedAtRef = useRef(0);
  /** The last stage the server named, and the two clocks the line is built from */
  const stageRef = useRef<string | null>(null);
  const elapsedRef = useRef(0);
  const budgetWaitRef = useRef(0);
  /** true once the upload is home and the wait belongs to the scanner */
  const waitingRef = useRef(false);

  const setCityData = useStore((s) => s.setCityData);
  const setAnalysisProgress = useStore((s) => s.setAnalysisProgress);
  const setAnalysisStage = useStore((s) => s.setAnalysisStage);
  const setAnalysisId = useStore((s) => s.setAnalysisId);
  const analysisProgress = useStore((s) => s.analysisProgress);
  const analysisStage = useStore((s) => s.analysisStage);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  /**
   * The one writer of the stage line: the server's stage (in the display
   * language), the seconds since the run started, and the read-budget wait when
   * the server has closed the window. Both consumers print it as it is.
   */
  const publishStage = useCallback(() => {
    const l = langRef.current;
    // Nothing uploaded yet and no stage named: the reading counter owns the line
    // (the landing block shows it), and "uploading" would be a lie.
    if (!stageRef.current && stateRef.current === "collecting") return;
    const base = stageRef.current
      ? progressLine(l, stageRef.current)
      : t(l, waitingRef.current ? "scan.waiting" : "scan.uploading");
    const parts = [base, t(l, "scan.elapsed", { s: elapsedRef.current })];
    if (budgetWaitRef.current > 0) {
      parts.push(`${t(l, "limit.waiting")} · ${budgetWaitRef.current} s`);
    }
    setAnalysisStage(parts.join(" · "));
  }, [setAnalysisStage]);

  /** Seconds since the run started, ticking while anything is in flight. */
  useEffect(() => {
    if (state !== "collecting" && state !== "analyzing") return;
    const id = setInterval(() => {
      elapsedRef.current = Math.max(0, Math.round((Date.now() - startedAtRef.current) / 1000));
      setElapsedSec(elapsedRef.current);
      // While reading, the counter owns the stage line; publishing the clock here
      // would overwrite it with "uploading" before anything was uploaded.
      if (state === "analyzing") publishStage();
    }, 1000);
    return () => clearInterval(id);
  }, [state, publishStage]);

  /** Take the stage the server named and republish the line under it. */
  const setStageOf = useCallback(
    (raw: string | null): void => {
      stageRef.current = raw;
      setRawStage(raw);
      publishStage();
    },
    [publishStage],
  );

  const fetchCityData = useCallback(
    async (id: string, run: number) => {
      try {
        const res = await fetch(`/api/result/${encodeURIComponent(id)}/city`, {
          signal: abortRef.current?.signal,
        });
        if (runRef.current !== run) return;
        if (!res.ok) {
          // A link the server does not know is not a broken folder — it says so.
          setErrorMessage(
            res.status === 404
              ? t(langRef.current, "app.permalinkError")
              : t(langRef.current, "scan.cityLoadFailed"),
          );
          setErrorDetail(`HTTP ${res.status}`);
          setState("error");
          return;
        }
        const data = (await res.json()) as CityData & { error?: string };
        if (data.error) {
          setErrorMessage(t(langRef.current, "scan.cityLoadFailed"));
          setErrorDetail(data.error);
          setState("error");
          return;
        }
        if (data.totalFiles === 0) {
          setErrorMessage(noSourceLine(langRef.current));
          setErrorDetail("the scan finished with no file in the city");
          setState("error");
          return;
        }
        setCityData(data);
        setAnalysisId(id);
        window.history.replaceState(null, "", `?city=${encodeURIComponent(id)}`);
        // The scan's own counts win over the reader's: they include what only
        // the server could see.
        setDropped(data.dropped ?? null);
        setState("success");
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        if (runRef.current !== run) return;
        setErrorMessage(t(langRef.current, "scan.cityLoadFailed"));
        setErrorDetail(err instanceof Error ? err.message : String(err));
        setState("error");
      }
    },
    [setAnalysisId, setCityData],
  );

  const pollStatus = useCallback(
    (id: string, run: number) => {
      const startedAt = Date.now();
      let notFoundStreak = 0;
      // One request at a time: the tick fires every POLL_INTERVAL_MS while the
      // backend is busy scanning and slow to answer, so without this the queue
      // grew by one pending fetch per tick and late answers wrote progress out
      // of order.
      let inFlight = false;
      /** while the read budget is closed, ticks count down instead of fetching */
      let budgetUntil = 0;
      stopPolling();
      pollTimerRef.current = setInterval(() => {
        if (runRef.current !== run) {
          stopPolling();
          return;
        }
        const now = Date.now();
        if (budgetUntil > now) {
          // A closed budget is a wait with a number on it, not a frozen bar.
          const left = Math.ceil((budgetUntil - now) / 1000);
          if (left !== budgetWaitRef.current) {
            budgetWaitRef.current = left;
            setBudgetWaitSec(left);
            publishStage();
          }
          return;
        }
        if (inFlight) return;
        inFlight = true;
        void (async () => {
          try {
            if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
              stopPolling();
              setErrorMessage(t(langRef.current, "scan.timedOut"));
              setErrorDetail(`no answer within ${Math.round(POLL_TIMEOUT_MS / 60000)} min`);
              setState("error");
              return;
            }
            const res = await fetch(`/api/status/${encodeURIComponent(id)}`, {
              signal: abortRef.current?.signal,
            });
            if (runRef.current !== run) return;
            if (res.status === 429) {
              const body = (await res.json().catch(() => ({}))) as {
                retryAfterSeconds?: number;
              };
              const header = Number(res.headers.get("RateLimit-Reset"));
              const seconds =
                body.retryAfterSeconds ??
                (Number.isFinite(header) && header > 0 ? header : Math.ceil(15 * 60));
              budgetUntil = Date.now() + seconds * 1000;
              budgetWaitRef.current = seconds;
              setBudgetWaitSec(seconds);
              publishStage();
              return;
            }
            if (!res.ok) {
              // 404 = the job is gone (backend restarted) — not transient.
              // Other codes get a short grace period before giving up.
              notFoundStreak = res.status === 404 ? notFoundStreak + 1 : 0;
              if (notFoundStreak >= 3) {
                stopPolling();
                setErrorMessage(t(langRef.current, "scan.jobGone"));
                setErrorDetail("analysis job not found (404)");
                setState("error");
              }
              return;
            }
            notFoundStreak = 0;
            if (budgetWaitRef.current !== 0) {
              budgetWaitRef.current = 0;
              setBudgetWaitSec(0);
            }
            const data = (await res.json()) as {
              status?: string;
              progress?: number;
              stage?: string;
              error?: string;
            };
            if (typeof data.progress === "number") {
              setAnalysisProgress(Math.min(100, Math.max(0, data.progress)));
            }
            if (typeof data.stage === "string" && data.stage) setStageOf(data.stage);
            if (data.status === "complete") {
              stopPolling();
              setStageOf("Complete");
              void fetchCityData(id, run);
            } else if (data.status === "failed") {
              stopPolling();
              setErrorMessage(t(langRef.current, "scan.serverFailed"));
              setErrorDetail(data.error ?? "the scan failed on the server");
              setState("error");
            }
          } catch (err) {
            if (err instanceof Error && err.name === "AbortError") return;
            // network hiccup — retry on next tick
          } finally {
            inFlight = false;
          }
        })();
      }, POLL_INTERVAL_MS);
    },
    [fetchCityData, publishStage, setAnalysisProgress, setStageOf, stopPolling],
  );

  const uploadAndAnalyze = useCallback(
    async (name: string, files: LocalFile[], clientDropped: DroppedFiles, run: number) => {
      const l = langRef.current;
      setErrorMessage("");
      setErrorDetail("");
      setAnalysisProgress(0);
      setStageOf(null);
      setState("analyzing");
      const controller = new AbortController();
      abortRef.current = controller;
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
        if (runRef.current !== run) return;
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
          setErrorDetail(data.error ?? `HTTP ${res.status}`);
          if (res.status === 429 || data.code === "rate_limited") {
            const header = Number(res.headers.get("RateLimit-Reset"));
            const seconds =
              data.retryAfterSeconds ??
              (Number.isFinite(header) && header > 0 ? header : Math.ceil(15 * 60));
            setErrorMessage(`${t(l, "limit.hit", { s: seconds })} — ${t(l, "cap.hint")}`);
          } else if (data.code === "too_many_files") {
            setErrorMessage(
              `${capLine(l, data.found ?? files.length, data.max ?? MAX_FILES)} — ${t(l, "cap.hint")}`,
            );
          } else if (data.code === "no_source") {
            setErrorMessage(noSourceLine(l));
          } else if (res.status === 413) {
            setErrorMessage(bytesLine(l, files.length, clientBytesOf(files)));
          } else {
            setErrorMessage(t(l, "scan.uploadHttpStatus", { status: res.status }));
          }
          setDropped(clientDropped);
          setState("error");
          return;
        }
        jobIdRef.current = data.id;
        waitingRef.current = true;
        pollStatus(data.id, run);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return; // cancelled
        if (runRef.current !== run) return;
        setErrorMessage(t(langRef.current, "scan.uploadFailed"));
        setErrorDetail(err instanceof Error ? err.message : String(err));
        setState("error");
      }
    },
    [pollStatus, setAnalysisProgress, setStageOf],
  );

  /** The reading counter, in the display language: "150 Dateien gelesen · 150 von 312" */
  const setReadingLine = useCallback(
    (l: Lang, read: number, total: number): void => {
      const parts = [
        t(l, read === 1 ? "scan.readingOne" : "scan.reading", { n: formatCount(l, read) }),
      ];
      if (total > 0)
        parts.push(
          t(l, "scan.readingOf", { n: formatCount(l, read), total: formatCount(l, total) }),
        );
      setAnalysisStage(parts.join(" · "));
    },
    [setAnalysisStage],
  );

  /**
   * Read the classified candidates and upload them. One loop for both pickers,
   * so the counter moves the same way however the folder was picked — and a file
   * the reader cannot open lands in a bucket that travels with the upload.
   */
  const readAndUpload = useCallback(
    async (plan: FolderPlan, rootName: string, run: number) => {
      const l = langRef.current;
      const payload: LocalFile[] = [];
      let accounting = plan.dropped;
      let totalBytes = 0;
      let gitBytes = 0;
      const total = plan.candidates.length;
      for (const { rel, file, git } of plan.candidates) {
        if (cancelledRef.current || runRef.current !== run) return;
        if (git) {
          /**
           * Two different reasons, two different numbers. A 9 MB pack file is
           * genuinely too large; the 1,470th loose object is not — the history
           * budget of 15 MB merely filled up. Reporting the second case as
           * "too large or unreadable" tells the user their repository is
           * unusual when it is the tool that stopped reading.
           */
          if (file.size > GIT_MAX_FILE_BYTES) {
            accounting = addDropped(accounting, "tooLarge");
            continue;
          }
          if (gitBytes + file.size > GIT_MAX_TOTAL_BYTES) {
            accounting = addDropped(accounting, "gitBudget");
            continue;
          }
        } else if (totalBytes + file.size > MAX_TOTAL_BYTES) {
          setCollected({ files: payload.length, bytes: totalBytes, total });
          setDropped(accounting);
          setErrorMessage(bytesLine(l, payload.length, totalBytes));
          setErrorDetail(
            `over ${Math.round(MAX_TOTAL_BYTES / 1024 / 1024)} MB of source — ${t(l, "cap.excludeLabel")}`,
          );
          setState("error");
          return;
        }
        try {
          payload.push({ path: rel, ...(await readPayload(file, rel)) });
        } catch {
          accounting = addDropped(accounting, "unreadable");
          continue;
        }
        if (git) gitBytes += file.size;
        else totalBytes += file.size;
        const read = payload.length;
        if (read % COUNTER_EVERY === 0 || read === total) {
          setCollected({ files: read, bytes: totalBytes, total });
          setDropped(accounting);
          setReadingLine(l, read, total);
        }
      }
      if (cancelledRef.current || runRef.current !== run) return;
      setCollected({ files: payload.length, bytes: totalBytes, total });
      setFoundFiles(plan.found);
      setDropped(accounting);
      if (payload.length === 0) {
        setErrorMessage(noSourceLine(l));
        setErrorDetail(
          `${accounting.pathTooLong} over ${MAX_PATH_LEN} chars, ${accounting.unreadable} unreadable`,
        );
        setState("error");
        return;
      }
      await uploadAndAnalyze(rootName, payload, accounting, run);
    },
    [setReadingLine, uploadAndAnalyze],
  );

  /**
   * The cap answer, before a single file is opened: what was found, what the
   * limit is, and the way out. It used to arrive after 31 s of reading and name
   * folders that were not in the folder.
   */
  const refuseOverCap = useCallback((found: number): void => {
    const l = langRef.current;
    setErrorMessage(`${capLine(l, found, MAX_FILES)} — ${t(l, "cap.hint")}`);
    const excludes = loadExcludes();
    setErrorDetail(
      excludes.length > 0
        ? `${t(l, "cap.excludeLabel")}: ${excludes.join(", ")}`
        : `no exclude folder set — ${t(l, "cap.excludePlaceholder")}`,
    );
    setState("error");
  }, []);

  /** The folder held nothing the scan can read — said as a count, not a shrug. */
  const nothingFound = useCallback((plan: FolderPlan): void => {
    const l = langRef.current;
    setErrorMessage(noSourceLine(l));
    setErrorDetail(
      `${plan.dropped.excluded} excluded, ${plan.dropped.pathTooLong} over ${MAX_PATH_LEN} chars, ${plan.dropped.tooLarge} oversized`,
    );
    setState("error");
  }, []);

  const collectFromFileList = useCallback(
    async (fileList: File[], rootName: string, run: number) => {
      const excludes = loadExcludes();
      const plan = emptyPlan();
      // webkitRelativePath = "<root>/<...path>" — strip the root segment
      const relOf = (file: File) =>
        (file.webkitRelativePath || file.name).split("/").slice(1).join("/") || file.name;
      /**
       * This picker arrives with the whole folder already enumerated, so the
       * .gitignore files ride in the same list. Read them first and judge every
       * path with them: a folder that sets 14,000 files aside must not spend
       * 14,000 File objects and 14,000 slots against the cap.
       */
      const ignores = new IgnoreMatcher();
      let ruleFiles = 0;
      for (const file of fileList) {
        if (cancelledRef.current || runRef.current !== run) return;
        const rel = relOf(file);
        if (isGitPath(rel) || rel.split("/").some((segment) => SKIP_DIRS.test(segment))) continue;
        if (rel.split("/").pop() !== ".gitignore") continue;
        try {
          ignores.add(rel.split("/").slice(0, -1).join("/"), await file.text());
          ruleFiles += 1;
        } catch {
          /* unreadable rule file — what it would have set aside is read instead */
        }
      }
      const matcher = ruleFiles > 0 ? ignores : null;
      for (const file of fileList) {
        if (cancelledRef.current || runRef.current !== run) return;
        classifyCandidate(relOf(file), file, excludes, plan, matcher);
      }
      setCollected({ files: 0, bytes: plan.bytes, total: plan.candidates.length });
      setFoundFiles(plan.found);
      setDropped(plan.dropped);
      if (plan.overCap) {
        refuseOverCap(plan.found);
        return;
      }
      if (plan.candidates.length === 0) {
        nothingFound(plan);
        return;
      }
      await readAndUpload(plan, rootName, run);
    },
    [nothingFound, readAndUpload, refuseOverCap],
  );

  /** Fallback for browsers without the File System Access API */
  const pickViaInputFallback = useCallback(
    (run: number) => {
      return new Promise<void>((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.setAttribute("webkitdirectory", "");
        input.setAttribute("directory", "");
        input.style.display = "none";
        input.onchange = () => {
          const fileList = Array.from(input.files ?? []);
          const rootName = fileList[0]?.webkitRelativePath?.split("/")[0] ?? "local folder";
          input.remove();
          if (runRef.current !== run) {
            resolve();
            return;
          }
          void collectFromFileList(fileList, rootName, run).finally(resolve);
        };
        input.oncancel = () => {
          input.remove();
          if (runRef.current === run) setState("idle");
          resolve();
        };
        document.body.appendChild(input);
        input.click();
      });
    },
    [collectFromFileList],
  );

  /**
   * The File System Access walk: enumerate first (a count that moves while the
   * tree is walked), then read through the same loop the fallback uses. Both
   * pickers therefore show the same numbers at the same moments.
   */
  const collectFromDirectoryHandle = useCallback(
    async (dir: DirHandle, run: number) => {
      const excludes = loadExcludes();
      const plan = emptyPlan();
      const ignores = new IgnoreMatcher();
      const walk = async (dirHandle: DirHandle, prefix: string): Promise<void> => {
        /**
         * git reads a folder's .gitignore before it judges that folder's
         * contents, so this walk does the same: list the entries, register any
         * rule file, then decide. Entries arrive in no particular order, and a
         * `.gitignore` seen last would otherwise set aside nothing.
         */
        const entries: DirEntry[] = [];
        for await (const entry of dirHandle.values()) entries.push(entry);
        const rule = entries.find((e) => e.kind !== "directory" && e.name === ".gitignore");
        if (rule?.getFile) {
          try {
            ignores.add(prefix.replace(/\/$/, ""), await (await rule.getFile()).text());
          } catch {
            /* unreadable rule file — its folder is read as it stands */
          }
        }
        for (const entry of entries) {
          if (cancelledRef.current || runRef.current !== run) return;
          const rel = `${prefix}${entry.name}`;
          if (entry.kind === "directory") {
            if (SKIP_DIRS.test(entry.name)) continue;
            // Pruned as a folder, so nothing inside it is listed, read, or
            // counted against the cap — this is what 14,037 tooling files used
            // to cost.
            if (ignores.isIgnored(rel, "dir")) {
              if (!plan.setAside.has(rel)) {
                plan.setAside.add(rel);
                plan.dropped.gitIgnored += 1;
              }
              continue;
            }
            await walk(entry as unknown as DirHandle, `${rel}/`);
            if (plan.overCap || cancelledRef.current || runRef.current !== run) return;
            continue;
          }
          const filePromise = entry.getFile?.();
          const file = filePromise ? await filePromise.catch(() => null) : null;
          if (!file) {
            plan.dropped.unreadable += 1;
            continue;
          }
          classifyCandidate(rel, file, excludes, plan, ignores);
          if (plan.overCap) return;
          const seen = plan.candidates.length;
          if (seen % COUNTER_EVERY === 0 && seen > 0) {
            setCollected({ files: seen, bytes: plan.bytes, total: seen });
            setFoundFiles(plan.found);
            setStageOf("Enumerating files");
          }
        }
      };
      await walk(dir, "");
      if (cancelledRef.current || runRef.current !== run) return;
      setCollected({ files: 0, bytes: plan.bytes, total: plan.candidates.length });
      setFoundFiles(plan.found);
      setDropped(plan.dropped);
      if (plan.overCap) {
        refuseOverCap(plan.found);
        return;
      }
      if (plan.candidates.length === 0) {
        nothingFound(plan);
        return;
      }
      await readAndUpload(plan, dir.name, run);
    },
    [nothingFound, readAndUpload, refuseOverCap, setStageOf],
  );

  const pickFolder = useCallback(async () => {
    if (stateRef.current === "collecting" || stateRef.current === "analyzing") return;
    const run = ++runRef.current;
    cancelledRef.current = false;
    jobIdRef.current = null;
    stageRef.current = null;
    budgetWaitRef.current = 0;
    elapsedRef.current = 0;
    waitingRef.current = false;
    setBudgetWaitSec(0);
    setElapsedSec(0);
    setNotice("");
    setErrorMessage("");
    setErrorDetail("");
    setDropped(null);
    setCollected({ files: 0, bytes: 0, total: 0 });
    setFoundFiles(0);
    startedAtRef.current = Date.now();
    abortRef.current = new AbortController();
    setState("collecting");
    setStageOf(null);
    if (!isDirHandlePickerAvailable()) {
      await pickViaInputFallback(run);
      return;
    }
    try {
      const picker = (
        window as unknown as { showDirectoryPicker?: (opts?: unknown) => Promise<DirHandle> }
      ).showDirectoryPicker;
      if (!picker) throw new Error("unsupported");
      const dir = await picker.call(window, { mode: "read" });
      await collectFromDirectoryHandle(dir, run);
    } catch (err) {
      // AbortError = user cancelled the native dialog
      if (err instanceof Error && err.name === "AbortError") {
        setState("idle");
        return;
      }
      if (runRef.current !== run) return;
      // Some Chromium builds restrict the API — fall back transparently
      await pickViaInputFallback(run);
    }
  }, [collectFromDirectoryHandle, pickViaInputFallback, setStageOf]);

  /**
   * Cancel, for real: the run's identity is retired so no late answer can write
   * to the screen, the in-flight fetch is aborted, the job on the server is
   * thrown away (result, progress and the staged copy of the source), and the UI
   * goes back to idle with a line that says nothing continues.
   */
  const cancel = useCallback(() => {
    runRef.current += 1;
    cancelledRef.current = true;
    const controller = abortRef.current;
    abortRef.current = null;
    controller?.abort();
    stopPolling();
    const id = jobIdRef.current;
    jobIdRef.current = null;
    if (id) {
      void fetch(`/api/analyze-local/${encodeURIComponent(id)}/cancel`, {
        method: "POST",
      }).catch(() => {
        // unreachable server: the client half of the abort still holds, and the
        // job's own TTL is what cleans up there
      });
    }
    setState("idle");
    setAnalysisProgress(0);
    setAnalysisStage("");
    setBudgetWaitSec(0);
    setErrorMessage("");
    setErrorDetail("");
    setNotice(t(langRef.current, "scan.cancelled"));
  }, [setAnalysisProgress, setAnalysisStage, stopPolling]);

  const reset = useCallback(() => {
    setErrorMessage("");
    setErrorDetail("");
    setNotice("");
    setState("idle");
  }, []);

  const stages: StageEntry[] = stageEntries(lang, rawStage);

  return {
    state,
    errorMessage,
    errorDetail,
    notice,
    analysisProgress,
    analysisStage,
    collected,
    foundFiles,
    dropped,
    elapsedSec,
    budgetWaitSec,
    stages,
    pickFolder,
    cancel,
    reset,
    isAnalyzing: state === "collecting" || state === "analyzing",
    supportsDirectoryPicker: isDirHandlePickerAvailable(),
  };
}

/** Upper bound of the upload body in bytes, for the 413 sentence. */
function clientBytesOf(files: LocalFile[]): number {
  let bytes = 0;
  for (const file of files) bytes += file.content.length;
  return bytes;
}
