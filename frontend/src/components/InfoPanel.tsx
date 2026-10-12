import { useCallback, useEffect, useRef, useState } from "react";
import { cityOnDisk, useStore } from "../stores/useStore";
import { findFileById } from "../city/layout";
import {
  churnColor,
  languageColor,
  SEVERITY_CVD_COLOR,
  severityColor,
  UNCHECKED_COLOR,
  authorColor,
} from "../city/palette";
import { isUncheckedClean } from "../city/provenance";
import { CATEGORY_IDS, categoryMeta } from "../config/findingCategories";
import type { VoxelSectionSpec } from "../city/voxels";
import { OpenInIde } from "./OpenInIde";
import { useTestRunner } from "../hooks/useTestRunner";
import { fixFor, type FixSuggestion } from "../findings/fixes";
import { findingKey, reviewKeyFor } from "../reviews";
import { findingContext } from "../findings/context";
import { t, type DictKey, type Lang } from "../i18n";
import type { CityFile, CityFinding, FindingCategory, ReviewStatus } from "../city/types";
import { learningCopy } from "./learningCopy";
import "../design/stadt-ui.css";
import "../design/learning.css";

/** Amber accent of the triage focus ring. */
const FOCUS_COLOR = "#e8b23c";

/** Review status → segment/border color (same palette as the findings list). */
const REVIEW_COLOR: Record<ReviewStatus, string> = {
  reviewed: "#29d398",
  "false-positive": "#8f8b82",
  "to-fix": "#e8b23c",
};

const REVIEW_SEGMENTS: Array<{ status: ReviewStatus; labelKey: DictKey }> = [
  { status: "reviewed", labelKey: "panel.reviewReviewed" },
  { status: "false-positive", labelKey: "panel.reviewFalsePositive" },
  { status: "to-fix", labelKey: "panel.reviewToFix" },
];

/**
 * Soft pulse for the triage-focused finding card. Declared here because the
 * effect belongs to this panel and globals.css has no matching keyframes.
 */
const FOCUS_PULSE_CSS = `
@keyframes finding-focus-pulse {
  0%, 100% { box-shadow: inset 0 0 0 1px rgba(232,178,60,0.65), 0 0 10px rgba(232,178,60,0.12); }
  50% { box-shadow: inset 0 0 0 1px rgba(232,178,60,0.25), 0 0 16px rgba(232,178,60,0.28); }
}
.finding-focused { animation: finding-focus-pulse 2s ease-in-out infinite; }
`;

/* ── Source-view helpers (pure — tested in tests/sourceView.test.ts) ───── */

/** A section paired with the findings whose lines fall inside its range. */
export interface SectionWithFindings {
  section: VoxelSectionSpec;
  findings: CityFinding[];
}

/**
 * Assign findings to the code sections their line falls into (1-based,
 * inclusive ranges; first matching section in input order wins). Findings
 * outside every section are collected into one trailing implicit module
 * section spanning the lines they occupy.
 */
export function findingsBySection(
  sections: VoxelSectionSpec[],
  findings: CityFinding[],
): SectionWithFindings[] {
  const result: SectionWithFindings[] = sections.map((section) => ({ section, findings: [] }));
  const outside: CityFinding[] = [];
  for (const finding of findings) {
    if (finding.historyCommit || finding.provenance === "gitleaks-history") continue;
    const idx = sections.findIndex((s) => finding.line >= s.start && finding.line <= s.end);
    if (idx >= 0) result[idx]!.findings.push(finding);
    else outside.push(finding);
  }
  if (outside.length > 0) {
    const start = Math.min(...outside.map((f) => f.line));
    const end = Math.max(...outside.map((f) => f.line));
    result.push({
      section: { name: "(module)", kind: "module", start, end, codeLines: 0, depth: 0 },
      findings: outside,
    });
  }
  return result;
}

/** A source line tagged for the source view — finding lines render flagged. */
export interface SourceLineView {
  text: string;
  kind: "code" | "finding";
}

/** Mark the source lines a finding flags (finding.line is 1-based). */
export function highlightSourceLines(lines: string[], findings: CityFinding[]): SourceLineView[] {
  const findingLines = new Set(
    findings
      .filter((f) => !f.historyCommit && f.provenance !== "gitleaks-history")
      .map((f) => f.line),
  );
  return lines.map((text, i) => ({
    text,
    kind: findingLines.has(i + 1) ? ("finding" as const) : ("code" as const),
  }));
}

/**
 * Merged, sorted ±context windows (1-based inclusive) around each finding
 * line, clamped to the file bounds — keeps the source view's DOM bounded
 * for huge files.
 */
export function findingContextRanges(
  findings: CityFinding[],
  totalLines: number,
  context: number,
): Array<[number, number]> {
  if (findings.length === 0 || totalLines <= 0) return [];
  const windows = findings
    .filter((f) => !f.historyCommit && f.provenance !== "gitleaks-history")
    .map((f) => [Math.max(1, f.line - context), Math.min(totalLines, f.line + context)] as const)
    .sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const [start, end] of windows) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1] + 1) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

/** Load lifecycle of the source view (mirrors SourceBlock's internal state). */
export type SourceStatus = "idle" | "loading" | "error" | "ready";

/**
 * Auto-load gate: the fetch may only start on its own when the caller asked
 * for it (triage focus), the block has not started loading yet, and there is
 * an analysis to fetch from. Loading/error/ready deliberately return false —
 * no fetch loop, and a failed auto-load stays behind the manual
 * "Load source" button instead of hammering an offline server.
 */
export function shouldAutoLoad(
  status: SourceStatus,
  analysisId: string | null,
  autoLoad: boolean,
): boolean {
  return autoLoad && status === "idle" && analysisId !== null;
}

/**
 * The triage focus key "fileId#index" split apart — null when malformed.
 * Uses lastIndexOf so file ids that themselves contain "#" still parse.
 */
export function parseFocusedKey(
  key: string | null | undefined,
): { fileId: string; index: number } | null {
  if (!key) return null;
  const hash = key.lastIndexOf("#");
  if (hash <= 0 || hash === key.length - 1) return null;
  const index = Number(key.slice(hash + 1));
  if (!Number.isInteger(index) || index < 0) return null;
  return { fileId: key.slice(0, hash), index };
}

