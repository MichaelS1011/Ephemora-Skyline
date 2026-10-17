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
  FAR_LOD_SAFE_RATIO,
  farLodExitDistance,
  findFileById,
  getDirLayout,
  overviewShot,
  tourStops,
  type CraneShot,
} from "../city/layout";
import { findVoxelForLine } from "../city/voxels";
import { defaultOverviewPath } from "../city/overview";
import {
  loadSavedProfile,
  saveProfile,
  categoriesForProfile,
  type ScanProfile,
} from "../config/scanProfiles";
import { loadSavedCategories, saveCategories } from "../config/findingCategories";
import { loadSavedPacks, savePacks, type RulePackInfo } from "../config/rulePacks";
import {
  bucketKeyFor,
  countStrandedVerdicts,
  fetchBackendReviews,
  findingKey,
  loadReviewsForCity,
  pushBackendReviews,
  reviewKeyFor,
  saveReviews,
} from "../reviews";
import { loadPrefs, savePrefs, type Prefs } from "../prefs";
import { mergeEngineGaps } from "../city/provenance";
import { hasCityVisit, recordCityVisit } from "../recentCities";
import {
  clearVisitParams,
  currentVisit,
  pathOfSelectedFile,
  resolveVisit,
  writeCityParam,
  writeNavParams,
  type CameraPose,
} from "../urlState";

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
  /** Frame the level's data geometry in the live camera frustum. */
  overview?: boolean;
  /** Camera elevation angle in radians. When omitted the rig preserves the
   *  current viewing angle — fine for user-driven flights, but building/tour
   *  shots must pass an explicit value or the angle drifts steeper per hop. */
  elevation?: number;
  nonce: number;
}

/** A scripted flight, as asked for by the caller (the rig adds the nonce). */
export type FlyOptions = Omit<FlyRequest, "nonce" | "distance"> & { distance?: number };

/** One pose the address asked to be put back on the camera. */
export interface PoseRequest {
  pose: CameraPose;
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

/**
 * Whether this city's folder is on the machine the backend runs on.
 *
 * A local scan stages its files, so the source view, the editor jump and the
 * project's own test run have something to read. The demo city is synthesised:
 * its paths exist in no directory, and the endpoints answer 404. Three
 * controls have to know which of the two they are pointing at.
 */
export function cityOnDisk(city: CityData | null): boolean {
  return !!city && city.repo.owner === "local";
}

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
  status: "passed" | "failed" | "skipped";
  tests: number;
  skippedTests?: number;
  failures: TestFailureInfo[];
}
export interface TestRunState {
  status: "idle" | "installing" | "running" | "complete" | "failed";
  stage: string;
}

