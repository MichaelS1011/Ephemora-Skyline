import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../stores/useStore";
import { allFiles } from "../city/layout";
import { SEVERITY_COLOR, languageColor } from "../city/palette";
import type { CityFile, CityFinding, ReviewStatus, Severity } from "../city/types";
import { findingKey } from "../reviews";
import { t, type DictKey } from "../i18n";

const SEVERITY_RANK: Record<Severity, number> = { P0: 0, P1: 1, P2: 2 };
/** Severity → i18n label (reuses the HUD filter vocabulary). */
const SEVERITY_LABEL_KEY: Record<Severity, DictKey> = {
  P0: "hud.sevCritical",
  P1: "hud.sevHigh",
  P2: "hud.sevMedium",
};

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
    const top = [...ruleCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, RULE_CHIP_LIMIT);
    // An active filter must stay reachable even when it fell out of the top
    // slice (e.g. after narrowing the severity), otherwise it cannot be cleared.
    if (ruleFilter && !top.some(([rule]) => rule === ruleFilter)) {
      top.push([ruleFilter, ruleCounts.get(ruleFilter) ?? 0]);
    }
    return top;
  }, [ruleCounts, ruleFilter]);

  const totalFindings = groups.reduce((sum, group) => sum + group.count, 0);
  // Rule-independent total — the "All rules" chip must not shrink when a rule
  // chip is active, otherwise it would advertise a filtered count.
  const severityTotal = severityGroups.reduce((sum, group) => sum + group.count, 0);
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
      className="panel-findings absolute top-[100px] right-4 bottom-[264px] z-30 flex flex-col overflow-hidden rounded-xl pointer-events-auto"
      style={{
        width: "min(400px, calc(100vw - 32px))",
        background: "rgba(32,32,30,0.97)",
        border: "1px solid rgba(242,239,232,0.16)",
        backdropFilter: "blur(14px)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
      }}
    >
      <div className="flex shrink-0 items-start justify-between gap-3 px-4 pb-3 pt-4">
        <div>
          <h2
            id="findings-heading"
            className="text-base font-semibold"
            style={{ color: "#f2efe8" }}
          >
            {t(lang, "findings.heading")}
          </h2>
          <p className="mt-1 text-xs" style={{ color: "#bab7ae" }}>
            {t(lang, summaryKey, { count: totalFindings, files: groups.length })}
          </p>
        </div>
        <button
          ref={closeRef}
          type="button"
          onClick={() => setShowFindings(false)}
          aria-label={t(lang, "findings.closeAria")}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg hover:bg-white/10"
          style={{ color: "#dedbd3", background: "rgba(255,255,255,0.04)" }}
        >
          ×
        </button>
      </div>

      {ruleChips.length > 0 && (
        <div
          className="flex shrink-0 flex-wrap gap-1 px-3 pb-2"
          role="group"
          aria-label={t(lang, "findings.ruleGroupAria")}
        >
          <button
            type="button"
            aria-pressed={ruleFilter === null}
            onClick={() => setRuleFilter(null)}
            title={t(lang, "findings.allRulesTitle")}
            className="min-h-9 rounded-lg px-3 text-xs font-medium hover:bg-white/5"
            style={{
              color: ruleFilter === null ? "#fff2e9" : "#bab7ae",
              background: ruleFilter === null ? "rgba(232,80,60,0.16)" : undefined,
              border: `1px solid ${ruleFilter === null ? "rgba(232,80,60,0.4)" : "transparent"}`,
            }}
          >
            {t(lang, "findings.allRules")}
            <span className="ml-1.5 tabular-nums" style={{ opacity: 0.75 }}>
              {severityTotal}
            </span>
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
                className="flex min-h-9 max-w-full items-center gap-1.5 rounded-lg px-3 text-xs font-medium hover:bg-white/5"
                style={{
                  color: active ? "#fff2e9" : "#bab7ae",
                  background: active ? "rgba(232,80,60,0.16)" : undefined,
                  border: `1px solid ${active ? "rgba(232,80,60,0.4)" : "transparent"}`,
                }}
              >
                <span className="truncate font-jetbrains">{rule}</span>
                <span className="shrink-0 tabular-nums" style={{ opacity: 0.75 }}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div
        className="flex shrink-0 flex-wrap gap-1 border-b border-white/10 px-3 pb-3"
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
              className="min-h-9 rounded-lg px-3 text-xs font-medium hover:bg-white/5"
              style={{
                color: active ? "#fff2e9" : "#bab7ae",
                background: active ? "rgba(232,80,60,0.16)" : undefined,
                border: `1px solid ${active ? "rgba(232,80,60,0.4)" : "transparent"}`,
              }}
            >
              {priority === "all" ? t(lang, "findings.allPriorities") : priority}
              <span className="ml-1.5 tabular-nums" style={{ opacity: 0.75 }}>
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
                      priority: threatFilter,
                    })
                : threatFilter === "all"
                  ? t(lang, "findings.emptyAll")
                  : t(lang, "findings.emptyPriority", { priority: threatFilter })}
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
          const accent = SEVERITY_COLOR[fileSeverity];
          const isSelected = selectedUnit?.kind === "file" && selectedUnit.id === file.id;
          const reviewedCount = groupFindings.filter(
            ({ index }) => reviews[findingKey(file.id, index)],
          ).length;
          return (
            <div
              key={file.id}
              ref={(element) => {
                if (element) rowRefs.current.set(file.id, element);
                else rowRefs.current.delete(file.id);
              }}
              className="overflow-hidden rounded-lg"
              style={{
                borderWidth: 1,
                borderStyle: "solid",
                borderColor: isSelected ? "rgba(232,80,60,0.45)" : "rgba(242,239,232,0.1)",
                borderLeftWidth: 3,
                borderLeftColor: accent,
                background: isSelected ? "rgba(232,80,60,0.06)" : "rgba(22,22,20,0.55)",
              }}
            >
              <button
                type="button"
                onClick={() => navigateToFile(file.id)}
                title={t(lang, "findings.fileTitle", { name: file.name })}
                className="w-full px-3 py-3 text-left hover:bg-white/5"
                aria-label={t(lang, "findings.fileAria", { path: file.path })}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="break-all text-sm font-semibold" style={{ color: "#f2efe8" }}>
                    {file.name}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span
                      className="text-[11px] tabular-nums"
                      style={{ color: "#aaa79e" }}
                      title={t(lang, "findings.reviewedTitle")}
                    >
                      {t(lang, "findings.reviewedCount", { reviewed: reviewedCount, count })}
                    </span>
                    <span
                      className="rounded-md px-1.5 py-0.5 text-xs tabular-nums"
                      style={{ color: accent, background: `${accent}15` }}
                      title={t(lang, "findings.countTitle", { count })}
                    >
                      {count}
                    </span>
                  </span>
                </div>
                <div className="mt-1 flex items-start gap-2">
                  <span
                    aria-hidden="true"
                    className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: languageColor(file.language) }}
                  />
                  <span
                    className="break-all font-jetbrains text-xs leading-relaxed"
                    style={{ color: "#aaa79e" }}
                  >
                    {file.path}
                  </span>
                </div>
              </button>

              <div className="px-3 pb-2">
                {[...groupFindings]
                  .sort(
                    (a, b) =>
                      SEVERITY_RANK[a.finding.severity] - SEVERITY_RANK[b.finding.severity] ||
                      a.finding.line - b.finding.line,
                  )
                  .map(({ finding, index }) => {
                    const review = reviews[findingKey(file.id, index)];
                    return (
                      <button
                        key={index}
                        type="button"
                        onClick={() => navigateToFile(file.id)}
                        className="flex min-h-10 w-full items-start gap-2 border-t border-white/5 py-2.5 text-left hover:bg-white/5"
                        title={t(lang, "findings.findingTitle", {
                          name: file.name,
                          line: finding.line,
                        })}
                      >
                        {review && (
                          <span
                            aria-hidden="true"
                            className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                            style={{ background: REVIEW_DOT_COLOR[review] }}
                          />
                        )}
                        <span
                          className="mt-px shrink-0 rounded px-1.5 py-0.5 text-xs font-medium"
                          style={{
                            color: SEVERITY_COLOR[finding.severity],
                            background: `${SEVERITY_COLOR[finding.severity]}12`,
                            border: `1px solid ${SEVERITY_COLOR[finding.severity]}44`,
                          }}
                        >
                          {finding.severity}
                        </span>
                        <span
                          className="min-w-0 text-[13px] leading-relaxed"
                          style={{ color: "#dedbd3", overflowWrap: "anywhere" }}
                        >
                          {review && (
                            <span className="sr-only">{t(lang, REVIEW_LABEL_KEY[review])}: </span>
                          )}
                          {finding.message}
                          <span className="mt-1 block text-xs" style={{ color: "#aaa79e" }}>
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