/** True when the triage focus key points at a finding of this file. */
export function focusBelongsToFile(key: string | null | undefined, fileId: string): boolean {
  const parsed = parseFocusedKey(key);
  return parsed !== null && parsed.fileId === fileId;
}

/**
 * The 1-based source line a focused finding of this file sits on — drives
 * both the SourceBlock scroll target and the breadcrumbs "L{line}" segment.
 * Null when the focus is elsewhere, malformed, or the index has no finding
 * (stale key after a filter change).
 */
export function lineSegmentFor(
  key: string | null | undefined,
  file: Pick<CityFile, "id" | "findings">,
): number | null {
  const parsed = parseFocusedKey(key);
  if (!parsed || parsed.fileId !== file.id) return null;
  const finding = file.findings[parsed.index];
  if (finding?.historyCommit || finding?.provenance === "gitleaks-history") return null;
  return finding?.line ?? null;
}

/* ── Severity chip ─────────────────────────────────────────────────────── */
/**
 * Severity in the one vocabulary the product uses out loud. P0/P1/P2 stay in
 * the data and in tooltips; a badge a person reads has to say the same thing
 * the header count above it says.
 */
const SEVERITY_WORD: Record<"P0" | "P1" | "P2", DictKey> = {
  P0: "hud.sevCritical",
  P1: "hud.sevHigh",
  P2: "hud.sevMedium",
};

/** Same order as the words, so the shape reads without the colour. */
const SEVERITY_SHAPE: Record<"P0" | "P1" | "P2", string> = {
  P0: "▲",
  P1: "◆",
  P2: "●",
};

export function SevChip({ severity }: { severity: "P0" | "P1" | "P2" }) {
  const lang = useStore((s) => s.prefs.lang);
  const colorblind = useStore((s) => s.prefs.colorblind);
  return (
    <span
      className="severity-chip font-jetbrains text-[11px] px-1.5 py-px rounded-sm font-semibold"
      data-severity={severity}
      style={{ color: severityColor(severity, colorblind) }}
      title={severity}
    >
      <span aria-hidden="true" className="severity-chip-shape">
        {SEVERITY_SHAPE[severity]}
      </span>
      {t(lang, SEVERITY_WORD[severity])}
    </span>
  );
}

/* ── Bilingual finding text ──────────────────────────────────────────────
 * The scanner speaks English: `message` comes from the adapters
 * ("Hardcoded secret detected (generic-api-key) — gitleaks") and no `de`
 * field exists in the payload yet. A German UI that stops at the second
 * language exactly where the work is described is the seam the audit counted
 * (Befund 7). Until Lane LOKAL ships `messageDe`, the line under the original
 * is the curated sentence this product already owns for that finding class —
 * and when the payload carries no class, nothing is shown. A guessed
 * translation would be worse than the English line it replaced.
 */

/** What the backend will send once LOKAL delivers it (`city/types.ts` has no field yet). */
export interface TranslatableFinding extends CityFinding {
  messageDe?: string;
}

export function findingGermanLine(
  finding: Pick<TranslatableFinding, "messageDe" | "category">,
  lang: Lang,
): string | null {
  if (lang !== "de") return null;
  const own = finding.messageDe?.trim();
  if (own) return own;
  const category = finding.category as FindingCategory | undefined;
  if (!category || !CATEGORY_IDS.includes(category)) return null;
  return t(lang, categoryMeta(category).meaning);
}

export function FindingGermanLine({
  finding,
  marked = true,
}: {
  finding: TranslatableFinding;
  /** The list and the panel show the pair; a search row only needs the line. */
  marked?: boolean;
}) {
  const lang = useStore((s) => s.prefs.lang);
  const de = findingGermanLine(finding, lang);
  if (!de) return null;
  if (!marked)
    return (
      <span className="finding-message-de" data-finding-de="" lang="de">
        {de}
      </span>
    );
  return (
    <span className="finding-message-de">
      <span className="finding-lang-mark" aria-hidden="true">
        DE
      </span>
      <span data-finding-de="" lang="de">
        {de}
      </span>
    </span>
  );
}

export function FindingMessage({ finding }: { finding: TranslatableFinding }) {
  // Spans, not paragraphs: the findings list renders this inside a button,
  // and a button may only hold phrasing content.
  return (
    <span className="finding-message" data-finding-block="">
      <span className="finding-message-orig" data-finding-orig="" lang="en">
        {finding.message}
      </span>
      <FindingGermanLine finding={finding} />
    </span>
  );
}

/* ── Provenance tag ────────────────────────────────────────────────────── */
function ProvenanceTag({ prov }: { prov?: string }) {
  if (!prov) return null;
  const isAst = prov === "semgrep";
  const isSecret = prov.startsWith("gitleaks");
  const color = isAst ? "#d8c9a3" : isSecret ? "#ff6464" : "var(--meta-strong)";
  return (
    <span
      className="font-jetbrains text-[11px] px-1.5 py-px rounded-sm"
      style={{
        color,
        border: `1px solid ${color}44`,
        background: `${color}14`,
      }}
    >
      {isAst ? "AST" : isSecret ? "SECRET" : prov}
    </span>
  );
}

