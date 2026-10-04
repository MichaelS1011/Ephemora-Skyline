import { useState, useEffect, useRef, useCallback } from "react";
import { Canvas } from "@react-three/fiber";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { ModeBar } from "./components/ModeBar";
import { CityScene } from "./components/CityScene";
import { Landing } from "./components/Landing";
import { InfoPanel } from "./components/InfoPanel";
import { SearchBar } from "./components/SearchBar";
import { KeyboardHints } from "./components/KeyboardHints";
import { LoadingScreen } from "./components/LoadingScreen";
import { Tooltip } from "./components/Tooltip";
import { ScanSummary } from "./components/ScanSummary";
import { Minimap } from "./components/Minimap";
import { HudOverlay } from "./components/HudOverlay";
import { Breadcrumbs } from "./components/Breadcrumbs";
import { SecurityTour } from "./components/SecurityTour";
import { CoachMarks } from "./components/CoachMarks";
import { ActionBar } from "./components/ActionBar";
import { ContextCard } from "./components/ContextCard";
import { FindingsPanel } from "./components/FindingsPanel";
import { HeatmapToggle } from "./components/HeatmapToggle";
import { HelpTipProvider } from "./components/HelpTipProvider";
import { useStore } from "./stores";
import { t } from "./i18n";
import { getDirLayout } from "./city/layout";
import type { CityData } from "./city/types";

