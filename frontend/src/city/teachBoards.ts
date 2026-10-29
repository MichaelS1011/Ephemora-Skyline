/**
 * The three teaching boards on the empty ground around the city.
 *
 * Why they exist: the picture can show that a folder became a district and a
 * file became a house, but it cannot say what it did NOT look at. Three boards
 * do: the metaphor with this city's numbers, the heaviest open finding, and the
 * honest list of what the scan never checked. They are scenery — no DOM, no
 * focus stop, no click, no motion.
 *
 * Why this file is pure: placement and copy are measurements, and a measurement
 * that can only be taken with a renderer is not held by anything. The component
 * (`components/TeachBoards.tsx`) draws what this module decides; the guard
 * (`tests/teachBoards.test.ts`) reads the decisions without a canvas.
 *
 * ── Where they stand, and the number that decided it ──────────────────────
 *
 * The arrival pose looks DOWN at 0,52 rad, so the near ground is compressed
 * into the bottom slice of the frame: on the demo, the ground at the distance a
 * board would need to stand outside the level's road ring (camera-to-centre
 * minus `bounds` ≈ 28 m) already lies below the bottom edge. Measured at
 * 1280×800 with the arrival camera rebuilt below: NO ground point further from
 * the centre than `bounds` projects inside the frame at all — the plane's near
 * rim lands at y ≈ 1180 while the frame ends at 800. "Outside the city"
 * therefore means what it can mean here: on free ground, off every plot
 * footprint, with the level's silhouette untouched. The search takes the widest
 * gaps the projected city leaves, and `tests/teachBoards.test.ts` holds that
 * literally (no board rectangle may touch a plot rectangle).
 */

import * as THREE from "three";
import { overviewShot, type DirLayout } from "./layout";
import { surfaceHeight, type WorldSurface } from "./worldSurface";
import { WORLD_AZIMUTH, WORLD_FOV_DEG, WORLD_PIVOT_Y } from "./worldFraming";
import { missingEnginesForProject } from "./provenance";
import type { CityData, CityDir, CityFile, CityFinding, Severity } from "./types";
import { formatCount, t, type Lang } from "../i18n";

// ── The plate ──────────────────────────────────────────────────────────────

/** The canvas every board is drawn on. One size for all three: a board is a
 *  board, and a second canvas would be a second set of type sizes. */
export const BOARD_CANVAS = { width: 768, height: 480 } as const;
export const BOARD_ASPECT = BOARD_CANVAS.width / BOARD_CANVAS.height;

/**
 * The plate's type, in canvas pixels. The title is the board's main line — the
 * one the arrival legibility floor is measured on. The body is set smaller
 * because it is read once the reader has flown closer; on arrival it is the
 * TITLE that has to carry the sentence.
 */
export const BOARD_TYPE = {
  title: 74,
  titleMin: 52,
  titleLead: 88,
  body: 42,
  bodyMin: 28,
  bodyLead: 52,
  pad: 40,
  /** The rule that separates the main line from the evidence. */
  rule: 4,
} as const;

/** The two faces the plate sets: prose in the UI face, numbers and paths in the
 *  mono face the rest of the product uses for measurements. */
export const BOARD_FONT = {
  title: '"Avenir Next", "Segoe UI", ui-sans-serif, system-ui, sans-serif',
  body: '"JetBrains Mono", ui-monospace, Menlo, monospace',
} as const;

/**
 * Cap height as a share of the em, for both faces. Measured with
 * `measureText('H').actualBoundingBoxAscent` at 100 px: JetBrains Mono 73 px,
 * the UI sans 72 px — one number, because they differ by one pixel at every
 * size the plate sets.
 */
export const CAP_RATIO = 0.725;

/** Cap height of the main line as a share of the board's height. */
export const TITLE_CAP_FRACTION = (BOARD_TYPE.title * CAP_RATIO) / BOARD_CANVAS.height;

/** The picture a board is placed in: the CITY CANVAS, in CSS pixels, as the
 *  caller measures it. Not the window: at a 1280×800 window the picture is
 *  964×800 and at 1440×900 it is 1124×900, because the project card's column
 *  costs 316 px beside it. Every frame limit, every axis distance and every
 *  `capPx` below is a statement about THIS picture — computed against the
 *  window, it would describe a frame that is never rendered. */
