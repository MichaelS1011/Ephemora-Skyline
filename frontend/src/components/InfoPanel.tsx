import { useState } from "react";
import { useStore } from "../stores/useStore";
import { findFileById } from "../city/layout";
import { languageColor, SEVERITY_COLOR, authorColor } from "../city/palette";
import { OpenInIde } from "./OpenInIde";
import { useTestRunner } from "../hooks/useTestRunner";
import type { CityFinding } from "../city/types";

/* ── Severity chip ─────────────────────────────────────────────────────── */
function SevChip({ severity }: { severity: "P0" | "P1" | "P2" }) {
  const cls = severity === "P0" ? "chip-p0" : severity === "P1" ? "chip-p1" : "chip-p2";
  return (
    <span className={`${cls} font-jetbrains text-[9px] px-1.5 py-px rounded-sm font-semibold`}>
      {severity}
    </span>
  );
}

/* ── Provenance tag ────────────────────────────────────────────────────── */
function ProvenanceTag({ prov }: { prov?: string }) {
  if (!prov) return null;
  const isAst = prov === "semgrep";
  const isSecret = prov.startsWith("gitleaks");
  const color = isAst ? "#d8c9a3" : isSecret ? "#ff6464" : "#a8a49a";
  return (
    <span
      className="font-jetbrains text-[9px] px-1.5 py-px rounded-sm"
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
  const lineNoWidth = String(snippet.number + snippet.after.length).length;
  const gutter = (n: number): string => String(n).padStart(lineNoWidth, " ");
  return (
    <div
      className="font-jetbrains text-[9.5px] leading-[1.5] rounded-sm overflow-x-auto mt-2"
      style={{ background: "rgba(0,0,0,0.45)", border: "1px solid rgba(150,142,128,0.18)" }}
      aria-label={`Code around line ${snippet.number}`}
    >
      {snippet.before.map((l, i) => (
        <div key={`b${i}`} className="flex whitespace-pre">
          <span style={{ color: "var(--meta-faint)", userSelect: "none", padding: "0 6px" }}>
            {gutter(snippet.number - snippet.before.length + i)}
          </span>
          <span style={{ color: "#5d7494" }}>{l}</span>
        </div>
      ))}
      <div className="flex whitespace-pre" style={{ background: "rgba(255,46,77,0.12)" }}>
        <span style={{ color: "#ff6b7a", userSelect: "none", padding: "0 6px" }}>
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

function FindingRow({
  finding,
  index,
  filePath,
}: {
  finding: CityFinding;
  index: number;
  filePath: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const color = SEVERITY_COLOR[finding.severity];

  const copy = async (): Promise<void> => {
    const text = `${finding.severity} ${finding.type} — ${filePath}:${finding.line}\n${finding.message}${finding.fix ? `\nFix: ${finding.fix}` : ""}${finding.refUrl ? `\nReference: ${finding.refUrl}` : ""}`;
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
      className="rounded-sm transition-colors duration-150 animate-fade-up"
      style={{
        borderLeft: `2px solid ${color}`,
        background: expanded ? `${color}07` : "transparent",
        padding: "0.5rem 0.6rem",
        animationDelay: `${index * 40}ms`,
      }}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
          <SevChip severity={finding.severity} />
          <ProvenanceTag prov={finding.provenance} />
          <span className="font-jetbrains text-[10px] truncate" style={{ color: "#cfcabe" }}>
            {finding.type}
          </span>
          {finding.cwe && (
            <span
              className="font-jetbrains text-[8.5px] px-1 rounded-sm"
              style={{ color: "#c8a2ff", border: "1px solid rgba(200,162,255,0.3)" }}
              title="Common Weakness Enumeration — standard vulnerability class"
            >
              {finding.cwe}
            </span>
          )}
          {finding.ruleId && (
            <span className="font-jetbrains text-[9px]" style={{ color: "var(--meta-strong)" }}>
              {finding.ruleId}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="font-jetbrains text-[9px]" style={{ color: "var(--meta-strong)" }}>
            :{finding.line}
          </span>
          <button
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? "Collapse details" : "Show explanation, code & fix"}
            className="font-jetbrains text-[10px] w-5 h-5 flex items-center justify-center rounded-sm transition-colors"
            style={{ color: "#6688aa", background: "rgba(100,130,170,0.1)" }}
            aria-label={expanded ? "Collapse finding details" : "Expand finding details"}
            aria-expanded={expanded}
          >
            {expanded ? "▲" : "▼"}
          </button>
          <button
            onClick={copy}
            title="Copy finding"
            className="font-jetbrains text-[10px] w-5 h-5 flex items-center justify-center rounded-sm transition-colors"
            style={{ color: copied ? "#29d398" : "#6688aa", background: "rgba(100,130,170,0.1)" }}
            aria-label="Copy finding details"
          >
            {copied ? "✓" : "⎘"}
          </button>
        </div>
      </div>

      {/* Message (always visible) */}
      <p className="font-jetbrains text-[10px] mt-1.5 leading-relaxed" style={{ color: "#a8a49a" }}>
        {finding.message}
      </p>

      {/* Expanded: what it means, where it is, how to fix, where to read more */}
      {expanded && (
        <div className="mt-2 space-y-2 animate-fade-up">
          {finding.explanation && (
            <div
              className="font-jetbrains text-[10px] leading-relaxed px-2 py-1.5 rounded-sm"
              style={{
                color: "#d8e4f8",
                background: "rgba(232,178,60,0.06)",
                border: "1px solid rgba(232,178,60,0.2)",
              }}
            >
              <span style={{ color: "#d8c9a3", opacity: 0.9 }}>WHY IT MATTERS ▸ </span>
              {finding.explanation}
            </div>
          )}

          {finding.snippet && <CodeFrame snippet={finding.snippet} />}

          {finding.fix && (
            <div
              className="font-jetbrains text-[10px] leading-relaxed px-2 py-1.5 rounded-sm"
              style={{
                color: "#29d398",
                background: "rgba(41,211,152,0.07)",
                border: "1px solid rgba(41,211,152,0.18)",
              }}
            >
              <span style={{ opacity: 0.6 }}>FIX ▸ </span>
              {finding.fix}
            </div>
          )}

          {refUrl && (
            <a
              href={refUrl}
              target="_blank"
              rel="noreferrer"
              className="font-jetbrains text-[9px] inline-flex items-center gap-1 transition-opacity hover:opacity-80"
              style={{ color: "#d8c9a3" }}
            >
              ↗{" "}
              {finding.provenance === "npm-audit"
                ? "open security advisory"
                : finding.provenance === "semgrep"
                  ? "view rule documentation"
                  : "read more (OWASP/CWE)"}
            </a>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Main panel ────────────────────────────────────────────────────────── */
export function InfoPanel() {
  const cityData = useStore((s) => s.cityData);
  const selectedUnit = useStore((s) => s.selectedUnit);
  const showFindings = useStore((s) => s.showFindings);
  const setSelectedUnit = useStore((s) => s.setSelectedUnit);
  const focusPath = useStore((s) => s.focusPath);
  const setFocusPath = useStore((s) => s.setFocusPath);
  const analysisId = useStore((s) => s.analysisId);

  if (!cityData || selectedUnit?.kind !== "file") return null;

  const hit = findFileById(cityData, selectedUnit.id);
  if (!hit) return null;

  const file = hit.file;
  const accent = languageColor(file.language);
  const inOtherDistrict = hit.chain.join("/") !== focusPath.join("/");
  const hasFindings = file.findings.length > 0;
  const hasAst = file.findings.some((f) => f.provenance === "semgrep");
  const hasSecrets = file.findings.some((f) => f.provenance?.startsWith("gitleaks"));

  return (
    <div
      className="absolute panel-scroll animate-slide-right panel-info"
      style={{
        top: "4.5rem",
        right: showFindings ? "23rem" : "1rem",
        width: 330,
        maxHeight: "calc(100vh - 6rem)",
        overflowY: "auto",
        background: "rgba(18, 18, 16, 0.94)",
        border: `1px solid ${accent}55`,
        borderRadius: 5,
        padding: "1rem",
        color: "#e8e4da",
        fontFamily: "var(--font-mono)",
        fontSize: "0.75rem",
        pointerEvents: "auto",
        boxShadow: `0 0 30px ${accent}1a, 0 8px 32px rgba(0,0,0,0.5)`,
        zIndex: 25,
        backdropFilter: "blur(16px)",
      }}
      role="dialog"
      aria-label={`File details: ${file.name}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0 flex-1">
          {/* Language + stats row */}
          <div className="flex items-center gap-1.5 mb-2 flex-wrap">
            <span
              className="w-2.5 h-2.5 rounded-sm inline-block shrink-0"
              style={{ background: accent, boxShadow: `0 0 6px ${accent}` }}
            />
            <span
              className="font-jetbrains text-[9px] tracking-[0.15em] uppercase"
              style={{ color: accent }}
              title="Language — the building's facade color in the city"
            >
              {file.language}
            </span>
            <span className="font-jetbrains text-[9px]" style={{ color: "var(--meta-strong)" }}>
              ·
            </span>
            <span
              className="font-jetbrains text-[9px]"
              style={{ color: "#8f8b82" }}
              title="Lines of code in this file — feeds the building's height"
            >
              {file.linesOfCode.toLocaleString()} LOC
            </span>
            <span className="font-jetbrains text-[9px]" style={{ color: "var(--meta-strong)" }}>
              ·
            </span>
            <span
              className="font-jetbrains text-[9px]"
              style={{ color: "#8f8b82" }}
              title="Cyclomatic complexity — number of independent paths through the code (loops + branches). Above ~10 gets hard to test; consider simplifying."
            >
              cx {file.cyclomaticComplexity}
            </span>
          </div>

          {/* Filename */}
          <h3
            className="font-jetbrains font-semibold leading-tight"
            style={{ color: "#e8f0ff", fontSize: "0.82rem", wordBreak: "break-all" }}
          >
            {file.name}
          </h3>
          <p
            className="font-jetbrains text-[9px] mt-0.5"
            style={{ color: "var(--meta-strong)", wordBreak: "break-all" }}
          >
            {file.path}
          </p>
        </div>

        <button
          onClick={() => setSelectedUnit(null)}
          aria-label="Close info panel"
          className="btn-danger shrink-0 ml-3 w-6 h-6 flex items-center justify-center"
        >
          ✕
        </button>
      </div>

      {/* Navigate to district — keep the file selection so the panel the
          user is reading doesn't vanish underneath them */}
      {inOtherDistrict && (
        <button
          onClick={() => setFocusPath(hit.chain, { keepSelection: true })}
          className="w-full mb-3 py-1.5 font-jetbrains text-[10px] tracking-widest rounded-sm transition-all duration-150 hover:opacity-90"
          style={{
            border: "1px solid rgba(232,178,60,0.4)",
            color: "#f2d5a0",
            background: "rgba(232,178,60,0.07)",
          }}
        >
          → OPEN DISTRICT /{hit.chain.join("/")}
        </button>
      )}

      {/* Threat + provenance badges */}
      <div className="flex gap-1.5 flex-wrap mb-3">
        <span
          className="font-jetbrains text-[9px] px-1.5 py-px rounded-sm uppercase tracking-wide"
          style={{
            color: "#a8a49a",
            border: "1px solid rgba(100,130,170,0.3)",
            background: "rgba(100,130,170,0.08)",
          }}
          title="Threat level — the worst finding severity in this file (critical → high → medium → low). Drawn as red pulsing windows in the city."
        >
          {file.threatLevel}
        </span>
        {file.churnScore !== undefined && (
          <span
            className="font-jetbrains text-[9px] px-1.5 py-px rounded-sm"
            style={{
              color:
                file.churnScore >= 0.55
                  ? "#ff7a1a"
                  : file.churnScore >= 0.35
                    ? "#ffd23f"
                    : "#29d398",
              border: "1px solid rgba(255,122,26,0.3)",
              background: "rgba(255,122,26,0.08)",
            }}
            title={`Git churn — how often this file changes (${file.commitCount ?? 0} commits, weighted by change size and recency). High churn on complex code is a refactor hotspot — add tests before touching it.`}
          >
            CHURN {file.churnScore.toFixed(2)}
          </span>
        )}
        {file.exportedSymbols !== undefined && (
          <span
            className="font-jetbrains text-[9px] px-1.5 py-px rounded-sm"
            style={{
              color: "#a78bfa",
              border: "1px solid rgba(167,139,250,0.3)",
              background: "rgba(167,139,250,0.08)",
            }}
            title="API surface — exported functions/classes other files may import. A wide building footprint means many exports; trimming them shrinks the building."
          >
            API {file.exportedSymbols}
          </span>
        )}
        {file.deadCodeCandidate && (
          <span
            className="font-jetbrains text-[9px] px-1.5 py-px rounded-sm"
            style={{
              color: "#d8cdb4",
              border: "1px solid rgba(210,200,180,0.35)",
              background: "rgba(210,200,180,0.1)",
            }}
            title="Dead-code candidate — exported but never imported anywhere (drawn as a glass building). Check for dynamic imports, then delete if truly unused."
          >
            DEAD CODE?
          </span>
        )}
        {file.bytes !== undefined && file.bytes >= 150_000 && (
          <span
            className="font-jetbrains text-[9px] px-1.5 py-px rounded-sm"
            style={{
              color: "#9aa7b8",
              border: "1px solid rgba(154,167,184,0.4)",
              background: "rgba(154,167,184,0.1)",
            }}
            title="Huge file — 150 KB or more of raw source, drawn as a black windowless monolith. Splitting it up makes the real complexity visible."
          >
            {(file.bytes / 1024).toFixed(0)} KB
          </span>
        )}
        {file.inCycle && (
          <span
            className="font-jetbrains text-[9px] px-1.5 py-px rounded-sm"
            style={{
              color: "#ff2e4d",
              border: "1px solid rgba(255,46,77,0.35)",
              background: "rgba(255,46,77,0.08)",
            }}
            title="Circular import — this file is part of an import loop (A imports B imports A), marked by a rotating red ring. Break the loop by extracting the shared code into its own file."
          >
            CYCLE
          </span>
        )}
        {file.coveragePct !== undefined && (
          <span
            className="font-jetbrains text-[9px] px-1.5 py-px rounded-sm"
            style={{
              color: file.coveragePct >= 80 ? "#d8c9a3" : "#ffd23f",
              border: `1px solid ${file.coveragePct >= 80 ? "rgba(232,178,60,0.35)" : "rgba(255,210,63,0.35)"}`,
              background:
                file.coveragePct >= 80 ? "rgba(232,178,60,0.08)" : "rgba(255,210,63,0.08)",
            }}
            title={`Test coverage — share of lines run by the repo's own tests (lcov report). 80% or more earns the translucent shield around the building.`}
          >
            COV {file.coveragePct}%
          </span>
        )}
        {file.clonePartners && file.clonePartners.length > 0 && (
          <span
            className="font-jetbrains text-[9px] px-1.5 py-px rounded-sm"
            style={{
              color: "#ffe14d",
              border: "1px solid rgba(255,225,77,0.4)",
              background: "rgba(255,225,77,0.08)",
            }}
            title={`Copy-paste clone — duplicated code also lives in ${file.clonePartners
              .map((p) => p.path)
              .join(
                ", ",
              )}. A yellow laser links the copies in the city; extract a shared helper instead.`}
          >
            CLONE ×{file.clonePartners.length}
          </span>
        )}
        {file.topAuthor && (
          <span
            className="font-jetbrains text-[9px] px-1.5 py-px rounded-sm"
            style={{
              color: authorColor(file.topAuthor),
              border: `1px solid ${authorColor(file.topAuthor)}55`,
              background: `${authorColor(file.topAuthor)}14`,
            }}
            title={`Git blame — ${file.topAuthor} wrote most of this file. Colors mark author territory across the city.`}
          >
            {file.topAuthor}
          </span>
        )}
        {hasAst && (
          <span
            className="font-jetbrains text-[9px] px-1.5 py-px rounded-sm"
            style={{
              color: "#d8c9a3",
              border: "1px solid rgba(232,178,60,0.3)",
              background: "rgba(232,178,60,0.08)",
            }}
            title="Includes AST findings — code-level analysis (semgrep) that understands syntax and data flow, not just patterns."
          >
            AST
          </span>
        )}
        {hasSecrets && (
          <span
            className="font-jetbrains text-[9px] px-1.5 py-px rounded-sm"
            style={{
              color: "#ff6464",
              border: "1px solid rgba(255,100,100,0.3)",
              background: "rgba(255,100,100,0.08)",
            }}
            title="Contains hardcoded secrets (gitleaks) — keys, tokens or passwords in source. Rotate the credential now, then move it to an environment variable."
          >
            SECRETS
          </span>
        )}
      </div>

      {/* SARIF download */}
      {analysisId && (
        <a
          href={`/api/result/${encodeURIComponent(analysisId)}/sarif`}
          download={`ephemora-${analysisId}.sarif`}
          className="inline-flex items-center gap-1.5 mb-3 font-jetbrains text-[9px] tracking-wide transition-opacity hover:opacity-80"
          style={{ color: "#d8c9a3" }}
          title="Download all findings as a SARIF report — the standard format code scanners and GitHub understand"
        >
          ↓ SARIF Export
        </a>
      )}

      {/* Jump straight into the code at the first finding's line */}
      <OpenInIde
        filePath={file.path}
        line={file.findings.length > 0 ? file.findings[0]!.line : undefined}
        repoKey={(() => {
          const city = useStore.getState().cityData;
          return city ? `${city.repo.owner}/${city.repo.name}` : undefined;
        })()}
      />

      <RunTestsButton filePath={file.path} />
      <TestResultsBlock filePath={file.path} />

      {/* Divider */}
      <div style={{ height: 1, background: "rgba(232,178,60,0.1)", marginBottom: "0.75rem" }} />

      {/* Findings */}
      {hasFindings ? (
        <>
          <div className="flex items-center justify-between mb-2.5">
            <span
              className="font-jetbrains text-[9px] tracking-[0.2em] uppercase"
              style={{ color: SEVERITY_COLOR.P0 }}
            >
              {file.findings.length} Finding{file.findings.length !== 1 ? "s" : ""}
            </span>
            <span
              className="font-jetbrains text-[9px]"
              style={{ color: "var(--meta-strong)" }}
              title="How these findings were detected — AST: syntax-aware analysis (semgrep) · Heuristic: pattern matching · Secrets: hardcoded credential scan (gitleaks)"
            >
              {hasAst && hasSecrets
                ? "AST + Heuristic + Secrets"
                : hasAst
                  ? "AST + Heuristic"
                  : hasSecrets
                    ? "Heuristic + Secrets"
                    : "Heuristic"}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            {file.findings.map((f, i) => (
              <FindingRow key={i} finding={f} index={i} filePath={file.path} />
            ))}
          </div>
        </>
      ) : (
        <div
          className="flex items-center gap-2 px-3 py-2.5 rounded-sm"
          style={{ background: "rgba(41,211,152,0.07)", border: "1px solid rgba(41,211,152,0.2)" }}
        >
          <span style={{ color: "#29d398" }}>✓</span>
          <span className="font-jetbrains text-[10px]" style={{ color: "#29d398" }}>
            No findings detected in this file
          </span>
        </div>
      )}
    </div>
  );
}

/* ── Run tests — for the file's own test suite ─────────────────────────── */
const TEST_FILE = /\.(test|spec)\.[jt]sx?$|(^|\/)(tests?|__tests__)\//i;

function RunTestsButton({ filePath }: { filePath: string }) {
  const testRun = useStore((s) => s.testRun);
  const analysisId = useStore((s) => s.analysisId);
  const { runTests } = useTestRunner();

  const isTestFile = TEST_FILE.test(filePath);
  const busy = testRun.status === "installing" || testRun.status === "running";
  if (!isTestFile) return null;

  return (
    <button
      onClick={() => void runTests([filePath])}
      disabled={busy || !analysisId}
      className="w-full mb-3 py-1.5 font-jetbrains text-[10px] tracking-widest rounded-sm
                 transition-all duration-150 hover:brightness-110 focus:outline-none focus:ring-1 focus:ring-[#29d398]
                 disabled:opacity-40 cursor-pointer"
      style={{
        border: "1px solid rgba(41,211,152,0.45)",
        color: "#29d398",
        background: "rgba(41,211,152,0.07)",
      }}
      title="Run this test file with the project's own runner (vitest/jest) on your machine"
    >
      {busy ? `⟳ ${testRun.stage || "RUNNING…"}` : "▶ RUN THIS TEST FILE"}
    </button>
  );
}

function TestResultsBlock({ filePath }: { filePath: string }) {
  const result = useStore((s) => s.testResults[filePath]);
  const testRun = useStore((s) => s.testRun);
  if (!result) return null;
  return (
    <div
      className="mb-3 rounded-sm overflow-hidden"
      style={{
        border: `1px solid ${result.status === "failed" ? "rgba(255,46,77,0.4)" : "rgba(41,211,152,0.35)"}`,
        background: result.status === "failed" ? "rgba(255,46,77,0.06)" : "rgba(41,211,152,0.05)",
      }}
    >
      <div
        className="px-2 py-1.5 font-jetbrains text-[10px] font-semibold"
        style={{ color: result.status === "failed" ? "#ff6b7a" : "#29d398" }}
      >
        {result.status === "failed" ? "✕ TESTS FAILING" : "✓ TESTS PASSING"} · {result.tests} test
        {result.tests !== 1 ? "s" : ""}
        {testRun.status === "complete" ? ` · ${testRun.stage}` : ""}
      </div>
      {result.failures.slice(0, 3).map((f, i) => (
        <div key={i} className="px-2 pb-1.5">
          <div className="font-jetbrains text-[9.5px]" style={{ color: "#ff9aa5" }}>
            ✕ {f.name}
          </div>
          <pre
            className="font-jetbrains text-[9px] leading-snug whitespace-pre-wrap mt-0.5"
            style={{ color: "var(--meta)" }}
          >
            {f.message}
          </pre>
        </div>
      ))}
      {result.failures.length > 3 && (
        <div className="px-2 pb-1.5 font-jetbrains text-[9px]" style={{ color: "var(--meta)" }}>
          + {result.failures.length - 3} more failures
        </div>
      )}
    </div>
  );
}
