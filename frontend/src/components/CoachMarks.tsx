import { useEffect, useState, useCallback } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useStore } from "../stores/useStore";
import { alarmWindowColors, CYCLE_RING_COLOR, ENV, heatLegendGradient } from "../city/palette";
import { t, type DictKey } from "../i18n";
import { ts } from "./startCopy";
import "../design/start.css";

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

/** The alarm chip's glow, spelled from the tone that is actually painted. */
function alarmGlow(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `0 0 5px rgba(${r},${g},${b},0.7)`;
}

/**
 * The city's own key, drawn from the palette the city is painted with.
 *
 * It takes the switch as an argument because a legend built from a constant
 * describes one branch while the other is on screen: the alarm windows move to
 * the colour-saver tone, and a key still showing their red would be a caption
 * over the wrong picture.
 */
export function markerLegend(colorblind: boolean): LegendMarker[] {
  const windowTone = alarmWindowColors(colorblind).lit;
  return [
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
      // Key and map move together: the swatch is the tone `Building.tsx` rasterises
      // into the facade, and the label says which hue that is in this branch.
      label: colorblind ? "legend.alarmWindows" : "legend.redWindows",
      meaning: "legend.redWindowsMeaning",
      swatch: sw(windowTone, { boxShadow: alarmGlow(windowTone) }),
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
      swatch: sw("transparent", {
        border: `2px solid ${CYCLE_RING_COLOR}`,
        borderRadius: "50%",
      }),
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
      // 005 Teil A. The same cyan as an arriving stream, because it is the same
      // fact seen from the other end; the SQUARE is what separates it from every
      // round ring in this key.
      label: "legend.blastSquare",
      meaning: "legend.blastSquareMeaning",
      swatch: sw(ENV.importIn, { border: `2px solid ${ENV.arcCasing}` }),
    },
    {
      label: "legend.heat",
      meaning: "legend.heatMeaning",
      // The row is drawn from the table `complexityColor` interpolates, so it
      // cannot outlive a switch of the ramp and start describing a picture that
      // is no longer on screen.
      swatch: sw(heatLegendGradient(colorblind)),
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
}

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
  const colorblind = useStore((s) => s.prefs.colorblind);
  return (
    <div
      className={
        columns === 2 ? "grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3" : "flex flex-col gap-3"
      }
    >
      {markerLegend(colorblind).map((m) => (
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
  // The primer is one of the surfaces the arrival budget folds. It used to
  // raise itself once per version out of localStorage — which is how a first
  // look at the city became one more card in a pile of thirteen. It now comes
  // back from the dock's "First look" row and is dismissed like before.
  const visible = useStore((s) => s.showPrimer);
  const setVisible = useStore((s) => s.setShowPrimer);
  // Start collapsed: the first look at the city belongs to the city. The
  // strip names what is on offer and stays out of the frame; the four steps
  // and the 13-row marker legend are one click away, never in the way.
  const [expanded, setExpanded] = useState(false);
  // The marker legend is opt-in detail (progressive disclosure), never a wall.
  const [primerOpen, setPrimerOpen] = useState(false);

  const dismiss = useCallback((): void => {
    setVisible(false);
    setExpanded(false);
  }, [setVisible]);

  useEffect(() => {
    if (focusPath.length > 0) dismiss();
  }, [focusPath.length, dismiss]);

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

  /* One <details>: the summary is the one-line offer that rests over the city,
   * the card is its content. Collapsed content is out of the picture but stays
   * in the document — the same disclosure the scan settings already use, and
   * no second state to keep in sync. */
  return (
    <details
      className="city-coach start-coach"
      role="region"
      aria-label={t(lang, "coach.regionAria")}
      open={expanded}
      onToggle={(e) => setExpanded(e.currentTarget.open)}
    >
      <summary className="start-coach-strip">
        <span className="start-coach-glyph" aria-hidden="true">
          ⌂
        </span>
        <span className="start-coach-strip-text">{t(lang, "coach.title")}</span>
        <span className="start-coach-strip-hint">{ts(lang, "coach.expand")}</span>
      </summary>
      <button
        onClick={dismiss}
        className="start-coach-close"
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
      <div className="start-coach-card">
        <div className="start-coach-hints">
          {HINTS.map((hint) => (
            <div key={hint.icon} className="start-coach-hint">
              <span className="start-coach-icon" aria-hidden="true">
                {hint.icon}
              </span>
              <span className="start-coach-hint-body">
                <span className="start-coach-hint-title">{t(lang, hint.text)}</span>
                <span className="start-coach-hint-detail">{t(lang, hint.detail)}</span>
              </span>
            </div>
          ))}
        </div>
        <button
          onClick={() => setPrimerOpen((open) => !open)}
          aria-expanded={primerOpen}
          aria-controls="coach-city-legend"
          className="start-coach-legend-toggle"
        >
          {t(lang, "coach.legendToggle")}
          <span aria-hidden>{primerOpen ? "−" : "+"}</span>
        </button>
        {primerOpen && (
          <div id="coach-city-legend" className="start-coach-legend">
            <MarkerLegend columns={1} />
          </div>
        )}
      </div>
    </details>
  );
}