let flyNonce = 0;
let poseNonce = 0;

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
  /**
   * Tear the view down for the Landing.
   *
   * The visit the user was working in goes into the history rather than being
   * replaced: one Back is the way back, and the Landing's index of opened
   * cities is the second one (measured: replacing it left the teardown with no
   * undo at all — the address was gone with the city).
   */
  resetToLanding: () => void;
  /** Same teardown for a handler that is reacting to the history itself. */
  resetToLandingFromHistory: () => void;
  setBuildPhase: (phase: "empty" | "constructing" | "built") => void;
  replayConstruction: () => void;
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
  /**
   * A camera pose the address asked for, handed to the pilot who restores it.
   *
   * Not a fly request: a flight is derived from where the camera already is
   * (`approachFromCurrentDirection` keeps the user's viewing direction), so
   * asking the rig to fly somewhere can never put the camera back where it was.
   * The pose is a position plus a heading, and only something standing at the
   * camera can write it onto the camera.
   */
  poseRequest: PoseRequest | null;
  requestPose: (pose: CameraPose | null) => void;
  cameraInfo: CameraInfo;
  setCameraInfo: (info: CameraInfo) => void;
  /** The pilot has flown so far that no corner of the level is in frame. The
   *  rig reports it; the HUD offers the way back, because a double-Escape
   *  within 500 ms is not a discovery a person makes under their own hands. */
  cityLostView: boolean;
  setCityLostView: (lost: boolean) => void;
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
  /** Verdicts sitting in a pre-fingerprint bucket this project cannot read. */
  orphanedReviews: number;
  /**
   * V3: the reveal pulse armed for the current build.
   *
   * Set exactly once per reveal by CityScene, together with the reveal flight
   * it accompanies; `Building` runs it exactly once (a damped single lobe on
   * the beacon of the worst REAL finding) and then leaves it. Null = nothing
   * armed — a demo or a scan without findings never arms one. `startAt` is the
   * epoch-ms when the pulse may begin (the reveal flight ends first).
   */
  revealPulse: { fileId: string; startAt: number } | null;
  /**
   * V1: the review key the FIRST verdict of this visit was set under.
   *
   * The panel confirms exactly that verdict with the persistence promise;
   * null = no verdict has been set in this visit, so no confirmation. Reset
   * when the visit is torn down — the promise is made once per visit.
   */
  firstVerdictKey: string | null;
  /**
   * A verdict could not be written to storage.
   *
   * The bucket survives reloads only as long as localStorage takes it, and the
   * one way to lose a day of triage silently is a full quota swallowed by a
   * `catch {}`. Reported so the screen can say the verdict is session-only.
   */
  verdictsBlocked: boolean;
  setReview: (key: string, status: ReviewStatus | null) => void;

  // ── User preferences (lang, rendering effects, CVD palette) ────────────
  prefs: Prefs;
  setPref: <K extends keyof Prefs>(key: K, value: Prefs[K]) => void;
  /**
   * Switch the passive release check on or off, and say what it is now.
   *
   * `prefs.updateCheck` existed and was read (`Landing.tsx:177`) but never set
   * by anything: the one network call the app makes on its own had no switch.
   * This is the state side of that switch; the menu row is ordered at Lane STADT-UI.
   */
  toggleUpdateCheck: () => boolean;

  // ── Test runner ──────────────────────────────────────────────────────────
  testRun: TestRunState;
  testResults: Record<string, TestFileResultInfo>; // path → result
  setTestRun: (run: TestRunState) => void;
  setTestResults: (files: TestFileResultInfo[]) => void;

  // ── Security Tour ──────────────────────────────────────────────────────
  // ── Findings list panel ───────────────────────────────────────────────
  showFindings: boolean;
  setShowFindings: (v: boolean) => void;

  // ── Auto-Gfx (perf.ts): the frame budget decides, until a hand doesn't ─
  autoGfxLite: boolean;
  setAutoGfxLite: (v: boolean) => void;
  /** True once the visitor touched the manual switch — the automation
   *  yields for the visit, the same law the construction crane follows. */
  gfxAutoDisabled: boolean;

  // ── Scan configuration (shared by Landing + AnalyzePanel) ─────────────
  scanProfile: ScanProfile;
  setScanProfile: (p: ScanProfile) => void;
  /** Which kinds of mistakes the user wants reported (all = no filter) */
  scanCategories: FindingCategory[];
  toggleScanCategory: (c: FindingCategory) => void;
  /**
   * Local rule packs the deep scan should load. Empty = today's behavior (the
   * registry config, fetched during the scan). The list itself is answered by
   * the backend — a pack is a fact about the disk, not a frontend string.
   */
  scanPacks: string[];
  availablePacks: RulePackInfo[];
  setAvailablePacks: (packs: RulePackInfo[]) => void;
  toggleScanPack: (id: string) => void;

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
  // Frame the whole level: its footprint AND its tallest towers must fit —
  // and the arrival must stay inside the band where the level is still drawn
  // as buildings rather than as the far-zoom heat grid. See overviewShot.
  const tallest = Math.max(
    0,
    ...layout.blocks.flatMap((b) => b.skyline.map((s) => s.h)),
    ...layout.buildings.map((b) => b.h),
  );
  const shot = overviewShot(layout.bounds, tallest);
  set({
    flyRequest: {
      x: layout.centre.x,
      z: layout.centre.z,
      distance: shot.dist,
      targetY: shot.targetY,
      elevation: shot.elevation,
      overview: true,
      nonce: ++flyNonce,
    },
  });
}

/**
 * The shot for one building: close enough to read its mass, far enough in to
 * still be drawn. A file whose own crown needs more distance than the level's
 * heat-grid band allows is framed at the band's edge with the eye line lifted
 * — the alternative is flying to a district that renders as flat tiles.
 */
