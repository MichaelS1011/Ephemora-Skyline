import { useState, useEffect, useRef, useCallback } from "react";
import { Canvas } from "@react-three/fiber";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { EffectComposer, Bloom, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { ModeBar } from "./components/ModeBar";
import { CityScene } from "./components/CityScene";
import { GfxGovernor } from "./components/GfxGovernor";
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
import { ShareStudio } from "./components/ShareStudio";
import { ShareHint } from "./share/ShareHint";
import { ContextCard } from "./components/ContextCard";
import { SceneBoundary, SurfaceBoundary, SurfaceFailed } from "./components/SurfaceBoundary";
import { FindingsPanel } from "./components/FindingsPanel";
import { HeatmapToggle } from "./components/HeatmapToggle";
import { HelpTipProvider } from "./components/HelpTipProvider";
import { useStore } from "./stores";
import { t } from "./i18n";
import { getDirLayout } from "./city/layout";
import type { CityData } from "./city/types";
import { currentVisit, writePoseParam, type CameraPose } from "./urlState";

/** How long a restored pose is held against scripted flights after it is set. */
const POSE_GRAB_MS = 320;
/** Write the camera to the address once the pilot has stopped for this long. */
const POSE_SETTLE_MS = 700;

const samePose = (a: CameraPose, b: CameraPose): boolean =>
  Math.abs(a.x - b.x) < 0.05 &&
  Math.abs(a.y - b.y) < 0.05 &&
  Math.abs(a.z - b.z) < 0.05 &&
  Math.abs(a.yaw - b.yaw) < 0.005 &&
  Math.abs(a.pitch - b.pitch) < 0.005;

const _euler = new THREE.Euler();

function poseOf(camera: THREE.Camera): CameraPose {
  _euler.setFromQuaternion(camera.quaternion, "YXZ");
  return {
    x: camera.position.x,
    y: camera.position.y,
    z: camera.position.z,
    yaw: _euler.y,
    pitch: _euler.x,
  };
}

function applyPose(camera: THREE.Camera, p: CameraPose): void {
  camera.position.set(p.x, p.y, p.z);
  camera.rotation.order = "YXZ";
  camera.rotation.set(p.pitch, p.yaw, 0);
}

/**
 * The camera end of the address.
 *
 * Lives inside the canvas because a pose is the one piece of state the store
 * only ever receives second-hand: the rig reports where it put the camera, and
 * a flight is derived from where the camera already is
 * (`approachFromCurrentDirection` keeps the viewing direction). So the address
 * can ask for a flight, but it cannot ask to be put back — that needs something
 * standing at the camera itself.
 *
 * Mount AFTER CityScene so the frame write lands after the rig's and the crane's
 * for the duration of the grab, and is the last word on the frame.
 */
function VisitCamera() {
  const { camera } = useThree();
  const poseRequest = useStore((s) => s.poseRequest);
  const buildPhase = useStore((s) => s.buildPhase);
  const cityOnScreen = useStore((s) => s.cityData !== null);
  const requestBuildSkip = useStore((s) => s.requestBuildSkip);

  const requested = useRef<CameraPose | null>(null);
  const armed = useRef<CameraPose | null>(null);
  const grabUntil = useRef(0);
  const skipped = useRef(false);
  const sample = useRef<CameraPose | null>(null);
  const settledAt = useRef(0);
  const written = useRef<CameraPose | null>(null);

  useEffect(() => {
    if (!poseRequest) return;
    requested.current = poseRequest.pose;
    armed.current = poseRequest.pose;
    grabUntil.current = Date.now() + POSE_GRAB_MS;
    skipped.current = false;
    applyPose(camera, poseRequest.pose);
    written.current = poseRequest.pose;
  }, [poseRequest, camera]);

  // A shared link opened on a city this machine has never seen plays the
  // construction cinematic AND carries a pose. The crane owns the camera for
  // the length of the build, so the returning pilot is put back a second time
  // once the city stands — otherwise the address asks for one view and the
  // screen shows the crane's. The reveal glide to the overview is not armed for
  // such a visit at all (CityScene.tsx:137); what is left to overwrite is the
  // build, and under reduced motion that glide was an instant write no skip
  // could reach: 3 of 4 reloads lost the pose, 8,577–185,254 units away.
  useEffect(() => {
    const want = requested.current;
    if (buildPhase !== "built" || !want || samePose(poseOf(camera), want)) return;
    armed.current = want;
    grabUntil.current = Date.now() + POSE_GRAB_MS;
    skipped.current = false;
  }, [buildPhase, camera]);

  useFrame(() => {
    const now = Date.now();
    // The open world's camera is not a visit. Without this gate the landing
    // page would carry a `cam=` parameter for a city that is not on screen.
    if (!cityOnScreen) {
      requested.current = null;
      armed.current = null;
      sample.current = null;
      written.current = null;
      settledAt.current = 0;
      return;
    }
    const held = armed.current;
    if (held && now < grabUntil.current) {
      applyPose(camera, held);
      // A flight scripted for this arrival (the glide out to the overview) must
      // not drag the returning pilot away. Asked from the frame, not the effect:
      // the rig clears a tween in the commit AFTER the one that armed it.
      if (!skipped.current) {
        skipped.current = true;
        requestBuildSkip();
      }
      return;
    }
    if (held) armed.current = null;

    const live = poseOf(camera);
    if (!sample.current || !samePose(live, sample.current)) {
      sample.current = live;
      settledAt.current = now;
      return;
    }
    if (
      settledAt.current > 0 &&
      now - settledAt.current >= POSE_SETTLE_MS &&
      !(written.current && samePose(live, written.current))
    ) {
      written.current = live;
      settledAt.current = 0;
      writePoseParam(live);
    }
  });

  return null;
}

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
  // The manual switch and the frame-budget governor — either one dims the
  // expensive path; only the manual one is ever persisted.
  const gfxLite = useStore((s) => s.prefs.gfxLite || s.autoGfxLite);
  const lang = useStore((s) => s.prefs.lang);

  const [apiStatus, setApiStatus] = useState<"connecting" | "live" | "demo">("connecting");
  const [showKeyboardHints, setShowKeyboardHints] = useState(false);
  // Two failure paths for the world, because there are two places it can die:
  // the DOM boundary below catches a WebGL context the machine cannot give,
  // and only a boundary INSIDE <Canvas> can see the scene graph throw. A scene
  // throw takes the canvas down and the reader gets the same sentence back.
  const [sceneCrashed, setSceneCrashed] = useState(false);
  const [canvasNonce, setCanvasNonce] = useState(0);
  // The browser can take the graphics context away without a throw — a GPU
  // reset, a driver update, a tab that sat too long in the background. The
  // store counts those so the sentence appears and the canvas gets a fresh
  // context only after the reader asks for it.
  const sceneRebuildAt = useStore((s) => s.sceneRebuildAt);
  // The store's flag falling is NOT the same as a drawing canvas: the reader
  // pressed "Draw it again", so the canvas is remounted either way and the
  // sentence has to leave.
  const [sceneRebuilding, setSceneRebuilding] = useState(false);
  const contextLost = sceneRebuildAt !== null && !sceneCrashed && !sceneRebuilding;
  const rebuildScene = (): void => {
    setSceneRebuilding(true);
    setSceneCrashed(false);
    setCanvasNonce((n) => n + 1);
  };
  const [permalinkError, setPermalinkError] = useState("");

  const canvasWrapperRef = useRef<HTMLDivElement | null>(null);
  const lastEscRef = useRef(0);

  // ── City loading: only ?city=<id> permalinks auto-load. A fresh visit
  // lands on the empty world (the Landing hero), never a prebuilt city. ────
  const loadCity = useCallback(
    async (cityId: string): Promise<void> => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/result/${encodeURIComponent(cityId)}/city`, {
          headers: { Accept: "application/json" },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as CityData;
        setCityData(data);
        // AFTER setCityData — the store resets the review map there, and
        // setAnalysisId then loads this permalink's saved reviews on top.
        // Also registers the permalink city for SARIF export.
        setAnalysisId(cityId);
        setApiStatus("live");
      } catch {
        // The id resolved to nothing. Say what is true rather than guessing:
        // it may never have existed (a mistyped or stale link) or its scan may
        // have been dropped — the store is in-memory with a 24 h ceiling.
        setApiStatus("demo");
        setPermalinkError(t(lang, "app.permalinkError"));
      } finally {
        setIsLoading(false);
      }
    },
    [setCityData, setIsLoading, setAnalysisId, lang],
  );

  useEffect(() => {
    const cityId = new URLSearchParams(window.location.search).get("city");
    if (!cityId) {
      setApiStatus("demo");
      return;
    }
    void loadCity(cityId);
  }, [loadCity]);

  // ── The history is the undo of the visit ────────────────────────────────
  // The wordmark leaves the address of the work behind as a history entry, and
  // Back has to mean what it says: the city comes back out of that address with
  // its district, its selection and its camera. No document reload — the app is
  // the only thing here that knows how to put a city on a screen.
  useEffect(() => {
    const onPopState = () => {
      const visit = currentVisit();
      const state = useStore.getState();
      if (!visit.cityId) {
        if (state.cityData) state.resetToLandingFromHistory();
        return;
      }
      if (state.cityData && state.cityData.analysisId === visit.cityId) {
        // The same city, a different moment in it: setCityData re-reads the
        // address, so the district, the selection and the pose come back too.
        state.setCityData(state.cityData);
        return;
      }
      void loadCity(visit.cityId);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [loadCity]);

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
      const modalOpen = !!document.querySelector('[aria-modal="true"], .panel-share-studio');
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

  // The new canvas reports its restore once it really draws; until then the
  // flag stays set and the fallback stays where the reader put it.
  useEffect(() => {
    if (!sceneRebuilding) return;
    const id = window.setTimeout(() => setSceneRebuilding(false), 2500);
    return () => window.clearTimeout(id);
  }, [sceneRebuilding]);
  const buildPhase = useStore((s) => s.buildPhase);

  return (
    <div className={`app-shell ${selectedUnit ? "has-selection" : ""}`}>
      {/* WCAG 2.4.1: the first tab stop is this skip link, not the 3D stage.
          sr-only hides it visually without dropping it from the tab order
          (display:none would); focus:not-sr-only pins it to the top-left with
          a high-contrast chip and ring. */}
      <a
        href="#main-content"
        className="skip-link sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3
                   focus:z-[100] focus:rounded focus:px-4 focus:py-2.5 focus:font-jetbrains
                   focus:text-sm focus:bg-[#161614] focus:text-[#f2efe8]
                   focus:shadow-[0_2px_14px_rgba(0,0,0,0.65)]
                   focus:outline focus:outline-2 focus:outline-[#e8b23c] focus:outline-offset-2"
      >
        {t(lang, "a11y.skipLink")}
      </a>

      <LoadingScreen isVisible={isLoading} />

      {/* 3D world — empty at first, city rises into it */}
      <div
        ref={canvasWrapperRef}
        tabIndex={inCity ? 0 : -1}
        aria-label={t(lang, inCity ? "city.canvasAria" : "city.canvasEmptyAria")}
        role="application"
        className="city-canvas w-full h-full"
      >
        {sceneCrashed || contextLost ? (
          <SurfaceFailed
            lang={lang}
            subject={sceneCrashed ? "surface.worldGone" : "surface.contextLost"}
            body="surface.worldBody"
            retry="surface.tryAgain"
            origin={sceneCrashed ? "scene" : "context"}
            className="surface-failed--world"
            onRetry={rebuildScene}
          />
        ) : (
          <SurfaceBoundary
            lang={lang}
            subject="surface.worldGone"
            body="surface.worldBody"
            retry="surface.tryAgain"
            origin="city"
            className="surface-failed--world"
          >
            <Canvas
              key={canvasNonce}
              camera={{ position: [0, 100, 150], fov: 52, near: 0.5, far: 1600 }}
              dpr={gfxLite ? [1, 1.25] : [1, 2]}
              gl={{ antialias: true, preserveDrawingBuffer: true }}
            >
              <SceneBoundary origin="scene" onFail={() => setSceneCrashed(true)}>
                <CityScene />
                {/* The frame budget speaks through perf.ts: struggling windows drop
              to the lite path, healthy ones take it back after the longer
              streak. A hand on the manual switch ends it for the visit. */}
                <GfxGovernor />
                {/* After CityScene on purpose: the pose of the address is the last
              word on the frame, and a scripted flight of this arrival has to
              be asked away from inside a frame, not from an effect. */}
                <VisitCamera />
              </SceneBoundary>
              {/* gfxLite skips the bloom pass entirely — the one expensive
              post-processing step — and caps the pixel ratio above.
              The ToneMapping effect is not a look choice: `<EffectComposer>`
              renders the scene with the renderer's own tone mapping turned off,
              so without it the full-quality path shows the city un-tone-mapped
              and the sky changes value with the graphics preference (measured:
              the upper band rendered 202,223,239 with the composer against
              211,219,224 without it). Same curve as the direct path, so both
              quality settings show one picture. */}
              {!gfxLite && (
                <EffectComposer enableNormalPass={false}>
                  <Bloom luminanceThreshold={0.9} intensity={0.22} mipmapBlur />
                  <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
                </EffectComposer>
              )}
            </Canvas>
          </SurfaceBoundary>
        )}
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
          {/* The skip link's landing target: a plain wrapper (no box, so the
              absolutely positioned landing shell inside keeps .app-shell as
              its containing block) that can take focus and hold the content.
              focus-visible:outline-none beats the global ring — the next tab
              stop draws it where the content actually is. */}
          <div id="main-content" tabIndex={-1} className="focus-visible:outline-none">
            <Landing />
          </div>
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
              id="main-content"
              tabIndex={-1}
              role="main"
              className={`absolute inset-0 pointer-events-none construction-ui focus-visible:outline-none ${
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

              {/* The card is the densest surface in the app and the one a
                  finding can surprise with an unexpected shape. */}
              <SurfaceBoundary
                lang={lang}
                subject="surface.cardGone"
                body="surface.cardBody"
                retry="surface.tryAgainCard"
                origin="card"
                className="panel-info panel-card"
              >
                <InfoPanel />
              </SurfaceBoundary>
              <FindingsPanel />
              <ScanSummary demo={apiStatus === "demo"} />
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
          <ShareStudio />
          {/* The one place the share feature reaches out by itself: once per city, a
              refusal that holds forever, and it walks away on its own. */}
          <ShareHint />
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
