/**
 * The project's own .gitignore, honoured before anything is counted.
 *
 * Why it lives here too: the browser walks the folder first, and a folder that
 * git does not track still costs a `File` object and a slot against the file
 * cap. Measured on this repository on 2026-10-12 with the walk rules below:
 * 17,360 candidate files and 262 MB were offered for a project of 392 files and
 * 3.4 MB, because 16,968 of them sat in local tooling folders the project's
 * .gitignore sets aside. The backend
 * already skips those paths; counting them first is what made the cap refuse a
 * folder the scan would have read happily.
 *
 * The block between the BEGIN/END markers is kept byte-identical with
 * `backend/src/services/analyzer/gitignore.ts`. Two tests enforce it —
 * `frontend/tests/gitignore-mirror.test.ts` and
 * `backend/tests/gitignore-mirror.test.ts` — so neither side can drift into a
 * private dialect: the same folder must be judged the same way on both sides of
 * the upload, or the numbers the screen prints stop meaning anything.
 */

// ── BEGIN gitignore mirror ────────────────────────────────────────────────
interface Rule {
  /** folder of the .gitignore that declared it, "" for the project root */
  dir: string;
  /** matches a file or directory named by the pattern */
  file: RegExp;
  /** matches anything INSIDE a directory named by the pattern */
  inside: RegExp;
  directoryOnly: boolean;
  negated: boolean;
  source: string;
}

/** glob -> regex source, with git's `*`, `?`, `**` and character classes */
function globSource(pattern: string): string {
  let out = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]!;
    if (c === "*") {
      if (pattern[i + 1] === "*") {
        if (pattern[i + 2] === "/") {
          out += "(?:.*/)?"; // a/**/b also matches a/b
          i += 2;
        } else {
          out += ".*";
          i += 1;
        }
      } else {
        out += "[^/]*";
      }
    } else if (c === "?") {
      out += "[^/]";
    } else if (c === "[") {
      const end = pattern.indexOf("]", i);
      if (end === -1) out += "\\[";
      else {
        out += pattern.slice(i, end + 1);
        i = end;
      }
    } else if ("\\.^$|()+{}=".includes(c)) {
      out += "\\" + c;
    } else {
      out += c;
    }
  }
  return out;
}

function compileRule(dir: string, line: string): Rule | null {
  const negated = line.startsWith("!");
  const body = (negated ? line.slice(1) : line).trim();
  if (!body) return null;
  const directoryOnly = body.endsWith("/");
  const withoutTrailing = directoryOnly ? body.slice(0, -1) : body;
  // A pattern with a slash anywhere but the end is anchored to its own
  // .gitignore folder; a bare name matches at any depth below it.
  const anchored = withoutTrailing.includes("/");
  const stripped = withoutTrailing.replace(/^\/+/, "");
  if (!stripped) return null;
  const source = globSource(stripped);
  const core = anchored ? source : `(?:.*/)?${source}`;
  return {
    dir,
    file: new RegExp(`^${core}/?$`),
    inside: new RegExp(`^${core}/`),
    directoryOnly,
    negated,
    source: line,
  };
}

export class IgnoreMatcher {
  private rules: Rule[] = [];

  /** Register the content of one .gitignore. `dir` is its folder, "" for root. */
  add(dir: string, content: string): this {
    const prefix = dir ? dir.replace(/\/+$/, "") + "/" : "";
    for (const raw of content.split("\n")) {
      const line = raw.replace(/\r$/, "").trimEnd();
      if (!line || line.startsWith("#")) continue;
      const rule = compileRule(prefix, line);
      if (rule) this.rules.push(rule);
    }
    return this;
  }

  /**
   * Is this project-relative path excluded? `kind` matters: git's `tmp/` names
   * a directory, so a FILE called `tmp` stays in the scan while the folder is
   * skipped before anything inside it is ever read.
   */
  isIgnored(relPath: string, kind: "file" | "dir" = "file"): boolean {
    const p = relPath.replace(/^\.?\/+/, "").replace(/\/+$/, "");
    if (!p) return false;
    let ignored = false;
    for (const rule of this.rules) {
      if (rule.dir && !p.startsWith(rule.dir)) continue;
      const rest = rule.dir ? p.slice(rule.dir.length) : p;
      if (!rest) continue;
      const hit = rule.directoryOnly
        ? (kind === "dir" && rule.file.test(rest)) || rule.inside.test(rest)
        : rule.file.test(rest);
      if (hit) ignored = !rule.negated;
    }
    return ignored;
  }

  /** Which rule decided — for tests and for the "why is this missing" panel. */
  reasonFor(relPath: string, kind: "file" | "dir" = "file"): string | null {
    const p = relPath.replace(/^\.?\/+/, "").replace(/\/+$/, "");
    let reason: string | null = null;
    for (const rule of this.rules) {
      if (rule.dir && !p.startsWith(rule.dir)) continue;
      const rest = rule.dir ? p.slice(rule.dir.length) : p;
      if (!rest) continue;
      const hit = rule.directoryOnly
        ? (kind === "dir" && rule.file.test(rest)) || rule.inside.test(rest)
        : rule.file.test(rest);
      if (hit) reason = `${rule.dir || "/"}${rule.source}`;
    }
    return reason;
  }
}
// ── END gitignore mirror ──────────────────────────────────────────────────
