"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { useStore } from "../stores/useStore";
import {
  allFiles,
  builtExtent,
  craneShot,
  getDirLayout,
  landmarkFileId,
  planConstruction,
  undergroundPlateLine,
} from "../city/layout";
import { buildSidewalkNetwork, plazaLanes } from "../city/sidewalks";
import { ENV } from "../city/palette";
import { SurfaceAnchor, SurfaceCurves } from "../render/WorldSurface";
import { reviewKeyFor } from "../reviews";
import type { CityDir, CityFile } from "../city/types";
import type { Lang } from "../i18n";
import { RoadSystem } from "./RoadSystem";
import { District } from "./District";
import { Building } from "./Building";
import { CityConnections } from "./CityConnections";
import { DependencyFlows } from "./DependencyFlows";
import { CloneLasers } from "./CloneLasers";
import { HeatCells } from "./HeatCells";
import { Pedestrians } from "./Pedestrians";
import { useLodLevel } from "../hooks/useLodLevel";
import { LOD_THRESHOLDS } from "../hooks/useLodFar";
import { computeFocusTiers, type FocusTier } from "../city/focus";
import { planBlastRadius, type BlastNode } from "../city/blastRadius";
import "../design/city-funktion.css";

/**
 * Renders the visible semantic-zoom level. Every level is a REAL city:
 * districts are built plots with skylines (representative towers), the
 * level's own files are full buildings on the central plaza. Repo size
 * changes drill depth — never the amount on screen.
 */

/** Phase 0 of the construction cinematic: empty terrain while the Ephe's move in. */
export const PHASE_0_MS = 1600;

/** Chip chrome in screen px: the inline `padding: "2px 6px"` (2 × 6) plus the 1 px border each side. */
const CHIP_CHROME_PX = 14;
/** JetBrains Mono advance width — 600/1000 em, i.e. 0,6 × the glyph step per character. */
const CHIP_ADVANCE_EM = 0.6;
/** The value of `--fs-meta` (design/globals.css) the chip now declares, in px. */
const CHIP_GLYPH_PX = 11;
/** Vertical field of view of the shipped camera (`App.tsx` Canvas: fov 52). */
const CHIP_FOV_DEG = 52;
/** Canvas height of the desktop measuring convention (1280 × 800, role brief). */
const CHIP_VIEW_H_PX = 800;

/**
 * How many district chips the far tier may draw — the flat 24-block cap,
 * made arithmetic.
 *
 * The chips used to scale with `distanceFactor`, which kept chip and plot
 * pitch in a distance-invariant ratio — at the cost of a 2.14 px glyph at
 * the tier's own enter threshold (`dist > max(170, 4.8·bounds)`, the shipped
 * `LOD_THRESHOLDS`), under the 11 px floor the team measured against. With
 * the scaling gone the glyph is screen pixels, but the chip no longer shrinks
 * with the pitch, so the count has to answer to the pitch. It used to answer to
 * a MODEL of it: at the enter distance the level's square projects `fieldPx`
 * wide, √N chips stand per row a pitch of `fieldPx/√N` apart, and the budget was
 * that division, squared — measured at the distance the tier BEGINS at: zoom
 * further and the chips converge like everything else in the grid, while the old
 * cap either flooded (10-char names at the cap's own edge: chip 80 px against a
 * 69.8 px pitch) or dropped names that still fit (6-char names allow 40). That
 * model counted the plaza, the podium and the rim as room for plots, and a real
 * Voronoi level does not spread its plots as evenly as a grid: measured through
 * `getDirLayout` on the 16 block-carrying levels of the repo self-scan
 * (2026-10-26)
 * it overstates the gap on every level of more than one block — 1.06x
 * (`backend`), 1.10x, 1.16x, 1.22x, 1.24x (`frontend/src`: a 91.3 px model lane
 * where the plots stand 73.8 px apart), 1.27x. The budget now reads the exported
 * `DirLayout.minBlockPitch`, projected by `districtChipPitchPx`.
 *
 * `nameChars` is the NARROWEST folder name of the level — a deliberate change
 * of question, because the chip itself is now capped to the honest lane
 * (`farChipMaxWidthPx`) and the count therefore no longer has to prevent
 * overdraw: the width rule does that, provably, for every pair at once. What
 * the count still decides is whether the lane carries NAMES at all. A level
 * whose shortest name is already wider than its real lane (`docs/reviews`: 26-
 * and 29-char names against an 81.9 px lane, which holds 10 characters) would
 * draw fourteen ellipses that all begin with the same date, so it stays silent —
 * correctly, and now for a measured reason. A level whose lane carries its
 * shortest name keeps every name it draws, and only the outliers lose a tail to
 * the cap (`frontend/src`: the lane holds 9 of the 11 characters of
 * `interaction` and 9 of the 10 of `components`, and all of the other twelve).
 *
 * What never enters this divisor is the level's longest DRAWN line. The
 * underground tally under a folded name is a second line of the same chip; read
 * into this divisor it turns the gate into an all-or-nothing decision against
 * the longest plate in the level, and the plate is not what the gate protects.
 * Measured on the running city the morning the chip went readable (42 of 49
 * levels, browser probe 2026-10-26, restated in `tests/typeFloor.test.ts`):
 * `frontend/src` — 14 districts, widest name 11 chars, one folder folded behind
 * a 25-char tally — dropped from 15 chips to 3, and 14 ≤ 3 draws no name at all,
 * on the level whose names this gate exists to make legible. A glyph of 10.5 px
 * that is absent serves nobody: the count may only fall because the NAMES
 * themselves run out of pitch — which, read on the honest pitch, is exactly what
 * `districtChipPitchPx` now measures.
 */