export interface CanvasMeasure {
  width: number;
  height: number;
}

/** The measure is asked for, never assumed: a placement that guesses a frame
 *  reports a size nobody reads, which is the exact false all-clear this module
 *  was written to avoid. */
function requireCanvasMeasure(canvas: CanvasMeasure | null | undefined): CanvasMeasure {
  if (
    !canvas ||
    !Number.isFinite(canvas.width) ||
    !Number.isFinite(canvas.height) ||
    canvas.width < 1 ||
    canvas.height < 1
  )
    throw new Error(
      "teachBoards: the picture's own measure is missing — pass the canvas the boards are drawn into (clientWidth/clientHeight), not the window around it",
    );
  return { width: canvas.width, height: canvas.height };
}

/** Focal length of a picture in pixels: half its height over tan(half fov). The
 *  vertical measure of the frame is what sets it, so one number serves a 964×800
 *  and a 1124×900 canvas alike. */
export const focalPxFor = (canvas: CanvasMeasure): number =>
  canvas.height / 2 / Math.tan((WORLD_FOV_DEG * Math.PI) / 360);

/**
 * How tall a plate's OWN EDGE stands in the picture, in pixels.
 *
 * It used to name the height of the plate's bounding box, and that is what it
 * delivered: a plate yawed to face the arrival eye is turned on screen, so its
 * box spans from the near top corner to the far bottom corner and reads TALLER
 * than the plate. Measured at the shipped arrival pose: box 124 px on all three
 * plates, edge 93,8 / 94,5 / 67,8 px — and the type rides the edge, so the main
 * line came out at 10,2–10,3 px of cap where the module reported 13,86 px.
 *
 * 124 px on the edge is the number the free ground allows AND the number the
 * type needs: the main line then carries 124 × 0,1118 = 13,9 px of cap in EITHER
 * picture the product renders (measured 13,53–13,57 px with the shipped fonts),
 * the body 7,9 px. The operator's floor is 11 px on the main line. The BOX the
 * same plate draws is 1,3–1,8× that, and it is the box that is checked against
 * the frame below — never the promise.
 */
export const TARGET_EDGE_PX = 124;

/** How far the three plates' BODY heights may drift apart. Each plate is cut so
 *  it reads the same on screen, which makes a nearer one shorter in the world;
 *  half the height is as much of that as reads as one family rather than three
 *  different signs. */
export const BOARD_SIZE_BAND = 0.5;

// ── How a sentence is fitted to a plate ────────────────────────────────────

/**
 * One plate's line breaking.
 *
 * A plate has no second chance at its right edge: what does not fit is cut.
 * Breaking at spaces is not enough, because the finding board names a rule and
 * a rule id arrives from the scanner as ONE word — `sarif-mapper.ts:112` hands
 * `res.ruleId` through untouched, and a dotted semgrep id runs to sixty
 * characters, which at the plate's body size is 1.638 canvas pixels against a
 * 688 pixel plate. Measured on the shipped painter: five rows of that plate's
 * ink reach the last column and are lost.
 *
 * So a word wider than the plate is broken AT the plate rather than cut by it.
 *
 * `measure` is the caller's font — the decision lives here, the metrics stay
 * with the canvas, which is what lets `tests/teachBoards.test.ts` hold the rule
 * without a renderer.
 */
export function wrapPlate(
  text: string,
  maxWidth: number,
  measure: (line: string) => number,
): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    let token = word;
    while (measure(token) > maxWidth) {
      let lo = 1;
      let hi = token.length;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (measure(token.slice(0, mid)) <= maxWidth) lo = mid;
        else hi = mid - 1;
      }
      if (line) out.push(line);
      out.push(token.slice(0, lo));
      line = "";
      token = token.slice(lo);
    }
    const test = line ? `${line} ${token}` : token;
    if (!line || measure(test) <= maxWidth) line = test;
    else {
      out.push(line);
      line = token;
    }
  }
  if (line) out.push(line);
  return out;
}

// ── What stands on a board ─────────────────────────────────────────────────

/** One board's text, already in the reader's language and the city's numbers. */
export interface BoardText {
  title: string;
  lines: string[];
}

export type BoardId = "file" | "finding" | "honesty";

