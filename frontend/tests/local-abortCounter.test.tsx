// @vitest-environment jsdom
/**
 * The local scan flow, measured where the audit measured it:
 *
 * — an abort ends the run: the upload carries the signal, and after the click
 *   nothing polls, nothing loads a city, nothing takes over the screen;
 * — the folder is counted while it is read, the same way in both pickers;
 * — the 3000-file wall answers with the number it found, before opening a file;
 * — files that leave the scan do so as a counted bucket that travels with the
 *   upload, and the exclude folders travel with the scan config;
 * — a closed read budget is a wait the user can see.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useLocalAnalysis } from "../src/hooks/useLocalAnalysis";
import { useStore } from "../src/stores/useStore";

type HookValue = ReturnType<typeof useLocalAnalysis>;

interface FakeFile {
  name: string;
  size: number;
  text: () => Promise<string>;
  arrayBuffer: () => Promise<ArrayBuffer>;
}

type ChosenFile = FakeFile & { webkitRelativePath: string };

const reads: string[] = [];

function fakeFile(name: string, content = "const x = 1;\n"): FakeFile {
  return {
    name,
    size: content.length,
    text: async () => {
      reads.push(name);
      return content;
    },
    arrayBuffer: async () => new TextEncoder().encode(content).buffer,
  };
}

const withPath = (name: string, content?: string): ChosenFile =>
  Object.assign(fakeFile(name, content), { webkitRelativePath: `repo/${name}` });

const many = (n: number): ChosenFile[] => Array.from({ length: n }, (_, i) => withPath(`f${i}.ts`));

/** A File System Access directory handle, as far as the hook uses it */
function fakeDir(name: string, fileNames: string[]): unknown {
  return {
    name,
    values: () => {
      async function* gen(): AsyncGenerator<unknown> {
        for (const fileName of fileNames) {
          yield {
            kind: "file",
            name: fileName,
            getFile: async () => fakeFile(fileName) as never,
          };
        }
      }
      return gen();
    },
  };
}

interface FetchCall {
  url: string;
  method: string;
  signal?: AbortSignal;
  body?: string;
}

let calls: FetchCall[] = [];
let responses: Record<string, (call: FetchCall) => unknown> = {};

function fakeResponse(status: number, payload: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => payload,
  };
}