export default function App() {
  const cityData = useStore((s) => s.cityData);
  const setCityData = useStore((s) => s.setCityData);
  const resetFocus = useStore((s) => s.resetFocus);
  const setIsLoading = useStore((s) => s.setIsLoading);
  const selectedUnit = useStore((s) => s.selectedUnit);
  const cityLostView = useStore((s) => s.cityLostView);
  const setSelectedUnit = useStore((s) => s.setSelectedUnit);
  const navigateToFile = useStore((s) => s.navigateToFile);
  const drillOut = useStore((s) => s.drillOut);
  const setAnalysisId = useStore((s) => s.setAnalysisId);
  const gfxLite = useStore((s) => s.prefs.gfxLite);
  const lang = useStore((s) => s.prefs.lang);

  const [apiStatus, setApiStatus] = useState<"connecting" | "live" | "demo">("connecting");
  const [showKeyboardHints, setShowKeyboardHints] = useState(false);
  const [permalinkError, setPermalinkError] = useState("");

  const canvasWrapperRef = useRef<HTMLDivElement | null>(null);
  const lastEscRef = useRef(0);

  // ── City loading: only ?city=<id> permalinks auto-load. A fresh visit
  // lands on the empty world (the Landing hero), never a prebuilt city. ────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const cityId = params.get("city");
    if (!cityId) {
      setApiStatus("demo");
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    (async (): Promise<void> => {
      try {
        const res = await fetch(`/api/result/${encodeURIComponent(cityId)}/city`, {
          headers: { Accept: "application/json" },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as CityData;
        if (!cancelled) {
          setCityData(data);
          // AFTER setCityData — the store resets the review map there, and
          // setAnalysisId then loads this permalink's saved reviews on top.
          // Also registers the permalink city for SARIF export.
          setAnalysisId(cityId);
          setApiStatus("live");
        }
      } catch {
        // The id resolved to nothing. Say what is true rather than guessing:
        // it may never have existed (a mistyped or stale link) or its scan may
        // have been dropped — the store is in-memory with a 24 h ceiling.
        if (!cancelled) {
          setApiStatus("demo");
          setPermalinkError(t(lang, "app.permalinkError"));
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setCityData, setIsLoading, setAnalysisId]);

  // Status chip must tell the truth about where the city came from —
  // local scans and permalinks are live results, the demo city is not.
  // Permalink loads also register the analysis id (enables SARIF export).
  useEffect(() => {
    if (!cityData) return;
    if (cityData.repo.owner === "local") setApiStatus("live");
    else if (cityData.repo.name === "demo-city") setApiStatus("demo");
  }, [cityData]);

  // The document promised English in index.html and never revises it, so a
  // German screen keeps the wrong language for assistive technology.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  // ── Keyboard navigation ──────────────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

      if (e.key === "Escape") {
        // While the construction cinematic runs, Escape only skips it —
        // ahead of the triage/hints/tour/deselect/drill-out chain
        if (useStore.getState().buildPhase === "constructing") {
          useStore.getState().requestBuildSkip();
          return;
        }
        // While a triage runs it owns Escape: ending the queue comes before
        // the hints overlay — the finding just stays selected
        if (useStore.getState().triageActive) {
          useStore.getState().endTriage();
          return;
        }
        // Etappe L orbit semantics: while the camera circles a building,
        // Escape returns to free flight FIRST (no camera flight) — the next
        // Escape walks the regular chain below (hints, tour, deselect,
        // drill-out, overview).
        const cam = useStore.getState();
        if (cam.cameraMode === "orbit") {
          cam.exitOrbit();
          return;
        }
        if (showKeyboardHints) {
          setShowKeyboardHints(false);
          return;
        }
        // While the tour runs it owns Escape — the app-level chain (deselect,
        // drillOut, overview) must not fire on top of it
        if (useStore.getState().tourActive) {
          return;
        }
        if (selectedUnit) {
          setSelectedUnit(null);
          canvasWrapperRef.current?.focus();
          return;
        }
        // Up one level (Breadcrumbs hint) — and double-Esc at the root
        // re-frames the overview camera (ActionBar hint)
        const focusPath = useStore.getState().focusPath;
        if (focusPath.length > 0) {
          drillOut();
          canvasWrapperRef.current?.focus();
          return;
        }
        const now = Date.now();
        if (now - lastEscRef.current < 500) resetFocus();
        lastEscRef.current = now;
        return;
      }

      // Triage queue: N opens it (or steps forward while it runs), P steps
      // back. The tour owns the keyboard while it runs, and open modal
      // dialogs (keyboard hints, confirm dialogs) swallow shortcuts — no
      // triage behind them. toLowerCase() so Shift/CapsLock still work.
      const modalOpen = !!document.querySelector('[aria-modal="true"]');
      if (
        e.key.toLowerCase() === "n" &&
        !isInput &&
        !modalOpen &&
        cityData &&
        !useStore.getState().tourActive
      ) {
        e.preventDefault();
        const { triageActive, startTriage, nextTriage } = useStore.getState();
        if (triageActive) nextTriage();
        else startTriage();
        return;
      }
      if (
        e.key.toLowerCase() === "p" &&
        !isInput &&
        !modalOpen &&
        cityData &&
        !useStore.getState().tourActive &&
        useStore.getState().triageActive
      ) {
        e.preventDefault();
        useStore.getState().prevTriage();
        return;
      }

      if (e.key === "?" && !isInput) {
        e.preventDefault();
        setShowKeyboardHints((v) => !v);
        return;
      }

      // Cmd/Ctrl+K focuses the search input — the standard palette
      // shortcut. It deliberately fires from inside inputs too (only the
      // "/" shortcut is input-guarded), and before any other handler.
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        const searchInput = document.querySelector<HTMLInputElement>("input[data-search-input]");
        searchInput?.focus();
        searchInput?.select();
        return;
      }

      if (e.key === "/" && !isInput && cityData) {
        e.preventDefault();
        const searchInput = document.querySelector<HTMLInputElement>("input[data-search-input]");
        searchInput?.focus();
        return;
      }

      // Step through the buildings of the current level. `[` and `]` rather
      // than the arrow keys: the arrows now drive the camera, and a gate on
      // DOM focus would hide this behind a click nobody thinks to make.
      if (
        (e.key === "]" || e.key === "[") &&
        !isInput &&
        !modalOpen &&
        cityData &&
        !useStore.getState().tourActive
      ) {
        e.preventDefault();
        const layout = getDirLayout(cityData, useStore.getState().focusPath);
        if (layout.buildings.length === 0) return;
        const currentId = selectedUnit?.kind === "file" ? selectedUnit.id : null;
        const currentIndex = currentId
          ? layout.buildings.findIndex((b) => b.file.id === currentId)
          : -1;
        const nextIndex =
          e.key === "["
            ? currentIndex <= 0
              ? layout.buildings.length - 1
              : currentIndex - 1
            : currentIndex >= layout.buildings.length - 1
              ? 0
              : currentIndex + 1;
        const next = layout.buildings[nextIndex];
        if (next) navigateToFile(next.file.id);
      }
    },
    [
      showKeyboardHints,
      selectedUnit,
      setSelectedUnit,
      drillOut,
      resetFocus,
      cityData,
      navigateToFile,
    ],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const inCity = cityData !== null;
  const isLoading = useStore((s) => s.isLoading);
  const buildPhase = useStore((s) => s.buildPhase);

  return (
    <div className={`app-shell ${selectedUnit ? "has-selection" : ""}`}>
      <LoadingScreen isVisible={isLoading} />

      {/* 3D world — empty at first, city rises into it */}
      <div
        ref={canvasWrapperRef}
        tabIndex={inCity ? 0 : -1}
        aria-label={t(lang, inCity ? "city.canvasAria" : "city.canvasEmptyAria")}
        role="application"
        className="city-canvas w-full h-full"
      >
        <Canvas
          camera={{ position: [0, 100, 150], fov: 52, near: 0.5, far: 1600 }}
          dpr={gfxLite ? [1, 1.25] : [1, 1.75]}
          gl={{ antialias: true, preserveDrawingBuffer: true }}
        >
          <CityScene />
          {/* gfxLite skips the bloom pass entirely — the one expensive
              post-processing step — and caps the pixel ratio above. */}
          {!gfxLite && (
            <EffectComposer enableNormalPass={false}>
              <Bloom luminanceThreshold={0.9} intensity={0.22} mipmapBlur />
            </EffectComposer>
          )}
        </Canvas>
      </div>

      {/* Landing hero — only on the empty world */}
      {!inCity && (
        <>
          {permalinkError && (
            <div
              role="alert"
              className="absolute top-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3
                         font-jetbrains text-[11px] px-4 py-2.5 rounded"
              style={{
                background: "rgba(32, 16, 12, 0.92)",
                border: "1px solid rgba(255, 107, 107, 0.45)",
                color: "#ffb4b4",
                boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
                backdropFilter: "blur(10px)",
                maxWidth: 560,
                width: "calc(100% - 32px)",
              }}
            >
              <span>{permalinkError}</span>
              <button
                onClick={() => setPermalinkError("")}
                aria-label={t(lang, "app.dismissAria")}
                className="cursor-pointer shrink-0 hover:brightness-125"
                style={{ color: "#ff8f9a" }}
              >
                ✕
              </button>
            </div>
          )}
          <Landing />
        </>
      )}

      {/* ── In-city UI ──────────────────────────────────────────────────── */}
      {inCity && (
        <>
          <div className="absolute inset-0 pointer-events-none">
            {/* The build status line stays outside construction-ui so it
                remains visible while the rest of the HUD is dimmed */}
            <HudOverlay apiStatus={apiStatus} />

            <div
              className={`absolute inset-0 pointer-events-none construction-ui ${
                buildPhase === "constructing" ? "construction-dim" : ""
              }`}
            >
              {buildPhase === "built" && (
                <div className="workspace-modes">
                  <ModeBar />
                </div>
              )}
              <div className="workspace-search">
                <SearchBar />
              </div>

              <InfoPanel />
              <FindingsPanel />
              <ScanSummary />
              <SecurityTour />
              <ActionBar />
              <ContextCard />
              <Minimap show />
              <CoachMarks />

              {/* The wheel can throw the pilot past the fog ceiling in eight
                  notches, and from out there the screen is one flat colour
                  with no clue what it used to be. The way back is a
                  double-Escape inside 500 ms — nobody finds that by hand. */}
              {cityLostView && (
                <div className="camera-rescue">
                  <button
                    onClick={() => {
                      resetFocus();
                      canvasWrapperRef.current?.focus();
                    }}
                    className="rescue-button"
                  >
                    ◎ {t(lang, "city.rescueFrame")}
                  </button>
                </div>
              )}

              <div className="workspace-heatmap">
                <HeatmapToggle />
              </div>

              <div className="workspace-shortcuts">
                <button
                  onClick={() => setShowKeyboardHints((v) => !v)}
                  aria-label={t(lang, "hud.shortcutsAria")}
                  aria-expanded={showKeyboardHints}
                  aria-controls="keyboard-hints-overlay"
                  className="font-mono text-[11px] text-[color:var(--meta-strong)] hover:text-[#e8b23c] transition-colors
                             focus:outline-none focus:ring-1 focus:ring-[#e8b23c] rounded px-1 py-0.5"
                >
                  [?] {t(lang, "hud.shortcutsHint")}
                </button>
              </div>
            </div>
          </div>

          <Breadcrumbs />
        </>
      )}

      <div id="keyboard-hints-overlay">
        <KeyboardHints isOpen={showKeyboardHints} onClose={() => setShowKeyboardHints(false)} />
      </div>

      <Tooltip />
      <HelpTipProvider />
    </div>
  );
}
