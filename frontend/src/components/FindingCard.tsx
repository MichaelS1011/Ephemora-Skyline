/**
 * The finding card: one finding, presented.
 *
 * Split out of `InfoPanel.tsx` (2026-10-18) when that file passed 1,700 lines.
 * Nothing here changed behaviour: the severity chip, the bilingual finding
 * text, the provenance tag, the code frame, the suggested fix and the row that
 * holds them are the same code, in the same order, with the same class names.
 * `InfoPanel` composes `FindingRow`; `FilePanels` composes `SevChip`; the pure
 * helpers these components call live in `findings/panelLogic.ts` and did not
 * move with them.
 */
import { useEffect, useRef, useState } from "react";
import { useStore } from "../stores/useStore";
import { SEVERITY_CVD_COLOR, severityColor } from "../city/palette";
import { playVerdict } from "../city/sound";
import { CATEGORY_IDS, categoryMeta } from "../config/findingCategories";
import { fixFor, type FixSuggestion } from "../findings/fixes";
import { findingContext } from "../findings/context";
import { t, type DictKey, type Lang } from "../i18n";
import type { CityFinding, FindingCategory, ReviewStatus } from "../city/types";
import { AskLocalModel } from "./AskLocalModel";

/** Amber accent of the triage focus ring. */
const FOCUS_COLOR = "var(--accent-gold)";

