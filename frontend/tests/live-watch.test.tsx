// @vitest-environment jsdom
/**
 * The live watch loop, measured where it can lie:
 * — the manifest covers every analyzed path, while `files` carries only what
 *   changed — an unchanged file must never be re-read or re-analyzed;
 * — a deleted path leaves the manifest, so its findings leave the city;
 * — a stopped session cannot write into a screen that moved on;
 * — the permanent band says, in plain words, that external engines are stale.
 */
import { webcrypto } from "node:crypto";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HudOverlay } from "../src/components/HudOverlay";
import { useStore } from "../src/stores/useStore";
import { sha256Hex } from "../src/live/files";
import {
  pauseLiveSession,
  resetLiveForTests,
  resumeLiveSession,
  startLiveSession,
  stopLiveSession,
} from "../src/live/session";
import { EMPTY_LIVE_STATE, type LiveFileMeta, type PendingLiveScan } from "../src/live/types";
import type { CityData } from "../src/city/types";
import type { DirEntry, DirHandle } from "../src/hooks/useLocalAnalysis/picker";
import { city as cityOf, file as fileOf, provenance } from "./helpers/cityFixture";

const ID = "11111111-2222-4333-8444-555555555555";

// jsdom ships a Crypto object without SubtleCrypto; the browser on 127.0.0.1
// has it, and the live path refuses to run without it.
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto as unknown as Crypto,
    configurable: true,
  });
}

type Node = { kind: "file"; file: File } | { kind: "dir"; children: Map<string, Node> };

function file(content: string, mtime: number): File {
  const created = new File([content], "f.ts", { lastModified: mtime, type: "text/typescript" });
  // jsdom's File predates arrayBuffer(); a browser has it. The live path reads
  // bytes, so the fixture provides the same method rather than a weaker one.
  if (typeof created.arrayBuffer !== "function") {
    Object.defineProperty(created, "arrayBuffer", {
      value: async () => new TextEncoder().encode(content).buffer,
    });
  }
  return created;
}

function handleOf(children: Map<string, Node>, name = "fixture"): DirHandle {
  return {
    name,
    values: async function* () {
      for (const [entryName, node] of children) {
        if (node.kind === "dir") {
          const child = handleOf(node.children, entryName);
          yield { name: entryName, kind: "directory", values: child.values } as unknown as DirEntry;
        } else {
          yield {
            name: entryName,
            kind: "file",
            getFile: async () => node.file,
          } as DirEntry;
        }
      }
    },
  };
}

function sha(content: string): Promise<string> {
  return sha256Hex(new TextEncoder().encode(content).buffer as ArrayBuffer);
}

async function meta(path: string, content: string, mtime: number): Promise<LiveFileMeta> {
  return {
    path,
    sha: await sha(content),
    size: new TextEncoder().encode(content).byteLength,
    mtime,
  };
}

function response(body: unknown, status = 200): Response {
  return {
    ok: status < 400,
    status,
    json: async () => body,
    headers: { get: () => null },
  } as unknown as Response;
}

const liveCalls: Array<{
  manifest: Array<{ path: string; sha: string }>;
  files: Array<{ path: string; content: string }>;
}> = [];

const city = (): CityData =>
  cityOf({
    analysisId: ID,
    files: [fileOf("src/a.ts", "TypeScript", [], undefined, { linesOfCode: 2 })],
    scanProvenance: provenance({
      live: {
        at: "2026-10-20T10:00:00.000Z",
        fullScanAt: "2026-10-20T09:00:00.000Z",
        changed: 1,
        added: 1,
        removed: 1,
        refreshed: 2,
        stale: ["semgrep", "gitleaks"],
      },
    }),
  });

