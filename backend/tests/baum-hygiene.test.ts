import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import path from "path";

/**
 * HYGIENE-03 — the tree a stranger gets.
 *
 * The product promise is "your code never leaves your machine", so the moment
 * this repository becomes public the tree itself is the thing under review:
 * a credential that rode along, a path that names who built it, a sentence in
 * an internal voice, a link to a file nobody ships, a picture nobody asked for.
 *
 * Every rule here runs over ONE set: `git ls-files --cached --others
 * --exclude-standard` — tracked plus untracked-and-not-ignored, which is
 * exactly what the next commit would carry. Nothing walks node_modules (the
 * set cannot contain it, and the first test says so), nothing reads a
 * dependency, nothing opens a socket.
 *
 * Where a finding lives in a file another role owns, it is reported, not
 * asserted here — a test that cannot go green is not a gate, it is noise.
 */

const REPO = path.resolve(import.meta.dirname, "../..");

function git(...args: string[]): string[] {
  return execFileSync("git", args, {
    cwd: REPO,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\n")
    .filter((line) => line.length > 0);
}

/** What a commit from this tree would carry. */
const DELIVERED = git("ls-files", "--cached", "--others", "--exclude-standard");
/** The part of it that is not in the index yet, so .gitignore still governs it. */
const UNTRACKED = git("ls-files", "--others", "--exclude-standard");
const DELIVERED_SET = new Set(DELIVERED);

const read = (rel: string): string => readFileSync(path.join(REPO, rel), "utf-8");

const BINARY_EXT = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".mp4",
  ".webm",
  ".mov",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".wasm",
]);
const isBinary = (rel: string): boolean => BINARY_EXT.has(path.extname(rel).toLowerCase());

const textFiles = DELIVERED.filter((f) => !isBinary(f) && existsSync(path.join(REPO, f)));
/** The documents a reader is pointed at: the root prose and docs/, nothing else. */
const shippedDocs = DELIVERED.filter(
  (f) => (/^[^/]+\.md$/.test(f) || /^docs\/[^/]+\.md$/.test(f)) && existsSync(path.join(REPO, f)),
);
const shippedMarkdown = DELIVERED.filter(
  (f) => f.endsWith(".md") && existsSync(path.join(REPO, f)),
);

/**
 * A pattern line of every ignore file that applies here. `read()` is defined
 * below, so this cannot use it.
 */
const ignoreRules = [
  readFileSync(path.join(REPO, ".gitignore"), "utf-8"),
  existsSync(path.join(REPO, ".git/info/exclude"))
    ? readFileSync(path.join(REPO, ".git/info/exclude"), "utf-8")
    : "",
]
  .join("\n")
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line.length > 0 && !line.startsWith("#"));

