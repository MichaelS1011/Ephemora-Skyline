import { create } from "zustand";
import type { CityData, SelectedUnit, Severity } from "../city/types";
import { findFileById, getDirLayout, tourStops } from "../city/layout";
import { loadSavedProfile, saveProfile, type ScanProfile } from "../config/scanProfiles";

export interface FlyRequest {
  x: number;
  z: number;
  /** Camera distance from the target (world units). */
  distance: number;
  nonce: number;
}

export interface CameraInfo {
  x: number;
  z: number;
  angle: number;
  /** Camera distance to the orbit target — drives LOD transitions. */
  dist: number;
}

export type HeatChannel = "threat" | "complexity" | "churn";

export interface TestFailureInfo {
  name: string;
  message: string;
}
export interface TestFileResultInfo {
  path: string;
  status: "passed" | "failed";
  tests: number;
  failures: TestFailureInfo[];
}
export interface TestRunState {
  status: "idle" | "installing" | "running" | "complete" | "failed";
  stage: string;
}

let flyNonce = 0;

interface AppState {
  // ── City data ──────────────────────────────────────────────────────────
  cityData: CityData | null;
  /**
   * The city construction cinematic:
   * - 'empty'        → bare world, waiting for a repo link
   * - 'constructing' → streets first, then districts and buildings rise
   * - 'built'        → construction finished, city is fully interactive
   */
  buildPhase: "empty" | "constructing" | "built";
  buildStartedAt: number; // epoch ms when construction began
  buildDuration: number; // total ms of the construction sequence
  constructionTotal: number; // units to raise in the current level
  constructionDone: number;
  setCityData: (data: CityData | null) => void;
  resetToLanding: () => void;
  setBuildPhase: (phase: "empty" | "constructing" | "built") => void;
  setConstructionProgress: (done: number, total: number) => void;

  // ── Semantic zoom navigation ───────────────────────────────────────────
  focusPath: string[]; // directory names from the root, [] = overview
  selectedUnit: SelectedUnit;
  hoveredId: string | null;
  setHoveredId: (id: string | null) => void;

  /** Enter a sub-district and fly the camera to its overview. */
  drillIn: (dirName: string) => void;
  /** Leave the current district (one level up). */
  drillOut: () => void;
  /** Back to the city overview. */
  resetFocus: () => void;
  setFocusPath: (path: string[], opts?: { keepSelection?: boolean }) => void;
  setSelectedUnit: (unit: SelectedUnit) => void;

  /** Navigate to a specific file: drill into its district, select + fly. */
  navigateToFile: (fileId: string) => void;

  // ── Camera command channel ─────────────────────────────────────────────
  flyRequest: FlyRequest | null;
  requestFly: (x: number, z: number, distance?: number) => void;
  cameraInfo: CameraInfo;
  setCameraInfo: (info: CameraInfo) => void;

  // ── Filters ────────────────────────────────────────────────────────────
  threatFilter: Severity | "all";
  setThreatFilter: (f: Severity | "all") => void;

  /** What the far-zoom heat cells are colored by. */
  heatChannel: HeatChannel;
  setHeatChannel: (c: HeatChannel) => void;

  // ── Test runner ──────────────────────────────────────────────────────────
  testRun: TestRunState;
  testResults: Record<string, TestFileResultInfo>; // path → result
  setTestRun: (run: TestRunState) => void;
  setTestResults: (files: TestFileResultInfo[]) => void;

  // ── Security Tour ──────────────────────────────────────────────────────
  // ── Findings list panel ───────────────────────────────────────────────
  showFindings: boolean;
  setShowFindings: (v: boolean) => void;

  // ── Scan configuration (shared by Landing + AnalyzePanel) ─────────────
  scanProfile: ScanProfile;
  setScanProfile: (p: ScanProfile) => void;

  tourActive: boolean;
  tourIndex: number;
  startTour: () => void;
  endTour: () => void;
  nextTour: () => void;
  prevTour: () => void;

  // ── Analysis progress ──────────────────────────────────────────────────
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  analysisProgress: number;
  setAnalysisProgress: (p: number) => void;
  analysisStage: string;
  setAnalysisStage: (s: string) => void;
  analysisId: string | null;
  setAnalysisId: (id: string | null) => void;
}

/** Fly the camera to a pleasant overview of the directory at focusPath. */
function flyToDirOverview(
  set: (partial: Partial<AppState>) => void,
  city: CityData,
  focusPath: string[],
): void {
  const layout = getDirLayout(city, focusPath);
  // Frame the whole level: its footprint AND its tallest towers must fit.
  const tallest = Math.max(
    0,
    ...layout.blocks.flatMap((b) => b.skyline.map((s) => s.h)),
    ...layout.buildings.map((b) => b.h),
  );
  const dist = Math.max(layout.bounds * 1.65, tallest * 2.2 + 24);
  set({ flyRequest: { x: 0, z: 0, distance: dist, nonce: ++flyNonce } });
}

