import { useStore } from "../stores/useStore";
import { topLanguages, languageColor, SEVERITY_COLOR } from "../city/palette";

interface HudOverlayProps {
  apiStatus: "connecting" | "live" | "demo";
}

/** Plain-language meaning of the severity buckets (P0/P1/P2) */
const SEV_MEANING: Record<string, string> = {
  P0: "P0 = critical — secrets, injection, code execution: fix now",
  P1: "P1 = serious — XSS, weak crypto, unsafe patterns: fix soon",
  P2: "P2 = hygiene — style/log issues that can hide real problems",
};

function ResetButton() {
  const resetToLanding = useStore((s) => s.resetToLanding);
  return (
    <button
      onClick={resetToLanding}
      title="Start over — back to the start screen"
      aria-label="Start over — back to the start screen"
      className="font-jetbrains text-[9px] tracking-widest px-1.5 py-0.5 rounded cursor-pointer
                 transition-all duration-150 hover:brightness-125 focus:outline-none focus:ring-1 focus:ring-[#e8503c]"
      style={{
        border: "1px solid rgba(150,145,132,0.28)",
        color: "#a8a49a",
        background: "rgba(22,22,20,0.6)",
      }}
    >
      ⏻ NEW
    </button>
  );
}

export function HudOverlay({ apiStatus }: HudOverlayProps) {
  const cityData = useStore((s) => s.cityData);
  const resetFocus = useStore((s) => s.resetFocus);
  const threatFilter = useStore((s) => s.threatFilter);
  const setThreatFilter = useStore((s) => s.setThreatFilter);

  const dotColor =
    apiStatus === "live"
      ? "var(--color-neon, #e8503c)"
      : apiStatus === "demo"
        ? "#ffd23f"
        : "var(--meta)";

  const dotLabel = apiStatus === "live" ? "LIVE" : apiStatus === "demo" ? "DEMO" : "CONNECTING";

  /* Empty world — minimal header */
  if (!cityData) {
    return (
      <header
        className="absolute top-0 left-0 right-0 z-[45] pointer-events-auto scanline-static"
        style={{
          background: "rgba(16, 16, 14, 0.88)",
          borderBottom: "1px solid rgba(232,80,60,0.15)",
          backdropFilter: "blur(8px)",
        }}
      >
        <div className="flex items-center justify-between px-5 py-2.5">
          <div className="flex items-center gap-2.5">
            <div
              className="w-7 h-7 flex items-center justify-center font-jetbrains text-xs font-bold"
              style={{
                border: "1px solid rgba(242,239,232,0.2)",
                color: "#f2efe8",
                background: "rgba(242,239,232,0.04)",
                borderRadius: 4,
              }}
            >
              E<span style={{ color: "#e8503c" }}>.</span>
            </div>
            <span
              className="font-jetbrains text-sm font-bold tracking-[0.2em]"
              style={{ color: "#f2efe8" }}
            >
              EPHEMORA<span style={{ color: "#e8503c" }}>.</span>{" "}
              <span style={{ color: "#e8503c" }}>SKYLINE</span>
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {apiStatus === "demo" && (
              <>
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full animate-dot-blink"
                  style={{ background: dotColor }}
                />
                <span
                  className="font-jetbrains text-[10px] tracking-widest"
                  style={{ color: "var(--meta)" }}
                >
                  {dotLabel}
                </span>
              </>
            )}
          </div>
        </div>
      </header>
    );
  }

  const findings = cityData.findingsBySeverity;
  const totalFindings = findings.P0 + findings.P1 + findings.P2;

  return (
    <>
      {/* ── Top status bar ─────────────────────────────────────────────── */}
      <header
        className="absolute top-0 left-0 right-0 z-[45] pointer-events-auto scanline-static"
        style={{
          background: "rgba(16, 16, 14, 0.90)",
          borderBottom: "1px solid rgba(232,80,60,0.15)",
          backdropFilter: "blur(10px)",
        }}
      >
        <div className="flex items-center justify-between px-4 py-2 gap-2">
          {/* Left: Logo + repo identity */}
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              onClick={resetFocus}
              title="Back to overview"
              className="w-7 h-7 shrink-0 flex items-center justify-center font-jetbrains text-xs font-bold transition-all duration-150"
              style={{
                border: "1px solid rgba(232,80,60,0.45)",
                color: "#e8503c",
                background: "rgba(232,80,60,0.06)",
                borderRadius: 4,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = "0 0 12px rgba(232,80,60,0.3)";
                e.currentTarget.style.background = "rgba(232,80,60,0.12)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = "none";
                e.currentTarget.style.background = "rgba(232,80,60,0.06)";
              }}
              aria-label="Go to city overview"
            >
              E<span style={{ color: "#e8503c" }}>.</span>
            </button>

            <div className="flex flex-col shrink-0">
              <span
                className="font-jetbrains text-[11px] font-bold tracking-[0.18em] leading-none"
                style={{ color: "#f2efe8" }}
              >
                EPHEMORA<span style={{ color: "#e8503c" }}>.</span>
              </span>
              <span
                className="font-jetbrains text-[9px] tracking-[0.3em] leading-tight"
                style={{ color: "#e8503c" }}
              >
                SKYLINE
              </span>
            </div>

            {/* Repo chip — every scan is a local folder */}
            <span
              className="font-jetbrains text-[10px] px-2 py-0.5 truncate max-w-[220px]"
              style={{
                border: "1px solid rgba(150,145,132,0.28)",
                color: "#a8a49a",
                background: "rgba(22,22,20,0.55)",
                borderRadius: 3,
              }}
              title={`Local folder: ${cityData.repo.name} — scanned entirely on this machine`}
            >
              📂 {cityData.repo.name}
              <span style={{ opacity: 0.5 }}> · local</span>
            </span>
          </div>

          {/* Right: stats */}
          <div className="flex items-center gap-2.5 flex-wrap justify-end">
            {/* File count */}
            <span
              className="font-jetbrains text-[10px]"
              style={{ color: "#8f8b82" }}
              title={`${cityData.renderedFiles} of ${cityData.totalFiles} files rendered`}
            >
              <span style={{ color: "#cfcabe" }}>{cityData.renderedFiles}</span>
              <span style={{ opacity: 0.5 }}>/{cityData.totalFiles}</span>
              <span style={{ opacity: 0.5 }}> files</span>
            </span>

            {/* Top 3 languages: only in the bottom legend (declutter the bar) */}

            {/* Findings chips — click to dim every file without that severity */}
            {totalFindings > 0 ? (
              <div className="flex items-center gap-1">
                {(["P0", "P1", "P2"] as const).map((sev) =>
                  findings[sev] > 0 ? (
                    <button
                      key={sev}
                      onClick={() => setThreatFilter(threatFilter === sev ? "all" : sev)}
                      title={
                        threatFilter === sev
                          ? `Filter active: only ${sev} findings stay lit — click to clear`
                          : `${SEV_MEANING[sev]} (click to dim all files without ${sev} findings)`
                      }
                      aria-pressed={threatFilter === sev}
                      className={`chip-${sev.toLowerCase()} font-jetbrains text-[9px] px-1.5 py-px rounded cursor-pointer transition-all duration-150 hover:brightness-125`}
                      style={
                        threatFilter === sev
                          ? { outline: `1px solid ${SEVERITY_COLOR[sev]}`, outlineOffset: "1px" }
                          : threatFilter !== "all"
                            ? { opacity: 0.55 }
                            : undefined
                      }
                    >
                      {sev} · {findings[sev]}
                    </button>
                  ) : null,
                )}
                {threatFilter !== "all" && (
                  <button
                    onClick={() => setThreatFilter("all")}
                    title="Clear severity filter"
                    aria-label="Clear severity filter"
                    className="font-jetbrains text-[9px] px-1 min-w-[24px] min-h-[24px] rounded cursor-pointer"
                    style={{ color: "var(--meta-strong)" }}
                  >
                    ✕
                  </button>
                )}
              </div>
            ) : (
              <span className="chip-ok font-jetbrains text-[9px] px-1.5 py-px rounded">
                ✓ CLEAN
              </span>
            )}

            {/* Start over — back to the Landing screen */}
            <ResetButton />

            {/* Live / demo status */}
            <div
              className="flex items-center gap-1 pl-2"
              style={{ borderLeft: "1px solid rgba(150,142,128,0.25)" }}
            >
              <span
                className="inline-block w-1.5 h-1.5 rounded-full animate-dot-blink"
                style={{ background: dotColor }}
              />
              <span
                className="font-jetbrains text-[9px] tracking-widest"
                style={{ color: "#8f8b82" }}
              >
                {dotLabel}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* ── Bottom-left legend ─────────────────────────────────────────── */}
      <div
        className="absolute bottom-4 left-4 z-10 pointer-events-none"
        style={{
          background: "rgba(16, 16, 14, 0.82)",
          border: "1px solid rgba(150,142,128,0.22)",
          backdropFilter: "blur(10px)",
          padding: "0.5rem 0.75rem",
          borderRadius: 4,
        }}
      >
        <div className="flex items-center gap-3 flex-wrap">
          {topLanguages(cityData.languages, 3).map((l) => (
            <span
              key={l.name}
              className="flex items-center gap-1 font-jetbrains text-[9px]"
              style={{ color: "#8f8b82" }}
            >
              <span
                className="w-2 h-2 rounded-sm inline-block"
                style={{ background: languageColor(l.name) }}
              />
              {l.name}
            </span>
          ))}
          <span
            className="flex items-center gap-1 font-jetbrains text-[9px]"
            style={{ color: "#8f8b82" }}
            title="Building height = synthetic complexity (cyclomatic + depth + size)"
          >
            ⬍ CX·LOC
          </span>
          <span
            className="flex items-center gap-1 font-jetbrains text-[9px]"
            style={{ color: "#8f8b82" }}
            title="Each city block is one folder — click to enter it"
          >
            ▦ folder
          </span>
          <span
            className="flex items-center gap-1 font-jetbrains text-[9px]"
            style={{ color: "#8f8b82" }}
            title="Red curb: this district contains critical (P0) findings"
          >
            <span
              className="w-2 h-1 rounded-sm inline-block"
              style={{ background: SEVERITY_COLOR.P0 }}
            />
            P0 district
          </span>
          <span
            className="flex items-center gap-1 font-jetbrains text-[9px]"
            style={{ color: "#8f8b82" }}
            title="The light beam marks the most at-risk file in view"
          >
            <span
              className="w-1.5 h-1.5 rounded-full inline-block"
              style={{ background: SEVERITY_COLOR.P0, boxShadow: `0 0 4px ${SEVERITY_COLOR.P0}` }}
            />
            Finding
          </span>
        </div>
      </div>
    </>
  );
}
