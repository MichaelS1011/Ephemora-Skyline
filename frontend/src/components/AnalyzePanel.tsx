import { useEffect, useRef, useState } from "react";
import { useLocalAnalysis } from "../hooks/useLocalAnalysis";
import { ProfileChips } from "./ProfileChips";
import { ScanExcludes } from "./ScanExcludes";
import { useStore } from "../stores/useStore";
import { progressLine } from "../config/scanStages";
import { formatDecimal, t } from "../i18n";

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
        {/* The server names its stages in English; `progressLine` answers with
            the dictionary, and with "analysis running" for a stage nobody
            mapped — never with the raw string in a German wait screen. */}
        <span className="font-mono text-[length:var(--fs-meta)] text-[color:var(--accent-gold)] tracking-widest analyze-stage">
          {progressLine(lang, stage) || t(lang, "analyze.initializing")}
        </span>
        <span className="font-mono text-[length:var(--fs-meta)] text-[#e8503c] ml-2 shrink-0">
          {progress}%
        </span>
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const {
    state,
    notice,
    errorMessage,
    analysisProgress,
    analysisStage,
    collected,
    pickFolder,
    openAlternativePicker,
    canUseAlternativePicker,
    cancel,
    isPicking,
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

  // Focus follows the surface a keyboard user just opened, and returns to its
  // trigger when it closes. The popover stays non-modal on purpose: the city,
  // the filters and the dock all remain usable while a scan runs behind it, so
  // a focus trap would fence in a screen that is not a mode.
  const everOpened = useRef(false);
  useEffect(() => {
    if (isOpen) {
      everOpened.current = true;
      popoverRef.current?.querySelector<HTMLElement>("button, input")?.focus({
        preventScroll: true,
      });
    } else if (everOpened.current) {
      triggerRef.current?.focus({ preventScroll: true });
    }
  }, [isOpen]);

  const borderColor =
    state === "error" ? "#ff0044" : state === "success" ? "#e8503c" : "var(--accent-gold)";

  return (
    <div className={`analyze-control relative ${className}`}>
      <button
        ref={triggerRef}
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
          ref={popoverRef}
          id="analyze-panel"
          role="dialog"
          aria-label={t(lang, "analyze.dialogAria")}
          className="analyze-popover absolute top-full right-0 mt-2 w-80 z-50 panel-card"
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
          <div className="font-mono text-xs text-[color:var(--accent-gold)] tracking-widest mb-3 flex items-center gap-2">
            <span>◈</span>
            <span>{t(lang, "analyze.header")}</span>
          </div>

          <ProfileChips variant="analyze-panel" />

          <ScanExcludes lang={lang} />

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
            {isPicking ? (
              <span className="flex items-center justify-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-[var(--accent-gold)] animate-pulse" />
                {t(lang, "picker.waiting")}
              </span>
            ) : state === "collecting" ? (
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

          {isPicking && (
            <div className="mt-2">
              <p
                id="analyze-picker-status"
                role="status"
                aria-live="polite"
                className="font-mono text-[length:var(--fs-meta)] text-[color:var(--meta-strong)] text-center"
              >
                {notice || t(lang, "picker.waiting")}
              </p>
              {/* The native dialog stays open as long as the person uses it; this
                  is the way out for the one who is waiting, and it opens only on
                  their own click. */}
              {canUseAlternativePicker && (
                <button
                  type="button"
                  onClick={openAlternativePicker}
                  aria-describedby="analyze-picker-status"
                  className="w-full mt-2 py-1 rounded-sm font-mono text-[length:var(--fs-meta)] tracking-widest border border-[var(--accent-gold)]
                             text-[color:var(--accent-gold)] bg-transparent hover:bg-[rgba(232,178,60,0.08)] transition-all duration-150"
                >
                  {t(lang, "picker.alternative")}
                </button>
              )}
            </div>
          )}

          {state === "collecting" && collected.files > 0 && (
            <div className="mt-2 font-mono text-[length:var(--fs-meta)] text-[color:var(--meta-strong)] text-center">
              {t(lang, "analyze.filesBytes", {
                files: collected.files,
                kb: formatDecimal(lang, collected.bytes / 1024, 0),
              })}
            </div>
          )}

          {state === "error" && errorMessage && (
            <div
              id="analyze-error"
              role="alert"
              aria-live="assertive"
              className="mt-3 px-2 py-1.5 border border-[#ff0044] rounded font-mono text-[length:var(--fs-meta)] text-[#ff6688]"
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
              className="mt-3 px-2 py-1.5 border border-[#e8503c] rounded font-mono text-[length:var(--fs-meta)] text-[#e8503c]"
              style={{ background: "rgba(232,80,60,0.08)" }}
            >
              {t(lang, "analyze.success")}
            </div>
          )}
          {isAnalyzing && (
            <button
              onClick={cancel}
              className="w-full mt-2 py-1 rounded-sm font-mono text-[length:var(--fs-meta)] tracking-widest border border-[#ff0044]
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
