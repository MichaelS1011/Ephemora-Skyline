import { allFiles } from "./layout";
import type { CityData, CityFile } from "./types";

/**
 * Role landmarks: the project's anatomy read off the scan itself.
 *
 * Risk already owns one landmark (`landmarkFileId`, the loudest file, drawn
 * with a beam). This axis is orthogonal: entry point, docs, tests and build
 * machinery get their own silhouette without borrowing a finding's alarm.
 * A kind is returned only when a real path or role matches, and `basis` is the
 * exact rule that fired — the UI can say why without inventing anything.
 */

export const ROLE_LANDMARK_KINDS = ["lighthouse", "library", "watchtower", "factory"] as const;

export type RoleLandmarkKind = (typeof ROLE_LANDMARK_KINDS)[number];

export interface RoleLandmark {
  kind: RoleLandmarkKind;
  fileId: string;
  path: string;
  /** The exact path/role rule that made this file a landmark. */
  basis: string;
}

interface Candidate {
  rank: number;
  basis: string;
  file: CityFile;
}

const normPath = (path: string): string => path.replace(/\\/g, "/");
const baseName = (path: string): string => path.split("/").pop() ?? path;

const MAIN_ENTRIES = new Set([
  "main.tsx",
  "main.ts",
  "main.jsx",
  "main.js",
  "main.mjs",
  "main.cjs",
  "main.py",
  "__main__.py",
]);
const APP_ENTRIES = new Set(["App.tsx", "App.jsx", "App.ts"]);
const SERVER_ENTRIES = new Set([
  "server.ts",
  "server.tsx",
  "server.js",
  "server.jsx",
  "server.mjs",
  "server.cjs",
  "server.py",
  "app.py",
  "wsgi.py",
  "asgi.py",
  "manage.py",
]);
const INDEX_ENTRIES = new Set([
  "index.ts",
  "index.tsx",
  "index.js",
  "index.jsx",
  "index.mjs",
  "index.cjs",
]);
const APP_ROOT_DIRS = new Set(["", "src", "app", "server"]);

const README_RE = /^readme(\.[a-z0-9]+)?$/i;
const DOC_EXT_RE = /\.(md|mdx|rst|txt|adoc|asciidoc|org)$/i;
const CI_FILES = new Set([
  ".gitlab-ci.yml",
  ".travis.yml",
  ".cirrus.yml",
  "appveyor.yml",
  "azure-pipelines.yml",
  "bitbucket-pipelines.yml",
  "buildkite.yml",
  "circle.yml",
  "Jenkinsfile",
]);
const BUILD_CONFIG_RE =
  /^(?:vite|webpack|rollup|esbuild|rspack|parcel|babel|jest|vitest|playwright|cypress|tsup|swc)\.config\.[^.]+$|^tsconfig.*\.json$|^jsconfig\.json$|^\.babelrc(?:\.json)?$|^turbo\.json$|^nx\.json$|^lerna\.json$|^pnpm-workspace\.yaml$|^pyproject\.toml$|^setup\.(?:py|cfg)$|^Cargo\.toml$|^go\.mod$|^pom\.xml$|^build\.gradle(?:\.kts)?$|^settings\.gradle(?:\.kts)?$|^build\.sbt$|^CMakeLists\.txt$|^meson\.build$/;

function isConventionalTestPath(path: string): boolean {
  return (
    /\.(test|spec)\.[a-z0-9]+$/i.test(path) ||
    /(^|\/)__tests__\//.test(path) ||
    /(^|\/)tests?\//.test(path) ||
    /(^|\/)specs?\//.test(path) ||
    /(^|\/)test_[^/]+\.py$/i.test(path) ||
    /_test\.[a-z0-9]+$/i.test(path) ||
    /(?:Test|Tests|Spec)\.(?:java|kt|scala|cs)$/.test(path)
  );
}

const isTestLike = (file: CityFile, path: string): boolean =>
  file.role === "test" || isConventionalTestPath(path);

function lighthouse(file: CityFile, path: string): Omit<Candidate, "file"> | null {
  if (isTestLike(file, path)) return null;
  const name = baseName(path);
  if (MAIN_ENTRIES.has(name)) return { rank: 0, basis: `basename = ${name}` };
  if (APP_ENTRIES.has(name)) return { rank: 1, basis: `basename = ${name}` };
  if (SERVER_ENTRIES.has(name)) return { rank: 2, basis: `basename = ${name}` };
  if (INDEX_ENTRIES.has(name)) {
    const parent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")).split("/").pop() : "";
    if (APP_ROOT_DIRS.has(parent ?? "")) return { rank: 3, basis: `path = ${path}` };
  }
  return null;
}

function library(file: CityFile, path: string): Omit<Candidate, "file"> | null {
  if (isTestLike(file, path)) return null;
  const name = baseName(path);
  if (README_RE.test(name)) {
    return path.includes("/")
      ? { rank: 1, basis: `basename = ${name}` }
      : { rank: 0, basis: `path = ${path}` };
  }
  if (!DOC_EXT_RE.test(name)) return null;
  if (path.startsWith("docs/") || path.startsWith("doc/")) {
    return { rank: 2, basis: "path matches docs/**" };
  }
  if (/(^|\/)docs?\//.test(path)) {
    return { rank: 2, basis: "path matches **/docs/**" };
  }
  return null;
}

