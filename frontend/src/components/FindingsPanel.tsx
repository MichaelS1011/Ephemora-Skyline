import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../stores/useStore";
import { allFiles } from "../city/layout";
import { severityColor, languageColor } from "../city/palette";
import type { CityFile, CityFinding, ReviewStatus, Severity } from "../city/types";
import { findingKey, reviewKeyFor } from "../reviews";
import { t, type DictKey } from "../i18n";
import { FindingMessage } from "./InfoPanel";

const SEVERITY_RANK: Record<Severity, number> = { P0: 0, P1: 1, P2: 2 };
/** Severity → i18n label (reuses the HUD filter vocabulary). */
const SEVERITY_LABEL_KEY: Record<Severity, DictKey> = {
  P0: "hud.sevCritical",
  P1: "hud.sevHigh",
  P2: "hud.sevMedium",
};
/** The same grade order as the words, so the badge reads without colour. */
const SEVERITY_SHAPE: Record<Severity, string> = { P0: "▲", P1: "◆", P2: "●" };

/** Status dot colors per review state (matches the InfoPanel review control). */
const REVIEW_DOT_COLOR: Record<ReviewStatus, string> = {
  reviewed: "#29d398",
  "false-positive": "#8f8b82",
  "to-fix": "#e8b23c",
};
const REVIEW_LABEL_KEY: Record<ReviewStatus, DictKey> = {
  reviewed: "findings.reviewLabelReviewed",
  "false-positive": "findings.reviewLabelFalsePositive",
  "to-fix": "findings.reviewLabelToFix",
};

/** How many file groups render initially and how many more each click adds. */
const INITIAL_GROUPS = 25;
const GROUP_STEP = 50;
const RULE_CHIP_LIMIT = 8;

/** A finding together with its index in the file's full findings list. */
interface GroupFinding {
  finding: CityFinding;
  index: number;
}

interface FileGroup {
  file: CityFile;
  findings: GroupFinding[];
  worst: number;
  count: number;
}

/** The identifier a rule filter matches on — same rule the triage queue uses. */
function ruleIdOf(finding: CityFinding): string {
  return finding.ruleId ?? finding.type;
}