function buildingShot(
  layoutBounds: number,
  h: number,
): { dist: number; targetY: number; elevation: number } {
  const wanted = Math.max(14, h * 2.6 + 12);
  const drawn = farLodExitDistance(layoutBounds) * FAR_LOD_SAFE_RATIO;
  const dist = Math.min(wanted, Math.max(14, drawn, h * 1.35));
  // Frontal building view: the camera sits at a gentle ~16° angle, looking
  // slightly up at the tower rather than down on it. This reads as "a person
  // standing across the street", not "a drone surveying rooftops".
  const elevation = 0.28;
  return {
    dist,
    targetY: Math.max(1.5, h * 0.45),
    elevation,
  };
}

export interface TriageEntry {
  file: ReturnType<typeof allFiles>[number]["file"];
  index: number; // position within file.findings — stable per analysis
}

/** The verdicts of the project the city on screen belongs to. */
type ReviewMap = Record<string, ReviewStatus>;

/** The verdict a queue entry already carries; null means it still needs one. */
function verdictOf(reviews: ReviewMap, entry: TriageEntry): ReviewStatus | null {
  const finding = entry.file.findings[entry.index];
  if (!finding) return null;
  return reviews[reviewKeyFor(entry.file, entry.index, finding)] ?? null;
}

/**
 * The next queue entry without a verdict, walking `step` (+1/-1) from `from`.
 * -1 when none is left in that direction — the caller stays where it is
 * rather than landing on a finding the user already decided about.
 */
export function nextOpenTriageIndex(
  list: TriageEntry[],
  reviews: ReviewMap,
  from: number,
  step: 1 | -1,
): number {
  for (let i = from; i >= 0 && i < list.length; i += step) {
    if (!verdictOf(reviews, list[i]!)) return i;
  }
  return -1;
}

