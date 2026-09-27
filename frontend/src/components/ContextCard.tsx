"use client";

import { useEffect, useState } from "react";
import { useStore } from "../stores/useStore";
import { resolveDir, tourStops } from "../city/layout";
import { topLanguages, languageColor, SEVERITY_COLOR } from "../city/palette";

export function ContextCard() {
  const cityData = useStore((s) => s.cityData);
  const buildPhase = useStore((s) => s.buildPhase);
  const focusPath = useStore((s) => s.focusPath);
  const navigateToFile = useStore((s) => s.navigateToFile);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(false);
  }, [cityData]);

  if (!cityData || buildPhase === "constructing" || dismissed) return null;

  const isRoot = focusPath.length === 0;
  const dir = resolveDir(cityData.tree, focusPath);
  const findings = dir.findingsBySeverity;
  const totalFindings = findings.P0 + findings.P1 + findings.P2;
  const langs = topLanguages(dir.languages, 4);
  const totalLangLines = Object.values(dir.languages).reduce((s, v) => s + v, 0) || 1;
  const threatScore = dir.threatScore;

  const stops = tourStops(cityData);
  const chainPrefix = focusPath.join("/");
  const inScope = isRoot
    ? stops[0]
    : (stops.find(
        (s) => s.chain.join("/") === chainPrefix && s.file.path.startsWith(dir.path + "/"),
      ) ?? stops.find((s) => s.file.path.startsWith(dir.path + "/")));

  return (
    <div
      className="absolute left-4 z-20 pointer-events-auto animate-slide-left"
      style={{
        top: 84,
        width: 292,
        background: "rgba(6, 9, 20, 0.92)",
        border: "1px solid rgba(90,130,200,0.28)",
        borderRadius: 5,
        padding: "0.85rem 0.95rem",
        fontFamily: "var(--font-mono)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.45), 0 0 0 1px rgba(77,227,255,0.05)",
        backdropFilter: "blur(16px)",
      }}
      role="region"
      aria-label={isRoot ? "City dossier" : "District dossier"}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-2.5">
        <div className="min-w-0 flex-1">
          <div
            className="font-jetbrains text-[9px] tracking-[0.25em] mb-0.5"
            style={{ color: "rgba(0,255,159,0.55)" }}
          >
            {isRoot ? "CITY DOSSIER" : "DISTRICT"}
          </div>
          <div
            className="font-jetbrains font-bold truncate"
            style={{ color: "#e8f0ff", fontSize: "0.82rem" }}
          >
            {isRoot ? cityData.repo.name : dir.name}
          </div>
          {!isRoot && (
            <div className="font-jetbrains text-[9px] truncate mt-0.5" style={{ color: "#4d6488" }}>
              /{dir.path}
            </div>
          )}
        </div>
        <button
          onClick={() => setDismissed(true)}
          aria-label="Dismiss context card"
          className="btn-ghost shrink-0 ml-2 w-6 h-6 flex items-center justify-center !p-0"
        >
          ✕
        </button>
      </div>

      {/* Stats row */}
      <div className="flex gap-3 mb-3 flex-wrap">
        {!isRoot && (
          <div className="flex flex-col">
            <span className="font-jetbrains text-[9px]" style={{ color: "#4d6488" }}>
              DISTRICTS
            </span>
            <span className="font-jetbrains text-[13px] font-semibold" style={{ color: "#4de3ff" }}>
              {dir.children.length}
            </span>
          </div>
        )}
        <div className="flex flex-col">
          <span className="font-jetbrains text-[9px]" style={{ color: "#4d6488" }}>
            FILES
          </span>
          <span className="font-jetbrains text-[13px] font-semibold" style={{ color: "#4de3ff" }}>
            {dir.fileCount.toLocaleString()}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="font-jetbrains text-[9px]" style={{ color: "#4d6488" }}>
            LINES
          </span>
          <span className="font-jetbrains text-[13px] font-semibold" style={{ color: "#4de3ff" }}>
            {dir.linesOfCode >= 1000
              ? `${(dir.linesOfCode / 1000).toFixed(1)}k`
              : dir.linesOfCode.toLocaleString()}
          </span>
        </div>
        {threatScore > 0 && (
          <div
            className="flex flex-col"
            title="Risk score 0–100: every finding adds P0=10 / P1=7 / P2=3 points, weighted by file size. Below 10 is a good sign."
          >
            <span className="font-jetbrains text-[9px]" style={{ color: "#4d6488" }}>
              RISK
            </span>
            <span
              className="font-jetbrains text-[13px] font-semibold"
              style={{
                color:
                  threatScore >= 30
                    ? SEVERITY_COLOR.P0
                    : threatScore >= 10
                      ? SEVERITY_COLOR.P1
                      : SEVERITY_COLOR.P2,
              }}
            >
              {threatScore}
            </span>
          </div>
        )}
      </div>

      {/* Findings */}
      {totalFindings > 0 ? (
        <div className="flex gap-1.5 mb-3 flex-wrap">
          {(["P0", "P1", "P2"] as const).map((sev) =>
            findings[sev] > 0 ? (
              <span
                key={sev}
                className={`chip-${sev.toLowerCase()} font-jetbrains text-[10px] px-1.5 py-px rounded-sm`}
              >
                {sev} · {findings[sev]}
              </span>
            ) : null,
          )}
        </div>
      ) : (
        <div
          className="flex items-center gap-1.5 mb-3 px-2 py-1 rounded-sm"
          style={{ background: "rgba(41,211,152,0.07)", border: "1px solid rgba(41,211,152,0.18)" }}
        >
          <span style={{ color: "#29d398" }}>✓</span>
          <span className="font-jetbrains text-[10px]" style={{ color: "#29d398" }}>
            No findings here
          </span>
        </div>
      )}

      {/* Language mix */}
      <div className="mb-3">
        <div
          className="font-jetbrains text-[9px] tracking-[0.2em] mb-1.5"
          style={{ color: "#4d6488" }}
        >
          LANGUAGES
        </div>
        <div className="flex flex-col gap-1.5">
          {langs.map((l) => {
            const pct = Math.max(3, (l.lines / totalLangLines) * 100);
            return (
              <div key={l.name} className="flex items-center gap-2">
                <div
                  className="flex-1 h-[5px] rounded-full overflow-hidden"
                  style={{ background: "rgba(30,45,72,0.9)" }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${pct}%`,
                      background: languageColor(l.name),
                      boxShadow: `0 0 5px ${languageColor(l.name)}88`,
                      transition: "width 0.6s ease-out",
                    }}
                  />
                </div>
                <span
                  className="font-jetbrains text-[9px] w-20 text-right"
                  style={{ color: "#6b84a8" }}
                >
                  {l.name}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Most at risk */}
      {inScope && (
        <button
          onClick={() => navigateToFile(inScope.file.id)}
          className="w-full text-left px-2.5 py-2 rounded-sm transition-all duration-150 hover:bg-[rgba(255,46,77,0.1)]"
          style={{
            border: `1px solid ${SEVERITY_COLOR.P0}33`,
            background: "rgba(255,46,77,0.05)",
          }}
          title="Fly to the most risky file"
        >
          <div
            className="font-jetbrains text-[9px] tracking-[0.2em] mb-0.5"
            style={{ color: SEVERITY_COLOR.P0 }}
          >
            ⚑ MOST AT RISK
          </div>
          <div
            className="font-jetbrains text-[10px] truncate font-medium"
            style={{ color: "#e8f0ff" }}
          >
            {inScope.file.name}
          </div>
          {inScope.file.findings[0] && (
            <div className="font-jetbrains text-[9px] truncate mt-0.5" style={{ color: "#6b84a8" }}>
              {inScope.file.findings[0].type} · {inScope.file.findings.length} finding
              {inScope.file.findings.length !== 1 ? "s" : ""}
            </div>
          )}
        </button>
      )}

      <p className="font-jetbrains text-[9px] mt-2.5 leading-relaxed" style={{ color: "#4a5e7a" }}>
        {isRoot
          ? "Click a district to dive in · ⚑ Security Tour explains every finding"
          : "Click a sub-district to dive deeper · ↑ or ⌂ to go back"}
      </p>
    </div>
  );
}
