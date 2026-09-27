import { useState } from "react";
import { useStore } from "../stores/useStore";
import { findFileById } from "../city/layout";
import { languageColor, SEVERITY_COLOR } from "../city/palette";
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
  const color = isAst ? "#4db4ff" : isSecret ? "#ff6464" : "#8fa3c4";
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
      style={{ background: "rgba(0,0,0,0.45)", border: "1px solid rgba(90,130,200,0.18)" }}
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
          <span className="font-jetbrains text-[10px] truncate" style={{ color: "#aebfe0" }}>
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
      <p className="font-jetbrains text-[10px] mt-1.5 leading-relaxed" style={{ color: "#8fa3c4" }}>
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
                background: "rgba(77,180,255,0.06)",
                border: "1px solid rgba(77,180,255,0.2)",
              }}
            >
              <span style={{ color: "#4db4ff", opacity: 0.9 }}>WHY IT MATTERS ▸ </span>
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
              style={{ color: "#4db4ff" }}
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
        background: "rgba(6, 9, 20, 0.94)",
        border: `1px solid ${accent}55`,
        borderRadius: 5,
        padding: "1rem",
        color: "#c8d8f0",
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
            >
              {file.language}
            </span>
            <span className="font-jetbrains text-[9px]" style={{ color: "var(--meta-strong)" }}>
              ·
            </span>
            <span className="font-jetbrains text-[9px]" style={{ color: "#6b84a8" }}>
              {file.linesOfCode.toLocaleString()} LOC
            </span>
            <span className="font-jetbrains text-[9px]" style={{ color: "var(--meta-strong)" }}>
              ·
            </span>
            <span className="font-jetbrains text-[9px]" style={{ color: "#6b84a8" }}>
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

      {/* Navigate to district */}
      {inOtherDistrict && (
        <button
          onClick={() => setFocusPath(hit.chain)}
          className="w-full mb-3 py-1.5 font-jetbrains text-[10px] tracking-widest rounded-sm transition-all duration-150 hover:opacity-90"
          style={{
            border: "1px solid rgba(77,227,255,0.4)",
            color: "#4de3ff",
            background: "rgba(77,227,255,0.07)",
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
            color: "#8fa3c4",
            border: "1px solid rgba(100,130,170,0.3)",
            background: "rgba(100,130,170,0.08)",
          }}
        >
          {file.threatLevel}
        </span>
        {hasAst && (
          <span
            className="font-jetbrains text-[9px] px-1.5 py-px rounded-sm"
            style={{
              color: "#4db4ff",
              border: "1px solid rgba(77,180,255,0.3)",
              background: "rgba(77,180,255,0.08)",
            }}
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
          >
            SECRETS
          </span>
        )}
      </div>

      {/* SARIF download */}
      {analysisId && (
        <a
          href={`/api/result/${encodeURIComponent(analysisId)}/sarif`}
          download={`codecity-${analysisId}.sarif`}
          className="inline-flex items-center gap-1.5 mb-3 font-jetbrains text-[9px] tracking-wide transition-opacity hover:opacity-80"
          style={{ color: "#4db4ff" }}
        >
          ↓ SARIF Export
        </a>
      )}

      {/* Divider */}
      <div style={{ height: 1, background: "rgba(77,227,255,0.1)", marginBottom: "0.75rem" }} />

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
            <span className="font-jetbrains text-[9px]" style={{ color: "var(--meta-strong)" }}>
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