export function districtChipBudget(
  bounds: number,
  nameChars: number,
  minBlockPitch?: number,
  blockCount?: number,
): number {
  const chipPx = CHIP_CHROME_PX + CHIP_ADVANCE_EM * CHIP_GLYPH_PX * nameChars;
  if (minBlockPitch !== undefined) {
    // The honest count: the same inverse-square the model used, read on the
    // level's measured lane instead of the projected field. `blocks ≤ budget`
    // is exactly `chipPx ≤ lanePx`, and it falls off as fast as the lane falls
    // short of a name this level actually draws.
    const drawn = Math.max(1, blockCount ?? 1);
    if (!Number.isFinite(nameChars) || nameChars <= 0) return drawn;
    const lanePx = districtChipPitchPx(bounds, drawn, minBlockPitch);
    return Math.max(1, Math.floor(drawn * (lanePx / chipPx) ** 2));
  }
  // The model lane — kept only so a caller without a layout can still ask. The
  // shipped call site always passes `minBlockPitch` (pinned by
  // `tests/typeFloor.test.ts`), so the running app never lands here.
  const enter = Math.max(LOD_THRESHOLDS.ABSOLUTE_FLOOR, bounds * LOD_THRESHOLDS.RELATIVE_ENTER);
  const fieldPx =
    (2 * bounds * CHIP_VIEW_H_PX) / (2 * Math.tan((CHIP_FOV_DEG * Math.PI) / 360) * enter);
  return Math.max(1, Math.floor((fieldPx / chipPx) ** 2));
}

/**
 * The screen-px lane one district chip is drawn into at the tier's enter
 * distance.
 *
 * Given the level's measured `minBlockPitch` (`DirLayout.minBlockPitch`, world
 * units — the smallest centre-to-centre distance between two of its placed
 * blocks) this is that distance projected at the same enter distance the count
 * is measured at: the honest lane, and the only one a chip that occupies a
 * rectangle centred on a block plot can answer to. Without it the number
 * degrades to the model the last two rounds handed on — the projected field
 * divided by the √N chips a regular grid would stand per row — and that model
 * is optimistic by 1.06x–1.27x on every level of more than one block, because
 * `bounds` counts the plaza, the podium and the rim as room for plots.
 *
 * Both drawn lines of the chip cap to THIS number now. A folded folder's
 * underground tally is a second line of its chip and was the line that first
 * showed the defect: measured on the shipped `getDirLayout` (14-block level,
 * 2026-10-26) a 25-char tally is a 179.0 px chip in a 91.3 px model lane — and
 * the model lane itself sat in a real 73.8 px gap, so the cap the last round
 * shipped (77.33 px of content) never actually prevented the overdraw it was
 * written for. The NAME is the second, uncapped path the same measurement
 * produced: names run 66.8–86.6 px against that 73.8 px lane. Two rectangles
 * centred `d` apart overlap as soon as `(w1 + w2)/2 > d`, so capping every chip
 * at the smallest real `d` makes overdraw impossible for every pair at once, at
 * any count and — because an `<Html>` plate has no depth order, which the orbit
 * azimuth can align with any pair — at any angle.
 *
 * The tally's length was still never allowed back into the COUNT divisor (see
 * the doc above `districtChipBudget`: that version silenced all 14 names of the
 * level).
 */
