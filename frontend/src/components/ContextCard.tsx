import { useEffect, useState } from "react";
import { useStore } from "../stores/useStore";
import { resolveDir, tourStops } from "../city/layout";
import { topLanguages, languageColor, SEVERITY_COLOR, authorColor } from "../city/palette";
import { MarkerLegend } from "./CoachMarks";

const startCollapsed = () =>
  typeof window !== "undefined" && (window.matchMedia?.("(max-width: 767px)").matches ?? false);

export function ContextCard() {
  const cityData = useStore((s) => s.cityData);
  const buildPhase = useStore((s) => s.buildPhase);
  const focusPath = useStore((s) => s.focusPath);
  const navigateToFile = useStore((s) => s.navigateToFile);
  const [collapsed, setCollapsed] = useState(startCollapsed);
  const [legendOpen, setLegendOpen] = useState(false);

  useEffect(() => {
    setCollapsed(startCollapsed());
    setLegendOpen(false);
  }, [cityData]);

  if (!cityData || buildPhase === "constructing") return null;

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="absolute z-20 pointer-events-auto context-reopen flex items-center gap-2 px-3.5 py-3 rounded-lg text-[13px] font-medium"
        style={{
          background: "rgba(24, 24, 22, 0.95)",
          border: "1px solid rgba(150,142,128,0.3)",
          color: "#e8e4da",
          fontFamily: "var(--font-sans, ui-sans-serif, system-ui, sans-serif)",
          boxShadow: "0 6px 20px rgba(0,0,0,0.22)",
        }}
        aria-expanded={false}
        aria-label="Show project overview"
      >
        <span aria-hidden style={{ color: "#e8503c" }}>
          ▦
        </span>
        Project overview
      </button>
    );
  }

  const isRoot = focusPath.length === 0;
  const dir = resolveDir(cityData.tree, focusPath);
  const findings = dir.findingsBySeverity;
  const totalFindings = findings.P0 + findings.P1 + findings.P2;
  const langs = topLanguages(dir.languages, 4);
  const totalLangLines = Object.values(dir.languages).reduce((sum, lines) => sum + lines, 0) || 1;
  const stops = tourStops(cityData);
  const chainPrefix = focusPath.join("/");
  const inScope = isRoot
    ? stops[0]
    : (stops.find(
        (stop) => stop.chain.join("/") === chainPrefix && stop.file.path.startsWith(dir.path + "/"),
      ) ?? stops.find((stop) => stop.file.path.startsWith(dir.path + "/")));

  return (
    <div
      className="absolute z-20 pointer-events-auto animate-slide-left panel-context-card"
      style={{
        overflowY: "auto",
        background: "rgba(24, 24, 22, 0.94)",
        border: "1px solid rgba(150,142,128,0.24)",
        borderRadius: 12,
        padding: 18,
        color: "#e8e4da",
        fontFamily: "var(--font-sans, ui-sans-serif, system-ui, sans-serif)",
        boxShadow: "0 12px 36px rgba(0,0,0,0.3)",
        backdropFilter: "blur(20px)",
      }}
      role="region"
      aria-label={isRoot ? "Project overview" : "District overview"}
    >
      <div className="flex items-start justify-between gap-2 mb-4">
        <div className="min-w-0 flex-1">
          <div className="text-[12px] mb-1" style={{ color: "#aaa69c" }}>
            {isRoot ? "Project overview" : "District overview"}
          </div>
          <h2
            className="font-jetbrains text-[15px] font-semibold truncate"
            title={isRoot ? cityData.repo.name : dir.name}
          >
            {isRoot ? cityData.repo.name : dir.name}
          </h2>
          {!isRoot && (
            <div
              className="font-jetbrains text-[12px] truncate mt-1"
              style={{ color: "#aaa69c" }}
              title={`/${dir.path}`}
            >
              /{dir.path}
            </div>
          )}
        </div>
        <button
          onClick={() => setCollapsed(true)}
          aria-label="Collapse project overview"
          title="Collapse overview"
          className="btn-ghost shrink-0 w-8 h-8 flex items-center justify-center !p-0"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="m4 10 4-4 4 4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      <dl
        className="grid grid-cols-2 gap-4 pb-4"
        style={{ borderBottom: "1px solid rgba(150,142,128,0.18)" }}
      >
        <div title="Each source file is a building in your city.">
          <dt className="text-[12px] mb-1" style={{ color: "#aaa69c" }}>
            Files
          </dt>
          <dd className="text-[22px] font-semibold leading-none tabular-nums">
            {dir.fileCount.toLocaleString()}
          </dd>
        </div>
        <div title="Lines of code, excluding comments and blank lines.">
          <dt className="text-[12px] mb-1" style={{ color: "#aaa69c" }}>
            Lines of code
          </dt>
          <dd className="text-[22px] font-semibold leading-none tabular-nums">
            {dir.linesOfCode >= 1000
              ? `${(dir.linesOfCode / 1000).toFixed(1)}k`
              : dir.linesOfCode.toLocaleString()}
          </dd>
        </div>
      </dl>

      <div className="py-4" style={{ borderBottom: "1px solid rgba(150,142,128,0.18)" }}>
        {totalFindings > 0 ? (
          <>
            <div className="text-[13px] font-medium mb-2.5">
              {totalFindings.toLocaleString()} finding{totalFindings !== 1 ? "s" : ""} to review
            </div>
            <div className="flex gap-x-3 gap-y-2 flex-wrap">
              {(["P0", "P1", "P2"] as const).map((severity) =>
                findings[severity] > 0 ? (
                  <span
                    key={severity}
                    className="inline-flex items-center gap-1.5 text-[12px]"
                    style={{ color: "#c5c0b5" }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: SEVERITY_COLOR[severity] }}
                      aria-hidden
                    />
                    {severity === "P0" ? "Critical" : severity === "P1" ? "High" : "Medium"}
                    <span className="tabular-nums" style={{ color: "#f2efe8" }}>
                      {findings[severity]}
                    </span>
                  </span>
                ) : null,
              )}
            </div>
            {inScope && (
              <button
                onClick={() => navigateToFile(inScope.file.id)}
                className="w-full mt-3 px-3 py-2.5 text-left rounded-md transition-colors hover:bg-white/[0.05]"
                style={{
                  border: "1px solid rgba(232,80,60,0.3)",
                  background: "rgba(232,80,60,0.06)",
                }}
                title={`Review ${inScope.file.path}`}
              >
                <div className="text-[12px] font-medium mb-1" style={{ color: "#f18a7b" }}>
                  Review highest-risk file
                </div>
                <div className="font-jetbrains text-[12px] truncate">{inScope.file.name}</div>
              </button>
            )}
          </>
        ) : (
          <div className="text-[13px] flex items-center gap-2" style={{ color: "#a2d4b4" }}>
            <span aria-hidden>✓</span> No findings in this view
          </div>
        )}
      </div>

      {langs.length > 0 && (
        <div className="pt-4">
          <div className="text-[12px] mb-2.5" style={{ color: "#aaa69c" }}>
            Languages
          </div>
          <div className="flex h-1.5 rounded-full overflow-hidden mb-3" aria-hidden>
            {langs.map((language) => (
              <span
                key={language.name}
                style={{
                  width: `${(language.lines / totalLangLines) * 100}%`,
                  background: languageColor(language.name),
                }}
              />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
            {langs.map((language) => (
              <div
                key={language.name}
                className="flex items-center gap-1.5 min-w-0 text-[12px]"
                title={`${language.name}: ${Math.round((language.lines / totalLangLines) * 100)}% of lines`}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: languageColor(language.name) }}
                  aria-hidden
                />
                <span className="truncate" style={{ color: "#c5c0b5" }}>
                  {language.name}
                </span>
                <span className="ml-auto tabular-nums" style={{ color: "#aaa69c" }}>
                  {Math.round((language.lines / totalLangLines) * 100)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {dir.topAuthor && (
        <div
          className="flex items-center gap-2 mt-4 text-[12px]"
          title={`${dir.topAuthor} authored ${Math.round((dir.topAuthorShare ?? 0) * 100)}% of files in this view`}
        >
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ background: authorColor(dir.topAuthor) }}
            aria-hidden
          />
          <span className="truncate" style={{ color: "#aaa69c" }}>
            Top contributor: <span style={{ color: "#c5c0b5" }}>{dir.topAuthor}</span>
          </span>
        </div>
      )}

      <div className="mt-4 pt-2" style={{ borderTop: "1px solid rgba(150,142,128,0.18)" }}>
        <button
          onClick={() => setLegendOpen((open) => !open)}
          aria-expanded={legendOpen}
          aria-controls="context-city-legend"
          className="w-full flex items-center justify-between gap-2 text-[13px] py-2 text-left"
          style={{ color: "#c5c0b5" }}
        >
          City legend
          <span aria-hidden>{legendOpen ? "−" : "+"}</span>
        </button>
        {legendOpen && (
          <div id="context-city-legend" className="pt-2">
            <MarkerLegend columns={1} />
          </div>
        )}
      </div>
    </div>
  );
}