/* ── Single finding row ────────────────────────────────────────────────── */
function CodeFrame({ snippet }: { snippet: NonNullable<CityFinding["snippet"]> }) {
  const lang = useStore((s) => s.prefs.lang);
  const colorblind = useStore((s) => s.prefs.colorblind);
  const lineNoWidth = String(snippet.number + snippet.after.length).length;
  const gutter = (n: number): string => String(n).padStart(lineNoWidth, " ");
  return (
    <div
      className="font-jetbrains text-[length:var(--fs-meta)] leading-[1.5] rounded-sm overflow-x-auto mt-2"
      style={{ background: "rgba(0,0,0,0.45)", border: "1px solid rgba(150,142,128,0.18)" }}
      aria-label={t(lang, "panel.codeAroundAria", { line: snippet.number })}
    >
      {snippet.before.map((l, i) => (
        <div key={`b${i}`} className="flex whitespace-pre">
          <span style={{ color: "var(--meta-faint)", userSelect: "none", padding: "0 6px" }}>
            {gutter(snippet.number - snippet.before.length + i)}
          </span>
          <span style={{ color: "#5d7494" }}>{l}</span>
        </div>
      ))}
      <div
        className="flex whitespace-pre"
        style={{ background: colorblind ? `${SEVERITY_CVD_COLOR.P0}1f` : "rgba(255,46,77,0.12)" }}
      >
        <span
          style={{
            color: colorblind ? SEVERITY_CVD_COLOR.P0 : "#ff6b7a",
            userSelect: "none",
            padding: "0 6px",
          }}
        >
          {gutter(snippet.number)}
        </span>
        <span style={{ color: "#ffd0d5" }}>{snippet.line}</span>
      </div>
      {snippet.after.map((l, i) => (
        <div key={`a${i}`} className="flex whitespace-pre">
          <span style={{ color: "var(--meta-faint)", userSelect: "none", padding: "0 6px" }}>
            {gutter(snippet.number + 1 + i)}
          </span>
          <span style={{ color: "#5d7494" }}>{l}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Suggested fix — structured remediation for known rule classes ─────── */
function SuggestedFixBlock({
  suggestion,
  fallbackFix,
}: {
  suggestion: FixSuggestion | null;
  fallbackFix?: string;
}) {
  const lang = useStore((s) => s.prefs.lang);
  const [copied, setCopied] = useState(false);
  const title = suggestion?.title ?? t(lang, "panel.suggestedFixFallback");
  const steps = suggestion ? suggestion.steps : fallbackFix ? [fallbackFix] : [];
  // The finding's own one-line fix complements the recipe steps when both exist
  const hint = suggestion && fallbackFix ? fallbackFix : undefined;

  const copy = async (): Promise<void> => {
    const text = [
      title,
      ...steps.map((step, i) => `${i + 1}. ${step}`),
      ...(suggestion?.code ? ["", suggestion.code] : []),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div
      className="font-jetbrains text-[11px] leading-relaxed rounded-sm px-2 py-1.5"
      style={{
        color: "#29d398",
        background: "rgba(41,211,152,0.07)",
        border: "1px solid rgba(41,211,152,0.18)",
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="suggested-fix-title" style={{ opacity: 0.9 }}>
          {t(lang, "panel.suggestedFixHeader", { title })}
        </span>
        <button
          onClick={() => void copy()}
          title={t(lang, "panel.copyFixTitle")}
          aria-label={t(lang, "panel.copyFixTitle")}
          className="shrink-0 font-jetbrains text-[11px] w-5 h-5 flex items-center justify-center rounded-sm transition-colors"
          style={{ color: copied ? "#29d398" : "#6688aa", background: "rgba(100,130,170,0.1)" }}
        >
          {copied ? "✓" : "⎘"}
        </button>
      </div>
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? t(lang, "panel.copied") : ""}
      </span>
      {hint && (
        <p className="mt-1" style={{ color: "#d8e4f8", opacity: 0.85 }}>
          {hint}
        </p>
      )}
      <ol className="mt-1 list-decimal list-inside space-y-0.5" style={{ color: "#cfe9dd" }}>
        {steps.map((step, i) => (
          <li key={i}>{step}</li>
        ))}
      </ol>
      {suggestion?.code && (
        <pre
          className="mt-1.5 overflow-x-auto whitespace-pre-wrap rounded-sm p-1.5 text-[length:var(--fs-meta)] leading-snug"
          style={{
            background: "rgba(0,0,0,0.45)",
            border: "1px solid rgba(150,142,128,0.18)",
            color: "#d8e4f8",
          }}
        >
          {suggestion.code}
        </pre>
      )}
    </div>
  );
}

function FindingRow({
  finding,
  index,
  filePath,
  reviewKey,
  review,
  focused,
}: {
  finding: CityFinding;
  index: number;
  filePath: string;
  /** `reviewKeyFor(...)` — the fingerprint key the review store uses. */
  reviewKey: string;
  review: ReviewStatus | null;
  /** True while the triage queue targets this finding. */
  focused: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const lang = useStore((s) => s.prefs.lang);
  const colorblind = useStore((s) => s.prefs.colorblind);
  const setReview = useStore((s) => s.setReview);
  const rowRef = useRef<HTMLDivElement>(null);
  const color = severityColor(finding.severity, colorblind);
  // The triage focus wins over the review status, which wins over severity
  const leftColor = focused ? FOCUS_COLOR : review ? REVIEW_COLOR[review] : color;
  const suggestion = fixFor(finding, lang);
  const detailsId = `finding-details-${filePath.replace(/[^a-z0-9]/gi, "-")}-${index}`;

  // When the triage queue jumps to this finding, bring it into view —
  // no-op unless this row is the focused one.
  useEffect(() => {
    if (!focused) return;
    setExpanded(true);
    rowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focused]);

  const copy = async (): Promise<void> => {
    const s = useStore.getState();
    const text = findingContext(
      finding,
      filePath,
      // A demo city was never "analyzed", but the scan that produced it still
      // has an id — the handoff must name it rather than say null.
      s.analysisId ?? s.cityData?.analysisId ?? null,
      reviewKey,
      review,
    );
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard unavailable */
    }
  };

  const refUrl =
    finding.refUrl ??
    (finding.provenance === "semgrep" && finding.ruleId
      ? `https://semgrep.dev/r/${encodeURIComponent(finding.ruleId)}`
      : null);

  return (
    <div
      ref={rowRef}
      className={
        focused
          ? "rounded-sm transition-colors duration-150 animate-fade-up finding-focused"
          : "rounded-sm transition-colors duration-150 animate-fade-up"
      }
      style={{
        borderLeft: `2px solid ${leftColor}`,
        background: focused ? "rgba(232,178,60,0.07)" : expanded ? `${color}07` : "transparent",
        padding: "0.5rem 0.6rem",
        animationDelay: `${index * 40}ms`,
      }}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
          <SevChip severity={finding.severity} />
          <ProvenanceTag prov={finding.provenance} />
          <span className="font-jetbrains text-[11px] truncate" style={{ color: "#cfcabe" }}>
            {finding.type}
          </span>
          {finding.cwe && (
            <span
              className="font-jetbrains text-[length:var(--fs-meta)] px-1 rounded-sm"
              style={{ color: "#c8a2ff", border: "1px solid rgba(200,162,255,0.3)" }}
              title={t(lang, "panel.cweTitle")}
            >
              {finding.cwe}
            </span>
          )}
          {finding.ruleId && (
            <span className="font-jetbrains text-[11px]" style={{ color: "var(--meta-strong)" }}>
              {finding.ruleId}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="font-jetbrains text-[11px]" style={{ color: "var(--meta-strong)" }}>
            :{finding.line}
          </span>
          <button
            onClick={() => setExpanded((v) => !v)}
            title={
              expanded ? t(lang, "panel.detailsCollapseTitle") : t(lang, "panel.detailsExpandTitle")
            }
            className="font-jetbrains text-[11px] w-5 h-5 flex items-center justify-center rounded-sm transition-colors"
            style={{ color: "#6688aa", background: "rgba(100,130,170,0.1)" }}
            aria-label={
              expanded ? t(lang, "panel.detailsCollapseAria") : t(lang, "panel.detailsExpandAria")
            }
            aria-expanded={expanded}
            aria-controls={expanded ? detailsId : undefined}
          >
            {expanded ? "▲" : "▼"}
          </button>
          <button
            onClick={copy}
            title={t(lang, "panel.copyFindingTitle")}
            className="font-jetbrains text-[11px] w-5 h-5 flex items-center justify-center rounded-sm transition-colors"
            style={{ color: copied ? "#29d398" : "#6688aa", background: "rgba(100,130,170,0.1)" }}
            aria-label={t(lang, "panel.copyFindingAria")}
          >
            {copied ? "✓" : "⎘"}
          </button>
        </div>
      </div>

      {finding.historyCommit && (
        <p className="finding-context">
          {t(lang, "panel.historyCommit")} <code>{finding.historyCommit.slice(0, 12)}</code>
          <br />
          {t(lang, "panel.historyEvidence")}
        </p>
      )}
      {finding.packageName && (
        <p className="finding-context">
          <strong>
            {finding.packageName} {finding.packageVersion}
          </strong>{" "}
          · {t(lang, "panel.sourceSeverity")} {finding.sourceSeverity ?? "UNKNOWN"}
        </p>
      )}
      {/* Message (always visible) — the scanner's own words, plus the German
          line for the class once the payload or the dictionary has one */}
      <FindingMessage finding={finding} />

      {/* Review control — clicking the active segment again clears the status */}
      <div
        className="mt-1.5 inline-flex overflow-hidden rounded-sm"
        role="group"
        aria-label={t(lang, "panel.reviewGroupAria")}
        style={{ border: "1px solid rgba(150,142,128,0.25)" }}
      >
        {REVIEW_SEGMENTS.map((segment, i) => {
          const active = review === segment.status;
          const label = t(lang, segment.labelKey);
          return (
            <button
              key={segment.status}
              type="button"
              aria-pressed={active}
              title={
                active
                  ? t(lang, "panel.reviewClearTitle", { label })
                  : t(lang, "panel.reviewMarkTitle", { label })
              }
              onClick={() => setReview(reviewKey, active ? null : segment.status)}
              className="font-jetbrains text-[11px] leading-none min-h-7 px-2 py-1 transition-colors"
              style={{
                color: active ? "#141412" : REVIEW_COLOR[segment.status],
                background: active ? REVIEW_COLOR[segment.status] : "rgba(255,255,255,0.03)",
                fontWeight: active ? 600 : 400,
                borderRight:
                  i < REVIEW_SEGMENTS.length - 1 ? "1px solid rgba(150,142,128,0.25)" : undefined,
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Expanded: what it means, where it is, how to fix, where to read more */}
      {expanded && (
        <div
          id={detailsId}
          role="region"
          aria-label={t(lang, "panel.detailsRegionAria")}
          className="mt-2 space-y-2 animate-fade-up"
        >
          {finding.explanation && (
            <div
              className="font-jetbrains text-[11px] leading-relaxed px-2 py-1.5 rounded-sm"
              style={{
                color: "#d8e4f8",
                background: "rgba(232,178,60,0.06)",
                border: "1px solid rgba(232,178,60,0.2)",
              }}
            >
              <span style={{ color: "#d8c9a3", opacity: 0.9 }}>
                {t(lang, "panel.whyItMatters")}
              </span>
              {finding.explanation}
            </div>
          )}

          {finding.snippet && <CodeFrame snippet={finding.snippet} />}

          {(suggestion || finding.fix) && (
            <SuggestedFixBlock suggestion={suggestion} fallbackFix={finding.fix} />
          )}

          {refUrl && (
            <a
              href={refUrl}
              target="_blank"
              rel="noreferrer"
              className="font-jetbrains text-[11px] inline-flex items-center gap-1 transition-opacity hover:opacity-80"
              style={{ color: "#d8c9a3" }}
            >
              ↗{" "}
              {finding.provenance === "npm-audit"
                ? t(lang, "panel.linkAdvisory")
                : finding.provenance === "semgrep"
                  ? t(lang, "panel.linkRuleDoc")
                  : t(lang, "panel.linkReadMore")}
            </a>
          )}
        </div>
      )}
    </div>
  );
}

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
  const focusedFindingKey = useStore((s) => s.focusedFindingKey);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const selectedId = selectedUnit?.kind === "file" ? selectedUnit.id : null;

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
              className="font-jetbrains text-[11px] tracking-[0.15em] uppercase"
              style={{ color: accent }}
              title={t(lang, "panel.langTitle")}
            >
              {file.language}
            </span>
            <span className="font-jetbrains text-[11px]" style={{ color: "var(--meta-strong)" }}>
              ·
            </span>
            <span
              className="font-jetbrains text-[11px]"
              style={{ color: "#8f8b82" }}
              title={t(lang, "panel.locTitle")}
            >
              {file.linesOfCode.toLocaleString()} LOC
            </span>
            <span className="font-jetbrains text-[11px]" style={{ color: "var(--meta-strong)" }}>
              ·
            </span>
            <span
              className="font-jetbrains text-[11px]"
              style={{ color: "#8f8b82" }}
              title={t(lang, "panel.cxTitle")}
            >
              cx {file.cyclomaticComplexity}
            </span>
          </div>

          {/* Filename */}
          <h3 className="panel-file-name font-jetbrains">{file.name}</h3>
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
          className="w-full mb-3 py-1.5 font-jetbrains text-[11px] tracking-widest rounded-sm transition-all duration-150 hover:opacity-90"
          style={{
            border: "1px solid rgba(232,178,60,0.4)",
            color: "#f2d5a0",
            background: "rgba(232,178,60,0.07)",
          }}
        >
          {t(lang, "panel.openDistrict", { path: hit.chain.join("/") })}
        </button>
      )}

      {/* Threat + provenance badges */}
      <div className="flex gap-1.5 flex-wrap mb-3">
        <span
          className="font-jetbrains text-[11px] px-1.5 py-px rounded-sm uppercase tracking-wide"
          style={{
            color: "var(--meta-strong)",
            border: "1px solid rgba(100,130,170,0.3)",
            background: "rgba(100,130,170,0.08)",
          }}
          title={t(lang, "panel.threatTitle")}
        >
          {worstSeverity
            ? t(lang, SEVERITY_WORD[worstSeverity])
            : t(lang, unchecked ? "panel.statusUnchecked" : "panel.statusNoFindings")}
        </span>
        {file.churnScore !== undefined &&
          (() => {
            // The same band the far heat grid paints: `churnColor` carries the
            // colour-blind variant, this chip used to hardwire the three steps.
            const churn = churnColor(file.churnScore ?? 0, colorblind);
            return (
              <span
                className="font-jetbrains text-[11px] px-1.5 py-px rounded-sm"
                style={{
                  color: churn,
                  border: `1px solid ${churn}4d`,
                  background: `${churn}14`,
                }}
                title={t(lang, "panel.churnTitle", { commits: file.commitCount ?? 0 })}
              >
                CHURN {file.churnScore.toFixed(2)}
              </span>
            );
          })()}
        {file.exportedSymbols !== undefined && (
          <span
            className="font-jetbrains text-[11px] px-1.5 py-px rounded-sm"
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
            className="font-jetbrains text-[11px] px-1.5 py-px rounded-sm"
            style={{
              color: "#d8cdb4",
              border: "1px solid rgba(210,200,180,0.35)",
              background: "rgba(210,200,180,0.1)",
            }}
            title={t(lang, "panel.deadCodeTitle")}
          >
            DEAD CODE?
          </span>
        )}
        {file.bytes !== undefined && file.bytes >= 150_000 && (
          <span
            className="font-jetbrains text-[11px] px-1.5 py-px rounded-sm"
            style={{
              color: "#9aa7b8",
              border: "1px solid rgba(154,167,184,0.4)",
              background: "rgba(154,167,184,0.1)",
            }}
            title={t(lang, "panel.hugeFileTitle")}
          >
            {(file.bytes / 1024).toFixed(0)} KB
          </span>
        )}
        {file.inCycle && (
          <span
            className="font-jetbrains text-[11px] px-1.5 py-px rounded-sm"
            style={{
              color: severityColor("P0", colorblind),
              border: `1px solid ${severityColor("P0", colorblind)}59`,
              background: `${severityColor("P0", colorblind)}14`,
            }}
            title={t(lang, "panel.cycleTitle")}
          >
            CYCLE
          </span>
        )}
        {file.coveragePct !== undefined && (
          <span
            className="font-jetbrains text-[11px] px-1.5 py-px rounded-sm"
            style={{
              color: file.coveragePct >= 80 ? "#d8c9a3" : "#ffd23f",
              border: `1px solid ${file.coveragePct >= 80 ? "rgba(232,178,60,0.35)" : "rgba(255,210,63,0.35)"}`,
              background:
                file.coveragePct >= 80 ? "rgba(232,178,60,0.08)" : "rgba(255,210,63,0.08)",
            }}
            title={t(lang, "panel.coverageTitle")}
          >
            COV {file.coveragePct}%
          </span>
        )}
        {file.clonePartners && file.clonePartners.length > 0 && (
          <span
            className="font-jetbrains text-[11px] px-1.5 py-px rounded-sm"
            style={{
              color: "#ffe14d",
              border: "1px solid rgba(255,225,77,0.4)",
              background: "rgba(255,225,77,0.08)",
            }}
            title={t(lang, "panel.cloneTitle", {
              paths: file.clonePartners.map((p) => p.path).join(", "),
            })}
          >
            CLONE ×{file.clonePartners.length}
          </span>
        )}
        {file.topAuthor && (
          <span
            className="font-jetbrains text-[11px] px-1.5 py-px rounded-sm"
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
            className="font-jetbrains text-[11px] px-1.5 py-px rounded-sm"
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
            className="font-jetbrains text-[11px] px-1.5 py-px rounded-sm"
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
            line={focusedLine ?? firstLiveFindingLine}
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

      {/* Divider */}
      <div className="panel-rule" />

      {/* Findings */}
      {hasFindings ? (
        <>
          <div className="panel-section-head flex items-center justify-between mb-2.5">
            <span
              className="font-jetbrains text-[11px] tracking-[0.2em] uppercase"
              style={{ color: severityColor(worstSeverity!, colorblind) }}
            >
              {t(
                lang,
                file.findings.length === 1 ? "panel.findingsCountOne" : "panel.findingsCountMany",
                { count: file.findings.length },
              )}
            </span>
            <span
              className="font-jetbrains text-[11px]"
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
                  // The focus channel is positional and stays that way: every
                  // writer (triage, search, findings list) names the entry as
                  // `${fileId}#${index}`. A verdict is keyed by fingerprint.
                  // Comparing the focused finding against the verdict key meant
                  // no row ever lit up on a scan whose findings carry
                  // fingerprints — which is every scan the city mapper maps.
                  focused={focusedFindingKey === findingKey(file.id, i)}
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
            <span className="font-jetbrains text-[11px] block leading-relaxed">
              {t(
                lang,
                engines.length === 1 ? "panel.noFindingsUncheckedOne" : "panel.noFindingsUnchecked",
                { n: engines.length },
              )}
            </span>
            <span className="font-jetbrains text-[11px] block mt-1" style={{ opacity: 0.85 }}>
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
          <span className="font-jetbrains text-[11px]" style={{ color: "#29d398" }}>
            {t(lang, "panel.noFindingsChecked")}
          </span>
        </div>
      )}
      <div className="mt-4">
        <RunTestsButton filePath={file.path} analysisOnDisk={cityOnDisk(cityData)} />
        <TestResultsBlock filePath={file.path} />

        {/* Honest-building structure — sections + voxel legend (only when the
          payload carries section data) */}
        <VoxelStructureBlock file={file} />

        {/* Real source with flagged finding lines — lazy, one fetch per file
          (keyed by file.id so the cache resets on building change). While the
          triage targets this file, the source auto-loads and the focused
          finding's line is scrolled into view. */}
        <SourceBlock
          file={file}
          analysisId={analysisId}
          key={file.id}
          autoLoad={focusedLine !== null}
          scrollToLine={focusedLine}
        />
      </div>
    </div>
  );
}

/* ── Honest-building structure — sections + voxel legend ──────────────────
 * The sections ride on the file payload (VoxelSectionSpec, city/voxels.ts);
 * old payloads don't carry them and the block stays hidden. Mirrors what the
 * selected building materializes as: one voxel per code line, sections as
 * strata, nesting depth as terraces. Each section row expands to the
 * findings inside its line range; jumping to one reuses the triage focus
 * (pulse + scroll) on the matching row in the findings list below. */
function VoxelStructureBlock({ file }: { file: CityFile }) {
  const lang = useStore((s) => s.prefs.lang);
  const colorblind = useStore((s) => s.prefs.colorblind);
  const setFocusedFindingKey = useStore((s) => s.setFocusedFindingKey);
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set());
  const payload = file as CityFile & {
    sections?: VoxelSectionSpec[];
    totalVoxels?: number;
  };
  const sections = payload.sections;
  if (!sections || sections.length === 0) return null;
  const mapping = findingsBySection(sections, file.findings);
  const shown = mapping.slice(0, 24);
  const maxDepth = sections.reduce((m, s) => Math.max(m, s.depth), 0);
  const total = payload.totalVoxels ?? sections.reduce((sum, s) => sum + s.codeLines, 0);
  const detailsId = (i: number) => `section-details-${file.id.replace(/[^a-z0-9]/gi, "-")}-${i}`;

  const toggle = (i: number): void => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  // Reuses the triage focus: the findings list below highlights and scrolls
  // to the row (FindingRow reacts to focusedFindingKey).
  const jumpToFinding = (finding: CityFinding): void => {
    const index = file.findings.indexOf(finding);
    if (index >= 0) setFocusedFindingKey(findingKey(file.id, index));
  };

  return (
    <div className="mb-3" aria-label={t(lang, "panel.structureAria")}>
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <span
          className="font-jetbrains text-[11px] tracking-[0.2em] uppercase"
          style={{ color: "#e1ded4" }}
        >
          {t(lang, "panel.structureHeader")}
        </span>
        <span
          className="font-jetbrains text-[length:var(--fs-meta)]"
          style={{ color: "var(--meta-strong)" }}
          title={t(lang, "panel.voxelLegendTitle")}
        >
          {t(lang, "panel.voxelLegend", { count: total.toLocaleString() })}
        </span>
      </div>
      <div className="flex flex-col gap-0.5">
        {shown.map(({ section: s, findings: sectionFindings }, i) => {
          const pct = maxDepth > 0 ? (s.depth / maxDepth) * 100 : 0;
          const isOpen = expanded.has(i);
          return (
            <div key={i}>
              <div className="flex items-center gap-2 font-jetbrains text-[11px] min-w-0">
                <button
                  type="button"
                  onClick={() => toggle(i)}
                  aria-expanded={isOpen}
                  aria-controls={isOpen ? detailsId(i) : undefined}
                  aria-label={t(lang, "panel.sectionToggleAria", { name: s.name })}
                  title={t(lang, "panel.sectionMeta", {
                    kind: s.kind,
                    start: s.start,
                    end: s.end,
                    depth: s.depth,
                  })}
                  className="flex items-center gap-1 min-w-0 flex-1 text-left transition-opacity hover:opacity-80"
                  style={{ color: "#e1ded4" }}
                >
                  <span
                    className="shrink-0"
                    style={{ color: "var(--meta-strong)" }}
                    aria-hidden="true"
                  >
                    {isOpen ? "▾" : "▸"}
                  </span>
                  <span className="truncate min-w-0 flex-1">{s.name}</span>
                  {sectionFindings.length > 0 && (
                    <span
                      className="shrink-0 font-jetbrains text-[length:var(--fs-meta)] px-1 rounded-sm severity-count"
                      data-severity={sectionFindings[0]!.severity}
                      style={{
                        color: severityColor(sectionFindings[0]!.severity, colorblind),
                        borderColor: `${severityColor(sectionFindings[0]!.severity, colorblind)}55`,
                      }}
                      title={t(lang, "panel.sectionFindingsTitle")}
                    >
                      {sectionFindings.length}
                    </span>
                  )}
                </button>
                <span className="shrink-0" style={{ color: "var(--meta-strong)" }}>
                  {s.codeLines} LOC
                </span>
                <span
                  className="shrink-0 inline-block rounded-sm"
                  style={{
                    width: 34,
                    height: 4,
                    background: "rgba(150,142,128,0.16)",
                    overflow: "hidden",
                  }}
                  aria-hidden="true"
                >
                  <span
                    className="block h-full"
                    style={{
                      width: `${pct > 0 ? Math.max(10, pct) : 0}%`,
                      background: "#e1ded4",
                      opacity: 0.75,
                    }}
                  />
                </span>
              </div>
              {isOpen && (
                <div
                  id={detailsId(i)}
                  role="region"
                  aria-label={t(lang, "panel.sectionFindings")}
                  className="mt-1 mb-1 ml-3 flex flex-col gap-0.5 animate-fade-up"
                  style={{ borderLeft: "1px solid rgba(150,142,128,0.25)", paddingLeft: 8 }}
                >
                  <span
                    className="font-jetbrains text-[length:var(--fs-meta)] uppercase tracking-wide"
                    style={{ color: "var(--meta-strong)" }}
                  >
                    {t(lang, "panel.sectionFindings")}
                  </span>
                  {sectionFindings.length === 0 ? (
                    <span
                      className="font-jetbrains text-[length:var(--fs-meta)]"
                      style={{ color: "#8f8b82" }}
                    >
                      {t(lang, "panel.sectionNoFindings")}
                    </span>
                  ) : (
                    sectionFindings.map((f, j) => (
                      <button
                        key={j}
                        type="button"
                        onClick={() => jumpToFinding(f)}
                        aria-label={t(lang, "panel.findingJumpAria", { line: f.line })}
                        title={t(lang, "panel.findingJumpAria", { line: f.line })}
                        className="flex items-center gap-1.5 text-left font-jetbrains text-[length:var(--fs-meta)] transition-opacity hover:opacity-80"
                      >
                        <SevChip severity={f.severity} />
                        <span className="truncate min-w-0 flex-1" style={{ color: "#cfcabe" }}>
                          {f.type}
                        </span>
                        <span className="shrink-0" style={{ color: "var(--meta-strong)" }}>
                          :{f.line}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
        {sections.length > 24 && (
          <div
            className="font-jetbrains text-[length:var(--fs-meta)]"
            style={{ color: "var(--meta-strong)" }}
          >
            {t(lang, "panel.moreSections", { count: sections.length - 24 })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Source view — the file's real code with flagged finding lines ────────
 * Lazy by default: nothing loads until the user asks. When the triage queue
 * targets a finding of this file (autoLoad), the fetch starts on its own,
 * the block opens itself, and the focused line is scrolled into view inside
 * the source container. One fetch per file (the panel keys this block by
 * file.id, so selecting another building resets the cache). Huge files
 * render only the finding environment (±40 lines per finding) behind a
 * "show full file" toggle to keep the DOM bounded. */
const SOURCE_WINDOW_LIMIT = 2000; // lines — above this, window to findings
const SOURCE_CONTEXT = 40; // lines of context around each finding

interface SourcePayload {
  path: string;
  language?: string;
  lines: string[];
}

function SourceBlock({
  file,
  analysisId,
  autoLoad = false,
  scrollToLine = null,
}: {
  file: CityFile;
  analysisId: string | null;
  /** Start the fetch automatically (triage focus) instead of waiting for a click. */
  autoLoad?: boolean;
  /** 1-based line to scroll into view once the source is ready. */
  scrollToLine?: number | null;
}) {
  const lang = useStore((s) => s.prefs.lang);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<SourceStatus>("idle");
  const [lines, setLines] = useState<string[] | null>(null);
  const [showFull, setShowFull] = useState(false);
  const [autoLoaded, setAutoLoaded] = useState(false);
  const blockRef = useRef<HTMLDivElement>(null);
  const sourceId = `source-view-${file.id.replace(/[^a-z0-9]/gi, "-")}`;

  const load = useCallback(async (): Promise<void> => {
    // One fetch per file — the component is keyed by file.id, so `lines`
    // being non-null means this file's source is already here.
    if (!analysisId || status === "loading" || lines) return;
    setStatus("loading");
    try {
      const res = await fetch(
        `/api/result/${encodeURIComponent(analysisId)}/source/${encodeURIComponent(file.id)}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = (await res.json()) as Partial<SourcePayload>;
      setLines(Array.isArray(payload.lines) ? payload.lines.map(String) : []);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [analysisId, status, lines, file.id]);

  // Auto-load exactly once per file while idle — shouldAutoLoad keeps
  // loading/error/ready from re-fetching (no fetch loop; a failed auto-load
  // keeps the manual "Load source" button for an honest retry).
  useEffect(() => {
    if (!shouldAutoLoad(status, analysisId, autoLoad)) return;
    setAutoLoaded(true);
    setOpen(true); // auto-loaded source must be visible, not hidden behind the toggle
    void load();
  }, [autoLoad, analysisId, status, load]);

  // Scroll the focused finding's line to the center of the source container —
  // runs once per scrollToLine change (dep), never on plain re-renders.
  // Scrolls the container itself (scrollTop math), not the whole window.
  useEffect(() => {
    if (status !== "ready" || scrollToLine == null) return;
    const block = blockRef.current;
    const container = block?.querySelector<HTMLElement>("[data-source-scroll]");
    const row = block?.querySelector<HTMLElement>(`[data-line="${scrollToLine}"]`);
    if (!container || !row) return; // windowed view without the line — nothing to scroll to
    const containerRect = container.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const delta = rowRect.top - containerRect.top - containerRect.height / 2 + rowRect.height / 2;
    container.scrollTo({ top: container.scrollTop + delta, behavior: "smooth" });
  }, [scrollToLine, status]);

  const unavailable = (
    <div
      className="font-jetbrains text-[length:var(--fs-meta)] px-2 py-1.5 rounded-sm"
      style={{
        color: "#8f8b82",
        background: "rgba(150,142,128,0.08)",
        border: "1px solid rgba(150,142,128,0.22)",
      }}
    >
      {t(lang, "panel.sourceUnavailable")}
    </div>
  );

  return (
    <div ref={blockRef} className="mb-3" aria-label={t(lang, "panel.sourceHeader")}>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={open ? sourceId : undefined}
          aria-label={t(lang, "panel.sourceToggleAria")}
          className="flex items-center gap-1 font-jetbrains text-[11px] tracking-[0.2em] uppercase transition-opacity hover:opacity-80"
          style={{ color: "#e1ded4" }}
        >
          <span aria-hidden="true" style={{ color: "var(--meta-strong)" }}>
            {open ? "▾" : "▸"}
          </span>
          {t(lang, "panel.sourceHeader")}
        </button>
        {status === "ready" && scrollToLine != null && (
          <span
            className="font-jetbrains text-[length:var(--fs-meta)] px-1.5 py-px rounded-sm shrink-0"
            style={{ color: "#e8b23c", border: "1px solid rgba(232,178,60,0.4)" }}
            title={t(lang, "panel.sourceLine", { line: scrollToLine })}
          >
            {t(lang, "panel.sourceLine", { line: scrollToLine })}
          </span>
        )}
      </div>
      {open && (
        <div id={sourceId} className="animate-fade-up">
          {autoLoaded && status === "ready" && (
            <div
              className="font-jetbrains text-[length:var(--fs-meta)] mb-1"
              style={{ color: "var(--meta-strong)" }}
            >
              {t(lang, "panel.sourceAutoLoaded")}
            </div>
          )}
          {(status === "idle" || status === "error") && analysisId && (
            <button
              type="button"
              onClick={() => void load()}
              className="w-full py-1.5 font-jetbrains text-[11px] tracking-widest rounded-sm transition-all duration-150 hover:opacity-90"
              style={{
                border: "1px solid rgba(232,178,60,0.4)",
                color: "#f2d5a0",
                background: "rgba(232,178,60,0.07)",
              }}
            >
              {t(lang, "panel.loadSource")}
            </button>
          )}
          {status === "idle" && !analysisId && unavailable}
          {status === "loading" && (
            <div
              className="font-jetbrains text-[length:var(--fs-meta)]"
              style={{ color: "var(--meta-strong)" }}
            >
              ⟳ {t(lang, "panel.sourceLoading")}
            </div>
          )}
          {/* one note per state — `error` used to print it twice, once for the
              failed fetch and once for the empty line list */}
          {(status === "error" || (status === "ready" && lines !== null && lines.length === 0)) &&
            unavailable}
          {status === "ready" && lines !== null && lines.length > 0 && (
            <SourceView file={file} lines={lines} showFull={showFull} onToggleFull={setShowFull} />
          )}
        </div>
      )}
    </div>
  );
}

/** The monospace line list — shared by the windowed and full renderings. */
function SourceView({
  file,
  lines,
  showFull,
  onToggleFull,
}: {
  file: CityFile;
  lines: string[];
  showFull: boolean;
  onToggleFull: (v: boolean) => void;
}) {
  const lang = useStore((s) => s.prefs.lang);
  const colorblind = useStore((s) => s.prefs.colorblind);
  const view = highlightSourceLines(lines, file.findings);
  const lineNoWidth = String(lines.length).length;

  // DOM cap: window to the finding environment unless the user opts out
  const windowed = lines.length > SOURCE_WINDOW_LIMIT && !showFull;
  let ranges: Array<[number, number]>;
  if (windowed) {
    ranges = findingContextRanges(file.findings, lines.length, SOURCE_CONTEXT);
    if (ranges.length === 0) ranges = [[1, Math.min(120, lines.length)]]; // no findings: show the head
  } else {
    ranges = [[1, lines.length]];
  }

  const row = (lineNo: number, line: SourceLineView) => (
    <div
      key={lineNo}
      data-line={lineNo}
      className="flex whitespace-pre"
      style={
        line.kind === "finding"
          ? {
              background: colorblind ? `${SEVERITY_CVD_COLOR.P0}1f` : "rgba(255,46,77,0.12)",
              borderLeft: `2px solid ${severityColor("P0", colorblind)}`,
              paddingLeft: 2,
            }
          : { borderLeft: "2px solid transparent", paddingLeft: 2 }
      }
    >
      <span
        style={{
          color: line.kind === "finding" ? "#ff6b7a" : "var(--meta-faint)",
          userSelect: "none",
          padding: "0 6px",
          minWidth: lineNoWidth * 7,
          textAlign: "right",
        }}
      >
        {lineNo}
      </span>
      <span style={{ color: line.kind === "finding" ? "#ffd0d5" : "#5d7494" }}>
        {line.text || " "}
      </span>
    </div>
  );

  return (
    <div>
      <div
        role="region"
        aria-label={t(lang, "panel.sourceAria")}
        data-source-scroll=""
        className="overflow-y-auto overflow-x-auto rounded-sm"
        style={{
          maxHeight: 260,
          background: "rgba(0,0,0,0.45)",
          border: "1px solid rgba(150,142,128,0.18)",
        }}
      >
        {ranges.map(([start, end], i) => (
          <div key={start}>
            {i > 0 && (
              <div
                className="font-jetbrains text-[length:var(--fs-meta)]"
                style={{ color: "var(--meta-faint)", padding: "0 6px" }}
                aria-hidden="true"
              >
                ⋯
              </div>
            )}
            {view.slice(start - 1, end).map((line, j) => row(start + j, line))}
          </div>
        ))}
      </div>
      {lines.length > SOURCE_WINDOW_LIMIT && (
        <button
          type="button"
          onClick={() => onToggleFull(!showFull)}
          className="mt-1 font-jetbrains text-[length:var(--fs-meta)] transition-opacity hover:opacity-80"
          style={{ color: "#d8c9a3" }}
        >
          {showFull ? t(lang, "panel.showFindingContext") : t(lang, "panel.showFullFile")}
        </button>
      )}
    </div>
  );
}

/* ── Run tests — for the file's own test suite ─────────────────────────── */
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$|(^|\/)(tests?|__tests__)\//i;

function RunTestsButton({
  filePath,
  analysisOnDisk,
}: {
  filePath: string;
  analysisOnDisk: boolean;
}) {
  const lang = useStore((s) => s.prefs.lang);
  const testRun = useStore((s) => s.testRun);
  const analysisId = useStore((s) => s.analysisId);
  const { runTests } = useTestRunner();

  const isTestFile = /\.[cm]?[jt]sx?$/i.test(filePath) && TEST_FILE.test(filePath);
  const busy = testRun.status === "installing" || testRun.status === "running";
  if (!isTestFile) return null;

  return (
    <>
      <button
        onClick={() => void runTests([filePath])}
        disabled={busy || !analysisId || !analysisOnDisk}
        className="w-full mb-3 py-1.5 font-jetbrains text-[11px] tracking-widest rounded-sm
                 transition-all duration-150 hover:brightness-110 focus:outline-none focus:ring-1 focus:ring-[#29d398]
                 disabled:opacity-40 cursor-pointer"
        style={{
          border: "1px solid rgba(41,211,152,0.45)",
          color: "#29d398",
          background: "rgba(41,211,152,0.07)",
        }}
        title={t(lang, "test.snapshot")}
      >
        {busy ? `⟳ ${testRun.stage || t(lang, "panel.running")}` : t(lang, "panel.runTestFile")}
      </button>
      <p className="mb-3 text-[11px] leading-relaxed" style={{ color: "var(--meta)" }}>
        {t(lang, "test.snapshot")}
      </p>
      {testRun.status === "failed" && (
        <p role="alert" className="mb-3 text-[11px]" style={{ color: "#ff6b7a" }}>
          {testRun.stage}
        </p>
      )}
    </>
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
        className="px-2 py-1.5 font-jetbrains text-[11px] font-semibold"
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
            className="font-jetbrains text-[11px] leading-snug whitespace-pre-wrap mt-0.5"
            style={{ color: "var(--meta)" }}
          >
            {f.message}
          </pre>
        </div>
      ))}
      {result.failures.length > 3 && (
        <div className="px-2 pb-1.5 font-jetbrains text-[11px]" style={{ color: "var(--meta)" }}>
          {t(lang, "panel.moreFailures", { count: result.failures.length - 3 })}
        </div>
      )}
    </div>
  );
}
