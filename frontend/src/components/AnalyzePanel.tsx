"use client";

import { useState } from "react";
import { useLocalAnalysis } from "../hooks/useLocalAnalysis";

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
        <span className="font-mono text-[10px] text-[#00d4ff] tracking-widest truncate max-w-[200px]">
          {stage || "INITIALIZING..."}
        </span>
        <span className="font-mono text-[10px] text-[#00ff9f] ml-2 shrink-0">{progress}%</span>
      </div>
      <div className="w-full h-[3px] bg-[#0a0a1a] border border-[#1a2a3a] rounded-sm overflow-hidden">
        <div
          className="h-full bg-[#00ff9f] transition-all duration-300 ease-out relative"
          style={{ width: `${progress}%` }}
        >
          <div
            className="absolute right-0 top-0 h-full w-4 opacity-80"
            style={{
              background: "linear-gradient(to right, transparent, #00ff9f)",
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

  const borderColor = state === "error" ? "#ff0044" : state === "success" ? "#00ff9f" : "#00d4ff";

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        aria-controls="analyze-panel"
        aria-label="Toggle analyze panel"
        className="font-mono text-xs px-3 py-1.5 border transition-all duration-150
                   bg-[rgba(5,8,20,0.85)] hover:bg-[rgba(0,212,255,0.1)]
                   focus:outline-none focus:ring-2 focus:ring-[#00d4ff] focus:ring-offset-1 focus:ring-offset-transparent"
        style={{ borderColor, color: borderColor }}
      >
        {isOpen ? "▲ ANALYZE" : "▼ ANALYZE"}
      </button>

      {isOpen && (
        <div
          id="analyze-panel"
          role="dialog"
          aria-label="Folder analyze panel"
          className="absolute top-full right-0 mt-2 w-80 z-30"
          style={{
            background: "rgba(5, 8, 20, 0.96)",
            border: `1px solid ${borderColor}`,
            borderRadius: "4px",
            padding: "1rem",
            boxShadow: `0 0 20px ${borderColor}33`,
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setIsOpen(false);
          }}
        >
          <div className="font-mono text-xs text-[#00d4ff] tracking-widest mb-3 flex items-center gap-2">
            <span>◈</span>
            <span>BUILD ANOTHER CITY</span>
          </div>

          <button
            onClick={pickFolder}
            disabled={isAnalyzing}
            aria-busy={isAnalyzing}
            aria-label={isAnalyzing ? "Analysis in progress" : "Pick a local project folder"}
            className="w-full py-2 font-mono text-xs tracking-widest border transition-all duration-150
                       focus:outline-none focus:ring-2 focus:ring-[#00ff9f] focus:ring-offset-1 focus:ring-offset-transparent
                       disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: isAnalyzing ? "rgba(0,255,159,0.05)" : "rgba(0,255,159,0.1)",
              borderColor: isAnalyzing ? "#00aa66" : "#00ff9f",
              color: isAnalyzing ? "#00aa66" : "#00ff9f",
            }}
          >
            {state === "collecting" ? (
              <span className="flex items-center justify-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-[#00ff9f] animate-pulse" />
                READING FOLDER…
              </span>
            ) : isAnalyzing ? (
              <span className="flex items-center justify-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-[#00ff9f] animate-pulse" />
                ANALYZING...
              </span>
            ) : (
              "📂  PICK LOCAL FOLDER"
            )}
          </button>

          {state === "collecting" && collected.files > 0 && (
            <div className="mt-2 font-mono text-[10px] text-[#445566] text-center">
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
              className="mt-3 px-2 py-1.5 border border-[#00ff9f] rounded font-mono text-[10px] text-[#00ff9f]"
              style={{ background: "rgba(0,255,159,0.08)" }}
            >
              ✓ CITY BUILT — explore it below
            </div>
          )}
          {isAnalyzing && (
            <button
              onClick={cancel}
              className="w-full mt-2 py-1 font-mono text-[10px] tracking-widest border border-[#ff0044]
                         text-[#ff0044] bg-transparent hover:bg-[rgba(255,0,68,0.08)]
                         transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-[#ff0044]"
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