export interface BoardCopy {
  id: BoardId;
  text: BoardText;
}

const SEVERITY_RANK: Record<Severity, number> = { P0: 0, P1: 1, P2: 2 };

/** Every file in the payload, at any depth — the same walk the panel uses. */
function everyFile(city: CityData): CityFile[] {
  const out: CityFile[] = [...(city.additionalFiles ?? [])];
  const walk = (dir: CityDir): void => {
    out.push(...dir.detailFiles, ...dir.districtFiles);
    for (const child of dir.children) walk(child);
  };
  walk(city.tree);
  return out;
}

export function totalFindings(city: CityData): number {
  const s = city.findingsBySeverity;
  return (s.P0 ?? 0) + (s.P1 ?? 0) + (s.P2 ?? 0);
}

/** A finding that carries its file, for the board that has to name one. */
export interface OpenFinding {
  severity: Severity;
  ruleId: string;
  /** Last two path segments: the whole path does not fit a board, and the file
   *  name alone loses which folder it lives in. */
  file: string;
  line: number;
}

function shortPath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts.slice(-2).join("/");
}

/**
 * The heaviest finding the reader has not answered yet.
 *
 * `answered` is the app's own verdict map (`reviews`): a finding is open while
 * it carries no verdict, and a `false-positive` is answered too (`reviews.ts`
 * keys it, `openTriageCount` counts it). Dismissed findings are skipped rather
 * than hidden, so the board names the worst thing that is still standing.
 */
export function heaviestOpenFinding(
  city: CityData,
  answered: (file: CityFile, index: number, finding: CityFinding) => boolean = () => false,
): OpenFinding | null {
  let best: OpenFinding | null = null;
  for (const file of everyFile(city)) {
    for (let index = 0; index < file.findings.length; index += 1) {
      const finding = file.findings[index]!;
      if (answered(file, index, finding)) continue;
      const candidate: OpenFinding = {
        severity: finding.severity,
        ruleId: finding.ruleId ?? finding.type,
        file: shortPath(file.path),
        line: finding.line,
      };
      if (
        !best ||
        SEVERITY_RANK[candidate.severity] < SEVERITY_RANK[best.severity] ||
        (SEVERITY_RANK[candidate.severity] === SEVERITY_RANK[best.severity] &&
          candidate.line > best.line)
      )
        best = candidate;
    }
  }
  return best;
}

/**
 * The set-aside total — the ONE owner of the number on the honesty board's
 * fourth line: the paths the reader excluded through `config.excludePaths`
 * plus the `.git` objects the scan budget cut off. `gitIgnored` is deliberately
 * NOT in this sum: it already has two speakers (`ContextCard`'s skip line over
 * `skippedByGitignore.files`, `ScanSummary`'s row over `dropped.gitIgnored`),
 * and a third voice for one number is what this product forbids.
 *
 * The line below is the only place the two causes are added; reading the sum
 * anywhere else means reading it here.
 */
export function setAsideTotal(city: CityData): number {
  const dropped = city.dropped;
  if (!dropped) return 0;
  return (dropped.excluded ?? 0) + (dropped.gitBudget ?? 0);
}

/**
 * The honest board's sentences, in the reader's language.
 *
 * Everyday words, no engine internals: what did not run is named, what the
 * payload itself calls unchecked is counted, and a payload that says nothing
 * about its own depth says exactly that instead of a reassuring zero. Every
 * sentence is a statement about THIS payload — nothing is assumed.
 */
