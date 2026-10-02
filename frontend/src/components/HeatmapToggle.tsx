"use client";

import { useStore, type HeatChannel } from "../stores/useStore";
import { getDirLayout } from "../city/layout";
import { useLodFar, LOD_THRESHOLDS } from "../hooks/useLodFar";
import { t, type DictKey } from "../i18n";

/**
 * Far-zoom heatmap channel switch — what the LOD heat cells are colored by.
 * Picking a channel zooms the camera out to the heat-grid view immediately,
 * so the click always has a visible effect. The churn channel is disabled
 * (aria-disabled — hover must still work) with an honest tooltip when the
 * scan carried no git history (local upload / shallow clone).
 *
 * The compact channel monikers (HEAT, THREAT, CX, CHURN) stay language-neutral
 * by design — they act as technical channel IDs, like "Security-Tour" does.
 */

const CHANNELS: Array<{ id: HeatChannel; label: string; tipKey: DictKey }> = [
  { id: "threat", label: "THREAT", tipKey: "heat.threatTip" },
  { id: "complexity", label: "CX", tipKey: "heat.complexityTip" },
  { id: "churn", label: "CHURN", tipKey: "heat.churnTip" },
];

export function HeatmapToggle() {
  const lang = useStore((s) => s.prefs.lang);
  const heatChannel = useStore((s) => s.heatChannel);
  const setHeatChannel = useStore((s) => s.setHeatChannel);
  const churnAvailable = useStore((s) => s.cityData?.meta.churn ?? false);
  const bounds = useStore((s) => (s.cityData ? getDirLayout(s.cityData, s.focusPath).bounds : 100));
  const lodFar = useLodFar(bounds);
  const requestFly = useStore((s) => s.requestFly);

  const pick = (id: HeatChannel): void => {
    const unavailable = id === "churn" && !churnAvailable;
    if (unavailable) return;
    setHeatChannel(id);
    // Make the click visibly matter: jump straight into the heat-grid view
    if (!lodFar)
      requestFly(
        0,
        0,
        Math.max(
          bounds * (LOD_THRESHOLDS.RELATIVE_ENTER + 0.4),
          LOD_THRESHOLDS.ABSOLUTE_FLOOR + 60,
        ),
      );
  };

  return (
    <div
      className="glass flex items-center gap-1 rounded px-2 py-1.5"
      role="radiogroup"
      aria-label={t(lang, "heat.groupAria")}
      data-tip={t(lang, "heat.groupTip")}
    >
      <span className="font-mono text-[11px] tracking-wider text-[#98948a] mr-1">HEAT</span>
      {CHANNELS.map(({ id, label, tipKey }) => {
        const unavailable = id === "churn" && !churnAvailable;
        const active = heatChannel === id;
        return (
          <button
            key={id}
            role="radio"
            aria-checked={active}
            aria-disabled={unavailable || undefined}
            data-tip={unavailable ? t(lang, "heat.churnUnavailableTip") : t(lang, tipKey)}
            onClick={() => pick(id)}
            className="font-mono text-[11px] tracking-wider px-1.5 py-0.5 rounded transition-all duration-150
                       focus:outline-none focus:ring-1 focus:ring-[#e8503c] cursor-pointer
                       hover:brightness-125 active:scale-[0.96]"
            style={{
              color: unavailable ? "var(--meta-faint)" : active ? "#e8503c" : "var(--meta-strong)",
              background: active ? "rgba(232, 80, 60, 0.12)" : "transparent",
              border: `1px solid ${
                active
                  ? "rgba(232, 80, 60, 0.5)"
                  : unavailable
                    ? "transparent"
                    : "rgba(150, 142, 128, 0.25)"
              }`,
              boxShadow: active ? "inset 0 0 0 1px rgba(232, 80, 60, 0.25)" : undefined,
              opacity: unavailable ? 0.45 : 1,
              cursor: unavailable ? "not-allowed" : undefined,
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
