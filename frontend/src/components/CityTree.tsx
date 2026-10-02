"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { useStore } from "../stores/useStore";
import { getDirLayout, landmarkFileId, planConstruction } from "../city/layout";
import { buildSidewalkNetwork, plazaLanes } from "../city/sidewalks";
import { ENV } from "../city/palette";
import { findingKey } from "../reviews";
import type { CityFile } from "../city/types";
import { RoadSystem } from "./RoadSystem";
import { District } from "./District";
import { Building } from "./Building";
import { CityConnections } from "./CityConnections";
import { DependencyFlows } from "./DependencyFlows";
import { CloneLasers } from "./CloneLasers";
import { HeatCells } from "./HeatCells";
import { ModeBar } from "./ModeBar";
import { Pedestrians } from "./Pedestrians";
import { useLodLevel } from "../hooks/useLodLevel";
import { computeFocusTiers, type FocusTier } from "../city/focus";

/**
 * Renders the visible semantic-zoom level. Every level is a REAL city:
 * districts are built plots with skylines (representative towers), the
 * level's own files are full buildings on the central plaza. Repo size
 * changes drill depth — never the amount on screen.
 */

/** Phase 0 of the construction cinematic: empty terrain while the Ephe's move in. */
export const PHASE_0_MS = 1600;

/**
 * Crane framing for a construction stop. Two things must fit at once: the plot
 * the builders stand on, and the tallest tower rising out of it. At this
 * camera's 52° vertical fov and the 21° eye line below, measured on the demo
 * city, that is ~1.35·span for the pad and ~1.55·height for the crown — and
 * the distance is capped, because past ~34 units an Ephe carrying a block is
 * a speck again, which is the whole thing the tour exists to prevent.
 */
const TOUR_ELEVATION = 0.36; // ≈ 21°
const tourFraming = (span: number, tallest: number, cap = 34) => ({
  dist: Math.min(cap, Math.max(16, span * 1.35, tallest * 1.55)),
  targetY: Math.max(1.5, tallest * 0.3),
});
/** The crane starts moving to a district just before its first unit rises. */
const TOUR_LEAD_MS = 200;