describe("the live watch loop", () => {
  let tree: Map<string, Node>;

  beforeEach(async () => {
    vi.useFakeTimers();
    resetLiveForTests();
    liveCalls.length = 0;
    tree = new Map<string, Node>([["src", { kind: "dir", children: new Map<string, Node>() }]]);
    useStore.setState({
      cityData: city(),
      buildPhase: "built",
      selectedUnit: null,
      live: { ...EMPTY_LIVE_STATE },
      threatFilter: "all",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes("/live")) {
          liveCalls.push(JSON.parse(String(init?.body)));
          return response({
            id: ID,
            status: "complete",
            changed: 1,
            added: 1,
            removed: 1,
            refreshed: 2,
            paths: ["src/a.ts", "src/b.ts", "src/c.ts"],
            live: { stale: ["semgrep", "gitleaks"] },
          });
        }
        return response(city());
      }),
    );
  });

  afterEach(() => {
    stopLiveSession();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  async function pending(
    files: Array<{ path: string; content: string; mtime: number }>,
  ): Promise<PendingLiveScan> {
    const src = (tree.get("src") as { kind: "dir"; children: Map<string, Node> }).children;
    for (const entry of files) {
      const name = entry.path.split("/").pop() as string;
      if (entry.content === "") src.delete(name);
      else src.set(name, { kind: "file", file: file(entry.content, entry.mtime) });
    }
    const manifest = await Promise.all(
      files
        .filter((entry) => entry.content !== "")
        .map((entry) => meta(entry.path, entry.content, entry.mtime)),
    );
    return {
      analysisId: ID,
      name: "fixture",
      handle: handleOf(tree),
      manifest,
      excludes: [],
    };
  }

  it("sends only changed and new paths, with the complete manifest", async () => {
    const scan = await pending([
      { path: "src/a.ts", content: "const a = 1;\n", mtime: 1000 },
      { path: "src/b.ts", content: "const b = 1;\n", mtime: 1000 },
      { path: "src/gone.ts", content: "const g = 1;\n", mtime: 1000 },
    ]);
    startLiveSession(scan);

    // Change b, add c, delete gone — all while the watcher sleeps.
    const src = (tree.get("src") as { kind: "dir"; children: Map<string, Node> }).children;
    src.set("b.ts", { kind: "file", file: file('const b = eval("2");\n', 2000) });
    src.set("c.ts", { kind: "file", file: file("export const c = 3;\n", 2000) });
    src.delete("gone.ts");

    await vi.advanceTimersByTimeAsync(3000); // metadata poll
    await vi.advanceTimersByTimeAsync(700); // debounce + second look
    await vi.waitFor(() => expect(liveCalls).toHaveLength(1));
    const call = liveCalls[0]!;
    expect(call.files.map((f) => f.path).sort()).toEqual(["src/b.ts", "src/c.ts"]);
    expect(call.files.find((f) => f.path === "src/b.ts")?.content).toContain("eval");
    expect(call.manifest.map((m) => m.path).sort()).toEqual(["src/a.ts", "src/b.ts", "src/c.ts"]);
    expect(call.manifest.find((m) => m.path === "src/a.ts")?.sha).toBe(
      scan.manifest.find((m) => m.path === "src/a.ts")?.sha,
    );
    const state = useStore.getState().live;
    expect(state).toMatchObject({
      status: "watching",
      changed: 1,
      added: 1,
      removed: 1,
      refreshed: 2,
    });
    expect(state.lastSyncAt).not.toBeNull();
    expect(state.stale).toEqual(["semgrep", "gitleaks"]);
    expect(useStore.getState().cityData?.analysisId).toBe(ID);
  });

  it("a stopped session cannot send a delta into the next screen", async () => {
    const scan = await pending([{ path: "src/a.ts", content: "const a = 1;\n", mtime: 1000 }]);
    startLiveSession(scan);
    const src = (tree.get("src") as { kind: "dir"; children: Map<string, Node> }).children;
    src.set("a.ts", { kind: "file", file: file("const a = 2;\n", 2000) });

    await vi.advanceTimersByTimeAsync(3000); // detects the change, enters debounce
    stopLiveSession();
    await vi.advanceTimersByTimeAsync(2000);
    expect(liveCalls).toHaveLength(0);
    expect(useStore.getState().live.status).toBe("off");
  });

  it("pauses without ending the session and folds the changes made meanwhile on resume", async () => {
    const scan = await pending([{ path: "src/a.ts", content: "const a = 1;\n", mtime: 1000 }]);
    startLiveSession(scan);
    pauseLiveSession();
    expect(useStore.getState().live.status).toBe("paused");

    const src = (tree.get("src") as { kind: "dir"; children: Map<string, Node> }).children;
    src.set("a.ts", { kind: "file", file: file("const a = 2;\n", 2000) });
    await vi.advanceTimersByTimeAsync(6000);
    expect(liveCalls).toHaveLength(0);

    resumeLiveSession();
    await vi.advanceTimersByTimeAsync(3000);
    await vi.advanceTimersByTimeAsync(700);
    await vi.waitFor(() => expect(liveCalls).toHaveLength(1));
    expect(liveCalls[0]!.files[0]!.content).toBe("const a = 2;\n");
    expect(useStore.getState().live.status).toBe("watching");
  });

  it("coalesces two saves into the latest bytes", async () => {
    const scan = await pending([{ path: "src/a.ts", content: "const a = 1;\n", mtime: 1000 }]);
    startLiveSession(scan);
    const src = (tree.get("src") as { kind: "dir"; children: Map<string, Node> }).children;
    src.set("a.ts", { kind: "file", file: file("const a = 2;\n", 2000) });

    await vi.advanceTimersByTimeAsync(3000); // first look sees a=2
    // Saved again while the debounce runs.
    src.set("a.ts", { kind: "file", file: file("const a = 3;\n", 3000) });
    await vi.advanceTimersByTimeAsync(700);
    await vi.waitFor(() => expect(liveCalls).toHaveLength(1));
    expect(liveCalls[0]!.files).toHaveLength(1);
    expect(liveCalls[0]!.files[0]!.content).toBe("const a = 3;\n");
    expect(liveCalls[0]!.manifest.find((m) => m.path === "src/a.ts")?.sha).toBe(
      await sha("const a = 3;\n"),
    );
  });
});

