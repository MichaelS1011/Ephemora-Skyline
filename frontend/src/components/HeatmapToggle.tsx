"use client";

import { useStore, type HeatChannel } from "../stores/useStore";
import { getDirLayout } from "../city/layout";
import { useLodFar, LOD_THRESHOLDS } from "../hooks/useLodFar";

/**
 * Far-zoom heatmap channel switch — what the LOD heat cells are colored by.
 * Picking a channel zooms the camera out to the heat-grid view immediately,
 * so the click always has a visible effect. The churn channel is disabled
 * (aria-disabled — hover must still work) with an honest tooltip when the
 * scan carried no git history (local upload / shallow clone).
 */

const CHANNELS: Array<{ id: HeatChannel; label: string; what: string }> = [
  { id: "threat", label: "THREAT", what: "P0 red, P1 orange, P2 yellow, clean dark blue" },
  { id: "complexity", label: "CX", what: "cyan (simple) → amber → magenta (complex)" },
  { id: "churn", label: "CHURN", what: "green (stable) → orange (constantly churning)" },
];

export function HeatmapToggle() {
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
      aria-label="Heatmap color channel"
      data-tip="Far-zoom heatmap: pick what the city grid shows when you zoom out. Clicking a channel zooms out to the heat view."
    >
      <span className="font-mono text-[9px] tracking-wider text-[#98948a] mr-1">HEAT</span>
      {CHANNELS.map(({ id, label, what }) => {
        const unavailable = id === "churn" && !churnAvailable;
        const active = heatChannel === id;
        return (
          <button
            key={id}
            role="radio"
            aria-checked={active}
            aria-disabled={unavailable || undefined}
            data-tip={
              unavailable
                ? "No .git folder in this upload — churn and author districts need the project\u2019s git metadata"
                : `${label}: color heat cells by ${what}. Click to zoom out into the heat view.`
            }
            onClick={() => pick(id)}
            className="font-mono text-[9px] tracking-wider px-1.5 py-0.5 rounded transition-colors duration-150
                       focus:outline-none focus:ring-1 focus:ring-[#e8503c] cursor-pointer"
            style={{
              color: unavailable ? "#8a867c" : active ? "#e8503c" : "#a8a49a",
              background: active ? "rgba(232, 80, 60, 0.12)" : "transparent",
              border: `1px solid ${active ? "rgba(232, 80, 60, 0.5)" : "transparent"}`,
              opacity: unavailable ? 0.45 : 1,
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
