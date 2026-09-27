import { create } from "zustand";
import type { CityData, SelectedUnit, Severity } from "../city/types";
import { findFileById, getDirLayout, tourStops } from "../city/layout";

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
  setFocusPath: (path: string[]) => void;
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

  // ── Security Tour ──────────────────────────────────────────────────────
  // ── Findings list panel ───────────────────────────────────────────────
  showFindings: boolean;
  setShowFindings: (v: boolean) => void;

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
      buildPhase: data ? "constructing" : "empty",
      buildStartedAt: data ? Date.now() : 0,
      constructionDone: 0,
      constructionTotal: 0,
    }),
  setBuildPhase: (phase) => set({ buildPhase: phase }),
  setConstructionProgress: (done, total) =>
    set({ constructionDone: done, constructionTotal: total }),

  focusPath: [],
  selectedUnit: null,
  hoveredId: null,
  setHoveredId: (id) => set({ hoveredId: id }),

  setFocusPath: (path) => {
    set({ focusPath: path, selectedUnit: null });
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
  cameraInfo: { x: 0, z: 60, angle: 0 },
  setCameraInfo: (info) => set({ cameraInfo: info }),

  threatFilter: "all",
  setThreatFilter: (f) => set({ threatFilter: f }),

  showFindings: false,
  setShowFindings: (v) => set({ showFindings: v }),

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
