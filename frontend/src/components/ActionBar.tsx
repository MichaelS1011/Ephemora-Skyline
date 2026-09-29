import { useState } from "react";
import { useStore } from "../stores/useStore";
import { useTestRunner } from "../hooks/useTestRunner";
import { SEVERITY_COLOR } from "../city/palette";

interface ActionButtonProps {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  title: string;
  icon: string;
  active?: boolean;
  accentColor?: string;
  danger?: boolean;
}

function ActionButton({
  onClick,
  disabled,
  label,
  title,
  icon,
  active,
  accentColor = "rgba(165,158,144,0.55)",
  danger,
}: ActionButtonProps) {
  const [hov, setHov] = useState(false);

  const borderColor = danger
    ? "rgba(255,46,77,0.5)"
    : active
      ? accentColor
      : hov
        ? "rgba(232,178,60,0.5)"
        : "rgba(150,142,128,0.35)";

  const color = danger
    ? hov
      ? "#ff6477"
      : "#ff4d5e"
    : active
      ? accentColor
      : hov
        ? "#f2d5a0"
        : "#a8a49a";

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className="font-jetbrains text-[10px] tracking-[0.12em] px-3 py-1.5 rounded-sm transition-all duration-150 disabled:opacity-35 disabled:cursor-not-allowed flex items-center gap-1.5"
      style={{
        border: `1px solid ${borderColor}`,
        color,
        background:
          hov && !disabled
            ? danger
              ? "rgba(255,46,77,0.08)"
              : "rgba(232,178,60,0.06)"
            : active
              ? `${accentColor}14`
              : "rgba(16,16,14,0.75)",
        backdropFilter: "blur(6px)",
        boxShadow: hov && !disabled ? `0 0 12px ${color}22` : "none",
      }}
    >
      <span style={{ fontSize: "0.75rem", lineHeight: 1 }}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

export function ActionBar() {
  const cityData = useStore((s) => s.cityData);
  const buildPhase = useStore((s) => s.buildPhase);
  const constructionDone = useStore((s) => s.constructionDone);
  const constructionTotal = useStore((s) => s.constructionTotal);
  const focusPath = useStore((s) => s.focusPath);
  const startTour = useStore((s) => s.startTour);
  const tourActive = useStore((s) => s.tourActive);
  const resetFocus = useStore((s) => s.resetFocus);
  const showFindings = useStore((s) => s.showFindings);
  const setShowFindings = useStore((s) => s.setShowFindings);
  const analysisId = useStore((s) => s.analysisId);
  const testRun = useStore((s) => s.testRun);
  const { runTests } = useTestRunner();
  const [copied, setCopied] = useState(false);
  const [pngSaved, setPngSaved] = useState(false);

  if (!cityData) return null;

  const findings = cityData.findingsBySeverity;
  const totalFindings = findings.P0 + findings.P1 + findings.P2;
  const constructing = buildPhase === "constructing";
  const pct = constructionTotal > 0 ? Math.round((constructionDone / constructionTotal) * 100) : 0;

  const handleShare = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };

  const handleScreenshot = (): void => {
    const canvas = document.querySelector("canvas");
    if (!canvas) return;
    try {
      const url = canvas.toDataURL("image/png");
      // Timestamp keeps repeated exports from overwriting each other
      const stamp = new Date().toISOString().slice(0, 19).replace("T", "-").replaceAll(":", "");
      const a = document.createElement("a");
      a.href = url;
      a.download = `ephemora-${cityData.repo.name}-${stamp}.png`;
      a.click();
      setPngSaved(true);
      setTimeout(() => setPngSaved(false), 1600);
    } catch {
      /* canvas export blocked */
    }
  };

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 pointer-events-auto flex flex-col items-center gap-2">
      {/* Build progress */}
      {constructing && (
        <div
          className="px-4 py-1.5 rounded-sm font-jetbrains animate-fade-up"
          style={{
            background: "rgba(18, 18, 16, 0.88)",
            border: "1px solid rgba(232,80,60,0.3)",
            backdropFilter: "blur(8px)",
          }}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center justify-between gap-4 mb-1">
            <span className="text-[10px] tracking-widest" style={{ color: "#e8503c" }}>
              ⚒ RAISING {focusPath.length > 0 ? `/${focusPath.join("/")}` : "CITY"}
            </span>
            <span className="text-[10px]" style={{ color: "#f2d5a0" }}>
              {constructionDone}/{constructionTotal}
            </span>
          </div>
          <div
            className="w-48 h-[2px] rounded-full overflow-hidden"
            style={{ background: "rgba(20,36,64,0.9)" }}
          >
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${pct}%`,
                background: "linear-gradient(90deg, #e8b23c, #e8503c)",
                boxShadow: "0 0 6px rgba(232,80,60,0.5)",
              }}
            />
          </div>
        </div>
      )}

      {/* Button row */}
      <div
        className="flex items-center gap-1.5 px-2 py-1.5 rounded-sm"
        style={{
          background: "rgba(18, 18, 16, 0.82)",
          border: "1px solid rgba(150,142,128,0.22)",
          backdropFilter: "blur(10px)",
          boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
        }}
      >
        <ActionButton
          onClick={startTour}
          disabled={tourActive || totalFindings === 0}
          label="SECURITY TOUR"
          icon="⚑"
          title={
            totalFindings === 0
              ? "No findings to tour"
              : "Fly through every security finding, most risky first (←→)"
          }
          active={tourActive}
          accentColor={SEVERITY_COLOR.P0}
        />

        <ActionButton
          onClick={() => setShowFindings(!showFindings)}
          label="FINDINGS"
          icon="⚠"
          title="Open the full findings list — every problem, grouped by file"
          active={showFindings}
          accentColor={SEVERITY_COLOR.P0}
        />

        {/* Divider */}
        <span
          style={{
            width: 1,
            height: 18,
            background: "rgba(150,142,128,0.25)",
            display: "inline-block",
          }}
        />

        <ActionButton
          onClick={resetFocus}
          label="OVERVIEW"
          icon="⌂"
          title="Back to the city overview (double-Esc)"
        />
        <ActionButton
          onClick={() => void runTests()}
          disabled={testRun.status === "installing" || testRun.status === "running" || !analysisId}
          label={
            testRun.status === "installing" || testRun.status === "running"
              ? "TESTING…"
              : testRun.status === "failed"
                ? "TESTS FAILED"
                : testRun.status === "complete"
                  ? "TESTS DONE"
                  : "RUN TESTS"
          }
          icon="▶"
          title="Run the project's own test suite (vitest/jest) on your machine — results land on the buildings"
        />
        <ActionButton
          onClick={handleScreenshot}
          label={pngSaved ? "SAVED!" : "PNG"}
          icon={pngSaved ? "✓" : "⎙"}
          title="Export the current view as a PNG image"
          active={pngSaved}
          accentColor="#29d398"
        />
        <ActionButton
          onClick={handleShare}
          disabled={!analysisId}
          label={copied ? "COPIED!" : "SHARE"}
          icon={copied ? "✓" : "⎘"}
          title={
            analysisId
              ? "Copy a permalink to this city"
              : "Permalinks need a saved scan — demo cities and unsaved views can't be shared"
          }
          active={copied}
          accentColor="#29d398"
        />
      </div>
    </div>
  );
}
