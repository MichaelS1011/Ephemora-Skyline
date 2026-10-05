"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { useStore } from "../stores/useStore";
import {
  builtExtent,
  craneShot,
  getDirLayout,
  landmarkFileId,
  planConstruction,
} from "../city/layout";
import { buildSidewalkNetwork, plazaLanes } from "../city/sidewalks";
import { ENV } from "../city/palette";
import { reviewKeyFor } from "../reviews";
import type { CityFile } from "../city/types";
import { RoadSystem } from "./RoadSystem";
import { District } from "./District";
import { Building } from "./Building";
import { CityConnections } from "./CityConnections";
import { DependencyFlows } from "./DependencyFlows";
import { CloneLasers } from "./CloneLasers";
import { HeatCells } from "./HeatCells";
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
      const extent = builtExtent(plan.sites, elapsed);
      store.setCraneFraming(craneShot(extent.radius, extent.top));
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
                background: "#121210",
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
            dimmed={fileDimmed(b)}
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
                background: "#121210",
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

      {/* Directed particle streams for the selected building */}
      <DependencyFlows layout={layout} fileConnections={cityData.fileConnections} />

      {/* Copy-paste clones connected by harsh yellow lasers */}
      {!lodFar && <CloneLasers layout={layout} cityData={cityData} />}
    </group>
  );
}
