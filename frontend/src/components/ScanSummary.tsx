import { useEffect, useState } from "react";
import { useStore } from "../stores/useStore";
import { SEVERITY_COLOR } from "../city/palette";

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
            background: ["#00ff9f", "#4de3ff", "#ffd23f"][i],
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
  const clean = total === 0;
  const accent = clean ? "#29d398" : SEVERITY_COLOR.P0;

  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute top-[96px] left-1/2 z-40 pointer-events-auto animate-toast-in"
      style={{
        transform: closing ? "translateX(-50%) translateY(-6px)" : "translateX(-50%) translateY(0)",
        opacity: closing ? 0 : 1,
        transition: "opacity 0.5s ease-out, transform 0.5s ease-out",
        background: "rgba(6, 9, 20, 0.95)",
        border: `1px solid ${accent}55`,
        borderRadius: 5,
        padding: "0.55rem 0.9rem",
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
          {clean ? "✓ CLEAN CITY" : "◈ SCAN COMPLETE"}
        </span>

        {/* File count */}
        <span className="font-jetbrains text-[10px]" style={{ color: "#6b84a8" }}>
          {cityData.totalFiles.toLocaleString()} files scanned
        </span>

        {/* Severity badges */}
        {!clean && (
          <div className="flex items-center gap-1.5">
            {(["P0", "P1", "P2"] as const).map((sev) =>
              f[sev] > 0 ? (
                <span
                  key={sev}
                  className={`chip-${sev.toLowerCase()} font-jetbrains text-[9px] px-1.5 py-px rounded-sm`}
                >
                  {sev}: {f[sev]}
                </span>
              ) : null,
            )}
          </div>
        )}

        <button
          onClick={() => setVisible(false)}
          className="btn-ghost w-7 h-7 flex items-center justify-center !p-0 text-[10px]"
          aria-label="Dismiss scan summary"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