export function districtChipPitchPx(
  bounds: number,
  blockCount: number,
  minBlockPitch?: number,
): number {
  const enter = Math.max(LOD_THRESHOLDS.ABSOLUTE_FLOOR, bounds * LOD_THRESHOLDS.RELATIVE_ENTER);
  const fieldPx =
    (2 * bounds * CHIP_VIEW_H_PX) / (2 * Math.tan((CHIP_FOV_DEG * Math.PI) / 360) * enter);
  return minBlockPitch === undefined
    ? fieldPx / Math.sqrt(Math.max(1, blockCount))
    : (minBlockPitch * fieldPx) / (2 * bounds);
}

/**
 * The far chip's accessible name: the folder plus its UNTRUNCATED underground
 * line.
 *
 * The tally under a folded name is clamped to the chip's own lane and ends in an
 * ellipsis — measured on the shipped `getDirLayout`, `frontend/src` caps a 179.0 px
 * line at its real 73.8 px lane (59.8 px of content, 9 of the line's 25
 * characters), so the tail of the number is not painted. The full value first
 * went into `title`, which is a HOVER, and this chip carries `pointerEvents: "none"`
 * deliberately: a plate that caught pointer events would eat the drag that orbits
 * the city (the same rule the mast's label is pinned to in
 * `tests/ma21-mastLabel.test.ts`, measured there as a lost camera grip). Verified
 * in a DOM this round: the shipped declaration computes to `pointer-events: none`,
 * nothing in the chip re-declares `auto`, and `document.elementFromPoint` does not
 * even exist in jsdom — so no mouse, no click (no handler), no tab stop (no
 * tabIndex), and a `title` nobody can summon hands a reader nothing.
 *
 * An accessible name needs no mouse. It is the route the close tier's street sign
 * already takes (`District.tsx` — `aria-label` on the plate), on the same words:
 * the line comes from `undergroundPlateLine`, both languages, never estimated. A
 * folder that ships no underground line gets no label: its chip is already whole,
 * and a count the plate never paints is not this chip's to add.
 */
export function districtChipLabel(lang: Lang, dir: CityDir): string {
  return `${dir.name} — ${undergroundPlateLine(lang, dir.remainingFiles, dir.fileCount)}`;
}

