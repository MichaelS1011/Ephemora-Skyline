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
import { worldTargetForFinding } from "../city/waypoint";
import { defaultOverviewPath } from "../city/overview";
import type { ResidentOffer } from "../city/residentGreeting";
import type { EpheRole, GuideRequest } from "../city/epheRoles";
import { securityClaimFor } from "../city/epheRoles";
import { prefersReducedMotion } from "../city/motion";
import { loadEpheNames, normaliseName, saveEpheName } from "../epheNames";
import { readEpheLook, saveEpheLook, type EpheLook } from "../epheLook";
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
import { EMPTY_LIVE_STATE, type LiveState, type PendingLiveScan } from "../live/types";
import { mergeEngineGaps } from "../city/provenance";
import { hasCityVisit, recordCityVisit } from "../recentCities";
import { hasArrivedBefore, markArrived } from "../firstArrival";
import { clearPendingRun } from "../pendingRun";
import { anchorFor, verifyAnchorScannedAt, verifyScans, type VerifyReport } from "../verify";
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
  /**
   * Explicit camera position and look-at target. The share director uses this
   * when it has already fitted the frame for the output aspect; it overrides
   * the x/z/distance/overview derivation so the shot cannot swing around a
   * stale viewpoint on its way to the hero pose.
   */
  position?: { x: number; y: number; z: number };
  target?: { x: number; y: number; z: number };
  nonce: number;
}

/**
 * A scripted flight, as asked for by the caller (the rig adds the nonce).
 * x/z are optional only for an explicit position/target pose; every other
 * caller still names the point it wants to look at.
 */
export type FlyOptions = Omit<FlyRequest, "nonce" | "distance" | "x" | "z"> & {
  distance?: number;
  x?: number;
  z?: number;
};

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

/**
 * The four far-zoom heat channels. `time` is not a colour ramp but a census:
 * which towers already stood at `heatDateMs` — see `city/stoodAt.ts`.
 */
export type HeatChannel = "threat" | "complexity" | "churn" | "time";

/**
 * Whether this city's folder is on the machine the backend runs on.
 *
 * A local scan stages its files, so the source view, the editor jump and the
 * project's own test run have something to read. The demo city is synthesised:
 * its paths exist in no directory, and the endpoints answer 404. Three
 * controls have to know which of the two they are pointing at.
 */
/**
 * When the earlier scan of this folder finished, if this browser knows.
 * Reads the anchor record rather than the payload, because the earlier city
 * is not in the page any more — only the note this browser kept of it.
 */
