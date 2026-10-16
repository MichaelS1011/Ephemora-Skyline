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
 * The engine's name IN A GIVEN RESULT. `dependencies` is one boolean for two
 * different programs: the CVE question can be answered by osv-scanner (which is
 * then also the one that read the lockfile), by the npm audit fallback, or by
 * pip-audit. Naming `npm audit` for a scan it never took part in is the same
 * error the whole table exists to prevent, so the payload's `dependencyRunner`
 * decides the label wherever it is present; a payload written before the field
 * is read as the engine the flag is named for.
 */
const RUNNER_LABELS: Record<string, string> = {
  "npm-audit": "npm audit",
  osv: "osv-scanner",
  "osv-scanner": "osv-scanner",
  "pip-audit": "pip-audit",
};

export function engineLabel(spec: EngineSpec, provenance: ScanProvenance | undefined): string {
  // both manifest rows answer to the same runner: osv-scanner may have replied
  // with pip-audit, and a card that names the wrapper instead of the program
  // that ran is the error this function exists to stop
  const runner = provenance?.dependencyRunner;
  if (!runner) return spec.label;
  // the `dependencies` row is whichever program answered the CVE question; the
  // `osv` row is that program only when it was an osv-family runner — naming a
  // row after a program that is not it is the error this resolves
  if (spec.key === "dependencies") return RUNNER_LABELS[runner] ?? runner;
  if (
    spec.key === "osv" &&
    (runner === "osv" || runner === "pip-audit" || runner === "osv-scanner")
  )
    return RUNNER_LABELS[runner] ?? runner;
  return spec.label;
}

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
  ).map((e) => engineLabel(e, provenance));
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
  return SECURITY_ENGINES.filter((e) => !ran(provenance, e.key) && applicable(e)).map((e) =>
    engineLabel(e, provenance),
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

/**
 * The same question one level up: a district that shows zero findings is only
 * clean if the engines that cover its languages actually ran.
 *
 * Decided from the languages of the files the payload itself marks
 * `unverifiedBy` — the narrower answer, and the one that separates a TypeScript
 * plot (semgrep and gitleaks both apply) from a documents plot (only gitleaks
 * would have looked). Where a level ships no files at all, only an aggregate
 * count, the payload holds no per-file truth and the district's language map
 * answers — the looser of the two, the same order `missingEnginesForProject`
 * documents. A level that ships files and marks none of them unverified is
 * believed: the scan said what it looked at.
 */
export function missingEnginesForDistrict(
  dir: {
    detailFiles?: readonly { language?: string; unverifiedBy?: string[] }[];
    languages: Record<string, number>;
  },
  provenance: ScanProvenance | undefined,
): string[] {
  const shipped = dir.detailFiles ?? [];
  const unread = shipped.filter((f) => (f.unverifiedBy?.length ?? 0) > 0);
  if (shipped.length > 0 && unread.length === 0) return [];
  const languages =
    unread.length > 0
      ? [...new Set(unread.map((f) => f.language ?? ""))]
      : Object.keys(dir.languages ?? {});
  const missing = new Set<string>();
  for (const language of languages) {
    for (const label of missingEnginesForFile({ language }, provenance)) missing.add(label);
  }
  return [...missing];
}

/** How many files in a district the missing engines did not look at. */
export function uncheckedFileCount(dir: {
  unverifiedFiles?: number;
  fileCount: number;
  detailFiles?: readonly unknown[];
}): number {
  if ((dir.unverifiedFiles ?? 0) > 0) return dir.unverifiedFiles ?? 0;
  // An aggregate level's per-file truth is not in the payload; its own count is.
  return (dir.detailFiles ?? []).length > 0 ? 0 : dir.fileCount;
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

// ── S2 · the file card's own coverage statement ────────────────────────────

export interface FileCoverage {
  /** Engines that examined THIS file, the `regex` baseline named first. */
  examined: string[];
  /** Engines that ran over the project but do not open this file's format. */
  formatBlind: string[];
  /** No security engine covers the format at all — only the baseline read it. */
  noSecurityScan: boolean;
}

/**
 * Which engines looked at one file — derived from data already in the result
 * (the provenance flags × the engine/language table), no new backend field.
 * Measured on the first-touch panel (R3-02): `config/aws.ts` showed a bare
 * "✓ No findings in this file", and nothing on the card said that gitleaks
 * and semgrep had looked and classed the key as a known example. "Checked and
 * clean" and "nobody looked at this" are only distinguishable if the checked
 * card names its engines too.
 */
export function fileCoverage(
  file: { language?: string; path?: string },
  provenance: ScanProvenance | undefined,
): FileCoverage | null {
  if (!provenance) return null;
  const language = file.language ?? "";
  const path = file.path ?? "";
  const examined: string[] = provenance.regex === true ? ["regex"] : [];
  const formatBlind: string[] = [];
  let security = 0;
  for (const e of SECURITY_ENGINES) {
    if (!ran(provenance, e.key)) continue;
    const reads =
      (e.perFile && coversLanguage(e, language)) ||
      (e.requiresFile !== undefined && e.requiresFile.test(path));
    if (reads) {
      // one name per engine: the dependency row and the osv row can resolve to
      // the same program, and a card that lists it twice is a card nobody trusts
      const name = engineLabel(e, provenance);
      if (!examined.includes(name)) examined.push(name);
      security++;
    } else if (e.perFile && !coversLanguage(e, language)) {
      if (!formatBlind.includes(e.label)) formatBlind.push(e.label);
    }
  }
  return { examined, formatBlind, noSecurityScan: security === 0 };
}

/**
 * The coverage line in the reader's language, for the same slot the verdict
 * sits in. Null only when the payload carries no provenance at all — then the
 * card has nothing to vouch for and says nothing, as everywhere else.
 */
export function coverageLine(
  file: { language?: string; path?: string },
  provenance: ScanProvenance | undefined,
  lang: Lang,
): { kind: "examined" | "no-scanner"; text: string } | null {
  const cov = fileCoverage(file, provenance);
  if (!cov) return null;
  if (cov.noSecurityScan)
    return {
      kind: "no-scanner",
      text: cov.examined.includes("regex")
        ? t(lang, "panel.coverageNoScanner")
        : t(lang, "panel.coverageUnread"),
    };
  return {
    kind: "examined",
    text:
      t(lang, "panel.coverageExamined", { engines: cov.examined.join(", ") }) +
      (cov.formatBlind.length > 0
        ? t(lang, "panel.coverageBlind", { blind: cov.formatBlind.join(", ") })
        : ""),
  };
}

/**
 * What a threat word actually stands on.
 *
 * Measured (R3-03): `src/subtle.js` holds six severe classes no active rule
 * looks for and earns a bare MEDIUM chip whose only basis is one P2
 * `regex:CONSOLE_USAGE` hygiene note. A hygiene finding means "not a
 * vulnerability" by the backend's own category table — so a risk word raised
 * on nothing but hygiene notes must show that basis. Presentation of
 * provenance only: the computation underneath is untouched.
 */
export function verdictBasis(file: {
  findings: Array<{ category?: string; message?: string; ruleId?: string; type?: string }>;
}): { count: number; notes: string[] } | null {
  if (file.findings.length === 0) return null;
  if (!file.findings.every((f) => f.category === "hygiene")) return null;
  const notes = [...new Set(file.findings.map((f) => noteLabel(f)))];
  return { count: file.findings.length, notes };
}

/** The note's own leading clause, lower-cased: "Console output — …" → "console output". */
function noteLabel(f: { message?: string; ruleId?: string; type?: string }): string {
  const first = (f.message ?? "").split(" — ")[0]?.trim() ?? "";
  const raw = first || f.ruleId || f.type || "note";
  return raw.charAt(0).toLowerCase() + raw.slice(1);
}
