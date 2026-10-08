// @vitest-environment jsdom
/**
 * Five abort timings, one claim: after the click nothing takes the screen over.
 *
 * The audit measured one abort and got a city 78 s later (`bericht.md` D1). The
 * matrix below aborts at each point of the run — while reading, during the
 * upload, during the first poll, during the deep scan, and while the city
 * payload is already on its way — and counts the takeovers. Signal, fetch and
 * polling are the real ones; only the server is substituted.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useLocalAnalysis } from "../src/hooks/useLocalAnalysis";
import { useStore } from "../src/stores/useStore";
import type { CityData } from "../src/city/types";

type HookValue = ReturnType<typeof useLocalAnalysis>;

interface FakeFile {
  name: string;
  size: number;
  text: () => Promise<string>;
  arrayBuffer: () => Promise<ArrayBuffer>;
}

type ChosenFile = FakeFile & { webkitRelativePath: string };

const readCalls: string[] = [];

function fakeFile(name: string, hang?: (release: () => void) => void): FakeFile {
  const gate = new Promise<void>((resolve) => {
    if (hang) hang(resolve);
    else resolve();
  });
  return {
    name,
    size: 14,
    text: async () => {
      readCalls.push(name);
      await gate;
      return "const x = 1;\n";
    },
    arrayBuffer: async () => new TextEncoder().encode("const x = 1;\n").buffer,
  };
}

const withPath = (file: FakeFile): ChosenFile =>
  Object.assign(file, { webkitRelativePath: `repo/${file.name}` });

interface Call {
  url: string;
  method: string;
  signal?: AbortSignal;
}

let calls: Call[] = [];
let statusReplies: Array<() => unknown> = [];
let uploadGate: (() => void) | null = null;
let cityGate: (() => void) | null = null;

function response(status: number, payload: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => payload,
  };
}

function deferred<T>(value: () => T): { promise: Promise<T>; release: () => void } {
  let release: () => void = () => {};
  const promise = new Promise<T>((resolve) => {
    release = () => resolve(value());
  });
  return { promise, release };
}

function installFetch(): void {
  calls = [];
  statusReplies = [];
  vi.stubGlobal("fetch", async (url: string, init?: { method?: string; signal?: AbortSignal }) => {
    const call: Call = { url, method: init?.method ?? "GET", signal: init?.signal };
    calls.push(call);
    if (call.signal?.aborted) throw Object.assign(new Error("aborted"), { name: "AbortError" });
    if (url === "/api/analyze-local") {
      const d = deferred(() => response(202, { id: "job-x" }));
      uploadGate = d.release;
      return d.promise;
    }
    if (url.startsWith("/api/status/")) {
      const next = statusReplies.shift();
      return response(
        200,
        next ? next() : { status: "analyzing", progress: 30, stage: "Parsing files" },
      );
    }
    if (url.startsWith("/api/result/")) {
      const city = {
        analysisId: "job-x",
        repo: { owner: "local", name: "repo", branch: "local" },
        totalFiles: 2,
        renderedFiles: 2,
        fileConnections: [],
        dirConnections: [],
        tree: { name: "repo", path: "", children: [], detailFiles: [], districtFiles: [] },
        findingsBySeverity: { P0: 0, P1: 0, P2: 0 },
        threatScore: 0,
        languages: {},
        meta: {},
      } as unknown as CityData;
      const d = deferred(() => response(200, city));
      cityGate = d.release;
      return d.promise;
    }
    return response(200, {});
  });
}

let host: HTMLDivElement;
let root: Root;
let latest: HookValue;

function mount(): void {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  function Probe(): null {
    latest = useLocalAnalysis();
    return null;
  }
  act(() => {
    root.render(<Probe />);
  });
}

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const countOf = (needle: string): number => calls.filter((c) => c.url.includes(needle)).length;
const tookOverTheScreen = (): boolean =>
  useStore.getState().cityData !== null || window.location.search.includes("city=");

async function choose(files: ChosenFile[]): Promise<void> {
  await act(async () => {
    void latest.pickFolder();
    await wait(0);
  });
  const input = document.querySelector("input[webkitdirectory]");
  if (!(input instanceof HTMLInputElement)) throw new Error("no fallback input was created");
  await act(async () => {
    Object.defineProperty(input, "files", { value: files });
    input.onchange?.(new Event("change"));
    await wait(10);
  });
}

async function cancelNow(): Promise<void> {
  await act(async () => {
    latest.cancel();
    await wait(10);
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  readCalls.length = 0;
  uploadGate = null;
  cityGate = null;
  localStorage.clear();
  useStore.setState({
    cityData: null,
    analysisStage: "",
    analysisProgress: 0,
    analysisId: null,
    prefs: { ...useStore.getState().prefs, lang: "de" },
  });
  window.history.replaceState(null, "", "/");
  delete (window as { showDirectoryPicker?: unknown }).showDirectoryPicker;
  installFetch();
  mount();
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

/** Every case: cancel, then let the server answer late, then look for a takeover */
async function abortRun(
  point: "reading" | "upload" | "firstPoll" | "deepScan" | "cityFetch",
): Promise<{
  pollsAfterCancel: number;
  resultFetches: number;
}> {
  if (point === "reading") {
    // Declared as a function, not as `(() => void) | null`: a local `let` that is
    // only assigned inside a callback keeps the `null` narrowing at the call
    // site, and the call would be a type error instead of a proof. The
    // placeholder fails loudly if the run never reaches the second read.
    let releaseSecond: () => void = () => {
      throw new Error("the second read never started — the abort point moved");
    };
    const files = [
      withPath(fakeFile("a.ts")),
      withPath(
        fakeFile("b.ts", (release) => {
          releaseSecond = release;
        }),
      ),
      withPath(fakeFile("c.ts")),
    ];
    await choose(files);
    expect(readCalls.length, "the read never started").toBeGreaterThan(0);
    await cancelNow();
    releaseSecond();
    uploadGate?.();
    await act(async () => {
      await wait(120);
    });
  } else if (point === "upload") {
    await choose([withPath(fakeFile("a.ts")), withPath(fakeFile("b.ts"))]);
    expect(countOf("/api/analyze-local"), "the upload never started").toBe(1);
    await cancelNow();
    uploadGate?.(); // the server answers the aborted request late
    await act(async () => {
      await wait(120);
    });
  } else {
    statusReplies =
      point === "firstPoll"
        ? [() => ({ status: "analyzing", progress: 30, stage: "Parsing files" })]
        : point === "deepScan"
          ? [
              () => ({ status: "analyzing", progress: 45, stage: "Parsing files" }),
              () => ({
                status: "analyzing",
                progress: 88,
                stage: "Deep scan (semgrep + gitleaks)",
              }),
            ]
          : [
              () => ({
                status: "analyzing",
                progress: 88,
                stage: "Deep scan (semgrep + gitleaks)",
              }),
              () => ({ status: "complete", progress: 100, stage: "Complete" }),
            ];
    await choose([withPath(fakeFile("a.ts"))]);
    uploadGate?.();
    const pollsBefore = point === "cityFetch" ? 3 : point === "deepScan" ? 2 : 1;
    await act(async () => {
      await wait(pollsBefore * 2100);
    });
    const pollsAtCancel = countOf("/api/status/");
    await cancelNow();
    // late answers: the city payload would be the takeover
    cityGate?.();
    await act(async () => {
      await wait(2400);
    });
    return {
      pollsAfterCancel: countOf("/api/status/") - pollsAtCancel,
      resultFetches: countOf("/api/result/"),
    };
  }
  return {
    pollsAfterCancel: countOf("/api/status/"),
    resultFetches: countOf("/api/result/"),
  };
}