function scannedAtOf(scanId: string): { previousScannedAt?: string } {
  const stored = verifyAnchorScannedAt(scanId);
  return stored ? { previousScannedAt: stored } : {};
}

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
  sceneRebuildAt: number | null;
  setCityData: (data: CityData | null) => void;
  /**
   * A finished folder scan that can be watched. The handle outlives the
   * Landing screen; the live session consumes this and keeps its own snapshot.
   */
  pendingLive: PendingLiveScan | null;
  setPendingLive: (pending: PendingLiveScan | null) => void;
  /** What the watch loop is doing, for the permanent live band. */
  live: LiveState;
  setLiveState: (patch: Partial<LiveState>) => void;
  /**
   * Replace the city with a delta result WITHOUT starting a new visit: the
   * camera, filters and open panel stay where the reader left them.
   */
  applyLiveCityData: (data: CityData) => void;
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
  /**
   * The browser took the WebGL context away. The renderer hands its canvas
   * back so the app can restart the same context before asking for a rebuild —
   * `SceneBoundary` never sees this, because nothing throws.
   */
  onContextLost: () => void;
  /** The canvas confirmed the restore; the city is drawing again. */
  onContextRestored: () => void;
  /** A fresh `<Canvas>`, so a lost or thrown scene gets its own context back. */
  rebuildScene: () => void;

  /**
   * "What changed since I was last here." `ran` carries the last comparison of
   * THIS city; `status` says whether there was a question to ask at all.
   */
  verify: VerifyState;
  /**
   * Ask whether anything changed since the earlier scan of this folder.
   * `silent` is the opening call: it does not say "nothing to compare" when
   * there is no counterpart, and it asks at most once per scan.
   */
  runVerify: (options?: { silent?: boolean }) => Promise<void>;

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
  /**
   * The fitted start/end pose of a share take. While it is set, the build's
   * reveal flies here instead of the normal overview, so a result-first hook
   * and the final frame are the same shot — the loop closes.
   */
  shareHero: {
    position: { x: number; y: number; z: number };
    target: { x: number; y: number; z: number };
  } | null;
  setShareHero: (
    hero: {
      position: { x: number; y: number; z: number };
      target: { x: number; y: number; z: number };
    } | null,
  ) => void;
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
  /**
   * The date the `time` channel asks about, epoch-ms. Committed only on the
   * debounced release of the slider — the heat field rebuilds its instance
   * matrices when this changes, so a frame-rate slider would rebuild towers
   * while the thumb moves.
   */
  heatDateMs: number | null;
  setHeatDateMs: (ms: number | null) => void;

  // ── View mode (spec §14) ─────────────────────────────────────────────────
  /** Which layer the city shows: structure (default), security or dependencies. */
  viewMode: ViewMode;
  setViewMode: (m: ViewMode) => void;

  /**
   * 005 Teil A: mark the files that import the selected one. Off by default —
   * an impact claim is a question the reader asks, not a layer the city wears.
   * Cleared with the city, like every other view state.
   */
  blastOn: boolean;
  setBlastOn: (v: boolean) => void;

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
  /**
   * The machine copy of this project's verdicts could not be read.
   *
   * The backend owns one JSON file next to the browser's own storage, and it
   * answers 503 `verdicts_unreadable` rather than serve an empty map it cannot
   * justify. `absent` (no backend in reach) leaves the browser copy standing
   * alone and says nothing; this flag is only for the file that is there and
   * will not read — the case where an unreviewed city would be a lie.
   */
  verdictsUnreadable: boolean;
  setReview: (key: string, status: ReviewStatus | null) => void;

  // ── User preferences (lang, rendering effects, CVD palette) ────────────
  prefs: Prefs;
  /**
   * Whether this browser has never shown a city (§03.02).
   *
   * Read once when the store is built, so the first paint already knows whether
   * to greet a newcomer or drop a returning reader back into the work. It is the
   * machine's memory of one arrival, not this screen's — a second folder is still
   * `false`, and `markArrived` sets it on the first city so the NEXT launch reads
   * `false`. Nothing consumes it yet; the calm welcome state (§03.03) is its
   * first reader.
   */
  firstRun: boolean;
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

  /**
   * The arrival budget: what stands on screen when a city arrives.
   *
   * Measured 2026-10-18: 13 chrome regions painted themselves at once, ~36 % of
   * the window and 250 words. Six of them are useful and none of them is the
   * point — so they start folded, and each one comes back from a named control
   * in the dock. `tests/arrival-budget.test.tsx` holds the count, the word
   * budget and the rule that every deferred surface is reachable by its name.
   * Session state, not a preference: a new city is a neutral stage again.
   */
  showLegend: boolean;
  setShowLegend: (v: boolean) => void;
  showMinimap: boolean;
  setShowMinimap: (v: boolean) => void;
  showHeat: boolean;
  setShowHeat: (v: boolean) => void;
  showSearch: boolean;
  setShowSearch: (v: boolean) => void;
  /** The first-look primer, which used to open itself once per version. */
  showPrimer: boolean;
  setShowPrimer: (v: boolean) => void;
  /** The keyboard guide, opened from the dock instead of a standing `[?]` chip. */
  showShortcuts: boolean;
  setShowShortcuts: (v: boolean) => void;
  /**
   * City only: every instrument steps back, the city keeps the frame.
   * A view state, not a preference — a new city starts with the controls back,
   * and Escape is the way out (the header is hidden, so it cannot be the way).
   */
  cityOnly: boolean;
  setCityOnly: (v: boolean) => void;
  /**
   * The resident the reader called. One at a time; the figure stops, faces the
   * camera and offers one guided verb. `residentCall` is a counter, not a
   * target: the canvas owns the crowd, so it picks the neighbour and reports
   * the index back through `selectResident`.
   */
  selectedResident: number | null;
  /**
   * EPHE-AI EA-01 — what the selected figure IS, not where it sits in the
   * array: `plot:<file id>#<seat>` when the level drew its home, null when the
   * caller had no identity to hand over. The index is rebuilt with every level;
   * this string survives a re-scan of the same folder, so it is what a name, a
   * role or a bound model can be keyed by.
   */
  residentIdentity: string | null;
  /**
   * Which job the called figure carries, handed over by the renderer that owns
   * the crowd: the roles are index arithmetic over the live population, and a
   * card that recomputed them would have to guess the crowd size. Null when the
   * level draws no role figure — an unnamed citizen, which is the normal case.
   */
  residentRole: EpheRole | null;
  /**
   * Names the reader has given residents in this session, keyed by their
   * address. Deliberately a map and not one field: the card moves from figure
   * to figure, and a name that followed the selection instead of the resident
   * would rename everybody. Nothing is stored yet — that is EA-03, and the key
   * is already the stable one it needs.
   */
  residentNames: Record<string, string>;
  nameResident: (key: string, name: string | null) => void;
  /**
   * Whether the last name failed to reach storage. The card's own sentence
   * promises the name outlives the session, and a promise the browser refused
   * to keep has to be taken back out loud.
   */
  residentNamesBlocked: boolean;
  /**
   * §04.10 — the look the reader chose, in state as well as on disk, so the
   * crowd can recolour the moment it changes. The browser-wide key of §04.09 is
   * the source at boot; `applyEpheLook` is the only door, because a state that
   * can drift from its own storage is how §04.09's promise breaks.
   */
  epheLook: EpheLook;
  /** Whether the last look failed to reach storage — same honesty rule as names. */
  epheLookBlocked: boolean;
  /** A partial choice: the panel picks one thing at a time, the store merges. */
  applyEpheLook: (next: Partial<EpheLook>) => void;
  /**
   * §04.11 — the vitrine is reachable from inside a city, not only from the
   * start page. Renaming is the card's field; restyling needs the figure itself
   * on a size where a jacket can be seen, and the card must not grow a second
   * verb to provide it. One flag, one panel, the same door `showSearch` uses.
   */
  showEpheVitrine: boolean;
  setShowEpheVitrine: (v: boolean) => void;
  selectResident: (index: number | null, identity?: string | null, role?: EpheRole | null) => void;
  residentCall: number;
  requestResidentCall: () => void;
  /** A one-shot wave from the crowd when the city is finished. */
  residentGreet: number;
  requestResidentGreet: () => void;
  /** The greet nonce the canvas has already answered; survives a remount. */
  residentGreeted: number;
  markResidentGreeted: (nonce: number) => void;
  /**
   * The resident's offer that rides the announcement. `open` until the reader
   * takes it (a called resident, the guided verb) or closes the card — `closed`
   * ends the wave and the strip verb for this city, and is never re-armed.
   */
  residentOffer: ResidentOffer;
  setResidentOffer: (v: ResidentOffer) => void;
  /** Where the called resident points for the moment before the camera leaves. */
  residentPoint: { x: number; z: number; until: number } | null;
  pointResidentAt: (x: number, z: number, until: number) => void;

  /**
   * 005-B — the Explorer's errand. A guide exists only while a reader asks for
   * one AND the pair of files really is joined by an import edge: `claim` is the
   * edge the city states, never a sentence written around a guess. `x`/`z` are
   * the target building's own plot point, resolved by the caller from the same
   * layout the city drew — the resident is never handed a place nothing stands.
   * `phase` is the resident's report: `walking` until it arrives, `arrived` once
   * it stands at the target and points.
   */
  guide: GuideRequest | null;
  guidePhase: "walking" | "arrived" | null;
  startGuide: (guide: GuideRequest) => void;
  /**
   * B11 — the Security resident follows the tour without becoming it. Called
   * with the stop the tour just opened: if that building stands on the level the
   * camera has reached, the resident is sent to its frontage; if not, no errand
   * is created and the tour goes on saying what it always said. The tour's own
   * panel, order and Escape stay untouched.
   */
  syncTourGuide: (fileId: string) => void;
  setGuidePhase: (p: "walking" | "arrived") => void;
  cancelGuide: () => void;

  // ── Auto-Gfx (perf.ts): the frame budget decides, until a hand doesn't ─
  autoGfxLite: boolean;
  setAutoGfxLite: (v: boolean) => void;
  /** The same window the governor decides from, published as Hz for the
   *  header. Null until the window is full — a half-seen rate is a guess. */
  frameHz: number | null;
  setFrameHz: (v: number) => void;
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

