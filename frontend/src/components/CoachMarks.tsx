import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useStore } from "../stores/useStore";

// v3: the arrow keys became the camera turntable, so the primer is shown
// once more — otherwise nobody discovers the new binding.
const COACH_KEY = "codecity-coach-v3";

const HINTS = [
  { icon: "↻", text: "Arrow keys turn the view", detail: "Drag to look, scroll to fly in" },
  { icon: "▦", text: "Open a district", detail: "Click a folder block" },
  { icon: "▣", text: "Inspect a file", detail: "Click a building" },
  { icon: "?", text: "Keyboard shortcuts", detail: "Press ? for the full guide" },
];

/* ── Marker legend — "What am I looking at?" ───────────────────────────────
 * Every semantic visual in the city, one row each. Pure-CSS swatches.
 * Shared with ContextCard (its collapsible LEGEND section) so the wording
 * never drifts between the first-visit primer and the always-available copy. */
export interface LegendMarker {
  label: string;
  meaning: string;
  swatch: CSSProperties;
  glyph?: string;
  secondSwatch?: CSSProperties;
}

const sw = (background: string, extra?: CSSProperties): CSSProperties => ({
  background,
  borderRadius: 2,
  ...extra,
});

export const MARKER_LEGEND: LegendMarker[] = [
  {
    label: "Building height",
    meaning: "Code complexity and file size",
    swatch: sw("rgba(232,178,60,0.1)", { border: "1px solid rgba(232,178,60,0.3)" }),
    glyph: "⬍",
  },
  {
    label: "Footprint size",
    meaning: "Number of exported symbols",
    swatch: sw("rgba(167,139,250,0.1)", { border: "1px solid rgba(167,139,250,0.35)" }),
    glyph: "▭",
  },
  {
    label: "Windowless monolith",
    meaning: "Large file, 150 KB or more",
    swatch: sw("#17171a", { border: "1px solid #3a3a40" }),
  },
  {
    label: "Glass building",
    meaning: "Never imported; may be unused",
    swatch: sw("rgba(216,205,180,0.22)", { border: "1px solid rgba(216,205,180,0.55)" }),
  },
  {
    label: "Red pulsing windows",
    meaning: "Critical or high security findings",
    swatch: sw("#ff2e4d", { boxShadow: "0 0 5px rgba(255,46,77,0.7)" }),
  },
  {
    label: "Orange scaffolding",
    meaning: "Frequently changed in Git",
    swatch: sw("#ff9a3d"),
  },
  {
    label: "Translucent shield",
    meaning: "At least 80% test coverage",
    swatch: sw("rgba(216,201,163,0.08)", {
      border: "1px dashed rgba(216,201,163,0.6)",
      borderRadius: 4,
    }),
  },
  {
    label: "Red ring at the base",
    meaning: "Circular import: A → B → A",
    swatch: sw("transparent", { border: "2px solid #ff2e4d", borderRadius: "50%" }),
  },
  {
    label: "Yellow flickering laser",
    meaning: "Duplicated code across files",
    swatch: sw("#ffe14d", { height: 4, marginTop: 4 }),
  },
  {
    label: "Cyan / violet streams",
    meaning: "Incoming / outgoing imports",
    swatch: sw("#37e6ff"),
    secondSwatch: sw("#b06bff"),
  },
  {
    label: "Heat cells (zoomed out)",
    meaning: "Risk, complexity or change frequency",
    swatch: sw("linear-gradient(90deg, #3dd6c4, #ffd23f, #ff2ea6)"),
  },
  {
    label: "Author colors",
    meaning: "Main contributor to each area",
    swatch: sw("#ff6b9d", { borderRadius: "50%" }),
    secondSwatch: sw("#4de3ff", { borderRadius: "50%" }),
  },
  {
    label: "Citizens, taxi, bus",
    meaning: "Ambient city life",
    swatch: sw("rgba(150,142,128,0.15)", { border: "1px solid rgba(150,142,128,0.35)" }),
    glyph: "···",
  },
];

