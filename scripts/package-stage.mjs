#!/usr/bin/env node
/**
 * Stage the publishable package once, from the same list the end-to-end check
 * uses. `pack-check` installs this stage into an empty folder; a human publishes
 * the same bytes. One list, so a green check and a published tarball cannot
 * disagree about what a package contains.
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const HERE = import.meta.dirname;
const REPO = path.resolve(HERE, "..");
const COPY_DIRS = ["backend/dist", "frontend/dist"];
const COPY_FILES = ["README.md", "LICENSE", "NOTICE"];
/**
 * The documents a reader needs after an install, and the ones the README links
 * to by name. Media stays out of the package on purpose: the screenshots and
 * the one clip the start page carries are 13 MB of bytes nobody reads offline,
 * and they stay reachable in the repository.
 */
const COPY_MD = ["CHANGELOG.md", "SECURITY.md", "CONTRIBUTING.md", "CODE_OF_CONDUCT.md"];

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
  for (const file of [...COPY_FILES, ...COPY_MD]) {
    const from = path.join(REPO, file);
    if (existsSync(from)) cpSync(from, path.join(target, file));
  }
  // The guides sit one level deep in `docs/`, and only those markdown files
  // travel: `docs/reviews/` and `docs/development/` are the workshop, not the
  // product, and `docs/assets/` is the media the line above keeps out.
  const docsDir = path.join(REPO, "docs");
  const docsMd = existsSync(docsDir)
    ? readdirSync(docsDir).filter((name) => name.endsWith(".md"))
    : [];
  if (docsMd.length > 0) {
    mkdirSync(path.join(target, "docs"), { recursive: true });
    for (const name of docsMd) {
      cpSync(path.join(docsDir, name), path.join(target, "docs", name));
    }
  }
  const census = countFiles(target);
  return {
    dir: target,
    files: census.files,
    bytes: census.bytes,
    mb: Math.round((census.bytes / 1024 / 1024) * 100) / 100,
  };
}

/**
 * Every relative link to a markdown document inside a staged package, and the
 * ones that go nowhere.
 *
 * A package is a different artefact from a checkout: `files` drops what it does
 * not name, and a reader who installs it reads the README offline, where a link
 * to a document that was never shipped is a dead end they cannot fix. Measured
 * on 2026-10-31: the stage carried `README.md` and its 13 documentation links
 * pointed at documents that were not in the box.
 *
 * Media links (`docs/assets/*.png`, the clip) are counted, not failed: they
 * stay in the repository by the decision above, and a reader without them sees
 * the alt text.
 */
export function findDeadDocLinks(rootDir) {
  const mdFiles = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith(".md")) mdFiles.push(full);
    }
  };
  walk(rootDir);

  const link = /!?\[[^\]]*\]\(([^)\s]+)\)/g;
  const dead = [];
  const media = new Set();
  for (const file of mdFiles) {
    const text = readFileSync(file, "utf-8");
    for (const match of text.matchAll(link)) {
      const target = match[1].split("#")[0];
      if (!target || /^[a-z]+:\/\//i.test(target) || target.startsWith("mailto:") || target.startsWith("/")) {
        continue;
      }
      if (!target.endsWith(".md")) {
        if (/\.(?:png|jpe?g|gif|mp4|webm|svg)$/i.test(target)) media.add(target);
        continue;
      }
      if (!existsSync(path.resolve(path.dirname(file), target))) {
        dead.push(`${path.relative(rootDir, file)} → ${target}`);
      }
    }
  }
  return { documents: mdFiles.length, dead, mediaLinks: media.size };
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
