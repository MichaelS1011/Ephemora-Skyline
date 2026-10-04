import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useStore } from "../stores/useStore";
import { t, type DictKey } from "../i18n";

// v3: the arrow keys became the camera turntable, so the primer is shown
// once more — otherwise nobody discovers the new binding.
const COACH_KEY = "codecity-coach-v3";

const HINTS: { icon: string; text: DictKey; detail: DictKey }[] = [
  { icon: "↻", text: "coach.hintTurn", detail: "coach.hintTurnDetail" },
  { icon: "▦", text: "coach.hintDistrict", detail: "coach.hintDistrictDetail" },
  { icon: "▣", text: "coach.hintFile", detail: "coach.hintFileDetail" },
  { icon: "?", text: "coach.hintKeys", detail: "coach.hintKeysDetail" },
];

/* ── Marker legend — "What am I looking at?" ───────────────────────────────
 * Every semantic visual in the city, one row each. Pure-CSS swatches.
 * Shared with ContextCard (its collapsible LEGEND section) so the wording
 * never drifts between the first-visit primer and the always-available copy.
 * The two texts per row are dictionary keys, so the legend speaks the same
 * language as the rest of the panels. */
export interface LegendMarker {
  label: DictKey;
  meaning: DictKey;
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
    label: "legend.height",
    meaning: "legend.heightMeaning",
    swatch: sw("rgba(232,178,60,0.1)", { border: "1px solid rgba(232,178,60,0.3)" }),
    glyph: "⬍",
  },
  {
    label: "legend.footprint",
    meaning: "legend.footprintMeaning",
    swatch: sw("rgba(167,139,250,0.1)", { border: "1px solid rgba(167,139,250,0.35)" }),
    glyph: "▭",
  },
  {
    label: "legend.monolith",
    meaning: "legend.monolithMeaning",
    swatch: sw("#17171a", { border: "1px solid #3a3a40" }),
  },
  {
    label: "legend.glass",
    meaning: "legend.glassMeaning",
    swatch: sw("rgba(216,205,180,0.22)", { border: "1px solid rgba(216,205,180,0.55)" }),
  },
  {
    label: "legend.redWindows",
    meaning: "legend.redWindowsMeaning",
    swatch: sw("#ff2e4d", { boxShadow: "0 0 5px rgba(255,46,77,0.7)" }),
  },
  {
    label: "legend.scaffolding",
    meaning: "legend.scaffoldingMeaning",
    swatch: sw("#ff9a3d"),
  },
  {
    label: "legend.shield",
    meaning: "legend.shieldMeaning",
    swatch: sw("rgba(216,201,163,0.08)", {
      border: "1px dashed rgba(216,201,163,0.6)",
      borderRadius: 4,
    }),
  },
  {
    label: "legend.ring",
    meaning: "legend.ringMeaning",
    swatch: sw("transparent", { border: "2px solid #ff2e4d", borderRadius: "50%" }),
  },
  {
    label: "legend.laser",
    meaning: "legend.laserMeaning",
    swatch: sw("#ffe14d", { height: 4, marginTop: 4 }),
  },
  {
    label: "legend.streams",
    meaning: "legend.streamsMeaning",
    swatch: sw("#37e6ff"),
    secondSwatch: sw("#b06bff"),
  },
  {
    label: "legend.heat",
    meaning: "legend.heatMeaning",
    swatch: sw("linear-gradient(90deg, #3dd6c4, #ffd23f, #ff2ea6)"),
  },
  {
    label: "legend.authors",
    meaning: "legend.authorsMeaning",
    swatch: sw("#ff6b9d", { borderRadius: "50%" }),
    secondSwatch: sw("#4de3ff", { borderRadius: "50%" }),
  },
  {
    label: "legend.citizens",
    meaning: "legend.citizensMeaning",
    swatch: sw("rgba(150,142,128,0.15)", { border: "1px solid rgba(150,142,128,0.35)" }),
    glyph: "···",
  },
];

export function LegendRow({ marker }: { marker: LegendMarker }) {
  const lang = useStore((s) => s.prefs.lang);
  const label = t(lang, marker.label);
  const meaning = t(lang, marker.meaning);
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
    <div className="flex items-start gap-2.5" title={`${label} = ${meaning}`}>
      <span className="mt-0.5 shrink-0 inline-flex">{swatches}</span>
      <span
        className="text-[12px] leading-relaxed flex-1 min-w-0"
        style={{
          color: "#aaa69c",
          fontFamily: "var(--font-sans, ui-sans-serif, system-ui, sans-serif)",
        }}
      >
        <span className="block" style={{ color: "#e0dbcf" }}>
          {label}
        </span>
        <span>{meaning}</span>
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
  const lang = useStore((s) => s.prefs.lang);
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

  // Escape on a visible primer means "I have read this", not "close the panel
  // behind it". Same protocol as the tour: capture phase plus
  // stopImmediatePropagation, so the app-level chain never sees the key.
  // Without this the only way out was the ✕ — measured on a 1024×680 screen,
  // where the primer sat on top of the action dock and swallowed its clicks.
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: globalThis.KeyboardEvent): void => {
      // A keydown whose target is the window itself has no element to ask —
      // fall back to the body, which owns nothing, rather than throwing on
      // `closest`.
      const t = e.target instanceof Element ? e.target : document.body;
      // Same ownership rule as the tour: whatever the person types into, and
      // every menu / modal / panel that handles Escape itself, keeps the key.
      if (
        t.closest(
          'input, textarea, select, [contenteditable="true"], [aria-modal="true"], [role="menu"], #analyze-panel',
        )
      )
        return;
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      dismiss();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [visible, dismiss]);

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
        aria-label={t(lang, "coach.regionAria")}
      >
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-[14px] font-semibold" style={{ color: "#f2efe8" }}>
            {t(lang, "coach.title")}
          </h2>
          <button
            onClick={dismiss}
            className="btn-ghost shrink-0 w-8 h-8 flex items-center justify-center !p-0"
            aria-label={t(lang, "coach.dismissAria")}
            title={t(lang, "coach.dismissTip")}
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
                  {t(lang, hint.text)}
                </div>
                <div className="mt-0.5" style={{ color: "#aaa69c" }}>
                  {t(lang, hint.detail)}
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
          {t(lang, "coach.legendToggle")}
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
