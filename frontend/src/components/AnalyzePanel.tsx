import { useEffect, useState } from "react";
import { useLocalAnalysis } from "../hooks/useLocalAnalysis";
import { ProfileChips } from "./ProfileChips";

function ProgressBar({ progress, stage }: { progress: number; stage: string }) {
  return (
    <div
      className="mt-3"
      role="progressbar"
      aria-valuenow={progress}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Analysis progress: ${progress}%`}
    >
      <div className="flex justify-between items-center mb-1">
        <span className="font-mono text-[10px] text-[#e8b23c] tracking-widest truncate max-w-[200px]">
          {stage || "INITIALIZING..."}
        </span>
        <span className="font-mono text-[10px] text-[#e8503c] ml-2 shrink-0">{progress}%</span>
      </div>
      <div className="w-full h-[3px] bg-[#1c1c1a] border border-[#1a2a3a] rounded-sm overflow-hidden">
        <div
          className="h-full bg-[#e8503c] transition-all duration-300 ease-out relative"
          style={{ width: `${progress}%` }}
        >
          <div
            className="absolute right-0 top-0 h-full w-4 opacity-80"
            style={{
              background: "linear-gradient(to right, transparent, #e8503c)",
              filter: "blur(2px)",
            }}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Compact in-city analyze panel: build another city without leaving the
 * current one. Pick a local folder — the same flow as the landing page.
 */
export function AnalyzePanel({ className = "" }: { className?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const {
    state,
    errorMessage,
    analysisProgress,
    analysisStage,
    collected,
    pickFolder,
    cancel,
    isAnalyzing,
  } = useLocalAnalysis();

  // Global Esc closes the dialog — the div-level onKeyDown only fires when
  // focus is inside it, which users don't expect
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [isOpen]);

  // Success speaks for itself — the new city is rising behind the dialog
  useEffect(() => {
    if (state !== "success") return;
    const t = setTimeout(() => setIsOpen(false), 1600);
    return () => clearTimeout(t);
  }, [state]);

  const borderColor = state === "error" ? "#ff0044" : state === "success" ? "#e8503c" : "#e8b23c";

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        aria-controls="analyze-panel"
        aria-label={
          isAnalyzing
            ? `Toggle analyze panel — analyzing, ${analysisProgress}% done`
            : "Toggle analyze panel"
        }
        title="Build another city: pick a local folder and scan it — the current city stays open until the new one is ready"
        className="font-mono text-xs px-3 py-1.5 rounded-sm border transition-all duration-150
                   bg-[rgba(16,16,14,0.85)] hover:bg-[rgba(232,178,60,0.1)]"
        style={{ borderColor, color: borderColor }}
      >
        {/* Progress leaks onto the toggle: with the panel closed the running
            analysis would otherwise be invisible to the user */}
        {isAnalyzing
          ? `${isOpen ? "▲" : "▼"} ${analysisProgress}%`
          : isOpen
            ? "▲ ANALYZE"
            : "▼ ANALYZE"}
      </button>

      {isOpen && (
        <div
          id="analyze-panel"
          role="dialog"
          aria-label="Folder analyze panel"
          className="absolute top-full right-0 mt-2 w-80 z-50"
          style={{
            background: "rgba(16, 16, 14, 0.96)",
            border: `1px solid ${borderColor}`,
            borderRadius: "4px",
            padding: "1rem",
            boxShadow: `0 0 20px ${borderColor}33`,
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setIsOpen(false);
          }}
        >
          <div className="font-mono text-xs text-[#e8b23c] tracking-widest mb-3 flex items-center gap-2">
            <span>◈</span>
            <span>BUILD ANOTHER CITY</span>
          </div>

          <ProfileChips variant="analyze-panel" />

          <button
            onClick={pickFolder}
            disabled={isAnalyzing}
            aria-busy={isAnalyzing}
            aria-label={isAnalyzing ? "Analysis in progress" : "Pick a local project folder"}
            className="w-full mt-2 py-2 font-mono text-xs tracking-widest rounded-sm border transition-all duration-150
                       disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: isAnalyzing ? "rgba(232,80,60,0.05)" : "rgba(232,80,60,0.1)",
              borderColor: isAnalyzing ? "#a03a2c" : "#e8503c",
              color: isAnalyzing ? "#a03a2c" : "#e8503c",
            }}
          >
            {state === "collecting" ? (
              <span className="flex items-center justify-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-[#e8503c] animate-pulse" />
                READING FOLDER…
              </span>
            ) : isAnalyzing ? (
              <span className="flex items-center justify-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-[#e8503c] animate-pulse" />
                ANALYZING...
              </span>
            ) : (
              "📂  PICK LOCAL FOLDER"
            )}
          </button>

          {state === "collecting" && collected.files > 0 && (
            <div className="mt-2 font-mono text-[10px] text-[#7d796f] text-center">
              {collected.files} files · {(collected.bytes / 1024).toFixed(0)} KB
            </div>
          )}

          {state === "error" && errorMessage && (
            <div
              id="analyze-error"
              role="alert"
              aria-live="assertive"
              className="mt-3 px-2 py-1.5 border border-[#ff0044] rounded font-mono text-[10px] text-[#ff6688]"
              style={{ background: "rgba(255,0,68,0.08)" }}
            >
              ⚠ {errorMessage}
            </div>
          )}
          {isAnalyzing && state !== "collecting" && (
            <ProgressBar progress={analysisProgress} stage={analysisStage} />
          )}
          {state === "success" && (
            <div
              role="status"
              aria-live="polite"
              className="mt-3 px-2 py-1.5 border border-[#e8503c] rounded font-mono text-[10px] text-[#e8503c]"
              style={{ background: "rgba(232,80,60,0.08)" }}
            >
              ✓ CITY BUILT — explore it below
            </div>
          )}
          {isAnalyzing && (
            <button
              onClick={cancel}
              className="w-full mt-2 py-1 rounded-sm font-mono text-[10px] tracking-widest border border-[#ff0044]
                         text-[#ff0044] bg-transparent hover:bg-[rgba(255,0,68,0.08)]
                         transition-all duration-150"
              aria-label="Cancel analysis"
            >
              CANCEL
            </button>
          )}
        </div>
      )}
    </div>
  );
}
