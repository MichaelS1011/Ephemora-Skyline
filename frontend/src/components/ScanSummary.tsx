import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "../stores/useStore";
import { useOrigin } from "../stores/useOrigin";
import { severityColor } from "../city/palette";
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
): { key: string; text: string }[] {
  if (!dropped) return [];
  const nf = (n: number) => formatCount(lang, n);
  const rows: { key: string; text: string }[] = [];
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

export function ScanSummary({ demo = false }: { demo?: boolean }) {
  const lang = useStore((s) => s.prefs.lang);
  const colorblind = useStore((s) => s.prefs.colorblind);
  const analysisId = useStore((s) => s.analysisId);
  const cityData = useStore((s) => s.cityData);
  const buildPhase = useStore((s) => s.buildPhase);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [held, setHeld] = useState(false);
  const [left, setLeft] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
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
    remaining.current = DWELL_MS;
    setOpen(true);
    // Narrow windows see the strip first — the card covered a fifth of the
    // skyline at 360 px. "Show" hands the full card back; wide windows keep
    // the announcement-then-strip rhythm unchanged.
    setCollapsed(narrowChromeWindow());
    setPinned(false);
    setLeft(Math.round(DWELL_MS / 1000));
  }, [analysisId, cityData, buildPhase, standalone]);

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
  // The scan is only complete for what the project itself called source.
  // Say what the .gitignore kept out while the user is still reading this.
  const skipped = describeGitignoreSkips(cityData.skippedByGitignore, lang);
  const drops = dropRows(lang, cityData.dropped, cityData.scanProvenance?.churn === true);
  // one number for the strip: how many files in the folder were never read.
  // Summed over the record's own fields, so an eighth reason cannot join the
  // counts and stay out of the strip the way the first five hand-list did.
  const unread = cityData.dropped
    ? Object.values(cityData.dropped).reduce((sum, n) => sum + (Number.isFinite(n) ? n : 0), 0)
    : 0;
  const verdict = scanVerdict(cityData.scanProvenance, total, cityData.languages);
  const clean = verdict.kind === "clear";
  // "no findings" is only a result if something looked. An unverified scan
  // must not wear the green of a clean one.
  const unverified = verdict.kind === "shallow" || verdict.kind === "unknown";
  // Spec §15 color hierarchy: red MEANS critical — a toast with only
  // medium findings must not scream in P0 red. Grade the accent by the
  // worst severity actually present, and let the colour-blind switch reach
  // this surface like it reaches the beacons.
  const accent = clean
    ? "#29d398"
    : unverified
      ? severityColor("P2", colorblind)
      : f.P0 > 0
        ? severityColor("P0", colorblind)
        : f.P1 > 0
          ? severityColor("P1", colorblind)
          : severityColor("P2", colorblind);

  const status = demo
    ? t(lang, "summary.demo")
    : standalone
      ? t(lang, "summary.exported")
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
  const shape = demo || unverified || standalone ? "unverified" : clean ? "clear" : "findings";
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
          <span className="start-summary-status" style={{ color: accent }}>
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
          {total > 0 && (
            <span className="start-summary-severities">
              {(
                [
                  { sev: "P0", key: "hud.sevCritical" },
                  { sev: "P1", key: "hud.sevHigh" },
                  { sev: "P2", key: "hud.sevMedium" },
                ] as const
              ).map(({ sev, key }) =>
                f[sev] > 0 ? (
                  <span
                    key={sev}
                    title={t(lang, demo ? "summary.sevSample" : "summary.sevRisk", {
                      label: t(lang, key),
                    })}
                    className={`chip-${sev.toLowerCase()} start-summary-chip`}
                  >
                    {t(lang, key)}: {f[sev]}
                  </span>
                ) : null,
              )}
            </span>
          )}
          {findingsInTests > 0 && total > 0 && (
            <span className="start-summary-test-context">
              {t(lang, "summary.testContext", {
                inTests: nf(findingsInTests),
                total: nf(total),
              })}
            </span>
          )}
        </div>

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
            {pinned ? "◉" : "○"} {pinned ? ts(lang, "summary.unpin") : ts(lang, "summary.pin")}
          </button>
          <button
            onClick={() => {
              // `collapsed` is what decides panel or strip; `open` only feeds the
              // countdown. Setting it alone made this button do nothing at all.
              setOpen(false);
              setCollapsed(true);
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
