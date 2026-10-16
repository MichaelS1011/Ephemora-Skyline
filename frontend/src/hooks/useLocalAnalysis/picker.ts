import type { DroppedFiles } from "../../city/types";
import type { AnalysisState } from "../useLocalAnalysis";

/**
 * The picker state machine, split out of `useLocalAnalysis.ts` (K3): the native
 * directory picker, the input fallback, and the timer that offers the fallback
 * while the native dialog is still open. The hook owns every state cell and
 * passes them in as `deps`; this module owns only the decisions. The run
 * identity (`runRef`) is what makes a late dialog answer inert — every branch
 * checks it before it writes to the screen.
 */

/** One entry a directory handle hands back: a file to read, or a folder to walk into. */
export type DirEntry = {
  name: string;
  kind: "file" | "directory";
  getFile?: () => Promise<File>;
};

export type DirHandle = {
  name: string;
  values: () => AsyncIterable<DirEntry>;
};

type Ref<T> = { current: T };

export function isDirHandlePickerAvailable(): boolean {
  return typeof (window as { showDirectoryPicker?: unknown }).showDirectoryPicker === "function";
}

/** Offer another picker after a wait; never expire a user's native dialog. */
const PICKER_ALTERNATIVE_DELAY_MS = 4_000;

export interface PickViaInputFallbackDeps {
  runRef: Ref<number>;
  inputCleanupRef: Ref<(() => void) | null>;
  stateRef: Ref<AnalysisState>;
  startedAtRef: Ref<number>;
  finishPicker: () => void;
  offerAlternativePicker: (
    run: number,
    key: "scan.pickerTimeout" | "scan.pickerUnavailable",
  ) => void;
  setState: (state: AnalysisState) => void;
  collectFromFileList: (fileList: File[], rootName: string, run: number) => Promise<void>;
  failCollection: (err: unknown, run: number) => void;
}

/** Called synchronously from a user action, never from a timer or rejection. */
export function pickViaInputFallback(deps: PickViaInputFallbackDeps, run: number): Promise<void> {
  if (deps.runRef.current !== run) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.setAttribute("webkitdirectory", "");
    input.setAttribute("directory", "");
    input.style.display = "none";
    let active = true;
    const detach = () => {
      active = false;
      input.onchange = null;
      input.oncancel = null;
      input.remove();
      deps.inputCleanupRef.current = null;
    };
    deps.inputCleanupRef.current = () => {
      detach();
      resolve();
    };
    const cancelled = () => {
      if (!active || deps.runRef.current !== run) return;
      detach();
      deps.runRef.current += 1;
      deps.finishPicker();
      deps.stateRef.current = "idle";
      deps.setState("idle");
      resolve();
    };
    input.onchange = () => {
      if (!active || deps.runRef.current !== run) return;
      const fileList = Array.from(input.files ?? []);
      if (fileList.length === 0) {
        cancelled();
        return;
      }
      const rootName = fileList[0]?.webkitRelativePath?.split("/")[0] ?? "local folder";
      detach();
      deps.finishPicker();
      deps.stateRef.current = "collecting";
      deps.setState("collecting");
      deps.startedAtRef.current = Date.now();
      void deps
        .collectFromFileList(fileList, rootName, run)
        .catch((err: unknown) => deps.failCollection(err, run))
        .finally(resolve);
    };
    input.oncancel = cancelled;
    document.body.appendChild(input);
    try {
      input.click();
    } catch {
      detach();
      deps.offerAlternativePicker(run, "scan.pickerUnavailable");
      resolve();
    }
  });
}

export interface PickFolderDeps {
  stateRef: Ref<AnalysisState>;
  runRef: Ref<number>;
  cancelledRef: Ref<boolean>;
  jobIdRef: Ref<string | null>;
  stageRef: Ref<string | null>;
  budgetWaitRef: Ref<number>;
  elapsedRef: Ref<number>;
  waitingRef: Ref<boolean>;
  startedAtRef: Ref<number>;
  abortRef: Ref<AbortController | null>;
  pickerTimerRef: Ref<ReturnType<typeof setTimeout> | null>;
  finishPicker: () => void;
  offerAlternativePicker: (
    run: number,
    key: "scan.pickerTimeout" | "scan.pickerUnavailable",
  ) => void;
  pickViaInputFallback: (run: number) => Promise<void>;
  collectFromDirectoryHandle: (dir: DirHandle, run: number) => Promise<void>;
  failCollection: (err: unknown, run: number) => void;
  setBudgetWaitSec: (n: number) => void;
  setElapsedSec: (n: number) => void;
  setNotice: (s: string) => void;
  setErrorMessage: (s: string) => void;
  setErrorDetail: (s: string) => void;
  setDropped: (d: DroppedFiles | null) => void;
  setCollected: (c: { files: number; bytes: number; total: number }) => void;
  setFoundFiles: (n: number) => void;
  setState: (state: AnalysisState) => void;
  setAnalysisStage: (s: string) => void;
  setStageOf: (raw: string | null) => void;
}

/**
 * Start one pick: retire the previous run, reset every clock and counter, then
 * open the native dialog with the timeout offer behind it, or the input
 * fallback where the native dialog does not exist.
 */
export async function pickFolder(deps: PickFolderDeps): Promise<void> {
  if (["picking", "collecting", "analyzing"].includes(deps.stateRef.current)) return;
  const run = ++deps.runRef.current;
  deps.finishPicker();
  deps.cancelledRef.current = false;
  deps.jobIdRef.current = null;
  deps.stageRef.current = null;
  deps.budgetWaitRef.current = 0;
  deps.elapsedRef.current = 0;
  deps.waitingRef.current = false;
  deps.setBudgetWaitSec(0);
  deps.setElapsedSec(0);
  deps.setNotice("");
  deps.setErrorMessage("");
  deps.setErrorDetail("");
  deps.setDropped(null);
  deps.setCollected({ files: 0, bytes: 0, total: 0 });
  deps.setFoundFiles(0);
  deps.startedAtRef.current = Date.now();
  deps.abortRef.current = new AbortController();
  deps.stateRef.current = "picking";
  deps.setState("picking");
  deps.setAnalysisStage("");
  deps.setStageOf(null);
  if (!isDirHandlePickerAvailable()) {
    await deps.pickViaInputFallback(run);
    return;
  }
  deps.pickerTimerRef.current = setTimeout(() => {
    if (deps.runRef.current !== run) return;
    deps.pickerTimerRef.current = null;
    deps.offerAlternativePicker(run, "scan.pickerTimeout");
  }, PICKER_ALTERNATIVE_DELAY_MS);
  let picked: DirHandle;
  try {
    const picker = (
      window as unknown as { showDirectoryPicker?: (opts?: unknown) => Promise<DirHandle> }
    ).showDirectoryPicker;
    if (!picker) throw new Error("unsupported");
    picked = await picker.call(window, { mode: "read" });
  } catch (err) {
    if (deps.runRef.current !== run) return;
    deps.finishPicker();
    // DOMException need not inherit Error (including across realms).
    if (err && typeof err === "object" && "name" in err && err.name === "AbortError") {
      deps.runRef.current += 1;
      deps.stateRef.current = "idle";
      deps.setState("idle");
      return;
    }
    deps.offerAlternativePicker(run, "scan.pickerUnavailable");
    return;
  }
  if (deps.runRef.current !== run) return;
  deps.finishPicker();
  deps.stateRef.current = "collecting";
  deps.setState("collecting");
  deps.startedAtRef.current = Date.now();
  await deps
    .collectFromDirectoryHandle(picked, run)
    .catch((err: unknown) => deps.failCollection(err, run));
}
