"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useStore, type HeatChannel } from "../stores/useStore";
import { getDirLayout } from "../city/layout";
import { useLodFar, LOD_THRESHOLDS } from "../hooks/useLodFar";
import { cityFiles, timeCensus, timeRange } from "../city/stoodAt";
import { formatCount, formatDate, t, type DictKey } from "../i18n";
import { ts } from "./startCopy";

/**
 * Far-zoom heatmap channel switch — what the LOD heat cells are colored by.
 * Picking a channel zooms the camera out to the heat-grid view immediately,
 * so the click always has a visible effect. The churn channel is disabled
 * (aria-disabled — hover must still work) with an honest tooltip, and honest
 * means TWO tooltips: one when the upload carried no .git, one when the .git
 * arrived cut off and the log died mid-history (scanProvenance.churnInterrupted).
 *
 * The fourth channel is TIME: not a colour ramp but a census — which towers
 * already stood at a chosen date (see `city/stoodAt.ts` for the decision and
 * `HeatCells` for the silhouettes). Its date field exists ONLY while the
 * channel is picked: the arrival budget counts four standing surfaces, and a
 * fifth one parked next to the toggle would break it. The slider commits
 * DEBOUNCED — the heat field rewrites every instance matrix on a committed
 * date, and a per-frame rebuild while the thumb moves would spend the frame
 * budget on geometry the reader is still dragging through.
 *
 * The compact channel monikers (HEAT, THREAT, CX, CHURN, TIME) stay
 * language-neutral by design — they act as technical channel IDs, like
 * "Security-Tour" does.
 */

const CHANNELS: Array<{ id: HeatChannel; label: string; tipKey: DictKey }> = [
  { id: "threat", label: "THREAT", tipKey: "heat.threatTip" },
  { id: "complexity", label: "CX", tipKey: "heat.complexityTip" },
  { id: "churn", label: "CHURN", tipKey: "heat.churnTip" },
  { id: "time", label: "TIME", tipKey: "heat.timeTip" },
];

/** ms of calendar a slider step moves — the payload counts whole days. */
const DAY_MS = 86_400_000;
/** the thumb may move as often as it likes; the field rebuilds this often */
const DATE_COMMIT_MS = 200;

