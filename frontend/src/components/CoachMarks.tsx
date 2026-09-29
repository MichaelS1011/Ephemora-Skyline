import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useStore } from "../stores/useStore";

const COACH_KEY = "codecity-coach-v2";

/* The core loop, in four lines */
const HINTS = [
  { icon: "⊕", text: "Drag to orbit · scroll to zoom" },
  { icon: "▦", text: "Click a district block (a folder) to zoom into it" },
  { icon: "▣", text: "Click a building (a file) for its details" },
  { icon: "?", text: "Press ? anytime for all shortcuts" },
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
    meaning: "complexity — branching + size",
    swatch: sw("rgba(232,178,60,0.1)", { border: "1px solid rgba(232,178,60,0.3)" }),
    glyph: "⬍",
  },
  {
    label: "Footprint size",
    meaning: "API surface — exported symbols",
    swatch: sw("rgba(167,139,250,0.1)", { border: "1px solid rgba(167,139,250,0.35)" }),
    glyph: "▭",
  },
  {
    label: "Black windowless monolith",
    meaning: "huge file — 150 KB or more",
    swatch: sw("#17171a", { border: "1px solid #3a3a40" }),
  },
  {
    label: "Glass building",
    meaning: "dead-code candidate — never imported",
    swatch: sw("rgba(216,205,180,0.22)", { border: "1px solid rgba(216,205,180,0.55)" }),
  },
  {
    label: "Red pulsing windows",
    meaning: "security findings (P0 / P1)",
    swatch: sw("#ff2e4d", { boxShadow: "0 0 5px rgba(255,46,77,0.7)" }),
  },
  {
    label: "Orange band + scaffolding",
    meaning: "git churn — changes often",
    swatch: sw("#ff9a3d"),
  },
  {
    label: "Translucent shield",
    meaning: "80%+ test coverage",
    swatch: sw("rgba(216,201,163,0.08)", {
      border: "1px dashed rgba(216,201,163,0.6)",
      borderRadius: 4,
    }),
  },
  {
    label: "Red ring at the base",
    meaning: "circular import (A → B → A)",
    swatch: sw("transparent", { border: "2px solid #ff2e4d", borderRadius: "50%" }),
  },
  {
    label: "Yellow flickering laser",
    meaning: "copy-paste clone between files",
    swatch: sw("#ffe14d", { height: 4, marginTop: 4 }),
  },
  {
    label: "Cyan / violet streams",
    meaning: "imports in / out (red = circular)",
    swatch: sw("#37e6ff"),
    secondSwatch: sw("#b06bff"),
  },
  {
    label: "Heat cells (zoomed out)",
    meaning: "THREAT / CX / CHURN channels",
    swatch: sw("linear-gradient(90deg, #3dd6c4, #ffd23f, #ff2ea6)"),
  },
  {
    label: "Author colors",
    meaning: "git blame territory",
    swatch: sw("#ff6b9d", { borderRadius: "50%" }),
    secondSwatch: sw("#4de3ff", { borderRadius: "50%" }),
  },
  {
    label: "Citizens, taxi, bus",
    meaning: "ambient life — decoration, not data",
    swatch: sw("rgba(150,142,128,0.15)", { border: "1px solid rgba(150,142,128,0.35)" }),
    glyph: "···",
  },
];

export function LegendRow({ marker }: { marker: LegendMarker }) {
  let swatches: ReactNode = (
    <span className="w-3 h-3 shrink-0 inline-block" style={marker.swatch}>
      {marker.glyph && (
        <span
          className="flex items-center justify-center w-full h-full"
          style={{ fontSize: 8, lineHeight: 1, color: "#cfcabe" }}
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
    <div className="flex items-start gap-1.5" title={`${marker.label} = ${marker.meaning}`}>
      <span className="mt-0.5 shrink-0 inline-flex">{swatches}</span>
      <span
        className="font-jetbrains text-[9px] leading-snug flex-1 min-w-0"
        style={{ color: "#a8a49a" }}
      >
        <span style={{ color: "#cfcabe" }}>{marker.label}</span>
        <span style={{ color: "var(--meta-faint)" }}> — {marker.meaning}</span>
      </span>
    </div>
  );
}

export function MarkerLegend({ columns = 2 }: { columns?: 1 | 2 }) {
  return (
    <div
      className={
        columns === 2 ? "grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1" : "flex flex-col gap-1"
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
  const [primerOpen, setPrimerOpen] = useState(true);

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
    <div className="absolute bottom-16 left-0 right-0 z-40 flex justify-center pointer-events-none">
      <div
        className="pointer-events-auto animate-fade-up"
        style={{
          background: "rgba(18, 18, 16, 0.92)",
          border: "1px solid rgba(232,178,60,0.28)",
          borderRadius: 5,
          padding: "0.65rem 0.9rem",
          boxShadow: "0 0 24px rgba(232,178,60,0.1), 0 8px 24px rgba(0,0,0,0.4)",
          backdropFilter: "blur(12px)",
          maxWidth: "min(90vw, 560px)",
          maxHeight: "60vh",
          overflowY: "auto",
        }}
        role="status"
      >
        <div className="flex items-start gap-4">
          {/* Hints grid — the core loop */}
          <div className="grid grid-cols-2 gap-x-5 gap-y-1.5">
            {HINTS.map((h) => (
              <div key={h.icon} className="flex items-center gap-2">
                <span
                  className="w-5 h-5 flex items-center justify-center shrink-0 font-jetbrains text-[11px]"
                  style={{
                    color: "#f2d5a0",
                    background: "rgba(232,178,60,0.1)",
                    border: "1px solid rgba(232,178,60,0.25)",
                    borderRadius: 3,
                  }}
                >
                  {h.icon}
                </span>
                <span className="font-jetbrains text-[10px]" style={{ color: "#a8a49a" }}>
                  {h.text}
                </span>
              </div>
            ))}
          </div>

          {/* Dismiss */}
          <button
            onClick={dismiss}
            className="btn-ghost shrink-0 w-6 h-6 flex items-center justify-center !p-0"
            aria-label="Dismiss hints"
            title="Hide this guide — it only shows once. The LEGEND in the left dossier always explains the markers."
          >
            ✕
          </button>
        </div>

        {/* What am I looking at? — marker primer */}
        <button
          onClick={() => setPrimerOpen((v) => !v)}
          aria-expanded={primerOpen}
          title="What every visual marker in the city means — click to collapse or expand"
          className="w-full flex items-center gap-1.5 mt-2.5 pt-2 font-jetbrains text-[9px] tracking-[0.2em]"
          style={{
            color: "#f2d5a0",
            borderTop: "1px solid rgba(232,178,60,0.12)",
            textAlign: "left",
          }}
        >
          <span style={{ fontSize: 8 }}>{primerOpen ? "▾" : "▸"}</span> WHAT AM I LOOKING AT?
        </button>
        {primerOpen && (
          <div className="mt-2">
            <p className="font-jetbrains text-[9px] mb-1.5" style={{ color: "var(--meta-faint)" }}>
              Folders are districts · files are buildings · every decoration means something:
            </p>
            <MarkerLegend columns={2} />
          </div>
        )}
      </div>
    </div>
  );
}