export function honestyLines(city: CityData, lang: Lang): string[] {
  const lines: string[] = [];
  const provenance = city.scanProvenance;
  if (!provenance) {
    lines.push(t(lang, "teach.honesty.noProvenance"));
    return lines;
  }
  const missing = missingEnginesForProject(provenance, city.languages);
  // `regex: false` means even the house rules stood still: on that payload the
  // missing engines are not a gap in an audit, they are the whole audit.
  if (provenance.regex !== true) lines.push(t(lang, "teach.honesty.noScanner"));
  else if (missing.length > 0)
    lines.push(t(lang, "teach.honesty.missing", { engines: missing.join(", ") }));

  const unchecked = city.unverifiedFiles ?? 0;
  if (unchecked > 0)
    lines.push(
      t(lang, "teach.honesty.unverified", {
        n: formatCount(lang, unchecked),
        total: formatCount(lang, city.totalFiles),
      }),
    );

  const history: string[] = [];
  if (provenance.churn !== true)
    history.push(
      provenance.churnInterrupted === true
        ? t(lang, "teach.honesty.churnCut")
        : t(lang, "teach.honesty.churn"),
    );
  if (provenance.coverage !== true) history.push(t(lang, "teach.honesty.coverage"));
  if (provenance.duplicates !== true) history.push(t(lang, "teach.honesty.duplicates"));
  if (history.length > 0) lines.push(history.slice(0, 2).join(" · "));

  const dropped = city.dropped;
  const neverRead = dropped
    ? dropped.tooLarge +
      dropped.unreadable +
      dropped.unsafePath +
      dropped.pathTooLong +
      dropped.unsupportedFormat +
      (dropped.preview ?? 0)
    : 0;
  if (neverRead > 0)
    lines.push(t(lang, "teach.honesty.dropped", { n: formatCount(lang, neverRead) }));

  // The fourth line, and its one owner: what the reader's own exclusions and
  // the git budget kept out of the city. Only when there IS such a path —
  // zero would say nothing, and `gitIgnored` is not in this sentence: that
  // number already has its two speakers elsewhere in the product.
  const setAside = setAsideTotal(city);
  if (setAside > 0)
    lines.push(
      t(lang, setAside === 1 ? "teach.honesty.setAsideOne" : "teach.honesty.setAsideMany", {
        n: formatCount(lang, setAside),
        excluded: formatCount(lang, dropped?.excluded ?? 0),
        gitBudget: formatCount(lang, dropped?.gitBudget ?? 0),
      }),
    );

  if (provenance.live) lines.push(t(lang, "teach.honesty.live"));
  // A board with a title and nothing under it is a frame, not a statement.
  if (lines.length === 0) lines.push(t(lang, "teach.honesty.complete"));
  return lines;
}

/** The three boards' text, in the order they stand on the ground. */
export function boardCopy(
  city: CityData,
  lang: Lang,
  answered?: (file: CityFile, index: number, finding: CityFinding) => boolean,
): BoardCopy[] {
  const files = formatCount(lang, city.totalFiles);
  const findings = formatCount(lang, totalFindings(city));
  const heaviest = heaviestOpenFinding(city, answered);

  const fileBoard: BoardText = {
    title: t(lang, "teach.file.title"),
    lines: [
      t(lang, "teach.file.metaphor"),
      t(lang, "teach.file.files", { n: files }),
      t(lang, "teach.file.findings", { n: findings }),
    ],
  };

  const findingBoard: BoardText = heaviest
    ? {
        title: t(lang, "teach.finding.title"),
        lines: [
          `${heaviest.severity} · ${heaviest.ruleId}`,
          heaviest.file,
          t(lang, "teach.finding.line", { line: formatCount(lang, heaviest.line) }),
        ],
      }
    : {
        title: t(lang, "teach.finding.title"),
        lines: [
          totalFindings(city) === 0
            ? t(lang, "teach.finding.noneClean")
            : t(lang, "teach.finding.none"),
          t(lang, "teach.file.files", { n: files }),
        ],
      };

  return [
    { id: "file", text: fileBoard },
    { id: "finding", text: findingBoard },
    {
      id: "honesty",
      text: { title: t(lang, "teach.honesty.title"), lines: honestyLines(city, lang) },
    },
  ];
}

// ── Where they stand ───────────────────────────────────────────────────────

/** The arrival camera, rebuilt from the functions the flight itself uses. */
export interface ArrivalView {
  eye: THREE.Vector3;
  target: THREE.Vector3;
  forward: THREE.Vector3;
  right: THREE.Vector3;
  up: THREE.Vector3;
  /** Horizontal distance from the eye to the level's centre. */
  toCentre: number;
  /** The descent of the arrival shot, in radians (the flight's own number). */
  elevation: number;
  /** The picture everything is projected INTO — the canvas, from the caller. */
  canvas: CanvasMeasure;
  /** Half the canvas height over tan(half fov), in canvas pixels. */
  focalPx: number;
}

