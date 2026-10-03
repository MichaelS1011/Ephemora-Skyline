import { create } from "zustand";
import type {
  CityData,
  FindingCategory,
  ReviewStatus,
  SelectedUnit,
  Severity,
} from "../city/types";
import {
  allFiles,
  byRisk,
  findFileById,
  getDirLayout,
  tourStops,
  type CraneShot,
} from "../city/layout";
import { findVoxelForLine } from "../city/voxels";
import { loadSavedProfile, saveProfile, type ScanProfile } from "../config/scanProfiles";
import { loadSavedCategories, saveCategories } from "../config/findingCategories";
import { findingKey, loadReviews, saveReviews } from "../reviews";
import { loadPrefs, savePrefs, type Prefs } from "../prefs";

export interface FlyRequest {
  x: number;
  z: number;
  /** Camera distance from the target (world units). */
  distance: number;
  /**
   * Flight duration in seconds. Optional — when omitted the rig derives the
   * duration from the flight distance (previous behavior).
   */
  duration?: number;
  /**
   * Orbit-target height at the destination (voxel-focus V3). Optional —
   * when omitted the rig keeps its ground-level default (y = 1.5).
   */
  targetY?: number;
  nonce: number;
}

/** A scripted flight, as asked for by the caller (the rig adds the nonce). */
export type FlyOptions = Omit<FlyRequest, "nonce" | "distance"> & { distance?: number };

export interface CameraInfo {
  x: number;
  z: number;
  angle: number;
  /** Camera distance to the orbit target — drives LOD transitions. */
  dist: number;
}

export type HeatChannel = "threat" | "complexity" | "churn";

/**
 * City-wide view mode (spec §14): which information layer the skyline shows.
 * One lens at a time — never all information simultaneously.
 */
export type ViewMode = "structure" | "security" | "dependencies";

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
  /** Epoch ms when a build skip was requested (null = no skip requested). */
  buildSkipAt: number | null;
  setCityData: (data: CityData | null) => void;
  resetToLanding: () => void;
  setBuildPhase: (phase: "empty" | "constructing" | "built") => void;
  setConstructionProgress: (done: number, total: number) => void;
  requestBuildSkip: () => void;

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
  /**
   * Select a building in place (click): drill into its district + select,
   * but WITHOUT any camera flight — the user's camera stays where it is.
   */
  selectBuilding: (fileId: string) => void;

  // ── Camera mode — free flight is the default, orbit on demand ──────────
  /**
   * free  — drag looks around freely, WASD/QE walks, wheel dollies;
   *         selection never moves the camera.
   * orbit — the classic inspect mode: double-click a building (or the
   *         breadcrumb refocus) and the camera circles ITS viewpoint.
   */
  cameraMode: "free" | "orbit";
  /** Select a building AND enter orbit mode around it (double-click). */
  focusBuilding: (fileId: string) => void;
  /** Leave orbit mode — the free-fly controller takes the live camera pose. */
  exitOrbit: () => void;

  // ── Camera command channel ─────────────────────────────────────────────
  flyRequest: FlyRequest | null;
  requestFly: (req: FlyOptions) => void;
  cameraInfo: CameraInfo;
  setCameraInfo: (info: CameraInfo) => void;
  /** epoch-ms of the last moment a hand took the camera. The construction crane
   *  yields to a pilot: once the user drives during a build, the crane stops
   *  flying for the rest of that build. */
  cameraManualAt: number;
  noteCameraManual: () => void;

  /**
   * Live crane shot while a city is under construction.
   *
   * A plain value, deliberately NOT a fly request: a request is a from/to
   * tween that ends, and one per district is exactly the hopping the user
   * rejected. The rig eases toward this every frame instead, so pulling back
   * as the city grows is one continuous move. null when no crane is working.
   */
  craneFraming: CraneShot | null;
  setCraneFraming: (shot: CraneShot | null) => void;

  // ── Filters ────────────────────────────────────────────────────────────
  threatFilter: Severity | "all";
  setThreatFilter: (f: Severity | "all") => void;

  /** Rule-id filter (e.g. "CMD_INJECTION") — null shows every rule. */
  ruleFilter: string | null;
  setRuleFilter: (rule: string | null) => void;

  /** What the far-zoom heat cells are colored by. */
  heatChannel: HeatChannel;
  setHeatChannel: (c: HeatChannel) => void;

  // ── View mode (spec §14) ─────────────────────────────────────────────────
  /** Which layer the city shows: structure (default), security or dependencies. */
  viewMode: ViewMode;
  setViewMode: (m: ViewMode) => void;

  // ── Triage — work the findings queue one finding at a time ─────────────
  triageActive: boolean;
  triageCursor: number; // index into the triage list (0-based)
  triageTotal: number; // list length, fixed while a triage runs
  focusedFindingKey: string | null; // findingKey of the triage target
  startTriage: () => void;
  nextTriage: () => void;
  prevTriage: () => void;
  endTriage: () => void;
  setFocusedFindingKey: (key: string | null) => void;
  /**
   * Re-fly to the voxel of the currently focused finding (voxel-focus V3).
   * No-op when no finding is focused, the city is absent, or the finding
   * has no materialized voxel.
   */
  refocusVoxel: () => void;

  // ── Review states (local-first, persisted per analysis id) ─────────────
  reviews: Record<string, ReviewStatus>;
  setReview: (key: string, status: ReviewStatus | null) => void;

  // ── User preferences (lang, rendering effects, CVD palette) ────────────
  prefs: Prefs;
  setPref: <K extends keyof Prefs>(key: K, value: Prefs[K]) => void;

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
  /** Which kinds of mistakes the user wants reported (all = no filter) */
  scanCategories: FindingCategory[];
  toggleScanCategory: (c: FindingCategory) => void;

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

