import { useEffect, useRef, useState } from "react";
import { cityOnDisk, useStore } from "../stores/useStore";
import { allFiles, findFileById } from "../city/layout";
import { severityTotal } from "../city/facts";
import {
  authorColor,
  churnColor,
  languageColor,
  severityColor,
  UNCHECKED_COLOR,
} from "../city/palette";
import { coverageLine, isUncheckedClean, verdictBasis } from "../city/provenance";
import { OpenInIde } from "./OpenInIde";
import { findingKey, reviewKeyFor } from "../reviews";
import { formatCount, formatDecimal, t } from "../i18n";
import { PanelAdvice } from "./PanelAdvice";
import { focusBelongsToFile, lineSegmentFor } from "../findings/panelLogic";
import { learningCopy } from "./learningCopy";
import { FOCUS_PULSE_CSS, FindingRow, SEVERITY_WORD } from "./FindingCard";
import { RunTestsButton, SourceBlock, VoxelStructureBlock } from "./FilePanels";
import { BlastRadiusBlock } from "./BlastRadiusBlock";
import { GuideAction } from "./GuideAction";
import { MaintenanceAction } from "./MaintenanceAction";
import "../design/stadt-ui.css";
import "../design/learning.css";

/* ── Main panel ────────────────────────────────────────────────────────── */
export function InfoPanel() {
  const lang = useStore((s) => s.prefs.lang);
  const colorblind = useStore((s) => s.prefs.colorblind);
  const cityData = useStore((s) => s.cityData);
  const selectedUnit = useStore((s) => s.selectedUnit);
  const setSelectedUnit = useStore((s) => s.setSelectedUnit);
  const focusPath = useStore((s) => s.focusPath);
  const setFocusPath = useStore((s) => s.setFocusPath);
  const resetFocus = useStore((s) => s.resetFocus);
  const analysisId = useStore((s) => s.analysisId);
  const reviews = useStore((s) => s.reviews);
  const verdictsBlocked = useStore((s) => s.verdictsBlocked);
  const verdictsUnreadable = useStore((s) => s.verdictsUnreadable);
  const focusedFindingKey = useStore((s) => s.focusedFindingKey);
  const triageActive = useStore((s) => s.triageActive);
  const triageCursor = useStore((s) => s.triageCursor);
  const closeRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const wasTriage = useRef(false);
  const [linkCopied, setLinkCopied] = useState(false);
  /** A finding's line the reader asked to open; drives the source scroll. */
  const [sourceLine, setSourceLine] = useState<number | null>(null);
  const selectedId = selectedUnit?.kind === "file" ? selectedUnit.id : null;

  // Starting a triage moves the city and opens this panel, but keyboard focus
  // stayed on the document body. Once per triage, put it on the file the queue
  // landed on; later steps speak through TriageAnnouncer instead of stealing
  // focus from the Next button.
  useEffect(() => {
    const started = triageActive && !wasTriage.current;
    wasTriage.current = triageActive;
    if (!started) return;
    headingRef.current?.focus({ preventScroll: true });
  }, [triageActive]);

  useEffect(() => {
    setSourceLine(null);
  }, [selectedId]);

  useEffect(() => {
    if (sourceLine == null) return;
    document.querySelector("[data-source-block]")?.scrollIntoView({ block: "nearest" });
  }, [sourceLine]);

  useEffect(() => {
    if (!selectedId) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    // A learning action hides the context rail behind this file panel. Move
    // its keyboard focus to the panel's close action; pointer selections of
    // buildings on a desktop keep their existing focus.
    if (
      !window.matchMedia("(max-width: 760px)").matches &&
      !previousFocus?.closest(".panel-context-card")
    )
      return;
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [selectedId]);

  if (!cityData || selectedUnit?.kind !== "file") return null;

  const hit = findFileById(cityData, selectedUnit.id);
  if (!hit) return null;

  const file = hit.file;
  const accent = languageColor(file.language);
  // Line of the triage-focused finding — null when the focus targets another
  // file, the key is malformed, or the index no longer has a finding.
  const focusedLine = lineSegmentFor(focusedFindingKey, file);
  const inOtherDistrict = hit.chain.join("/") !== focusPath.join("/");
  const hasFindings = file.findings.length > 0;
  // UX 6 — when the triage opens on the first (heaviest) finding, the card's
  // first honest sentence states the whole scan's scope before the finding
  // itself: how many findings, across how many files, and that this card is the
  // first of them. The numbers come from the real payload, not from this one
  // file's list, and "first" means the queue's first position — a later step
  // says nothing about being first.
  const totalFindings = severityTotal(cityData.findingsBySeverity);
  const filesWithFindings = allFiles(cityData).filter(
    ({ file: f }) => f.findings.length > 0,
  ).length;
  const firstTriage =
    triageActive && triageCursor === 0 && focusBelongsToFile(focusedFindingKey, file.id);
  // Byte-stable EN pluralization, the same four shapes the findings list uses.
  const triageSummaryKey = firstTriage
    ? totalFindings === 1
      ? filesWithFindings === 1
        ? "findings.summaryFF"
        : "findings.summaryFP"
      : filesWithFindings === 1
        ? "findings.summaryPF"
        : "findings.summaryPP"
    : null;
  const hasAst = file.findings.some((f) => f.provenance === "semgrep");
  const hasSecrets = file.findings.some((f) => f.provenance?.startsWith("gitleaks"));
  // The heading wears the worst grade actually present instead of always P0
  // red: a file whose only finding is medium must not shout critical, and the
  // colour-blind switch has to reach this colour the way it reaches the city.
  const worstSeverity = (["P0", "P1", "P2"] as const).find((sev) =>
    file.findings.some((f) => f.severity === sev),
  );
  const engines = file.unverifiedBy ?? [];
  const unchecked = isUncheckedClean(file);
  // S2: the card states which engines examined THIS file, derived from the
  // payload's own provenance — the checked-clean case has to be tellable from
  // "nobody looked" at the place the verdict is read (R3-02).
  const coverage = coverageLine(file, cityData.scanProvenance, lang);
  // S2 · R3-03: a threat word raised on nothing but review-level notes says
  // so; the underlying severity computation is untouched.
  const chipBasis = worstSeverity ? verdictBasis(file) : null;
  // The line the editor should land on: a historical secret is evidence about
  // a commit, not about this file, so it never becomes the jump target.
  const firstLiveFindingLine = file.findings.find(
    (f) => !f.historyCommit && f.provenance !== "gitleaks-history",
  )?.line;

  const copyCityLink = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1400);
    } catch {
      /* clipboard unavailable — the button stays, the city link stays in the URL bar */
    }
  };

  const returnToCity = (project: boolean): void => {
    if (project) resetFocus();
    else setFocusPath(hit.chain);
    // The clicked control unmounts with the file panel. Focus the now-visible
    // overview instead of leaving a keyboard user on the document body.
    requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(".panel-context-card, .context-reopen")
        ?.focus({ preventScroll: true });
    });
  };

  // Layout lives in design/stadt-ui.css; only what the data decides — the
  // facade colour of this one file — travels as a custom property. The panel
  // is a region, not a dialog: the city, the findings list and the dock all
  // stay usable while it is open, and a `role="dialog"` without a focus trap
  // promises screen-reader users a mode the app does not have.
  return (
    <div
      className="panel-info panel-card panel-scroll animate-slide-right"
      style={{ "--accent": accent } as React.CSSProperties}
      role="region"
      aria-label={t(lang, "panel.fileDetailsAria", { name: file.name })}
    >
      {/* Keyframes for the triage focus pulse (see FOCUS_PULSE_CSS) */}
      <style>{FOCUS_PULSE_CSS}</style>

      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0 flex-1">
          {/* Language + stats row */}
          <div className="panel-metrics flex items-center gap-1.5 mb-2 flex-wrap">
            <span
              className="w-2.5 h-2.5 rounded-sm inline-block shrink-0"
              style={{ background: accent, boxShadow: `0 0 6px ${accent}` }}
            />
            <span
              className="font-jetbrains text-[length:var(--fs-meta)] tracking-[0.15em] uppercase"
              style={{ color: accent }}
              title={t(lang, "panel.langTitle")}
            >
              {file.language}
            </span>
            <span
              className="font-jetbrains text-[length:var(--fs-meta)]"
              style={{ color: "var(--meta-strong)" }}
            >
              ·
            </span>
            <span
              className="font-jetbrains text-[length:var(--fs-meta)]"
              style={{ color: "#8f8b82" }}
              title={t(lang, "panel.locTitle")}
            >
              {formatCount(lang, file.linesOfCode)} LOC
            </span>
            <span
              className="font-jetbrains text-[length:var(--fs-meta)]"
              style={{ color: "var(--meta-strong)" }}
            >
              ·
            </span>
            <span
              className="font-jetbrains text-[length:var(--fs-meta)]"
              style={{ color: "#8f8b82" }}
              title={t(lang, "panel.cxTitle")}
            >
              cx {file.cyclomaticComplexity}
            </span>
          </div>

          {/* Filename */}
          <h3 ref={headingRef} tabIndex={-1} className="panel-file-name font-jetbrains">
            {file.name}
          </h3>
          <p className="panel-file-path font-jetbrains">{file.path}</p>
        </div>

        <button
          onClick={() => setSelectedUnit(null)}
          ref={closeRef}
          aria-label={t(lang, "panel.closeAria")}
          className="btn-danger shrink-0 ml-3 w-6 h-6 flex items-center justify-center"
        >
          ✕
        </button>
      </div>

      {/* UX 6 — the first honest sentence on the first finding's card: the
          whole scan's scope, then the orientation that this card shows the
          first of it. Only the queue's first position may claim "first". */}
      {firstTriage && triageSummaryKey && (
        <p
          className="panel-triage-first font-jetbrains text-[length:var(--fs-meta)] leading-relaxed mb-3"
          data-first-finding
          style={{ color: "#d8c9a3" }}
        >
          {t(lang, "panel.triageFirstFinding", {
            summary: t(lang, triageSummaryKey, {
              count: formatCount(lang, totalFindings),
              files: formatCount(lang, filesWithFindings),
            }),
          })}
        </p>
      )}

      {/* Divider */}
      <div className="panel-rule" />

      {/* Findings */}
      {hasFindings ? (
        <>
          <div className="panel-section-head flex items-center justify-between mb-2.5">
            <span
              className="font-jetbrains text-[length:var(--fs-meta)] tracking-[0.2em] uppercase"
              style={{ color: severityColor(worstSeverity!, colorblind) }}
            >
              {t(
                lang,
                file.findings.length === 1 ? "panel.findingsCountOne" : "panel.findingsCountMany",
                { count: file.findings.length },
              )}
            </span>
            <span
              className="font-jetbrains text-[length:var(--fs-meta)]"
              style={{ color: "var(--meta-strong)" }}
              title={t(lang, "panel.provTitle")}
            >
              {[...new Set(file.findings.map((f) => f.provenance ?? "unknown"))].join(" · ")}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            {file.findings.map((f, i) => {
              const key = reviewKeyFor(file, i, f);
              return (
                <FindingRow
                  key={i}
                  finding={f}
                  index={i}
                  filePath={file.path}
                  reviewKey={key}
                  review={reviews[key] ?? null}
                  demo={cityData.analysisId === "demo-001"}
                  // The focus channel is positional and stays that way: every
                  // writer (triage, search, findings list) names the entry as
                  // `${fileId}#${index}`. A verdict is keyed by fingerprint.
                  // Comparing the focused finding against the verdict key meant
                  // no row ever lit up on a scan whose findings carry
                  // fingerprints — which is every scan the city mapper maps.
                  focused={focusedFindingKey === findingKey(file.id, i)}
                  onOpenLine={setSourceLine}
                />
              );
            })}
          </div>
          {/* The write failed, so every verdict on this screen is a verdict that
              dies with the tab. The store has carried that flag since the catch
              was closed; nothing on screen said it — a day of triage looked
              saved. */}
          {verdictsBlocked && (
            <p className="panel-note" role="alert" data-verdicts-blocked="true">
              ⚠ {t(lang, "panel.verdictsBlocked")}
            </p>
          )}
          {/* The other half of the same truth: the copy this machine keeps was
              there and would not read. An empty verdict list is not "nothing was
              judged" here, and the line that says so carries the word — the
              note's own neutral ink is not the signal. */}
          {verdictsUnreadable && (
            <p className="panel-note" role="alert" data-verdicts-unreadable="true">
              ⚠ {t(lang, "panel.verdictsUnreadable")}
            </p>
          )}
        </>
      ) : unchecked ? (
        /* The same file hovers grey in the city and its heat tile is grey:
           engines that cover this language never ran on it, so "no finding"
           is an unprovable claim, not a result. Green here would contradict
           two other surfaces that are already right. */
        <div
          className="file-verdict file-verdict-unchecked flex items-start gap-2 px-3 py-2.5 rounded-sm"
          data-file-verdict="unchecked"
          style={{
            color: UNCHECKED_COLOR,
            background: "rgba(107,106,99,0.10)",
            border: `1px solid ${UNCHECKED_COLOR}55`,
          }}
        >
          <span aria-hidden="true" className="file-verdict-mark">
            ⊘
          </span>
          <span className="min-w-0">
            <span className="font-jetbrains text-[length:var(--fs-meta)] block leading-relaxed">
              {t(
                lang,
                engines.length === 1 ? "panel.noFindingsUncheckedOne" : "panel.noFindingsUnchecked",
                { n: engines.length },
              )}
            </span>
            <span
              className="font-jetbrains text-[length:var(--fs-meta)] block mt-1"
              style={{ opacity: 0.85 }}
            >
              {engines.join(" · ")}
            </span>
          </span>
        </div>
      ) : (
        <div
          className="file-verdict file-verdict-checked flex items-center gap-2 px-3 py-2.5 rounded-sm"
          data-file-verdict="checked"
          style={{ background: "rgba(41,211,152,0.07)", border: "1px solid rgba(41,211,152,0.2)" }}
        >
          <span aria-hidden="true" className="file-verdict-mark" style={{ color: "#29d398" }}>
            ✓
          </span>
          <span
            className="font-jetbrains text-[length:var(--fs-meta)]"
            style={{ color: "#29d398" }}
          >
            {t(lang, "panel.noFindingsChecked")}
          </span>
        </div>
      )}
      {/* The coverage line sits in the same slot the verdict is read — for
          every file, found or not: which engines examined it, and where no
          security scanner even opens the format. */}
      {coverage && (
        <div
          className="file-coverage font-jetbrains text-[length:var(--fs-meta)] mt-1.5"
          data-file-coverage={coverage.kind}
          style={{ color: "#8f8b82" }}
        >
          {coverage.text}
        </div>
      )}
      <PanelAdvice advice={file.advice} lang={lang} />

      <nav className="file-learning-return" aria-label={learningCopy(lang, "overview")}>
        <button type="button" onClick={() => returnToCity(true)}>
          {learningCopy(lang, "overview")}
        </button>
        {hit.chain.length > 0 && (
          <button type="button" onClick={() => returnToCity(false)}>
            {learningCopy(lang, "district")}
          </button>
        )}
      </nav>

      {/* Navigate to district — keep the file selection so the panel the
          user is reading doesn't vanish underneath them */}
      {inOtherDistrict && (
        <button
          onClick={() => setFocusPath(hit.chain, { keepSelection: true })}
          className="w-full mb-3 py-1.5 font-jetbrains text-[length:var(--fs-meta)] tracking-widest rounded-sm transition-all duration-150 hover:opacity-90"
          style={{
            border: "1px solid rgba(242,239,232,0.14)",
            color: "var(--brand-ink)",
            background: "rgba(255,255,255,0.05)",
          }}
        >
          {t(lang, "panel.openDistrict", { path: hit.chain.join("/") })}
        </button>
      )}

      {/* Threat + provenance badges */}
      <div className="flex gap-1.5 flex-wrap mb-3">
        <span
          className="font-jetbrains text-[length:var(--fs-meta)] px-1.5 py-px rounded-sm uppercase tracking-wide"
          style={{
            color: "var(--meta-strong)",
            border: "1px solid rgba(100,130,170,0.3)",
            background: "rgba(100,130,170,0.08)",
          }}
          title={t(lang, "panel.threatTitle")}
        >
          {worstSeverity
            ? chipBasis
              ? t(lang, chipBasis.count === 1 ? "panel.chipBasisOne" : "panel.chipBasisMany", {
                  word: t(lang, SEVERITY_WORD[worstSeverity]),
                  count: chipBasis.count,
                  notes: chipBasis.notes.join(", "),
                })
              : t(lang, SEVERITY_WORD[worstSeverity])
            : t(lang, unchecked ? "panel.statusUnchecked" : "panel.statusNoFindings")}
        </span>
        {file.churnScore !== undefined &&
          (() => {
            // The same band the far heat grid paints: `churnColor` carries the
            // colour-blind variant, this chip used to hardwire the three steps.
            const churn = churnColor(file.churnScore ?? 0, colorblind);
            return (
              <span
                className="font-jetbrains text-[length:var(--fs-meta)] px-1.5 py-px rounded-sm"
                style={{
                  color: churn,
                  border: `1px solid ${churn}4d`,
                  background: `${churn}14`,
                }}
                title={t(lang, "panel.churnTitle", { commits: file.commitCount ?? 0 })}
              >
                CHURN {formatDecimal(lang, file.churnScore, 2)}
              </span>
            );
          })()}
        {file.exportedSymbols !== undefined && (
          <span
            className="font-jetbrains text-[length:var(--fs-meta)] px-1.5 py-px rounded-sm"
            style={{
              color: "#a78bfa",
              border: "1px solid rgba(167,139,250,0.3)",
              background: "rgba(167,139,250,0.08)",
            }}
            title={t(lang, "panel.apiTitle")}
          >
            API {file.exportedSymbols}
          </span>
        )}
        {file.deadCodeCandidate && (
          <span
            className="font-jetbrains text-[length:var(--fs-meta)] px-1.5 py-px rounded-sm"
            style={{
              color: "#d8cdb4",
              border: "1px solid rgba(210,200,180,0.35)",
              background: "rgba(210,200,180,0.1)",
            }}
            title={t(lang, "panel.deadCodeTitle")}
          >
            {t(lang, "panel.chipDeadCode")}
          </span>
        )}
        {file.bytes !== undefined && file.bytes >= 150_000 && (
          <span
            className="font-jetbrains text-[length:var(--fs-meta)] px-1.5 py-px rounded-sm"
            style={{
              color: "#9aa7b8",
              border: "1px solid rgba(154,167,184,0.4)",
              background: "rgba(154,167,184,0.1)",
            }}
            title={t(lang, "panel.hugeFileTitle")}
          >
            {formatDecimal(lang, file.bytes / 1024, 0)} KB
          </span>
        )}
        {file.inCycle && (
          <span
            className="font-jetbrains text-[length:var(--fs-meta)] px-1.5 py-px rounded-sm"
            style={{
              color: severityColor("P0", colorblind),
              border: `1px solid ${severityColor("P0", colorblind)}59`,
              background: `${severityColor("P0", colorblind)}14`,
            }}
            title={t(lang, "panel.cycleTitle")}
          >
            {t(lang, "panel.chipCycle")}
          </span>
        )}
        {file.coveragePct !== undefined && (
          <span
            className="font-jetbrains text-[length:var(--fs-meta)] px-1.5 py-px rounded-sm"
            style={{
              color: file.coveragePct >= 80 ? "#d8c9a3" : "#ffd23f",
              border: `1px solid ${file.coveragePct >= 80 ? "rgba(232,178,60,0.35)" : "rgba(255,210,63,0.35)"}`,
              background:
                file.coveragePct >= 80 ? "rgba(232,178,60,0.08)" : "rgba(255,210,63,0.08)",
            }}
            title={t(lang, "panel.coverageTitle")}
          >
            {t(lang, "panel.chipCoverage", { pct: file.coveragePct })}
          </span>
        )}
        {file.clonePartners && file.clonePartners.length > 0 && (
          <span
            className="font-jetbrains text-[length:var(--fs-meta)] px-1.5 py-px rounded-sm"
            style={{
              color: "#ffe14d",
              border: "1px solid rgba(255,225,77,0.4)",
              background: "rgba(255,225,77,0.08)",
            }}
            title={t(lang, "panel.cloneTitle", {
              paths: file.clonePartners.map((p) => p.path).join(", "),
            })}
          >
            {t(lang, "panel.chipClone", { count: file.clonePartners.length })}
          </span>
        )}
        {file.topAuthor && (
          <span
            className="font-jetbrains text-[length:var(--fs-meta)] px-1.5 py-px rounded-sm"
            style={{
              color: authorColor(file.topAuthor),
              border: `1px solid ${authorColor(file.topAuthor)}55`,
              background: `${authorColor(file.topAuthor)}14`,
            }}
            title={t(lang, "panel.blameTitle", { author: file.topAuthor })}
          >
            {file.topAuthor}
          </span>
        )}
        {hasAst && (
          <span
            className="font-jetbrains text-[length:var(--fs-meta)] px-1.5 py-px rounded-sm"
            style={{
              color: "#d8c9a3",
              border: "1px solid rgba(232,178,60,0.3)",
              background: "rgba(232,178,60,0.08)",
            }}
            title={t(lang, "panel.astTitle")}
          >
            AST
          </span>
        )}
        {hasSecrets && (
          <span
            className="font-jetbrains text-[length:var(--fs-meta)] px-1.5 py-px rounded-sm"
            style={{
              color: "#ff6464",
              border: "1px solid rgba(255,100,100,0.3)",
              background: "rgba(255,100,100,0.08)",
            }}
            title={t(lang, "panel.secretsTitle")}
          >
            SECRETS
          </span>
        )}
      </div>

      {/* Handover — what a reader does with this file right now: open it in
          the editor at the finding's line, pull the report, hand the city
          link to someone. Each is one click from the file name; before this
          row the editor sat under the findings list and the link lived two
          clicks deep in the dock menu. */}
      <div className="panel-handoff">
        {cityOnDisk(cityData) && (
          <OpenInIde
            filePath={file.path}
            line={sourceLine ?? focusedLine ?? firstLiveFindingLine}
            repoKey={`${cityData.repo.owner}/${cityData.repo.name}`}
          />
        )}
        {analysisId && (
          <a
            href={`/api/result/${encodeURIComponent(analysisId)}/sarif`}
            download={`ephemora-${analysisId}.sarif`}
            className="handoff-action"
            title={t(lang, "panel.sarifTitle")}
          >
            {t(lang, "panel.sarifExport")}
          </a>
        )}
        <button
          type="button"
          onClick={() => void copyCityLink()}
          className="handoff-action"
          title={t(lang, "actions.copyLinkTitle")}
        >
          ⎘ {t(lang, "actions.copyLink")}
        </button>
        <span role="status" aria-live="polite" className="sr-only">
          {linkCopied ? t(lang, "panel.copied") : ""}
        </span>
      </div>

      <div className="mt-4">
        <RunTestsButton filePath={file.path} analysisOnDisk={cityOnDisk(cityData)} />
        <TestResultsBlock filePath={file.path} />

        {/* Honest-building structure — sections + voxel legend (only when the
          payload carries section data) */}
        <VoxelStructureBlock file={file} />

        {/* 005 Teil A — who imports this file, and what that does and does not
            claim. Off until the reader asks for it. */}
        <BlastRadiusBlock />

        {/* 005-B — the same edges, walked. Offered only where a connection
            really exists. */}
        <GuideAction />

        {/* 005-B12 — the third role, and exactly one metric behind it: the `cx`
            figure above. Absent for data files and for files with no branch. */}
        <MaintenanceAction />

        {/* Real source with flagged finding lines — lazy, one fetch per file
          (keyed by file.id so the cache resets on building change). While the
          triage targets this file, the source auto-loads and the focused
          finding's line is scrolled into view. */}
        <SourceBlock
          file={file}
          // The demo city has no staged copy behind its id: asking for source
          // answers 404. No id means no button that can only fail.
          analysisId={cityOnDisk(cityData) ? analysisId : null}
          key={file.id}
          autoLoad={focusedLine !== null || hasFindings}
          scrollToLine={sourceLine ?? focusedLine ?? firstLiveFindingLine}
        />
      </div>
    </div>
  );
}
function TestResultsBlock({ filePath }: { filePath: string }) {
  const lang = useStore((s) => s.prefs.lang);
  const colorblind = useStore((s) => s.prefs.colorblind);
  const result = useStore((s) => s.testResults[filePath]);
  if (!result) return null;
  return (
    <div
      className="mb-3 rounded-sm overflow-hidden"
      style={{
        border: `1px solid ${result.status === "failed" ? `${severityColor("P0", colorblind)}66` : result.status === "skipped" ? "var(--meta)" : "rgba(41,211,152,0.35)"}`,
        background:
          result.status === "failed"
            ? `${severityColor("P0", colorblind)}0f`
            : result.status === "skipped"
              ? "transparent"
              : "rgba(41,211,152,0.05)",
      }}
    >
      <div
        className="px-2 py-1.5 font-jetbrains text-[length:var(--fs-meta)] font-semibold"
        style={{
          color:
            result.status === "failed"
              ? "#ff6b7a"
              : result.status === "skipped"
                ? "var(--meta)"
                : "#29d398",
        }}
      >
        {result.status === "failed"
          ? t(lang, "panel.testsFailing")
          : result.status === "skipped"
            ? t(lang, "test.skipped")
            : t(lang, "panel.testsPassing")}{" "}
        ·{" "}
        {t(lang, result.tests === 1 ? "panel.testCountOne" : "panel.testCountMany", {
          count: result.tests,
        })}
        {result.skippedTests
          ? ` · ${t(lang, "test.fileSkipped", { count: result.skippedTests })}`
          : ""}
      </div>
      {result.failures.slice(0, 3).map((f, i) => (
        <div key={i} className="px-2 pb-1.5">
          <div className="font-jetbrains text-[length:var(--fs-meta)]" style={{ color: "#ff9aa5" }}>
            ✕ {f.name}
          </div>
          <pre
            className="font-jetbrains text-[length:var(--fs-meta)] leading-snug whitespace-pre-wrap mt-0.5"
            style={{ color: "var(--meta)" }}
          >
            {f.message}
          </pre>
        </div>
      ))}
      {result.failures.length > 3 && (
        <div
          className="px-2 pb-1.5 font-jetbrains text-[length:var(--fs-meta)]"
          style={{ color: "var(--meta)" }}
        >
          {t(
            lang,
            result.failures.length - 3 === 1 ? "panel.moreFailuresOne" : "panel.moreFailures",
            { count: result.failures.length - 3 },
          )}
        </div>
      )}
    </div>
  );
}
