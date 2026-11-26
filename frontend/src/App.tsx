import { useState, useEffect, useMemo, useRef, useCallback, lazy, Suspense } from "react";
import { ModeSelect } from "./forge/ui/ModeSelect";
import { useForgeStore } from "./forge/store";
import { forgeText } from "./forge/i18n";

const ForgeApp = lazy(() =>
  import("./forge/ForgeApp").then((module) => ({ default: module.ForgeApp })),
);

import { ModeBar } from "./components/ModeBar";
import { Landing } from "./components/Landing";
import { InfoPanel } from "./components/InfoPanel";
import { SearchBar, openSearch } from "./components/SearchBar";
import { KeyboardHints } from "./components/KeyboardHints";
import { LoadingScreen } from "./components/LoadingScreen";
import { Tooltip } from "./components/Tooltip";
import { ScanSummary } from "./components/ScanSummary";
import { Minimap } from "./components/Minimap";
import { HudOverlay } from "./components/HudOverlay";
import { Breadcrumbs } from "./components/Breadcrumbs";
import { SecurityTour } from "./components/SecurityTour";
import { TriageAnnouncer } from "./components/TriageAnnouncer";
import { TeachBoardsReading } from "./components/TeachBoardsReading";
import { CoachMarks } from "./components/CoachMarks";
import { ActionBar } from "./components/ActionBar";
import { ResidentCard } from "./components/ResidentCard";

import { ShareStudio } from "./components/ShareStudio";
import { TimeMachine } from "./components/TimeMachine";
import { ContextCard } from "./components/ContextCard";
import { LiveBridge } from "./live/LiveBridge";
import { PrefsNote } from "./components/PrefsNote";
import { SurfaceBoundary, SurfaceFailed } from "./components/SurfaceBoundary";
import { useGlassStage } from "./render/useGlassStage";
import { FindingsPanel } from "./components/FindingsPanel";
import { ChallengePanel } from "./components/ChallengePanel";
import { HeatmapToggle } from "./components/HeatmapToggle";
import { HelpTipProvider } from "./components/HelpTipProvider";
import { useStore } from "./stores";
import { t } from "./i18n";
import { getDirLayout } from "./city/layout";
import { useLodLevel } from "./hooks/useLodLevel";
import type { CityData } from "./city/types";
import { currentVisit } from "./urlState";
import { fetchHostedCity, isHostedDemo } from "./demo/hosted";

/**
 * The whole 3D world lives in `components/WorldCanvas.tsx` and arrives as a
 * background chunk: the chrome of the start screen paints without waiting for
 * `three`, `@react-three/*` and `postprocessing` to download and parse (the
 * three-core + r3f chunks alone are ~980 KB raw / ~257 KB gzip on today's
 * build). Nothing else in this file may import from those packages —
 * `tests/world-canvas-lazy.test.tsx` keeps it that way.
 */
const WorldCanvas = lazy(() => import("./components/WorldCanvas"));
/** Same reason as WorldCanvas — and the vitrine has its own Canvas, which
 * would open a second WebGL context on the start screen for a showcase
 * behind a click (the single-context rule of Landing's start-ephe-open). */
const EphePreview = lazy(() =>
  import("./components/EphePreview").then((m) => ({ default: m.EphePreview })),
);

/**
 * Read a `409 still_analyzing` refusal (routes/still-analyzing.ts) and say
 * how long to wait before asking again — or `null` when the 409 is some other
 * truth the permalink cannot wait out. `Retry-After` is honoured when the
 * server sends it; clamped to 1–30 s so a missing or absurd header can neither
 * spin the loop nor park the user.
 */
async function stillAnalyzingWaitMs(res: Response): Promise<number | null> {
  const body = (await res.json().catch(() => null)) as { code?: unknown } | null;
  if (!body || body.code !== "still_analyzing") return null;
  const header = Number(res.headers.get("Retry-After"));
  const seconds = Number.isFinite(header) && header > 0 ? header : 5;
  return Math.min(30, Math.max(1, seconds)) * 1000;
}

