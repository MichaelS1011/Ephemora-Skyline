import { useState, useEffect, useRef, useCallback } from "react";
import { useStore } from "../stores/useStore";
import type { CityData } from "../city/types";
import { configPayload } from "../config/scanProfiles";

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

const MAX_FILES = 3000;
const MAX_TOTAL_BYTES = 40 * 1024 * 1024;
const MAX_FILE_BYTES = 1.5 * 1024 * 1024;
/**
 * The .git folder rides along (base64) so the backend can read real git
 * history — churn hotspots, author districts, history secrets — from a
 * purely local scan. Separate budget: git metadata must never crowd out
 * source files.
 */
const GIT_MAX_TOTAL_BYTES = 15 * 1024 * 1024;
const GIT_MAX_FILE_BYTES = 8 * 1024 * 1024;
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 20 * 60 * 1000;

interface LocalFile {
  path: string;
  content: string;
  /** set for binary .git payloads (base64) — everything else is utf-8 text */
  encoding?: "base64";
}

/** Thrown when folder collection itself fails (too large, unreadable) —
 * must NOT trigger the webkitdirectory fallback picker */
class FolderCollectionError extends Error {}

type DirHandle = {
  name: string;
  values: () => AsyncIterable<{
    name: string;
    kind: "file" | "directory";
    getFile?: () => Promise<File>;
  }>;
};

function isDirHandlePickerAvailable(): boolean {
  return typeof (window as { showDirectoryPicker?: unknown }).showDirectoryPicker === "function";
}

/**
 * Local-folder analysis flow: pick a folder in the browser, collect its
 * source files client-side, upload them once, then poll the backend job
 * until the city is ready. No GitHub, no clone — the code never leaves
 * the machine except to the local backend.
 */
