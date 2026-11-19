// @vitest-environment jsdom
/**
 * The full rescan inside a live session, measured at its two failure seams:
 * — the POST must answer the same structured refusals with the same sentences
 *   the first upload path (upload.ts) uses — a rate limit is a countdown, the
 *   file cap is the cap line, and the server's raw wording never becomes the
 *   headline;
 * — the status poll must survive transient errors the way the main poller
 *   does: a proxy blip at second three may not throw a live scan out of the
 *   window while the server keeps working.
 */
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStore } from "../src/stores/useStore";
import { sha256Hex } from "../src/live/files";
import {
  fullRescanLive,
  resetLiveForTests,
  startLiveSession,
  stopLiveSession,
} from "../src/live/session";
import { EMPTY_LIVE_STATE, type LiveFileMeta, type PendingLiveScan } from "../src/live/types";
import { t } from "../src/i18n";
import type { CityData } from "../src/city/types";
import type { DirEntry, DirHandle } from "../src/hooks/useLocalAnalysis/picker";
import { city as cityOf, file as fileOf } from "./helpers/cityFixture";

const ID = "11111111-2222-4333-8444-555555555555";
const NEW_ID = "66666666-7777-4888-9999-000000000000";

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

async function meta(path: string, content: string, mtime: number): Promise<LiveFileMeta> {
  return {
    path,
    sha: await sha256Hex(new TextEncoder().encode(content).buffer as ArrayBuffer),
    size: new TextEncoder().encode(content).byteLength,
    mtime,
  };
}

function response(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return {
    ok: status < 400,
    status,
    json: async () => body,
    headers: { get: (k: string) => headers[k] ?? headers[k.toLowerCase()] ?? null },
  } as unknown as Response;
}

const city = (id: string): CityData =>
  cityOf({
    analysisId: id,
    files: [fileOf("src/a.ts", "TypeScript", [], undefined, { linesOfCode: 2 })],
  });

async function pending(
  tree: Map<string, Node>,
  contents: Array<{ path: string; content: string; mtime: number }>,
): Promise<PendingLiveScan> {
  const src = (tree.get("src") as { kind: "dir"; children: Map<string, Node> }).children;
  for (const entry of contents) {
    src.set(entry.path.split("/").pop() as string, {
      kind: "file",
      file: file(entry.content, entry.mtime),
    });
  }
  const manifest = await Promise.all(
    contents.map((entry) => meta(entry.path, entry.content, entry.mtime)),
  );
  return { analysisId: ID, name: "fixture", handle: handleOf(tree), manifest, excludes: [] };
}

describe("fullRescanLive failure seams", () => {
  let tree: Map<string, Node>;

  beforeEach(async () => {
    vi.useFakeTimers();
    resetLiveForTests();
    tree = new Map<string, Node>([["src", { kind: "dir", children: new Map<string, Node>() }]]);
    useStore.setState({
      cityData: city(ID),
      buildPhase: "built",
      selectedUnit: null,
      live: { ...EMPTY_LIVE_STATE },
      analysisId: ID,
    });
  });

  afterEach(() => {
    stopLiveSession();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("a 429 on the rescan POST answers with the countdown, not the server's phrase", async () => {
    startLiveSession(
      await pending(tree, [{ path: "src/a.ts", content: "const a = 1;\n", mtime: 1000 }]),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        response(
          { error: "too many scans today", code: "rate_limited", retryAfterSeconds: 120 },
          429,
        ),
      ),
    );

    await fullRescanLive();

    const err = useStore.getState().live.error;
    expect(err).toBe(`${t("en", "limit.hit", { s: 120 })} — ${t("en", "cap.hint")}`);
    expect(err).not.toContain("too many scans today");
  });

  it("too_many_files answers with the cap line", async () => {
    startLiveSession(
      await pending(tree, [{ path: "src/a.ts", content: "const a = 1;\n", mtime: 1000 }]),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        response(
          { error: "folder is too large", code: "too_many_files", found: 500, max: 200 },
          400,
        ),
      ),
    );

    await fullRescanLive();

    const err = useStore.getState().live.error;
    expect(err).toBe(
      `${t("en", "cap.filesFound", { found: "500", max: "200" })} — ${t("en", "cap.hint")}`,
    );
  });

  // Real-time headroom: the fake-timer loop itself is instant, but the real
  // WebCrypto hash and jsdom File reads behind it share the busy full-suite
  // thread pool, where the bare 5s default can starve them.
  it(
    "three transient status errors do not abandon a running scan",
    { timeout: 20_000 },
    async () => {
      startLiveSession(
        await pending(tree, [{ path: "src/a.ts", content: "const a = 1;\n", mtime: 1000 }]),
      );
      let statusCalls = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
          if (url.includes("/analyze-local")) return response({ id: NEW_ID });
          if (url.includes("/api/status/")) {
            statusCalls += 1;
            if (statusCalls <= 3) return response({ error: "upstream hiccup" }, 500);
            return response({ status: "complete", progress: 100 });
          }
          if (url.includes("/city")) return response(city(NEW_ID));
          return response({}, 404);
        }),
      );

      const run = fullRescanLive();
      // Stepped one second at a time; four 1s polls sit well inside the budget.
      for (let i = 0; i < 10; i += 1) {
        await vi.advanceTimersByTimeAsync(1000);
        if (useStore.getState().analysisId === NEW_ID) break;
      }
      await run;

      const s = useStore.getState();
      expect(s.live.error).toBe("");
      expect(s.analysisId).toBe(NEW_ID);
      expect(s.cityData?.analysisId).toBe(NEW_ID);
    },
  );

  it(
    "fifteen consecutive transient errors are tolerated, the sixteenth says stop",
    { timeout: 20_000 },
    async () => {
      startLiveSession(
        await pending(tree, [{ path: "src/a.ts", content: "const a = 1;\n", mtime: 1000 }]),
      );
      let statusCalls = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
          if (url.includes("/analyze-local")) return response({ id: NEW_ID });
          if (url.includes("/api/status/")) {
            statusCalls += 1;
            return response({ error: "upstream down" }, 500);
          }
          return response({}, 404);
        }),
      );

      const run = fullRescanLive();
      // Stepped one second at a time: the restarted watch loop reschedules its
      // own poll, and one big advance would drown in its promise chain.
      for (let i = 0; i < 30; i += 1) {
        await vi.advanceTimersByTimeAsync(1000);
        if (useStore.getState().live.status === "error") break;
      }
      await run;

      // 15 failures are budgeted (continue), the 16th exceeds the budget and the
      // loop throws — so the poll asked 16 times and then gave up, honestly.
      expect(statusCalls).toBe(16);
      expect(useStore.getState().live.error).toContain("HTTP 500");
    },
  );
});
