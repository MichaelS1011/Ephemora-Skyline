import { useEffect, useState } from "react";
import { useStore } from "../stores/useStore";
import { SEVERITY_COLOR } from "../city/palette";
import { describeGitignoreSkips, scanVerdict } from "../city/provenance";
import { t } from "../i18n";

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
  const lang = useStore((s) => s.prefs.lang);
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
  // The scan is only complete for what the project itself called source.
  // Say what the .gitignore kept out while the user is still reading this.
  const skipped = describeGitignoreSkips(cityData.skippedByGitignore, lang);
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
      ? t(lang, "summary.allClear")
      : verdict.kind === "shallow"
        ? t(lang, "summary.noFindingsMissing", { missing: verdict.missing.join(", ") })
        : verdict.kind === "unknown"
          ? t(lang, "summary.depthUnknown")
          : t(lang, "summary.complete");

  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute top-[96px] inset-x-0 z-40 flex justify-center pointer-events-none animate-toast-rise"
      style={{
        opacity: closing ? 0 : 1,
        transform: closing ? "translateY(-6px)" : "translateY(0)",
        transition: "opacity 0.5s ease-out, transform 0.5s ease-out",
      }}
    >
      <div
        className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1"
        style={{
          width: "fit-content",
          maxWidth: "calc(100% - 28px)",
          background: "rgba(18, 18, 16, 0.95)",
          border: `1px solid ${accent}55`,
          borderRadius: 4,
          padding: "0.5rem 1rem",
          boxShadow: `0 0 24px ${accent}22, 0 6px 20px rgba(0,0,0,0.45)`,
          backdropFilter: "blur(12px)",
        }}
      >
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
          {t(lang, "summary.filesAnalyzed", { count: cityData.totalFiles.toLocaleString() })}
        </span>

        {/* What the project's own .gitignore kept out — "complete" is only
            complete for the files that were allowed in. */}
        {skipped !== "" && (
          <span
            title={t(lang, "ctx.keptOutTip")}
            className="font-jetbrains text-[11px]"
            style={{ color: "#8f8b82" }}
          >
            {t(lang, "ctx.keptOut", { skipped })}
          </span>
        )}

        {/* Severity badges */}
        {total > 0 && (
          <div className="flex items-center gap-1.5">
            {(
              [
                { sev: "P0", key: "hud.sevCritical" },
                { sev: "P1", key: "hud.sevHigh" },
                { sev: "P2", key: "hud.sevMedium" },
              ] as const
            ).map(({ sev, key }) =>
              f[sev] > 0 ? (
                <span
                  key={sev}
                  title={t(lang, "summary.sevRisk", { label: t(lang, key) })}
                  className={`chip-${sev.toLowerCase()} font-jetbrains text-[11px] px-1.5 py-px rounded`}
                >
                  {t(lang, key)}: {f[sev]}
                </span>
              ) : null,
            )}
          </div>
        )}

        <button
          onClick={() => setVisible(false)}
          className="btn-ghost w-7 h-7 flex items-center justify-center !p-0 text-[11px] pointer-events-auto"
          aria-label={t(lang, "summary.dismissAria")}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
