import { useEffect, useMemo, useState } from "react";
import { nextOpenTriageIndex, triageList, useStore } from "../stores/useStore";
import { identityIsGuessed } from "../reviews";
import { edgeSignalForWaypoint, worldTargetForFinding } from "../city/waypoint";
import { topLanguages, languageColor, severityColor } from "../city/palette";
import { scanVerdict } from "../city/provenance";
import { BrandWordmark } from "./Landing";
import { AnalyzePanel } from "./AnalyzePanel";
import { XrayRaw } from "./XrayRaw";
import { openSearch } from "./SearchBar";
import { PHASE_0_MS } from "./CityTree";
import { t, formatCount, type DictKey, type Lang } from "../i18n";
import { getDirLayout } from "../city/layout";
import { heightAxisKey } from "../city/heightAxis";
import { useLodFar } from "../hooks/useLodFar";
import { severityCount, severityTotal } from "../city/facts";
import { LiveBand } from "./LiveBand";
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
 * The screen-edge waypoint: one pill AT THE EDGE the finding lies behind.
 * The word carries the meaning ("left", "right", "behind") — the arrow glyph
 * only repeats it for the eye, so colour and glyph are never sole carriers.
 * No pulse, no animation: the sign's whole job is to be noticeable WITHOUT
 * motion, which also keeps `prefers-reduced-motion` trivially honoured.
 * Its distance is the straight line in city units, and its click is the
 * dock's own stepper — no second flight path.
 */