export function arrivalView(
  layout: DirLayout,
  surface: WorldSurface,
  canvas: CanvasMeasure,
): ArrivalView {
  const measure = requireCanvasMeasure(canvas);
  const tallest = Math.max(
    0,
    ...layout.blocks.flatMap((b) => b.skyline.map((s) => s.h)),
    ...layout.buildings.map((b) => b.h),
  );
  const shot = overviewShot(layout.bounds, tallest);
  const elevation = shot.elevation ?? 0.52;
  const target = new THREE.Vector3(
    layout.centre.x,
    surfaceHeight(surface, layout.centre.x, layout.centre.z) +
      Math.max(WORLD_PIVOT_Y, tallest * 0.4),
    layout.centre.z,
  );
  const eye = target
    .clone()
    .add(
      new THREE.Vector3(
        Math.cos(WORLD_AZIMUTH) * Math.cos(elevation),
        Math.sin(elevation),
        Math.sin(WORLD_AZIMUTH) * Math.cos(elevation),
      ).multiplyScalar(shot.dist),
    );
  const forward = target.clone().sub(eye).normalize();
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, forward).normalize();
  return {
    eye,
    target,
    forward,
    right,
    up,
    toCentre: Math.hypot(eye.x - layout.centre.x, eye.z - layout.centre.z),
    elevation,
    canvas: measure,
    focalPx: focalPxFor(measure),
  };
}

export interface ScreenPoint {
  x: number;
  y: number;
  /** Distance along the view axis. */
  depth: number;
}

export interface ScreenRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Project a world point into the picture the view carries. */
export function projectPoint(view: ArrivalView, p: THREE.Vector3): ScreenPoint {
  const rel = p.clone().sub(view.eye);
  const depth = rel.dot(view.forward);
  const safe = Math.max(depth, 0.001);
  const halfH = Math.tan((WORLD_FOV_DEG * Math.PI) / 360);
  const halfW = halfH * (view.canvas.width / view.canvas.height);
  const nx = rel.dot(view.right) / (safe * halfW);
  const ny = rel.dot(view.up) / (safe * halfH);
  return {
    x: (nx * 0.5 + 0.5) * view.canvas.width,
    y: (-ny * 0.5 + 0.5) * view.canvas.height,
    depth,
  };
}

/** The yaw that turns a plane's drawn face (local +z) toward the arrival eye. */
export function faceYaw(view: ArrivalView, x: number, z: number): number {
  return Math.atan2(view.eye.x - x, view.eye.z - z);
}

/** A board's four screen CORNERS for a given base, size and facing — the box
 *  they fill, which is what the frame and the plots have to be measured
 *  against. It is NOT the plate's height: see `plateEdgePx`. */
export function boardScreenRect(
  view: ArrivalView,
  x: number,
  groundY: number,
  z: number,
  width: number,
  height: number,
): ScreenRect {
  const yaw = faceYaw(view, x, z);
  const across = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const centre = new THREE.Vector3(x, groundY, z);
  const points: ScreenPoint[] = [];
  for (const sx of [-0.5, 0.5])
    for (const sy of [0, 1]) {
      const p = centre
        .clone()
        .addScaledVector(across, sx * width)
        .add(new THREE.Vector3(0, sy * height, 0));
      points.push(projectPoint(view, p));
    }
  return {
    x0: Math.min(...points.map((p) => p.x)),
    y0: Math.min(...points.map((p) => p.y)),
    x1: Math.max(...points.map((p) => p.x)),
    y1: Math.max(...points.map((p) => p.y)),
  };
}

/**
 * The plate's OWN vertical measure on screen: the projected midline of its
 * edge, from the middle of the bottom edge to the middle of the top edge.
 *
 * This is the height the plate is painted at — 480 canvas pixels of board map
 * to this line, and the type is set against it. `boardScreenRect` bounds all
 * four corners, and because the plate is turned to look at the eye those corners
 * sit at different depths and different heights: at the shipped arrival the box
 * measured 124 px where the same three plates' edges measured 93,8 / 94,5 /
 * 67,8 px. Sizing a plate by its box is how it promised 13,9 px and drew 10,2.
 */
