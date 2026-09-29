import { useEffect } from "react";
import { useStore } from "../stores/useStore";
import { tourStops } from "../city/layout";
import { SEVERITY_COLOR } from "../city/palette";

export function SecurityTour() {
  const tourActive = useStore((s) => s.tourActive);
  const tourIndex = useStore((s) => s.tourIndex);
  const nextTour = useStore((s) => s.nextTour);
  const prevTour = useStore((s) => s.prevTour);
  const endTour = useStore((s) => s.endTour);
  const cityData = useStore((s) => s.cityData);
  const selectedUnit = useStore((s) => s.selectedUnit);

  // Manual navigation ends the tour gracefully: if the selected building no
  // longer matches the current tour stop (user drilled in/out, clicked
  // another building, picked a search result…), a lingering HUD would point
  // at a stop the camera left long ago. Tour's own next/prev/start all
  // navigate to the stop's file synchronously, so a match here means the
  // tour itself moved — only a genuine mismatch is the user taking over.
  useEffect(() => {
    if (!tourActive || !cityData) return;
    const stops = tourStops(cityData);
    if (stops.length === 0) return;
    const expectedId = stops[Math.min(tourIndex, stops.length - 1)]!.file.id;
    if (selectedUnit?.kind !== "file" || selectedUnit.id !== expectedId) {
      endTour();
    }
  }, [tourActive, cityData, tourIndex, selectedUnit, endTour]);

  useEffect(() => {
    if (!tourActive) return;
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") return;
      if (e.key === "ArrowRight" || e.key === "Enter") nextTour();
      if (e.key === "ArrowLeft") prevTour();
      if (e.key === "Escape") {
        // Capture phase + stopImmediatePropagation: the tour owns Escape
        // exclusively — bubble listeners (app-level deselect/drillOut) must
        // never see it, regardless of listener registration order
        e.stopImmediatePropagation();
        endTour();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [tourActive, nextTour, prevTour, endTour]);

  if (!tourActive || !cityData) return null;

  const stops = tourStops(cityData);
  if (stops.length === 0) return null;

  const idx = Math.min(tourIndex, stops.length - 1);
  const stop = stops[idx]!;
  const worst = stop.file.findings[0];
  const color = worst ? SEVERITY_COLOR[worst.severity] : "#ff2e4d";
  const pct = Math.round(((idx + 1) / stops.length) * 100);

  return (
    <div
      className="absolute bottom-16 left-1/2 -translate-x-1/2 z-40 pointer-events-auto animate-toast-in"
      style={{
        background: "rgba(18, 18, 16, 0.95)",
        border: `1px solid ${color}66`,
        borderRadius: 5,
        padding: "0.75rem 1rem",
        boxShadow: `0 0 28px ${color}33, 0 8px 24px rgba(0,0,0,0.5)`,
        minWidth: 400,
        maxWidth: "92vw",
        backdropFilter: "blur(14px)",
      }}
      role="region"
      aria-label="Security tour"
    >
      {/* WCAG 4.1.3: announce each tour-step change to screen readers. The
          visible step count below is not aria-live, so SR users would miss it. */}
      <span className="sr-only" role="status" aria-live="polite">
        Step {idx + 1} of {stops.length}: {stop.file.name}
      </span>
      {/* Progress bar */}
      <div
        className="w-full h-[2px] rounded-full overflow-hidden mb-2.5"
        style={{ background: "rgba(30,45,72,0.9)" }}
      >
        <div
          className="h-full rounded-full transition-all duration-400"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${color}88, ${color})`,
            boxShadow: `0 0 6px ${color}88`,
          }}
        />
      </div>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* Label */}
          <div className="font-jetbrains text-[9px] tracking-widest mb-0.5" style={{ color }}>
            ⚑ SECURITY TOUR · {idx + 1} of {stops.length}
          </div>

          {/* File */}
          <div
            className="font-jetbrains text-[11px] font-medium truncate mt-0.5"
            style={{ color: "#e8f0ff" }}
            title={stop.file.path}
          >
            {stop.file.name}
            <span className="font-normal" style={{ color: "#5a7090" }}>
              {" "}
              — {stop.file.path}
            </span>
          </div>

          {/* Worst finding preview */}
          {worst && (
            <div className="font-jetbrains text-[10px] mt-1" style={{ color: "#a8a49a" }}>
              <span style={{ color, fontWeight: 600 }}>{worst.severity}</span>
              {" · "}
              <span>{worst.type}</span>
              <span style={{ color: "var(--meta-strong)" }}> · line {worst.line}</span>
            </div>
          )}

          {/* Fix preview */}
          {worst?.fix && (
            <div
              className="font-jetbrains text-[9px] mt-1.5 px-2 py-1 rounded-sm truncate"
              style={{
                color: "#29d398",
                background: "rgba(41,211,152,0.07)",
                border: "1px solid rgba(41,211,152,0.15)",
              }}
            >
              ✓ {worst.fix}
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={prevTour}
            disabled={idx === 0}
            className="font-jetbrains text-[10px] w-7 h-7 flex items-center justify-center rounded-sm transition-all duration-150 disabled:opacity-25"
            style={{ border: "1px solid rgba(150,142,128,0.4)", color: "#a8a49a" }}
            aria-label="Previous finding"
          >
            ←
          </button>
          <button
            onClick={nextTour}
            disabled={idx >= stops.length - 1}
            className="font-jetbrains text-[10px] px-3 py-1 rounded-sm transition-all duration-150 disabled:opacity-25"
            style={{ border: `1px solid ${color}`, color, background: `${color}14` }}
            aria-label="Next finding"
          >
            →
          </button>
          <button
            onClick={endTour}
            className="btn-danger font-jetbrains text-[10px] px-2 py-1 rounded-sm"
            aria-label="Exit tour"
          >
            EXIT
          </button>
        </div>
      </div>

      <div className="font-jetbrains text-[9px] mt-2" style={{ color: "var(--meta-faint)" }}>
        ← → navigate · Enter next · Esc exit
      </div>
    </div>
  );
}