export function useLocalAnalysis() {
  const [state, setState] = useState<AnalysisState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [collected, setCollected] = useState({ files: 0, bytes: 0 });

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);
  const stateRef = useRef<AnalysisState>("idle");
  stateRef.current = state;

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

  const fetchCityData = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/result/${encodeURIComponent(id)}/city`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as CityData & { error?: string };
        if (data.error) throw new Error(data.error);
        if (data.totalFiles === 0) {
          throw new Error("No analyzable source files in that folder");
        }
        setCityData(data);
        setAnalysisId(id);
        window.history.replaceState(null, "", `?city=${encodeURIComponent(id)}`);
        setState("success");
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "Failed to load city data");
        setState("error");
      }
    },
    [setCityData, setAnalysisId],
  );

  const pollStatus = useCallback(
    (id: string) => {
      const startedAt = Date.now();
      let notFoundStreak = 0;
      stopPolling();
      pollTimerRef.current = setInterval(() => {
        void (async () => {
          if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
            stopPolling();
            setErrorMessage("Analysis timed out — is the backend still running?");
            setState("error");
            return;
          }
          try {
            const res = await fetch(`/api/status/${encodeURIComponent(id)}`);
            if (!res.ok) {
              // 404 = the job is gone (backend restarted) — not transient.
              // Other codes get a short grace period before giving up.
              notFoundStreak = res.status === 404 ? notFoundStreak + 1 : 0;
              if (notFoundStreak >= 3) {
                stopPolling();
                setErrorMessage("Analysis job not found — was the backend restarted?");
                setState("error");
              }
              return;
            }
            notFoundStreak = 0;
            const data = (await res.json()) as {
              status?: string;
              progress?: number;
              stage?: string;
              error?: string;
            };
            if (typeof data.progress === "number") {
              setAnalysisProgress(Math.min(100, Math.max(0, data.progress)));
            }
            if (typeof data.stage === "string" && data.stage) setAnalysisStage(data.stage);
            if (data.status === "complete") {
              stopPolling();
              setAnalysisStage("Complete!");
              void fetchCityData(id);
            } else if (data.status === "failed") {
              stopPolling();
              setErrorMessage(
                data.error ?? "Analysis failed on the server — check the backend logs.",
              );
              setState("error");
            }
          } catch {
            // network hiccup — retry on next tick
          }
        })();
      }, POLL_INTERVAL_MS);
    },
    [fetchCityData, setAnalysisProgress, setAnalysisStage, stopPolling],
  );

  const uploadAndAnalyze = useCallback(
    async (name: string, files: LocalFile[], signal?: AbortSignal) => {
      setErrorMessage("");
      setAnalysisProgress(0);
      setAnalysisStage("Uploading files…");
      setState("analyzing");
      try {
        const profile = useStore.getState().scanProfile;
        const res = await fetch("/api/analyze-local", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, files, config: configPayload(profile) }),
          signal,
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          if (res.status === 413) {
            throw new Error(
              "Folder too large for one upload — exclude generated files (bundles, fixtures) and retry",
            );
          }
          throw new Error(data.error ?? `Upload failed (HTTP ${res.status})`);
        }
        const { id } = (await res.json()) as { id: string };
        setAnalysisStage("Waiting for scan…");
        pollStatus(id);
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "Upload failed");
        setState("error");
      }
    },
    [pollStatus, setAnalysisProgress, setAnalysisStage],
  );

  const collectFromFileList = useCallback(
    async (fileList: File[], rootName: string) => {
      const files: LocalFile[] = [];
      let totalBytes = 0;
      let gitBytes = 0;
      let skipped = 0;
      for (const file of fileList) {
        if (cancelledRef.current) {
          setState("idle");
          return;
        }
        // webkitRelativePath = "<root>/<...path>" — strip the root segment
        const rel =
          (file.webkitRelativePath || file.name).split("/").slice(1).join("/") || file.name;
        const dot = rel.lastIndexOf(".");
        const ext = dot > rel.lastIndexOf("/") ? rel.slice(dot).toLowerCase() : "";
        const segments = rel.split("/");
        if (segments.some((s) => SKIP_DIRS.test(s))) continue;
        const git = isGitPath(rel);
        const base = rel.split("/").pop() ?? "";
        if (!git && !SUPPORTED_EXTENSIONS.has(ext) && !MANIFEST_BASENAMES.has(base)) continue;
        // .git metadata rides along in its own budget (git churn/blame need it)
        if (git) {
          if (file.size > GIT_MAX_FILE_BYTES || gitBytes + file.size > GIT_MAX_TOTAL_BYTES) {
            skipped++;
            continue;
          }
          gitBytes += file.size;
        } else {
          if (file.size > MAX_FILE_BYTES) {
            skipped++;
            continue;
          }
          totalBytes += file.size;
          if (files.length >= MAX_FILES || totalBytes > MAX_TOTAL_BYTES) {
            setErrorMessage(
              `Analysis aborted — folder exceeds ${MAX_FILES} files / 40 MB. Exclude node_modules & build output and retry.`,
            );
            setState("error");
            return;
          }
        }
        try {
          const payload = await readPayload(file, rel);
          files.push({ path: rel, ...payload });
        } catch {
          skipped++; // unreadable (binary/permission) — the scanners don't need it
        }
        if (files.length % 50 === 0) {
          setAnalysisStage(`Reading files… ${files.length}`);
        }
      }
      if (files.length === 0) {
        setErrorMessage(
          "No analyzable source files in that folder (supported: ts, tsx, js, jsx, py, go, rs, java, rb, html, css, json, yaml)",
        );
        setState("error");
        return;
      }
      setCollected({ files: files.length, bytes: totalBytes });
      if (skipped > 0) {
        console.info(`CodeCity: skipped ${skipped} oversized/unreadable files`);
      }
      await uploadAndAnalyze(rootName, files);
    },
    [setAnalysisStage, uploadAndAnalyze],
  );

  /** Fallback for browsers without the File System Access API */
  const pickViaInputFallback = useCallback(() => {
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
        void collectFromFileList(fileList, rootName).finally(resolve);
      };
      input.oncancel = () => {
        input.remove();
        setState("idle");
        resolve();
      };
      document.body.appendChild(input);
      input.click();
    });
  }, [collectFromFileList]);

  const collectFromDirectoryHandle = useCallback(
    async (dir: DirHandle) => {
      const files: LocalFile[] = [];
      let totalBytes = 0;
      let gitBytes = 0;
      let skipped = 0;
      const walk = async (handle: DirHandle, prefix: string): Promise<void> => {
        for await (const entry of handle.values()) {
          if (cancelledRef.current) return;
          if (entry.kind === "directory") {
            if (SKIP_DIRS.test(entry.name)) continue;
            await walk(entry as unknown as DirHandle, `${prefix}${entry.name}/`);
            continue;
          }
          const rel = `${prefix}${entry.name}`;
          const dot = rel.lastIndexOf(".");
          const ext = dot > rel.lastIndexOf("/") ? rel.slice(dot).toLowerCase() : "";
          const base = entry.name;
          const git = isGitPath(rel);
          if (!git && !SUPPORTED_EXTENSIONS.has(ext) && !MANIFEST_BASENAMES.has(base)) continue;
          if (!git && (files.length >= MAX_FILES || totalBytes > MAX_TOTAL_BYTES)) {
            throw new FolderCollectionError(
              `Analysis aborted — folder exceeds ${MAX_FILES} files / 40 MB. Exclude node_modules & build output and retry.`,
            );
          }
          try {
            const file = await entry.getFile!();
            if (git) {
              if (file.size > GIT_MAX_FILE_BYTES || gitBytes + file.size > GIT_MAX_TOTAL_BYTES) {
                skipped++;
                continue;
              }
              gitBytes += file.size;
            } else {
              if (file.size > MAX_FILE_BYTES) {
                skipped++;
                continue;
              }
              totalBytes += file.size;
            }
            const payload = await readPayload(file, rel);
            files.push({ path: rel, ...payload });
            if (files.length % 50 === 0) {
              setAnalysisStage(`Reading files… ${files.length}`);
              setCollected({ files: files.length, bytes: totalBytes });
            }
          } catch {
            skipped++;
          }
        }
      };
      await walk(dir, "");
      if (cancelledRef.current) {
        setState("idle");
        return;
      }
      if (files.length === 0) {
        setErrorMessage(
          "No analyzable source files in that folder (supported: ts, tsx, js, jsx, py, go, rs, java, rb, html, css, json, yaml)",
        );
        setState("error");
        return;
      }
      setCollected({ files: files.length, bytes: totalBytes });
      if (skipped > 0) console.info(`CodeCity: skipped ${skipped} oversized/unreadable files`);
      await uploadAndAnalyze(dir.name, files);
    },
    [setAnalysisStage, uploadAndAnalyze],
  );

  const pickFolder = useCallback(async () => {
    if (stateRef.current === "collecting" || stateRef.current === "analyzing") return;
    cancelledRef.current = false;
    setState("collecting");
    setErrorMessage("");
    if (isDirHandlePickerAvailable()) {
      try {
        const picker = (
          window as unknown as { showDirectoryPicker?: (opts?: unknown) => Promise<DirHandle> }
        ).showDirectoryPicker;
        if (!picker) throw new Error("unsupported");
        const dir = await picker.call(window, { mode: "read" });
        await collectFromDirectoryHandle(dir);
      } catch (err) {
        // AbortError = user cancelled the native dialog
        if (err instanceof Error && err.name === "AbortError") {
          setState("idle");
          return;
        }
        // Collection failures (too large, unreadable) must surface as errors —
        // only a restricted/missing picker API falls back to the input
        if (err instanceof FolderCollectionError) {
          setErrorMessage(err.message);
          setState("error");
          return;
        }
        // Some Chromium builds restrict the API — fall back transparently
        await pickViaInputFallback();
      }
    } else {
      await pickViaInputFallback();
    }
  }, [collectFromDirectoryHandle, pickViaInputFallback]);

  const cancel = useCallback(() => {
    cancelledRef.current = true; // stops in-flight collection between files
    stopPolling();
    setState("idle");
    setAnalysisProgress(0);
    setAnalysisStage("");
  }, [setAnalysisProgress, setAnalysisStage, stopPolling]);

  const reset = useCallback(() => {
    setErrorMessage("");
    setState("idle");
  }, []);

  return {
    state,
    errorMessage,
    analysisProgress,
    analysisStage,
    collected,
    pickFolder,
    cancel,
    reset,
    isAnalyzing: state === "collecting" || state === "analyzing",
    supportsDirectoryPicker: isDirHandlePickerAvailable(),
  };
}
