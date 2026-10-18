import { useStore } from "../stores/useStore";
import { identityIsGuessed } from "../reviews";
import { topLanguages, languageColor, severityColor } from "../city/palette";
import { scanVerdict } from "../city/provenance";
import { BrandWordmark } from "./Landing";
import { AnalyzePanel } from "./AnalyzePanel";
import { PHASE_0_MS } from "./CityTree";
import { t, formatCount, type DictKey, type Lang } from "../i18n";
import { severityCount, severityTotal } from "../city/facts";
import "../design/stadt-ui.css";

interface HudOverlayProps {
  apiStatus: "connecting" | "live" | "demo";
}
const SEVERITIES = [
  { id: "P0", labelKey: "hud.sevCritical", shape: "▲" },
  { id: "P1", labelKey: "hud.sevHigh", shape: "◆" },
  { id: "P2", labelKey: "hud.sevMedium", shape: "●" },
] as const;

/**
 * "No findings" is the one header state that can be true and useless at the
 * same time: if a security engine was switched off, nothing looked. The same
 * `scanVerdict` the closing toast uses decides the wording, so the header
 * cannot claim more than the toast it replaced a minute earlier.
 */
export function cleanStatement(
  lang: Lang,
  verdict: ReturnType<typeof scanVerdict>,
): { key: DictKey; vars: Record<string, string | number> } {
  if (verdict.kind === "shallow") {
    const n = verdict.missing.length;
    return {
      key: n === 1 ? "hud.noFindingsQual" : "hud.noFindingsQualMany",
      vars: { missing: verdict.missing.join(", ") },
    };
  }
  if (verdict.kind === "unknown") return { key: "summary.depthUnknown", vars: {} };
  return { key: "hud.noFindings", vars: {} };
}

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
  const totalFindings = severityTotal(cityData.findingsBySeverity);

  // Construction status line: phase 0 is the empty-terrain prologue, then
  // the build counter takes over. Updates ride the existing construction
  // interval in CityTree (setConstructionProgress) — no extra timer here.
  const constructing = buildPhase === "constructing";
  const phase0 = constructing && Date.now() < buildStartedAt + PHASE_0_MS;
  const pct = constructionTotal > 0 ? Math.round((constructionDone / constructionTotal) * 100) : 0;
  const verdict = scanVerdict(cityData.scanProvenance, totalFindings, cityData.languages);
  const statement = cleanStatement(lang, verdict);

  return (
    <>
      <header className="workspace-header" data-stadt-ui="1">
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
            {/* the bucket is inferred until a project root is saved — say it here,
                where the project is named, not after a verdict seems to go missing */}
            {apiStatus !== "demo" && identityIsGuessed(cityData) && (
              <>
                <span
                  className="project-guess"
                  data-testid="project-identity-guess"
                  aria-hidden="true"
                  title={t(lang, "hud.identityGuessedTitle")}
                >
                  ≈
                </span>
                {/* the glyph alone is a sighted cue; the name of the button carries it to AT */}
                <span className="sr-only">{t(lang, "hud.identityGuessedAria")}</span>
              </>
            )}
            <span>
              {apiStatus === "demo"
                ? t(lang, "hud.demoProject")
                : apiStatus === "connecting"
                  ? t(lang, "hud.connecting")
                  : // R1-22: the `≈` next to the name explained itself to no one —
                    // the words lived in a tooltip and an sr-only span. While the
                    // identity is inferred, the line under the name says so plainly.
                    identityIsGuessed(cityData)
                    ? t(lang, "hud.identityGuessedAria")
                    : t(lang, "hud.localProject")}
            </span>
          </button>
          {/* The dismissible summary is not the only carrier of the demo's
              honesty: next to the name it says, permanently, that the findings
              are samples and nothing was scanned. */}
          {apiStatus === "demo" && (
            <span className="demo-synth-mark" data-testid="demo-synth-mark">
              {t(lang, "hud.demoSynth")}
            </span>
          )}
        </div>
        <div className="workspace-status">
          <span className="workspace-files">
            {formatCount(lang, cityData.totalFiles)} <span>{t(lang, "hud.filesUnit")}</span>
          </span>
          <div className="workspace-severities" aria-label={t(lang, "hud.filterBySeverityAria")}>
            {SEVERITIES.map(
              ({ id, labelKey, shape }) =>
                cityData.findingsBySeverity[id] > 0 && (
                  <button
                    key={id}
                    data-severity={id}
                    onClick={() => setThreatFilter(threatFilter === id ? "all" : id)}
                    aria-pressed={threatFilter === id}
                    aria-label={(() => {
                      const count = severityCount(cityData.findingsBySeverity, id);
                      const label = t(lang, labelKey);
                      // "1 Funde" was what the header read out on every single
                      // finding — the singular variants are dictionary keys now.
                      if (threatFilter === id)
                        return t(lang, count === 1 ? "hud.sevAriaOnOne" : "hud.sevAriaOn", {
                          label,
                          count,
                        });
                      return t(lang, count === 1 ? "hud.sevAriaOffOne" : "hud.sevAriaOff", {
                        label,
                        count,
                      });
                    })()}
                    title={
                      threatFilter === id
                        ? t(lang, "hud.sevTitleOn", { label: t(lang, labelKey) })
                        : t(lang, "hud.sevTitleOff", { label: t(lang, labelKey) })
                    }
                    style={{ "--severity": severityColor(id, colorblind) } as React.CSSProperties}
                  >
                    {/* shape carries the grade where colour cannot: the
                        colour-blind switch reaches --severity, and this glyph
                        is the same order the list and the panel print */}
                    <span aria-hidden="true" className="severity-shape">
                      {shape}
                    </span>
                    {cityData.findingsBySeverity[id]}
                    <span className="severity-label">{t(lang, labelKey)}</span>
                  </button>
                ),
            )}
            {totalFindings === 0 && (
              <span
                className="clean-status"
                data-city-verdict={verdict.kind}
                title={verdict.kind === "clear" ? undefined : t(lang, "ctx.blindTip")}
              >
                {t(lang, statement.key, statement.vars)}
              </span>
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
                     items-center justify-center gap-x-3 gap-y-1 rounded-lg px-4 py-2.5 font-mono text-[length:var(--fs-meta)]
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
            className="shrink-0 rounded px-1 py-0.5 font-mono text-[length:var(--fs-meta)] text-[color:var(--meta-strong)]
                       transition-colors hover:text-[color:var(--accent-gold)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-gold)]"
          >
            {t(lang, "hud.skip")} ⏭
          </button>
        </div>
      )}
    </>
  );
}