describe("five abort timings", () => {
  const points = ["reading", "upload", "firstPoll", "deepScan", "cityFetch"] as const;

  it.each(points)(
    "aborts during %s and never hands the screen to a city",
    async (point) => {
      const result = await abortRun(point);
      expect(tookOverTheScreen(), `${point}: a city took the screen over`).toBe(false);
      expect(result.pollsAfterCancel, `${point}: polling continued`).toBe(0);
      expect(latest.state, `${point}: the UI is not idle`).toBe("idle");
      expect(latest.notice).toBe("Abgebrochen — nichts läuft weiter");
      expect(latest.analysisStage).toBe("");
    },
    // the polling cases wait over real 2 s poll intervals
    30000,
  );

  it("tells the server to discard the job, once per run", async () => {
    statusReplies = [
      () => ({ status: "analyzing", progress: 88, stage: "Deep scan (semgrep + gitleaks)" }),
    ];
    await choose([withPath(fakeFile("a.ts"))]);
    uploadGate?.();
    await act(async () => {
      await wait(2200);
    });
    await cancelNow();
    const cancels = calls.filter((c) => c.url === "/api/analyze-local/job-x/cancel");
    expect(cancels.length).toBe(1);
    expect(cancels[0]!.method).toBe("POST");
    expect(tookOverTheScreen()).toBe(false);
  });

  it("never sends an upload without a signal, and aborts it on the click", async () => {
    await choose([withPath(fakeFile("a.ts"))]);
    const upload = calls.find((c) => c.url === "/api/analyze-local");
    expect(upload!.signal).toBeInstanceOf(AbortSignal);
    expect(upload!.signal!.aborted).toBe(false);
    await cancelNow();
    expect(upload!.signal!.aborted).toBe(true);
  });
});
