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

export function HudOverlay({ apiStatus }: HudOverlayProps) {
  const cityData = useStore((s) => s.cityData);
  const resetFocus = useStore((s) => s.resetFocus);
  const threatFilter = useStore((s) => s.threatFilter);
  const setThreatFilter = useStore((s) => s.setThreatFilter);

  const dotColor =
    apiStatus === "live"
      ? "var(--color-neon, #00ff9f)"
      : apiStatus === "demo"
        ? "#ffd23f"
        : "var(--meta)";

  const dotLabel = apiStatus === "live" ? "LIVE" : apiStatus === "demo" ? "DEMO" : "CONNECTING";

  /* Empty world — minimal header */
  if (!cityData) {
    return (
      <header
        className="absolute top-0 left-0 right-0 z-20 pointer-events-auto scanline-static"
        style={{
          background: "rgba(5, 8, 20, 0.88)",
          borderBottom: "1px solid rgba(0,255,159,0.15)",
          backdropFilter: "blur(8px)",
        }}
      >
        <div className="flex items-center justify-between px-5 py-2.5">
          <div className="flex items-center gap-2.5">
            <div
              className="w-7 h-7 flex items-center justify-center font-jetbrains text-xs font-bold"
              style={{
                border: "1px solid rgba(0,255,159,0.5)",
                color: "#00ff9f",
                background: "rgba(0,255,159,0.06)",
                boxShadow: "0 0 10px rgba(0,255,159,0.18)",
                borderRadius: 3,
              }}
            >
              CC
            </div>
            <span
              className="font-jetbrains text-sm font-bold tracking-[0.2em]"
              style={{ color: "#00ff9f" }}
            >
              CODECITY <span style={{ color: "#ff00aa" }}>CYBERDEFENSE</span>
            </span>
          </div>
          <div className="flex items-center gap-1.5">
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
          </div>
        </div>
      </header>
    );
  }

  const findings = cityData.findingsBySeverity;
  const totalFindings = findings.P0 + findings.P1 + findings.P2;
  const langs = topLanguages(cityData.languages, 3);
  // Local-folder analyses have no GitHub counterpart — render a plain chip
  const isLocal = cityData.repo.owner === "local";
  const repoUrl = isLocal
    ? null
    : `https://github.com/${cityData.repo.owner}/${cityData.repo.name}`;

  return (
    <>
      {/* ── Top status bar ─────────────────────────────────────────────── */}
      <header
        className="absolute top-0 left-0 right-0 z-20 pointer-events-auto scanline-static"
        style={{
          background: "rgba(5, 8, 20, 0.90)",
          borderBottom: "1px solid rgba(0,255,159,0.15)",
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
                border: "1px solid rgba(0,255,159,0.45)",
                color: "#00ff9f",
                background: "rgba(0,255,159,0.06)",
                borderRadius: 3,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = "0 0 12px rgba(0,255,159,0.3)";
                e.currentTarget.style.background = "rgba(0,255,159,0.12)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = "none";
                e.currentTarget.style.background = "rgba(0,255,159,0.06)";
              }}
              aria-label="Go to city overview"
            >
              CC
            </button>

            <div className="flex flex-col shrink-0">
              <span
                className="font-jetbrains text-[11px] font-bold tracking-[0.18em] leading-none"
                style={{ color: "#00ff9f" }}
              >
                CODECITY
              </span>
              <span
                className="font-jetbrains text-[8px] tracking-[0.3em] leading-tight"
                style={{ color: "#ff00aa" }}
              >
                CYBERDEFENSE
              </span>
            </div>

            {/* Repo chip — links to GitHub for remote repos, plain label for local folders */}
            {isLocal ? (
              <span
                className="font-jetbrains text-[10px] px-2 py-0.5 truncate max-w-[200px]"
                style={{
                  border: "1px solid rgba(100,140,200,0.28)",
                  color: "#8fa3c4",
                  background: "rgba(20,30,52,0.55)",
                  borderRadius: 3,
                }}
                title={`Local folder: ${cityData.repo.name}`}
              >
                📂 {cityData.repo.name}
                <span style={{ opacity: 0.5 }}> · local</span>
              </span>
            ) : (
              <a
                href={repoUrl ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="font-jetbrains text-[10px] px-2 py-0.5 truncate max-w-[200px] transition-all duration-150"
                style={{
                  border: "1px solid rgba(100,140,200,0.28)",
                  color: "#8fa3c4",
                  background: "rgba(20,30,52,0.55)",
                  borderRadius: 3,
                }}
                title={`${cityData.repo.owner}/${cityData.repo.name} @${cityData.repo.branch}`}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "rgba(77,227,255,0.45)";
                  e.currentTarget.style.color = "#4de3ff";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "rgba(100,140,200,0.28)";
                  e.currentTarget.style.color = "#8fa3c4";
                }}
              >
                {cityData.repo.owner}/{cityData.repo.name}
                <span style={{ opacity: 0.5 }}> @{cityData.repo.branch}</span>
              </a>
            )}
          </div>

          {/* Right: stats */}
          <div className="flex items-center gap-2.5 flex-wrap justify-end">
            {/* File count */}
            <span
              className="font-jetbrains text-[10px]"
              style={{ color: "#6b84a8" }}
              title={`${cityData.renderedFiles} of ${cityData.totalFiles} files rendered`}
            >
              <span style={{ color: "#aebfe0" }}>{cityData.renderedFiles}</span>
              <span style={{ opacity: 0.5 }}>/{cityData.totalFiles}</span>
              <span style={{ opacity: 0.5 }}> files</span>
            </span>

            {/* Top 3 languages */}
            <div className="hidden sm:flex items-center gap-1.5">
              {langs.map((l) => (
                <span
                  key={l.name}
                  className="flex items-center gap-1 font-jetbrains text-[9px]"
                  style={{ color: "#6b84a8" }}
                >
                  <span
                    className="w-2 h-2 rounded-sm"
                    style={{ background: languageColor(l.name) }}
                  />
                  {l.name}
                </span>
              ))}
            </div>

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
                      className={`chip-${sev.toLowerCase()} font-jetbrains text-[9px] px-1.5 py-px rounded-sm cursor-pointer transition-all hover:brightness-125`}
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
                    className="font-jetbrains text-[9px] px-1 rounded-sm cursor-pointer"
                    style={{ color: "var(--meta-strong)" }}
                  >
                    ✕
                  </button>
                )}
              </div>
            ) : (
              <span className="chip-ok font-jetbrains text-[9px] px-1.5 py-px rounded-sm">
                ✓ CLEAN
              </span>
            )}

            {/* Live / demo status */}
            <div
              className="flex items-center gap-1 pl-2"
              style={{ borderLeft: "1px solid rgba(90,120,170,0.25)" }}
            >
              <span
                className="inline-block w-1.5 h-1.5 rounded-full animate-dot-blink"
                style={{ background: dotColor }}
              />
              <span
                className="font-jetbrains text-[9px] tracking-widest"
                style={{ color: "#6b84a8" }}
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
          background: "rgba(5, 8, 20, 0.82)",
          border: "1px solid rgba(90,130,200,0.22)",
          backdropFilter: "blur(10px)",
          padding: "0.45rem 0.7rem",
          borderRadius: 4,
        }}
      >
        <div className="flex items-center gap-3 flex-wrap">
          {topLanguages(cityData.languages, 3).map((l) => (
            <span
              key={l.name}
              className="flex items-center gap-1 font-jetbrains text-[9px]"
              style={{ color: "#6b84a8" }}
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
            style={{ color: "#6b84a8" }}
            title="Building height = lines of code"
          >
            ⬍ LOC
          </span>
          <span
            className="flex items-center gap-1 font-jetbrains text-[9px]"
            style={{ color: "#6b84a8" }}
            title="Each city block is one folder — click to enter it"
          >
            ▦ folder
          </span>
          <span
            className="flex items-center gap-1 font-jetbrains text-[9px]"
            style={{ color: "#6b84a8" }}
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
            style={{ color: "#6b84a8" }}
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
