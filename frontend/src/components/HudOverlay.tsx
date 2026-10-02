import { useStore } from "../stores/useStore";
import { topLanguages, languageColor, severityColor } from "../city/palette";
import { BrandWordmark } from "./Landing";
import { AnalyzePanel } from "./AnalyzePanel";
import { PHASE_0_MS } from "./CityTree";
import { t } from "../i18n";

interface HudOverlayProps {
  apiStatus: "connecting" | "live" | "demo";
}
const SEVERITIES = [
  { id: "P0", labelKey: "hud.sevCritical" },
  { id: "P1", labelKey: "hud.sevHigh" },
  { id: "P2", labelKey: "hud.sevMedium" },
] as const;

export function HudOverlay({ apiStatus }: HudOverlayProps) {
  const cityData = useStore((s) => s.cityData);
  const resetFocus = useStore((s) => s.resetFocus);
  const resetToLanding = useStore((s) => s.resetToLanding);
  const threatFilter = useStore((s) => s.threatFilter);
  const setThreatFilter = useStore((s) => s.setThreatFilter);
  const buildPhase = useStore((s) => s.buildPhase);
  const buildStartedAt = useStore((s) => s.buildStartedAt);
  const constructionDone = useStore((s) => s.constructionDone);
  const constructionTotal = useStore((s) => s.constructionTotal);
  const requestBuildSkip = useStore((s) => s.requestBuildSkip);
  const lang = useStore((s) => s.prefs.lang);
  const colorblind = useStore((s) => s.prefs.colorblind);
  if (!cityData) return null;
  const totalFindings = Object.values(cityData.findingsBySeverity).reduce(
    (sum, count) => sum + count,
    0,
  );

  // Construction status line: phase 0 is the empty-terrain prologue, then
  // the build counter takes over. Updates ride the existing construction
  // interval in CityTree (setConstructionProgress) — no extra timer here.
  const constructing = buildPhase === "constructing";
  const phase0 = constructing && Date.now() < buildStartedAt + PHASE_0_MS;
  const pct = constructionTotal > 0 ? Math.round((constructionDone / constructionTotal) * 100) : 0;

  return (
    <>
      <header className="workspace-header">
        <div className="workspace-identity">
          <button
            onClick={resetToLanding}
            aria-label={t(lang, "hud.backToStart")}
            title={t(lang, "hud.backToStart")}
            className="workspace-brand"
          >
            <BrandWordmark scale={0.85} />
            <span>Skyline</span>
          </button>
          <span className="header-divider" />
          <button
            onClick={resetFocus}
            title={t(lang, "hud.overviewTitle")}
            className="workspace-project"
          >
            {cityData.repo.name}
            <span>
              {apiStatus === "demo"
                ? t(lang, "hud.demoProject")
                : apiStatus === "connecting"
                  ? t(lang, "hud.connecting")
                  : t(lang, "hud.localProject")}
            </span>
          </button>
        </div>
        <div className="workspace-status">
          <span className="workspace-files">
            {cityData.totalFiles.toLocaleString()} <span>{t(lang, "hud.filesUnit")}</span>
          </span>
          <div className="workspace-severities" aria-label={t(lang, "hud.filterBySeverityAria")}>
            {SEVERITIES.map(
              ({ id, labelKey }) =>
                cityData.findingsBySeverity[id] > 0 && (
                  <button
                    key={id}
                    onClick={() => setThreatFilter(threatFilter === id ? "all" : id)}
                    aria-pressed={threatFilter === id}
                    aria-label={
                      threatFilter === id
                        ? t(lang, "hud.sevAriaOn", {
                            label: t(lang, labelKey),
                            count: cityData.findingsBySeverity[id],
                          })
                        : t(lang, "hud.sevAriaOff", {
                            label: t(lang, labelKey),
                            count: cityData.findingsBySeverity[id],
                          })
                    }
                    title={
                      threatFilter === id
                        ? t(lang, "hud.sevTitleOn", { label: t(lang, labelKey) })
                        : t(lang, "hud.sevTitleOff", { label: t(lang, labelKey) })
                    }
                    style={{ "--severity": severityColor(id, colorblind) } as React.CSSProperties}
                  >
                    <span aria-hidden="true" />
                    {cityData.findingsBySeverity[id]}
                    <span className="severity-label">{t(lang, labelKey)}</span>
                  </button>
                ),
            )}
            {totalFindings === 0 && (
              <span className="clean-status">{t(lang, "hud.noFindings")}</span>
            )}
          </div>
          <AnalyzePanel />
        </div>
      </header>
      <div className="city-legend">
        {topLanguages(cityData.languages, 3).map((language) => (
          <span key={language.name}>
            <i style={{ background: languageColor(language.name) }} />
            {language.name}
          </span>
        ))}
        <span className="legend-explainer">{t(lang, "hud.heightComplexity")}</span>
      </div>
      {constructing && (
        <div
          className="absolute bottom-4 left-1/2 z-40 flex max-w-[calc(100vw-24px)] -translate-x-1/2 flex-wrap
                     items-center justify-center gap-x-3 gap-y-1 rounded-lg px-4 py-2.5 font-mono text-[11px]
                     pointer-events-auto"
          style={{
            background: "rgba(20, 20, 18, 0.82)",
            border: "1px solid rgba(242, 239, 232, 0.14)",
          }}
          // No role="status" here: the counter re-renders every 110 ms and a
          // live region would spam screen readers for the whole build. Phase
          // changes are visible; users who care watch the bar.
        >
          {phase0 ? (
            <span className="whitespace-nowrap" style={{ color: "#dedbd3" }}>
              {t(lang, "hud.phase0")}
            </span>
          ) : (
            <>
              <span className="whitespace-nowrap" style={{ color: "#dedbd3" }}>
                {t(lang, "hud.building", {
                  name: cityData.repo.name,
                  done: constructionDone,
                  total: constructionTotal,
                })}
              </span>
              <span
                className="h-1 w-24 shrink-0 overflow-hidden rounded-full sm:w-40"
                style={{ background: "#3c3c35" }}
              >
                <span
                  className="block h-full rounded-full transition-all duration-300"
                  style={{ width: `${pct}%`, background: "#e8503c" }}
                />
              </span>
            </>
          )}
          <button
            onClick={requestBuildSkip}
            aria-label={t(lang, "hud.skipAria")}
            className="shrink-0 rounded px-1 py-0.5 font-mono text-[11px] text-[color:var(--meta-strong)]
                       transition-colors hover:text-[#e8b23c] focus:outline-none focus:ring-1 focus:ring-[#e8b23c]"
          >
            {t(lang, "hud.skip")} ⏭
          </button>
        </div>
      )}
    </>
  );
}
