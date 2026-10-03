"use client";

import { useMemo, useRef, useEffect, useLayoutEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { CityFile, Severity } from "../city/types";
import type { FocusTier } from "../city/focus";
import type { VoxelLayout } from "../city/voxels";
import { languageColor, severityColor, REVIEWED_BEACON_COLOR, ENV } from "../city/palette";
import { materialState, erosionState } from "../city/mapping";
import { landmarkFileId } from "../city/layout";
import { findVoxelForLine } from "../city/voxels";
import { useStore, type ViewMode } from "../stores/useStore";
import { VoxelMesh, slabSegments, getVoxelMaterial, sectionBandHeights } from "./VoxelMesh";

// ── Facade textures (shared cache — window grids are expensive) ────────────

interface FacadeTextures {
  map: THREE.CanvasTexture;
  emissive: THREE.CanvasTexture;
}

const facadeCache = new Map<string, FacadeTextures>();
const FACADE_CACHE_MAX = 2000;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function getFacadeTextures(
  color: string,
  w: number,
  h: number,
  alarm: boolean,
  seed: number,
): FacadeTextures {
  // v3: dark-metal body — the map is a MULTIPLIER texture (near-white with a
  // 10% language tint, subtle vertical mullion seams, dark smoked-glass
  // slots, sparse dim lit windows). The graphite material color below does
  // the actual shading; from afar the body stays closed and calm (spec §16).
  const key = `v3|${color}|${Math.round(w * 4)}|${Math.round(h * 4)}|${alarm ? 1 : 0}|${seed % 9}`;
  const hit = facadeCache.get(key);
  if (hit) {
    // LRU refresh — eviction must target the least-recently-used entry,
    // never dispose textures still referenced by active materials
    facadeCache.delete(key);
    facadeCache.set(key, hit);
    return hit;
  }
  while (facadeCache.size >= FACADE_CACHE_MAX) {
    const oldestKey = facadeCache.keys().next().value;
    if (oldestKey === undefined) break;
    const oldest = facadeCache.get(oldestKey);
    if (oldest) {
      oldest.map.dispose();
      oldest.emissive.dispose();
    }
    facadeCache.delete(oldestKey);
  }

  const W = 128;
  const H = 256;
  const tint = new THREE.Color(color).lerp(new THREE.Color("#ffffff"), 0.9);
  const tintHex = `#${tint.getHexString()}`;
  const seam = `#${tint.clone().multiplyScalar(1.16).getHexString()}`;
  const floorSeam = `#${tint.clone().multiplyScalar(0.88).getHexString()}`;
  const glass = "#3c414c"; // dark glazed slot multiplier
  const litColor = alarm ? ENV.windowAlarm : ENV.windowWarm;
  const litCool = alarm ? "#ff8f9a" : ENV.windowCool;

  const rng = mulberry32(seed * 7919 + Math.round(w * 8) + Math.round(h * 3));

  const albedo = document.createElement("canvas");
  albedo.width = W;
  albedo.height = H;
  const aCtx = albedo.getContext("2d")!;
  aCtx.fillStyle = tintHex;
  aCtx.fillRect(0, 0, W, H);

  const emissive = document.createElement("canvas");
  emissive.width = W;
  emissive.height = H;
  const eCtx = emissive.getContext("2d")!;
  eCtx.fillStyle = "#000000";
  eCtx.fillRect(0, 0, W, H);

  const cols = 6; // vertical bays — the raster the eye reads from afar
  // Row 0 = windowless parapet / roof line, rows 1..8 = floors,
  // row 9 = ground floor (storefront zone) — reads as a real base.
  const rows = 10;
  const cellW = W / cols;
  const cellH = H / rows;

  // Horizontal floor seams — barely there
  aCtx.fillStyle = floorSeam;
  for (let r = 1; r < rows; r++) {
    aCtx.fillRect(0, Math.round(r * cellH) - 1, W, 2);
  }

  // Occasional fully dark floors (offices with the lights off)
  const darkFloor: boolean[] = [];
  for (let r = 0; r < rows; r++) darkFloor.push(rng() < 0.09);

  for (let r = 1; r <= 9; r++) {
    const ground = r === 9;
    for (let c = 0; c < cols; c++) {
      // Narrow tall slots keep the vertical rhythm without breaking the
      // silhouette into a window grid
      const x = c * cellW + cellW * 0.36;
      const y = r * cellH + cellH * 0.2;
      const ww = cellW * 0.28;
      const wh = ground ? cellH * 0.5 : cellH * 0.58;

      aCtx.fillStyle = glass;
      aCtx.fillRect(x, y, ww, wh);
      const lit = ground ? rng() < 0.16 : !darkFloor[r]! && rng() < (alarm ? 0.2 : 0.12);
      if (lit) {
        const warm = ground ? rng() < 0.95 : rng() < 0.82;
        eCtx.fillStyle = warm ? litColor : litCool;
        eCtx.fillRect(x + 1, y + 1, Math.max(1, ww - 2), Math.max(1, wh - 2));
      }
    }
  }

  // Vertical mullion seams at the bay boundaries — the metal panel joints
  aCtx.fillStyle = seam;
  for (let c = 0; c <= cols; c++) {
    aCtx.fillRect(Math.round(c * cellW) - 1, 0, 2, H);
  }

  // Ground-floor plinth band: slightly darker + more neutral than the facade
  const plinth = tint.clone().multiplyScalar(0.72);
  aCtx.fillStyle = `#${plinth.getHexString()}`;
  aCtx.fillRect(0, H - cellH * 1.15, W, cellH * 1.15);

  const map = new THREE.CanvasTexture(albedo);
  map.colorSpace = THREE.SRGBColorSpace;
  const emissiveMap = new THREE.CanvasTexture(emissive);
  emissiveMap.colorSpace = THREE.SRGBColorSpace;
  const textures = { map, emissive: emissiveMap };
  facadeCache.set(key, textures);
  return textures;
}

// ── Shared detail resources (module-level, NEVER disposed per building) ────
// Rooftop clutter reuses one unit box + one unit cylinder, scaled per mesh —
// zero extra geometry allocations and at most +2 meshes per building.

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_CYLINDER = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);