export function plateEdgePx(
  view: ArrivalView,
  x: number,
  groundY: number,
  z: number,
  height: number,
): number {
  const bottom = projectPoint(view, new THREE.Vector3(x, groundY, z));
  const top = projectPoint(view, new THREE.Vector3(x, groundY + height, z));
  return Math.hypot(top.x - bottom.x, top.y - bottom.y);
}

/** A plot, as a footprint to stand off and a silhouette to leave alone. */
interface PlotBox {
  x: number;
  z: number;
  w: number;
  d: number;
  top: number;
}

function plotBoxes(layout: DirLayout): PlotBox[] {
  const boxes: PlotBox[] = [];
  for (const b of layout.buildings) boxes.push({ x: b.x, z: b.z, w: b.w, d: b.d, top: b.h });
  for (const b of layout.blocks) {
    const top = Math.max(1, ...b.skyline.map((s) => s.h), ...(b.strip ?? []).map((s) => s.h));
    boxes.push({ x: b.x, z: b.z, w: b.w, d: b.d, top });
  }
  return boxes;
}

/** How far a footprint's edge is from a point — negative inside. */
function edgeDistance(box: PlotBox, x: number, z: number): number {
  const dx = Math.abs(x - box.x) - box.w / 2;
  const dz = Math.abs(z - box.z) - box.d / 2;
  return Math.max(dx, dz);
}

/** A plot's silhouette in the frame: the eight corners of its box. */
export function plotRects(
  layout: DirLayout,
  surface: WorldSurface,
  view: ArrivalView,
): ScreenRect[] {
  return plotBoxes(layout).map((box) => {
    const pts: ScreenPoint[] = [];
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        for (const y of [0, box.top]) {
          const px = box.x + (sx * box.w) / 2;
          const pz = box.z + (sz * box.d) / 2;
          const py = surfaceHeight(surface, px, pz) + y;
          pts.push(projectPoint(view, new THREE.Vector3(px, py, pz)));
        }
    return {
      x0: Math.min(...pts.map((p) => p.x)),
      y0: Math.min(...pts.map((p) => p.y)),
      x1: Math.max(...pts.map((p) => p.x)),
      y1: Math.max(...pts.map((p) => p.y)),
    };
  });
}

/** Screen air between two rectangles; negative when they overlap. */
export function rectGap(a: ScreenRect, b: ScreenRect): number {
  const dx = Math.max(b.x0 - a.x1, a.x0 - b.x1, 0);
  const dy = Math.max(b.y0 - a.y1, a.y0 - b.y1, 0);
  if (dx > 0 || dy > 0) return Math.hypot(dx, dy);
  const overlapX = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const overlapY = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return -Math.min(overlapX, overlapY);
}

/**
 * The reading area: the part of the PICTURE the arrival leaves uncovered.
 *
 * Not a taste — the chrome the app mounts on arrival holds these bands, and a
 * board behind a panel is a board nobody reads. Measured in canvas coordinates
 * on the shipped arrival, at both pictures the product renders (964×800 in a
 * 1280×800 window, 1124×900 in a 1440×900 one): the workspace header lies over
 * y 0…64, the scan summary over y 128…250 and x up to 712, the action dock over
 * y 726…792. The plate therefore keeps to y ≥ 9 % and y ≤ 90 % of the frame —
 * the dock and the header are what those two numbers are — and 2 % of the
 * width off each rim.
 *
 * There is no left band for the project card: it stands at window x 22…294 and
 * the picture begins at window x 316, so the card column is OUTSIDE the frame
 * the boards are placed in. Reading its 294 px off a 1280 px window as 26 % of
 * the picture is what made the old search give away a quarter of the ground it
 * could have used, and still put a plate 2 px from the canvas's right edge.
 */
export const READING_AREA = { left: 0.02, right: 0.02, top: 0.09, bottom: 0.9 } as const;

/** Frame margins a board may not cross at the reference viewport. */
const MARGIN_PX = 10;
/** A board stands at least this far from a plot's footprint edge. */
const PLOT_CLEARANCE = 2.5;
/** Two boards' rectangles keep this much air between them. */
const BOARD_GAP_PX = 20;
/** Screen distance between two boards' centres, as a share of the frame width,
 *  so the three do not pile into one corner. */
