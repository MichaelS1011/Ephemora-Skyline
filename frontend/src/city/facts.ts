import { useEffect, useState } from "react";
import type { Severity } from "./types";

/**
 * The one answer to "how many findings".
 *
 * Three surfaces asked this question their own way: the header summed over the
 * record's own keys, the dock and the scan banner added `P0 + P1 + P2` by hand.
 * Those agree while `Severity` has exactly three members and part company the
 * day a fourth joins it — the header would grow, the dock would not, and the
 * city would state two totals about one scan. The minimap bug this week was the
 * same shape: one fact, two owners.
 *
 * Summing over the keys is the deliberate choice: a new severity is counted
 * before anyone remembers to write the line that counts it.
 */
export function severityTotal(by: Record<Severity, number>): number {
  return Object.values(by).reduce((sum, count) => sum + (Number.isFinite(count) ? count : 0), 0);
}

/** The same record read for one class — the header's chips and the filters. */
export function severityCount(by: Record<Severity, number>, id: Severity): number {
  return by[id] ?? 0;
}

/**
 * The words a rule class is read by, taken from the findings that carry them.
 *
 * Engine ids (`regex:EVAL_USAGE`) are for the rule files and the agent line;
 * a filter chip is read by a person. The scan already ships the curated class
 * name per finding, so the chip borrows it from the findings instead of
 * keeping a second table that could drift. Unknown classes — a rule newer than
 * this build — fall back to the id in a friendlier shape, never to nothing.
 */
export function ruleClassLabel(
  findings: ReadonlyArray<{ ruleId?: string; type: string; label?: string; labelDe?: string }>,
  rule: string,
  lang: "en" | "de",
  classes: Record<string, { class: string; classDe?: string }> = {},
): string {
  // The chip is keyed by `ruleId ?? type` (see FindingsPanel); a finding carries
  // its class under `type`, so match on both — a ruff finding names itself
  // `ruff:E711` in the chip and `QUALITY_E711` in the knowledge base.
  const hit = findings.find((f) => f.ruleId === rule || f.type === rule);
  const carried = lang === "de" ? (hit?.labelDe ?? hit?.label) : hit?.label;
  if (carried) return carried;
  // Not every scan carries the label (the demo engine writes none), and the
  // chip must not fall back to an id for a class the table knows by name.
  const curated = classes[hit?.type ?? rule] ?? classes[rule.replace(/^[^:]+:/, "")];
  if (curated) return lang === "de" ? (curated.classDe ?? curated.class) : curated.class;
  // Unknown class: keep the id as the reader's only searchable word, minus the
  // engine prefix. The tooltip carries the full id.
  return rule.includes(":") ? rule.slice(rule.lastIndexOf(":") + 1) : rule;
}

/**
 * The curated class-name table, fetched once per page and shared.
 *
 * The table lives in the backend because the cards already read it there; a
 * second copy in the UI is the drift this file exists to prevent. A failed
 * fetch leaves the chips on their own carried labels or the id — never blank.
 */
let announced: Promise<Record<string, { class: string; classDe?: string }>> | null = null;
const EMPTY_CLASSES: Record<string, { class: string; classDe?: string }> = {};

function loadRuleClasses(): Promise<Record<string, { class: string; classDe?: string }>> {
  announced ??= fetch("/api/rule-classes", { headers: { Accept: "application/json" } })
    .then((res) =>
      res.ok
        ? (res.json() as Promise<Record<string, { class: string; classDe?: string }>>)
        : EMPTY_CLASSES,
    )
    .catch(() => EMPTY_CLASSES);
  return announced;
}

export function useRuleClassNames(): Record<string, { class: string; classDe?: string }> {
  const [classes, setClasses] =
    useState<Record<string, { class: string; classDe?: string }>>(EMPTY_CLASSES);
  useEffect(() => {
    let live = true;
    void loadRuleClasses().then((table) => {
      if (live) setClasses(table);
    });
    return () => {
      live = false;
    };
  }, []);
  return classes;
}