export function LegendRow({ marker }: { marker: LegendMarker }) {
  let swatches: ReactNode = (
    <span className="w-4 h-4 shrink-0 inline-block" style={marker.swatch}>
      {marker.glyph && (
        <span
          className="flex items-center justify-center w-full h-full"
          style={{ fontSize: 12, lineHeight: 1, color: "#cfcabe" }}
        >
          {marker.glyph}
        </span>
      )}
    </span>
  );
  if (marker.secondSwatch) {
    swatches = (
      <span className="flex items-center gap-0.5 shrink-0 h-3">
        <span className="w-2.5 h-3 inline-block" style={marker.swatch} />
        <span className="w-2.5 h-3 inline-block" style={marker.secondSwatch} />
      </span>
    );
  }
  return (
    <div className="flex items-start gap-2.5" title={`${marker.label} = ${marker.meaning}`}>
      <span className="mt-0.5 shrink-0 inline-flex">{swatches}</span>
      <span
        className="text-[12px] leading-relaxed flex-1 min-w-0"
        style={{
          color: "#aaa69c",
          fontFamily: "var(--font-sans, ui-sans-serif, system-ui, sans-serif)",
        }}
      >
        <span className="block" style={{ color: "#e0dbcf" }}>
          {marker.label}
        </span>
        <span>{marker.meaning}</span>
      </span>
    </div>
  );
}

export function MarkerLegend({ columns = 2 }: { columns?: 1 | 2 }) {
  return (
    <div
      className={
        columns === 2 ? "grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3" : "flex flex-col gap-3"
      }
    >
      {MARKER_LEGEND.map((m) => (
        <LegendRow key={m.label} marker={m} />
      ))}
    </div>
  );
}

export function CoachMarks() {
  const tourActive = useStore((s) => s.tourActive);
  const focusPath = useStore((s) => s.focusPath);
  const buildPhase = useStore((s) => s.buildPhase);
  const [visible, setVisible] = useState(false);
  // Start collapsed: the four steps are the one-glance story; the 13-row
  // marker legend is opt-in detail (progressive disclosure), never a wall.
  const [primerOpen, setPrimerOpen] = useState(false);

  useEffect(() => {
    let seen = false;
    try {
      seen = localStorage.getItem(COACH_KEY) === "1";
    } catch {
      /* */
    }
    if (!seen) setVisible(true);
  }, []);

  const dismiss = (): void => {
    setVisible(false);
    try {
      localStorage.setItem(COACH_KEY, "1");
    } catch {
      /* */
    }
  };

  useEffect(() => {
    if (focusPath.length > 0) dismiss();
  }, [focusPath.length]);

  // Hidden while the tour runs AND while the construction progress bar
  // occupies the same bottom-center slot during the build cinematic
  if (!visible || tourActive || buildPhase === "constructing") return null;

  return (
    <div className="absolute left-1/2 -translate-x-1/2 z-40 w-[min(90vw,520px)] pointer-events-none city-coach">
      <div
        className="pointer-events-auto animate-fade-up w-full"
        style={{
          background: "rgba(24, 24, 22, 0.94)",
          border: "1px solid rgba(150,142,128,0.26)",
          borderRadius: 12,
          padding: "14px 18px",
          boxShadow: "0 12px 36px rgba(0,0,0,0.3)",
          backdropFilter: "blur(20px)",
          maxHeight: "60vh",
          overflowY: "auto",
          fontFamily: "var(--font-sans, ui-sans-serif, system-ui, sans-serif)",
        }}
        role="region"
        aria-label="Getting started"
      >
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-[14px] font-semibold" style={{ color: "#f2efe8" }}>
            Explore your codebase
          </h2>
          <button
            onClick={dismiss}
            className="btn-ghost shrink-0 w-8 h-8 flex items-center justify-center !p-0"
            aria-label="Dismiss getting started guide"
            title="Hide guide. The city legend remains available in Project overview."
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path
                d="m3 3 8 8M11 3l-8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          {HINTS.map((hint) => (
            <div key={hint.icon} className="flex items-start gap-2.5">
              <span
                className="w-7 h-7 flex items-center justify-center shrink-0 text-[15px]"
                style={{ color: "#c5c0b5", background: "rgba(232,228,218,0.05)", borderRadius: 5 }}
                aria-hidden
              >
                {hint.icon}
              </span>
              <div className="text-[12px] leading-snug">
                <div className="font-medium" style={{ color: "#e8e4da" }}>
                  {hint.text}
                </div>
                <div className="mt-0.5" style={{ color: "#aaa69c" }}>
                  {hint.detail}
                </div>
              </div>
            </div>
          ))}
        </div>
        <button
          onClick={() => setPrimerOpen((open) => !open)}
          aria-expanded={primerOpen}
          aria-controls="coach-city-legend"
          className="w-full flex items-center justify-between gap-2 mt-3 pt-3 text-[12px] text-left"
          style={{ color: "#c5c0b5", borderTop: "1px solid rgba(150,142,128,0.18)" }}
        >
          What do the city markers mean?
          <span aria-hidden>{primerOpen ? "−" : "+"}</span>
        </button>
        {primerOpen && (
          <div id="coach-city-legend" className="mt-4">
            <MarkerLegend columns={2} />
          </div>
        )}
      </div>
    </div>
  );
}
