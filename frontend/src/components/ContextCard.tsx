import { useEffect, useState } from "react";
import { useStore } from "../stores/useStore";
import { formatCount, formatDecimal, t } from "../i18n";
import { severityTotal } from "../city/facts";
import { anchorFor, verifyAnchorsUnreadable } from "../verify";
import { explainDistrictDraw, resolveDir, tourStops } from "../city/layout";
import { describeGitignoreSkips, scanVerdict } from "../city/provenance";
import { blindCategories, categoryMeta, summarizeCategories } from "../config/findingCategories";
import { topLanguages, languageColor, severityColor, authorColor } from "../city/palette";
import { MarkerLegend } from "./CoachMarks";
import { SinceLastScan } from "./SinceLastScan";
import { CityLearningGuide } from "./CityLearningGuide";
import { LayerView } from "./LayerView";
import { RoleNotes } from "./RoleNotes";
import { learningCopy } from "./learningCopy";
import { useCompactChrome } from "../hooks/useCompactChrome";
import "../design/stadt-ui.css";

const startCollapsed = () =>
  typeof window !== "undefined" && (window.matchMedia?.("(max-width: 767px)").matches ?? false);

/** The grade order the shape glyph carries, same as the header and the list. */
const SEVERITY_SHAPE: Record<"P0" | "P1" | "P2", string> = { P0: "▲", P1: "◆", P2: "●" };

