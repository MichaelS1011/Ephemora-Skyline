import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "../stores/useStore";
import { useOrigin } from "../stores/useOrigin";
import { REVIEWED_BEACON_COLOR, severityColor, severityTextColor } from "../city/palette";
import { describeGitignoreSkips, scanVerdict } from "../city/provenance";
import { narrowChromeWindow } from "../city/motion";
import { formatCount, t, type Lang } from "../i18n";
import { GIT_MAX_TOTAL_BYTES } from "../hooks/useLocalAnalysis";
import { ts, tsCount } from "./startCopy";
import type { DroppedFiles } from "../city/types";
import { severityTotal } from "../city/facts";
import "../design/start.css";

/* Tiny CSS-only confetti burst (3 squares, purely decorative) */
function ConfettiBurst() {
  return (
    <span aria-hidden="true" className="relative inline-block w-4 h-4 mr-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            width: 5,
            height: 5,
            borderRadius: 1,
            background: ["#e8503c", "#f2d5a0", "#ffd23f"][i],
            top: `${[0, 4, 0][i]}px`,
            left: `${[0, 5, 10][i]}px`,
            animation: `confetti-pop 0.55s ease-out ${i * 80}ms both`,
          }}
        />
      ))}
    </span>
  );
}

/**
 * What the scan did not read, as numbers on the card.
 * Every row is a count the pipeline kept where the path actually left; a row
 * with no count in it is not rendered, so "complete" never grows a decoration.
 */
function dropRows(
  lang: Lang,
  dropped: DroppedFiles | undefined,
  churnRan: boolean,
  churnInterrupted: boolean,
): { key: string; text: string }[] {
  const rows: { key: string; text: string }[] = [];
  // The Git-Mauer state rides the drop list because it IS one — of the
  // history: the .git arrived, a pack over the per-file wall split the
  // object store, and the log stopped. Saying only "no churn" would blame
  // the folder for what the upload did to it. It leads the list because it
  // qualifies every git-shaped number below.
  if (churnInterrupted) {
    rows.push({ key: "churnInterrupted", text: ts(lang, "drop.churnInterrupted") });
  }
  if (!dropped) return rows;
  const nf = (n: number) => formatCount(lang, n);
  if ((dropped.preview ?? 0) > 0)
    rows.push({
      key: "preview",
      text: tsCount(lang, "drop.preview", "drop.previewOne", dropped.preview ?? 0, {
        n: nf(dropped.preview ?? 0),
      }),
    });
  if (dropped.pathTooLong > 0)
    rows.push({
      key: "pathTooLong",
      text: tsCount(lang, "drop.rejectedNoMax", "drop.rejectedNoMaxOne", dropped.pathTooLong, {
        n: nf(dropped.pathTooLong),
      }),
    });
  if (dropped.unsafePath > 0)
    rows.push({
      key: "unsafePath",
      text: tsCount(lang, "drop.unsafe", "drop.unsafeOne", dropped.unsafePath, {
        n: nf(dropped.unsafePath),
      }),
    });
  if (dropped.tooLarge > 0)
    rows.push({
      key: "tooLarge",
      text: tsCount(lang, "drop.skipped", "drop.skippedOne", dropped.tooLarge, {
        n: nf(dropped.tooLarge),
      }),
    });
  if (dropped.gitBudget > 0)
    rows.push({
      key: "gitBudget",
      // Not "too large": these are ordinary loose git objects and the limit is
      // this tool's own. Naming the budget is what lets the reader judge the
      // churn score next to it — and the score is only worth qualifying when it
      // was computed at all.
      text:
        tsCount(lang, "drop.gitBudget", "drop.gitBudgetOne", dropped.gitBudget, {
          n: nf(dropped.gitBudget),
          mb: Math.round(GIT_MAX_TOTAL_BYTES / 1024 / 1024),
        }) + (churnRan ? ts(lang, "drop.gitBudgetChurn") : ""),
    });
  if (dropped.unreadable > 0)
    rows.push({
      key: "unreadable",
      text: tsCount(lang, "drop.unread", "drop.unreadOne", dropped.unreadable, {
        n: nf(dropped.unreadable),
      }),
    });
  if (dropped.excluded > 0)
    rows.push({
      key: "excluded",
      text: tsCount(lang, "drop.excluded", "drop.excludedOne", dropped.excluded, {
        n: nf(dropped.excluded),
      }),
    });
  if (dropped.gitIgnored > 0)
    rows.push({
      key: "gitIgnored",
      // Named at the first ignored ancestor, so one ignored folder reads as one
      // path set aside rather than as its 14,000 files — which is also what the
      // browser actually refused to list.
      text: tsCount(lang, "drop.gitIgnored", "drop.gitIgnoredOne", dropped.gitIgnored, {
        n: nf(dropped.gitIgnored),
      }),
    });
  if (dropped.unsupportedFormat > 0)
    rows.push({
      key: "unsupportedFormat",
      text: tsCount(lang, "drop.unsupported", "drop.unsupportedOne", dropped.unsupportedFormat, {
        n: nf(dropped.unsupportedFormat),
      }),
    });
  return rows;
}