describe("the live band", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    useStore.setState({ live: { ...EMPTY_LIVE_STATE } });
  });

  it("names the stale engines and offers the full scan in one click", () => {
    useStore.setState({
      cityData: city(),
      buildPhase: "built",
      prefs: { ...useStore.getState().prefs, lang: "en" },
      live: {
        ...EMPTY_LIVE_STATE,
        status: "watching",
        analysisId: ID,
        lastSyncAt: Date.now(),
        changed: 1,
        added: 0,
        removed: 1,
        stale: ["semgrep", "gitleaks"],
      },
    });
    act(() => root.render(createElement(HudOverlay, { apiStatus: "live" })));
    const band = container.querySelector('[data-testid="live-band"]');
    expect(band?.textContent).toContain(
      "Live — built-in rules only; external engines from the last full scan",
    );
    expect(band?.textContent).toContain("1 changed · 0 added · 1 removed");
    const scanButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Full scan",
    );
    expect(scanButton).toBeTruthy();
  });

  it("keeps the band while paused and offers resume", () => {
    useStore.setState({
      cityData: city(),
      buildPhase: "built",
      prefs: { ...useStore.getState().prefs, lang: "en" },
      live: {
        ...EMPTY_LIVE_STATE,
        status: "paused",
        analysisId: ID,
        lastSyncAt: Date.now(),
        changed: 1,
        added: 0,
        removed: 0,
      },
    });
    act(() => root.render(createElement(HudOverlay, { apiStatus: "live" })));
    const band = container.querySelector('[data-testid="live-band"]');
    expect(band?.textContent).toContain("Live — paused");
    const labels = [...container.querySelectorAll("button")].map((b) => b.textContent);
    expect(labels).toContain("Resume");
    expect(labels).toContain("Full scan");
  });

  it("hides the band for a city it does not watch", () => {
    useStore.setState({
      cityData: city(),
      buildPhase: "built",
      live: { ...EMPTY_LIVE_STATE, status: "watching", analysisId: "another-scan" },
    });
    act(() => root.render(createElement(HudOverlay, { apiStatus: "live" })));
    expect(container.querySelector('[data-testid="live-band"]')).toBeNull();
  });
});

describe("applyLiveCityData", () => {
  it("keeps the visit and drops a selection whose file is gone", () => {
    const before = cityOf({
      analysisId: ID,
      files: [
        fileOf("src/a.ts", "TypeScript", [], undefined, { linesOfCode: 1 }),
        fileOf("src/b.ts", "TypeScript", [], undefined, { linesOfCode: 1 }),
      ],
    });
    const after = cityOf({
      analysisId: ID,
      files: [fileOf("src/a.ts", "TypeScript", [], undefined, { linesOfCode: 1 })],
    });
    useStore.setState({
      cityData: before,
      buildPhase: "built",
      threatFilter: "P0",
      selectedUnit: { kind: "file", id: before.tree.detailFiles?.[1]?.id ?? "" },
    });
    useStore.getState().applyLiveCityData(after);
    const state = useStore.getState();
    expect(state.cityData?.totalFiles).toBe(1);
    expect(state.threatFilter).toBe("P0");
    expect(state.buildPhase).toBe("built");
    expect(state.selectedUnit).toBeNull();
  });
});
