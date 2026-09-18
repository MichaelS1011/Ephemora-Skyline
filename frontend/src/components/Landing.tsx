"use client";

import { useRef } from "react";
import { useStore } from "../stores/useStore";
import { useAnalysis } from "../hooks/useAnalysis";
import { SEVERITY_COLOR } from "../city/palette";

export function Landing() {
  const cityData = useStore((s) => s.cityData);
  const isLoading = useStore((s) => s.isLoading);
  const setCityData = useStore((s) => s.setCityData);
  const inputRef = useRef<HTMLInputElement>(null);
  const {
    url,
    setUrl,
    branch,
    setBranch,
    fullHistory,
    setFullHistory,
    state,
    errorMessage,
    analysisProgress,
    analysisStage,
    startAnalysis,
    cancel,
    reset,
    isAnalyzing,
  } = useAnalysis();

  if (cityData || isLoading) return null;

  const loadDemo = async (): Promise<void> => {
    try {
      const res = await fetch("/api/cities/default");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setCityData(await res.json());
    } catch {
      /* demo unavailable */
    }
  };

  const hasError = state === "error";

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-auto overflow-hidden">
      {/* Ambient grid background */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(77,227,255,0.04) 1px, transparent 1px)," +
            "linear-gradient(90deg, rgba(77,227,255,0.04) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage: "radial-gradient(ellipse 80% 70% at 50% 50%, black 30%, transparent 100%)",
        }}
      />

      {/* Radial glow behind the card */}
      <div
        aria-hidden="true"
        className="absolute pointer-events-none"
        style={{
          width: 640,
          height: 640,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(0,255,159,0.06) 0%, transparent 70%)",
          transform: "translate(-50%,-52%)",
          left: "50%",
          top: "50%",
        }}
      />

      {/* Card */}
      <div
        className="relative flex flex-col items-center text-center px-8 py-10 animate-fade-up"
        style={{ maxWidth: 580, width: "100%" }}
      >
        {/* Logo */}
        <div
          className="w-16 h-16 flex items-center justify-center font-jetbrains text-xl font-bold mb-6"
          style={{
            border: "1px solid rgba(0,255,159,0.6)",
            color: "#00ff9f",
            background: "rgba(0,255,159,0.07)",
            boxShadow: "0 0 32px rgba(0,255,159,0.22), inset 0 0 20px rgba(0,255,159,0.05)",
            borderRadius: 4,
            letterSpacing: "0.1em",
          }}
        >
          CC
        </div>

        {/* Title */}
        <h1
          className="font-jetbrains text-3xl font-bold tracking-[0.22em] mb-1"
          style={{ color: "#e8f0ff" }}
        >
          CODECITY
        </h1>
        <p
          className="font-jetbrains text-[11px] tracking-[0.5em] mb-6 font-medium"
          style={{ color: "#ff00aa", textShadow: "0 0 12px rgba(255,0,170,0.5)" }}
        >
          CYBERDEFENSE
        </p>

        <p
          className="font-jetbrains text-[13px] mb-9 leading-relaxed"
          style={{ color: "#7f9bbf", maxWidth: 440 }}
        >
          Paste a GitHub repo — watch it rise as a living city. Folders become districts, files
          become buildings,
          <span style={{ color: "#ff2e4d" }}> red beacons</span> are security findings.
        </p>

        {/* URL input row */}
        <div className="flex items-stretch gap-2 w-full mb-2.5">
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="url"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (hasError) reset();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isAnalyzing) startAnalysis();
              }}
              placeholder="https://github.com/owner/repo"
              disabled={isAnalyzing}
              aria-label="GitHub repository URL"
              aria-invalid={hasError}
              aria-describedby={hasError ? "landing-error" : undefined}
              className="w-full font-jetbrains text-[13px] px-4 py-3 rounded outline-none transition-all duration-200"
              style={{
                background: "rgba(6,10,24,0.85)",
                border: `1px solid ${hasError ? SEVERITY_COLOR.P0 : "rgba(77,227,255,0.28)"}`,
                color: "#e8f0ff",
                boxShadow: hasError ? `0 0 0 2px ${SEVERITY_COLOR.P0}22` : "none",
                backdropFilter: "blur(8px)",
              }}
              onFocus={(e) => {
                if (!hasError) e.currentTarget.style.borderColor = "rgba(77,227,255,0.6)";
                e.currentTarget.style.boxShadow = "0 0 0 2px rgba(77,227,255,0.1)";
              }}
              onBlur={(e) => {
                if (!hasError) {
                  e.currentTarget.style.borderColor = "rgba(77,227,255,0.28)";
                  e.currentTarget.style.boxShadow = "none";
                }
              }}
            />
          </div>

          <button
            onClick={startAnalysis}
            disabled={isAnalyzing}
            aria-busy={isAnalyzing}
            className="font-jetbrains text-[13px] tracking-[0.15em] font-medium px-7 rounded transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
            style={{
              border: "1px solid rgba(0,255,159,0.55)",
              color: isAnalyzing ? "#00aa66" : "#00ff9f",
              background: isAnalyzing ? "rgba(0,255,159,0.04)" : "rgba(0,255,159,0.09)",
              boxShadow: isAnalyzing ? "none" : "0 0 20px rgba(0,255,159,0.15)",
            }}
          >
            {isAnalyzing ? (
              <span className="flex items-center gap-2.5">
                <span
                  className="inline-block w-2 h-2 rounded-full animate-pulse-glow"
                  style={{ background: "#00ff9f" }}
                />
                BUILDING…
              </span>
            ) : (
              "BUILD CITY"
            )}
          </button>
        </div>

        {/* Branch — only visible when URL has been typed */}
        {url.length > 0 && !isAnalyzing && (
          <input
            type="text"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            placeholder="branch  (default: main)"
            aria-label="Branch"
            className="w-full font-jetbrains text-[11px] text-center px-3 py-1.5 rounded outline-none transition-all duration-150 mb-1"
            style={{
              background: "rgba(6,10,24,0.6)",
              border: "1px solid rgba(90,130,200,0.22)",
              color: "#aebfe0",
            }}
          />
        )}

        {/* Full-history secret scan — finds credentials deleted from HEAD */}
        {url.length > 0 && !isAnalyzing && (
          <label className="flex items-center justify-center gap-2 w-full mb-1 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={fullHistory}
              onChange={(e) => setFullHistory(e.target.checked)}
              className="accent-[#00ff9f] w-3 h-3"
            />
            <span className="font-jetbrains text-[10px]" style={{ color: "#6b84a8" }}>
              scan full git history (finds deleted secrets — slower)
            </span>
          </label>
        )}

        {/* Error */}
        {hasError && errorMessage && (
          <div
            id="landing-error"
            role="alert"
            className="mt-3 w-full px-4 py-2.5 rounded font-jetbrains text-[11px] flex items-start gap-2 animate-fade-up"
            style={{
              borderColor: SEVERITY_COLOR.P0,
              color: "#ff9aa5",
              background: "rgba(255,46,77,0.08)",
              border: `1px solid ${SEVERITY_COLOR.P0}55`,
            }}
          >
            <span style={{ color: SEVERITY_COLOR.P0, fontSize: "1rem", lineHeight: 1 }}>⚠</span>
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Progress bar */}
        {isAnalyzing && (
          <div className="mt-6 w-full animate-fade-up">
            <div className="flex justify-between font-jetbrains text-[10px] mb-1.5">
              <span style={{ color: "#4de3ff" }}>{analysisStage || "PREPARING SITE…"}</span>
              <span style={{ color: "#00ff9f" }}>{analysisProgress}%</span>
            </div>
            <div
              className="w-full h-[3px] rounded-full overflow-hidden"
              style={{ background: "rgba(20,32,56,0.9)" }}
            >
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${analysisProgress}%`,
                  background: "linear-gradient(90deg, #00d4ff, #00ff9f)",
                  boxShadow: "0 0 10px rgba(0,255,159,0.6)",
                }}
              />
            </div>
            <div className="flex justify-between items-center mt-2.5">
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="inline-block w-1 h-1 rounded-full"
                    style={{
                      background: "#00ff9f",
                      opacity: analysisProgress > i * 33 ? 1 : 0.2,
                      transition: "opacity 0.3s",
                    }}
                  />
                ))}
              </div>
              <button
                onClick={cancel}
                className="font-jetbrains text-[10px] tracking-widest px-2 py-1 btn-danger"
              >
                CANCEL
              </button>
            </div>
          </div>
        )}

        {/* Success */}
        {state === "success" && (
          <div
            className="mt-5 font-jetbrains text-[11px] tracking-widest animate-fade-up"
            style={{ color: "#00ff9f", textShadow: "0 0 12px rgba(0,255,159,0.5)" }}
          >
            ✓ SURVEY COMPLETE — raising the city…
          </div>
        )}

        {/* Demo link */}
        {!isAnalyzing && state !== "success" && (
          <button
            onClick={loadDemo}
            className="mt-8 font-jetbrains text-[11px] tracking-wide transition-colors duration-150"
            style={{ color: "#4a5e7a" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#7f9bbf")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#4a5e7a")}
          >
            or explore a demo city first →
          </button>
        )}
      </div>
    </div>
  );
}
