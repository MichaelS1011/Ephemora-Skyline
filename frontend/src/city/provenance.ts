import type { ScanProvenance } from "./types";
import { t, type Lang } from "../i18n";

/**
 * What the scan can honestly claim.
 *
 * "no findings" is a security statement, and the summary carries the proof
 * of how deep the scan actually went: without an engine the file was only
 * read by the regex baseline. Kept out of the component so the rule can be
 * tested without a canvas.
 *
 * THE ONE TABLE. The same engines have to answer two different questions —
 * "was this PROJECT audited for dependencies?" and "was this FILE looked at?" —
 * and they used to be answered from two lists that had drifted apart: the city
 * axis named `npm audit` and `osv-scanner`, the per-file axis (the payload's
 * `unverifiedBy`, built by `backend/src/services/security/scan-depth.ts`) named
 * only gitleaks, semgrep and ruff. Measured on `demo-001`: the city axis names
 * three engines, the file axis two, while 67 of 73 buildings look clean.
 *
 * One table now carries both roles, with two kinds of applicability:
 *  - `fileLanguages` — which languages this engine looks at, so its absence is
 *    a statement about a FILE (semgrep covers 17 languages, not Markdown:
 *    naming it on a docs file would be noise, not honesty).
 *  - `requiresFile` — engines whose findings land in a manifest rather than in
 *    a source file. `npm audit` needs a `package-lock.json`
 *    (`dependency-adapter.ts:45-52`); where there is nothing to audit, saying
 *    "the audit did not run" is not honesty but noise — and where there is,
 *    the manifest is the file that went unchecked.
 */
export interface EngineSpec {
  key: keyof ScanProvenance;
  label: string;
  /** Languages whose FILES this engine would have examined. */
  fileLanguages: "all" | readonly string[];
  /** The language fallback for a caller that cannot name the project's files. */
  needs?: RegExp;
  /** A file whose PATH makes this engine applicable at all (lockfile rule). */
  requiresFile?: RegExp;
  /** Attributable to a file, so the per-file axis may name it. */
  perFile: boolean;
}

const SEMGREP_LANGUAGES = [
  "JavaScript",
  "TypeScript",
  "Python",
  "Java",
  "Kotlin",
  "Go",
  "PHP",
  "Ruby",
  "Rust",
  "CSharp",
  "Swift",
  "JSON",
  "YAML",
  "SQL",
  "Shell",
  "HTML",
  "Terraform",
] as const;

/** Lockfiles a dependency CVE scan reads, across the ecosystems it supports. */
const LOCKFILES =
  /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|requirements[^/]*\.txt|Pipfile\.lock|poetry\.lock|Pipfile|go\.mod|go\.sum|Gemfile\.lock|composer\.lock|pom\.xml|build\.gradle(\.kts)?|gradle\.lockfile)$/i;

export const SECURITY_ENGINES: readonly EngineSpec[] = [
  { key: "gitleaks", label: "gitleaks", fileLanguages: "all", perFile: true },
  { key: "semgrep", label: "semgrep", fileLanguages: SEMGREP_LANGUAGES, perFile: true },
  { key: "ruff", label: "ruff", fileLanguages: ["Python"], needs: /^Python$/, perFile: true },
  {
    key: "dependencies",
    label: "npm audit",
    fileLanguages: [],
    needs: /^(JavaScript|TypeScript)$/,
    requiresFile: /(^|\/)package-lock\.json$/i,
    perFile: false,
  },
  {
    key: "osv",
    label: "osv-scanner",
    fileLanguages: [],
    needs: /^Python$/,
    requiresFile: LOCKFILES,
    perFile: false,
  },
];

const coversLanguage = (spec: EngineSpec, language: string): boolean =>
  spec.fileLanguages === "all" || spec.fileLanguages.includes(language);

const ran = (provenance: ScanProvenance | undefined, key: keyof ScanProvenance): boolean =>
  provenance?.[key] === true;

/**
 * Which switched-off engines would have looked at THIS FILE.
 *
 * The per-file rule the backend applies, plus the manifests: a lockfile that no
 * dependency audit read is unverified ground in exactly the place a CVE finding
 * would have appeared.
 */
export function missingEnginesForFile(
  file: { language?: string; path?: string },
  provenance: ScanProvenance | undefined,
): string[] {
  if (!provenance) return [];
  const language = file.language ?? "";
  const path = file.path ?? "";
  return SECURITY_ENGINES.filter(
    (e) =>
      !ran(provenance, e.key) &&
      ((e.perFile && coversLanguage(e, language)) ||
        (e.requiresFile !== undefined && e.requiresFile.test(path))),
  ).map((e) => e.label);
}

/**
 * Which engines a WHOLE PROJECT's result is missing.
 *
 * `files` is the project's file list; with it, applicability is decided by what
 * is actually in the folder (no lockfile, no dependency audit to wait for).
 * Without it the caller only knows the languages, and the language fallback
 * answers — which is the looser of the two, and why the payload's own
 * `unverifiedEngines` may name fewer engines than this does.
 */