export default function App() {
  const cityData = useStore((s) => s.cityData);
  const focusPath = useStore((s) => s.focusPath);
  const setCityData = useStore((s) => s.setCityData);
  const liveStatus = useStore((s) => s.live.status);
  const liveAnalysisId = useStore((s) => s.live.analysisId);
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
  const forgeMode = useForgeStore((s) => s.mode);
  // The overview's LOD tier. The bounds are the current level's own half
  // extent, so the same threshold means the same thing in a district as in the
  // root city. The LOD hook owns the hysteresis, so the flat hulls, the light
  // rig and the building materials flip on the same tier.
  const levelBounds = useMemo(
    () => (cityData ? getDirLayout(cityData, focusPath).bounds : null),
    [cityData, focusPath],
  );
  const lodLevel = useLodLevel(levelBounds ?? 100);
  const overviewLod = cityData !== null && lodLevel !== 2;
  // Native pixels in the full path, a capped 1.25 in the lite path. The
  // overview used to render at 0.6× and let the browser blow it up; that bought
  // calm but made the city and every painted plate soft on a Retina display.
  // The frame budget still governs the expensive path, and lite keeps a cap.
  const canvasDpr = gfxLite ? ([1, 1.25] as [number, number]) : ([1, 2] as [number, number]);
  // The arrival budget: which of the folded surfaces the reader has asked back.
  const showSearch = useStore((s) => s.showSearch);
  const showMinimap = useStore((s) => s.showMinimap);
  const showHeat = useStore((s) => s.showHeat);
  const showPrimer = useStore((s) => s.showPrimer);
  const showShortcuts = useStore((s) => s.showShortcuts);
  const setShowShortcuts = useStore((s) => s.setShowShortcuts);
  const cityOnly = useStore((s) => s.cityOnly);
  const setCityOnly = useStore((s) => s.setCityOnly);
  const selectedResident = useStore((s) => s.selectedResident);
  // §04.11 — the vitrine, reachable from inside the city as well as from the
  // start page, so a resident the reader already named can be restyled without
  // the card growing a second verb.
  const showEpheVitrine = useStore((s) => s.showEpheVitrine);
  const setShowEpheVitrine = useStore((s) => s.setShowEpheVitrine);

  const [apiStatus, setApiStatus] = useState<"connecting" | "live" | "demo">("connecting");
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
    // The flag belongs to the canvas this click throws away. Only a
    // `webglcontextrestored` clears it, and the unmounted canvas can never
    // send one — so it stayed set, and when the grace window closed the
    // sentence came back and tore down the healthy rebuilt canvas with it
    // (measured: the new city drew again after 235 ms and was unmounted at
    // 2500 ms; see tests/lost-context-rebuild.test.tsx). A rebuild clears it.
    useStore.getState().onContextRestored();
    setCanvasNonce((n) => n + 1);
  };
  // A failed permalink is a FACT about the load, not a translated string:
  // holding the finished sentence in state made `lang` part of `loadCity`'s
  // identity, and the permalink effect re-ran on every language switch —
  // re-fetching the SAME city through `setCityData`, the door that folds
  // every deferred surface. Measured live (drive-result.json, 2026-10-27):
  // one menu language click = 1-2 extra `GET /api/result/<id>/city` and the
  // open heat shell dropped out of the DOM (shell 1 -> 0, channel lost).
  // A language switch is a display choice, not a city visit, so the city
  // request count and the reader's open surfaces must not move with it.
  const [permalinkFailed, setPermalinkFailed] = useState(false);

  const canvasWrapperRef = useRef<HTMLDivElement | null>(null);
  const cityOnlyExitRef = useRef<HTMLButtonElement | null>(null);
  const lastEscRef = useRef(0);

  // The menu row that turns the instruments off is itself gone a moment later;
  // focus has to land on the one control that is still there, or the next Tab
  // starts from the top of a page whose controls are invisible.
  useEffect(() => {
    if (cityOnly) cityOnlyExitRef.current?.focus();
  }, [cityOnly]);
  // The glass reads the picture behind it: over a dark facade a panel thins to
  // 0,30, over the plaza it firms to 0,70 — the measured floor for the inks on
  // it. `render/backdropLuminance.ts` owns the ramp, `glas-chrome.test.ts` the
  // floor, and the hysteresis keeps a slow camera drift from breathing.
  useGlassStage(canvasWrapperRef);

  // ── City loading: only ?city=<id> permalinks auto-load. A fresh visit
  // lands on the empty world (the Landing hero), never a prebuilt city. ────
  const loadSeq = useRef(0);
  const loadCity = useCallback(
    async (cityId: string): Promise<void> => {
      // The token the rest of this app's fetches all carry (runRef in
      // useLocalAnalysis, requestRef in TimeMachine): Back/Forward can fire
      // two loads, and the older response that resolves late must not put
      // its city under the newer address — nor clear the loading screen the
      // newer fetch raised.
      const seq = ++loadSeq.current;
      setIsLoading(true);
      try {
        // `409 still_analyzing` (routes/still-analyzing.ts) is the server's
        // "come back when it is done": the scan is alive and the permalink is
        // not dead — it was opened mid-scan. The old code threw on any
        // !ok and told the user this city "may never have existed". Now: ask
        // again every Retry-After seconds, behind the loading screen (which
        // is exactly what this wait is), until the archive has the finished
        // city. Re-asking the city route rather than /api/status keeps the
        // answer atomic — no window where status says complete and the
        // derived view still refuses. The budget bounds a wedged scan: after
        // it, the honest failure below runs instead of an eternal spinner.
        let data: (CityData & { error?: string }) | undefined;
        if (isHostedDemo()) {
          const loaded = await fetchHostedCity(cityId, import.meta.env.BASE_URL);
          if (loadSeq.current !== seq) return;
          if (loaded.kind === "unsupported") {
            setApiStatus("demo");
            setPermalinkFailed(true);
            return;
          }
          data = loaded.data;
        } else {
          const deadline = Date.now() + 5 * 60_000;
          for (;;) {
            const res = await fetch(`/api/result/${encodeURIComponent(cityId)}/city`, {
              headers: { Accept: "application/json" },
            });
            if (loadSeq.current !== seq) return;
            if (res.ok) {
              data = (await res.json()) as CityData & { error?: string };
              if (loadSeq.current !== seq) return;
              break;
            }
            const waitMs = res.status === 409 ? await stillAnalyzingWaitMs(res) : null;
            if (waitMs === null || Date.now() >= deadline) throw new Error(`HTTP ${res.status}`);
            await new Promise((r) => setTimeout(r, waitMs));
            if (loadSeq.current !== seq) return;
          }
        }
        // A city with no file in it is not a city — an archived skeleton can
        // rehydrate after its files aged out. The local-scan path refuses the
        // same shape (polling.ts); a permalink must not render an empty world
        // and call it loaded.
        if (data.error || data.totalFiles === 0) {
          setApiStatus("demo");
          setPermalinkFailed(true);
          return;
        }
        setCityData(data);
        // AFTER setCityData — the store resets the review map there, and
        // setAnalysisId then loads this permalink's saved reviews on top.
        // Also registers the permalink city for SARIF export.
        setAnalysisId(cityId);
        setApiStatus(isHostedDemo() ? "demo" : "live");
      } catch {
        if (loadSeq.current !== seq) return;
        // The id resolved to nothing. Say what is true rather than guessing:
        // it may never have existed (a mistyped or stale link) or its scan may
        // have been pushed out of the last 20 completed runs. A scan still
        // running past the budget above lands here too — the wait was fair,
        // the patience is spent.
        setApiStatus("demo");
        setPermalinkFailed(true);
      } finally {
        if (loadSeq.current === seq) setIsLoading(false);
      }
    },
    // No `lang` here on purpose: see the permalinkFailed note above. A display
    // preference must not re-drive the data-loading identity.
    [setCityData, setIsLoading, setAnalysisId],
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
      if (useForgeStore.getState().mode === "build") return;
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

      if (e.key === "Escape") {
        // City only owns Escape while it stands: the header and the dock that
        // would otherwise be the way out are the surfaces it turned off.
        if (useStore.getState().cityOnly) {
          setCityOnly(false);
          canvasWrapperRef.current?.focus();
          return;
        }
        // A called resident owns the next Escape: dismiss the card and give
        // the city back before the normal panel → district → overview chain.
        if (useStore.getState().selectedResident !== null) {
          useStore.getState().selectResident(null);
          canvasWrapperRef.current?.focus();
          return;
        }
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
        // The seat first: Escape hands the aircraft back and leaves the camera
        // exactly where the flight ended. The orbit branch is one Escape later.
        if (cam.cameraMode === "pilot") {
          cam.exitPilot();
          return;
        }
        if (cam.cameraMode === "orbit") {
          cam.exitOrbit();
          return;
        }
        if (useStore.getState().showShortcuts) {
          setShowShortcuts(false);
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
        e.key.toLowerCase() === "c" &&
        !isInput &&
        !modalOpen &&
        cityData &&
        !useStore.getState().tourActive &&
        !useStore.getState().triageActive &&
        !useStore.getState().cityOnly
      ) {
        e.preventDefault();
        useStore.getState().requestResidentCall();
        return;
      }
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

      if (e.key === "?") {
        if (isInput) return;
        e.preventDefault();
        setShowShortcuts(!useStore.getState().showShortcuts);
        return;
      }

      // Cmd/Ctrl+K focuses the search input — the standard palette
      // shortcut. It deliberately fires from inside inputs too (only the
      // "/" shortcut is input-guarded), and before any other handler.
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        openSearch();
        return;
      }

      if (e.key === "/" && !isInput && cityData) {
        e.preventDefault();
        openSearch();
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
      setShowShortcuts,
      setCityOnly,
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
  const hasLiveBand = liveStatus !== "off" && !!cityData && liveAnalysisId === cityData.analysisId;

  // BUILD is a separate scene. Returning here keeps the EXPLORE scene, its
  // keyboard handler and its store untouched while the Forge is open.
  if (forgeMode === "build" && !isHostedDemo()) {
    return (
      <Suspense
        fallback={<div className="forge-mode-select">{forgeText(lang, "mode.loading")}</div>}
      >
        <ForgeApp onExit={() => useForgeStore.getState().setMode("select")} />
      </Suspense>
    );
  }

  return (
    <div
      className={`app-shell ${selectedUnit ? "has-selection" : ""} ${cityOnly ? "is-city-only" : ""} ${hasLiveBand ? "has-live-band" : ""}`}
    >
      {/* The watch loop outlives the Landing: it is started from the store,
          not from the scan hook that unmounts when the city arrives. */}
      {!isHostedDemo() && <LiveBridge />}
      {/* WCAG 2.4.1: the first tab stop is this skip link, not the 3D stage.
          sr-only hides it visually without dropping it from the tab order
          (display:none would); focus:not-sr-only pins it to the top-left with
          a high-contrast chip and ring. */}
      <a
        href="#main-content"
        className="skip-link sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3
                   focus:z-[100] focus:rounded-sm focus:px-4 focus:py-2.5 focus:font-jetbrains
                   focus:text-sm focus:bg-[#161614] focus:text-[#f2efe8]
                   focus:shadow-[0_2px_14px_rgba(0,0,0,0.65)]
                   focus:outline-solid focus:outline-2 focus:outline-[var(--accent-gold)] focus:outline-offset-2"
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
        className={`city-canvas w-full h-full${overviewLod ? " is-overview-lod" : ""}`}
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
            {/* No fallback element: while the world chunk downloads, the
              vignette and sky gradient behind this div ARE the empty world —
              the city rises into the same backdrop it always had. */}
            <Suspense fallback={null}>
              <WorldCanvas
                key={canvasNonce}
                dpr={canvasDpr}
                lite={gfxLite}
                onSceneFail={() => setSceneCrashed(true)}
              />
            </Suspense>
          </SurfaceBoundary>
        )}
        <div className="city-vignette" aria-hidden="true" />
      </div>

      {/* Landing hero — only on the empty world */}
      {!inCity && (
        <>
          {permalinkFailed && (
            <div
              role="alert"
              className="absolute top-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3
                         font-jetbrains text-[length:var(--fs-meta)] px-4 py-2.5 rounded-sm"
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
              <span>
                {t(lang, isHostedDemo() ? "app.hostedPermalinkError" : "app.permalinkError")}
              </span>
              <button
                onClick={() => setPermalinkFailed(false)}
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
              focus-visible:outline-hidden beats the global ring — the next tab
              stop draws it where the content actually is. */}
          <div id="main-content" tabIndex={-1} className="focus-visible:outline-hidden">
            {forgeMode === "select" && !isHostedDemo() ? <ModeSelect /> : <Landing />}
          </div>
        </>
      )}

      {/* Corrupt stored preferences speak for themselves, in landing and in
          city alike: the failure happened before either screen was chosen,
          and the defaults it masks run the whole visit. */}
      <PrefsNote />

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
              className={`absolute inset-0 pointer-events-none construction-ui focus-visible:outline-hidden ${
                buildPhase === "constructing" ? "construction-dim" : ""
              }`}
            >
              {buildPhase === "built" && (
                <div className="workspace-modes">
                  <ModeBar />
                </div>
              )}
              {showSearch && (
                <div className="workspace-search" id="workspace-search">
                  <SearchBar />
                </div>
              )}

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
              {/* Classroom mode: prints a scoreboard only when the scanned
                  folder carries an exercise key; silent otherwise. */}
              <ChallengePanel />
              <ScanSummary demo={apiStatus === "demo"} />
              <SecurityTour />
              <TriageAnnouncer />
              <TeachBoardsReading />
              <TimeMachine
                currentId={cityData?.analysisId ?? null}
                onOpenCity={(id) => void loadCity(id)}
              />
              <ActionBar />
              {selectedResident !== null && <ResidentCard />}
              {showEpheVitrine && (
                <Suspense fallback={null}>
                  <EphePreview lang={lang} onClose={() => setShowEpheVitrine(false)} />
                </Suspense>
              )}
              <ContextCard />
              <Minimap show={showMinimap} />
              {showPrimer && <CoachMarks />}

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

              {/* The heat channel switch and the standing `[?]` chip were two of
                  the surfaces an arrival served up unasked. Both come back from
                  a named control in the dock. */}
              {showHeat && (
                <div className="workspace-heatmap">
                  <HeatmapToggle />
                </div>
              )}
            </div>
          </div>

          <Breadcrumbs />
          <ShareStudio />
          {cityOnly && (
            <div className="city-only-exit">
              {cityData && <span className="city-only-exit-city">{cityData.repo.name}</span>}
              <button
                ref={cityOnlyExitRef}
                type="button"
                className="city-only-exit-button"
                onClick={() => {
                  setCityOnly(false);
                  canvasWrapperRef.current?.focus();
                }}
                aria-label={t(lang, "cityOnly.exitAria")}
                title={t(lang, "cityOnly.exitAria")}
              >
                <kbd aria-hidden="true">Esc</kbd>
                <span aria-hidden="true">{t(lang, "cityOnly.exit")}</span>
              </button>
            </div>
          )}
        </>
      )}

      <div id="keyboard-hints-overlay">
        <KeyboardHints isOpen={showShortcuts} onClose={() => setShowShortcuts(false)} />
      </div>

      <Tooltip />
      <HelpTipProvider />
    </div>
  );
}