export function ContextCard() {
  const lang = useStore((s) => s.prefs.lang);
  const colorblind = useStore((s) => s.prefs.colorblind);
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

  // The city keeps its stage: the triage list on the right and this card on
  // the left never stand at once. Opening the list folds the card to its
  // reopen button; closing the list does not unfold it — the user left it
  // that way, and a panel that returns unasked covers the city again.
  // The card watches the findings panel through one one-way effect below.
  const showFindings = useStore((s) => s.showFindings);
  const selectedUnit = useStore((s) => s.selectedUnit);
  const compact = useCompactChrome();
  useEffect(() => {
    if (showFindings) setCollapsed(true);
  }, [showFindings]);

  if (!cityData || buildPhase === "constructing") return null;

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="absolute z-20 pointer-events-auto context-reopen flex items-center gap-2 px-3.5 py-3 rounded-lg text-[length:var(--fs-body)] font-medium"
        style={{
          background: "rgba(24, 24, 22, 0.95)",
          border: "1px solid rgba(150,142,128,0.3)",
          color: "#e8e4da",
          fontFamily: "var(--font-sans, ui-sans-serif, system-ui, sans-serif)",
          boxShadow: "0 6px 20px rgba(0,0,0,0.22)",
        }}
        aria-expanded={false}
        aria-label={t(lang, "ctx.showAria")}
      >
        <span aria-hidden style={{ color: "#e8503c" }}>
          ▦
        </span>
        {t(lang, "ctx.project")}
      </button>
    );
  }

  const isRoot = focusPath.length === 0;
  const dir = resolveDir(cityData.tree, focusPath);
  const findings = dir.findingsBySeverity;
  const totalFindings = severityTotal(findings);
  // Payloads from before the split only have the mixed number; show it rather
  // than inventing a code-only figure.
  const codeLines = dir.codeLines ?? dir.linesOfCode;
  const dataLines = dir.dataLines ?? 0;
  const dataLabels = topLanguages(dir.dataLanguages ?? {}, 2)
    .map((language) => language.name)
    .join(", ");
  const drawLines = explainDistrictDraw(dir, cityData.limits, lang);
  const skipped = describeGitignoreSkips(cityData.skippedByGitignore, lang);
  const findingsInTests = dir.findingsInTests ?? 0;
  const unverified = dir.unverifiedFiles ?? 0;
  const previewOmitted = cityData.dropped?.preview ?? 0;
  const engines = cityData.unverifiedEngines ?? [];
  // The demo city declares every engine off — then the honest sentence is not
  // "semgrep was switched off" but "nobody looked at any of this".
  const nothingScanned = cityData.scanProvenance?.regex === false;
  const verdict = scanVerdict(cityData.scanProvenance, totalFindings, dir.languages);
  const checked =
    dir.fileCount > 0 && !nothingScanned && unverified === 0 && verdict.kind === "clear";
  const uncheckedLine =
    unverified > 0
      ? nothingScanned
        ? t(lang, "ctx.uncheckedDemo")
        : t(lang, unverified === 1 ? "ctx.uncheckedOne" : "ctx.unchecked", {
            unverified,
            total: dir.fileCount,
            by:
              engines.length > 0 ? t(lang, "ctx.uncheckedBy", { engines: engines.join(", ") }) : "",
          })
      : "";
  const testLine =
    findingsInTests > 0 && totalFindings > 0
      ? t(lang, findingsInTests === 1 ? "ctx.testFindingsOne" : "ctx.testFindings", {
          inTests: findingsInTests,
          total: totalFindings,
        })
      : "";
  const kinds = summarizeCategories(dir.findingsByCategory, (id) =>
    t(lang, categoryMeta(id).label),
  );
  const blind = isRoot
    ? blindCategories(cityData.unverifiedEngines ?? []).map((id) => t(lang, categoryMeta(id).label))
    : [];
  const langs = topLanguages(dir.languages, 4);
  const totalLangLines = Object.values(dir.languages).reduce((sum, lines) => sum + lines, 0) || 1;
  const stops = tourStops(cityData);
  // Whether an earlier scan of this folder shape exists is a localStorage
  // read; the card asks once per render rather than after a button. When
  // that read FAILED (bytes there, would not parse) the row must say so —
  // "no earlier scan" is a claim about absence the failed read cannot make.
  const previousScan = Boolean(anchorFor(cityData)?.previousId);
  const anchorsUnreadable = cityData.analysisId
    ? verifyAnchorsUnreadable(cityData.analysisId)
    : false;
  const chainPrefix = focusPath.join("/");
  const inScope = isRoot
    ? stops[0]
    : (stops.find(
        (stop) => stop.chain.join("/") === chainPrefix && stop.file.path.startsWith(dir.path + "/"),
      ) ?? stops.find((stop) => stop.file.path.startsWith(dir.path + "/")));

  return (
    <div
      className="absolute z-20 pointer-events-auto animate-slide-left panel-context-card"
      style={{ overflowY: "auto", borderRadius: 12, padding: 18 }}
      role="region"
      tabIndex={-1}
      aria-label={t(lang, isRoot ? "ctx.project" : "ctx.district")}
    >
      <div className="flex items-start justify-between gap-2 mb-4">
        <div className="min-w-0 flex-1">
          <div className="text-[length:var(--fs-small)] mb-1" style={{ color: "#aaa69c" }}>
            {t(lang, isRoot ? "ctx.project" : "ctx.district")}
          </div>
          {/* 15 px is above the ladder: design/globals.css stops at `--fs-body`
              13 px and has no display step, so this title keeps its literal
              rather than dropping to the size of the copy under it. Pinned by
              `tests/glas-chrome.test.ts` — a new size there goes red. */}
          <h2
            className="font-jetbrains text-[15px] font-semibold truncate"
            title={isRoot ? cityData.repo.name : dir.name}
          >
            {isRoot ? cityData.repo.name : dir.name}
          </h2>
          {!isRoot && (
            <div
              className="font-jetbrains text-[length:var(--fs-small)] truncate mt-1"
              style={{ color: "#aaa69c" }}
              title={`/${dir.path}`}
            >
              /{dir.path}
            </div>
          )}
        </div>
        <button
          onClick={() => setCollapsed(true)}
          aria-label={t(lang, "ctx.collapseAria")}
          title={t(lang, "ctx.collapseTip")}
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

      {/* The mast explains height and roof on a wide screen; below 1200 px
          and while a file or the findings list is open it is hidden. This is
          the same two-line grammar in the card that remains on screen. It is
          only IN the DOM when it can be seen, so the arrival word budget does
          not count hidden text. */}
      {(compact || selectedUnit !== null || showFindings) && (
        <div className="ctx-grammar" aria-label={t(lang, "ctx.legendToggle")}>
          <span>{t(lang, "hud.heightComplexity")}</span>
          <span>{t(lang, "hud.roofFindings")}</span>
        </div>
      )}

      <CityLearningGuide />

      {/* The two census figures are the card's loudest fact and sit above the
          ladder for the same reason as the title: 22 px has no step to snap to
          (top is `--fs-body` 13 px), and a 13 px numeral next to a 12 px label
          would repeat the label's size instead of outranking it. Pinned by
          `tests/glas-chrome.test.ts`. */}
      <dl
        className="grid grid-cols-2 gap-4 pb-4"
        style={{ borderBottom: "1px solid rgba(150,142,128,0.18)" }}
      >
        <div title={t(lang, "ctx.filesTip")}>
          <dt className="text-[length:var(--fs-small)] mb-1" style={{ color: "#aaa69c" }}>
            {t(lang, "ctx.files")}
          </dt>
          <dd className="text-[22px] font-semibold leading-none tabular-nums">
            {formatCount(lang, dir.fileCount)}
            {isRoot && previewOmitted > 0 && (
              <span
                className="block mt-1 text-[length:var(--fs-meta)] font-normal"
                style={{ color: "#cbb98f" }}
              >
                {t(lang, "ctx.previewOf", {
                  total: formatCount(lang, cityData.totalFiles + previewOmitted),
                })}
              </span>
            )}
          </dd>
        </div>
        <div title={t(lang, "ctx.codeLinesTip")}>
          <dt className="text-[length:var(--fs-small)] mb-1" style={{ color: "#aaa69c" }}>
            {t(lang, "ctx.codeLines")}
          </dt>
          <dd className="text-[22px] font-semibold leading-none tabular-nums">
            {codeLines >= 1000
              ? `${formatDecimal(lang, codeLines / 1000)}k`
              : formatCount(lang, codeLines)}
          </dd>
        </div>
      </dl>

      {(isRoot ||
        dataLines > 0 ||
        drawLines.length > 0 ||
        testLine !== "" ||
        uncheckedLine !== "" ||
        kinds !== "" ||
        blind.length > 0 ||
        (isRoot && skipped !== "")) && (
        <div className="-mt-1 mb-1 space-y-1.5">
          {dataLines > 0 && (
            <div
              className="ctx-note"
              style={{ color: "#aaa69c" }}
              title={t(lang, "ctx.dataLinesTip")}
            >
              {t(lang, dataLines === 1 ? "ctx.dataLinesOne" : "ctx.dataLines", {
                count: formatCount(lang, dataLines),
                labels: dataLabels ? ` (${dataLabels})` : "",
              })}
            </div>
          )}
          {isRoot && skipped !== "" && (
            <div
              className="ctx-note"
              style={{ color: "#aaa69c" }}
              title={t(lang, "ctx.keptOutTip")}
            >
              {t(lang, "ctx.keptOut", { skipped })}
            </div>
          )}
          {uncheckedLine !== "" && (
            <div
              className="ctx-note"
              style={{ color: "#8f8b82" }}
              title={t(lang, "ctx.uncheckedTip")}
            >
              {uncheckedLine}
            </div>
          )}
          {kinds !== "" && (
            <div className="ctx-note" style={{ color: "#aaa69c" }} title={t(lang, "ctx.kindsTip")}>
              {kinds}
            </div>
          )}
          {blind.length > 0 && (
            <div className="ctx-note" style={{ color: "#8f8b82" }} title={t(lang, "ctx.blindTip")}>
              {t(lang, "ctx.blind", { list: blind.join(", ") })}
            </div>
          )}
          {/* S2 · R3-03: the rule set's own blind classes belong on the screen
              the user is reading, once per project — not only in the README's
              prose. Phrased about the rules, never as a promise the classes
              are absent from the code.
              Layered, not cut: the whole paragraph used to sit in the body and
              was the single longest block on the card (802 characters, 33
              lines before this change). It now opens one line below the fact
              it qualifies, in the same words. */}
          {isRoot && (
            <details className="ctx-coverage" data-context-class-coverage="true">
              <summary
                className="ctx-note"
                style={{ color: "#8f8b82" }}
                title={t(lang, "ctx.classCoverageTip")}
              >
                {t(lang, "ctx.classCoverageSummary")}
              </summary>
              <p className="ctx-coverage-body" style={{ color: "#8f8b82" }}>
                {t(lang, "ctx.classCoverage")}
              </p>
            </details>
          )}
          {testLine !== "" && (
            <div className="ctx-note" style={{ color: "#aaa69c" }} title={t(lang, "ctx.testTip")}>
              {testLine}
            </div>
          )}
          {drawLines.map((line) => (
            <div
              key={line}
              className="ctx-note"
              style={{ color: "#aaa69c" }}
              title={t(lang, "ctx.drawTip")}
            >
              {line}
            </div>
          ))}
        </div>
      )}

      {isRoot && (
        <SinceLastScan
          lang={lang}
          previousScan={previousScan}
          anchorsUnreadable={anchorsUnreadable}
        />
      )}

      <div className="py-4" style={{ borderBottom: "1px solid rgba(150,142,128,0.18)" }}>
        {totalFindings > 0 ? (
          <>
            <div className="text-[length:var(--fs-body)] font-medium mb-2.5">
              {totalFindings === 1
                ? t(lang, "ctx.findingsOne")
                : t(lang, "ctx.findingsMany", { count: formatCount(lang, totalFindings) })}
            </div>
            {/* The grade split belongs to this card only where the header
                cannot speak for it: at the root the header already says
                ▲1 ◆1 ●1 for the same city, and a second copy of a census is
                one more thing to read and no new fact. Inside a district the
                card is the ONLY place its grades are written. */}
            {!isRoot && (
              <div className="flex gap-x-3 gap-y-2 flex-wrap">
                {(
                  [
                    { sev: "P0", key: "hud.sevCritical" },
                    { sev: "P1", key: "hud.sevHigh" },
                    { sev: "P2", key: "hud.sevMedium" },
                  ] as const
                ).map(({ sev, key }) =>
                  findings[sev] > 0 ? (
                    <span
                      key={sev}
                      className="inline-flex items-center gap-1.5 text-[length:var(--fs-small)]"
                      data-severity={sev}
                      style={{
                        color: severityColor(sev, colorblind),
                        ["--severity" as string]: severityColor(sev, colorblind),
                      }}
                    >
                      <span className="severity-shape" aria-hidden="true">
                        {SEVERITY_SHAPE[sev]}
                      </span>
                      <span style={{ color: "#c5c0b5" }}>{t(lang, key)}</span>
                      <span className="tabular-nums" style={{ color: "#f2efe8" }}>
                        {findings[sev]}
                      </span>
                    </span>
                  ) : null,
                )}
              </div>
            )}
            {inScope && (
              <button
                onClick={() => navigateToFile(inScope.file.id)}
                className="w-full mt-3 px-3 py-2.5 text-left rounded-md transition-colors hover:bg-white/[0.05]"
                style={{
                  border: "1px solid rgba(232,80,60,0.3)",
                  background: "rgba(232,80,60,0.06)",
                }}
                title={t(lang, "ctx.reviewFileTip", { path: inScope.file.path })}
              >
                <div
                  className="text-[length:var(--fs-small)] font-medium mb-1"
                  style={{ color: "#f18a7b" }}
                >
                  {t(lang, "ctx.reviewHighest")}
                </div>
                <div className="font-jetbrains text-[length:var(--fs-small)] truncate">
                  {inScope.file.name}
                </div>
              </button>
            )}
          </>
        ) : (
          <div
            className="text-[length:var(--fs-body)] flex items-center gap-2"
            style={{ color: checked ? "#a2d4b4" : "#b8beb9" }}
            data-context-verdict={checked ? "checked" : "unchecked"}
          >
            <span aria-hidden>{checked ? "✓" : "⊘"}</span>
            {learningCopy(lang, nothingScanned ? "noScan" : checked ? "checked" : "unchecked")}
          </div>
        )}
      </div>

      {langs.length > 0 && (
        <div className="pt-4">
          <div className="text-[length:var(--fs-small)] mb-2.5" style={{ color: "#aaa69c" }}>
            {t(lang, "ctx.languages")}
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
                className="flex items-center gap-1.5 min-w-0 text-[length:var(--fs-small)]"
                title={t(lang, "ctx.langShare", {
                  name: language.name,
                  pct: Math.round((language.lines / totalLangLines) * 100),
                })}
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
          className="pt-4"
          style={{ borderTop: "1px solid rgba(150,142,128,0.18)", marginTop: 16 }}
        >
          {/* #52: a person does not belong between language shares — own
              block with a heading that says what the number means. */}
          <div className="text-[length:var(--fs-small)] mb-2.5" style={{ color: "#aaa69c" }}>
            {t(lang, "ctx.authorship")}
          </div>
          <div
            className="flex items-center gap-2 text-[length:var(--fs-small)]"
            title={t(lang, "ctx.authored", {
              author: dir.topAuthor,
              pct: Math.round((dir.topAuthorShare ?? 0) * 100),
            })}
          >
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ background: authorColor(dir.topAuthor) }}
              aria-hidden
            />
            <span className="truncate" style={{ color: "#aaa69c" }}>
              {t(lang, "ctx.topContributor")}{" "}
              <span style={{ color: "#c5c0b5" }}>{dir.topAuthor}</span>
              {dir.topAuthorShare != null && (
                <span className="ml-1 tabular-nums">
                  {t(lang, "ctx.shareOfFiles", { pct: Math.round(dir.topAuthorShare * 100) })}
                </span>
              )}
            </span>
          </div>
        </div>
      )}

      <div className="mt-4 pt-2" style={{ borderTop: "1px solid rgba(150,142,128,0.18)" }}>
        <button
          onClick={() => setLegendOpen((open) => !open)}
          aria-expanded={legendOpen}
          aria-controls="context-city-legend"
          className="w-full flex items-center justify-between gap-2 text-[length:var(--fs-body)] py-2 text-left"
          style={{ color: "#c5c0b5" }}
        >
          {t(lang, "ctx.legendToggle")}
          <span aria-hidden>{legendOpen ? "−" : "+"}</span>
        </button>
        {legendOpen && (
          <div id="context-city-legend" className="pt-2">
            <MarkerLegend columns={1} />
            {/* Z-05 — the four layers, under the same disclosure as the colour
                key: both answer "what is this picture made of", and neither is
                on the screen at arrival, where the word budget lives. */}
            <LayerView />
            {/* Z-07 — and the kinds of figure standing in it. */}
            <RoleNotes />
          </div>
        )}
      </div>
    </div>
  );
}
