import { useEffect, useState } from "react";
import { useStore } from "../stores/useStore";
import { SEVERITY_COLOR } from "../city/palette";
import { scanVerdict } from "../city/provenance";

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

export function ScanSummary() {
  const analysisId = useStore((s) => s.analysisId);
  const cityData = useStore((s) => s.cityData);
  const buildPhase = useStore((s) => s.buildPhase);
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (!analysisId || !cityData || buildPhase !== "built") return;
    setVisible(true);
    setClosing(false);
    const t1 = setTimeout(() => setClosing(true), 4600);
    const t2 = setTimeout(() => setVisible(false), 5100);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [analysisId, cityData, buildPhase]);

  if (!visible || !cityData) return null;

  const f = cityData.findingsBySeverity;
  const total = f.P0 + f.P1 + f.P2;
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
      ? "✓ All clear — no issues found"
      : verdict.kind === "shallow"
        ? `◈ No findings — ${verdict.missing.join(", ")} did not run`
        : verdict.kind === "unknown"
          ? "◈ No findings — scan depth unknown"
          : "◈ Scan complete";

  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute top-[96px] left-1/2 z-40 pointer-events-none animate-toast-in"
      style={{
        transform: closing ? "translateX(-50%) translateY(-6px)" : "translateX(-50%) translateY(0)",
        opacity: closing ? 0 : 1,
        transition: "opacity 0.5s ease-out, transform 0.5s ease-out",
        background: "rgba(18, 18, 16, 0.95)",
        border: `1px solid ${accent}55`,
        borderRadius: 4,
        padding: "0.5rem 1rem",
        boxShadow: `0 0 24px ${accent}22, 0 6px 20px rgba(0,0,0,0.45)`,
        backdropFilter: "blur(12px)",
      }}
    >
      <div className="flex items-center gap-3">
        {/* Status */}
        <span
          className="flex items-center font-jetbrains text-[11px] tracking-widest font-semibold"
          style={{ color: accent }}
        >
          {clean && <ConfettiBurst />}
          {status}
        </span>

        {/* File count */}
        <span className="font-jetbrains text-[11px]" style={{ color: "#8f8b82" }}>
          {cityData.totalFiles.toLocaleString()} files analyzed
        </span>

        {/* Severity badges */}
        {total > 0 && (
          <div className="flex items-center gap-1.5">
            {(
              [
                { sev: "P0", label: "Critical" },
                { sev: "P1", label: "High" },
                { sev: "P2", label: "Medium" },
              ] as const
            ).map(({ sev, label }) =>
              f[sev] > 0 ? (
                <span
                  key={sev}
                  title={`${label} security risk`}
                  className={`chip-${sev.toLowerCase()} font-jetbrains text-[11px] px-1.5 py-px rounded`}
                >
                  {label}: {f[sev]}
                </span>
              ) : null,
            )}
          </div>
        )}

        <button
          onClick={() => setVisible(false)}
          className="btn-ghost w-7 h-7 flex items-center justify-center !p-0 text-[11px] pointer-events-auto"
          aria-label="Dismiss scan summary"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