interface TriageEntry {
  file: ReturnType<typeof allFiles>[number]["file"];
  index: number; // position within file.findings — stable per analysis
}

/**
 * Voxel-focus V3: fly the camera close to the voxel that represents a
 * source line. Composes placement + section base + cell (the renderer's
 * transform, plus the 0.3 body lift Building applies to its voxel group).
 * No-op when the file/placement/layout has no materialized cell for the
 * line — the caller's previous flyRequest (building center) stays intact.
 */
function flyToVoxel(
  set: (partial: Partial<AppState>) => void,
  city: CityData,
  fileId: string,
  line: number,
): void {
  const hit = findFileById(city, fileId);
  if (!hit) return;
  const layout = getDirLayout(city, hit.chain);
  const placement = layout.buildings.find((b) => b.file.id === fileId);
  const voxels = placement?.voxels;
  if (!placement || !voxels) return;
  const found = findVoxelForLine(voxels, line);
  if (!found) return;
  const section = voxels.sections[found.sectionIndex]!;
  const s = voxels.voxelSize;
  const wx = placement.x + section.base.x + found.cell.x * s;
  const wz = placement.z + section.base.z + found.cell.z * s;
  const wy = 0.3 + (found.cell.y + 0.5) * s;
  set({
    flyRequest: { x: wx, z: wz, distance: 7, duration: 1.0, targetY: wy, nonce: ++flyNonce },
  });
}

const SEVERITY_RANK: Record<Severity, number> = { P0: 0, P1: 1, P2: 2 };

/**
 * The triage queue: every finding in the city matching the current
 * severity + rule filters, worst first (severity → risk → path → line).
 */