export function HeatmapToggle() {
  const lang = useStore((s) => s.prefs.lang);
  const heatChannel = useStore((s) => s.heatChannel);
  const setHeatChannel = useStore((s) => s.setHeatChannel);
  const cityData = useStore((s) => s.cityData);
  const churnAvailable = useStore((s) => s.cityData?.meta.churn ?? false);
  // Two different reasons for the same disabled switch, and the reader should
  // hear the true one: "no .git in this upload" vs ".git arrived cut off".
  const churnInterrupted = useStore((s) => s.cityData?.scanProvenance?.churnInterrupted === true);
  const bounds = useStore((s) => (s.cityData ? getDirLayout(s.cityData, s.focusPath).bounds : 100));
  const lodFar = useLodFar(bounds);
  const requestFly = useStore((s) => s.requestFly);
  const heatDateMs = useStore((s) => s.heatDateMs);
  const setHeatDateMs = useStore((s) => s.setHeatDateMs);

  // null = the question cannot be ranged: no scan moment (old payloads do not
  // carry createdAt) or the churn pass never ran. No rail, no channel.
  const range = useMemo(() => timeRange(cityData), [cityData]);

  // The thumb's own position: drawn live while dragging, committed to the
  // store only after DATE_COMMIT_MS of stillness.
  const [thumb, setThumb] = useState<number | null>(null);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shownDate = thumb ?? heatDateMs ?? range?.max ?? null;

  useEffect(
    () => () => {
      if (commitTimer.current) clearTimeout(commitTimer.current);
    },
    [],
  );

  const dragDate = (ms: number): void => {
    setThumb(ms);
    if (commitTimer.current) clearTimeout(commitTimer.current);
    commitTimer.current = setTimeout(() => {
      commitTimer.current = null;
      setHeatDateMs(ms);
    }, DATE_COMMIT_MS);
  };

  const pick = (id: HeatChannel): void => {
    const unavailable = (id === "churn" && !churnAvailable) || (id === "time" && range === null);
    if (unavailable) return;
    setHeatChannel(id);
    if (id === "time") {
      setThumb(null);
      if (heatDateMs == null && range) setHeatDateMs(range.max);
    }
    // Make the click visibly matter: jump straight into the heat-grid view
    if (!lodFar)
      requestFly({
        x: 0,
        z: 0,
        distance: Math.max(
          bounds * (LOD_THRESHOLDS.RELATIVE_ENTER + 0.4),
          LOD_THRESHOLDS.ABSOLUTE_FLOOR + 60,
        ),
      });
  };

  const census =
    heatChannel === "time" && range && shownDate != null
      ? timeCensus(cityFiles(cityData), shownDate, cityData?.meta)
      : null;

  return (
    <div
      className="glass flex flex-wrap items-center gap-1 rounded px-2 py-1.5"
      role="radiogroup"
      aria-label={t(lang, "heat.groupAria")}
      data-tip={t(lang, "heat.groupTip")}
    >
      <span className="font-mono text-[length:var(--fs-small)] tracking-wider text-[color:var(--meta)] mr-1">
        HEAT
      </span>
      {CHANNELS.map(({ id, label, tipKey }) => {
        const unavailable =
          (id === "churn" && !churnAvailable) || (id === "time" && range === null);
        const active = heatChannel === id;
        return (
          <button
            key={id}
            role="radio"
            aria-checked={active}
            aria-disabled={unavailable || undefined}
            data-tip={
              unavailable
                ? churnInterrupted
                  ? ts(lang, id === "time" ? "heat.timeInterruptedTip" : "heat.churnInterruptedTip")
                  : t(lang, id === "time" ? "heat.timeUnavailableTip" : "heat.churnUnavailableTip")
                : t(lang, tipKey)
            }
            onClick={() => pick(id)}
            // One ring for the whole shell: no local focus style here — the
            // global `:focus-visible { outline: … var(--focus-ring) }` in
            // design/globals.css draws it, in the same weight as everywhere.
            className="font-mono text-[length:var(--fs-small)] tracking-wider px-1.5 py-0.5 rounded transition-all duration-150
                       cursor-pointer
                       hover:brightness-125 active:scale-[0.96]"
            style={{
              // No dimming: the switch sits on frosted chrome, and text there
              // has to hold its contrast. `--meta` is one step under the
              // enabled `--meta-strong` and the strike-through in stadt-ui.css
              // says "unavailable"; glas-chrome.test.ts measures this ink.
              color: unavailable ? "var(--meta)" : active ? "#e8503c" : "var(--meta-strong)",
              background: active ? "rgba(232, 80, 60, 0.12)" : "transparent",
              border: `1px solid ${
                active
                  ? "rgba(232, 80, 60, 0.5)"
                  : unavailable
                    ? "transparent"
                    : "rgba(150, 142, 128, 0.25)"
              }`,
              boxShadow: active ? "inset 0 0 0 1px rgba(232, 80, 60, 0.25)" : undefined,
              cursor: unavailable ? "not-allowed" : undefined,
            }}
          >
            {label}
          </button>
        );
      })}
      {heatChannel === "time" && range && shownDate != null && census && (
        <div className="basis-full flex flex-col gap-0.5" data-heat-time-field>
          <input
            type="range"
            min={range.min}
            max={range.max}
            step={DAY_MS}
            value={shownDate}
            aria-label={t(lang, "heat.timeSliderAria", { date: formatDate(lang, shownDate) })}
            onChange={(e) => dragDate(Number(e.target.value))}
            className="w-full accent-[#9fb4cc]"
          />
          <span className="font-mono text-[length:var(--fs-small)] text-[color:var(--meta-strong)]">
            {t(lang, "heat.timeCensus", {
              stood: formatCount(lang, census.stood),
              files: formatCount(lang, census.files),
              date: formatDate(lang, shownDate),
            })}
          </span>
          <span className="text-[length:var(--fs-small)] text-[color:var(--meta)]">
            {t(lang, "heat.timeBoundary", {
              noHistory: formatCount(lang, census.noHistory),
            })}
          </span>
        </div>
      )}
    </div>
  );
}