/** Findings grouped by file, with severity + rule filters combined (AND). */
export function FindingsPanel() {
  const lang = useStore((s) => s.prefs.lang);
  const colorblind = useStore((s) => s.prefs.colorblind);
  const orphanedReviews = useStore((s) => s.orphanedReviews);
  const cityData = useStore((s) => s.cityData);
  const showFindings = useStore((s) => s.showFindings);
  const setShowFindings = useStore((s) => s.setShowFindings);
  const navigateToFile = useStore((s) => s.navigateToFile);
  const selectedUnit = useStore((s) => s.selectedUnit);
  const threatFilter = useStore((s) => s.threatFilter);
  const setThreatFilter = useStore((s) => s.setThreatFilter);
  const ruleFilter = useStore((s) => s.ruleFilter);
  const setRuleFilter = useStore((s) => s.setRuleFilter);
  const reviews = useStore((s) => s.reviews);
  const closeRef = useRef<HTMLButtonElement>(null);
  /** Rule chips show the frequent ones; this reveals the long tail. */
  const [showAllRules, setShowAllRules] = useState(false);

  // Pass 1: severity filter only — the rule chips count over this pool so
  // their counts stay stable while a rule chip is toggled.
  const severityGroups = useMemo<FileGroup[]>(() => {
    if (!cityData) return [];
    return allFiles(cityData)
      .map(({ file }) => ({
        file,
        findings: file.findings
          .map((finding, index) => ({ finding, index }))
          .filter(({ finding }) => threatFilter === "all" || finding.severity === threatFilter),
      }))
      .filter(({ findings }) => findings.length > 0)
      .map(({ file, findings }) => ({
        file,
        findings,
        worst: Math.min(...findings.map(({ finding }) => SEVERITY_RANK[finding.severity])),
        count: findings.length,
      }))
      .sort(
        (a, b) => a.worst - b.worst || b.count - a.count || a.file.linesOfCode - b.file.linesOfCode,
      );
  }, [cityData, threatFilter]);

  // Pass 2: rule filter AND-combined on top of the severity filter.
  const groups = useMemo<FileGroup[]>(() => {
    if (!ruleFilter) return severityGroups;
    return severityGroups
      .map((group) => {
        const findings = group.findings.filter(({ finding }) => ruleIdOf(finding) === ruleFilter);
        return {
          file: group.file,
          findings,
          worst: Math.min(...findings.map(({ finding }) => SEVERITY_RANK[finding.severity])),
          count: findings.length,
        };
      })
      .filter((group) => group.findings.length > 0);
  }, [severityGroups, ruleFilter]);

  const ruleCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const group of severityGroups) {
      for (const { finding } of group.findings) {
        const rule = ruleIdOf(finding);
        counts.set(rule, (counts.get(rule) ?? 0) + 1);
      }
    }
    return counts;
  }, [severityGroups]);

  const ruleChips = useMemo(() => {
    const ranked = [...ruleCounts.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    );
    const top = showAllRules ? ranked : ranked.slice(0, RULE_CHIP_LIMIT);
    // An active filter must stay reachable even when it fell out of the top
    // slice (e.g. after narrowing the severity), otherwise it cannot be cleared.
    if (ruleFilter && !top.some(([rule]) => rule === ruleFilter)) {
      top.push([ruleFilter, ruleCounts.get(ruleFilter) ?? 0]);
    }
    return top;
  }, [ruleCounts, ruleFilter, showAllRules]);

  const totalFindings = groups.reduce((sum, group) => sum + group.count, 0);
  // Rule-independent total — the "All rules" chip must not shrink when a rule
  // chip is active, otherwise it would advertise a filtered count.
  const severityTotal = severityGroups.reduce((sum, group) => sum + group.count, 0);
  /**
   * V2: how many findings of the WHOLE scan carry a verdict. Counted over
   * every file the scan holds (never the filtered list — a filter must not
   * shrink the project's tally), resolved the way the triage resolves them
   * (`reviewKeyFor`). Orphaned verdicts match no finding, so they never count
   * here: "beurteilt" that pretends a renamed finding is decided would be the
   * prettified count S-P4 forbids. They are stated separately, in the same
   * line and in the note below.
   */
  const judgedTotal = useMemo(() => {
    if (!cityData) return 0;
    let judged = 0;
    for (const { file } of allFiles(cityData)) {
      file.findings.forEach((finding, index) => {
        if (reviews[reviewKeyFor(file, index, finding)]) judged++;
      });
    }
    return judged;
  }, [cityData, reviews]);
  /**
   * Findings the scan reported but this list cannot show because their file is
   * not drawn in the current view. Only stated unfiltered: under a severity or
   * rule filter the scan total has no comparable counterpart.
   */
  const scanTotal = cityData
    ? cityData.findingsBySeverity.P0 +
      cityData.findingsBySeverity.P1 +
      cityData.findingsBySeverity.P2
    : 0;
  const undrawn =
    threatFilter === "all" && ruleFilter === null ? Math.max(0, scanTotal - severityTotal) : 0;
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const selectedId = selectedUnit?.kind === "file" ? selectedUnit.id : null;

  // Incremental unfolding: only the first window of groups renders so the
  // panel stays smooth with thousands of findings.
  const [visibleCount, setVisibleCount] = useState(INITIAL_GROUPS);
  // Any filter or city change swaps the list underneath the window — restart.
  useEffect(() => {
    setVisibleCount(INITIAL_GROUPS);
  }, [groups]);
  const visibleGroups = groups.slice(0, visibleCount);
  const remainingGroups = groups.length - visibleGroups.length;

  useEffect(() => {
    if (!selectedId) return;
    const index = groups.findIndex((group) => group.file.id === selectedId);
    // A selected file outside the rendered window must be unfolded first;
    // the effect re-runs once visibleCount covers it and then scrolls.
    if (index >= visibleCount) {
      setVisibleCount(index + 1);
      return;
    }
    rowRefs.current.get(selectedId)?.scrollIntoView({ block: "nearest" });
  }, [selectedId, showFindings, groups, visibleCount]);

  useEffect(() => {
    if (!showFindings) return;
    const previousFocus = document.activeElement;
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent): void => {
      // More, search and dialogs own Escape; file details are one level above
      // the list and the app closes those before returning to the findings.
      const hasNestedSurface =
        event.target instanceof Element &&
        event.target.closest('[role="menu"], [role="combobox"], [role="dialog"]');
      if (
        event.key === "Escape" &&
        !hasNestedSurface &&
        useStore.getState().selectedUnit?.kind !== "file"
      ) {
        event.preventDefault();
        event.stopPropagation();
        useStore.getState().setShowFindings(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
        previousFocus.focus({ preventScroll: true });
    };
  }, [showFindings]);

  if (!cityData || !showFindings) return null;

  // Byte-stable EN pluralization: four summary variants instead of an "s" suffix
  const summaryKey =
    totalFindings === 1
      ? groups.length === 1
        ? "findings.summaryFF"
        : "findings.summaryFP"
      : groups.length === 1
        ? "findings.summaryPF"
        : "findings.summaryPP";

  return (
    <section
      id="findings-panel"
      aria-labelledby="findings-heading"
      // Stated, not merely implied: a `<section>` with a name is a region
      // landmark to an AT, but the acceptance pass could only read roles, and
      // the two side panels that DO declare one looked like the difference.
      role="region"
      className="panel-findings panel-card pointer-events-auto"
    >
      <div className="panel-head">
        <div className="min-w-0">
          <h2 id="findings-heading" className="panel-title">
            {t(lang, "findings.heading")}
          </h2>
          <p className="panel-subtitle">
            {t(lang, summaryKey, { count: totalFindings, files: groups.length })}
          </p>
          {/* V2: the project's own progress, permanent once the first verdict
              exists — the return visit sees its earlier work at once. The
              orphaned variant counts the stranded verdicts in the same line,
              labelled apart, so the tally never silently loses them. */}
          {Object.keys(reviews).length > 0 && (
            <p className="panel-subtitle" data-judged-tally>
              {t(
                lang,
                orphanedReviews > 0 ? "findings.judgedTallyOrphaned" : "findings.judgedTally",
                {
                  judged: judgedTotal,
                  total: scanTotal,
                  orphans: orphanedReviews,
                },
              )}
            </p>
          )}
          {undrawn > 0 && (
            <p className="panel-note">{t(lang, "findings.undrawn", { count: undrawn })}</p>
          )}
          {orphanedReviews > 0 && (
            <p className="panel-note">
              {t(lang, "findings.orphanedReviews", { count: orphanedReviews })}
            </p>
          )}
        </div>
        <button
          ref={closeRef}
          type="button"
          onClick={() => setShowFindings(false)}
          aria-label={t(lang, "findings.closeAria")}
          className="panel-close"
        >
          ×
        </button>
      </div>

      <div
        className="filter-row filter-row-priority"
        role="group"
        aria-label={t(lang, "findings.priorityGroupAria")}
      >
        {(["all", "P0", "P1", "P2"] as const).map((priority) => {
          const active = priority === threatFilter;
          return (
            <button
              key={priority}
              type="button"
              aria-pressed={active}
              onClick={() => setThreatFilter(priority)}
              title={
                priority === "all"
                  ? t(lang, "findings.allPrioritiesTitle")
                  : t(lang, "findings.priorityTitle", {
                      priority,
                      label: t(lang, SEVERITY_LABEL_KEY[priority]),
                    })
              }
              className="filter-chip"
              data-active={active || undefined}
              data-severity={priority === "all" ? undefined : priority}
              style={
                priority === "all"
                  ? undefined
                  : ({
                      "--severity": severityColor(priority as Severity, colorblind),
                    } as React.CSSProperties)
              }
            >
              {priority !== "all" && (
                <span aria-hidden="true" className="severity-shape">
                  {SEVERITY_SHAPE[priority as Severity]}
                </span>
              )}
              {priority === "all"
                ? t(lang, "findings.allPriorities")
                : t(lang, SEVERITY_LABEL_KEY[priority as Severity])}
              <span className="filter-count">
                {priority === "all"
                  ? cityData.findingsBySeverity.P0 +
                    cityData.findingsBySeverity.P1 +
                    cityData.findingsBySeverity.P2
                  : cityData.findingsBySeverity[priority]}
              </span>
            </button>
          );
        })}
      </div>

      {ruleChips.length > 0 && (
        <div
          className="filter-row filter-row-rules"
          role="group"
          aria-label={t(lang, "findings.ruleGroupAria")}
        >
          <button
            type="button"
            aria-pressed={ruleFilter === null}
            onClick={() => setRuleFilter(null)}
            title={t(lang, "findings.allRulesTitle")}
            className="filter-chip"
            data-active={ruleFilter === null || undefined}
          >
            {t(lang, "findings.allRules")}
            <span className="filter-count">{severityTotal}</span>
          </button>
          {ruleChips.map(([rule, count]) => {
            const active = ruleFilter === rule;
            return (
              <button
                key={rule}
                type="button"
                aria-pressed={active}
                onClick={() => setRuleFilter(active ? null : rule)}
                title={t(lang, "findings.ruleTitle", { rule })}
                className="filter-chip filter-chip-rule"
                data-active={active || undefined}
              >
                <span className="filter-chip-label font-jetbrains">{rule}</span>
                <span className="filter-count">{count}</span>
              </button>
            );
          })}
          {ruleCounts.size > RULE_CHIP_LIMIT && (
            <button
              type="button"
              onClick={() => setShowAllRules((v) => !v)}
              title={t(lang, showAllRules ? "findings.fewerRulesTitle" : "findings.moreRulesTitle")}
              className="filter-chip filter-chip-quiet"
            >
              {showAllRules
                ? t(lang, "findings.fewerRules")
                : t(lang, "findings.moreRules", { count: ruleCounts.size - RULE_CHIP_LIMIT })}
            </button>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {groups.length === 0 && (
          <div
            className="px-3 py-8 text-center text-sm leading-relaxed"
            style={{ color: "#dedbd3" }}
          >
            <p>
              {ruleFilter
                ? threatFilter === "all"
                  ? t(lang, "findings.emptyRule", { rule: ruleFilter })
                  : t(lang, "findings.emptyRulePriority", {
                      rule: ruleFilter,
                      priority: t(lang, SEVERITY_LABEL_KEY[threatFilter as Severity]),
                    })
                : threatFilter === "all"
                  ? t(lang, "findings.emptyAll")
                  : t(lang, "findings.emptyPriority", {
                      priority: t(lang, SEVERITY_LABEL_KEY[threatFilter as Severity]),
                    })}
            </p>
            {(threatFilter !== "all" || ruleFilter !== null) && (
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {threatFilter !== "all" && (
                  <button
                    type="button"
                    onClick={() => setThreatFilter("all")}
                    className="min-h-9 rounded-lg border border-white/20 px-3 text-xs hover:bg-white/5"
                  >
                    {t(lang, "findings.showAllPriorities")}
                  </button>
                )}
                {ruleFilter !== null && (
                  <button
                    type="button"
                    onClick={() => setRuleFilter(null)}
                    className="min-h-9 rounded-lg border border-white/20 px-3 text-xs hover:bg-white/5"
                  >
                    {t(lang, "findings.showAllRules")}
                  </button>
                )}
              </div>
            )}
            {threatFilter === "all" && ruleFilter === null && (
              <p className="mt-2 text-xs" style={{ color: "#aaa79e" }}>
                {t(lang, "findings.emptyHint")}
              </p>
            )}
          </div>
        )}
        {visibleGroups.map(({ file, worst, count, findings: groupFindings }) => {
          const fileSeverity: Severity = worst === 0 ? "P0" : worst === 1 ? "P1" : "P2";
          const accent = severityColor(fileSeverity, colorblind);
          const isSelected = selectedUnit?.kind === "file" && selectedUnit.id === file.id;
          const reviewedCount = groupFindings.filter(
            ({ index, finding }) => reviews[reviewKeyFor(file, index, finding)],
          ).length;
          return (
            <div
              key={file.id}
              ref={(element) => {
                if (element) rowRefs.current.set(file.id, element);
                else rowRefs.current.delete(file.id);
              }}
              className="finding-file-card"
              data-selected={isSelected || undefined}
              data-severity={fileSeverity}
              style={{ "--severity": accent } as React.CSSProperties}
            >
              <button
                type="button"
                onClick={() => navigateToFile(file.id)}
                title={t(lang, "findings.fileTitle", { name: file.name })}
                className="finding-file-head"
                aria-label={t(lang, "findings.fileAria", { path: file.path })}
              >
                <span className="finding-file-title-row">
                  <span className="finding-file-name">{file.name}</span>
                  <span className="finding-file-tally">
                    <span className="finding-reviewed" title={t(lang, "findings.reviewedTitle")}>
                      {t(lang, "findings.reviewedCount", { reviewed: reviewedCount, count })}
                    </span>
                    <span
                      className="finding-count"
                      title={t(lang, "findings.countTitle", { count })}
                    >
                      {count}
                    </span>
                  </span>
                </span>
                <span className="finding-file-path-row">
                  <span
                    aria-hidden="true"
                    className="finding-file-dot"
                    style={{ background: languageColor(file.language) }}
                  />
                  <span className="finding-file-path">{file.path}</span>
                </span>
              </button>

              <div className="px-3 pb-2">
                {[...groupFindings]
                  .sort(
                    (a, b) =>
                      SEVERITY_RANK[a.finding.severity] - SEVERITY_RANK[b.finding.severity] ||
                      a.finding.line - b.finding.line,
                  )
                  .map(({ finding, index }) => {
                    const review = reviews[reviewKeyFor(file, index, finding)];
                    const sevColor = severityColor(finding.severity, colorblind);
                    return (
                      <button
                        key={index}
                        type="button"
                        onClick={() => {
                          navigateToFile(file.id);
                          useStore.getState().setFocusedFindingKey(findingKey(file.id, index));
                        }}
                        className="finding-row"
                        title={t(lang, "findings.findingTitle", {
                          name: file.name,
                          line: finding.line,
                        })}
                      >
                        {review && (
                          <span
                            aria-hidden="true"
                            className="finding-review-dot"
                            style={{ background: REVIEW_DOT_COLOR[review] }}
                          />
                        )}
                        <span
                          className="severity-chip finding-severity"
                          data-severity={finding.severity}
                          style={{ color: sevColor }}
                          title={finding.severity}
                        >
                          <span aria-hidden="true" className="severity-chip-shape">
                            {SEVERITY_SHAPE[finding.severity]}
                          </span>
                          {t(lang, SEVERITY_LABEL_KEY[finding.severity])}
                        </span>
                        <span className="finding-row-text">
                          {review && (
                            <span className="sr-only">{t(lang, REVIEW_LABEL_KEY[review])}: </span>
                          )}
                          <FindingMessage finding={finding} />
                          <span className="finding-row-meta">
                            {t(lang, "panel.sourceLine", { line: finding.line })}{" "}
                            <span aria-hidden="true">·</span> {finding.type}
                          </span>
                        </span>
                      </button>
                    );
                  })}
              </div>
            </div>
          );
        })}
        {remainingGroups > 0 && (
          <button
            type="button"
            onClick={() =>
              setVisibleCount((current) => Math.min(groups.length, current + GROUP_STEP))
            }
            className="min-h-9 w-full rounded-lg border border-white/20 px-3 text-xs hover:bg-white/5"
            style={{ color: "#dedbd3", background: "rgba(255,255,255,0.03)" }}
          >
            {t(lang, "findings.showMore", { count: remainingGroups })}
          </button>
        )}
      </div>

      <p
        className="shrink-0 border-t border-white/10 px-4 py-3 text-xs leading-relaxed"
        style={{ color: "#aaa79e" }}
      >
        {t(lang, "findings.hint")}
      </p>
    </section>
  );
}