export function missingEnginesForProject(
  provenance: ScanProvenance | undefined,
  languages: Record<string, number>,
  files?: readonly string[],
): string[] {
  if (!provenance) return [];
  const present = Object.keys(languages);
  const applicable = (e: EngineSpec): boolean => {
    // A manifest engine is earned by the manifest: nothing to audit is no gap.
    if (e.requiresFile)
      return files === undefined
        ? !!e.needs && present.some((l) => e.needs!.test(l))
        : files.some((p) => e.requiresFile!.test(p));
    if (e.fileLanguages === "all") return files === undefined || files.length > 0;
    if (e.fileLanguages.length > 0) return present.some((l) => coversLanguage(e, l));
    return !e.needs || present.some((l) => e.needs!.test(l));
  };
  return SECURITY_ENGINES.filter((e) => !ran(provenance, e.key) && applicable(e)).map(
    (e) => e.label,
  );
}

/**
 * Close the per-file gap in a payload that arrived.
 *
 * The backend attributes gitleaks/semgrep/ruff and stops there, so a project
 * scanned without the dependency audit has files that read as checked while the
 * audit never looked at their lockfile. Union — never subtract: an engine the
 * backend named stays named. Returns how many files the pass changed, which is
 * what the panel's unchecked count should be measured against.
 *
 * Runs once, at the one place a city enters the app (`setCityData`), so every
 * consumer of `unverifiedBy` — tooltip, heatmap, panel — reads one truth.
 */
export function mergeEngineGaps(city: unknown): number {
  if (!city || typeof city !== "object") return 0;
  const root = city as {
    scanProvenance?: ScanProvenance;
    tree?: unknown;
    additionalFiles?: unknown;
  };
  const provenance = root.scanProvenance;
  if (!provenance) return 0;
  if (SECURITY_ENGINES.every((e) => ran(provenance, e.key))) return 0;

  let changed = 0;
  const apply = (file: unknown) => {
    if (!file || typeof file !== "object") return;
    const f = file as { path?: string; language?: string; unverifiedBy?: string[] };
    if (typeof f.path !== "string") return;
    const missing = missingEnginesForFile(f, provenance);
    if (missing.length === 0) return;
    const have = f.unverifiedBy ?? [];
    const next = [...have];
    for (const name of missing) if (!next.includes(name)) next.push(name);
    if (next.length !== have.length) {
      f.unverifiedBy = next.sort();
      changed++;
    }
  };
  const applyList = (list: unknown) => {
    if (Array.isArray(list)) for (const f of list) apply(f);
  };

  // Only the two file lists a payload carries. Findings, sections and
  // connections are walked past: a finding has a path too, and attributing an
  // engine to it would be a statement about nothing.
  applyList(root.additionalFiles);
  const stack: unknown[] = [root.tree];
  const seen = new WeakSet<object>();
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== "object" || seen.has(node)) continue;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const child of node) stack.push(child);
      continue;
    }
    const dir = node as { detailFiles?: unknown; districtFiles?: unknown; children?: unknown };
    applyList(dir.detailFiles);
    applyList(dir.districtFiles);
    if (Array.isArray(dir.children)) for (const c of dir.children) stack.push(c);
  }
  return changed;
}

/**
 * "one file kept out" and "49 files kept out" are different statements about
 * the same scan, and the count is what the user weighs. Both panels read this
 * so the wording cannot drift apart between them.
 */
export function describeGitignoreSkips(
  skipped: { files: number; directories: number } | undefined,
  lang: Lang,
): string {
  if (!skipped) return "";
  const parts: string[] = [];
  if (skipped.files > 0)
    parts.push(
      t(lang, skipped.files === 1 ? "prov.skipFile" : "prov.skipFiles", {
        n: skipped.files.toLocaleString(),
      }),
    );
  if (skipped.directories > 0)
    parts.push(
      t(lang, skipped.directories === 1 ? "prov.skipFolder" : "prov.skipFolders", {
        n: skipped.directories.toLocaleString(),
      }),
    );
  return parts.join(t(lang, "prov.skipJoin"));
}

/**
 * What a building with no findings is allowed to claim.
 *
 * "safe" is the colour of a checked file. If the engines that cover this
 * file's language were switched off, the file was never a candidate for a
 * finding — it is unknown ground, and the city must show it as such.
 */
export function isUncheckedClean(file: { findings: unknown[]; unverifiedBy?: string[] }): boolean {
  return file.findings.length === 0 && (file.unverifiedBy?.length ?? 0) > 0;
}

export type ScanVerdict =
  | { kind: "findings" }
  | { kind: "clear" }
  /** zero findings, but engines that could have contributed did not run */
  | { kind: "shallow"; missing: string[] }
  /** the result carries no provenance at all — nothing to vouch for */
  | { kind: "unknown" };

export function scanVerdict(
  provenance: ScanProvenance | undefined,
  findingsTotal: number,
  languages: Record<string, number>,
  /** the project's file paths — what makes a dependency audit applicable at all */
  files?: readonly string[],
): ScanVerdict {
  if (findingsTotal > 0) return { kind: "findings" };
  if (!provenance) return { kind: "unknown" };
  const missing = missingEnginesForProject(provenance, languages, files);
  return missing.length > 0 ? { kind: "shallow", missing } : { kind: "clear" };
}
