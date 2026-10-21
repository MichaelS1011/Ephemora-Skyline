// @vitest-environment jsdom
/**
 * The folder's own .gitignore decides what is project source — before anything
 * is counted against the file cap.
 *
 * Measured on this repository on 2026-10-12, with the walk rules the shipped
 * client carries: a scan of its own folder offered 17,360 source-shaped files
 * and 262 MB, of which 16,968 sat in local tooling folders the
 * project's .gitignore sets aside; the project itself is 392 files and 3.4 MB.
 * The backend already skipped those paths, so the cap refused a folder for
 * files the scan would never have read. These checks hold the two pickers to
 * the same answer, because a folder that costs 31 s of reading in one picker
 * and nothing in the other is a defect with two faces.
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

/** Every file the run opened — an ignored folder must add nothing to it. */
let opened: string[] = [];

function fakeFile(name: string, content = "const x = 1;\n"): FakeFile {
  return {
    name,
    size: content.length,
    text: async () => {
      opened.push(name);
      return content;
    },
    arrayBuffer: async () => new TextEncoder().encode(content).buffer,
  };
}

type Entry =
  | { kind: "file"; name: string; content?: string }
  | { kind: "directory"; name: string; children: Entry[] };

function file(name: string, content?: string): Entry {
  return { kind: "file", name, ...(content === undefined ? {} : { content }) };
}
function sub(name: string, children: Entry[]): Entry {
  return { kind: "directory", name, children };
}

/** A File System Access directory handle over a tree, as far as the hook uses it */
function handleOf(rootName: string, children: Entry[]): unknown {
  const gen = (entries: Entry[], at: string): AsyncGenerator<unknown> =>
    (async function* () {
      for (const entry of entries) {
        if (entry.kind === "directory") {
          yield {
            kind: "directory",
            name: entry.name,
            values: () => gen(entry.children, `${at}/${entry.name}`),
          };
          continue;
        }
        yield {
          kind: "file",
          name: entry.name,
          getFile: async () =>
            fakeFile(`${at}/${entry.name}`, entry.content) as unknown as FakeFile,
        };
      }
    })();
  return { name: rootName, values: () => gen(children, rootName) };
}

/**
 * The same tree as the flat list the fallback picker arrives with.
 * `webkitRelativePath` keeps its root segment — the reader strips it, the way it
 * does for a folder chosen in a real browser.
 */
function flatOf(entries: Entry[], root = "repo"): ChosenFile[] {
  const out: ChosenFile[] = [];
  const walk = (list: Entry[], at: string): void => {
    for (const e of list) {
      if (e.kind === "directory") {
        walk(e.children, `${at}/${e.name}`);
        continue;
      }
      const full = `${at}/${e.name}`;
      out.push(Object.assign(fakeFile(full, e.content), { webkitRelativePath: full }));
    }
  };
  walk(entries, root);
  return out;
}

let calls: { url: string; body?: string }[] = [];
let responses: Record<string, () => unknown> = {};