/**
 * Pick volume for the voxel-body mode: fully invisible (colorWrite off) but
 * raycastable, so the building stays clickable/hoverable as ONE target while
 * the voxel meshes themselves stay display-only (raycast disabled).
 */
const PICK_MATERIAL = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });

const DETAIL_MATERIALS = {
  metal: new THREE.MeshStandardMaterial({ color: "#38425a", roughness: 0.6, metalness: 0.35 }),
  dark: new THREE.MeshStandardMaterial({ color: "#232a3a", roughness: 0.9 }),
};
const DETAIL_MATERIALS_DIMMED = {
  metal: new THREE.MeshStandardMaterial({
    color: "#38425a",
    roughness: 0.6,
    metalness: 0.35,
    transparent: true,
    opacity: 0.12,
  }),
  dark: new THREE.MeshStandardMaterial({
    color: "#232a3a",
    roughness: 0.9,
    transparent: true,
    opacity: 0.12,
  }),
};

// Section bands — thin amber floor lines marking the strata boundaries of
// the honest voxel layout. Shared, never disposed per building.
const MAX_BANDS = 24;
const BAND_MATERIALS = {
  band: new THREE.MeshStandardMaterial({
    color: "#0d0d0c",
    emissive: "#e8b23c",
    emissiveIntensity: 0.12,
    roughness: 0.55,
    metalness: 0.4,
  }),
};
const BAND_MATERIALS_DIMMED = {
  band: new THREE.MeshStandardMaterial({
    color: "#0d0d0c",
    emissive: "#e8b23c",
    emissiveIntensity: 0.12,
    roughness: 0.55,
    metalness: 0.4,
    transparent: true,
    opacity: 0.12,
  }),
};

// Focus tiers dim the city around a selection as a brightness MULTIPLIER on
// color + emissive (never opacity — transparent bodies sort wrong). Filter
// dimming (`dimmed`) always wins: it is applied via opacity and must not be
// double-darkened by a focus tier on top.
const FOCUS_FACTORS: Record<Exclude<FocusTier, 0>, number> = { 1: 0.65, 2: 0.3, 3: 0.15 };

/** Darken a hex color by `f` (linear-space multiply), identity at f ≥ 1. */
function dimColor(hex: string, f: number): string {
  if (f >= 1) return hex;
  return `#${new THREE.Color(hex).multiplyScalar(f).getHexString()}`;
}

/**
 * View-mode multiplier on a building's brightness (spec §14), composed with
 * the focus-tier factor. Pure + deterministic (tests/viewMode.test.ts):
 * - structure     → 1 (unchanged default view)
 * - security      → alarm buildings keep full light, the rest dims to 0.45
 * - dependencies  → every building recedes to 0.35 so the arcs take the stage
 */
export function modeFactor(viewMode: ViewMode, alarm: boolean): number {
  if (viewMode === "structure") return 1;
  if (viewMode === "security") return alarm ? 1 : 0.45;
  return 0.35;
}

// Radial ground glow under the selected building (one shared texture)
let groundGlowTexture: THREE.CanvasTexture | null = null;
function getGroundGlowTexture(): THREE.CanvasTexture {
  if (groundGlowTexture) return groundGlowTexture;
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,0.85)");
  g.addColorStop(0.35, "rgba(255,255,255,0.3)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  groundGlowTexture = new THREE.CanvasTexture(c);
  return groundGlowTexture;
}

// ── Building ───────────────────────────────────────────────────────────────

export interface BuildingProps {
  file: CityFile;
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  isLandmark?: boolean;
  dimmed?: boolean;
  /**
   * Focus tier behind a selection (city/focus.ts): 0 = selected, 1 = direct
   * dependency, 2 = same district, 3 = rest. undefined/null = no focus is
   * active (nothing dimmed). Ignored when `dimmed` is already true.
   */
  focusTier?: FocusTier | null;
  /** Construction cinematic: epoch ms when this building starts to rise. */
  appearAt?: number;
  constructing?: boolean;
  /** When false (district skylines), the tower is decorative: no click/hover. */
  interactive?: boolean;
  /** Every finding has a review status — the beacon calms down (green). */
  fullyReviewed?: boolean;
  /**
   * Honest-building voxel layout for this file (BuildingPlacement.voxels,
   * wired by CityTree). Optional + nullable: old payloads and district
   * skyline towers omit it, and the building falls back to the pure
   * silhouette. When present it drives the section bands (part of the
   * always-visible silhouette) and the voxel materialization while this
   * building is the selected file. Slab-only layouts (detail=false sections,
   * no cells) also fall back — there is nothing to materialize.
   */
  voxels?: VoxelLayout | null;
  /**
   * 1-based source line to spotlight (voxel-focus V3): while the voxel stage
   * is active, this line's cell renders as the pulsing red focus voxel and
   * the rest of the building dims. null/undefined = no highlight. Ignored
   * when no voxel layout is present or the stage is not active.
   */
  highlightLine?: number | null;
}

