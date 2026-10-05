import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { footprintSnapshot, purgeStaleCopies } from "../src/server/routes/local-analyze.js";

/**
 * The entry screen shows what this program keeps on the machine and offers to
 * delete it. Three rules make that safe, and all three are checked here against
 * a real directory tree — with the staging root redirected, so the machine's own
 * copies are never touched:
 *
 * 1. only a directory named by a scan id this route minted is counted or removed,
 * 2. only one past its keep time,
 * 3. and only a deletion that actually happened is reported.
 */
const UUID = "6f1a2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b";
const UUID_STALE = "7f1a2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5c";
const UUID_RESISTING = "8c9d0e1f-2a3b-4c5d-8e6f-7a8b9c0d1e2f";
const STRAY = "not-a-staged-copy";

let root = "";
const previous = process.env.CODECITY_UPLOAD_DIR;

const makeCopy = async (name: string, bytes: number, ageHours: number): Promise<string> => {
  const dir = path.join(root, name);
  await fs.mkdir(path.join(dir, "src"), { recursive: true, mode: 0o700 });
  await fs.writeFile(path.join(dir, "src", "a.ts"), "x".repeat(bytes), { mode: 0o600 });
  const when = new Date(Date.now() - ageHours * 60 * 60 * 1000);
  await fs.utimes(dir, when, when);
  return dir;
};

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "footprint-test-"));
  process.env.CODECITY_UPLOAD_DIR = root;
  await makeCopy(UUID, 2048, 1); // fresh
  await makeCopy(UUID_STALE, 4096, 48); // past a 24 h TTL
  await fs.mkdir(path.join(root, STRAY), { mode: 0o700 }); // a stranger's folder
  await fs.writeFile(path.join(root, "loose.txt"), "not a copy", { mode: 0o600 });
});

afterAll(async () => {
  if (root) {
    await fs.chmod(path.join(root, UUID_RESISTING), 0o700).catch(() => {});
    await fs.rm(root, { recursive: true, force: true }).catch(() => {});
  }
  if (previous === undefined) delete process.env.CODECITY_UPLOAD_DIR;
  else process.env.CODECITY_UPLOAD_DIR = previous;
});

describe("the footprint", () => {
  it("counts only the copies this route minted", async () => {
    const snap = await footprintSnapshot();
    expect(snap.root).toBe(root);
    expect(snap.copies).toBe(2);
    expect(snap.bytes).toBeGreaterThanOrEqual(2048 + 4096);
    expect(snap.ttlHours).toBeGreaterThanOrEqual(1);
    expect(typeof snap.offline).toBe("boolean");
  });

  it("marks a copy stale only past its keep time", async () => {
    expect((await footprintSnapshot()).stale).toBe(1);
  });

  it("deletes the stale copy and leaves everything else alone", async () => {
    const result = await purgeStaleCopies();
    expect(result.removed).toBe(1);
    expect(result.bytesFreed).toBeGreaterThanOrEqual(4096);
    await expect(fs.stat(path.join(root, UUID_STALE))).rejects.toThrow();
    await expect(fs.stat(path.join(root, UUID))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(root, STRAY))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(root, "loose.txt"))).resolves.toBeTruthy();
  });

  /**
   * Found by hand against the live server: the first version counted every
   * directory it tried, so a copy that could not be deleted (immutable flag,
   * wrong ownership, busy file) was reported as space the user got back.
   */
  it("does not claim a copy it could not delete", async () => {
    const resisting = await makeCopy(UUID_RESISTING, 1024, 72);
    await fs.chmod(resisting, 0o500); // cannot unlink what sits inside it
    try {
      if (os.userInfo().uid === 0) return; // root ignores the mode
      const result = await purgeStaleCopies();
      expect(result.removed, JSON.stringify(result)).toBe(0);
      await expect(fs.stat(resisting)).resolves.toBeTruthy();
    } finally {
      await fs.chmod(resisting, 0o700).catch(() => {});
    }
  });

  it("is honest when asked twice", async () => {
    expect((await purgeStaleCopies()).remaining).toBe(1);
  });
});
