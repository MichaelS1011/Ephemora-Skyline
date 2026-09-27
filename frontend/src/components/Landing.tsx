"use client";

import { useStore } from "../stores/useStore";
import { useLocalAnalysis } from "../hooks/useLocalAnalysis";
import { SEVERITY_COLOR } from "../city/palette";

export function Landing() {
  const cityData = useStore((s) => s.cityData);
  const isLoading = useStore((s) => s.isLoading);
  const setCityData = useStore((s) => s.setCityData);
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
  const isCollecting = state === "collecting";

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
          style={{ color: "#7f9bbf", maxWidth: 460 }}
        >
          Pick one of your local project folders — watch it rise as a living city. Folders become
          districts, files become buildings,
          <span style={{ color: "#ff2e4d" }}> red beacons</span> are security findings. Everything
          stays on your machine.
        </p>

        {/* Folder picker — the one primary action */}
        <button
          onClick={pickFolder}
          disabled={isAnalyzing}
          aria-busy={isAnalyzing}
          aria-describedby={hasError ? "landing-error" : undefined}
          className="font-jetbrains text-[13px] tracking-[0.15em] font-medium px-9 py-3.5 rounded transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
          style={{
            border: "1px solid rgba(0,255,159,0.55)",
            color: isAnalyzing ? "#00aa66" : "#00ff9f",
            background: isAnalyzing ? "rgba(0,255,159,0.04)" : "rgba(0,255,159,0.09)",
            boxShadow: isAnalyzing ? "none" : "0 0 24px rgba(0,255,159,0.18)",
          }}
        >
          {isCollecting ? (
            <span className="flex items-center gap-2.5">
              <span
                className="inline-block w-2 h-2 rounded-full animate-pulse-glow"
                style={{ background: "#00ff9f" }}
              />
              READING FOLDER…
            </span>
          ) : isAnalyzing ? (
            <span className="flex items-center gap-2.5">
              <span
                className="inline-block w-2 h-2 rounded-full animate-pulse-glow"
                style={{ background: "#00ff9f" }}
              />
              SCANNING…
            </span>
          ) : (
            "📂  PICK PROJECT FOLDER"
          )}
        </button>

        {/* Collection counter while walking the folder */}
        {isCollecting && collected.files > 0 && (
          <div
            className="mt-3 font-jetbrains text-[10px] tracking-wide"
            style={{ color: "#4d6488" }}
          >
            {collected.files} files · {(collected.bytes / 1024).toFixed(0)} KB collected
          </div>
        )}

        {/* Error */}
        {hasError && errorMessage && (
          <div
            id="landing-error"
            role="alert"
            className="mt-6 w-full px-4 py-2.5 rounded font-jetbrains text-[11px] flex items-start gap-2 animate-fade-up"
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

        {/* Progress bar — collection phase gets an indeterminate bar + cancel */}
        {isCollecting && (
          <div className="mt-8 w-full animate-fade-up">
            <div className="flex justify-between font-jetbrains text-[10px] mb-1.5">
              <span style={{ color: "#4de3ff" }}>Reading folder…</span>
              <span style={{ color: "#00ff9f" }}>
                {collected.files > 0 ? `${collected.files} files` : "…"}
              </span>
            </div>
            <div
              className="w-full h-[3px] rounded-full overflow-hidden relative"
              style={{ background: "rgba(20,32,56,0.9)" }}
            >
              <div
                className="h-full rounded-full absolute animate-pulse-glow"
                style={{
                  width: "30%",
                  background: "linear-gradient(90deg, transparent, #00d4ff, #00ff9f, transparent)",
                }}
              />
            </div>
            <div className="flex justify-end mt-2.5">
              <button
                onClick={cancel}
                className="font-jetbrains text-[10px] tracking-widest px-2 py-1 btn-danger"
              >
                CANCEL
              </button>
            </div>
          </div>
        )}
        {isAnalyzing && !isCollecting && (
          <div className="mt-8 w-full animate-fade-up">
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