function installFetch(): void {
  calls = [];
  responses = { "/api/analyze-local": () => ({ id: "job-1", statusUrl: "/api/status/job-1" }) };
  vi.stubGlobal("fetch", async (url: string, init?: { method?: string; body?: string }) => {
    const call = { url, body: init?.body };
    calls.push(call);
    const make = responses[url] ?? responses["*"];
    if (!make) throw new Error(`unmocked fetch: ${url}`);
    const payload = make();
    return {
      ok: true,
      status: 202,
      headers: new Headers(),
      json: async () => payload,
    };
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

function fallbackInput(): HTMLInputElement {
  const input = document.querySelector("input[webkitdirectory]");
  if (!(input instanceof HTMLInputElement)) throw new Error("no fallback input was created");
  return input;
}

/**
 * Wait until the run answered — with an upload, a refusal, or an error. A fixed
 * sleep is what made the 10,000-file case look broken: the classification had
 * not finished inside it.
 */
async function settle(timeoutMs = 8000): Promise<void> {
  await act(async () => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (calls.length > 0 || (latest.state && latest.state !== "collecting")) return;
      await wait(20);
    }
    throw new Error(`the run never settled: state ${latest.state}, error ${latest.errorMessage}`);
  });
}

/** Run through the browser's own file input (no native picker in this browser) */
async function pickFlat(files: ChosenFile[]): Promise<void> {
  await act(async () => {
    void latest.pickFolder();
    await wait(0);
  });
  const input = fallbackInput();
  await act(async () => {
    Object.defineProperty(input, "files", { value: files });
    input.onchange?.(new Event("change"));
  });
  await settle();
}

/** Run through showDirectoryPicker */
async function pickTree(children: Entry[]): Promise<void> {
  vi.stubGlobal("showDirectoryPicker", async () => handleOf("repo", children));
  await act(async () => {
    void latest.pickFolder();
  });
  await settle();
}

/** The upload the run ended with, as the screen would have sent it */
function uploadBody(): { files: { path: string }[]; dropped: Record<string, number> } | null {
  const call = calls.find((c) => c.url.includes("/api/analyze-local"));
  return call?.body ? (JSON.parse(call.body) as never) : null;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  opened = [];
  localStorage.clear();
  useStore.setState({
    cityData: null,
    analysisStage: "",
    analysisProgress: 0,
    analysisId: null,
    prefs: { ...useStore.getState().prefs, lang: "de" },
  });
  delete (window as { showDirectoryPicker?: unknown }).showDirectoryPicker;
  installFetch();
  mount();
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

/**
 * `generated/` and not `build/`: a folder named build, dist or out is skipped by
 * the reader's own list before any rule is consulted, so this file tests the
 * project's rules on a name that is not already taken.
 */
const TREE: Entry[] = [
  file(".gitignore", "generated/\n*.log\n"),
  sub("src", [file("a.ts")]),
  sub("generated", [file("app.js"), file("chunk.js")]),
  file("x.log", "trace\n"),
];

describe("the project's own .gitignore is honoured before counting", () => {
  it("reads only what the rules leave, through the native picker", async () => {
    await pickTree(TREE);
    const body = uploadBody();
    expect(body, "no upload was sent").not.toBeNull();
    expect(body!.files.map((f) => f.path).sort()).toEqual([".gitignore", "src/a.ts"]);
    expect(body!.dropped.gitIgnored).toBe(2);
  });

  it("never lists the inside of a folder the rules set aside", async () => {
    await pickTree(TREE);
    expect(
      opened.filter((n) => n.includes("generated/")),
      "an ignored folder was walked anyway",
    ).toEqual([]);
  });

  it("answers the same numbers through the fallback picker", async () => {
    await pickFlat(flatOf(TREE));
    const body = uploadBody();
    expect(body!.files.map((f) => f.path).sort()).toEqual([".gitignore", "src/a.ts"]);
    expect(body!.dropped.gitIgnored).toBe(2);
  });

  it("brings a path back when the project negates its own rule", async () => {
    // `generated/*` names the contents, so the folder itself is walked and the
    // `!` line can reach one file inside it.
    const tree: Entry[] = [
      file(".gitignore", "generated/*\n!generated/keep.js\n"),
      sub("generated", [file("keep.js"), file("app.js")]),
    ];
    await pickTree(tree);
    const body = uploadBody();
    expect(body!.files.map((f) => f.path).sort()).toEqual([".gitignore", "generated/keep.js"]);
  });

  it("does not let a negation out of a folder the rules excluded whole", async () => {
    // git's own rule, mirrored: once `generated/` is excluded, nothing inside it
    // is looked at, so `!generated/keep.js` re-includes nothing. The picker must
    // not promise a file the backend would never stage.
    const tree: Entry[] = [
      file(".gitignore", "generated/\n!generated/keep.js\n"),
      sub("generated", [file("keep.js")]),
      file("one.ts"),
    ];
    await pickTree(tree);
    const body = uploadBody();
    expect(body!.files.map((f) => f.path).sort()).toEqual([".gitignore", "one.ts"]);
  });

  /**
   * The case that made this change: 10,001 files under a folder the project
   * ignores, four real source files. It used to be refused at the wall; the wall
   * was counting files the scan had already decided not to read.
   */
  it("accepts a folder whose overflow lives in an ignored folder", async () => {
    const noisy: ChosenFile[] = flatOf([
      file(".gitignore", "scratch/\n"),
      sub(
        "scratch",
        Array.from({ length: 10_001 }, (_, i) => file(`f${i}.ts`)),
      ),
      file("one.ts"),
      file("two.ts"),
      file("three.ts"),
    ]);
    await pickFlat(noisy);
    const body = uploadBody();
    expect(body, "the run stopped at the cap instead of uploading").not.toBeNull();
    expect(body!.files.filter((f) => !f.path.startsWith("scratch/")).length).toBe(4);
    expect(body!.dropped.gitIgnored).toBe(1);
    expect(latest.errorMessage, latest.errorMessage).toBe("");
  });

  it("opens a dense folder as a preview and names the files it left out", async () => {
    const dense: ChosenFile[] = [
      Object.assign(fakeFile("repo/.gitignore", "notes/\n"), {
        webkitRelativePath: "repo/.gitignore",
      }),
      ...Array.from({ length: 10_001 }, (_, i) =>
        Object.assign(fakeFile(`repo/src/f${i}.ts`), {
          webkitRelativePath: `repo/src/f${i}.ts`,
        }),
      ),
    ];
    await pickFlat(dense);
    const body = uploadBody();
    expect(body, "the preview sample was not uploaded").not.toBeNull();
    expect(body!.files.length).toBe(2_000);
    expect(body!.dropped.preview).toBe(8_002);
    expect(latest.errorMessage, latest.errorMessage).toBe("");
  });
});