/** How many findings of this queue still need a verdict. */
export function openTriageCount(list: TriageEntry[], reviews: ReviewMap): number {
  let open = 0;
  for (const entry of list) if (!verdictOf(reviews, entry)) open++;
  return open;
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
 * Exported so the dock can state how much of the queue still needs a verdict.
 */
export function triageList(
  city: CityData,
  threat: Severity | "all",
  rule: string | null,
): TriageEntry[] {
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

/**
 * Re-point a running triage at the queue the CURRENT filters produce.
 *
 * The queue is derived from `threatFilter` + `ruleFilter`, but the cursor and
 * the total were only ever recomputed on start/next/prev. Switching a filter
 * mid-queue therefore left the stepper saying "4 of 11" over a queue of three,
 * and the next click jumped from a position in the old list to one in the new —
 * silently skipping the entries at the front. A queue that the filter empties
 * ends the triage rather than counting down to nothing.
 */
function reanchorTriage(set: (partial: Partial<AppState>) => void, get: () => AppState): void {
  const { cityData, triageActive, triageCursor, triageTotal, focusedFindingKey } = get();
  if (!cityData || !triageActive) return;
  const list = triageList(cityData, get().threatFilter, get().ruleFilter);
  if (list.length === 0) {
    set({ triageActive: false, triageCursor: 0, triageTotal: 0, focusedFindingKey: null });
    return;
  }
  const still = list.findIndex((e) => findingKey(e.file.id, e.index) === focusedFindingKey);
  const at = still >= 0 ? still : Math.min(list.length - 1, triageCursor);
  if (at === triageCursor && list.length === triageTotal) return;
  const target = list[at]!;
  set({
    triageCursor: at,
    triageTotal: list.length,
    focusedFindingKey: findingKey(target.file.id, target.index),
  });
  // Only a changed target may move the camera: a filter chip that leaves this
  // finding in the queue must not fly the pilot somewhere else.
  if (still !== at || focusedFindingKey !== findingKey(target.file.id, target.index)) {
    get().navigateToFile(target.file.id);
    const line = target.file.findings[target.index]?.line;
    if (line !== undefined) flyToVoxel(set, cityData, target.file.id, line);
  }
}

export const useStore = create<AppState>((set, get) => {
  /**
   * One teardown, two history policies: the wordmark leaves an entry behind the
   * user can step back into, the history handler must not add one to the stack
   * it is reacting to.
   */
  const teardownVisit = (push: boolean) => {
    set({
      cityData: null,
      buildPhase: "empty",
      analysisId: null,
      isLoading: false,
      analysisProgress: 0,
      analysisStage: "",
      poseRequest: null,
      // V3: no city, no pulse. V1: the next visit makes its own first-verdict
      // promise — this visit's confirmation is spent.
      revealPulse: null,
      firstVerdictKey: null,
    });
    if (typeof window !== "undefined") clearVisitParams(push);
  };

  /**
   * Adopt the machine copy of this project's verdicts into the city on screen.
   *
   * The browser copy is read synchronously above; the machine copy — one JSON
   * file the local backend owns — is the one that survives a backend restart
   * and a different browser profile. Asked by the same bucket key, merged with
   * the browser copy winning on conflicts (the verdict on this screen is the
   * one this person just made), then pushed back so the machine copy carries
   * the merge and the scan registers itself for the agent's read-only route.
   * A backend that does not answer leaves the browser copy standing alone —
   * the behavior this app had before the route existed.
   */
  const adoptMachineVerdicts = async (
    analysisId: string,
    project: string,
    local: Record<string, ReviewStatus>,
  ): Promise<void> => {
    const backend = await fetchBackendReviews(analysisId, project);
    if (!backend) return;
    const merged = { ...backend, ...local };
    if (get().cityData?.analysisId !== analysisId) return; // a newer city arrived
    if (Object.keys(merged).length !== Object.keys(local).length) {
      saveReviews(project, merged);
      set({
        reviews: merged,
        orphanedReviews: countStrandedVerdicts(merged, get().cityData),
      });
    }
    pushBackendReviews(analysisId, project, merged);
  };

  return {
    cityData: null,
    buildPhase: "empty",
    buildStartedAt: 0,
    buildDuration: 0,
    constructionTotal: 0,
    constructionDone: 0,
    setCityData: (data) => {
      // One engine truth before anything reads the payload: the backend
      // attributes gitleaks/semgrep/ruff to files and stops there, so a project
      // scanned without the dependency audit arrives with lockfiles that read as
      // checked. Done here, at the one door a city comes in through, so tooltip,
      // heatmap and panel cannot disagree.
      if (data) mergeEngineGaps(data);
      // Review state belongs to the PROJECT, not to the scan that happened to
      // produce this city: a re-scan reads back the same verdicts.
      const reviews = data ? loadReviewsForCity(data) : {};
      // The address names the city it was written for. When that is the city
      // arriving, the visit continues out of the URL instead of starting over.
      const visit = currentVisit();
      const resuming = !!data && !!data.analysisId && visit.cityId === data.analysisId;
      const restored = data && resuming ? resolveVisit(data, visit) : { chain: [], file: null };
      if (data && restored.chain.length === 0 && !restored.file && !(resuming && visit.pose)) {
        restored.chain = defaultOverviewPath(data);
      }
      const pose = resuming ? visit.pose : null;
      // The construction cinematic is for the city a person is seeing for the
      // first time on this machine, not for the tenth reload of a visit they are
      // in the middle of (measured: every reload re-raised 10 of 10 buildings).
      const seenBefore = hasCityVisit(data?.analysisId);
      set({
        cityData: data,
        focusPath: restored.chain,
        selectedUnit: restored.file ? { kind: "file", id: restored.file.id } : null,
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
        reviews,
        orphanedReviews: countStrandedVerdicts(reviews, data),
        verdictsBlocked: false,
        // V3: a city arrives unarmed — CityScene arms the pulse with the reveal
        // flight of THIS build, and never with one from a previous city.
        revealPulse: null,
        testRun: { status: "idle", stage: "" },
        testResults: {},
        buildPhase: data ? (seenBefore ? "built" : "constructing") : "empty",
        buildStartedAt: data ? Date.now() : 0,
        constructionDone: 0,
        constructionTotal: 0,
        // The camera belongs to the address too — but a pose is not a flight, so
        // it goes out on its own channel for the tracker inside the canvas.
        poseRequest: pose ? { pose, nonce: ++poseNonce } : null,
      });
      if (data) recordCityVisit(data);
      // The address names the city that is on screen, so a reload comes back to
      // it instead of the empty world. Written from the payload's own scan id —
      // which is why every city, the demo included, now carries one.
      if (typeof window === "undefined") return;
      writeCityParam(data?.analysisId ?? null);
      if (restored.file) writeNavParams(restored.chain, restored.file.path);
      else if (restored.chain.length > 0) writeNavParams(restored.chain, null);
      // An address that names a file but no camera still means "I was looking at
      // this one": the sanctioned flight is the honest way to honour it, and a
      // selection the screen shows nowhere would be a half-restored visit.
      if (restored.file && !pose) get().navigateToFile(restored.file.id);
      // The machine copy is the second home of the verdicts: adopt what the
      // backend holds and register this scan, so a re-scan after a restart and
      // the agent's read-only route both find the same bucket. Local scans
      // only — the demo city has no verdict history to lose.
      if (data && data.repo?.owner === "local" && data.analysisId) {
        void adoptMachineVerdicts(data.analysisId, bucketKeyFor(data), reviews);
      }
    },

    /** Tear the city down and return to the Landing screen ("start over"). */
    resetToLanding: () => teardownVisit(true),
    resetToLandingFromHistory: () => teardownVisit(false),
    setBuildPhase: (phase) => set({ buildPhase: phase }),
    replayConstruction: () => {
      if (!get().cityData || get().buildPhase !== "built") return;
      const path = defaultOverviewPath(get().cityData!);
      set({
        focusPath: path,
        selectedUnit: null,
        hoveredId: null,
        buildPhase: "constructing",
        buildStartedAt: Date.now(),
        constructionDone: 0,
        constructionTotal: 0,
        tourActive: false,
        triageActive: false,
      });
      writeNavParams(path, null);
    },
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
      const path = cityData ? defaultOverviewPath(cityData) : [];
      set({ focusPath: path, selectedUnit: null });
      if (cityData) flyToDirOverview(set, cityData, path);
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
        const shot = buildingShot(layout.bounds, placement.h);
        set({
          flyRequest: {
            x: placement.x,
            z: placement.z,
            distance: shot.dist,
            targetY: shot.targetY,
            elevation: shot.elevation,
            nonce: ++flyNonce,
          },
        });
      } else {
        flyToDirOverview(set, cityData, hit.chain);
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
        const shot = buildingShot(layout.bounds, placement.h);
        set({
          flyRequest: {
            x: placement.x,
            z: placement.z,
            distance: shot.dist,
            targetY: shot.targetY,
            elevation: shot.elevation,
            nonce: ++flyNonce,
          },
        });
      }
    },
    exitOrbit: () => set({ cameraMode: "free" }),

    flyRequest: null,
    requestFly: ({ distance = 40, ...rest }) =>
      set({ flyRequest: { ...rest, distance, nonce: ++flyNonce } }),
    poseRequest: null,
    requestPose: (pose) => set({ poseRequest: pose ? { pose, nonce: ++poseNonce } : null }),
    cameraInfo: { x: 0, z: 60, angle: 0, dist: 80 },
    setCameraInfo: (info) => set({ cameraInfo: info }),
    cityLostView: false,
    setCityLostView: (lost) => {
      if (get().cityLostView === lost) return;
      set({ cityLostView: lost });
    },
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
    setThreatFilter: (f) => {
      set({ threatFilter: f });
      reanchorTriage(set, get);
    },

    ruleFilter: null,
    setRuleFilter: (rule) => {
      set({ ruleFilter: rule });
      reanchorTriage(set, get);
    },

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
      // A verdict is a finished decision. The round opens on the first finding
      // that still needs one, so re-scanning the same folder tomorrow does not
      // walk the whole queue again. When every finding is judged, entry 0 stays
      // reachable — inspecting a past decision must not require a filter.
      const at = nextOpenTriageIndex(list, get().reviews, 0, 1);
      const first = list[at === -1 ? 0 : at]!;
      set({
        triageActive: true,
        triageCursor: at === -1 ? 0 : at,
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
      // Step to the next finding WITHOUT a verdict. A judge that lands on the
      // already-decided entry next to it costs the user a decision twice.
      const at = nextOpenTriageIndex(list, get().reviews, triageCursor + 1, 1);
      if (at === -1) return;
      const target = list[at]!;
      set({
        triageCursor: at,
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
      // Same walk backwards. Filters may have shrunk the queue while the triage
      // ran, so the walk starts no later than the last entry of the new list.
      const from = Math.min(list.length - 1, triageCursor - 1);
      const at = nextOpenTriageIndex(list, get().reviews, from, -1);
      if (at === -1) return;
      const target = list[at]!;
      set({
        triageCursor: at,
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
    orphanedReviews: 0,
    verdictsBlocked: false,
    revealPulse: null,
    firstVerdictKey: null,
    setReview: (key, status) => {
      const { reviews, cityData } = get();
      const next = { ...reviews };
      if (status === null) delete next[key];
      else next[key] = status;
      // A verdict that cannot be written is a verdict that dies with the tab.
      // The storage call used to swallow that (`catch {}`) — say so on screen
      // rather than let a full day of triage look saved.
      const written = cityData ? saveReviews(bucketKeyFor(cityData), next) : true;
      // Write through to the machine copy — the half that outlives this
      // browser profile. A refusal there is tolerated: the browser copy still
      // holds the verdict, and the next load adopts and re-pushes it.
      if (cityData?.analysisId && cityData.repo?.owner === "local") {
        pushBackendReviews(cityData.analysisId, bucketKeyFor(cityData), next);
      }
      set({
        reviews: next,
        verdictsBlocked: !written,
        // V1: the FIRST verdict of the visit is the commitment the panel
        // confirms. Clearing or re-marking later never moves the marker.
        firstVerdictKey:
          status !== null && get().firstVerdictKey === null ? key : get().firstVerdictKey,
      });
    },

    prefs: loadPrefs(),
    setPref: (key, value) => {
      const prefs = { ...get().prefs, [key]: value };
      savePrefs(prefs);
      // A hand on the manual switch ends the automation for the visit —
      // a governor that steals back what the user chose is a bug.
      if (key === "gfxLite") set({ prefs, autoGfxLite: false, gfxAutoDisabled: true });
      else set({ prefs });
    },
    toggleUpdateCheck: () => {
      const next = !get().prefs.updateCheck;
      get().setPref("updateCheck", next);
      return next;
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

    autoGfxLite: false,
    setAutoGfxLite: (v) => set({ autoGfxLite: v }),
    gfxAutoDisabled: false,

    scanProfile: loadSavedProfile(),
    scanCategories: categoriesForProfile(loadSavedProfile(), loadSavedCategories()),
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
      const categories = categoriesForProfile(p, get().scanCategories);
      saveCategories(categories);
      set({ scanProfile: p, scanCategories: categories });
    },

    scanPacks: loadSavedPacks(),
    availablePacks: [],
    setAvailablePacks: (packs) => {
      // A saved id for a pack that is no longer on disk must not silently vanish
      // from the scan: drop it and say which ones remain.
      const known = new Set(packs.map((p) => p.id));
      const before = get().scanPacks;
      const kept = before.filter((id) => known.has(id));
      if (kept.length !== before.length) savePacks(kept);
      set({ availablePacks: packs, scanPacks: kept });
    },
    toggleScanPack: (id) => {
      const current = get().scanPacks;
      const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
      savePacks(next);
      set({ scanPacks: next });
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
      // Provenance only. Review state is keyed by project and fingerprint, so a
      // new scan of the same folder must NOT reset the map — that reset is what
      // made every verdict die with its per-scan uuid.
      set({ analysisId: id });
    },
  };
});

// Debug/testing hook: lets automated E2E checks drive navigation directly.
if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__cityStore = useStore;
}

// ── The address follows the visit ──────────────────────────────────────────
// One subscriber rather than a write in every action: drillIn, drillOut,
// navigateToFile, selectBuilding, focusBuilding, the triage stepper and the
// tour all move the visit, and an address that only some of them kept would be
// a half-truth about where the user is. Replaces in place — a pilot crossing
// the city would otherwise leave one history entry per district.
if (typeof window !== "undefined") {
  let lastNav: string | null = null;
  let lastPathRef: string[] | null = null;
  let lastUnitRef: AppState["selectedUnit"] = null;
  useStore.subscribe((state) => {
    const city = state.cityData;
    if (!city) return;
    // The camera reports through this store ~10 Hz, so the lookup that turns a
    // selection into a path may not run on every notification — only when one
    // of the two values the address carries actually changed identity.
    if (state.focusPath === lastPathRef && state.selectedUnit === lastUnitRef) return;
    lastPathRef = state.focusPath;
    lastUnitRef = state.selectedUnit;
    const fileId = state.selectedUnit?.kind === "file" ? state.selectedUnit.id : null;
    const path = pathOfSelectedFile(city, fileId);
    const key = `${state.focusPath.join("/")}|${path ?? ""}`;
    if (key === lastNav) return;
    lastNav = key;
    writeNavParams(state.focusPath, path);
  });
}
