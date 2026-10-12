/**
 * A staging root of one's own, for the files that fast-forward the TTL.
 *
 * The suite shares one `CODECITY_UPLOAD_DIR` (`vitest.config.ts`), and four
 * files prune with a clock moved 1–25 h into the future. The sweep deletes
 * every uuid-named folder past the TTL in that root — so the file that moved
 * the clock also removed the folders a sibling file was still asserting on.
 * Measured: `staged-uploads` went red 7 of 7 times when its neighbour ran
 * first, and a folder left by an earlier run could hand the sweep an inherited
 * mtime that `mkdir(recursive)` silently kept.
 *
 * A private root per file makes the sweep nobody else's problem, and the
 * `release` hook leaves nothing behind in `/tmp`.
 */
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

export interface PrivateStaging {
  root: string;
  release: () => Promise<void>;
}

export async function usePrivateStaging(label: string): Promise<PrivateStaging> {
  const previous = process.env.CODECITY_UPLOAD_DIR;
  const root = await mkdtemp(path.join(tmpdir(), `codecity-uploads-${label}-`));
  process.env.CODECITY_UPLOAD_DIR = root;
  return {
    root,
    release: async () => {
      await rm(root, { recursive: true, force: true }).catch(() => undefined);
      if (previous === undefined) delete process.env.CODECITY_UPLOAD_DIR;
      else process.env.CODECITY_UPLOAD_DIR = previous;
    },
  };
}
