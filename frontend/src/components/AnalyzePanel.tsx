import { useEffect, useState } from "react";
import { useLocalAnalysis } from "../hooks/useLocalAnalysis";
import { ProfileChips } from "./ProfileChips";
import { useStore } from "../stores/useStore";
import { t } from "../i18n";

function ProgressBar({ progress, stage }: { progress: number; stage: string }) {
  const lang = useStore((s) => s.prefs.lang);
  return (
    <div
      className="mt-3"
      role="progressbar"
      aria-valuenow={progress}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={t(lang, "analyze.progressAria", { progress })}
    >
      <div className="flex justify-between items-center mb-1">
        <span className="font-mono text-[11px] text-[#e8b23c] tracking-widest truncate max-w-[200px]">
          {stage || t(lang, "analyze.initializing")}
        </span>
        <span className="font-mono text-[11px] text-[#e8503c] ml-2 shrink-0">{progress}%</span>
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
  const lang = useStore((s) => s.prefs.lang);
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
      if (
        e.key === "Escape" &&
        !(e.target instanceof Element && e.target.closest('[aria-modal="true"]'))
      ) {
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
    <div className={`analyze-control relative ${className}`}>
      <button
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        aria-controls="analyze-panel"
        aria-label={
          isAnalyzing
            ? t(lang, "analyze.toggleAriaAnalyzing", { progress: analysisProgress })
            : t(lang, "analyze.toggleAria")
        }
        title={t(lang, "analyze.toggleTitle")}
        className="analyze-trigger"
      >
        {/* Progress leaks onto the toggle: with the panel closed the running
            analysis would otherwise be invisible to the user */}
        {isAnalyzing
          ? `${isOpen ? "▲" : "▼"} ${analysisProgress}%`
          : isOpen
            ? t(lang, "analyze.close")
            : t(lang, "analyze.open")}
      </button>

      {isOpen && (
        <div
          id="analyze-panel"
          role="dialog"
          aria-label={t(lang, "analyze.dialogAria")}
          className="analyze-popover absolute top-full right-0 mt-2 w-80 z-50"
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
            <span>{t(lang, "analyze.header")}</span>
          </div>

          <ProfileChips variant="analyze-panel" />

          <button
            onClick={pickFolder}
            disabled={isAnalyzing}
            aria-busy={isAnalyzing}
            aria-label={isAnalyzing ? t(lang, "analyze.pickAriaBusy") : t(lang, "analyze.pickAria")}
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
                {t(lang, "analyze.reading")}
              </span>
            ) : isAnalyzing ? (
              <span className="flex items-center justify-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-[#e8503c] animate-pulse" />
                {t(lang, "analyze.analyzing")}
              </span>
            ) : (
              t(lang, "landing.primary")
            )}
          </button>

          {state === "collecting" && collected.files > 0 && (
            <div className="mt-2 font-mono text-[11px] text-[color:var(--meta-strong)] text-center">
              {t(lang, "analyze.filesBytes", {
                files: collected.files,
                kb: (collected.bytes / 1024).toFixed(0),
              })}
            </div>
          )}

          {state === "error" && errorMessage && (
            <div
              id="analyze-error"
              role="alert"
              aria-live="assertive"
              className="mt-3 px-2 py-1.5 border border-[#ff0044] rounded font-mono text-[11px] text-[#ff6688]"
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
              className="mt-3 px-2 py-1.5 border border-[#e8503c] rounded font-mono text-[11px] text-[#e8503c]"
              style={{ background: "rgba(232,80,60,0.08)" }}
            >
              {t(lang, "analyze.success")}
            </div>
          )}
          {isAnalyzing && (
            <button
              onClick={cancel}
              className="w-full mt-2 py-1 rounded-sm font-mono text-[11px] tracking-widest border border-[#ff0044]
                         text-[#ff0044] bg-transparent hover:bg-[rgba(255,0,68,0.08)]
                         transition-all duration-150"
              aria-label={t(lang, "landing.cancel")}
            >
              {t(lang, "analyze.cancel")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