function watchtower(file: CityFile, path: string): Omit<Candidate, "file"> | null {
  if (file.role === "test") return { rank: 0, basis: "role = test" };
  const name = baseName(path);
  const testExt = /\.(test|spec)\.[a-z0-9]+$/i.exec(name);
  if (testExt) return { rank: 1, basis: `basename matches *.${testExt[1]}.*` };
  if (/^test_[^/]+\.py$/i.test(name)) return { rank: 1, basis: "basename matches test_*.py" };
  if (/_test\.[a-z0-9]+$/i.test(name)) return { rank: 1, basis: "basename matches *_test.*" };
  if (/(?:Test|Tests|Spec)\.(?:java|kt|scala|cs)$/.test(name)) {
    return { rank: 1, basis: "basename matches *Test.*" };
  }
  if (/(^|\/)__tests__\//.test(path)) return { rank: 2, basis: "path matches **/__tests__/**" };
  if (/(^|\/)tests\//.test(path)) return { rank: 2, basis: "path matches **/tests/**" };
  if (/(^|\/)test\//.test(path)) return { rank: 2, basis: "path matches **/test/**" };
  if (/(^|\/)specs?\//.test(path)) return { rank: 2, basis: "path matches **/spec/**" };
  return null;
}

function factory(file: CityFile, path: string): Omit<Candidate, "file"> | null {
  if (isTestLike(file, path)) return null;
  const name = baseName(path);
  if (/^\.github\/workflows\//.test(path)) {
    return { rank: 0, basis: "path matches .github/workflows/**" };
  }
  if (/(^|\/)\.github\/workflows\//.test(path)) {
    return { rank: 0, basis: "path matches **/.github/workflows/**" };
  }
  if (CI_FILES.has(name)) return { rank: 1, basis: `basename = ${name}` };
  if (/^Dockerfile(?:$|\.)/i.test(name) || /\.dockerfile$/i.test(name)) {
    return { rank: 2, basis: `basename = ${name}` };
  }
  if (/^(?:GNUmakefile|makefile|Makefile)$/.test(name)) {
    return { rank: 3, basis: `basename = ${name}` };
  }
  if (name === "package.json") {
    return path === "package.json"
      ? { rank: 4, basis: "path = package.json" }
      : { rank: 5, basis: "basename = package.json" };
  }
  if (BUILD_CONFIG_RE.test(name)) return { rank: 6, basis: `basename = ${name}` };
  return null;
}

function match(file: CityFile): Record<RoleLandmarkKind, Omit<Candidate, "file"> | null> {
  const path = normPath(file.path);
  return {
    lighthouse: lighthouse(file, path),
    library: library(file, path),
    watchtower: watchtower(file, path),
    factory: factory(file, path),
  };
}

const better = (a: Candidate | null, b: Candidate): Candidate => {
  if (!a) return b;
  if (b.rank !== a.rank) return b.rank < a.rank ? b : a;
  const ap = normPath(a.file.path);
  const bp = normPath(b.file.path);
  if (ap !== bp) return bp < ap ? b : a;
  return b.file.id < a.file.id ? b : a;
};

const cache = new WeakMap<CityData, RoleLandmark[]>();

/** At most one landmark per kind, chosen by rule priority then path order. */
export function detectRoleLandmarks(city: CityData): RoleLandmark[] {
  const cached = cache.get(city);
  if (cached) return cached;
  const best: Record<RoleLandmarkKind, Candidate | null> = {
    lighthouse: null,
    library: null,
    watchtower: null,
    factory: null,
  };
  for (const { file } of allFiles(city)) {
    const matches = match(file);
    for (const kind of ROLE_LANDMARK_KINDS) {
      const hit = matches[kind];
      if (hit) best[kind] = better(best[kind], { ...hit, file });
    }
  }
  const out: RoleLandmark[] = [];
  for (const kind of ROLE_LANDMARK_KINDS) {
    const c = best[kind];
    if (!c) continue;
    out.push({ kind, fileId: c.file.id, path: c.file.path, basis: c.basis });
  }
  cache.set(city, out);
  return out;
}

/**
 * Only the landmarks whose file this level actually draws. A prop needs a roof;
 * a landmark that lives one drill-in away must not borrow another building's.
 */
export function roleLandmarksOnLevel(
  landmarks: readonly RoleLandmark[],
  drawnFileIds: ReadonlySet<string>,
): RoleLandmark[] {
  return landmarks.filter((landmark) => drawnFileIds.has(landmark.fileId));
}

export interface RoleLandmarkRoof {
  /** World-space Y where the prop's base sits. */
  baseY: number;
  /** Horizontal scale derived from the building's smaller footprint. */
  scale: number;
  /** Main mass height in local units (the prop group is scaled by `scale`). */
  bodyHeight: number;
}

const MIN_SCALE = 0.55;
const MAX_SCALE = 1.6;
const SCALE_PER_METRE = 0.45;

/** Pure roof geometry so the prop and its tests agree on one anchor. */
export function roleLandmarkRoof(
  kind: RoleLandmarkKind,
  w: number,
  d: number,
  h: number,
): RoleLandmarkRoof {
  const height = Number.isFinite(h) ? h : 0;
  const footprint = Math.min(Math.abs(w), Math.abs(d));
  const usable = Number.isFinite(footprint) && footprint > 0 ? footprint : 1;
  const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, usable * SCALE_PER_METRE));
  const bodyHeight =
    kind === "factory" ? 2.6 : kind === "watchtower" ? 1.5 : kind === "lighthouse" ? 1.8 : 0.9;
  return { baseY: height + 0.04, scale, bodyHeight };
}
