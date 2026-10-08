/**
 * The scan's progress vocabulary.
 *
 * The backend's stage names stay the channel values on /api/status — this file
 * is the one place that turns them into dictionary keys, so a DE user reads the
 * whole wait in German instead of catching an English word mid-scan. The parity
 * test frontend/tests/scanStageNames.test.ts fails if the orchestrator emits a
 * stage nobody mapped here.
 */

import { t, type Lang } from "../i18n";

export type ScanStageKey =
  | "stage.enumerating"
  | "stage.parsing"
  | "stage.deepscan"
  | "stage.deps"
  | "stage.osv"
  | "stage.git"
  | "stage.dupes"
  | "stage.coverage"
  | "stage.final"
  | "stage.done";

/** Stage order of the pipeline — the checklist the progress block draws. */
export const SCAN_STAGES: readonly ScanStageKey[] = [
  "stage.enumerating",
  "stage.parsing",
  "stage.deepscan",
  "stage.deps",
  "stage.osv",
  "stage.git",
  "stage.dupes",
  "stage.coverage",
  "stage.final",
  "stage.done",
];

/**
 * Every raw stage string the pipeline can send. `stage.osv` has no emit of its
 * own (the CVE lookup runs inside the batch scan), so it joins the checklist but
 * carries no raw name.
 */
const RAW_STAGES: ReadonlyArray<{ raw: string; key: ScanStageKey }> = [
  { raw: "Enumerating files", key: "stage.enumerating" },
  { raw: "Parsing files", key: "stage.parsing" },
  { raw: "Deep scan (semgrep + gitleaks)", key: "stage.deepscan" },
  { raw: "Dependency audit (npm)", key: "stage.deps" },
  { raw: "Analyzing git history", key: "stage.git" },
  { raw: "Detecting code duplicates", key: "stage.dupes" },
  { raw: "Reading coverage reports", key: "stage.coverage" },
  { raw: "Finalizing results", key: "stage.final" },
  { raw: "Analysis complete", key: "stage.done" },
  // what GET /api/status/:id answers once the job is done
  { raw: "Complete", key: "stage.done" },
];

/** The raw strings, for the test that pins this table to the orchestrator. */
export const RAW_STAGE_NAMES: readonly string[] = RAW_STAGES.map((entry) => entry.raw);

const LOOKUP = new Map<string, ScanStageKey>(
  RAW_STAGES.map((entry) => [entry.raw.toLowerCase(), entry.key]),
);

export function stageKeyOf(raw: string | null | undefined): ScanStageKey | null {
  if (!raw) return null;
  return LOOKUP.get(raw.trim().toLowerCase()) ?? null;
}

export function stageLabel(lang: Lang, key: ScanStageKey): string {
  return t(lang, key);
}

/**
 * What to show when the server says something this file does not know. A raw
 * English string in a German wait screen was the finding; an invented one would
 * be worse, so the dictionary's "analysis running" answers instead.
 */
export function progressLine(lang: Lang, rawStage: string | null | undefined): string {
  const key = stageKeyOf(rawStage);
  return key ? stageLabel(lang, key) : t(lang, "analyze.pickAriaBusy");
}

export type StageState = "todo" | "active" | "done";

export interface StageEntry {
  key: ScanStageKey;
  label: string;
  state: StageState;
}

/**
 * The stages as a list with checkmarks: everything the server already named is
 * done, its own stage is active, the rest are still ahead. Until the first stage
 * arrives nothing is ticked — the list never claims a step nobody ran.
 */
export function stageEntries(lang: Lang, rawStage: string | null | undefined): StageEntry[] {
  const active = stageKeyOf(rawStage);
  const activeIndex = active ? SCAN_STAGES.indexOf(active) : -1;
  return SCAN_STAGES.map((key, index) => ({
    key,
    label: stageLabel(lang, key),
    state:
      activeIndex < 0
        ? "todo"
        : index < activeIndex
          ? "done"
          : index === activeIndex
            ? "active"
            : "todo",
  }));
}
