import { useEffect, useState } from "react";
import { useStore } from "../stores/useStore";
import { resolveDir, tourStops } from "../city/layout";
import { topLanguages, languageColor, SEVERITY_COLOR, authorColor } from "../city/palette";
import { MarkerLegend } from "./CoachMarks";

export function ContextCard() {
  const cityData = useStore((s) => s.cityData);
  const buildPhase = useStore((s) => s.buildPhase);
  const focusPath = useStore((s) => s.focusPath);
  const navigateToFile = useStore((s) => s.navigateToFile);
  const [dismissed, setDismissed] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);

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
      className="absolute left-4 z-20 pointer-events-auto animate-slide-left panel-context-card"
      style={{
        top: 84,
        width: 292,
        maxHeight: "calc(100vh - 260px)",
        overflowY: "auto",
        background: "rgba(18, 18, 16, 0.92)",
        border: "1px solid rgba(150,142,128,0.28)",
        borderRadius: 5,
        padding: "0.85rem 0.95rem",
        fontFamily: "var(--font-mono)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.45), 0 0 0 1px rgba(232,178,60,0.05)",
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
            style={{ color: "rgba(232,80,60,0.55)" }}
          >
            {isRoot ? "CITY DOSSIER" : "DISTRICT"}
          </div>
          <div
            className="font-jetbrains font-bold truncate"
            style={{ color: "#f2efe8", fontSize: "0.95rem", letterSpacing: "0.01em" }}
          >
            {isRoot ? cityData.repo.name : dir.name}
          </div>
          {!isRoot && (
            <div
              className="font-jetbrains text-[9px] truncate mt-0.5"
              style={{ color: "var(--meta-faint)" }}
              title={`Current district path: /${dir.path}`}
            >
              {dir.path.includes("/") ? (
                <>
                  /{dir.path.slice(0, dir.path.lastIndexOf("/") + 1)}
                  <span style={{ color: "var(--meta-strong)" }}>
                    {dir.path.slice(dir.path.lastIndexOf("/") + 1)}
                  </span>
                </>
              ) : (
                `/${dir.path}`
              )}
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
          <div
            className="flex flex-col"
            title="Sub-folders inside this district — each is its own city block. Click one to zoom in."
          >
            <span className="font-jetbrains text-[9px]" style={{ color: "var(--meta-strong)" }}>
              DISTRICTS
            </span>
            <span className="font-jetbrains text-[13px] font-semibold" style={{ color: "#f2d5a0" }}>
              {dir.children.length}
            </span>
          </div>
        )}
        <div
          className="flex flex-col"
          title="Source files in this view — each file is one building. Click a building for its details."
        >
          <span className="font-jetbrains text-[9px]" style={{ color: "var(--meta-strong)" }}>
            FILES
          </span>
          <span className="font-jetbrains text-[13px] font-semibold" style={{ color: "#f2d5a0" }}>
            {dir.fileCount.toLocaleString()}
          </span>
        </div>
        <div
          className="flex flex-col"
          title="Lines of code (LOC) across all files in this view — not comments or blanks."
        >
          <span className="font-jetbrains text-[9px]" style={{ color: "var(--meta-strong)" }}>
            LINES
          </span>
          <span className="font-jetbrains text-[13px] font-semibold" style={{ color: "#f2d5a0" }}>
            {dir.linesOfCode >= 1000
              ? `${(dir.linesOfCode / 1000).toFixed(1)}k`
              : dir.linesOfCode.toLocaleString()}
          </span>
        </div>
        {threatScore > 0 && (
          <div
            className="flex flex-col"
            title="Risk 0–100: each finding adds points (critical P0 = 10 · high P1 = 7 · medium P2 = 3), scaled by file size. Below 10 is a good sign."
          >
            <span className="font-jetbrains text-[9px]" style={{ color: "var(--meta-strong)" }}>
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

      {/* Author territory — who owns this district (git blame) */}
      {dir.topAuthor && (
        <div
          className="flex items-center gap-1.5 mb-3"
          title={`${dir.topAuthor} owns ${Math.round((dir.topAuthorShare ?? 0) * 100)}% of the authored files in this district`}
        >
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{
              background: authorColor(dir.topAuthor),
              boxShadow: `0 0 5px ${authorColor(dir.topAuthor)}`,
            }}
          />
          <span className="font-jetbrains text-[9.5px]" style={{ color: "#cfcabe" }}>
            {dir.topAuthor}
          </span>
          <span className="font-jetbrains text-[9px]" style={{ color: "var(--meta-faint)" }}>
            owns {Math.round((dir.topAuthorShare ?? 0) * 100)}%
          </span>
        </div>
      )}

      {/* Findings */}
      {totalFindings > 0 ? (
        <div className="flex gap-1.5 mb-3 flex-wrap">
          {(["P0", "P1", "P2"] as const).map((sev) =>
            findings[sev] > 0 ? (
              <span
                key={sev}
                className={`chip-${sev.toLowerCase()} font-jetbrains text-[10px] px-1.5 py-px rounded-sm`}
                title={
                  sev === "P0"
                    ? `Critical (${findings[sev]}) — exploitable now; fix these first`
                    : sev === "P1"
                      ? `High (${findings[sev]}) — real risk; fix soon`
                      : `Medium (${findings[sev]}) — code hygiene; fix when convenient`
                }
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
          style={{ color: "var(--meta-strong)" }}
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
                  style={{ color: "#8f8b82" }}
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
            <div className="font-jetbrains text-[9px] truncate mt-0.5" style={{ color: "#8f8b82" }}>
              {inScope.file.findings[0].type} · {inScope.file.findings.length} finding
              {inScope.file.findings.length !== 1 ? "s" : ""}
            </div>
          )}
        </button>
      )}

      {/* LEGEND — the always-available marker cheat sheet */}
      <div className="mt-2.5">
        <button
          onClick={() => setLegendOpen((v) => !v)}
          aria-expanded={legendOpen}
          title="What every visual marker in the city means — click to show or hide"
          className="w-full flex items-center gap-1.5 font-jetbrains text-[9px] tracking-[0.2em] py-1"
          style={{ color: "var(--meta-strong)", textAlign: "left" }}
        >
          <span style={{ fontSize: 8, color: "#f2d5a0" }}>{legendOpen ? "▾" : "▸"}</span> LEGEND
          <span style={{ color: "var(--meta-faint)", letterSpacing: "normal" }}>
            — what am I looking at?
          </span>
        </button>
        {legendOpen && (
          <div className="pt-2 mt-1" style={{ borderTop: "1px solid rgba(232,178,60,0.1)" }}>
            <MarkerLegend columns={1} />
          </div>
        )}
      </div>

      <p
        className="font-jetbrains text-[9px] mt-2.5 leading-relaxed"
        style={{ color: "var(--meta)" }}
      >
        {isRoot
          ? "Click a district to zoom in · ⚑ Security Tour explains every finding"
          : "Click a sub-district to zoom deeper · Esc goes back up · ⌂ for the overview"}
      </p>
    </div>
  );
}