/** The card closes on its own, but only while nobody is reading it. */
const DWELL_MS = 9000;
/** The camera has to be standing before a resident waves at it. Measured in
 *  the running demo: firing with the card selected a figure 197 units away and
 *  behind the frame; after the arrival pose lands the nearest visible one is
 *  within a few metres. */
const RESIDENT_GREET_DELAY_MS = 1400;

export function ScanSummary({ demo = false }: { demo?: boolean }) {
  const lang = useStore((s) => s.prefs.lang);
  const colorblind = useStore((s) => s.prefs.colorblind);
  const analysisId = useStore((s) => s.analysisId);
  const cityData = useStore((s) => s.cityData);
  const buildPhase = useStore((s) => s.buildPhase);
  const requestResidentGreet = useStore((s) => s.requestResidentGreet);
  const residentOffer = useStore((s) => s.residentOffer);
  const setResidentOffer = useStore((s) => s.setResidentOffer);
  const startTour = useStore((s) => s.startTour);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [held, setHeld] = useState(false);
  const [left, setLeft] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const triageActive = useStore((s) => s.triageActive);
  const tourActive = useStore((s) => s.tourActive);
  const showFindings = useStore((s) => s.showFindings);
  const selectedUnit = useStore((s) => s.selectedUnit);
  // A file answers the city and nothing else — its banner may not speak of a
  // scan it never ran, nor of a test it cannot start.
  const standalone = useOrigin((s) => s.origin) === "file";

  // A finished scan always gets its line; the timer only runs while the card
  // is open, unpinned and outside the pointer — and it remembers how much was
  // left when the pointer came in, so holding it never buys a full timeout.
  const remaining = useRef(DWELL_MS);
  const announced = useRef<string | null>(null);
  useEffect(() => {
    if (!analysisId || !cityData || buildPhase !== "built") return;
    // Once per scan. `cityData` arrives as a fresh reference whenever anything
    // re-derives it — the language switch does — and re-running this on that
    // put a dismissed notice back over the panel the person was reading.
    if (announced.current === analysisId) return;
    announced.current = analysisId;
    // An exported city has already closed its own window: it arrived as a file,
    // and the reader is not waiting to learn that a scan finished. The line
    // says what the file is and stays folded — no countdown of a moment that
    // has passed.
    if (standalone) {
      setOpen(true);
      setCollapsed(true);
      return;
    }
    // One resident in the city waves as the finished card arrives; the summary
    // then speaks in that same voice. Fired once per scan, like the card.
    remaining.current = DWELL_MS;
    setOpen(true);
    // Narrow windows see the strip first — the card covered a fifth of the
    // skyline at 360 px. "Show" hands the full card back; wide windows keep
    // the announcement-then-strip rhythm unchanged.
    setCollapsed(narrowChromeWindow());
    setPinned(false);
    setLeft(Math.round(DWELL_MS / 1000));
  }, [analysisId, cityData, buildPhase, standalone]);

  // The wave is armed separately: `cityData` arrives as a fresh reference while
  // the card settles, and a timer living in that effect was cancelled by its own
  // re-run before it ever fired. The camera also needs the arrival pose first —
  // measured on the running demo, firing at the instant of the announcement
  // picked a resident 197 units away, outside the frame.
  const greetedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!analysisId || buildPhase !== "built" || standalone) return;
    if (greetedFor.current === analysisId) return;
    greetedFor.current = analysisId;
    const timer = window.setTimeout(requestResidentGreet, RESIDENT_GREET_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [analysisId, buildPhase, standalone, requestResidentGreet]);

  // A guided flow owns the stage: once triage, the tour or the findings list
  // starts, the announcement folds to its strip instead of lying over it.
  useEffect(() => {
    if (!triageActive && !tourActive && !showFindings && selectedUnit === null) return;
    setCollapsed(true);
    setPinned(false);
  }, [triageActive, tourActive, showFindings, selectedUnit]);

  useEffect(() => {
    if (!open || pinned || held || collapsed) return;
    const until = Date.now() + remaining.current;
    const id = setInterval(() => {
      const ms = until - Date.now();
      remaining.current = Math.max(0, ms);
      setLeft(Math.ceil(ms / 1000));
      if (ms <= 0) setCollapsed(true);
    }, 500);
    return () => clearInterval(id);
  }, [open, pinned, held, collapsed]);

  const hold = useCallback(() => setHeld(true), []);
  const release = useCallback(() => setHeld(false), []);

  if (!cityData) return null;

  const f = cityData.findingsBySeverity;
  const total = severityTotal(f);
  const findingsInTests = cityData.findingsInTests ?? 0;
  // A sampled city is not a finished scan. Both numbers travel together: what
  // the folder offered and what the preview read.
  const previewOmitted = cityData.dropped?.preview ?? 0;
  const preview = previewOmitted > 0;
  const previewTotal = cityData.totalFiles + previewOmitted;
  // The scan is only complete for what the project itself called source.
  // Say what the .gitignore kept out while the user is still reading this.
  const skipped = describeGitignoreSkips(cityData.skippedByGitignore, lang);
  const drops = dropRows(
    lang,
    cityData.dropped,
    cityData.scanProvenance?.churn === true,
    cityData.scanProvenance?.churnInterrupted === true,
  );
  // one number for the strip: how many files in the folder were never read.
  // Summed over the record's own fields, so an eighth reason cannot join the
  // counts and stay out of the strip the way the first five hand-list did.
  const unread = cityData.dropped
    ? Object.values(cityData.dropped).reduce((sum, n) => sum + (Number.isFinite(n) ? n : 0), 0)
    : 0;
  const verdict = scanVerdict(cityData.scanProvenance, total, cityData.languages);
  // A live state is a qualifier on the scan itself, not a footnote under a
  // finding: the card must not call a delta "Scan complete" just because the
  // city happens to carry findings.
  const liveInfo = cityData.scanProvenance?.live;
  const clean = verdict.kind === "clear" && !preview;
  // "no findings" is only a result if something looked. An unverified scan
  // must not wear the green of a clean one.
  const unverified =
    verdict.kind === "shallow" || verdict.kind === "unknown" || verdict.kind === "live";
  // Spec §15 color hierarchy: red MEANS critical — a toast with only
  // medium findings must not scream in P0 red. Grade the accent by the
  // worst severity actually present, and let the colour-blind switch reach
  // this surface like it reaches the beacons.
  const accent = preview
    ? severityColor("P2", colorblind)
    : clean
      ? REVIEWED_BEACON_COLOR
      : unverified
        ? severityColor("P2", colorblind)
        : f.P0 > 0
          ? severityColor("P0", colorblind)
          : f.P1 > 0
            ? severityColor("P1", colorblind)
            : severityColor("P2", colorblind);
  // The same grade, two inks. The dot and the rule are signals and may burn at
  // full alarm colour; the line that spells "no findings" or "Scan complete" is
  // 12 px text on glass, where the pure P0 red measured 3,88:1 on the plaza.
  // The adaptive stage keeps that text on the dark end of its own field at every
  // rung — bright ground firms the tint to 0,92, dark ground thins it over an
  // already dark picture — and `tests/glas-chrome.test.ts` walks all six tones
  // over every rung to prove it.
  const statusInk = preview
    ? severityTextColor("P2", colorblind)
    : clean
      ? REVIEWED_BEACON_COLOR
      : unverified
        ? severityTextColor("P2", colorblind)
        : f.P0 > 0
          ? severityTextColor("P0", colorblind)
          : f.P1 > 0
            ? severityTextColor("P1", colorblind)
            : severityTextColor("P2", colorblind);

  const status = demo
    ? t(lang, "summary.demo")
    : preview
      ? t(lang, "summary.preview", {
          sampled: formatCount(lang, cityData.totalFiles),
          total: formatCount(lang, previewTotal),
        })
      : standalone
        ? t(lang, "summary.exported")
        : liveInfo
          ? total > 0
            ? tsCount(lang, "summary.liveFound", "summary.liveFoundOne", total, {
                count: formatCount(lang, total),
              })
            : t(lang, "summary.live")
          : verdict.kind === "clear"
            ? ts(lang, "summary.noneFound")
            : verdict.kind === "shallow"
              ? t(
                  lang,
                  verdict.missing.length === 1
                    ? "summary.noFindingsMissing"
                    : "summary.noFindingsMissingMany",
                  { missing: verdict.missing.join(", ") },
                )
              : verdict.kind === "unknown"
                ? t(lang, "summary.depthUnknown")
                : t(lang, "summary.complete");
  // Three honest states, three shapes: a clean sweep is solid, an unverified
  // one is dashed (the border says what the fill cannot), a finding is red.
  const shape =
    demo || unverified || standalone || preview ? "unverified" : clean ? "clear" : "findings";
  const nf = (n: number) => formatCount(lang, n);

  if (collapsed) {
    return (
      <div className="start-summary-strip-slot">
        <div
          className={`start-summary-strip is-${shape}`}
          role="status"
          aria-live="polite"
          onMouseEnter={hold}
          onMouseLeave={release}
        >
          <span className="start-summary-dot" style={{ background: accent }} aria-hidden="true" />
          <span className="start-summary-strip-text">{status}</span>
          <span className="start-summary-strip-meta">
            {demo
              ? t(lang, "summary.demoFiles", { count: nf(cityData.totalFiles) })
              : tsCount(
                  lang,
                  "summary.filesAnalyzed",
                  "summary.filesAnalyzedOne",
                  cityData.totalFiles,
                  { count: nf(cityData.totalFiles) },
                )}
            {total > 0 &&
              ` · ${tsCount(lang, "ctx.findingsMany", "ctx.findingsOne", total, { count: nf(total) })}`}
            {findingsInTests > 0 &&
              ` · ${t(lang, "summary.testsShort", { count: nf(findingsInTests) })}`}
            {unread > 0 &&
              ` · ${tsCount(lang, "summary.unread", "summary.unreadOne", unread, { n: nf(unread) })}`}
          </span>
          <button
            type="button"
            className="start-summary-strip-open"
            onClick={() => {
              setOpen(true);
              setCollapsed(false);
              setLeft(Math.round(DWELL_MS / 1000));
            }}
          >
            {ts(lang, "summary.show")}
          </button>
          {/* The card folded away, but the resident's offer has not been
              answered. It rides the strip — the same verb, one click, no second
              surface — until the reader takes it or closes it. */}
          {total > 0 && residentOffer === "open" && (
            <button
              type="button"
              className="start-summary-strip-guide"
              onClick={() => {
                setResidentOffer("taken");
                startTour();
              }}
            >
              {t(lang, "summary.guideGo")} <span aria-hidden="true">→</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="start-summary-slot">
      <div
        role="status"
        aria-live="polite"
        className={`start-summary is-${shape}`}
        style={{ borderColor: `${accent}55`, maxWidth: "calc(100% - 28px)" }}
        onMouseEnter={hold}
        onMouseLeave={release}
        onFocus={hold}
        onBlur={release}
      >
        <span className="start-summary-rule" style={{ background: accent }} aria-hidden="true" />
        <div className="flex flex-wrap start-summary-main">
          <span className="start-summary-status" style={{ color: statusInk }}>
            {clean && <ConfettiBurst />}
            {status}
          </span>
          <span className="start-summary-files">
            {demo
              ? t(lang, "summary.demoFiles", { count: nf(cityData.totalFiles) })
              : tsCount(
                  lang,
                  "summary.filesAnalyzed",
                  "summary.filesAnalyzedOne",
                  cityData.totalFiles,
                  { count: nf(cityData.totalFiles) },
                )}
          </span>
          {/* No grade chips here. The header above carries the census — the
              same three numbers, in the same order, and it is the one that
              filters the city when clicked. Repeating them on the card was
              how "Critical / High / Medium" ended up written three times on
              one screen. What the announcement owns is the total, in words,
              and the count of what it read. */}
          {findingsInTests > 0 && total > 0 && (
            <span className="start-summary-test-context">
              {t(lang, "summary.testContext", {
                inTests: nf(findingsInTests),
                total: nf(total),
              })}
            </span>
          )}
        </div>

        {total > 0 && (
          <div className="start-summary-guide">
            <span className="start-summary-guide-who">{t(lang, "summary.guideWho")}</span>
            <p className="start-summary-guide-line">
              {t(lang, preview ? "summary.guidePreviewLine" : "summary.guideLine")}
            </p>
            <button
              type="button"
              className="start-summary-guide-go"
              onClick={() => {
                setResidentOffer("taken");
                startTour();
                setOpen(false);
                setCollapsed(true);
              }}
            >
              {t(lang, "summary.guideGo")} <span aria-hidden="true">→</span>
            </button>
          </div>
        )}

        {(skipped !== "" || drops.length > 0) && (
          <ul
            className="start-summary-drops"
            title={skipped !== "" ? t(lang, "ctx.keptOutTip") : undefined}
          >
            {drops.map((d) => (
              <li key={d.key} className="is-drop">
                {d.text}
              </li>
            ))}
            {skipped !== "" && (
              <li key="gitignore" className="is-gitignore">
                {t(lang, "ctx.keptOut", { skipped })}
              </li>
            )}
          </ul>
        )}

        <div className="start-summary-foot">
          <span className="start-summary-dwell" aria-hidden="true">
            {pinned ? "" : ts(lang, "summary.dwell", { s: left })}
          </span>
          <button
            type="button"
            className={`start-summary-pin ${pinned ? "is-on" : ""}`}
            aria-pressed={pinned}
            aria-label={ts(lang, "summary.pinAria")}
            title={pinned ? ts(lang, "summary.unpin") : ts(lang, "summary.pin")}
            onClick={() => setPinned((p) => !p)}
          >
            {pinned ? "◉" : "○"} {t(lang, pinned ? "summary.unpinShort" : "summary.pinShort")}
          </button>
          <button
            onClick={() => {
              // `collapsed` is what decides panel or strip; `open` only feeds the
              // countdown. Setting it alone made this button do nothing at all.
              setOpen(false);
              setCollapsed(true);
              // Closing the card is the reader's answer. The strip keeps no verb
              // and the crowd keeps no wave after this one — a refusal is never
              // asked a second time.
              setResidentOffer("closed");
            }}
            className="start-summary-close"
            aria-label={t(lang, demo ? "summary.dismissAriaDemo" : "summary.dismissAria")}
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