const BOARD_SPREAD = 0.17;
/** How many pair tests one set attempt may spend. A bound, not a tuning knob:
 *  the search runs on every city the reader loads, and its cost must not follow
 *  the candidate count cubed. */
const SEARCH_BUDGET = 120_000;

export interface BoardPlacement {
  /** Base centre on the ground. */
  x: number;
  y: number;
  z: number;
  /** Rotation about Y so the drawn face looks at the arrival eye. */
  yaw: number;
  width: number;
  height: number;
  /** Distance along the arrival view axis, for the legibility arithmetic. */
  depth: number;
  /** The box the board's four corners fill in the picture it was placed for.
   *  Frame and plot clearances are measured on this, never on `edgePx`. */
  rect: ScreenRect;
  /** The plate's own edge on screen — bottom-centre to top-centre, in canvas
   *  pixels. This is the height the 480 px of board are painted into. */
  edgePx: number;
  /** Main line's cap height there, from the same projection, on the edge. */
  capPx: number;
}

export interface BoardPlan {
  view: ArrivalView;
  boards: BoardPlacement[];
  /** The plots' silhouettes in the same picture, for the guard. */
  plots: ScreenRect[];
}

/** The world height whose plate EDGE is `targetPx` tall at this ground point. */
function heightForScreen(
  view: ArrivalView,
  x: number,
  y: number,
  z: number,
  targetPx: number,
): { height: number; rect: ScreenRect; edgePx: number } {
  let height = (targetPx * 40) / view.focalPx;
  let rect = boardScreenRect(view, x, y, z, height * BOARD_ASPECT, height);
  let edgePx = plateEdgePx(view, x, y, z, height);
  for (let i = 0; i < 6; i += 1) {
    // The plate's own line, not the box around its corners: a plate turned to
    // the eye fills a box 1,3–1,8x taller than the edge its type rides on.
    if (!(edgePx > 1)) break;
    height *= targetPx / edgePx;
    rect = boardScreenRect(view, x, y, z, height * BOARD_ASPECT, height);
    edgePx = plateEdgePx(view, x, y, z, height);
  }
  return { height, rect, edgePx };
}

/**
 * The placements: three where three stand.
 *
 * `canvas` is the picture the boards will be drawn into — the caller measures
 * it, this module does not guess it.
 *
 * The search runs over the ground the camera actually sees. A candidate
 * survives only when its plate is inside the reading area, clear of every plot
 * footprint on the ground and clear of every plot's silhouette on screen. The
 * survivors are taken widest-gap first and spread across the frame, until three
 * stand — and if the picture holds fewer than three plates at the promised
 * edge, `boards` carries fewer. The caller must say so; it must not answer by
 * cutting the plates smaller. The height is solved per place so all plates are
 * the SAME SIZE ON SCREEN — boards of one exhibition, read from one viewpoint.
 */
