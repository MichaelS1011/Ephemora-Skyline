import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "../stores/useStore";
import { SEVERITY_COLOR } from "../city/palette";
import { describeGitignoreSkips, scanVerdict } from "../city/provenance";
import { t, type Lang } from "../i18n";
import { ts, tsCount } from "./startCopy";
import type { DroppedFiles } from "../city/types";
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
function dropRows(lang: Lang, dropped: DroppedFiles | undefined): { key: string; text: string }[] {
  if (!dropped) return [];
  const nf = (n: number) => n.toLocaleString(lang === "de" ? "de-DE" : "en-US");
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
  return rows;
}

/** The card closes on its own, but only while nobody is reading it. */
const DWELL_MS = 9000;

export function ScanSummary() {
  const lang = useStore((s) => s.prefs.lang);
  const analysisId = useStore((s) => s.analysisId);
  const cityData = useStore((s) => s.cityData);
  const buildPhase = useStore((s) => s.buildPhase);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [held, setHeld] = useState(false);
  const [left, setLeft] = useState(0);
  const [collapsed, setCollapsed] = useState(false);

  // A finished scan always gets its line; the timer only runs while the card
  // is open, unpinned and outside the pointer — and it remembers how much was
  // left when the pointer came in, so holding it never buys a full timeout.
  const remaining = useRef(DWELL_MS);
  useEffect(() => {
    if (!analysisId || !cityData || buildPhase !== "built") return;
    remaining.current = DWELL_MS;
    setOpen(true);
    setCollapsed(false);
    setPinned(false);
    setLeft(Math.round(DWELL_MS / 1000));
  }, [analysisId, cityData, buildPhase]);

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
  const total = f.P0 + f.P1 + f.P2;
  // The scan is only complete for what the project itself called source.
  // Say what the .gitignore kept out while the user is still reading this.
  const skipped = describeGitignoreSkips(cityData.skippedByGitignore, lang);
  const drops = dropRows(lang, cityData.dropped);
  // one number for the strip: how many files in the folder were never read
  const unread = cityData.dropped
    ? cityData.dropped.pathTooLong +
      cityData.dropped.unsafePath +
      cityData.dropped.tooLarge +
      cityData.dropped.unreadable +
      cityData.dropped.excluded
    : 0;
  const verdict = scanVerdict(cityData.scanProvenance, total, cityData.languages);
  const clean = verdict.kind === "clear";
  // "no findings" is only a result if something looked. An unverified scan
  // must not wear the green of a clean one.
  const unverified = verdict.kind === "shallow" || verdict.kind === "unknown";
  // Spec §15 color hierarchy: red MEANS critical — a toast with only
  // medium findings must not scream in P0 red. Grade the accent by the
  // worst severity actually present.
  const accent = clean
    ? "#29d398"
    : unverified
      ? SEVERITY_COLOR.P2
      : f.P0 > 0
        ? SEVERITY_COLOR.P0
        : f.P1 > 0
          ? SEVERITY_COLOR.P1
          : SEVERITY_COLOR.P2;

  const status =
    verdict.kind === "clear"
      ? ts(lang, "summary.noneFound")
      : verdict.kind === "shallow"
        ? ts(lang, "summary.noScanner")
        : verdict.kind === "unknown"
          ? ts(lang, "summary.noScanner")
          : t(lang, "summary.complete");
  // Three honest states, three shapes: a clean sweep is solid, an unverified
  // one is dashed (the border says what the fill cannot), a finding is red.
  const shape = clean ? "clear" : unverified ? "unverified" : "findings";
  const nf = (n: number) => n.toLocaleString(lang === "de" ? "de-DE" : "en-US");

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
            {t(lang, "summary.filesAnalyzed", { count: nf(cityData.totalFiles) })}
            {total > 0 &&
              ` · ${tsCount(lang, "ctx.findingsMany", "ctx.findingsOne", total, { count: nf(total) })}`}
            {unread > 0 && ` · ${ts(lang, "summary.unread", { n: nf(unread) })}`}
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
            {t(lang, "summary.filesAnalyzed", { count: nf(cityData.totalFiles) })}
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
                    title={t(lang, "summary.sevRisk", { label: t(lang, key) })}
                    className={`chip-${sev.toLowerCase()} start-summary-chip`}
                  >
                    {t(lang, key)}: {f[sev]}
                  </span>
                ) : null,
              )}
            </span>
          )}
          {unverified && verdict.kind === "shallow" && (
            <span className="start-summary-missing">
              {t(lang, "summary.noFindingsMissing", { missing: verdict.missing.join(", ") })}
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
            onClick={() => setOpen(false)}
            className="start-summary-close"
            aria-label={t(lang, "summary.dismissAria")}
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