/** Review status → segment/border color (same palette as the findings list). */
const REVIEW_COLOR: Record<ReviewStatus, string> = {
  reviewed: "#29d398",
  "false-positive": "#8f8b82",
  "to-fix": "var(--accent-gold)",
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
export const FOCUS_PULSE_CSS = `
@keyframes finding-focus-pulse {
  0%, 100% { box-shadow: inset 0 0 0 1px rgba(232,178,60,0.65), 0 0 10px rgba(232,178,60,0.12); }
  50% { box-shadow: inset 0 0 0 1px rgba(232,178,60,0.25), 0 0 16px rgba(232,178,60,0.28); }
}
.finding-focused { animation: finding-focus-pulse 2s ease-in-out infinite; }
`;

/* ── Severity chip ─────────────────────────────────────────────────────── */
/**
 * Severity in the one vocabulary the product uses out loud. P0/P1/P2 stay in
 * the data and in tooltips; a badge a person reads has to say the same thing
 * the header count above it says.
 */
export const SEVERITY_WORD: Record<"P0" | "P1" | "P2", DictKey> = {
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
      className="severity-chip font-jetbrains text-[length:var(--fs-meta)] px-1.5 py-px rounded-sm font-semibold"
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
 * ("Hardcoded secret detected (generic-api-key) — gitleaks") and no
 * `messageDe` field exists in the payload yet, so the line under the original
 * is the curated category sentence this product owns for that finding class.
 * The knowledge layer is bilingual since Lane LOKAL shipped `explanationDe`
 * and `fixDe` (backend `finding-knowledge.ts` → `cityMapper`): the "Why it
 * matters" paragraph and the one-line fix choose by `prefs.lang` in
 * FindingRow, with the English field as the fallback for payloads that
 * predate the fields. A guessed translation would be worse than the English
 * line it replaced.
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
      className="font-jetbrains text-[length:var(--fs-meta)] px-1.5 py-px rounded-sm"
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
  hint,
}: {
  suggestion: FixSuggestion | null;
  fallbackFix?: string;
  /** The finding's own one-line fix — shown under the title when it exists. */
  hint?: string;
}) {
  const lang = useStore((s) => s.prefs.lang);
  const [copied, setCopied] = useState(false);
  const title = suggestion?.title ?? t(lang, "panel.suggestedFixFallback");
  const steps = suggestion ? suggestion.steps : fallbackFix ? [fallbackFix] : [];

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
      className="font-jetbrains text-[length:var(--fs-meta)] leading-relaxed rounded-sm px-2 py-1.5"
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
          className="shrink-0 font-jetbrains text-[length:var(--fs-meta)] w-5 h-5 flex items-center justify-center rounded-sm transition-colors"
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

export function FindingRow({
  finding,
  index,
  filePath,
  reviewKey,
  review,
  focused,
  demo,
}: {
  finding: CityFinding;
  index: number;
  filePath: string;
  /** `reviewKeyFor(...)` — the fingerprint key the review store uses. */
  reviewKey: string;
  review: ReviewStatus | null;
  /** True while the triage queue targets this finding. */
  focused: boolean;
  /** The demo city (`analysisId === "demo-001"`): nothing is saved anywhere. */
  demo: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const lang = useStore((s) => s.prefs.lang);
  const colorblind = useStore((s) => s.prefs.colorblind);
  const setReview = useStore((s) => s.setReview);
  // V1: exactly the row of the FIRST verdict of this visit carries the
  // persistence confirmation — and only while the write actually succeeded.
  const firstVerdictKey = useStore((s) => s.firstVerdictKey);
  const verdictsBlocked = useStore((s) => s.verdictsBlocked);
  const rowRef = useRef<HTMLDivElement>(null);
  const color = severityColor(finding.severity, colorblind);
  // The triage focus wins over the review status, which wins over severity
  const leftColor = focused ? FOCUS_COLOR : review ? REVIEW_COLOR[review] : color;
  const suggestion = fixFor(finding, lang);
  // German mode reads the curated German line, English mode the original; a
  // payload without the `*De` fields renders exactly what it rendered before.
  const explanation =
    lang === "de" ? (finding.explanationDe ?? finding.explanation) : finding.explanation;
  const fixLine = lang === "de" ? (finding.fixDe ?? finding.fix) : finding.fix;
  // The scanner's own one-liner stays visible as the hint when a recipe or the
  // German class line replaces it — a dynamic fix like "Update lodash to
  // 4.17.21" must not disappear behind generic advice. English mode is
  // unchanged: the hint exists exactly when a recipe and a fix both do.
  const fixHint = suggestion || (lang === "de" && finding.fixDe) ? finding.fix : undefined;
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
          <span
            className="font-jetbrains text-[length:var(--fs-meta)] truncate"
            style={{ color: "#cfcabe" }}
          >
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
            <span
              className="font-jetbrains text-[length:var(--fs-meta)]"
              style={{ color: "var(--meta-strong)" }}
            >
              {finding.ruleId}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span
            className="font-jetbrains text-[length:var(--fs-meta)]"
            style={{ color: "var(--meta-strong)" }}
          >
            :{finding.line}
          </span>
          <button
            onClick={() => setExpanded((v) => !v)}
            title={
              expanded ? t(lang, "panel.detailsCollapseTitle") : t(lang, "panel.detailsExpandTitle")
            }
            className="font-jetbrains text-[length:var(--fs-meta)] w-5 h-5 flex items-center justify-center rounded-sm transition-colors"
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
            className="font-jetbrains text-[length:var(--fs-meta)] w-5 h-5 flex items-center justify-center rounded-sm transition-colors"
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
              onClick={() => {
                const next = active ? null : segment.status;
                setReview(reviewKey, next);
                // Craft/Audio: the hand learns the button worked before the
                // tally repaints. Clearing stays silent — undo needs no praise.
                if (next) playVerdict();
              }}
              className="font-jetbrains text-[length:var(--fs-meta)] leading-none min-h-7 px-2 py-1 transition-colors"
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

      {/* V1: the first verdict of the visit, confirmed with the promise the
          storage actually keeps. A status note, not an alert — and it is
          never shown when the write failed, because "Saved" would be a lie
          next to the blocked-storage warning. The demo city has no folder
          and saves nothing, so it gets its own honest sentence without the
          saved-check. */}
      {review && firstVerdictKey === reviewKey && !verdictsBlocked && (
        <p
          role="status"
          data-first-verdict
          className="font-jetbrains text-[length:var(--fs-meta)] leading-relaxed mt-1.5"
          style={{ color: demo ? "#8f8b82" : "#29d398" }}
        >
          {demo ? "" : "✓ "}
          {t(lang, demo ? "panel.firstVerdictSavedDemo" : "panel.firstVerdictSaved")}
        </p>
      )}

      {/* Expanded: what it means, where it is, how to fix, where to read more */}
      {expanded && (
        <div
          id={detailsId}
          role="region"
          aria-label={t(lang, "panel.detailsRegionAria")}
          className="mt-2 space-y-2 animate-fade-up"
        >
          {explanation && (
            <div
              className="font-jetbrains text-[length:var(--fs-meta)] leading-relaxed px-2 py-1.5 rounded-sm"
              style={{
                color: "#d8e4f8",
                background: "rgba(232,178,60,0.06)",
                border: "1px solid rgba(232,178,60,0.2)",
              }}
            >
              <span style={{ color: "#d8c9a3", opacity: 0.9 }}>
                {t(lang, "panel.whyItMatters")}
              </span>
              {explanation}
            </div>
          )}

          {finding.snippet && <CodeFrame snippet={finding.snippet} />}

          {(suggestion || fixLine) && (
            <SuggestedFixBlock suggestion={suggestion} fallbackFix={fixLine} hint={fixHint} />
          )}

          {/* The one sentence this product cannot write itself: what THIS line
              does wrong. Offered only when a model runs on this machine. */}
          <AskLocalModel finding={finding} />

          {refUrl && (
            <a
              href={refUrl}
              target="_blank"
              rel="noreferrer"
              className="font-jetbrains text-[length:var(--fs-meta)] inline-flex items-center gap-1 transition-opacity hover:opacity-80"
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