export type VerifyState =
  | { status: "idle" }
  | { status: "none" }
  | { status: "running" }
  | { status: "aged-out" }
  | { status: "failed" }
  | {
      status: "ran";
      report: VerifyReport;
      beforeId: string;
      /** The earlier scan's own time, when its payload carried one. */
      previousScannedAt?: string;
    };

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
 * source line. The target arithmetic lives in `city/waypoint.ts` — the ONE
 * source both the flight and the screen-edge waypoint read (placement +
 * section base + cell, plus the 0.3 body lift Building applies).
 * No-op when the file/placement/layout has no materialized cell for the
 * line — the caller's previous flyRequest (building center) stays intact.
 */
function flyToVoxel(
  set: (partial: Partial<AppState>) => void,
  city: CityData,
  fileId: string,
  line: number,
): void {
  const target = worldTargetForFinding(city, fileId, line);
  if (!target) return;
  set({
    flyRequest: {
      x: target.x,
      z: target.z,
      distance: 7,
      duration: 1.0,
      targetY: target.y,
      nonce: ++flyNonce,
    },
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
      cityOnly: false,
      selectedResident: null,
      residentIdentity: null,
      residentRole: null,
      residentCall: 0,
      residentPoint: null,
      residentOffer: "open",
      guide: null,
      guidePhase: null,
      shareHero: null,
      // A triage round walks the findings of THIS city. Tearing the city down
      // has to tear the queue down with it: the store used to carry a running
      // round and its anchored total into a Landing screen that holds nothing
      // to count, and only the next `setCityData` cleaned it up.
      triageActive: false,
      triageCursor: 0,
      triageTotal: 0,
      focusedFindingKey: null,
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
   * the behavior this app had before the route existed. A backend that answers
   * and cannot read its file is NOT that: the verdicts are there and lost to
   * this visit, so the screen has to say so instead of showing an unreviewed
   * city, and nothing is merged or pushed over it.
   */
  const adoptMachineVerdicts = async (
    analysisId: string,
    project: string,
    local: Record<string, ReviewStatus>,
  ): Promise<void> => {
    const read = await fetchBackendReviews(analysisId, project);
    if (get().cityData?.analysisId !== analysisId) return; // a newer city arrived
    if (read.state === "unreadable") {
      set({ verdictsUnreadable: true });
      return;
    }
    if (read.state === "absent") return;
    const merged = { ...read.reviews, ...local };
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
    pendingLive: null,
    live: { ...EMPTY_LIVE_STATE },
    setPendingLive: (pending) => set({ pendingLive: pending }),
    setLiveState: (patch) => set({ live: { ...get().live, ...patch } }),
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
      // Under reduced motion the city stands at once: Building.tsx already
      // renders every tower visible and scaled to 1 on the first frame, so a
      // multi-second build counter and crane flight would describe work that
      // is not happening on screen. Skip the schedule entirely.
      const seenBefore = hasCityVisit(data?.analysisId);
      const skipBuild = !seenBefore && prefersReducedMotion();
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
        blastOn: false,
        tourActive: false,
        tourIndex: 0,
        // The deferred surfaces are folded again for a city that has not been
        // asked about yet — the same law the filter and the lens follow above.
        showLegend: false,
        showMinimap: false,
        showHeat: false,
        showSearch: false,
        showEpheVitrine: false,
        showPrimer: false,
        showShortcuts: false,
        cityOnly: false,
        selectedResident: null,
        residentIdentity: null,
        residentRole: null,
        residentCall: 0,
        residentPoint: null,
        residentOffer: "open",
        guide: null,
        guidePhase: null,
        triageActive: false,
        triageCursor: 0,
        triageTotal: 0,
        focusedFindingKey: null,
        cameraMode: "free",
        reviews,
        orphanedReviews: countStrandedVerdicts(reviews, data),
        verdictsBlocked: false,
        // A new city asks the machine copy again; a warning about the last
        // visit's read must not survive into a visit that never made one.
        verdictsUnreadable: false,
        residentNames: loadEpheNames(data),
        residentNamesBlocked: false,
        // V3: a city arrives unarmed — CityScene arms the pulse with the reveal
        // flight of THIS build, and never with one from a previous city.
        revealPulse: null,
        testRun: { status: "idle", stage: "" },
        testResults: {},
        // A NEW scan is a new question about what changed since last time. The
        // history re-enters this door with the same city (App.tsx popstate), and
        // a Back inside the city must not throw away a comparison the reader
        // already asked for.
        verify:
          get().cityData?.analysisId === (data?.analysisId ?? null)
            ? get().verify
            : { status: "idle" },
        buildPhase: data ? (seenBefore || skipBuild ? "built" : "constructing") : "empty",
        buildStartedAt: data ? Date.now() : 0,
        constructionDone: 0,
        constructionTotal: 0,
        // The camera belongs to the address too — but a pose is not a flight, so
        // it goes out on its own channel for the tracker inside the canvas.
        poseRequest: pose ? { pose, nonce: ++poseNonce } : null,
      });
      if (data) recordCityVisit(data);
      // The one place a city reaches the screen is also where "this machine has
      // arrived" gets stamped, so a first-run reading never survives a city. The
      // current `firstRun` is left in place for this visit's welcome to read;
      // only the next launch comes back `false`.
      if (data) markArrived();
      // §03.09 — and the record of the read that produced it is spent. Matched by
      // id, so opening some other city never forgets a run still going.
      if (data?.analysisId) clearPendingRun(data.analysisId);
      // every scan is noted with its folder shape, whether or not anyone asks
      // later: the comparison needs the earlier scan even if it was a drive-by
      if (data?.analysisId) anchorFor(data);
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

    /**
     * A live delta is the SAME visit, not a new one: keep the camera, the
     * focus path, the filters and the open panel. Only a selection whose file
     * left the folder is dropped — a panel about a deleted file would describe
     * something that is no longer on screen.
     */
    applyLiveCityData: (data) => {
      const current = get().cityData;
      if (!current || !data.analysisId || current.analysisId !== data.analysisId) return;
      mergeEngineGaps(data);
      const reviews = loadReviewsForCity(data);
      set({ residentNames: loadEpheNames(data) });
      const selected = get().selectedUnit;
      const keptSelection =
        selected?.kind === "file" ? (findFileById(data, selected.id) ? selected : null) : selected;
      set({
        cityData: data,
        reviews,
        orphanedReviews: countStrandedVerdicts(reviews, data),
        selectedUnit: keptSelection,
      });
      // The dock's triage line prints two numbers side by side: the stepper's
      // `cursor+1 / triageTotal`, both anchored in the store, and the open count
      // recounted from `cityData` (ActionBar.tsx:180-189, :382-388). A delta
      // that changes the finding set changes the length of that queue, so the
      // anchored total has to move with it — `reanchorTriage` keeps the focused
      // finding where it is when the delta leaves it in the queue, and clamps
      // the cursor when the new queue is shorter or empty.
      reanchorTriage(set, get);
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
    sceneRebuildAt: null as number | null,
    requestBuildSkip: () => set({ buildSkipAt: Date.now() }),
    // A fresh canvas is the only reliable way back: this renderer's own
    // `forceContextRestore()` answers "restored" while the frames stay empty
    // (measured twice in a row), so the scene is torn down and rebuilt on a
    // new context instead of being talked into a half-life.
    onContextLost: () => set({ sceneRebuildAt: Date.now() }),
    onContextRestored: () => set({ sceneRebuildAt: null }),
    rebuildScene: () => set({ sceneRebuildAt: Date.now() }),
    verify: { status: "idle" },
    runVerify: async (options) => {
      const city = get().cityData;
      const anchor = anchorFor(city);
      // The record is written when a city arrives (setCityData); a state that
      // was built without a visit (a rehydration, a test harness) still knows
      // the scan's own time from the payload it holds.
      if (anchor && !anchor.scannedAt && city?.createdAt) anchor.scannedAt = city.createdAt;
      if (!city?.analysisId || !anchor?.previousId) {
        // An opening question with no counterpart is not a fact the reader
        // needs on the card; an explicit click that finds none still says so.
        if (!options?.silent) set({ verify: { status: "none" } });
        return;
      }
      // One answer per scan: re-entering the city (history, language switch,
      // a re-derived payload) must not ask the server again.
      const current = get().verify;
      if (current.status === "ran" || current.status === "running" || current.status === "aged-out")
        return;
      set({ verify: { status: "running" } });
      const settle = (next: VerifyState): void => {
        // the reader can leave the city while this is in flight
        if (get().cityData?.analysisId === city.analysisId) set({ verify: next });
      };
      try {
        const answer = await verifyScans(anchor.previousId, city.analysisId);
        settle(
          answer.ok
            ? {
                status: "ran",
                report: answer.report,
                beforeId: anchor.previousId,
                ...(anchor.previousId ? scannedAtOf(anchor.previousId) : undefined),
              }
            : { status: answer.agedOut ? "aged-out" : "failed" },
        );
      } catch {
        settle({ status: "failed" });
      }
    },

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
    requestFly: ({ distance = 40, x = 0, z = 0, ...rest }) =>
      set({ flyRequest: { ...rest, x, z, distance, nonce: ++flyNonce } }),
    poseRequest: null,
    requestPose: (pose) => set({ poseRequest: pose ? { pose, nonce: ++poseNonce } : null }),
    shareHero: null,
    setShareHero: (hero) => set({ shareHero: hero }),
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
    heatDateMs: null,
    setHeatDateMs: (ms) => set({ heatDateMs: ms }),

    viewMode: "structure",
    setViewMode: (m) => set({ viewMode: m }),

    blastOn: false,
    setBlastOn: (v) => set({ blastOn: v }),

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
    verdictsUnreadable: false,
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
    firstRun: !hasArrivedBefore(),
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

    showLegend: false,
    setShowLegend: (v) => set({ showLegend: v }),
    showMinimap: false,
    setShowMinimap: (v) => set({ showMinimap: v }),
    showHeat: false,
    setShowHeat: (v) => set({ showHeat: v }),
    showSearch: false,
    setShowSearch: (v) => set({ showSearch: v }),
    showPrimer: false,
    setShowPrimer: (v) => set({ showPrimer: v }),
    showShortcuts: false,
    setShowShortcuts: (v) => set({ showShortcuts: v }),
    cityOnly: false,
    setCityOnly: (v) =>
      set(
        v
          ? {
              cityOnly: true,
              selectedResident: null,
              residentIdentity: null,
              residentRole: null,
              residentPoint: null,
            }
          : { cityOnly: false },
      ),
    selectedResident: null,
    residentIdentity: null,
    residentRole: null,
    residentNames: {},
    residentNamesBlocked: false,
    epheLook: readEpheLook(),
    epheLookBlocked: false,
    applyEpheLook: (look) =>
      set((s) => {
        const merged = { ...s.epheLook, ...look };
        return { epheLook: merged, epheLookBlocked: !saveEpheLook(merged) };
      }),
    showEpheVitrine: false,
    setShowEpheVitrine: (v) => set({ showEpheVitrine: v }),
    nameResident: (key, name) =>
      set((s) => {
        const next = { ...s.residentNames };
        const kept = normaliseName(name);
        if (kept === "") delete next[key];
        else next[key] = kept;
        // Durable when the address names a plot; a `street:` name is a crowd
        // number of this level and is deliberately not written anywhere.
        const written = saveEpheName(get().cityData, key, name);
        return { residentNames: next, residentNamesBlocked: !written };
      }),
    selectResident: (index, identity = null, role = null) =>
      set(
        index === null
          ? {
              selectedResident: null,
              residentIdentity: null,
              residentRole: null,
              residentPoint: null,
            }
          : {
              selectedResident: index,
              residentIdentity: identity,
              residentRole: role,
              residentPoint: null,
              residentOffer: "taken",
            },
      ),
    residentCall: 0,
    requestResidentCall: () => set((s) => ({ residentCall: s.residentCall + 1 })),
    residentGreet: 0,
    requestResidentGreet: () => set((s) => ({ residentGreet: s.residentGreet + 1 })),
    residentGreeted: 0,
    markResidentGreeted: (nonce) => set({ residentGreeted: nonce }),
    residentOffer: "open",
    setResidentOffer: (v) => set({ residentOffer: v }),
    residentPoint: null,
    pointResidentAt: (x, z, until) => set({ residentPoint: { x, z, until } }),

    // ── 005-B Ephe guides ────────────────────────────────────────────────────
    guide: null,
    guidePhase: null,
    startGuide: (guide) => set({ guide, guidePhase: "walking" }),
    syncTourGuide: (fileId) => {
      const { cityData } = get();
      if (!cityData || prefersReducedMotion()) return;
      const hit = findFileById(cityData, fileId);
      if (!hit) return;
      const claim = securityClaimFor(hit.file);
      // No finding, nothing to point at. The tour says what the payload holds
      // and the resident stays a resident.
      if (!claim) return;
      const placement = getDirLayout(cityData, hit.chain).buildings.find(
        (b) => b.file.id === fileId,
      );
      // Same frontage rule the Explorer got: the plot centre is inside the
      // tower, and a guide that arrives behind the building it explains has led
      // the reader nowhere.
      if (!placement) return;
      set({
        guide: {
          role: "security",
          targetFileId: fileId,
          x: placement.x,
          z: placement.z + placement.d / 2 + 0.8,
          claim,
        },
        guidePhase: "walking",
      });
    },
    setGuidePhase: (p) => set({ guidePhase: p }),
    cancelGuide: () => set({ guide: null, guidePhase: null }),

    autoGfxLite: false,
    setAutoGfxLite: (v) => set({ autoGfxLite: v }),
    frameHz: null,
    setFrameHz: (v) => set({ frameHz: v }),
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
      if (stop) {
        get().navigateToFile(stop.file.id);
        get().syncTourGuide(stop.file.id);
      }
    },
    // The tour ends: the resident that was following it has no stop left to
    // point at. Only its own errand is cleared — an Explorer the reader sent
    // out on their own question is not the tour's to cancel.
    endTour: () => {
      if (get().guide?.role === "security") set({ guide: null, guidePhase: null });
      set({ tourActive: false });
    },
    nextTour: () => {
      const { cityData, tourIndex } = get();
      if (!cityData) return;
      const stops = tourStops(cityData);
      if (stops.length === 0) return;
      const next = Math.min(stops.length - 1, tourIndex + 1);
      set({ tourIndex: next });
      const stop = stops[next]!;
      get().navigateToFile(stop.file.id);
      get().syncTourGuide(stop.file.id);
    },
    prevTour: () => {
      const { cityData, tourIndex } = get();
      if (!cityData) return;
      const stops = tourStops(cityData);
      if (stops.length === 0) return;
      const prev = Math.max(0, tourIndex - 1);
      set({ tourIndex: prev });
      const stop = stops[prev]!;
      get().navigateToFile(stop.file.id);
      get().syncTourGuide(stop.file.id);
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
