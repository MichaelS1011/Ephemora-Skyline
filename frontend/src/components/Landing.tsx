import { useStore } from "../stores/useStore";
import { useLocalAnalysis } from "../hooks/useLocalAnalysis";
import { ProfileChips } from "./ProfileChips";
import { SEVERITY_COLOR } from "../city/palette";

/** Corporate brand tokens (EPHEMORA. wordmark) */
export const BRAND = {
  ink: "#F2EFE8",
  red: "#E8503C",
  bg: "#161614",
  panel: "#1C1C1A",
};

/** The EPHEMORA. wordmark — cream letters, red dot. */
export function BrandWordmark({ scale = 1 }: { scale?: number }) {
  return (
    <span
      className="font-jetbrains font-bold inline-flex items-baseline"
      style={{ fontSize: `${scale * 15}px`, letterSpacing: "0.08em", color: BRAND.ink }}
    >
      EPHEMORA
      <span
        aria-hidden="true"
        style={{
          color: BRAND.red,
          marginLeft: scale * 2,
          fontSize: `${scale * 17}px`,
          lineHeight: 1,
        }}
      >
        .
      </span>
    </span>
  );
}

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
  const red = BRAND.red;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-auto overflow-hidden">
      {/* Ambient grid background — faint cream on charcoal */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(242,239,232,0.035) 1px, transparent 1px)," +
            "linear-gradient(90deg, rgba(242,239,232,0.035) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage: "radial-gradient(ellipse 80% 70% at 50% 50%, black 30%, transparent 100%)",
        }}
      />

      {/* Radial red glow behind the card */}
      <div
        aria-hidden="true"
        className="absolute pointer-events-none"
        style={{
          width: 640,
          height: 640,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${red}12 0%, transparent 70%)`,
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
        {/* Logo mark — the brand dot */}
        <div
          className="w-16 h-16 flex items-center justify-center font-jetbrains text-2xl font-bold mb-6"
          style={{
            border: `1px solid rgba(242,239,232,0.18)`,
            color: BRAND.ink,
            background: "rgba(242,239,232,0.03)",
            borderRadius: 4,
            letterSpacing: "0.02em",
          }}
          aria-hidden="true"
        >
          E<span style={{ color: red }}>.</span>
        </div>

        {/* Title — EPHEMORA in cream with the red dot, SKYLINE in brand red (padding balances trailing tracking) */}
        <h1
          className="font-jetbrains text-3xl font-bold tracking-[0.22em] mb-1"
          style={{ color: BRAND.ink, paddingLeft: "0.22em" }}
        >
          EPHEMORA<span style={{ color: red }}>.</span>
        </h1>
        <p
          className="font-jetbrains text-[11px] tracking-[0.5em] mb-6 font-medium"
          style={{ color: red, textShadow: `0 0 14px ${red}66`, paddingLeft: "0.5em" }}
        >
          SKYLINE
        </p>

        <p
          className="font-jetbrains text-[13px] mb-9 leading-relaxed"
          style={{ color: "var(--meta)", maxWidth: 460 }}
        >
          Pick one of your local project folders — watch it rise as a living city. Folders become
          districts, files become buildings,
          <span style={{ color: red }}> red beacons</span> are security findings. Everything stays
          on your machine.
        </p>

        {/* Scan profile — opt-in layer below the fold, never a gate */}
        <ProfileChips variant="landing" />

        {/* Folder picker — the one primary action: solid vermilion, the strongest element on the page */}
        <button
          onClick={pickFolder}
          disabled={isAnalyzing}
          aria-busy={isAnalyzing}
          aria-describedby={hasError ? "landing-error" : undefined}
          className="font-jetbrains text-[13px] tracking-[0.15em] font-semibold px-9 py-3.5 rounded transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
          style={{
            border: `1px solid ${isAnalyzing ? `${red}55` : red}`,
            color: isAnalyzing ? "var(--meta-strong)" : "#161614",
            background: isAnalyzing ? "rgba(232, 80, 60, 0.1)" : red,
            boxShadow: isAnalyzing ? "none" : `0 0 28px ${red}40, 0 4px 16px rgba(0, 0, 0, 0.4)`,
          }}
          onMouseEnter={(e) => {
            if (isAnalyzing) return;
            e.currentTarget.style.background = "#f05a45";
            e.currentTarget.style.boxShadow = `0 0 36px ${red}59, 0 4px 16px rgba(0, 0, 0, 0.4)`;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = red;
            e.currentTarget.style.boxShadow = `0 0 28px ${red}40, 0 4px 16px rgba(0, 0, 0, 0.4)`;
          }}
        >
          {isCollecting ? (
            <span className="flex items-center gap-2.5">
              <span
                className="inline-block w-2 h-2 rounded-full animate-pulse-glow"
                style={{ background: red }}
              />
              READING FOLDER…
            </span>
          ) : isAnalyzing ? (
            <span className="flex items-center gap-2.5">
              <span
                className="inline-block w-2 h-2 rounded-full animate-pulse-glow"
                style={{ background: red }}
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
            style={{ color: "var(--meta-strong)" }}
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
              <span style={{ color: BRAND.ink }}>Reading folder…</span>
              <span style={{ color: red }}>
                {collected.files > 0 ? `${collected.files} files` : "…"}
              </span>
            </div>
            <div
              className="w-full h-[3px] rounded-full overflow-hidden relative"
              style={{ background: "rgba(242,239,232,0.08)" }}
            >
              <div
                className="h-full rounded-full absolute animate-pulse-glow"
                style={{
                  width: "30%",
                  background: `linear-gradient(90deg, transparent, ${red}, transparent)`,
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
              <span style={{ color: "#8f8b82" }}>{analysisStage || "PREPARING SITE…"}</span>
              <span style={{ color: red }}>{analysisProgress}%</span>
            </div>
            <div
              className="w-full h-[3px] rounded-full overflow-hidden"
              role="progressbar"
              aria-valuenow={analysisProgress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Analysis progress: ${analysisProgress}%`}
              style={{ background: "rgba(242,239,232,0.08)" }}
            >
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${analysisProgress}%`,
                  background: `linear-gradient(90deg, ${red}88, ${red})`,
                  boxShadow: `0 0 10px ${red}99`,
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
                      background: red,
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
            style={{ color: BRAND.ink, textShadow: `0 0 12px ${red}55` }}
          >
            ✓ SURVEY COMPLETE — raising the city…
          </div>
        )}

        {/* Demo link */}
        {!isAnalyzing && state !== "success" && (
          <button
            onClick={loadDemo}
            className="mt-8 font-jetbrains text-[11px] tracking-wide transition-colors duration-150"
            style={{ color: "var(--meta)" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#c9c4b8")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--meta)")}
          >
            or explore a demo city first →
          </button>
        )}
      </div>

      {/* Corner watermark — the company logo, bottom right */}
      <div
        aria-hidden="true"
        className="absolute bottom-5 right-6 pointer-events-none select-none opacity-90"
      >
        <BrandWordmark scale={1.2} />
      </div>
    </div>
  );
}