export function CityTree() {
  const cityData = useStore((s) => s.cityData);
  const focusPath = useStore((s) => s.focusPath);
  const threatFilter = useStore((s) => s.threatFilter);
  const ruleFilter = useStore((s) => s.ruleFilter);
  const reviews = useStore((s) => s.reviews);
  const buildPhase = useStore((s) => s.buildPhase);
  const buildStartedAt = useStore((s) => s.buildStartedAt);
  const selectedFileId = useStore((s) =>
    s.selectedUnit?.kind === "file" ? s.selectedUnit.id : null,
  );
  const focusedFindingKey = useStore((s) => s.focusedFindingKey);
  // View mode (spec §14): gates the dependency arcs + highlights them
  const viewMode = useStore((s) => s.viewMode);
  // Canvas size only — feeds the screen-fixed ModeBar anchor (no camera math)
  const size = useThree((s) => s.size);

  const layout = useMemo(
    () => (cityData ? getDirLayout(cityData, focusPath) : null),
    [cityData, focusPath],
  );
  // The sidewalk graph the Ephe's walk on: curbs along every street plus
  // lanes between the plaza's file buildings. Shared with RoadSystem so
  // the zebra stripes sit exactly where walkers cross.
  const sidewalks = useMemo(
    () => (layout ? buildSidewalkNetwork(layout.streets, plazaLanes(layout.buildings)) : null),
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
    const line = placement?.file.findings[index]?.line;
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
  const plan = useMemo(() => (layout ? planConstruction(layout, 0) : null), [layout]);
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
  // ── The crane follows the work ─────────────────────────────────────────────
  // An Ephe carrying a block has to be big enough to see. Framed for the whole
  // city — the demo's bounds·0.72 ≈ 63 units — a builder is two pixels and the
  // construction reads as happening by itself. So the camera visits each
  // district while THAT district rises and the full-height reveal waits until
  // the city stands (CityScene). Each stop is framed for its own plot AND the
  // tallest tower going up on it, so a three-file module and a forty-file
  // package both fill the shot. The crane yields for good the moment a hand
  // takes the camera.
  const tourStops = useMemo(() => {
    if (!plan || !layout) return [];
    // plan.sites is emitted district by district (the district pad first, then
    // its own towers), so one pass groups every tower with its plot — and the
    // shot is framed for the tallest thing that goes up while we are watching.
    const stops: Array<{
      offset: number;
      x: number;
      z: number;
      span: number;
      tallest: number;
      cap: number;
    }> = [];
    let tallestPlaza = 0;
    let plazaOffset = 0;
    for (const s of plan.sites) {
      if (s.kind === "district") {
        stops.push({ offset: s.offset, x: s.x, z: s.z, span: s.span, tallest: s.h, cap: 34 });
      } else if (s.kind === "tower" && stops.length > 0) {
        stops[stops.length - 1]!.tallest = Math.max(stops[stops.length - 1]!.tallest, s.h);
      } else {
        // the level's own files, on the central plaza
        if (tallestPlaza === 0) plazaOffset = s.offset;
        tallestPlaza = Math.max(tallestPlaza, s.h);
      }
    }
    if (tallestPlaza > 0) {
      // The plaza is one wide, low plot: its framing comes from the level's
      // extent, and the legibility cap that keeps a district shot tight would
      // leave half the plaza outside the frame.
      stops.push({
        offset: plazaOffset,
        x: 0,
        z: 0,
        span: layout.bounds,
        tallest: tallestPlaza,
        cap: layout.bounds * 0.9,
      });
    }
    return stops
      .sort((a, b) => a.offset - b.offset)
      .map((s) => ({
        offset: s.offset,
        x: s.x,
        z: s.z,
        ...tourFraming(s.span, s.tallest, s.cap),
      }));
  }, [plan, layout]);

  // Ephes live in the plaza buildings they raised. Memoised so HUD re-renders
  // never recreate the walker population.
  const homes = useMemo(
    () =>
      (plan?.sites ?? [])
        .filter((s) => s.kind === "building")
        .map((s) => ({ x: s.x, z: s.z, doorX: s.doorX, doorZ: s.doorZ })),
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
  const tourStopRef = useRef(-1);
  useFrame(() => {
    if (!constructing || step === 0) {
      lastReportRef.current = 0;
      tourStopRef.current = -1;
      return;
    }
    const nowMs = Date.now();
    if (nowMs - lastReportRef.current < 100) return; // ~10 Hz reporting
    lastReportRef.current = nowMs;
    const elapsed = Date.now() - animBase;
    const done = elapsed < 0 ? 0 : Math.min(unitTotal, Math.max(1, Math.ceil(elapsed / step)));
    useStore.getState().setConstructionProgress(done, unitTotal);
    // Crane tour — see tourStops. Never while a hand is on the camera: the
    // user took the view, and a crane that keeps stealing it back is a bug.
    if (tourStops.length > 0 && useStore.getState().cameraManualAt <= buildStartedAt) {
      let idx = 0;
      for (let i = 0; i < tourStops.length; i++) {
        if (elapsed >= tourStops[i]!.offset - TOUR_LEAD_MS) idx = i;
      }
      if (idx !== tourStopRef.current) {
        tourStopRef.current = idx;
        const stop = tourStops[idx]!;
        const next = tourStops[idx + 1];
        const ms = (next?.offset ?? durationMs) - elapsed;
        useStore.getState().requestFly({
          x: stop.x,
          z: stop.z,
          distance: stop.dist,
          targetY: stop.targetY,
          elevation: TOUR_ELEVATION,
          duration: Math.min(1.8, Math.max(0.6, ms / 1000)),
        });
      }
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
  const fileDimmed = (fileId: string): boolean => {
    const b = layout.buildings.find((x) => x.file.id === fileId);
    if (!b) return false;
    const threatDimmed =
      threatFilter !== "all" && !b.file.findings.some((v) => v.severity === threatFilter);
    const ruleDimmed =
      ruleFilter !== null && !b.file.findings.some((f) => (f.ruleId ?? f.type) === ruleFilter);
    return threatDimmed || ruleDimmed;
  };

  // A file whose findings ALL carry a review status calms its beacons down.
  // Per-file cost is trivial — findings arrays are small.
  const fullyReviewed = (file: CityFile): boolean =>
    file.findings.every((_, i) => reviews[findingKey(file.id, i)] !== undefined);

  const podiumVisible = !animating || Date.now() >= podiumAppear;

  return (
    <group>
      <RoadSystem layout={layout} sidewalks={sidewalks} active={buildPhase === "built"} />

      {/* Far zoom: the city as one instanced heat-grid (single draw call) */}
      {lodFar && <HeatCells layout={layout} />}

      {/* Far-zoom district labels — only for small levels, beyond that the
          labels would flood the heat grid */}
      {lodFar &&
        layout.blocks.length <= 24 &&
        layout.blocks.map((b) => (
          <Html
            key={`district-label-${b.dir.path}`}
            center
            distanceFactor={layout.bounds}
            position={[b.x, 1.2, b.z]}
            zIndexRange={[8, 0]}
          >
            <div
              style={{
                fontFamily: "'JetBrains Mono', ui-monospace, Menlo, monospace",
                fontSize: 10,
                color: "var(--meta-strong)",
                background: "rgba(18, 18, 16, 0.75)",
                border: "1px solid rgba(242, 239, 232, 0.14)",
                borderRadius: 3,
                padding: "2px 6px",
                whiteSpace: "nowrap",
                pointerEvents: "none",
              }}
            >
              {b.dir.name}
            </div>
          </Html>
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
          <District
            key={b.dir.path}
            placement={b}
            appearAt={blockAppear(i)}
            skylineAt={skylineAppear(i)}
            constructing={animating}
          />
        ))}

      {/* This level's own files on the central plaza */}
      {!lodFar &&
        layout.buildings.map((b, i) => (
          <Building
            key={b.file.id}
            file={b.file}
            x={b.x}
            z={b.z}
            w={b.w}
            d={b.d}
            h={b.h}
            voxels={b.voxels}
            highlightLine={voxelHighlight?.fileId === b.file.id ? voxelHighlight.line : null}
            isLandmark={b.file.id === landmarkId}
            dimmed={fileDimmed(b.file.id)}
            focusTier={tiers.get(b.file.id) ?? null}
            fullyReviewed={fullyReviewed(b.file)}
            appearAt={buildingAppear(i)}
            constructing={animating}
          />
        ))}

      {/* Podium — honest aggregate of files not rendered as buildings */}
      {!lodFar && layout.podium && podiumVisible && (
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
          <Html center distanceFactor={40} position={[0, 1.9, 0]} zIndexRange={[8, 0]}>
            <div
              style={{
                fontFamily: "'JetBrains Mono', ui-monospace, Menlo, monospace",
                fontSize: 10,
                color: "var(--meta-strong)",
                background: "rgba(18, 18, 16, 0.75)",
                border: "1px solid rgba(90,120,180,0.35)",
                borderRadius: 3,
                padding: "2px 6px",
                whiteSpace: "nowrap",
                pointerEvents: "none",
              }}
            >
              +{layout.podium.count} more files
            </div>
          </Html>
        </group>
      )}

      {/* Import arcs connect once the district stands; static file arcs
          collapse to the selection's edges — idle cities stay clean.
          DEPENDENCIES mode (spec §14): dir arcs stay on in every district
          (the whole point of the lens) and glow as the active layer. */}
      <CityConnections
        layout={layout}
        fileConnections={cityData.fileConnections}
        dirConnections={cityData.dirConnections}
        showDirArcs={(viewMode === "dependencies" || isRoot) && buildPhase === "built"}
        showFileArcs={buildPhase === "built" && selectedFileId !== null}
        selectedFileId={selectedFileId}
        highlight={viewMode === "dependencies"}
      />

      {/* Mode bar (spec §14) — screen-fixed top center, on the same row as
          the workspace search. Only once the city stands: during the
          construction cinematic there is no mode to choose yet. The constant
          calculatePosition pins the Html overlay to the viewport (top-center
          row of the canvas) instead of projecting a world point, so it never
          drifts while the camera orbits. */}
      {buildPhase === "built" && (
        <Html
          calculatePosition={() => [size.width / 2, 0]}
          zIndexRange={[35, 10]}
          style={{ top: 78, left: 0, transform: "translateX(-50%)" }}
        >
          <ModeBar />
        </Html>
      )}

      {/* Directed particle streams for the selected building */}
      <DependencyFlows layout={layout} fileConnections={cityData.fileConnections} />

      {/* Copy-paste clones connected by harsh yellow lasers */}
      {!lodFar && <CloneLasers layout={layout} cityData={cityData} />}
    </group>
  );
}