export function planBoardPlacements(
  layout: DirLayout,
  surface: WorldSurface,
  canvas: CanvasMeasure,
): BoardPlan {
  const view = arrivalView(layout, surface, canvas);
  const plots = plotRects(layout, surface, view);
  const boxes = plotBoxes(layout);
  const W = view.canvas.width;
  const H = view.canvas.height;
  const limits = {
    x0: Math.max(MARGIN_PX, W * READING_AREA.left),
    y0: Math.max(MARGIN_PX, H * READING_AREA.top),
    x1: W * (1 - READING_AREA.right) - MARGIN_PX,
    y1: H * READING_AREA.bottom - MARGIN_PX,
  };
  const halfWidthAt = (depth: number): number =>
    Math.tan((WORLD_FOV_DEG * Math.PI) / 360) * (W / H) * depth;

  interface Candidate {
    x: number;
    z: number;
    y: number;
    depth: number;
    height: number;
    rect: ScreenRect;
    edgePx: number;
    gap: number;
  }
  const candidates: Candidate[] = [];
  const step = Math.max(1.4, layout.bounds / 56);
  for (let d = view.toCentre * 0.4; d <= view.toCentre * 1.05; d += step) {
    const depthAt = Math.max(
      4,
      d * Math.cos(view.elevation) + (view.eye.y - view.target.y) * Math.sin(view.elevation),
    );
    const span = halfWidthAt(depthAt);
    for (let s = -span; s <= span; s += step) {
      const x = view.eye.x + view.forward.x * d + view.right.x * s;
      const z = view.eye.z + view.forward.z * d + view.right.z * s;
      if (!boxes.every((box) => edgeDistance(box, x, z) >= PLOT_CLEARANCE)) continue;
      const y = surfaceHeight(surface, x, z);
      const depth = new THREE.Vector3(x, y, z).sub(view.eye).dot(view.forward);
      if (depth <= 8) continue;
      const { height, rect, edgePx } = heightForScreen(view, x, y, z, TARGET_EDGE_PX);
      if (rect.x0 < limits.x0 || rect.y0 < limits.y0 || rect.x1 > limits.x1 || rect.y1 > limits.y1)
        continue;
      const gap = Math.min(...plots.map((p) => rectGap(rect, p)));
      if (gap < 6) continue;
      candidates.push({ x, z, y, depth, height, rect, edgePx, gap });
    }
  }

  candidates.sort((a, b) => b.gap - a.gap);

  /**
   * Three boards of one exhibition — and as many as the picture actually holds.
   *
   * Each candidate already carries the height that makes ITS plate EDGE read
   * `TARGET_EDGE_PX` tall, so the plates read the same on screen while their
   * bodies differ by up to `BOARD_SIZE_BAND` — a nearer plate is shorter in the
   * world for the same reading size, exactly as a sign is cut for the distance
   * it is read from. The band is what keeps that from turning into three
   * different signs.
   *
   * The set is searched in the same widest-gap-first order, but for the LARGEST
   * set that stands: taking the best single place and then whatever still fits
   * beside it is what left ONE board standing where two fit, because the
   * widest-gap plate is by construction the big one that fills the frame. Three
   * are tried first, then two; the test budget bounds the search to what the
   * candidate list costs, never to its cube. Every candidate has already passed
   * the frame and the plot silhouettes on its own, so only the rules BETWEEN two
   * plates are left to check.
   */
  const fitsTogether = (a: Candidate, b: Candidate): boolean => {
    if (Math.max(a.height, b.height) > Math.min(a.height, b.height) * (1 + BOARD_SIZE_BAND))
      return false;
    if (rectGap(a.rect, b.rect) < BOARD_GAP_PX) return false;
    const cx = (a.rect.x0 + a.rect.x1) / 2;
    const ox = (b.rect.x0 + b.rect.x1) / 2;
    return Math.abs(cx - ox) >= W * BOARD_SPREAD;
  };
  let chosen: Candidate[] = [];
  for (let want = 3; want >= 2 && chosen.length === 0; want -= 1) {
    let budget = SEARCH_BUDGET;
    const take = (from: number, set: Candidate[]): boolean => {
      if (set.length === want) return true;
      for (let k = from; k < candidates.length && budget > 0; k += 1) {
        budget -= 1;
        const candidate = candidates[k]!;
        if (!set.every((s) => fitsTogether(s, candidate))) continue;
        set.push(candidate);
        if (take(k + 1, set)) return true;
        set.pop();
      }
      return false;
    };
    const set: Candidate[] = [];
    if (take(0, set)) chosen = set;
  }
  // Three were asked for. Where the picture holds three, three stand; where it
  // holds two, two; one place is never thrown away on top of that.
  if (chosen.length === 0 && candidates.length > 0) chosen = [candidates[0]!];

  const boards: BoardPlacement[] = chosen
    .slice()
    .sort((a, b) => a.x - b.x)
    .map((c) => {
      const rect = boardScreenRect(view, c.x, c.y, c.z, c.height * BOARD_ASPECT, c.height);
      const edgePx = plateEdgePx(view, c.x, c.y, c.z, c.height);
      const depth = new THREE.Vector3(c.x, c.y, c.z).sub(view.eye).dot(view.forward);
      return {
        x: c.x,
        y: c.y,
        z: c.z,
        yaw: faceYaw(view, c.x, c.z),
        width: c.height * BOARD_ASPECT,
        height: c.height,
        depth,
        rect,
        edgePx,
        // The main line rides the plate's own edge. The box around its corners
        // is 1,3–1,8x taller and would report a cap the picture never draws.
        capPx: edgePx * TITLE_CAP_FRACTION,
      };
    });

  return { view, boards, plots };
}