export function Building({
  file,
  x,
  z,
  w,
  d,
  h,
  isLandmark = false,
  dimmed = false,
  focusTier = null,
  appearAt,
  constructing = false,
  interactive = true,
  fullyReviewed = false,
  voxels = null,
  highlightLine = null,
}: BuildingProps) {
  const selectBuilding = useStore((s) => s.selectBuilding);
  // Etappe L "free camera": the double-click gesture upgrades from the plain
  // fly-to to the orbit-inspect mode — focusBuilding selects, flies and sets
  // the camera circling the building.
  const focusBuilding = useStore((s) => s.focusBuilding);
  const selectedUnit = useStore((s) => s.selectedUnit);
  const setHoveredId = useStore((s) => s.setHoveredId);
  // Granular selectors: only the CVD/gfxLite flags — other pref changes must
  // not re-render hundreds of buildings
  const colorblind = useStore((s) => s.prefs.colorblind);
  const gfxLite = useStore((s) => s.prefs.gfxLite);
  const selected = selectedUnit?.kind === "file" && selectedUnit.id === file.id;

  const cityMeta = useStore((s) => s.cityData?.meta);
  const cityData = useStore((s) => s.cityData);
  // #16c: the city's landmark is normally flagged by the caller (plaza
  // buildings). A district's skyline towers are rendered by District.tsx,
  // which cannot thread the flag — so a landmark that lives INSIDE a district
  // showed no beam at all. Buildings resolve it themselves from the (cached)
  // layout so the marker follows the file wherever it is drawn.
  const isCityLandmark = useMemo(
    () => !!cityData && landmarkFileId(cityData) === file.id,
    [cityData, file.id],
  );
  const showLandmark = isLandmark || isCityLandmark;
  const facadeColor = languageColor(file.language);
  const alarm = file.threatLevel === "critical" || file.threatLevel === "high";
  // Metric→visual mapping: graphite (healthy) / glass (dead code) / alarm
  const matState = materialState(file);
  const erosion = erosionState(file, cityMeta);
  // Category 1 (structure): raw bytes — bloat LOC hides renders as a
  // massive near-black monolith regardless of language
  const monolith = (file.bytes ?? 0) >= 150_000;
  // Category 6 (testing): a solid coverage report shields the building;
  // live test results override it — failures crack the shield open
  const testResult = useStore((s) => s.testResults[file.path]);
  const shielded =
    (cityMeta?.coverage ?? false) &&
    (file.coveragePct ?? 0) >= 80 &&
    testResult?.status !== "failed";
  const testsFailing = testResult?.status === "failed";
  const testsPassing = testResult?.status === "passed";
  // Category 2 (statics): circular import — red warning ring at the base
  const inCycle = (cityMeta?.cycles ?? false) && !!file.inCycle;
  const seed = useMemo(() => {
    let hash = 0;
    for (let i = 0; i < file.path.length; i++) hash = (hash * 31 + file.path.charCodeAt(i)) | 0;
    return Math.abs(hash);
  }, [file.path]);

  const isTower = h >= 12;
  const stepped = h >= 17;
  const bodyH = stepped ? h * 0.72 : h;
  const towerH = stepped ? h - bodyH : 0;
  const roofType = h < 9 ? "gable" : "flat";

  // ── Deterministic per-building variety (same seed → same city) ──────────
  // At most +2 extra meshes: one rooftop clutter item + optionally an annex.
  const vrng = mulberry32((seed ^ 0x51ab) >>> 0);
  const clutterRoll = vrng();
  const clutter: "tank" | "ac" | "vent" | "chimney" | "none" =
    roofType === "flat"
      ? clutterRoll < 0.26
        ? "tank"
        : clutterRoll < 0.58
          ? "ac"
          : clutterRoll < 0.78
            ? "vent"
            : "none"
      : clutterRoll < 0.35
        ? "chimney"
        : "none";
  const spread = stepped ? 0.3 : 0.42;
  const clutterX = (vrng() - 0.5) * w * spread;
  const clutterZ = (vrng() - 0.5) * d * spread;
  // Rooftop clutter sits on the tower deck when stepped, else on the roof slab
  const clutterBaseY = stepped ? h + 0.34 : bodyH + 0.55 + 0.26;
  const antennaH = 1.8 + ((seed % 97) / 97) * 1.8;
  const antennaOffX = ((seed % 13) - 6) * 0.07;

  // Occasional annex — a lower wing against the main volume (Sims-like massing)
  const annexRoll = vrng();
  const hasAnnex = !stepped && h >= 4 && h <= 15 && w >= 2.2 && d >= 2.2 && annexRoll < 0.24;
  const annexW = Math.max(1.1, w * 0.34);
  const annexD = Math.max(1.1, d * 0.34);
  const annexH = Math.max(1.4, h * (0.3 + vrng() * 0.18));
  const annexX = (w + annexW) / 2 - 0.12;
  const annexZ = (vrng() - 0.5) * Math.max(0, d - annexD) * 0.8;

  // ── Voxel-body mode: the blocks ARE the house (Minecraft-prinzip) ────────
  // When the honest layout carries real cells, the building's body IS the
  // voxel stack — no silhouette shell around it. The legacy facade body
  // below remains only as the fallback for slab-only layouts (old payloads,
  // fully budget-degraded files) and the decorative district towers.
  const hasVoxelCells = useMemo(
    () => !!voxels && voxels.sections.some((s) => s.detail && s.cells.length > 0),
    [voxels],
  );
  const voxelBody = hasVoxelCells;
  const voxelVariant: "normal" | "monolith" | "glass" = monolith
    ? "monolith"
    : matState === "glass"
      ? "glass"
      : "normal";
  // Slab sections (budget-degraded, no cells) keep their honest mass as
  // plain graphite boxes bridging the voxel stacks.
  const slabs = useMemo(
    () => (voxelBody && voxels ? slabSegments(voxels) : []),
    [voxelBody, voxels],
  );
  const slabRef = useRef<THREE.InstancedMesh>(null);
  const slabDummy = useMemo(() => new THREE.Object3D(), []);

  // Glass buildings (dead code) need no facade textures at all — and in
  // voxel-body mode no building does
  const facade = useMemo(
    () =>
      voxelBody || matState === "glass"
        ? null
        : getFacadeTextures(facadeColor, w, bodyH, alarm, seed),
    [voxelBody, matState, facadeColor, w, bodyH, alarm, seed],
  );

  // ── Honest-building stage ─────────────────────────────────────────────────
  // The selected file's voxels take the floor: the silhouette dims so the
  // materialized sections can shine. Slab-only layouts (old/stub payloads,
  // budget-degraded sections) keep the fully lit silhouette.
  // Voxel materialization is the tier-0 stage — only the selected building
  // materializes, and never under filter dimming.
  const focusFactor = dimmed || focusTier == null || focusTier === 0 ? 1 : FOCUS_FACTORS[focusTier];
  // View mode (spec §14): the mode dims via the same brightness-multiplier
  // path as the focus tiers. Filter dimming (`dimmed`) still wins — it works
  // over opacity and must not be double-darkened, so the mode factor
  // neutralizes there exactly like the focus factor already does.
  const viewMode = useStore((s) => s.viewMode);
  const modeF = dimmed ? 1 : modeFactor(viewMode, alarm);
  const overallFactor = focusFactor * modeF;
  const voxelStage = selected && hasVoxelCells && !dimmed && (focusTier == null || focusTier === 0);
  // Voxel-focus V3: resolve the highlighted source line to its cell, only
  // while the voxel stage is active. Pure mapping — recomputed only when the
  // layout, the line or the stage flips, never per frame.
  const highlightCell = useMemo(() => {
    if (!voxelStage || !voxels || highlightLine == null) return null;
    const hit = findVoxelForLine(voxels, highlightLine);
    return hit ? { sectionIndex: hit.sectionIndex, cellIndex: hit.cellIndex } : null;
  }, [voxelStage, voxels, highlightLine]);
  // Section boundaries for the always-visible glowing strata bands
  const bandHeights = useMemo(() => (voxels ? sectionBandHeights(voxels) : []), [voxels]);
  const bandData = useMemo(
    () => bandHeights.filter((bh) => bh <= bodyH - 0.05),
    [bandHeights, bodyH],
  );
  const bandRef = useRef<THREE.InstancedMesh>(null);
  const bandDummy = useMemo(() => new THREE.Object3D(), []);
  useLayoutEffect(() => {
    const mesh = bandRef.current;
    if (!mesh) return;
    bandData.forEach((bh, i) => {
      bandDummy.position.set(0, 0.3 + bh, 0);
      bandDummy.scale.set(w + 0.05, 0.02, d + 0.05);
      bandDummy.rotation.set(0, 0, 0);
      bandDummy.updateMatrix();
      mesh.setMatrixAt(i, bandDummy.matrix);
    });
    mesh.count = bandData.length;
    mesh.instanceMatrix.needsUpdate = true;
  }, [bandData, w, d]);

  // Slab boxes (voxel-body mode): one InstancedMesh for all degraded-section
  // masses — same trick as the section bands.
  useLayoutEffect(() => {
    const mesh = slabRef.current;
    if (!mesh || slabs.length === 0) return;
    slabs.forEach((seg, i) => {
      slabDummy.position.set(0, 0.3 + (seg.y0 + seg.y1) / 2, 0);
      slabDummy.scale.set(Math.max(0.1, w * 0.99), seg.y1 - seg.y0, Math.max(0.1, d * 0.99));
      slabDummy.rotation.set(0, 0, 0);
      slabDummy.updateMatrix();
      mesh.setMatrixAt(i, slabDummy.matrix);
    });
    mesh.count = slabs.length;
    mesh.instanceMatrix.needsUpdate = true;
  }, [slabs, w, d, slabDummy]);

  const slabMaterial = getVoxelMaterial("code", voxelVariant, overallFactor);

  const materials = useMemo(() => {
    if (voxelBody) return []; // voxel mode uses the shared cached materials
    if (monolith) {
      // Bloat monolith: near-black, featureless slab — reads as wasted space
      const side = new THREE.MeshStandardMaterial({
        color: dimColor("#0c0c0b", overallFactor),
        roughness: 0.35,
        metalness: 0.55,
        transparent: dimmed || voxelStage,
        opacity: dimmed ? 0.12 : voxelStage ? 0.3 : 1,
      });
      const roof = new THREE.MeshStandardMaterial({
        color: dimColor("#0a0a09", overallFactor),
        roughness: 0.3,
        metalness: 0.6,
        transparent: dimmed || voxelStage,
        opacity: dimmed ? 0.1 : voxelStage ? 0.26 : 1,
      });
      return [side, side, roof, roof, side, side];
    }
    if (matState === "glass") {
      const side = new THREE.MeshPhysicalMaterial({
        color: dimColor("#d8cdb4", overallFactor),
        roughness: 0.12,
        metalness: 0.05,
        transparent: true,
        opacity: dimmed ? 0.05 : voxelStage ? 0.1 : 0.26,
        transmission: 0.55,
        thickness: 0.6,
      });
      const roof = new THREE.MeshStandardMaterial({
        color: dimColor("#1a2530", overallFactor),
        roughness: 0.4,
        transparent: true,
        opacity: dimmed ? 0.08 : voxelStage ? 0.12 : 0.45,
      });
      return [side, side, roof, roof, side, side];
    }
    // Dark-metal body: graphite panels, faint env response, calm raster glow
    const side = new THREE.MeshStandardMaterial({
      color: dimColor("#23252b", overallFactor),
      map: facade!.map,
      emissiveMap: facade!.emissive,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: (voxelStage ? 0.15 : matState === "alarm" ? 1.15 : 0.55) * overallFactor,
      // Eroded hotspots read as coarse, corroded panels; healthy code as
      // smooth brushed metal. Language stays as the lit-slot accent.
      roughness: erosion === "eroded" ? 0.78 : erosion === "weathered" ? 0.6 : 0.45,
      metalness: erosion === "eroded" ? 0.25 : erosion === "weathered" ? 0.4 : 0.5,
      envMapIntensity: 0.9,
      transparent: dimmed || voxelStage,
      opacity: dimmed ? 0.12 : voxelStage ? 0.32 : 1,
    });
    const roof = new THREE.MeshStandardMaterial({
      color: dimColor(
        erosion === "stable" || erosion === "unknown" ? "#191917" : "#171310",
        overallFactor,
      ),
      roughness: 0.9,
      metalness: 0.2,
      transparent: dimmed || voxelStage,
      opacity: dimmed ? 0.12 : voxelStage ? 0.26 : 1,
    });
    return [side, side, roof, roof, side, side];
  }, [voxelBody, facade, dimmed, matState, erosion, monolith, voxelStage, overallFactor]);

  useEffect(() => {
    return () => {
      for (const m of materials) m.dispose();
    };
  }, [materials]);

  // Illuminated edges — the dark metal body reads as lit corner seams from
  // afar (spec: "beleuchtete Kanten"). One EdgesGeometry per volume; the
  // source boxes are disposed immediately, the edge buffers on unmount.
  const edgeGeometries = useMemo(() => {
    if (voxelBody) return [];
    const make = (bw: number, bh: number, bd: number): THREE.EdgesGeometry => {
      const box = new THREE.BoxGeometry(bw, bh, bd);
      const edges = new THREE.EdgesGeometry(box);
      box.dispose();
      return edges;
    };
    const list = [make(w, bodyH, d)];
    if (stepped) list.push(make(w * 0.62, towerH, d * 0.62));
    if (hasAnnex) list.push(make(annexW, annexH, annexD));
    return list;
  }, [voxelBody, w, bodyH, d, stepped, towerH, hasAnnex, annexW, annexH, annexD]);

  // Voxel-body outline: the block stack's silhouette seam — hover eases it
  // bright (the facade flicker's replacement), selection keeps it lit.
  const outlineEdges = useMemo(() => {
    if (!voxelBody) return null;
    const box = new THREE.BoxGeometry(w, h, d);
    const edges = new THREE.EdgesGeometry(box);
    box.dispose();
    return edges;
  }, [voxelBody, w, h, d]);
  useEffect(() => {
    return () => outlineEdges?.dispose();
  }, [outlineEdges]);
  const outlineMaterial = useMemo(
    () => new THREE.LineBasicMaterial({ color: "#f2efe8", transparent: true, opacity: 0.12 }),
    [],
  );
  useEffect(() => {
    return () => outlineMaterial.dispose();
  }, [outlineMaterial]);

  useEffect(() => {
    return () => {
      for (const g of edgeGeometries) g.dispose();
    };
  }, [edgeGeometries]);

  const beaconRef = useRef<THREE.Mesh>(null);
  const beamRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const cycleRef = useRef<THREE.Mesh>(null);
  const groupRef = useRef<THREE.Group>(null);
  // Construction cinematic finished — stop touching scale every frame
  const buildDoneRef = useRef(false);
  // Hover highlight: target 0/1, eased toward every frame (no React re-render)
  const hoverTargetRef = useRef(0);
  const hoverGlowRef = useRef(0);

  // Single frame callback per building (flicker + hover + construction combined)
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;

    // Construction cinematic — the building rises out of the ground
    const g = groupRef.current;
    if (g && !buildDoneRef.current) {
      if (!constructing || appearAt === undefined) {
        if (g.scale.y !== 1) g.scale.y = 1;
        g.visible = true;
        buildDoneRef.current = true;
      } else {
        const now = Date.now();
        if (now < appearAt) {
          g.visible = false;
        } else {
          g.visible = true;
          const k = Math.min(1, (now - appearAt) / 700);
          const ease = 1 - Math.pow(1 - k, 3);
          g.scale.y = Math.max(0.001, ease);
          if (k >= 1) buildDoneRef.current = true;
        }
      }
    }

    // Subtle slot flicker — the city breathes, quietly. Hover eases in a
    // warm boost on top of the flicker baseline instead of fighting it.
    // Glass has no emissive map — nothing to flicker. During the voxel
    // stage the body stays dimmed at its memoized low intensity.
    const mat = materials[0] as THREE.MeshStandardMaterial | undefined;
    if (mat && !dimmed && !voxelStage && matState !== "glass") {
      const target = hoverTargetRef.current;
      const cur = hoverGlowRef.current;
      const next = Math.abs(target - cur) < 0.005 ? target : cur + (target - cur) * 0.16;
      hoverGlowRef.current = next;
      // The alarm baseline must survive the per-frame write. The memoized
      // material starts an alarm body at 1.15; a flat 0.55 here silently
      // overwrote it every frame, so a P0 building flickered down to the calm
      // baseline and stopped reading as an alarm (#16a).
      const baseline = matState === "alarm" ? 1.15 : 0.55;
      // The focus AND mode factors ride on the baseline too — otherwise this
      // per-frame write would overwrite the memoized dimming every frame and
      // the city would flicker back to full brightness in SECURITY mode
      mat.emissiveIntensity =
        (baseline + next * 0.6 + Math.sin(t * 0.7 + seed) * 0.05) * overallFactor;
    }
    // Voxel-body hover: the outline seam eases bright — the facade flicker's
    // replacement on the block stack
    if (voxelBody) {
      const target = hoverTargetRef.current;
      const cur = hoverGlowRef.current;
      const next = Math.abs(target - cur) < 0.005 ? target : cur + (target - cur) * 0.16;
      hoverGlowRef.current = next;
      outlineMaterial.opacity = Math.min(
        1,
        (dimmed ? 0.04 : 0.12 + next * 0.4) * (selected ? 1.5 : 1),
      );
    }
    if (beaconRef.current) {
      const s = 0.8 + Math.abs(Math.sin(t * 2.4 + seed)) * 0.6;
      beaconRef.current.scale.setScalar(s);
    }
    if (beamRef.current) {
      const bm = beamRef.current.material as THREE.MeshBasicMaterial;
      bm.opacity = 0.05 + Math.abs(Math.sin(t * 1.3)) * 0.09;
    }
    if (ringRef.current) {
      ringRef.current.rotation.z = t * 0.6;
    }
    if (cycleRef.current) {
      cycleRef.current.rotation.z = t * 1.4;
    }
    if (glowRef.current) {
      const gm = glowRef.current.material as THREE.MeshBasicMaterial;
      gm.opacity = 0.34 + Math.sin(t * 2.2) * 0.14;
    }
  });

  // Etappe K camera craft: a click selects WITHOUT moving the camera — the
  // user is already looking at this building. selectBuilding sets selection
  // + drill chain but never issues a flyRequest, so InfoPanel, focus-tier
  // dimming and the voxel stage light up while the view stays put.
  // focusBuilding (double-click) remains the only camera-moving gesture here.
  const handleClick = (e: { stopPropagation: () => void }): void => {
    e.stopPropagation();
    selectBuilding(file.id);
  };

  // Double-click is the deliberate inspect gesture: select + fly + ORBIT —
  // the camera circles the building (cameraMode "orbit", Esc returns to free
  // flight). The preceding click already selected the file, so the flight
  // starts with the InfoPanel open; selection alone never moves the camera.
  const handleDoubleClick = (e: { stopPropagation: () => void }): void => {
    e.stopPropagation();
    focusBuilding(file.id);
  };

  const handleOver = (e: { stopPropagation: () => void }): void => {
    e.stopPropagation();
    hoverTargetRef.current = 1;
    setHoveredId(file.id);
    document.body.style.cursor = "pointer";
  };

  const handleOut = (): void => {
    hoverTargetRef.current = 0;
    setHoveredId(null);
    document.body.style.cursor = "auto";
  };

  // Unmount while hovered would leak the pointer cursor
  useEffect(() => {
    return () => {
      if (hoverTargetRef.current === 1) document.body.style.cursor = "auto";
    };
  }, []);

  const pointerProps = interactive
    ? {
        onClick: handleClick,
        onDoubleClick: handleDoubleClick,
        onPointerOver: handleOver,
        onPointerOut: handleOut,
      }
    : {};

  // Alarm beacon: shows the file's worst severity (critical ⇒ P0, high ⇒ P1).
  // Colour alone never carries meaning — CVD mode (and reviewed calm state)
  // switches to shape codes: P0 octahedron / P1 box / P2 cone.
  const beaconSev: Severity = file.threatLevel === "critical" ? "P0" : "P1";
  const shapeCoded = colorblind || fullyReviewed;
  const beaconShape: "sphere" | "octahedron" | "box" | "cone" = !shapeCoded
    ? "sphere"
    : beaconSev === "P0"
      ? "octahedron"
      : beaconSev === "P1"
        ? "box"
        : "cone";
  const beaconColor = dimColor(
    fullyReviewed ? REVIEWED_BEACON_COLOR : severityColor(beaconSev, colorblind),
    overallFactor,
  );
  const detailMats = dimmed ? DETAIL_MATERIALS_DIMMED : DETAIL_MATERIALS;

  return (
    <group ref={groupRef} position={[x, 0, z]}>
      {/* Foundation slab */}
      <mesh position={[0, 0.18, 0]}>
        <boxGeometry args={[w + 0.55, 0.36, d + 0.55]} />
        <meshStandardMaterial
          color="#141412"
          roughness={0.95}
          transparent={dimmed}
          opacity={dimmed ? 0.1 : 1}
        />
      </mesh>

      {voxelBody && voxels ? (
        <>
          {/* ── THE BLOCKS ARE THE HOUSE (Minecraft-prinzip) ──
              The voxel stack is the building: one block = one code line,
              visible from outside. No facade shell around it — the city's
              geometry is the real code structure (spec §2). The stack rises
              with the construction group like every building. */}
          <group position={[0, 0.3, 0]}>
            <VoxelMesh
              layout={voxels}
              visible
              animated={false}
              variant={voxelVariant}
              dim={overallFactor}
              shadeSeed={gfxLite ? 0 : seed}
              highlightCell={highlightCell}
            />
          </group>

          {/* Budget-degraded slab sections keep their honest mass as plain
              graphite boxes bridging the voxel stacks */}
          <instancedMesh
            ref={slabRef}
            args={[UNIT_BOX, undefined, 24]}
            material={slabMaterial}
            frustumCulled={false}
            raycast={() => null}
          />

          {/* Flat cap — a finished roofline on the topmost block */}
          <mesh position={[0, h + 0.3 + 0.09, 0]}>
            <boxGeometry args={[w + 0.16, 0.18, d + 0.16]} />
            <meshStandardMaterial
              color="#242c3d"
              roughness={0.85}
              transparent={dimmed}
              opacity={dimmed ? 0.1 : 1}
            />
          </mesh>

          {/* Outline seam — hover/selection ease it bright (see useFrame) */}
          {outlineEdges && (
            <lineSegments
              geometry={outlineEdges}
              position={[0, h / 2 + 0.3, 0]}
              material={outlineMaterial}
              raycast={() => null}
            />
          )}

          {/* Invisible pick volume — the whole building is ONE pointer
              target; the voxel meshes stay display-only */}
          <mesh position={[0, h / 2 + 0.3, 0]} material={PICK_MATERIAL} {...pointerProps}>
            <boxGeometry args={[w, h, d]} />
          </mesh>
        </>
      ) : (
        <>
          {/* Main body */}
          <mesh position={[0, bodyH / 2 + 0.3, 0]} material={materials} {...pointerProps}>
            <boxGeometry args={[w, bodyH, d]} />
          </mesh>

          {/* Illuminated edges — lit corner seams on the dark metal body */}
          {edgeGeometries[0] && (
            <lineSegments
              geometry={edgeGeometries[0]}
              position={[0, bodyH / 2 + 0.3, 0]}
              raycast={() => null}
            >
              <lineBasicMaterial
                color="#f2efe8"
                transparent
                opacity={dimmed ? 0.04 : 0.18 * overallFactor}
              />
            </lineSegments>
          )}

          {/* Stepped tower section */}
          {stepped && (
            <mesh
              position={[0, bodyH + 0.3 + towerH / 2, 0]}
              material={materials}
              {...pointerProps}
            >
              <boxGeometry args={[w * 0.62, towerH, d * 0.62]} />
            </mesh>
          )}
          {stepped && edgeGeometries[1] && (
            <lineSegments
              geometry={edgeGeometries[1]}
              position={[0, bodyH + 0.3 + towerH / 2, 0]}
              raycast={() => null}
            >
              <lineBasicMaterial
                color="#f2efe8"
                transparent
                opacity={dimmed ? 0.04 : 0.18 * overallFactor}
              />
            </lineSegments>
          )}

          {/* Occasional annex — lower wing reusing the body's facade materials */}
          {hasAnnex && (
            <mesh
              position={[annexX, annexH / 2 + 0.3, annexZ]}
              material={materials}
              {...pointerProps}
            >
              <boxGeometry args={[annexW, annexH, annexD]} />
            </mesh>
          )}
          {hasAnnex && edgeGeometries[1] && (
            <lineSegments
              geometry={edgeGeometries[1]}
              position={[annexX, annexH / 2 + 0.3, annexZ]}
              raycast={() => null}
            >
              <lineBasicMaterial
                color="#f2efe8"
                transparent
                opacity={dimmed ? 0.04 : 0.18 * overallFactor}
              />
            </lineSegments>
          )}

          {/* Section bands — thin amber strata boundaries, legible from afar.
          Only real section layouts produce boundaries; the stub layout's
          single slab stratum stays bandless. Bands hug the main body only.
          One InstancedMesh for all bands: up to 24 single meshes per building
          would multiply plaza draw calls pointlessly (reviewed). */}
          <instancedMesh
            ref={bandRef}
            args={[UNIT_BOX, undefined, MAX_BANDS]}
            material={(dimmed ? BAND_MATERIALS_DIMMED : BAND_MATERIALS).band}
            frustumCulled={false}
            raycast={() => null}
          />
        </>
      )}

      {/* Git erosion: warning band + scaffolding on churn hotspots */}
      {(erosion === "eroded" || erosion === "weathered") && (
        <group>
          <mesh position={[0, 0.62, 0]}>
            <boxGeometry args={[w + 0.34, 0.44, d + 0.34]} />
            <meshStandardMaterial
              color={dimColor("#ff9a3d", overallFactor)}
              emissive={dimColor("#ff9a3d", overallFactor)}
              emissiveIntensity={0.32 * overallFactor}
              roughness={0.6}
              transparent={dimmed}
              opacity={dimmed ? 0.1 : 1}
            />
          </mesh>
          {erosion === "eroded" &&
            (
              [
                [-1, -1],
                [1, -1],
                [-1, 1],
                [1, 1],
              ] as const
            ).map(([sx, sz]) => (
              <mesh
                key={`${sx}${sz}`}
                position={[sx * (w / 2 + 0.24), (bodyH + 0.3) / 2 + 0.5, sz * (d / 2 + 0.24)]}
              >
                <cylinderGeometry args={[0.09, 0.09, bodyH + 0.9, 6]} />
                <meshStandardMaterial
                  color={dimColor("#c7cdd8", overallFactor)}
                  roughness={0.5}
                  metalness={0.4}
                  transparent={dimmed}
                  opacity={dimmed ? 0.1 : 0.85 * overallFactor}
                />
              </mesh>
            ))}
        </group>
      )}

      {/* Live test result: failures crack the building (red wireframe), passes glow green at the base */}
      {testsFailing && (
        <mesh position={[0, (h + 0.3) / 2 + 0.4, 0]}>
          <boxGeometry args={[w + 1.3, h + 1.6, d + 1.3]} />
          <meshBasicMaterial
            color="#ff2e4d"
            wireframe
            transparent
            opacity={dimmed ? 0.1 : 0.55}
            toneMapped={false}
          />
        </mesh>
      )}
      {testsPassing && (
        <mesh position={[0, 0.32, 0]}>
          <boxGeometry args={[w + 0.8, 0.3, d + 0.8]} />
          <meshStandardMaterial
            color="#29d398"
            emissive="#29d398"
            emissiveIntensity={0.4}
            roughness={0.5}
          />
        </mesh>
      )}

      {/* Test coverage shield — well-tested code sits inside a light-blue field */}
      {shielded && (
        <mesh position={[0, (h + 0.3) / 2 + 0.4, 0]}>
          <boxGeometry args={[w + 1.1, h + 1.4, d + 1.1]} />
          <meshPhysicalMaterial
            color="#d8c9a3"
            transparent
            opacity={dimmed ? 0.05 : 0.14}
            roughness={0.05}
            transmission={0.7}
            thickness={0.4}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* Circular import warning: slowly rotating red ring at the base */}
      {inCycle && (
        <mesh ref={cycleRef} position={[0, 0.12, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[Math.max(w, d) * 0.95, 0.09, 8, 40]} />
          <meshStandardMaterial
            color="#ff2e4d"
            emissive="#ff2e4d"
            emissiveIntensity={0.9}
            toneMapped={false}
          />
        </mesh>
      )}

      {/* Roof + rooftop clutter — legacy silhouette decorations only; the
          voxel body's geometry IS honest, decorations would lie about it */}
      {!voxelBody && (
        <>
          {roofType === "gable" ? (
            <mesh position={[0, bodyH + 0.3 + 0.85, 0]} rotation={[0, Math.PI / 4, 0]}>
              <coneGeometry args={[Math.max(w, d) * 0.78, 1.7, 4]} />
              <meshStandardMaterial
                color={new THREE.Color(facadeColor).multiplyScalar(0.5 * overallFactor)}
                roughness={0.8}
                transparent={dimmed || voxelStage}
                opacity={dimmed ? 0.12 : voxelStage ? 0.3 : 1}
              />
            </mesh>
          ) : (
            <mesh position={[0, bodyH + (stepped ? 0.3 : 0.55) + 0.12, 0]}>
              <boxGeometry args={[w + 0.25, 0.24, d + 0.25]} />
              <meshStandardMaterial
                color="#242c3d"
                roughness={0.85}
                transparent={dimmed}
                opacity={dimmed ? 0.1 : 1}
              />
            </mesh>
          )}

          {/* Rooftop clutter — one seeded item: water tank / AC unit / vent / chimney */}
          {clutter === "tank" && (
            <mesh
              geometry={UNIT_CYLINDER}
              material={detailMats.metal}
              position={[clutterX, clutterBaseY + 0.5, clutterZ]}
              scale={[0.9, 1.0, 0.9]}
            />
          )}
          {clutter === "ac" && (
            <mesh
              geometry={UNIT_BOX}
              material={detailMats.metal}
              position={[clutterX, clutterBaseY + 0.28, clutterZ]}
              scale={[1.0, 0.55, 0.8]}
            />
          )}
          {clutter === "vent" && (
            <mesh
              geometry={UNIT_BOX}
              material={detailMats.dark}
              position={[clutterX, clutterBaseY + 0.35, clutterZ]}
              scale={[0.45, 0.7, 0.45]}
            />
          )}
          {clutter === "chimney" && (
            <mesh
              geometry={UNIT_BOX}
              material={detailMats.dark}
              position={[w * 0.26, bodyH + 0.3 + 1.0, d * 0.26]}
              scale={[0.4, 1.1, 0.4]}
            />
          )}
        </>
      )}

      {/* Antenna for towers / landmark — height + offset vary per seed */}
      {(isTower || showLandmark) && (
        <mesh position={[antennaOffX, h + (stepped ? 0.6 : 1.0) + antennaH / 2, antennaOffX]}>
          <cylinderGeometry args={[0.05, 0.09, antennaH, 6]} />
          <meshStandardMaterial color="#3a4256" roughness={0.6} />
        </mesh>
      )}

      {/* Alarm beacon — sized to match the legacy 0.28 sphere in every shape */}
      {alarm && (
        <mesh ref={beaconRef} position={[0, h + (stepped ? 0.6 : 1.0) + 0.35, 0]}>
          {beaconShape === "octahedron" ? (
            <octahedronGeometry args={[0.34, 0]} />
          ) : beaconShape === "box" ? (
            <boxGeometry args={[0.4, 0.4, 0.4]} />
          ) : beaconShape === "cone" ? (
            <coneGeometry args={[0.3, 0.6, 12]} />
          ) : (
            <sphereGeometry args={[0.28, 10, 10]} />
          )}
          <meshBasicMaterial color={beaconColor} />
        </mesh>
      )}

      {/* Landmark beam — the lighthouse of the city */}
      {showLandmark && (
        <>
          <mesh ref={beamRef} position={[0, h + 22, 0]}>
            <cylinderGeometry args={[0.32, 0.55, 44, 8, 1, true]} />
            <meshBasicMaterial
              color={ENV.windowAlarm}
              transparent
              opacity={0.08}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
          {/* Warm street-level glow pooling around the landmark (no shadows) */}
          <pointLight
            position={[0, Math.min(h * 0.6, 10), 0]}
            color="#ffd9a8"
            intensity={h * 4}
            distance={h * 6 + 40}
            decay={2}
          />
        </>
      )}

      {/* Selection ring + pooled ground glow */}
      {selected && (
        <>
          <mesh ref={ringRef} position={[0, 0.09, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[Math.max(w, d) * 0.72, Math.max(w, d) * 0.95, 40]} />
            <meshBasicMaterial
              color={ENV.selection}
              transparent
              opacity={0.85}
              side={THREE.DoubleSide}
            />
          </mesh>
          <mesh ref={glowRef} position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[Math.max(w, d) * 3.4, Math.max(w, d) * 3.4]} />
            <meshBasicMaterial
              map={getGroundGlowTexture()}
              color={ENV.selection}
              transparent
              opacity={0.4}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        </>
      )}
    </group>
  );
}
