#!/usr/bin/env node
/**
 * Stage the publishable package once, from the same list the end-to-end check
 * uses. `pack-check` installs this stage into an empty folder; a human publishes
 * the same bytes. One list, so a green check and a published tarball cannot
 * disagree about what a package contains.
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const HERE = import.meta.dirname;
const REPO = path.resolve(HERE, "..");
const COPY_DIRS = ["backend/dist", "frontend/dist"];
const COPY_FILES = ["README.md", "LICENSE", "NOTICE"];

function countFiles(dir) {
  let files = 0;
  let bytes = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const inner = countFiles(full);
      files += inner.files;
      bytes += inner.bytes;
    } else if (entry.isFile()) {
      files += 1;
      bytes += statSync(full).size;
    }
  }
  return { files, bytes };
}

/**
 * Build both workspaces and write the package-only tree to `out`.
 * Throws with the missing path instead of publishing a package that cannot boot.
 */
export function stagePackage(out, { build = true } = {}) {
  const target = path.resolve(out);
  // This function deletes its target before staging. Only the two directories
  // it is meant to own may be that target: the repo's dist-package, or a
  // pack-check temp dir. `--out ~` must fail, not erase a home folder.
  const defaultStage = path.join(REPO, "dist-package");
  const inTemp = target.startsWith(tmpdir() + path.sep);
  if (target !== defaultStage && !inTemp) {
    throw new Error(`refusing to stage outside dist-package/ or the temp directory: ${target}`);
  }
  if (build) {
    execFileSync("npm", ["run", "build", "--silent"], { cwd: REPO, stdio: "inherit" });
  }
  const manifest = path.join(REPO, "package.publish.json");
  const launcher = path.join(REPO, "scripts", "ephemora-skyline.mjs");
  for (const required of [manifest, launcher, ...COPY_DIRS.map((d) => path.join(REPO, d))]) {
    if (!existsSync(required)) throw new Error(`missing from the checkout: ${required}`);
  }
  // A stale stage must not leave a file the new manifest no longer lists.
  rmSync(target, { recursive: true, force: true });
  mkdirSync(path.join(target, "scripts"), { recursive: true });
  cpSync(manifest, path.join(target, "package.json"));
  cpSync(launcher, path.join(target, "scripts", "ephemora-skyline.mjs"));
  for (const dir of COPY_DIRS) {
    cpSync(path.join(REPO, dir), path.join(target, dir), { recursive: true });
  }
  for (const file of COPY_FILES) {
    const from = path.join(REPO, file);
    if (existsSync(from)) cpSync(from, path.join(target, file));
  }
  const census = countFiles(target);
  return {
    dir: target,
    files: census.files,
    bytes: census.bytes,
    mb: Math.round((census.bytes / 1024 / 1024) * 100) / 100,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const at = process.argv.indexOf("--out");
  const out = at >= 0 ? process.argv[at + 1] : path.join(REPO, "dist-package");
  try {
    const result = stagePackage(out);
    const rel = path.relative(REPO, result.dir) || result.dir;
    console.log(`package stage: ${rel} — ${result.files} files, ${result.mb} MB unpacked`);
    console.log(`publish it with: npm publish ${rel}`);
  } catch (error) {
    console.error(`package-stage: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
