"use client";

import { useStore, type ViewMode } from "../stores/useStore";
import { t, type DictKey } from "../i18n";

/**
 * ModeBar (spec §14) — the slim segmented control above the city that picks
 * which information layer the skyline shows. One lens at a time, never all
 * information simultaneously:
 * - STRUCTURE     the architecture, nothing else (default)
 * - SECURITY      the city darkens, only the alarm buildings stay lit
 * - DEPENDENCIES  the buildings recede, the dependency veins glow
 *
 * Rendered by CityTree as a screen-fixed drei Html overlay (top center, on
 * the same row as the workspace search), only once the construction
 * cinematic has finished. Nothing else lives here — the mode bar is pure
 * intent, the scene reacts through the store.
 */

const MODES: Array<{ id: ViewMode; labelKey: DictKey; tipKey: DictKey }> = [
  { id: "structure", labelKey: "mode.structure", tipKey: "mode.structureTip" },
  { id: "security", labelKey: "mode.security", tipKey: "mode.securityTip" },
  { id: "dependencies", labelKey: "mode.dependencies", tipKey: "mode.dependenciesTip" },
];

export function ModeBar() {
  // Granular selectors — pref/mode changes must not re-render anything else
  const lang = useStore((s) => s.prefs.lang);
  const viewMode = useStore((s) => s.viewMode);
  const setViewMode = useStore((s) => s.setViewMode);

  return (
    <div
      className="glass flex items-center gap-1 rounded px-2 py-1.5 pointer-events-auto"
      role="radiogroup"
      aria-label={t(lang, "mode.aria")}
    >
      {MODES.map(({ id, labelKey, tipKey }) => {
        const active = viewMode === id;
        return (
          <button
            key={id}
            role="radio"
            aria-checked={active}
            title={t(lang, tipKey)}
            data-tip={t(lang, tipKey)}
            onClick={() => setViewMode(id)}
            className="font-mono text-[11px] tracking-wider px-1.5 py-0.5 rounded transition-all duration-150
                       focus:outline-none focus:ring-1 focus:ring-[#e8503c] cursor-pointer
                       hover:brightness-125 active:scale-[0.96]"
            style={{
              color: active ? "#e8503c" : "var(--meta-strong)",
              background: active ? "rgba(232, 80, 60, 0.12)" : "transparent",
              border: `1px solid ${
                active ? "rgba(232, 80, 60, 0.5)" : "rgba(150, 142, 128, 0.25)"
              }`,
              boxShadow: active ? "inset 0 0 0 1px rgba(232, 80, 60, 0.25)" : undefined,
            }}
          >
            {t(lang, labelKey)}
          </button>
        );
      })}
    </div>
  );
}