const WAYPOINT_EDGE = {
  left: { wordKey: "hud.wpLeft", arrow: "←", pos: "left-2 top-1/2 -translate-y-1/2" },
  right: { wordKey: "hud.wpRight", arrow: "→", pos: "right-2 top-1/2 -translate-y-1/2" },
  behind: { wordKey: "hud.wpBehind", arrow: "↓", pos: "bottom-4 left-4" },
} as const;

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
  if (verdict.kind === "live") return { key: "hud.liveStale", vars: {} };
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
  const frameHz = useStore((s) => s.frameHz);
  const colorblind = useStore((s) => s.prefs.colorblind);
  const liveState = useStore((s) => s.live);
  const showLegend = useStore((s) => s.showLegend);
  const searchOpen = useStore((s) => s.showSearch);
  const setCityOnly = useStore((s) => s.setCityOnly);
  const reviews = useStore((s) => s.reviews);
  const ruleFilter = useStore((s) => s.ruleFilter);
  const triageActive = useStore((s) => s.triageActive);
  const triageCursor = useStore((s) => s.triageCursor);
  const startTriage = useStore((s) => s.startTriage);
  const nextTriage = useStore((s) => s.nextTriage);
  const tourActive = useStore((s) => s.tourActive);
  const cameraInfo = useStore((s) => s.cameraInfo);
  const cameraMode = useStore((s) => s.cameraMode);
  // The height sentence follows the field that draws it (city/heightAxis):
  // far zoom is where CityTree mounts the heat grid, and the grid raises
  // every cell by the picked channel — the legend may not keep naming
  // complexity while the tiles stand by "stood at the date".
  const heatChannel = useStore((s) => s.heatChannel);
  const heatBounds = useStore((s) =>
    s.cityData ? getDirLayout(s.cityData, s.focusPath).bounds : 100,
  );
  const heatGridShown = useLodFar(heatBounds);
  // The cone test needs the viewport's shape; a resize is the only moment
  // the answer changes, so the aspect is state, not a per-frame read.
  const [viewportAspect, setViewportAspect] = useState(
    () => window.innerWidth / Math.max(1, window.innerHeight),
  );
  useEffect(() => {
    const onResize = () => setViewportAspect(window.innerWidth / Math.max(1, window.innerHeight));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  /**
   * The X-ray state (Task 6): raw numbers over the tower being aimed at, and
   * ONLY while X is held. It is a key binding, not a surface — at rest nothing
   * of it stands on the screen, so the arrival budget's four surfaces are
   * untouched (pinned in tests/xray-raw.test.tsx and by arrival-budget itself).
   * A modal dialog owns the keyboard while it is open; a field the reader is
   * writing into owns the letter. Key up and window blur both end the state —
   * a mode that outlives its own key is a second mode bar in disguise.
   */
  const [xrayHeld, setXrayHeld] = useState(false);
  useEffect(() => {
    const isTyping = (target: EventTarget | null): boolean => {
      const el = target as HTMLElement | null;
      return (
        !!el &&
        (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable === true)
      );
    };
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.code !== "KeyX" || e.metaKey || e.ctrlKey || e.repeat) return;
      if (isTyping(e.target) || !!document.querySelector('[aria-modal="true"]')) return;
      setXrayHeld(true);
    };
    const onKeyUp = (e: KeyboardEvent): void => {
      if (e.code !== "KeyX") return;
      setXrayHeld(false);
    };
    const onBlur = (): void => setXrayHeld(false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);
  // The queue the dock walks — same list, same filters, same order. Memoised
  // on the city and the filters: a camera move must never re-sort the city.
  const queue = useMemo(
    () => (cityData ? triageList(cityData, threatFilter, ruleFilter) : []),
    [cityData, threatFilter, ruleFilter],
  );
  if (!cityData) return null;
  const totalFindings = severityTotal(cityData.findingsBySeverity);

  // Construction status line: phase 0 is the empty-terrain prologue, then
  // the build counter takes over. Updates ride the existing construction
  // interval in CityTree (setConstructionProgress) — no extra timer here.
  const constructing = buildPhase === "constructing";
  const phase0 = constructing && Date.now() < buildStartedAt + PHASE_0_MS;
  // Seconds since the build began, off the store's own stamp — no extra timer.
  const buildElapsedSec =
    constructing && buildStartedAt > 0
      ? Math.max(0, Math.round((Date.now() - buildStartedAt) / 1000))
      : 0;
  const pct = constructionTotal > 0 ? Math.round((constructionDone / constructionTotal) * 100) : 0;
  const verdict = scanVerdict(cityData.scanProvenance, totalFindings, cityData.languages);
  // A preview reads a sample; the header must not present the sample size as
  // the folder's size. The announcement carries the full arithmetic, the
  // header carries the suffix on every screen after it.
  const previewOmitted = cityData.dropped?.preview ?? 0;
  const preview = previewOmitted > 0;
  const previewTotal = cityData.totalFiles + previewOmitted;
  // A sampled city that happened to contain no findings is not a clean one:
  // most of its files were never opened. That sentence outranks the missing
  // engine's qualification.
  const statement = preview
    ? { key: "hud.preview" as DictKey, vars: {} }
    : cleanStatement(lang, verdict);
  // The live band is the permanent half of the promise the summary card only
  // says while it is open: the changed files were read by built-in rules, and
  // every external engine's answer belongs to the last full scan.
  const liveVisible = liveState.status !== "off" && liveState.analysisId === cityData.analysisId;
  // The screen-edge waypoint walks the dock's queue FORWARD to the next entry
  // WITHOUT a verdict — exactly where the dock's ▶ would land, and the sign's
  // target is computed by the same `worldTargetForFinding` the flight uses.
  // While the city is still under its crane or the tour is walking the
  // reader, the sign says nothing: one navigator at a time.
  const waypointFrom = triageActive ? triageCursor + 1 : 0;
  const waypointAt = nextOpenTriageIndex(queue, reviews, waypointFrom, 1);
  const waypointEntry = waypointAt >= 0 ? queue[waypointAt] : undefined;
  const waypointLine = waypointEntry?.file.findings[waypointEntry.index]?.line;
  const waypointTarget =
    waypointEntry && waypointLine !== undefined
      ? worldTargetForFinding(cityData, waypointEntry.file.id, waypointLine)
      : null;
  const waypoint =
    !constructing && !tourActive && waypointTarget
      ? edgeSignalForWaypoint(waypointTarget, cameraInfo, cameraMode, viewportAspect)
      : null;

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
          <button
            type="button"
            onClick={openSearch}
            aria-label={t(lang, "hud.searchAria")}
            title={t(lang, "hud.searchTitle")}
            className="btn-ghost workspace-search-toggle"
            aria-expanded={searchOpen}
            aria-controls="workspace-search"
          >
            <span aria-hidden="true">⌕</span>
          </button>
          {/* The city can stand without its instruments; this is the one-click
              door, with the dock's More row as the named twin. */}
          <button
            type="button"
            onClick={() => setCityOnly(true)}
            aria-label={t(lang, "actions.cityOnly")}
            title={t(lang, "actions.cityOnlyTitle")}
            className="btn-ghost workspace-search-toggle"
          >
            <span aria-hidden="true">⛶</span>
          </button>
          {!constructing && (
            <>
              {/* The frame budget the city is actually running on. Same window
                  the automatic graphics switch decides from, so the number and
                  the switch can never tell two stories — and nothing at all
                  while the window is still filling. */}
              {frameHz !== null && (
                <span className="workspace-fps" title={t(lang, "hud.fpsTitle")}>
                  {frameHz} <span>{t(lang, "hud.fpsUnit")}</span>
                </span>
              )}
              <span className="workspace-files">
                {preview ? (
                  <span
                    title={t(lang, "hud.filesPreviewTitle", {
                      total: formatCount(lang, previewTotal),
                    })}
                  >
                    {t(lang, "hud.filesSampled", {
                      count: formatCount(lang, cityData.totalFiles),
                    })}
                  </span>
                ) : (
                  <>
                    {formatCount(lang, cityData.totalFiles)} <span>{t(lang, "hud.filesUnit")}</span>
                  </>
                )}
              </span>
              <div
                className="workspace-severities"
                aria-label={t(lang, "hud.filterBySeverityAria")}
              >
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
                        style={
                          { "--severity": severityColor(id, colorblind) } as React.CSSProperties
                        }
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
            </>
          )}
          <AnalyzePanel />
        </div>
      </header>
      {liveVisible && <LiveBand live={liveState} lang={lang} />}
      {/* The colour key is one of the six surfaces the arrival budget folds:
          it explains the city, but it does not compete with it, and the same
          key stands in full in the project card. */}
      {showLegend && (
        <div className="city-legend">
          {topLanguages(cityData.languages, 3).map((language) => (
            <span key={language.name}>
              <i style={{ background: languageColor(language.name) }} />
              {language.name}
            </span>
          ))}
          <span className="legend-explainer">
            {t(lang, heightAxisKey(heatGridShown, heatChannel))}
          </span>
          <span className="legend-explainer">{t(lang, "hud.roofFindings")}</span>
        </div>
      )}
      {constructing && (
        <div
          className="build-bar absolute bottom-4 left-1/2 z-40 flex max-w-[calc(100vw-24px)] -translate-x-1/2 flex-wrap
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
                  style={{ width: `${pct}%`, background: "var(--brand-red)" }}
                />
              </span>
            </>
          )}
          {/* #31: the build asked for patience without saying how long. The
              store already holds the moment construction began, and this plate
              re-renders on the construction interval — so the clock is free,
              and it sits on its own dark ground rather than on the city. */}
          <span className="build-bar-elapsed whitespace-nowrap" style={{ color: "#dedbd3" }}>
            {t(lang, "scan.elapsed", { s: buildElapsedSec })}
          </span>
          <button
            onClick={requestBuildSkip}
            aria-label={t(lang, "hud.skipAria")}
            className="shrink-0 rounded px-3 min-h-9 flex items-center font-mono text-[length:var(--fs-meta)] text-[color:var(--meta-strong)]
                       transition-colors hover:text-[color:var(--brand-ink)] focus:outline-none focus:ring-1 focus:ring-[var(--focus-ring)]"
          >
            {t(lang, "hud.skip")} ⏭
          </button>
        </div>
      )}
      {waypoint && (
        <button
          type="button"
          data-waypoint-edge={waypoint.side}
          onClick={() => (triageActive ? nextTriage() : startTriage())}
          aria-label={t(lang, "hud.wpAria", {
            dir: t(lang, WAYPOINT_EDGE[waypoint.side].wordKey),
            dist: Math.round(waypoint.distance),
          })}
          title={t(lang, "hud.wpTitle")}
          className={`pointer-events-auto absolute z-40 flex items-center gap-2 rounded-lg px-3 min-h-9
                     font-mono text-[length:var(--fs-meta)] text-[color:var(--meta-strong)]
                     focus:outline-none focus:ring-1 focus:ring-[var(--focus-ring)] ${WAYPOINT_EDGE[waypoint.side].pos}`}
          style={{ background: "var(--glass-bg)", border: "1px solid var(--glass-border)" }}
        >
          <span aria-hidden="true">{WAYPOINT_EDGE[waypoint.side].arrow}</span>
          <span>{t(lang, WAYPOINT_EDGE[waypoint.side].wordKey)}</span>
          <span aria-hidden="true">≈{Math.round(waypoint.distance)}</span>
        </button>
      )}
      {/* The X-ray is mounted for exactly as long as the key is held, and
          never while the crane still works: nothing is aimable under it. */}
      {xrayHeld && !constructing && <XrayRaw />}
    </>
  );
}
