"use client";

import { useMemo } from "react";
import { useStore } from "../stores/useStore";
import { allFiles } from "../city/layout";
import { SEVERITY_COLOR, languageColor } from "../city/palette";
import type { CityFinding, Severity } from "../city/types";

const SEVERITY_RANK: Record<Severity, number> = { P0: 0, P1: 1, P2: 2 };

/**
 * "Where are my problems?" — every finding in the city, grouped by file,
 * worst first. Click a row to fly to that building. This is the readable
 * report view for people who want a plain list instead of a tour.
 */
export function FindingsPanel() {
  const cityData = useStore((s) => s.cityData);
  const showFindings = useStore((s) => s.showFindings);
  const setShowFindings = useStore((s) => s.setShowFindings);
  const navigateToFile = useStore((s) => s.navigateToFile);
  const selectedUnit = useStore((s) => s.selectedUnit);

  const groups = useMemo(() => {
    if (!cityData) return [];
    const out = allFiles(cityData)
      .filter(({ file }) => file.findings.length > 0)
      .map(({ file }) => ({
        file,
        worst: Math.min(...file.findings.map((f) => SEVERITY_RANK[f.severity])),
        count: file.findings.length,
      }))
      .sort(
        (a, b) => a.worst - b.worst || b.count - a.count || a.file.linesOfCode - b.file.linesOfCode,
      );
    return out;
  }, [cityData]);

  const totalFindings = groups.reduce((s, g) => s + g.count, 0);

  if (!cityData || !showFindings) return null;

  return (
    <div
      role="region"
      aria-label="All security and quality findings"
      className="absolute top-[100px] right-4 bottom-24 z-30 w-[340px] flex flex-col animate-fade-up pointer-events-auto"
      style={{
        background: "rgba(5, 8, 20, 0.94)",
        border: "1px solid rgba(90,130,200,0.25)",
        borderRadius: 4,
        backdropFilter: "blur(12px)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2.5 shrink-0"
        style={{ borderBottom: "1px solid rgba(90,130,200,0.18)" }}
      >
        <div className="font-jetbrains text-[10px] tracking-[0.2em]" style={{ color: "#8fa3c4" }}>
          ⚠ ALL FINDINGS <span style={{ color: SEVERITY_COLOR.P0 }}>{totalFindings}</span>{" "}
          <span style={{ color: "#445566" }}>in {groups.length} files</span>
        </div>
        <button
          onClick={() => setShowFindings(false)}
          aria-label="Close findings list"
          className="font-jetbrains text-[10px] w-5 h-5 flex items-center justify-center rounded-sm transition-colors hover:brightness-125"
          style={{ color: "#6688aa", background: "rgba(100,130,170,0.12)" }}
        >
          ✕
        </button>
      </div>

      {/* Grouped list */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
        {groups.length === 0 && (
          <div
            className="font-jetbrains text-[10px] px-2 py-6 text-center"
            style={{ color: "#29d398" }}
          >
            ✓ Nothing found — this project looks clean
          </div>
        )}
        {groups.map(({ file, worst, count }) => {
          const fileSeverity: Severity = worst === 0 ? "P0" : worst === 1 ? "P1" : "P2";
          const accent = SEVERITY_COLOR[fileSeverity];
          const isSelected = selectedUnit?.kind === "file" && selectedUnit.id === file.id;
          return (
            <div
              key={file.id}
              className="rounded-sm"
              style={{
                borderLeft: `2px solid ${accent}`,
                background: isSelected ? "rgba(0,212,255,0.08)" : "rgba(15,22,40,0.55)",
                marginBottom: 4,
              }}
            >
              {/* File row — click to fly */}
              <button
                onClick={() => navigateToFile(file.id)}
                title={`Show ${file.name} in the city`}
                className="w-full text-left px-2 py-1.5 transition-colors hover:bg-[rgba(0,212,255,0.05)] cursor-pointer"
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="font-jetbrains text-[10.5px] truncate"
                    style={{ color: isSelected ? "#4de3ff" : "#d8e4f8" }}
                  >
                    {file.name}
                  </span>
                  <span
                    className="font-jetbrains text-[9px] shrink-0 px-1.5 py-px rounded-sm"
                    style={{
                      color: accent,
                      background: `${accent}15`,
                      border: `1px solid ${accent}44`,
                    }}
                  >
                    {count} finding{count !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span
                    className="w-1.5 h-1.5 rounded-sm inline-block shrink-0"
                    style={{ background: languageColor(file.language) }}
                  />
                  <span className="font-jetbrains text-[9px] truncate" style={{ color: "#4d6488" }}>
                    {file.path}
                  </span>
                </div>
              </button>

              {/* Finding rows (compact) */}
              <div className="px-2 pb-1.5 space-y-0.5">
                {[...file.findings]
                  .sort(
                    (a, b) =>
                      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.line - b.line,
                  )
                  .map((f: CityFinding, i: number) => (
                    <button
                      key={i}
                      onClick={() => navigateToFile(file.id)}
                      className="w-full text-left flex items-start gap-1.5 py-0.5 cursor-pointer group"
                    >
                      <span
                        className="font-jetbrains text-[8.5px] shrink-0 px-1 rounded-sm mt-px"
                        style={{
                          color: SEVERITY_COLOR[f.severity],
                          border: `1px solid ${SEVERITY_COLOR[f.severity]}55`,
                        }}
                      >
                        {f.severity}
                      </span>
                      <span
                        className="font-jetbrains text-[9px] leading-snug truncate group-hover:brightness-125"
                        style={{ color: "#8fa3c4" }}
                        title={`${f.message} (${f.type} · line ${f.line})`}
                      >
                        {f.message}
                        <span style={{ color: "#445566" }}> :{f.line}</span>
                      </span>
                    </button>
                  ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer hint */}
      <div
        className="px-3 py-1.5 shrink-0 font-jetbrains text-[9px]"
        style={{ color: "#3d5070", borderTop: "1px solid rgba(90,130,200,0.14)" }}
      >
        click a file to fly there · details in the right panel
      </div>
    </div>
  );
}