export function CityTree() {
  const cityData = useStore((s) => s.cityData);
  const focusPath = useStore((s) => s.focusPath);
  const lang = useStore((s) => s.prefs.lang);
  const threatFilter = useStore((s) => s.threatFilter);
  const ruleFilter = useStore((s) => s.ruleFilter);
  const reviews = useStore((s) => s.reviews);
  const buildPhase = useStore((s) => s.buildPhase);
  const buildStartedAt = useStore((s) => s.buildStartedAt);
  const selectedFileId = useStore((s) =>
    s.selectedUnit?.kind === "file" ? s.selectedUnit.id : null,
  );
  const focusedFindingKey = useStore((s) => s.focusedFindingKey);
  const blastOn = useStore((s) => s.blastOn);
  // View mode (spec §14): gates the dependency arcs + highlights them
  const viewMode = useStore((s) => s.viewMode);

  const layout = useMemo(
    () => (cityData ? getDirLayout(cityData, focusPath) : null),
    [cityData, focusPath],
  );
  // The sidewalk graph the Ephe's walk on: curbs along every street plus
  // lanes between the plaza's file buildings. Shared with RoadSystem so
  // the zebra stripes sit exactly where walkers cross.
  const sidewalks = useMemo(
    () =>
      layout
        ? buildSidewalkNetwork(layout.streets, plazaLanes(layout.buildings, layout.streets))
        : null,
    [layout],
  );
  const landmarkId = useMemo(() => (cityData ? landmarkFileId(cityData) : null), [cityData]);
  // Stepped semantic zoom: 0 = skyline heat grid, 1 = district, 2 = near.
  // The old boolean far-LOD is exactly tier 0.
  const lodLevel = useLodLevel(layout?.bounds ?? 100);
  const lodFar = lodLevel === 0;

  // Focus tiers — the depth of field around the selected building. All plaza
  // files of the current level live in ONE district (the focusPath chain),
  // so tier 2 is simply "everything else on this level"; without a selection
  // the map stays empty and nothing dims. Recomputed only when the selection
  // or the level changes — never per frame.
  const tiers = useMemo(
    () =>
      cityData && layout
        ? computeFocusTiers(
            selectedFileId,
            layout.buildings.map((b) => b.file),
            cityData.fileConnections,
            () => "plaza",
          )
        : new Map<string, FocusTier>(),
    [cityData, layout, selectedFileId],
  );

  // Blast radius (005 Teil A) — the files that IMPORT the selection. Deliberately
  // narrower than the focus tier above: a depth of field may be symmetric
  // because it only dims, an impact claim may not. Off until asked for, and
  // recomputed on selection or level change, never per frame.
  const blast = useMemo(
    () =>
      cityData && layout && blastOn && selectedFileId
        ? planBlastRadius(
            cityData.fileConnections,
            new Map<string, BlastNode>(
              allFiles(cityData).map(({ file }) => [
                file.id,
                { id: file.id, name: file.name, path: file.path },
              ]),
            ),
            new Set(layout.buildings.map((b) => b.file.id)),
            selectedFileId,
          )
        : null,
    [cityData, layout, blastOn, selectedFileId],
  );
  const blastIds = useMemo(() => new Set((blast?.files ?? []).map((f) => f.id)), [blast]);

  // Voxel-focus V3: the triage target's source line, parsed from
  // focusedFindingKey (`${fileId}#${index}` — see reviews.findingKey). Only
  // files on the current level can highlight: plaza buildings carry the
  // voxel layouts; Building gates the rest on its voxel stage. A missing
  // finding (stale key, filtered out) degrades to null — no highlight.
  const voxelHighlight = useMemo(() => {
    if (!focusedFindingKey || !layout) return null;
    const sep = focusedFindingKey.lastIndexOf("#");
    if (sep <= 0) return null;
    const fileId = focusedFindingKey.slice(0, sep);
    const index = Number(focusedFindingKey.slice(sep + 1));
    if (!Number.isInteger(index) || index < 0) return null;
    const placement = layout.buildings.find((b) => b.file.id === fileId);
    const finding = placement?.file.findings[index];
    if (finding?.historyCommit || finding?.provenance === "gitleaks-history") return null;
    const line = finding?.line;
    return placement && typeof line === "number" ? { fileId, line } : null;
  }, [focusedFindingKey, layout]);

  // Short rise animation whenever a new level is entered (drill in/out)
  const [levelBornAt, setLevelBornAt] = useState(0);
  const [entering, setEntering] = useState(false);
  useEffect(() => {
    if (!cityData) return;
    setLevelBornAt(Date.now());
    setEntering(true);
    const t = setTimeout(() => setEntering(false), 950);
    return () => clearTimeout(t);
  }, [focusPath, cityData]);

  const constructing = buildPhase === "constructing" && layout !== null;
  const animating = (constructing || entering) && layout !== null;
  // The schedule is counted and paced from the layout alone (baseMs 0), so
  // every stamp below is an offset into the build; animBase adds the clock.
  const plan = useMemo(
    () => (layout ? planConstruction(layout, 0, layout.centre) : null),
    [layout],
  );
  const unitTotal = plan?.total ?? 0;
  const durationMs = plan?.durationMs ?? 0;
  const step = constructing ? (plan?.step ?? 0) : entering ? 55 : 0;

  // Skip (button or Escape): pull animBase into the past so every appearAt
  // has already elapsed and the city appears complete at once. seenSkipRef
  // keeps skip stamps of earlier builds from re-firing a fresh construction.
  const [skipOffsetMs, setSkipOffsetMs] = useState(0);
  const seenSkipRef = useRef<number | null>(useStore.getState().buildSkipAt);
  const buildSkipAt = useStore((s) => s.buildSkipAt);
  const offsetBuildRef = useRef<number | null>(buildStartedAt);

  // A new build always starts unskipped. Reset synchronously during render
  // (adjust-state-during-render) so no frame — and no useFrame — ever sees
  // the previous build's offset: a stale offset would pre-latch the rise
  // animations and skip the next city's construction entirely.
  if (offsetBuildRef.current !== buildStartedAt) {
    offsetBuildRef.current = buildStartedAt;
    setSkipOffsetMs(0);
  }

  useEffect(() => {
    if (!constructing) {
      seenSkipRef.current = buildSkipAt;
      return;
    }
    if (!buildSkipAt || buildSkipAt === seenSkipRef.current) return;
    seenSkipRef.current = buildSkipAt;
    setSkipOffsetMs(durationMs + 1200);
    // Don't let a pending drill-in rise replay after the skip
    setEntering(false);
    const myStart = buildStartedAt;
    const t = setTimeout(() => {
      // Only flip if this is still the build the skip was fired for
      if (useStore.getState().buildStartedAt === myStart)
        useStore.getState().setBuildPhase("built");
    }, 250);
    return () => clearTimeout(t);
  }, [buildSkipAt, constructing, durationMs, buildStartedAt]);

  const animBase = constructing ? buildStartedAt + PHASE_0_MS - skipOffsetMs : levelBornAt;
  // A drill-in re-rise keeps its old quick 55 ms cascade; the construction
  // build runs on the paced schedule. Both share one rise ORDER.
  const riseK = constructing || !plan ? 1 : 55 / (plan.step || 55);
  const riseAt = (offset: number): number => animBase + offset * riseK;

  // One work point per rising unit, written by the same walk that wrote the
  // schedule — so a builder always stands at the tower that is going up.
  // The rise itself stays pure clock: a late builder never holds up the
  // skyline (Never-Stall).
  const sitesWithAt = useMemo(
    () => (plan ? plan.sites.map((s) => ({ ...s, at: riseAt(s.offset) })) : []),
    [plan, animBase, riseK],
  );
  // Ephes live in the plaza buildings they raised. Memoised so HUD re-renders
  // never recreate the walker population.
  const homes = useMemo(
    () =>
      (plan?.sites ?? [])
        .filter((s) => s.kind === "building")
        .map((s) => ({ x: s.x, z: s.z, doorX: s.doorX, doorZ: s.doorZ, unitId: s.unitId ?? null })),
    [plan],
  );

  // Build director: reports progress and flips to 'built', riding the
  // render loop instead of setInterval — background/mobile webviews
  // throttle page timers to ~1 Hz while rAF keeps ticking, and the counter
  // must run on the same clock as the rise animations. Anchored to animBase
  // (not buildStartedAt) so the counter stays at 0 through Phase 0. done
  // counts STARTED rises (ceil): it flips 0 → 1 exactly when the first
  // tower begins to rise, which is also what switches the HUD status line
  // from "moving in…" to the build counter.
  const lastReportRef = useRef(0);
  useFrame(() => {
    const store = useStore.getState();
    if (!constructing || step === 0) {
      lastReportRef.current = 0;
      store.setCraneFraming(null); // no crane outside a build
      return;
    }
    const nowMs = Date.now();
    if (nowMs - lastReportRef.current < 100) return; // ~10 Hz reporting
    lastReportRef.current = nowMs;
    const elapsed = Date.now() - animBase;
    const done = elapsed < 0 ? 0 : Math.min(unitTotal, Math.max(1, Math.ceil(elapsed / step)));
    store.setConstructionProgress(done, unitTotal);
    // ── The crane follows the city's size ────────────────────────────────────
    // An Ephe carrying a block has to be big enough to see AND the city has to
    // grow big enough to read. Both come out of one rule: the shot is sized to
    // what actually stands, so the frame is tight on the centre while the
    // centre is the only thing there and opens up ring by ring as the districts
    // fill. The schedule is centre-out, so this extent only ever grows — the
    // rig eases toward it every frame and never hops. Never while a hand is on
    // the camera: the user took the view, and a crane that steals it back is a
    // bug.
    if (plan && store.cameraManualAt <= buildStartedAt) {
      const extent = builtExtent(plan.sites, elapsed, layout.centre);
      store.setCraneFraming(craneShot(extent.radius, extent.top, layout.centre));
    } else {
      store.setCraneFraming(null);
    }
    // Final rise + 700 ms settle → city stands. Guarded against a build
    // that was replaced by a re-scan while this frame was in flight.
    if (done >= unitTotal && elapsed >= durationMs + 700) {
      if (useStore.getState().buildStartedAt === buildStartedAt) {
        useStore.getState().setBuildPhase("built");
      }
    }
  });

  if (!cityData || !layout || !plan) return null;

  const isRoot = focusPath.length === 0;
  const blockAppear = (i: number): number => riseAt(plan.blockAt[i] ?? 0);
  const skylineAppear = (i: number): number[] =>
    (plan.skylineAt[i] ?? []).map((off) => riseAt(off));
  const buildingAppear = (i: number): number => riseAt(plan.plazaAt[i] ?? 0);
  const podiumAppear = riseAt(plan.podiumAt);

  // Filters combine with AND: a building stays bright only when it matches
  // EVERY active filter (threat + rule); anything else dims to a backdrop.
  // The placement arrives from the same loop that draws it — looking the file
  // up again by id was a linear scan per building per render (104 calls,
  // 1184 array steps in one drill-in).
  const fileDimmed = (b: (typeof layout.buildings)[number]): boolean => {
    const threatDimmed =
      threatFilter !== "all" && !b.file.findings.some((v) => v.severity === threatFilter);
    const ruleDimmed =
      ruleFilter !== null && !b.file.findings.some((f) => (f.ruleId ?? f.type) === ruleFilter);
    return threatDimmed || ruleDimmed;
  };

  // A file whose findings ALL carry a review status calms its beacons down.
  // Per-file cost is trivial — findings arrays are small.
  const fullyReviewed = (file: CityFile): boolean =>
    file.findings.every((f, i) => reviews[reviewKeyFor(file, i, f)] !== undefined);

  const podiumVisible = !animating || Date.now() >= podiumAppear;

  // The far tier's label budget (see `districtChipBudget`): the level's REAL
  // lane — `DirLayout.minBlockPitch`, the smallest distance between two of its
  // placed block centres, projected at the tier's enter distance — divided into
  // the NARROWEST folder name this level draws. The lane is measured off the
  // layout now instead of modelled from `bounds` (which counts the plaza, the
  // podium and the rim and ran 1.06x–1.27x optimistic), and because every chip
  // caps to it below, this count decides whether the lane carries names at all —
  // not whether one outlier would overlap its neighbour. The underground tally
  // line under a folded name does NOT enter this number: read as the longest
  // line in the level it pushed the gate under the old cap (`frontend/src`: 15
  // chips became 3, and 14 districts — every one of them a name the cap drew —
  // became none).
  // Computed only while the tier is on; a single pass over the blocks, never
  // per frame.
  const farChipBudget = lodFar
    ? districtChipBudget(
        layout.bounds,
        layout.blocks.reduce((m, b) => Math.min(m, b.dir.name.length), Number.POSITIVE_INFINITY),
        layout.minBlockPitch,
        layout.blocks.length,
      )
    : 0;
  // The lane one whole chip may occupy, measured (see `districtChipPitchPx`):
  // the border box of the plate below, so BOTH of its lines — the name and the
  // tally — answer to the real distance to the nearest neighbour plot. Two
  // rectangles centred `d` apart overlap once `(w1+w2)/2 > d`, so capping every
  // chip at the smallest real `d` makes overdraw impossible for every pair at
  // once, at any count and any orbit azimuth.
  const farChipMaxWidthPx = lodFar
    ? districtChipPitchPx(layout.bounds, layout.blocks.length, layout.minBlockPitch)
    : 0;
  // The tally line's content cap (see `districtChipPitchPx`): the chip's lane
  // minus its own chrome, so a folded folder's second line never pushes the
  // chip past its neighbour. A width rule on one line — it changes no count.
  // The full value rides the chip's accessible name (see `districtChipLabel`):
  // the `title` below stays in the DOM, but this plate is un-hoverable by design,
  // so a title is not a route.
  const farTallyMaxWidthPx = lodFar
    ? Math.max(
        0,
        districtChipPitchPx(layout.bounds, layout.blocks.length, layout.minBlockPitch) -
          CHIP_CHROME_PX,
      )
    : 0;

  return (
    <group>
      <RoadSystem layout={layout} sidewalks={sidewalks} active={buildPhase === "built"} />

      {/* Far zoom: the city as one instanced heat-grid (single draw call) */}
      {lodFar && <HeatCells layout={layout} />}

      {/* Far-zoom district labels — the tier that leaves only tiles, so the
          name is the tile's ONLY identifier. The chips no longer scale with
          `distanceFactor` (see tests/typeFloor — at the tier threshold the
          scaling left the glyph at ~2.1 px, under the type floor): they now
          render at screen pixels. What the scaling used to keep apart is
          arithmetic instead: every chip caps to the level's measured lane
          (`farChipMaxWidthPx`, from `DirLayout.minBlockPitch`), and
          `farChipBudget` asks that lane against the narrowest name the level
          draws — whether the lane carries names at all. A
          folded folder keeps its underground number here too: the distance
          level must not swallow a measurement the close level states on the
          street sign. */}
      {lodFar &&
        layout.blocks.length <= farChipBudget &&
        layout.blocks.map((b) => (
          <SurfaceAnchor key={`district-label-${b.dir.path}`} x={b.x} z={b.z}>
            <Html
              key={`district-label-${b.dir.path}`}
              center
              position={[b.x, 1.2, b.z]}
              zIndexRange={[8, 0]}
            >
              <div
                aria-label={b.dir.remainingFiles > 0 ? districtChipLabel(lang, b.dir) : undefined}
                style={{
                  fontFamily: "'JetBrains Mono', ui-monospace, Menlo, monospace",
                  fontSize: "var(--fs-meta)",
                  color: "var(--meta-strong)",
                  background: "#121210",
                  border: "1px solid rgba(242, 239, 232, 0.14)",
                  borderRadius: 3,
                  padding: "2px 6px",
                  whiteSpace: "nowrap",
                  boxSizing: "border-box",
                  maxWidth: farChipMaxWidthPx,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  pointerEvents: "none",
                  textAlign: "center",
                }}
              >
                {b.dir.name}
                {b.dir.remainingFiles > 0 && (
                  <div
                    title={undergroundPlateLine(lang, b.dir.remainingFiles, b.dir.fileCount)}
                    style={{
                      fontSize: "var(--fs-meta)",
                      opacity: 0.85,
                      maxWidth: farTallyMaxWidthPx,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {undergroundPlateLine(lang, b.dir.remainingFiles, b.dir.fileCount)}
                  </div>
                )}
              </div>
            </Html>
          </SurfaceAnchor>
        ))}

      {/* The Ephe's live here: walk the sidewalks between the buildings,
          go in and out of their offices, take the taxi and the bus, chat
          in binary. During the construction cinematic they report to build
          sites and the traffic stays off until the city stands. */}
      {!lodFar && (
        <Pedestrians
          streets={layout.streets}
          network={sidewalks}
          homes={homes}
          buildSites={constructing ? sitesWithAt : null}
          vehiclesActive={buildPhase === "built"}
          count={72}
          bounds={layout.bounds}
        />
      )}

      {/* Districts — built plots with skylines */}
      {!lodFar &&
        layout.blocks.map((b, i) => (
          <SurfaceAnchor key={b.dir.path} x={b.x} z={b.z}>
            <District
              placement={b}
              appearAt={blockAppear(i)}
              skylineAt={skylineAppear(i)}
              constructing={animating}
            />
          </SurfaceAnchor>
        ))}

      {/* This level's own files on the central plaza */}
      {!lodFar &&
        layout.buildings.map((b, i) => (
          <SurfaceAnchor key={b.file.id} x={b.x} z={b.z}>
            <Building
              file={b.file}
              x={b.x}
              z={b.z}
              w={b.w}
              d={b.d}
              h={b.h}
              voxels={b.voxels}
              highlightLine={voxelHighlight?.fileId === b.file.id ? voxelHighlight.line : null}
              findingFocus={voxelHighlight?.fileId === b.file.id}
              isLandmark={b.file.id === landmarkId}
              dimmed={fileDimmed(b)}
              focusTier={tiers.get(b.file.id) ?? null}
              blastAffected={blastIds.has(b.file.id)}
              fullyReviewed={fullyReviewed(b.file)}
              appearAt={buildingAppear(i)}
              constructing={animating}
            />
          </SurfaceAnchor>
        ))}

      {/* Podium — honest aggregate of files not rendered as buildings */}
      {!lodFar && layout.podium && podiumVisible && (
        <SurfaceAnchor x={layout.podium.x} z={layout.podium.z}>
          <group position={[layout.podium.x, 0, layout.podium.z]}>
            <mesh position={[0, 0.5, 0]}>
              <boxGeometry args={[3.4, 1, 3.4]} />
              <meshStandardMaterial color={ENV.plot} roughness={0.9} />
            </mesh>
            <mesh position={[0, 1.12, 0]}>
              <boxGeometry args={[3.4, 0.08, 3.4]} />
              <meshStandardMaterial
                color={ENV.plotEdge}
                emissive={ENV.plotEdge}
                emissiveIntensity={0.4}
              />
            </mesh>
            {/* No `distanceFactor` here on purpose. This plate carries a
                measurement — how many of the district's files the draw limits
                left underground — and at the district camera the scaling put
                its glyphs at 3.21 px, measured against the import plate's 2.72
                px in the same frame. A number nobody can read is not a
                disclosure. It is also one element, gated by `!lodFar`, so it
                cannot flood anything the way the far-zoom district chips
                above could. */}
            <Html center position={[0, 1.9, 0]} zIndexRange={[8, 0]}>
              <div className="cf-plate" style={{ background: "#121210" }}>
                <div className="cf-plate-under">
                  {undergroundPlateLine(lang, layout.podium.count, layout.dir.fileCount)}
                </div>
              </div>
            </Html>
          </group>
        </SurfaceAnchor>
      )}

      {/* Import arcs connect once the district stands; static file arcs
          collapse to the selection's edges — idle cities stay clean.
          DEPENDENCIES mode (spec §14): dir arcs stay on in every district
          (the whole point of the lens) and glow as the active layer. */}
      <SurfaceCurves>
        <CityConnections
          layout={layout}
          fileConnections={cityData.fileConnections}
          dirConnections={cityData.dirConnections}
          showDirArcs={(viewMode === "dependencies" || isRoot) && buildPhase === "built"}
          showFileArcs={buildPhase === "built" && selectedFileId !== null}
          selectedFileId={selectedFileId}
          highlight={viewMode === "dependencies"}
        />

        {/* Directed particle streams for the selected building */}
        <DependencyFlows layout={layout} fileConnections={cityData.fileConnections} />

        {/* Copy-paste clones connected by harsh yellow lasers */}
        {!lodFar && <CloneLasers layout={layout} cityData={cityData} />}
      </SurfaceCurves>
    </group>
  );
}
