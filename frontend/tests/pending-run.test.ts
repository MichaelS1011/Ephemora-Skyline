// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { clearPendingRun, notePendingRun, readPendingRun } from "../src/pendingRun";
import { useStore } from "../src/stores/useStore";
import { city, dir, file } from "./helpers/cityFixture";

/**
 * MASTER-2027 §03.09 — the read a reader left behind.
 *
 * Measured first (`unterbrechung-messung.json`): after a reload mid-run the
 * server kept going (88 % → complete in 4,8 s) and served the finished city at
 * `/api/result/:id/city`, while the browser held nothing at all. This module is
 * the one fact that gap needs: which job this tab abandoned.
 *
 * The claims: it is written the moment a run exists outside the tab, read back
 * only in the shape the server makes, cleared by the city that came from it (and
 * by nothing else), and it never holds a folder name or a path.
 */

const KEY = "codecity-pending-run:v1";
const ID = "5edbe8b7-d4ee-4e3c-9a11-fc8352ee27a4";
const OTHER = "00000000-0000-4000-8000-000000000000";

const cityWith = (analysisId: string) =>
  city({
    repo: { owner: "local", name: "auth-app", branch: "main" },
    analysisId,
    files: [file("src/db.ts", "TypeScript")],
    tree: dir({ path: "", detailFiles: [file("src/db.ts", "TypeScript")] }),
  });

beforeEach(() => {
  localStorage.clear();
  useStore.setState({ ...useStore.getInitialState(), cityData: null }, true);
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("noting the run the tab leaves behind", () => {
  it("holds the id the server named", () => {
    notePendingRun(ID);
    expect(localStorage.getItem(KEY)).toBe(ID);
    expect(readPendingRun()).toBe(ID);
  });

  it("keeps the newest run when a second folder is read", () => {
    notePendingRun(ID);
    notePendingRun(OTHER);
    expect(readPendingRun()).toBe(OTHER);
  });

  it("refuses anything that is not a job id, so storage cannot choose a URL", () => {
    for (const notAnId of ["../../etc/passwd", "id?x=1", "", ID.slice(0, 30), "DROP TABLE runs"]) {
      localStorage.clear();
      notePendingRun(notAnId);
      expect(readPendingRun()).toBeNull();
    }
  });

  it("reads a hand-edited value as no run at all", () => {
    localStorage.setItem(KEY, "/Users/mine/projekt");
    expect(readPendingRun()).toBeNull();
  });

  it("survives a storage that refuses to be written", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => notePendingRun(ID)).not.toThrow();
    spy.mockRestore();
    expect(readPendingRun()).toBeNull();
  });
});

describe("forgetting the run", () => {
  it("clears the id it is given", () => {
    notePendingRun(ID);
    clearPendingRun(ID);
    expect(readPendingRun()).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("leaves a newer run alone when an older one ends", () => {
    // A late answer from the first folder must not erase the record of the one
    // now running — the same rule `runRef` enforces inside the hook.
    notePendingRun(OTHER);
    clearPendingRun(ID);
    expect(readPendingRun()).toBe(OTHER);
  });
});

describe("the app writes and clears the record", () => {
  it("is cleared by the city that came from exactly that run", () => {
    notePendingRun(ID);
    useStore.getState().setCityData(cityWith(ID));
    expect(readPendingRun()).toBeNull();
  });

  it("is kept when some other city arrives", () => {
    // Opening an older city by address is not an answer about this run; the
    // record has to survive it.
    notePendingRun(ID);
    useStore.getState().setCityData(cityWith(OTHER));
    expect(readPendingRun()).toBe(ID);
  });

  it("is kept when the screen empties", () => {
    notePendingRun(ID);
    useStore.getState().setCityData(null);
    expect(readPendingRun()).toBe(ID);
  });

  it("is noted where the server names the job, and cleared where the reader cancels", () => {
    // The two seams are one line each and live in flows the hook drives with a
    // real backend; pinned from the source, like the footprint block does.
    const REPO = path.resolve(import.meta.dirname, "../..");
    const upload = readFileSync(
      path.join(REPO, "frontend/src/hooks/useLocalAnalysis/upload.ts"),
      "utf-8",
    );
    const hook = readFileSync(path.join(REPO, "frontend/src/hooks/useLocalAnalysis.ts"), "utf-8");
    expect(upload).toContain("notePendingRun(data.id);");
    expect(hook).toContain("clearPendingRun(id);");
  });

  it("holds one id and nothing else — no folder, no name, no path", () => {
    notePendingRun(ID);
    const raw = localStorage.getItem(KEY) ?? "";
    expect(raw).toBe(ID);
    expect(raw).not.toMatch(/[/\\]/);
    expect(raw.length).toBe(ID.length);
  });
});
