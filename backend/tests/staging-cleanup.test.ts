import { describe, it, expect, afterAll } from "vitest";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import {
  pruneStagingRoot,
  pruneStaleUploadDirs,
  registerUploadDir,
} from "../src/server/routes/local-analyze.js";

/**
 * The registry sweep only knows what this process staged. After a restart it
 * remembers nothing, so the copies of the user's source stayed in the staging
 * root until a TTL that had already begun did not exist. These tests hold the
 * second half to its own rules: one root, uuid names only, real directories
 * only, never a live copy, and — for the retired root — every copy.
 */

const UUID_STALE = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const UUID_FRESH = "1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e";
const UUID_LIVE = "2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f";
const UUID_LINK = "3d4e5f6a-7b8c-4d9e-8f0a-1b2c3d4e5f6a";
const STRAY = "not-a-staged-copy";

const roots: string[] = [];
const previous = process.env.EPHEMORA_UPLOAD_DIR;

const makeCopy = async (root: string, id: string, ageHours: number): Promise<string> => {
  const dir = path.join(root, id);
  await fs.mkdir(path.join(dir, "src"), { recursive: true, mode: 0o700 });
  await fs.writeFile(path.join(dir, "src", "a.ts"), "x".repeat(64), { mode: 0o600 });
  const when = new Date(Date.now() - ageHours * 60 * 60 * 1000);
  await fs.utimes(dir, when, when);
  return dir;
};

const freshRoot = async (): Promise<string> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "staging-cleanup-test-"));
  roots.push(root);
  return root;
};

afterAll(async () => {
  for (const root of roots) await fs.rm(root, { recursive: true, force: true }).catch(() => {});
  if (previous === undefined) delete process.env.EPHEMORA_UPLOAD_DIR;
  else process.env.EPHEMORA_UPLOAD_DIR = previous;
});

describe("the staging-root sweep", () => {
  it("removes a stale copy the RAM registry has forgotten", async () => {
    const root = await freshRoot();
    await makeCopy(root, UUID_STALE, 48);
    expect(await pruneStagingRoot(root)).toBe(1);
    await expect(fs.stat(path.join(root, UUID_STALE))).rejects.toThrow();
  });

  it("leaves a fresh copy, a stranger's folder, and a loose file alone", async () => {
    const root = await freshRoot();
    await makeCopy(root, UUID_FRESH, 1);
    await fs.mkdir(path.join(root, STRAY), { mode: 0o700 });
    await fs.writeFile(path.join(root, "loose.txt"), "not a copy", { mode: 0o600 });
    expect(await pruneStagingRoot(root)).toBe(0);
    await expect(fs.stat(path.join(root, UUID_FRESH))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(root, STRAY))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(root, "loose.txt"))).resolves.toBeTruthy();
  });

  it("never follows a uuid-named symlink out of the root", async () => {
    const root = await freshRoot();
    const outside = await freshRoot();
    await fs.writeFile(path.join(outside, "keep.ts"), "keep", { mode: 0o600 });
    await fs.symlink(outside, path.join(root, UUID_LINK));
    expect(await pruneStagingRoot(root)).toBe(0);
    await expect(fs.readlink(path.join(root, UUID_LINK))).resolves.toBe(outside);
    await expect(fs.stat(path.join(outside, "keep.ts"))).resolves.toBeTruthy();
  });

  it("keeps a copy a registered job still owns", async () => {
    const root = await freshRoot();
    const dir = await makeCopy(root, UUID_LIVE, 48);
    registerUploadDir(UUID_LIVE, dir);
    expect(await pruneStagingRoot(root, { now: Date.now() + 25 * 60 * 60 * 1000 })).toBe(0);
    await expect(fs.stat(dir)).resolves.toBeTruthy();
  });

  it("removes every copy when the root is the retired one", async () => {
    const root = await freshRoot();
    await makeCopy(root, UUID_STALE, 48);
    await makeCopy(root, UUID_FRESH, 1);
    expect(await pruneStagingRoot(root, { all: true })).toBe(2);
    await expect(fs.stat(path.join(root, UUID_STALE))).rejects.toThrow();
    await expect(fs.stat(path.join(root, UUID_FRESH))).rejects.toThrow();
  });

  it("sweeps the configured root in the periodic pass", async () => {
    const root = await freshRoot();
    process.env.EPHEMORA_UPLOAD_DIR = root;
    await makeCopy(root, UUID_STALE, 48);
    await makeCopy(root, UUID_FRESH, 1);
    await pruneStaleUploadDirs(Date.now());
    await expect(fs.stat(path.join(root, UUID_STALE))).rejects.toThrow();
    await expect(fs.stat(path.join(root, UUID_FRESH))).resolves.toBeTruthy();
  });
});