function installFetch(): void {
  calls = [];
  vi.stubGlobal(
    "fetch",
    async (url: string, init?: { method?: string; signal?: AbortSignal; body?: string }) => {
      const call: FetchCall = {
        url,
        method: init?.method ?? "GET",
        signal: init?.signal,
        body: init?.body,
      };
      calls.push(call);
      const make = responses[url] ?? responses["*"];
      if (!make) throw new Error(`unmocked fetch: ${url}`);
      // awaited, so a hanging upload (a promise) really stays pending
      return await make(call);
    },
  );
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

const urlOf = (needle: string): FetchCall | undefined => calls.find((c) => c.url.includes(needle));
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** The input the app builds for browsers without the native picker */
function fallbackInput(): HTMLInputElement {
  const input = document.querySelector("input[webkitdirectory]");
  if (!(input instanceof HTMLInputElement)) throw new Error("no fallback input was created");
  return input;
}

/** Start a run and answer its picker with a folder */
async function pick(files: ChosenFile[], holdMs = 20): Promise<void> {
  await act(async () => {
    void latest.pickFolder();
    await wait(0);
  });
  const input = fallbackInput();
  await act(async () => {
    Object.defineProperty(input, "files", { value: files });
    input.onchange?.(new Event("change"));
    await wait(holdMs);
  });
}

/** Start a run on the File System Access path, through a fake handle */
async function pickHandle(fileNames: string[], holdMs = 20): Promise<void> {
  vi.stubGlobal("showDirectoryPicker", async () => fakeDir("repo", fileNames));
  await act(async () => {
    void latest.pickFolder();
    await wait(holdMs);
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  reads.length = 0;
  responses = {};
  localStorage.clear();
  useStore.setState({
    cityData: null,
    analysisStage: "",
    analysisProgress: 0,
    analysisId: null,
    prefs: { ...useStore.getState().prefs, lang: "de" },
  });
  // no native picker → the app builds its own webkitdirectory input
  delete (window as { showDirectoryPicker?: unknown }).showDirectoryPicker;
  installFetch();
  mount();
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("an abort aborts", () => {
  it("carries a real signal into the upload and never takes the screen over", async () => {
    let releaseUpload: (v: unknown) => void = () => {};
    responses["/api/analyze-local"] = () =>
      new Promise((resolve) => {
        releaseUpload = resolve;
      });

    await pick([withPath("a.ts"), withPath("b.ts")], 0);

    const upload = urlOf("/api/analyze-local");
    expect(upload, "no upload was started").toBeDefined();
    expect(upload!.signal, "the upload was sent without an abort signal").toBeInstanceOf(
      AbortSignal,
    );

    await act(async () => {
      latest.cancel();
    });
    expect(upload!.signal!.aborted).toBe(true);

    // the server answers the aborted upload late — the run belongs to no screen
    await act(async () => {
      releaseUpload(fakeResponse(202, { id: "job-late" }));
      await wait(60);
    });
    expect(urlOf("/api/status/"), "polling started after the abort").toBeUndefined();
    expect(urlOf("/api/result/"), "a city loaded after the abort").toBeUndefined();
    expect(useStore.getState().cityData).toBeNull();
    expect(latest.state).toBe("idle");
    expect(latest.notice).toBe("Abgebrochen — nichts läuft weiter");
  });

  it("tells the server to throw the job away once it has an id", async () => {
    responses["/api/analyze-local"] = () => fakeResponse(202, { id: "job-7" });
    responses["/api/status/job-7"] = () => fakeResponse(200, { status: "analyzing", progress: 30 });
    responses["*"] = () => fakeResponse(200, {});

    await pick([withPath("a.ts")], 2100);
    expect(urlOf("/api/status/job-7"), "the scan was never polled").toBeDefined();

    await act(async () => {
      latest.cancel();
      await wait(20);
    });
    const cancel = urlOf("/api/analyze-local/job-7/cancel");
    expect(cancel, "the server was not told about the abort").toBeDefined();
    expect(cancel!.method).toBe("POST");
    const polled = calls.filter((c) => c.url.includes("/api/status/")).length;
    await act(async () => {
      await wait(2200);
    });
    expect(calls.filter((c) => c.url.includes("/api/status/")).length, "polling continued").toBe(
      polled,
    );
    expect(useStore.getState().cityData).toBeNull();
  });

  it("shows the read budget as a wait, not as a bar that froze", async () => {
    responses["/api/analyze-local"] = () => fakeResponse(202, { id: "job-8" });
    let firstStatus = true;
    responses["/api/status/job-8"] = () => {
      if (firstStatus) {
        firstStatus = false;
        return fakeResponse(429, { code: "rate_limited", retryAfterSeconds: 3 });
      }
      return fakeResponse(200, {
        status: "analyzing",
        progress: 88,
        stage: "Deep scan (semgrep + gitleaks)",
      });
    };

    await pick([withPath("a.ts")], 2100);

    expect(latest.analysisStage).toContain("Warte auf das Lesebudget");
    expect(latest.budgetWaitSec).toBeGreaterThan(0);
    // the waiting line stays German: no raw server word reaches the screen
    expect(latest.analysisStage).not.toMatch(/Deep scan|Waiting|Uploading files/);
    // and the wait carries a number, so the bar is not standing still
    expect(latest.analysisStage).toMatch(/\d+ s/);
  });
});

describe("reading a folder counts", () => {
  const counting = (): { seen: string[]; stop: () => void } => {
    const seen: string[] = [];
    // one entry per *movement* of the counter: the store fires its listeners on
    // every write, a repeated line is not a step
    let last = "";
    const unsubscribe = useStore.subscribe((s) => {
      if (/Dateien gelesen/.test(s.analysisStage) && s.analysisStage !== last) {
        last = s.analysisStage;
        seen.push(s.analysisStage);
      }
    });
    return { seen, stop: unsubscribe };
  };

  it("moves the counter in the webkitdirectory path", async () => {
    responses["/api/analyze-local"] = () => fakeResponse(202, { id: "job-1" });
    responses["*"] = () => fakeResponse(200, {});
    const counter = counting();

    await pick(many(60), 60);
    counter.stop();

    expect(counter.seen.map((line) => /^([\d.]+)/.exec(line)?.[1])).toEqual(["25", "50", "60"]);
    expect(latest.collected.files).toBe(60);
    expect(latest.collected.total).toBe(60);
  });

  it("moves the counter the same way in the File System Access path", async () => {
    responses["/api/analyze-local"] = () => fakeResponse(202, { id: "job-1" });
    responses["*"] = () => fakeResponse(200, {});
    const counter = counting();

    await pickHandle(
      Array.from({ length: 60 }, (_, i) => `f${i}.ts`),
      120,
    );
    counter.stop();

    expect(counter.seen.map((line) => /^([\d.]+)/.exec(line)?.[1])).toEqual(["25", "50", "60"]);
    expect(latest.collected.files).toBe(60);
  });

  it("answers the file wall with the found number, before opening a file", async () => {
    let uploaded = false;
    responses["*"] = () => {
      uploaded = true;
      return fakeResponse(202, { id: "never" });
    };

    await pick(many(10_001), 120);

    expect(latest.state).toBe("error");
    expect(latest.errorMessage).toContain("10.001 Quelldateien gefunden, Grenze ist 10.000");
    expect(latest.errorMessage).toContain("Ordner ausschließen statt aufgeben");
    expect(reads.length, `${reads.length} files were read before the wall answered`).toBe(0);
    expect(uploaded, "an upload was started for a folder over the cap").toBe(false);
    expect(latest.foundFiles).toBe(10_001);
  });

  it("counts the paths the scan cannot take, and sends the number along", async () => {
    let body: Record<string, unknown> | undefined;
    responses["/api/analyze-local"] = (call) => {
      body = JSON.parse(String(call.body)) as Record<string, unknown>;
      return fakeResponse(202, { id: "job-2" });
    };
    responses["*"] = () => fakeResponse(200, {});
    localStorage.setItem("codecity-scan-excludes", JSON.stringify(["generated"]));

    const deep = `${"x".repeat(520)}.ts`;
    await pick(
      [
        withPath("a.ts"),
        Object.assign(fakeFile("schema.ts"), {
          webkitRelativePath: "repo/generated/schema.ts",
        }),
        Object.assign(fakeFile(deep), { webkitRelativePath: `repo/src/${deep}` }),
      ],
      40,
    );

    const dropped = body?.["dropped"] as Record<string, number>;
    expect(dropped.pathTooLong).toBe(1);
    expect(dropped.excluded).toBe(1);
    expect(latest.dropped?.pathTooLong).toBe(1);
    expect(body?.["files"]).toEqual([{ path: "a.ts", content: "const x = 1;\n" }]);
    expect(latest.collected.total).toBe(1);
  });

  it("sends the exclude folders with the scan config", async () => {
    let body: Record<string, unknown> | undefined;
    responses["/api/analyze-local"] = (call) => {
      body = JSON.parse(String(call.body)) as Record<string, unknown>;
      return fakeResponse(202, { id: "job-3" });
    };
    responses["*"] = () => fakeResponse(200, {});
    localStorage.setItem("codecity-scan-excludes", JSON.stringify(["fixtures", "gen"]));

    await pick([withPath("a.ts")], 40);

    expect((body?.["config"] as Record<string, unknown>).excludePaths).toEqual(["fixtures", "gen"]);
  });
});