/** A rule can be written three ways — anchored, double-starred, plain — and all three name one directory. */
function ignoresDir(dir: string): boolean {
  const want = dir.replace(/\/+$/, "");
  return ignoreRules.some((rule) => {
    const bare = rule
      .replace(/^!/, "")
      .replace(/^\*\*\//, "")
      .replace(/^\//, "")
      .replace(/\/+$/, "");
    return bare === want;
  });
}

function ignoresPattern(pattern: string): boolean {
  return ignoreRules.includes(pattern);
}

/**
 * Folders that hold the work of building this, not the thing itself: handoffs
 * between roles, agent scratch, planning tool state, measurement dumps. They
 * carry machine-local paths and internal voice, so they are named in
 * .gitignore and never reach the commit set.
 */
/**
 * What counts as the work of building this, rather than the thing itself, is
 * read from `.gitignore` instead of listed here: the guard then covers the next
 * tool directory as well as the last one, and this file stops carrying the very
 * names it exists to keep out of the tree. `.turbo` is build cache, not a
 * person's environment, so it is not part of the claim.
 */
const WORKING_MATERIAL = ignoreRules
  // Two kinds of rule are not a directory: a negation (`!.env.example`, which
  // says the opposite of "ignored") and a plain file pattern (`.env`, `.env.*`).
  // Counting those as folders made `process.env` read as "a pointer at a local
  // scratch file" and pulled a shipped template into the leak list.
  .filter((rule) => !rule.startsWith("!") && rule.endsWith("/"))
  .map((rule) =>
    rule
      .replace(/^\*\*\//, "")
      .replace(/^\//, "")
      .replace(/\/+$/, ""),
  )
  .filter((name) => name !== ".turbo");

/**
 * The product must know a set of directories exists in order to skip them —
 * `.next`, `.vscode`, `.nyc_output` are part of its own scanner vocabulary, and a
 * source line naming them is the feature working, not a trace of the machine.
 * Subtracting that vocabulary leaves what really belongs to one builder: the
 * folders holding the work of building this here, and nowhere else.
 */
const SCANNER_VOCABULARY = [
  "backend/src/services/analyzer/orchestrator.ts",
  "frontend/src/hooks/useLocalAnalysis.ts",
]
  .map((f) => read(f))
  .join("\n");

const LOCAL_TOOL_DIRS = WORKING_MATERIAL.filter(
  (name) => name.startsWith(".") && !SCANNER_VOCABULARY.includes(name),
);

/** Absolute paths that belong to one machine, never to a repository. */
const MACHINE_PATH =
  /(?:\/(?:Users|home|var\/folders|private\/var\/folders)\/[A-Za-z0-9._-]+|[A-Za-z]:\\Users\\)/;
/** A host name from a LAN or a macOS box: only meaningful on the machine it came from. */
const MACHINE_HOST = /@[A-Za-z0-9._-]+\.(?:fritz\.box|local|lan|internal)\b/;
const MAIL_ADDRESS = /[\w.+-]+@[\w-]+\.[A-Za-z]{2,}/;
/** Credential shapes, the same families the shipped redactor masks. */
const TOKEN_SHAPE =
  /\b(?:gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9]{16,}|sk_live_[A-Za-z0-9]{16,}|sk-[A-Za-z0-9]{20,}|xox[baprs]-[0-9A-Za-z-]{6,}|AIza[0-9A-Za-z_-]{20,}|ya29\.[0-9A-Za-z_-]{20,})/;
/**
 * A key someone could actually use: an opened PEM block that closes again.
 * A lone `BEGIN` line is what the shipped redactor masks and what its own test
 * feeds it, so only the closed pair counts.
 */
const PRIVATE_KEY_BLOCK =
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]{8,}?-----END [A-Z0-9 ]*PRIVATE KEY-----/;
/** Files whose whole purpose is to hold a secret, so they must never be committed. */
const CREDENTIAL_FILE_NAMES = [
  /\.pem$/i,
  /\.key$/i,
  /\.pfx$/i,
  /\.p12$/i,
  /\.kdbx$/i,
  /^id_rsa$/,
  /^id_ed25519$/,
  /^id_ecdsa$/,
  /^id_dsa$/,
  /^\.netrc$/i,
  /^_netrc$/i,
];

describe("the set these rules run over", () => {
  it("is the commit set, and carries no dependency tree and no build output", () => {
    expect(DELIVERED.length, "git ls-files came back empty").toBeGreaterThan(100);
    const intruders = DELIVERED.filter((f) => /(^|\/)(node_modules|\.git)(\/|$)/.test(f));
    expect(intruders, `not the tree of this project:\n${intruders.join("\n")}`).toEqual([]);
    // The set is derived, never walked: this test reads no directory of
    // dependencies and opens no socket.
    expect(
      textFiles.every((f) => !f.includes("node_modules")),
      "the scan scope left the project tree",
    ).toBe(true);
  });
});

describe("the work of building the project stays out of the project", () => {
  it("names every working-material directory in .gitignore", () => {
    const missing = WORKING_MATERIAL.filter((dir) => !ignoresDir(dir));
    expect(missing, `.gitignore has no rule for:\n${missing.join("\n")}`).toEqual([]);
  });

  it("keeps every working-material directory out of what would be committed", () => {
    // The set is what a commit would carry — tracked plus new — because the
    // failure that matters is a file that got into the index before its folder
    // was ignored. Looking only at untracked files cannot see that one.
    const leaks = DELIVERED.filter((f) =>
      WORKING_MATERIAL.some((dir) => f === dir || f.startsWith(`${dir}/`)),
    );
    expect(
      leaks,
      `working material in the commit set (untrack it with \`git rm --cached <file>\`):\n${leaks.join("\n")}`,
    ).toEqual([]);
  });
});

describe("no machine-local trace in what a reader can search", () => {
  it("ships no markdown that carries a path from somebody's machine", () => {
    const offenders = shippedMarkdown
      .filter((f) => MACHINE_PATH.test(read(f)))
      .map(
        (f) =>
          `${f}:${
            read(f)
              .split("\n")
              .findIndex((l) => MACHINE_PATH.test(l)) + 1
          }`,
      );
    expect(offenders, `markdown with an absolute machine path:\n${offenders.join("\n")}`).toEqual(
      [],
    );
  });

  it("ships no markdown that carries a machine host name or a mail address", () => {
    const offenders = shippedMarkdown
      .filter((f) => {
        const text = read(f);
        return MACHINE_HOST.test(text) || MAIL_ADDRESS.test(text);
      })
      .map((f) => f);
    expect(
      offenders,
      `markdown naming a host or an address nobody publishes:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  /**
   * The upload root must not sit under a path some repository's .gitignore
   * covers. Measured on two byte-identical trees in one repo: semgrep scanned
   * 0 files and returned 0 findings when the root was ignored, 1 and 1 when it
   * was not — while the city still reported `semgrep: true`. `gitleaks` and the
   * regex engine read what the browser posted, so only semgrep sees the copy.
   */
  it("keeps the staged copy where the engines can still see it", () => {
    const defaults = {
      "backend/src/services/security/adapters/semgrep-adapter.ts": /codecity-semgrep-/,
      "backend/src/server/routes/local-analyze.ts": /codecity-uploads|CODECITY_UPLOAD_DIR/,
    };
    for (const [file, shape] of Object.entries(defaults)) {
      expect(read(file), `${file} lost the staging shape`).toMatch(shape);
    }
    const moved = read("backend/src/server/routes/local-analyze.ts");
    expect(
      moved,
      "the staging root no longer comes from an environment the operator controls",
    ).toMatch(/CODECITY_UPLOAD_DIR/);
  });

  it("ships no markdown that points at a folder nobody can see", () => {
    const escaped = LOCAL_TOOL_DIRS.map((d) => d.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const localOnly = new RegExp(`(?:^|[\`\\s(/])(?:${escaped.join("|")})(?![\\w-])`);
    const offenders = shippedMarkdown.filter((f) => localOnly.test(read(f))).map((f) => f);
    expect(
      offenders,
      `markdown citing a git-ignored scratch folder:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("derives the repository a script measures instead of naming who owns it", () => {
    const scripts = DELIVERED.filter((f) => f.startsWith("scripts/") && !isBinary(f));
    expect(scripts.length, "no script to check").toBeGreaterThan(0);
    const hardWired = scripts.filter((f) => /["'`][\w.-]+\/Ephemora-Skyline["'`]/.test(read(f)));
    expect(
      hardWired,
      `scripts/ hard-codes one account's repository path:\n${hardWired.join("\n")}`,
    ).toEqual([]);
    const machinePaths = scripts.filter((f) => MACHINE_PATH.test(read(f)));
    expect(machinePaths, `scripts/ hard-codes a machine path:\n${machinePaths.join("\n")}`).toEqual(
      [],
    );
  });
});

describe("no credential in the tree, and no door left open for one", () => {
  it("carries no private key a stranger could use", () => {
    const keys = textFiles.filter((f) => PRIVATE_KEY_BLOCK.test(read(f)));
    expect(keys, `a private key block in:\n${keys.join("\n")}`).toEqual([]);
  });

  it("carries no credential-bearing file name", () => {
    const offenders = DELIVERED.filter((f) => {
      const base = path.basename(f);
      return CREDENTIAL_FILE_NAMES.some((pattern) => pattern.test(base));
    });
    expect(offenders, `a file whose purpose is to hold a secret:\n${offenders.join("\n")}`).toEqual(
      [],
    );
    // .env stays untracked; only the documented example ships.
    const envs = DELIVERED.filter(
      (f) => path.basename(f) === ".env" || /^\.env\./.test(path.basename(f)),
    );
    expect(envs.filter((f) => !f.endsWith(".env.example")).join("\n")).toBe("");
  });

  it("keeps .gitignore in front of every credential carrier", () => {
    const required = [
      ".env",
      ".env.*",
      "!.env.example",
      "*.pem",
      "*.key",
      "*.pfx",
      "*.p12",
      "id_rsa",
      "id_ed25519",
      "id_ecdsa",
      "id_dsa",
      ".netrc",
      "_netrc",
    ];
    const missing = required.filter((pattern) => !ignoresPattern(pattern));
    expect(missing, `.gitignore has no rule for:\n${missing.join("\n")}`).toEqual([]);
  });

  it("hides no text inside a shipped image or video", () => {
    const media = DELIVERED.filter((f) => isBinary(f) && existsSync(path.join(REPO, f)));
    expect(media.length, "no media to check").toBeGreaterThan(0);
    const offenders: string[] = [];
    for (const rel of media) {
      const bytes = readFileSync(path.join(REPO, rel));
      // One pass over the raw container: an embedded tEXt/iTXt/zTXt/eXIf chunk
      // or an mp4 `udta` box still has to read as the project, not as a person.
      const ascii = bytes.toString("latin1");
      if (PRIVATE_KEY_BLOCK.test(ascii) || TOKEN_SHAPE.test(ascii) || MACHINE_PATH.test(ascii)) {
        offenders.push(rel);
      }
      for (const keyword of ["tEXt", "iTXt", "zTXt", "eXIf"]) {
        if (rel.endsWith(".png") && ascii.includes(keyword))
          offenders.push(`${rel} (${keyword} chunk)`);
      }
    }
    expect(offenders, `text embedded in a shipped asset:\n${offenders.join("\n")}`).toEqual([]);
  });
});

describe("what is linked also ships", () => {
  const SHIPPED_ROOTS = ["docs/", "scripts/", "backend/", "frontend/", "docker/", ".github/"];
  /** Every artifact path the shipped documents name, resolved against the repo.
   *  The extension list is the vocabulary of what may ship at all: when the
   *  README started carrying an animated GIF, a guard that could not see `.gif`
   *  called that asset an orphan while the document linked it twice. */
  const REFERENCE =
    /(?:\.{0,2}\/)?[\w./-]*\/[\w.-]+\.(?:png|jpe?g|gif|mp4|webm|mjs|ts|tsx|json|ya?ml|conf|sh|txt|example)\b/g;

  /** Every artifact path the shipped documents name, resolved against the repo. */
  const referenced = new Map<string, string[]>();
  for (const doc of shippedDocs) {
    for (const line of read(doc).split("\n")) {
      if (line.includes("://")) continue;
      for (const match of line.matchAll(REFERENCE)) {
        // A directory drawing in ARCHITECTURE.md lists a tree, it does not
        // point a reader at a file.
        if (/[├└│]/.test(line.slice(Math.max(0, match.index - 12), match.index))) continue;
        const raw = match[0].replace(/^\.\//, "");
        const rel = SHIPPED_ROOTS.some((root) => raw.startsWith(root))
          ? path.normalize(raw)
          : path.normalize(path.join(path.dirname(doc), raw));
        const seen = referenced.get(rel) ?? [];
        seen.push(doc);
        referenced.set(rel, seen);
      }
    }
  }

  it("points only at files that exist and are in the commit set", () => {
    // A runtime file the program itself writes (~/.ephemora-skyline/...) is
    // not part of what a commit ships — but the privacy promise REQUIRES the
    // docs to name it. That is a deliberate pointer, not a broken one.
    // Anchored on the start, this was directory-sensitive: the same runtime path
    // named from docs/PRIVACY.md resolved against docs/ and read as a broken
    // pointer. The home directory is the same file from any document.
    const RUNTIME_PATHS = [/(^|\/)\.ephemora-skyline\//];
    const broken: string[] = [];
    for (const [rel, docs] of referenced) {
      if (RUNTIME_PATHS.some((re) => re.test(rel))) continue;
      if (!existsSync(path.join(REPO, rel)))
        broken.push(`${rel} — named by ${docs.join(", ")} (absent)`);
      else if (!DELIVERED_SET.has(rel))
        broken.push(`${rel} — named by ${docs.join(", ")} (not delivered)`);
    }
    expect(broken, `a shipped document pointing at nothing public:\n${broken.join("\n")}`).toEqual(
      [],
    );
  });

  it("ships no asset in docs/assets that no document links", () => {
    const dir = path.join(REPO, "docs/assets");
    const orphans = readdirSync(dir, { recursive: true })
      .map(String)
      .filter((name) => statSync(path.join(dir, name)).isFile())
      .filter((name) => ![...referenced.keys()].some((rel) => rel === `docs/assets/${name}`));
    expect(
      orphans,
      `docs/assets/ carries screenshots nobody links:\n${orphans.join("\n")}`,
    ).toEqual([]);
  });
});

describe("the licence the files themselves claim", () => {
  const CLAIMS = [
    /\bBSL-1\.1\b/,
    /Business Source License 1\.1/,
    /All rights reserved/i,
    /change date/i,
  ];

  it("claims nothing in a source file that LICENSE contradicts", () => {
    const sources = DELIVERED.filter(
      (f) =>
        (f.startsWith("frontend/src/") ||
          f.startsWith("backend/src/") ||
          f.startsWith("scripts/")) &&
        !isBinary(f),
    );
    expect(sources.length, "no source to check").toBeGreaterThan(0);
    const offenders = sources
      .filter((f) => CLAIMS.some((claim) => claim.test(read(f))))
      .map((f) => `${f} — ${CLAIMS.find((claim) => claim.test(read(f)))?.source}`);
    expect(
      offenders,
      `a source file making its own licence claim:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  /**
   * A comment that points into a git-ignored scratch directory is twice wrong in a
   * public repository: the reader cannot open it, and it names the machine and the
   * tool that built the file. Five source comments did exactly that; the fact each
   * carried ("measured by a local probe, not shipped") stays, the pointer goes.
   * `scripts/` is exempt on purpose — there the path is code that runs, not prose.
   */
  it("points its own source at nothing that a stranger cannot open", () => {
    const sources = DELIVERED.filter(
      (f) => (f.startsWith("backend/src/") || f.startsWith("frontend/src/")) && !isBinary(f),
    );
    expect(sources.length, "no source to check").toBeGreaterThan(0);
    const localPointer = new RegExp(
      `(?:^|[\`\\s(/])(?:${LOCAL_TOOL_DIRS.map((d) => d.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?![\\w-])`,
    );
    const offenders = sources
      .map((f) => {
        const i = read(f)
          .split("\n")
          .findIndex((l) => localPointer.test(l));
        return i < 0 ? null : `${f}:${i + 1}`;
      })
      .filter((x): x is string => x !== null);
    expect(
      offenders,
      `a shipped source comment points at a local scratch file:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("states Apache-2.0 in the licence and in every package manifest", () => {
    expect(read("LICENSE")).toMatch(/Apache License\s+Version 2\.0, January 2004/);
    expect(read("NOTICE")).toMatch(/Copyright \(c\) \d{4} Ephemora/);
    for (const rel of ["package.json", "backend/package.json", "frontend/package.json"]) {
      expect(JSON.parse(read(rel)).license, rel).toBe("Apache-2.0");
    }
  });
});