export const useStore = create<AppState>((set, get) => ({
  cityData: null,
  buildPhase: "empty",
  buildStartedAt: 0,
  buildDuration: 0,
  constructionTotal: 0,
  constructionDone: 0,
  setCityData: (data) =>
    set({
      cityData: data,
      focusPath: [],
      selectedUnit: null,
      hoveredId: null,
      // Stale view state must never leak into a new city: a P0 filter from
      // the previous repo would dim the new one with no visible indicator
      // (chips hide when a severity has 0 findings), and a running tour
      // would keep walking a city it was never started for.
      threatFilter: "all",
      tourActive: false,
      tourIndex: 0,
      testRun: { status: "idle", stage: "" },
      testResults: {},
      buildPhase: data ? "constructing" : "empty",
      buildStartedAt: data ? Date.now() : 0,
      constructionDone: 0,
      constructionTotal: 0,
    }),

  /** Tear the city down and return to the Landing screen ("start over"). */
  resetToLanding: () => {
    set({
      cityData: null,
      buildPhase: "empty",
      analysisId: null,
      isLoading: false,
      analysisProgress: 0,
      analysisStage: "",
    });
    if (typeof window !== "undefined" && window.history.replaceState) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  },
  setBuildPhase: (phase) => set({ buildPhase: phase }),
  setConstructionProgress: (done, total) =>
    set({ constructionDone: done, constructionTotal: total }),

  focusPath: [],
  selectedUnit: null,
  hoveredId: null,
  setHoveredId: (id) => set({ hoveredId: id }),

  setFocusPath: (path, opts) => {
    set({ focusPath: path, ...(opts?.keepSelection ? {} : { selectedUnit: null }) });
    const city = get().cityData;
    if (city) flyToDirOverview(set, city, path);
  },

  drillIn: (dirName) => {
    const { focusPath, cityData } = get();
    if (!cityData) return;
    const next = [...focusPath, dirName];
    set({ focusPath: next, selectedUnit: null });
    flyToDirOverview(set, cityData, next);
  },

  drillOut: () => {
    const { focusPath, cityData } = get();
    if (!cityData || focusPath.length === 0) return;
    get().setFocusPath(focusPath.slice(0, -1));
  },

  resetFocus: () => {
    const { cityData } = get();
    set({ focusPath: [], selectedUnit: null });
    if (cityData) flyToDirOverview(set, cityData, []);
  },

  setSelectedUnit: (unit) => set({ selectedUnit: unit }),

  navigateToFile: (fileId) => {
    const { cityData } = get();
    if (!cityData) return;
    const hit = findFileById(cityData, fileId);
    if (!hit) return;
    set({ focusPath: hit.chain, selectedUnit: { kind: "file", id: fileId } });
    const layout = getDirLayout(cityData, hit.chain);
    const placement = layout.buildings.find((b) => b.file.id === fileId);
    if (placement) {
      const dist = Math.max(14, placement.h * 2.6 + 12);
      set({ flyRequest: { x: placement.x, z: placement.z, distance: dist, nonce: ++flyNonce } });
    }
  },

  flyRequest: null,
  requestFly: (x, z, distance = 40) => set({ flyRequest: { x, z, distance, nonce: ++flyNonce } }),
  cameraInfo: { x: 0, z: 60, angle: 0, dist: 80 },
  setCameraInfo: (info) => set({ cameraInfo: info }),

  threatFilter: "all",
  setThreatFilter: (f) => set({ threatFilter: f }),

  heatChannel: "threat",
  setHeatChannel: (c) => set({ heatChannel: c }),

  testRun: { status: "idle", stage: "" },
  testResults: {},
  setTestRun: (run) => set({ testRun: run }),
  setTestResults: (files) =>
    set((state) => {
      const next = { ...state.testResults };
      for (const f of files) next[f.path] = f;
      return { testResults: next };
    }),

  showFindings: false,
  setShowFindings: (v) => set({ showFindings: v }),

  scanProfile: loadSavedProfile(),
  setScanProfile: (p) => {
    saveProfile(p);
    set({ scanProfile: p });
  },

  tourActive: false,
  tourIndex: 0,
  startTour: () => {
    const { cityData } = get();
    if (!cityData || tourStops(cityData).length === 0) return;
    set({ tourActive: true, tourIndex: 0 });
    const stop = tourStops(cityData)[0];
    if (stop) get().navigateToFile(stop.file.id);
  },
  endTour: () => set({ tourActive: false }),
  nextTour: () => {
    const { cityData, tourIndex } = get();
    if (!cityData) return;
    const stops = tourStops(cityData);
    if (stops.length === 0) return;
    const next = Math.min(stops.length - 1, tourIndex + 1);
    set({ tourIndex: next });
    get().navigateToFile(stops[next]!.file.id);
  },
  prevTour: () => {
    const { cityData, tourIndex } = get();
    if (!cityData) return;
    const stops = tourStops(cityData);
    if (stops.length === 0) return;
    const prev = Math.max(0, tourIndex - 1);
    set({ tourIndex: prev });
    get().navigateToFile(stops[prev]!.file.id);
  },

  isLoading: false,
  setIsLoading: (loading) => set({ isLoading: loading }),
  analysisProgress: 0,
  setAnalysisProgress: (p) => set({ analysisProgress: p }),
  analysisStage: "",
  setAnalysisStage: (s) => set({ analysisStage: s }),
  analysisId: null,
  setAnalysisId: (id) => set({ analysisId: id }),
}));

// Debug/testing hook: lets automated E2E checks drive navigation directly.
if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__cityStore = useStore;
}