function triageList(city: CityData, threat: Severity | "all", rule: string | null): TriageEntry[] {
  const out: TriageEntry[] = [];
  for (const { file } of allFiles(city)) {
    file.findings.forEach((f, index) => {
      if (threat !== "all" && f.severity !== threat) return;
      const ruleId = f.ruleId ?? f.type;
      if (rule && ruleId !== rule) return;
      out.push({ file, index });
    });
  }
  return out.sort(
    (a, b) =>
      SEVERITY_RANK[a.file.findings[a.index]!.severity] -
        SEVERITY_RANK[b.file.findings[b.index]!.severity] ||
      byRisk(a.file, b.file) ||
      a.file.path.localeCompare(b.file.path) ||
      a.file.findings[a.index]!.line - b.file.findings[b.index]!.line,
  );
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
      ruleFilter: null,
      // A new city is a neutral stage: the previous repo's view mode must not
      // dim or re-lighten the fresh skyline before the user has chosen a lens.
      viewMode: "structure",
      tourActive: false,
      tourIndex: 0,
      triageActive: false,
      triageCursor: 0,
      triageTotal: 0,
      focusedFindingKey: null,
      cameraMode: "free",
      // The demo city has no analysis id — its review state persists under
      // the stable "demo" key so triage progress survives reloads there too.
      reviews: data ? (data.repo.name === "demo-city" ? loadReviews("demo") : {}) : {},
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
  buildSkipAt: null,
  requestBuildSkip: () => set({ buildSkipAt: Date.now() }),

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

  selectBuilding: (fileId) => {
    // Click selection is pilot-only: focus + selection change, the camera
    // never moves. (navigateToFile remains the fly-to variant for search,
    // triage, tour and breadcrumbs.)
    const { cityData } = get();
    if (!cityData) return;
    const hit = findFileById(cityData, fileId);
    if (!hit) return;
    set({ focusPath: hit.chain, selectedUnit: { kind: "file", id: fileId } });
  },

  cameraMode: "free",
  focusBuilding: (fileId) => {
    // Double-click: select, fly from the user's current direction, and hand
    // the building to the orbit controller for inspection.
    const { cityData } = get();
    if (!cityData) return;
    const hit = findFileById(cityData, fileId);
    if (!hit) return;
    set({
      focusPath: hit.chain,
      selectedUnit: { kind: "file", id: fileId },
      cameraMode: "orbit",
    });
    const layout = getDirLayout(cityData, hit.chain);
    const placement = layout.buildings.find((b) => b.file.id === fileId);
    if (placement) {
      const dist = Math.max(14, placement.h * 2.6 + 12);
      set({ flyRequest: { x: placement.x, z: placement.z, distance: dist, nonce: ++flyNonce } });
    }
  },
  exitOrbit: () => set({ cameraMode: "free" }),

  flyRequest: null,
  requestFly: ({ distance = 40, ...rest }) =>
    set({ flyRequest: { ...rest, distance, nonce: ++flyNonce } }),
  cameraInfo: { x: 0, z: 60, angle: 0, dist: 80 },
  setCameraInfo: (info) => set({ cameraInfo: info }),
  cameraManualAt: 0,
  // throttled: the walk path calls this every frame a key is held down
  noteCameraManual: () => {
    const now = Date.now();
    if (now - get().cameraManualAt < 250) return;
    set({ cameraManualAt: now });
  },

  craneFraming: null,
  // The director writes this ~10 Hz while the city rises; unchanged shots are
  // dropped so a standing still-frame never re-renders the rig.
  setCraneFraming: (shot) => {
    const cur = get().craneFraming;
    if (cur === null || shot === null) {
      if (cur === shot) return;
    } else if (cur.dist === shot.dist && cur.targetY === shot.targetY) return;
    set({ craneFraming: shot });
  },

  threatFilter: "all",
  setThreatFilter: (f) => set({ threatFilter: f }),

  ruleFilter: null,
  setRuleFilter: (rule) => set({ ruleFilter: rule }),

  heatChannel: "threat",
  setHeatChannel: (c) => set({ heatChannel: c }),

  viewMode: "structure",
  setViewMode: (m) => set({ viewMode: m }),

  // ── Triage implementation ────────────────────────────────────────────────
  triageActive: false,
  triageCursor: 0,
  triageTotal: 0,
  focusedFindingKey: null,
  startTriage: () => {
    const { cityData } = get();
    if (!cityData) return;
    const list = triageList(cityData, get().threatFilter, get().ruleFilter);
    if (list.length === 0) return;
    const first = list[0]!;
    set({
      triageActive: true,
      triageCursor: 0,
      triageTotal: list.length,
      focusedFindingKey: findingKey(first.file.id, first.index),
    });
    get().navigateToFile(first.file.id);
    // Voxel-focus V3: besides the building-center flight, dive to the exact
    // voxel. flyToVoxel overrides the flyRequest only when a cell exists —
    // otherwise the previous behavior stays.
    const line = first.file.findings[first.index]?.line;
    if (line !== undefined) flyToVoxel(set, cityData, first.file.id, line);
  },
  nextTriage: () => {
    const { cityData, triageActive, triageCursor } = get();
    if (!cityData || !triageActive) return;
    const list = triageList(cityData, get().threatFilter, get().ruleFilter);
    if (list.length === 0) return;
    const next = Math.min(list.length - 1, triageCursor + 1);
    const target = list[next]!;
    set({
      triageCursor: next,
      triageTotal: list.length,
      focusedFindingKey: findingKey(target.file.id, target.index),
    });
    get().navigateToFile(target.file.id);
    // Voxel-focus V3 — see startTriage.
    const line = target.file.findings[target.index]?.line;
    if (line !== undefined) flyToVoxel(set, cityData, target.file.id, line);
  },
  prevTriage: () => {
    const { cityData, triageActive, triageCursor } = get();
    if (!cityData || !triageActive) return;
    const list = triageList(cityData, get().threatFilter, get().ruleFilter);
    if (list.length === 0) return;
    // Clamp against the CURRENT list length too: filters may have shrunk
    // the queue while the triage was running — the stale cursor must not
    // point past the end.
    const prev = Math.min(list.length - 1, Math.max(0, triageCursor - 1));
    const target = list[prev]!;
    set({
      triageCursor: prev,
      triageTotal: list.length,
      focusedFindingKey: findingKey(target.file.id, target.index),
    });
    get().navigateToFile(target.file.id);
    // Voxel-focus V3 — see startTriage.
    const line = target.file.findings[target.index]?.line;
    if (line !== undefined) flyToVoxel(set, cityData, target.file.id, line);
  },
  endTriage: () =>
    set({ triageActive: false, triageCursor: 0, triageTotal: 0, focusedFindingKey: null }),
  setFocusedFindingKey: (key) => set({ focusedFindingKey: key }),
  refocusVoxel: () => {
    const { cityData, focusedFindingKey } = get();
    if (!cityData || !focusedFindingKey) return;
    // findingKey format: `${fileId}#${index}` — lastIndexOf keeps file ids
    // that themselves contain '#' intact.
    const sep = focusedFindingKey.lastIndexOf("#");
    if (sep <= 0) return;
    const fileId = focusedFindingKey.slice(0, sep);
    const index = Number(focusedFindingKey.slice(sep + 1));
    if (!Number.isInteger(index) || index < 0) return;
    const hit = findFileById(cityData, fileId);
    if (!hit) return;
    const line = hit.file.findings[index]?.line;
    if (line !== undefined) flyToVoxel(set, cityData, fileId, line);
  },

  reviews: {},
  setReview: (key, status) => {
    const { reviews, analysisId, cityData } = get();
    const next = { ...reviews };
    if (status === null) delete next[key];
    else next[key] = status;
    const storageId = analysisId ?? (cityData?.repo.name === "demo-city" ? "demo" : "");
    saveReviews(storageId, next);
    set({ reviews: next });
  },

  prefs: loadPrefs(),
  setPref: (key, value) => {
    const prefs = { ...get().prefs, [key]: value };
    savePrefs(prefs);
    set({ prefs });
  },

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
  scanCategories: loadSavedCategories(),
  toggleScanCategory: (c) => {
    const current = get().scanCategories;
    const next = current.includes(c)
      ? // the last chip stays on: "nothing selected" is not "nothing scanned"
        current.length > 1
        ? current.filter((x) => x !== c)
        : current
      : [...current, c];
    saveCategories(next);
    set({ scanCategories: next });
  },
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
  setAnalysisId: (id) => {
    // Reviews are per-analysis and local-first: swap the map when the id
    // changes so a new scan starts unreviewed and a permalink reload
    // restores the reviewer's previous progress.
    set({ analysisId: id, reviews: id ? loadReviews(id) : {} });
  },
}));

// Debug/testing hook: lets automated E2E checks drive navigation directly.
if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__cityStore = useStore;
}
