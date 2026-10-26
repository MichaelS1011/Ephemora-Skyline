"use client";

import { useMemo, useRef, useEffect, useLayoutEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { CityFile, Severity } from "../city/types";
import type { FocusTier } from "../city/focus";
import type { VoxelLayout } from "../city/voxels";
import { crownBaseY, roofFor } from "../city/roofShape";
import { selectionContourGeometry } from "../city/selectionContour";
import {
  languageColor,
  severityColor,
  alarmWindowColors,
  landmarkBeamColor,
  REVIEWED_BEACON_COLOR,
  TEST_FAIL_COLOR,
  TEST_PASS_COLOR,
  BUILDING_SELECTION,
  CYCLE_RING_COLOR,
  ENV,
  type AlarmWindowTones,
} from "../city/palette";
import { beaconIdleScale, prefersReducedMotion } from "../city/motion";
import {
  HOVER,
  SEAM_COLOUR,
  claimHover,
  easeGlow,
  hairlineOpacity,
  inkOpacity,
  releaseHover,
} from "../interaction/hover";
import { FOOTPRINT_EDGES, makeInkMaterial } from "../interaction/hoverInk";
import { materialState, erosionState, findingBarSegments, FINDING_BAR } from "../city/mapping";
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

const FACADE_STYLES = ["modern", "brick", "classic", "glass"] as const;
export type FacadeStyle = (typeof FACADE_STYLES)[number];

/**
 * The style a seed renders as — exported so the pixel test can state which
 * pattern each style must produce. Deterministic: same seed, same style.
 */
export function facadeStyleForSeed(seed: number): FacadeStyle {
  return FACADE_STYLES[Math.abs(Math.trunc(seed)) % FACADE_STYLES.length]!;
}

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

/**
 * Cache key for a facade texture. The window tones are rasterised INTO the
 * texture, so they belong in the key: without them a palette switch keeps
 * serving the cached facade, and the city holds its red windows underneath a
 * legend that has just changed its mind.
 */
export function facadeCacheKey(
  color: string,
  w: number,
  h: number,
  alarm: boolean,
  seed: number,
  tones: AlarmWindowTones,
): string {
  return `v4|${color}|${Math.round(w * 4)}|${Math.round(h * 4)}|${alarm ? 1 : 0}|${seed % 9}|${tones.lit}${tones.pale}`;
}

/** Test seam: the pixel-pattern guard renders through the same painter. */
export function getFacadeTexturesForTest(
  color: string,
  w: number,
  h: number,
  alarm: boolean,
  seed: number,
  tones: AlarmWindowTones,
): FacadeTextures {
  return getFacadeTextures(color, w, h, alarm, seed, tones);
}

/**
 * The surface a style is made of (Materiality): a brick face reads matte and
 * dry, a curtain wall reads smooth and faintly metallic. Erosion shifts the
 * same pair in its own direction; the style sets where that shift starts.
 */
export function facadeSurfaceForStyle(style: FacadeStyle): {
  roughness: number;
  metalness: number;
} {
  switch (style) {
    case "brick":
      return { roughness: 0.86, metalness: 0.04 };
    case "classic":
      return { roughness: 0.72, metalness: 0.08 };
    case "glass":
      return { roughness: 0.22, metalness: 0.5 };
    default:
      return { roughness: 0.54, metalness: 0.3 };
  }
}

function getFacadeTextures(
  color: string,
  w: number,
  h: number,
  alarm: boolean,
  seed: number,
  tones: AlarmWindowTones,
): FacadeTextures {
  // v4: the alarm window pair joined the key. The body is still the v3
  // dark-metal raster — near-white with a 10% language tint, subtle vertical
  // mullion seams, dark smoked-glass slots, sparse dim lit windows — and the
  // graphite material below does the actual shading, so from afar the body
  // stays closed and calm (spec §16).
  const key = facadeCacheKey(color, w, h, alarm, seed, tones);
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
  const glass = "#839fae"; // dark glazed slot multiplier
  const litColor = alarm ? tones.lit : ENV.windowWarm;
  const litCool = alarm ? tones.pale : ENV.windowCool;

  const rng = mulberry32(seed * 7919 + Math.round(w * 8) + Math.round(h * 3));

  // Pick a facade style from the seed — gives visual variety across buildings
  // while keeping the same file always looking the same (deterministic).
  const style = facadeStyleForSeed(seed);

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

  const cols = 6;
  const rows = 10;
  const cellW = W / cols;
  const cellH = H / rows;

  if (style === "brick") {
    // Dense brick pattern with offset courses
    const brickH = 8;
    const brickW = 22;
    const accent = `#${tint.clone().multiplyScalar(0.7).getHexString()}`;
    for (let y = 0; y < H; y += brickH) {
      const offset = ((y / brickH) % 2) * (brickW * 0.5);
      for (let x = -brickW; x < W + brickW; x += brickW) {
        aCtx.fillStyle =
          (x + y) % 7 === 0
            ? `#${tint.clone().lerp(new THREE.Color("#fff"), 0.15).getHexString()}`
            : tintHex;
        aCtx.fillRect(x + offset, y, brickW - 1, brickH - 1);
        aCtx.strokeStyle = `${accent}aa`;
        aCtx.lineWidth = 0.6;
        aCtx.strokeRect(x + offset + 0.5, y + 0.5, brickW - 1, brickH - 1);
      }
    }
  } else if (style === "classic") {
    // Pilaster columns between window bays
    aCtx.fillStyle = tintHex;
    aCtx.fillRect(0, 0, W, H);
    const pilW = cellW * 0.18;
    const accentHex = `#${tint.clone().multiplyScalar(0.75).getHexString()}`;
    for (let c = 0; c <= cols; c++) {
      const x = c * cellW - pilW * 0.5;
      const grad = aCtx.createLinearGradient(x, 0, x + pilW, 0);
      grad.addColorStop(0, accentHex);
      grad.addColorStop(0.5, `#${tint.clone().lerp(new THREE.Color("#fff"), 0.3).getHexString()}`);
      grad.addColorStop(1, accentHex);
      aCtx.fillStyle = grad;
      aCtx.fillRect(x, 0, pilW, H);
    }
  } else if (style === "glass") {
    // Horizontal band glazing — full-width glass strips per floor
    aCtx.fillStyle = `#${tint.clone().multiplyScalar(0.6).getHexString()}`;
    aCtx.fillRect(0, 0, W, H);
    for (let r = 1; r < rows; r++) {
      const y = r * cellH;
      const grad = aCtx.createLinearGradient(0, y, 0, y + cellH);
      grad.addColorStop(0, `#${tint.clone().lerp(new THREE.Color("#aaddff"), 0.4).getHexString()}`);
      grad.addColorStop(0.5, glass);
      grad.addColorStop(1, `#${tint.clone().lerp(new THREE.Color("#aaddff"), 0.2).getHexString()}`);
      aCtx.fillStyle = grad;
      aCtx.fillRect(2, y + 2, W - 4, cellH - 4);
    }
  } else {
    // Modern: existing subtle vertical mullion style
    aCtx.fillStyle = floorSeam;
    for (let r = 1; r < rows; r++) {
      aCtx.fillRect(0, Math.round(r * cellH) - 1, W, 2);
    }
  }

  // Occasional fully dark floors (offices with the lights off)
  const darkFloor: boolean[] = [];
  for (let r = 0; r < rows; r++) darkFloor.push(rng() < 0.09);

  for (let r = 1; r <= 9; r++) {
    const ground = r === 9;
    for (let c = 0; c < cols; c++) {
      let x: number, y: number, ww: number, wh: number;
      if (style === "glass") {
        x = c * cellW + cellW * 0.08;
        y = r * cellH + cellH * 0.1;
        ww = cellW * 0.84;
        wh = cellH * 0.8;
      } else if (style === "classic") {
        x = c * cellW + cellW * 0.28;
        y = r * cellH + cellH * 0.15;
        ww = cellW * 0.44;
        wh = cellH * 0.7;
      } else {
        x = c * cellW + cellW * 0.36;
        y = r * cellH + cellH * 0.2;
        ww = cellW * 0.28;
        wh = ground ? cellH * 0.5 : cellH * 0.58;
      }

      if (style !== "glass") {
        aCtx.fillStyle = glass;
        aCtx.fillRect(x, y, ww, wh);
      }
      // Window frame
      if (style === "classic" || style === "brick") {
        aCtx.strokeStyle = `#${tint.clone().multiplyScalar(1.2).getHexString()}`;
        aCtx.lineWidth = 1.5;
        aCtx.strokeRect(x - 1, y - 1, ww + 2, wh + 2);
      }
      const lit = ground ? rng() < 0.16 : !darkFloor[r]! && rng() < (alarm ? 0.2 : 0.12);
      if (lit) {
        const warm = ground ? rng() < 0.95 : rng() < 0.82;
        eCtx.fillStyle = warm ? litColor : litCool;
        eCtx.fillRect(x + 1, y + 1, Math.max(1, ww - 2), Math.max(1, wh - 2));
      }
    }
  }

  // Vertical mullion seams at the bay boundaries — the metal panel joints
  if (style === "modern") {
    aCtx.fillStyle = seam;
    for (let c = 0; c <= cols; c++) {
      aCtx.fillRect(Math.round(c * cellW) - 1, 0, 2, H);
    }
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

// ── Three-group hull box ───────────────────────────────────────────────────
// A `BoxGeometry` carries six face groups, so the hull's six-slot material
// array `[side, side, roof, roof, side, side]` pulled six draw calls per hull
// mesh (body, stepped tower, annex). The same attribute data in the SAME draw
// order — +x/−x sides, both roof faces, +z/−z sides — costs three draw calls
// with the material array `[side, roof, side]`: positions, normals, UVs and
// the per-group material order are unchanged, so the picture is pixel-identical
// everywhere. Two groups (sides first, roof last) would draw the hull's
// transparent faces in a different blend order and measurably shift the dimmed
// close-up backdrop — measured 1.0 % of pixels against a 0.17 % animation
// floor, which this exact-order variant avoids.
const SIDE_GROUPS_A = [0, 1]; // +x, −x
const ROOF_GROUPS = [2, 3]; // +y, −y
const SIDE_GROUPS_B = [4, 5]; // +z, −z

function threeGroupBox(w: number, h: number, d: number): THREE.BufferGeometry {
  const box = new THREE.BoxGeometry(w, h, d);
  const flat = box.toNonIndexed(); // 6 groups × 6 vertices, in group order
  const order: number[] = [];
  for (const g of [...SIDE_GROUPS_A, ...ROOF_GROUPS, ...SIDE_GROUPS_B]) {
    for (let i = g * 6; i < g * 6 + 6; i++) order.push(i);
  }
  const merged = new THREE.BufferGeometry();
  for (const name of ["position", "normal", "uv"] as const) {
    const attr = flat.getAttribute(name);
    const out = new Float32Array(order.length * attr.itemSize);
    for (let i = 0; i < order.length; i++) {
      const src = order[i]! * attr.itemSize;
      const dst = i * attr.itemSize;
      for (let k = 0; k < attr.itemSize; k++) out[dst + k] = attr.array[src + k]!;
    }
    merged.setAttribute(name, new THREE.BufferAttribute(out, attr.itemSize));
  }
  const index = new Uint16Array(order.length);
  for (let i = 0; i < order.length; i++) index[i] = i;
  merged.setIndex(new THREE.BufferAttribute(index, 1));
  merged.addGroup(0, SIDE_GROUPS_A.length * 6, 0);
  merged.addGroup(SIDE_GROUPS_A.length * 6, ROOF_GROUPS.length * 6, 1);
  merged.addGroup((SIDE_GROUPS_A.length + ROOF_GROUPS.length) * 6, SIDE_GROUPS_B.length * 6, 2);
  box.dispose();
  flat.dispose();
  return merged;
}

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

/**
 * The finding bar stack: unlit and tone-mapping-free, so a P0 segment is
 * exactly the P0 colour the HUD legend swears is P0 — at any zoom, in any
 * light. One shared material for the whole city; the severity rides on the
 * instance colour, so a thousand alarms are still one shader.
 */
const BAR_MATERIAL = new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false });

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

/**
 * Z-03 — the contour of the chosen tower.
 *
 * The selected file was marked where it meets the ground: a gold ring at
 * y = 0,09 and a pooled additive glow. That is the same assumption §07.11 and
 * Z-01 had to give up on — a mark at the foot of something tall is behind its
 * neighbours as soon as the city is dense, and a 20-unit tower puts its base
 * out of sight long before its top is. The ring also sat on the plaza in a
 * colour that measures 1,39:1 against it.
 *
 * So the marker is `selectionContourGeometry`: casing plus gold, at the roof
 * line and around the footprint, in one vertex-coloured geometry. One mesh
 * where the ring was one mesh — the contour costs no draw call the city did not
 * already pay, and it names the building instead of the ground under it.
 */
const CONTOUR_MATERIAL = new THREE.MeshBasicMaterial({
  vertexColors: true,
  transparent: true,
  opacity: 0.95,
  side: THREE.DoubleSide,
  depthWrite: false,
  toneMapped: false,
});

// Radial ground glow under the selected building (one shared texture)
let groundGlowTexture: THREE.CanvasTexture | null = null;

// ── Contact shadow (Depth & Parallax) ───────────────────────────────────────
// A baked ambient-occlusion pool under every building: the world has no real
// shadows (the light-map pass costs more than the fps frame allows), so depth
// comes from a texture instead of a second render. One 128×128 canvas, shared
// by all buildings, drawn as a soft dark ellipse hugging the footprint — the
// eye reads it as weight, the GPU reads it as one extra quad per building.
let cavityTexture: THREE.CanvasTexture | null = null;
const CAVITY_OPACITY = 0.34;

export function getCavityTexture(): THREE.CanvasTexture {
  if (cavityTexture) return cavityTexture;
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  // transparent centre → darkest just inside the rim → feathered falloff out:
  // an AO contact ring, not a drop shadow with a direction
  const g = ctx.createRadialGradient(64, 64, 26, 64, 64, 64);
  g.addColorStop(0, "rgba(8,10,14,0)");
  g.addColorStop(0.5, "rgba(8,10,14,0.9)");
  g.addColorStop(0.78, "rgba(8,10,14,0.42)");
  g.addColorStop(1, "rgba(8,10,14,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  cavityTexture = new THREE.CanvasTexture(c);
  return cavityTexture;
}

/** The pool size for a footprint: body diagonal × 1.35, clamped to the block. */
export function cavitySpan(w: number, d: number): number {
  return Math.min(26, Math.max(6, Math.hypot(w, d) * 1.35));
}

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

/**
 * V3: the reveal pulse — one damped stroke on the beacon of the building that
 * carries the worst real finding, armed by CityScene with the reveal flight.
 * `k` walks 0→1 over this many ms; the envelope is a single cosine lobe
 * `(1−cos(2πk))/2`, zero slope at both ends, so the stroke starts and ends
 * damped (no snap, no loop — motion rules from 2026-10-16-motion.md).
 */
export const REVEAL_PULSE_MS = 1600;

/**
 * E2E observability (S-P3): how many times the pulse actually animated and how
 * far its lobe rose. Written from the render loop only — never React state, so
 * no subscriber hears it. The drive script reads it through the window.
 * Activations count DISTINCT arming objects that animated, not component
 * instances: a drill-in that remounts the building mid-pulse keeps the count
 * at one — it is still one pulse.
 */
let revealPulseActivations = 0;
const revealPulseSeen = new WeakSet<object>();

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
  /**
   * 005 Teil A: this file imports the selected one, so a change to the
   * selection may have to be re-read here. Marked with a cased square on the
   * ground — a different SHAPE from the round cycle ring and the gold
   * selection ring, because the claim must not rest on colour alone.
   */
  blastAffected?: boolean;
  /** Construction cinematic: epoch ms when this building starts to rise. */
  appearAt?: number;
  constructing?: boolean;
  /** When false (district skylines), the tower is decorative: no click/hover. */
  interactive?: boolean;
  /**
   * Hover-only body: the district skyline towers. They stand for real files
   * but are not selectable on this level (their plaza is one drill-in away),
   * so the pointer answers them — contour, cursor, tooltip — while the click
   * stays with the plot underneath.
   */
  hoverOnly?: boolean;
  /**
   * What the tooltip should read while THIS body is hovered. Defaults to the
   * file's own id; a district's skyline tower passes the district's block id,
   * because its file has no plaza on this level and the panel would otherwise
   * vanish the moment the pointer moves from the plot onto one of its towers.
   */
  hoverId?: string;
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
  /** True when a triage finding points at this file (focusedFindingKey matches). */
  findingFocus?: boolean;
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
  blastAffected = false,
  appearAt,
  constructing = false,
  interactive = true,
  hoverOnly = false,
  hoverId,
  fullyReviewed = false,
  voxels = null,
  highlightLine = null,
  findingFocus = false,
}: BuildingProps) {
  const { camera, gl } = useThree();
  const selectBuilding = useStore((s) => s.selectBuilding);
  // Etappe L "free camera": the double-click gesture upgrades from the plain
  // fly-to to the orbit-inspect mode — focusBuilding selects, flies and sets
  // the camera circling the building.
  const focusBuilding = useStore((s) => s.focusBuilding);
  const selectedUnit = useStore((s) => s.selectedUnit);
  const setHoveredId = useStore((s) => s.setHoveredId);
  // V3: the reveal pulse, armed once per build by CityScene. Every building
  // reads it; only the one whose file id matches animates.
  const revealPulse = useStore((s) => s.revealPulse);
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
  // The crown states what the body cannot: whether anything was found in this
  // file, and how badly. It used to be derived from `h` — the same number the
  // height already told, drawn twice, which is why every tower read as one shape.
  const roofType = roofFor(file.findings ?? []);

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

  // The alarm window pair the facade raster is painted with. A memo, because it
  // is part of the texture cache key: one switch, one repaint.
  const windowTones = useMemo(() => alarmWindowColors(colorblind), [colorblind]);
  // Glass buildings (dead code) need no facade textures at all — and in
  // voxel-body mode no building does
  const facade = useMemo(
    () =>
      voxelBody || matState === "glass"
        ? null
        : getFacadeTextures(facadeColor, w, bodyH, alarm, seed, windowTones),
    [voxelBody, matState, facadeColor, w, bodyH, alarm, seed, windowTones],
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

  // ── Finding bar stack (Balken) ─────────────────────────────────────────────
  // One segment per finding, worst at the bottom, rising off the ROOF with the
  // alarm beacon crowning it. Height is the finding COUNT, stack ORDER is the
  // severity rank — so the alarm reads as mass from across the district and as
  // a ranking without ever asking the reader to tell two oranges apart.
  // Segments past MAX_SEGMENTS fold into the top one, which keeps the height
  // monotone while capping the geometry at six instances per file.
  //
  // The roof, not the plot corner: the first version stood on the plinth at
  // front-left and measured +1 px of alarm at 111 units (2 → 3 px, see
  // out/c_demo_mid.json) because from the parked azimuth the tower hid its own
  // stack. Against the sky nothing can occlude it.
  const barSegments = useMemo(() => findingBarSegments(file.findings), [file.findings]);
  const roofY = h + (stepped ? 0.6 : 1.0);
  // The contour is built once per selection, not once per frame: its parts are
  // absolute in world units, so a shared unit geometry could not carry them.
  const contourGeo = useMemo(
    () => (selected ? selectionContourGeometry(w, d, roofY) : null),
    [selected, w, d, roofY],
  );
  useEffect(() => () => contourGeo?.dispose(), [contourGeo]);
  const barTop = barSegments.length ? barSegments[barSegments.length - 1]!.y1 : 0;
  const barRef = useRef<THREE.InstancedMesh>(null);
  const barDummy = useMemo(() => new THREE.Object3D(), []);
  useLayoutEffect(() => {
    const mesh = barRef.current;
    if (!mesh) return;
    barSegments.forEach((seg, i) => {
      barDummy.position.set(0, roofY + (seg.y0 + seg.y1) / 2, 0);
      barDummy.scale.set(FINDING_BAR.WIDTH, seg.y1 - seg.y0, FINDING_BAR.DEPTH);
      barDummy.rotation.set(0, 0, 0);
      barDummy.updateMatrix();
      mesh.setMatrixAt(i, barDummy.matrix);
      // A reviewed file calms its beacon to green; the stack has to calm with it
      // or the same building says "handled" and "look here" at the same time.
      mesh.setColorAt(
        i,
        new THREE.Color(
          dimColor(
            fullyReviewed ? REVIEWED_BEACON_COLOR : severityColor(seg.severity, colorblind),
            overallFactor,
          ),
        ),
      );
    });
    mesh.count = barSegments.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [barSegments, roofY, overallFactor, colorblind, fullyReviewed, barDummy]);

  const materials = useMemo(() => {
    if (voxelBody) return []; // voxel mode uses the shared cached materials
    if (monolith) {
      // Bloat monolith: near-black, featureless slab — reads as wasted space
      const side = new THREE.MeshStandardMaterial({
        color: "#5d7180",
        roughness: 0.35,
        metalness: 0.55,
        transparent: dimmed || voxelStage,
        opacity: dimmed ? 0.12 : voxelStage ? 0.3 : 1,
      });
      const roof = new THREE.MeshStandardMaterial({
        color: "#445b6b",
        roughness: 0.3,
        metalness: 0.6,
        transparent: dimmed || voxelStage,
        opacity: dimmed ? 0.1 : voxelStage ? 0.26 : 1,
      });
      side.userData.baseColor = "#5d7180";
      roof.userData.baseColor = "#445b6b";
      // Three slots in the original draw order: the hull geometry carries
      // three groups (sides, roof, sides) so each hull mesh is three draw
      // calls instead of six, with unchanged blend order.
      return [side, roof, side];
    }
    if (matState === "glass") {
      const side = new THREE.MeshPhysicalMaterial({
        color: "#d8cdb4",
        roughness: 0.12,
        metalness: 0.05,
        transparent: true,
        opacity: dimmed ? 0.05 : voxelStage ? 0.1 : 0.26,
        transmission: 0.55,
        thickness: 0.6,
      });
      const roof = new THREE.MeshStandardMaterial({
        color: "#1a2530",
        roughness: 0.4,
        transparent: true,
        opacity: dimmed ? 0.08 : voxelStage ? 0.12 : 0.45,
      });
      side.userData.baseColor = "#d8cdb4";
      roof.userData.baseColor = "#1a2530";
      return [side, roof, side];
    }
    // Light mineral panels keep the architecture legible against living land.
    // The painted style sets the surface it starts from; erosion still changes
    // roughness and metal response in the same order. Language stays as the
    // lit-slot accent.
    const surface = facadeSurfaceForStyle(facadeStyleForSeed(seed));
    const side = new THREE.MeshStandardMaterial({
      color: "#e1e7df",
      map: facade!.map,
      emissiveMap: facade!.emissive,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: voxelStage ? 0.15 : matState === "alarm" ? 1.15 : 0.55,
      // Eroded hotspots read as coarse, corroded panels; healthy code as
      // smooth brushed metal.
      roughness: Math.min(
        1,
        surface.roughness + (erosion === "eroded" ? 0.24 : erosion === "weathered" ? 0.11 : 0),
      ),
      metalness: Math.max(
        0,
        surface.metalness - (erosion === "eroded" ? 0.12 : erosion === "weathered" ? 0.05 : 0),
      ),
      envMapIntensity: 0.9,
      transparent: dimmed || voxelStage,
      opacity: dimmed ? 0.12 : voxelStage ? 0.32 : 1,
    });
    const roof = new THREE.MeshStandardMaterial({
      color: erosion === "stable" || erosion === "unknown" ? "#748c9e" : "#84796c",
      roughness: 0.9,
      metalness: 0.2,
      transparent: dimmed || voxelStage,
      opacity: dimmed ? 0.12 : voxelStage ? 0.26 : 1,
    });
    side.userData.baseColor = "#e1e7df";
    side.userData.baseEmissive = voxelStage ? 0.15 : matState === "alarm" ? 1.15 : 0.55;
    roof.userData.baseColor = erosion === "stable" || erosion === "unknown" ? "#748c9e" : "#84796c";
    return [side, roof, side];
  }, [voxelBody, facade, dimmed, matState, erosion, monolith, voxelStage, seed]);

  // One hull geometry per volume, three groups in the original face order —
  // the order the material array `[side, roof, side]` above is drawn in. The
  // body, the stepped tower and the annex each cost 3 draw calls instead of 6.
  const hullGeometries = useMemo(() => {
    if (voxelBody) return [];
    const list = [threeGroupBox(w, bodyH, d)];
    if (stepped) list.push(threeGroupBox(w * 0.62, towerH, d * 0.62));
    if (hasAnnex) list.push(threeGroupBox(annexW, annexH, annexD));
    return list;
  }, [voxelBody, w, bodyH, d, stepped, towerH, hasAnnex, annexW, annexH, annexD]);

  useEffect(() => {
    return () => {
      for (const g of hullGeometries) g.dispose();
    };
  }, [hullGeometries]);

  // Brightness (focus tier × view mode) used to be baked into the materials, so
  // selecting one file rebuilt every neighbour's materials and threw the old
  // ones away (measured in the browser). The material is created once at full
  // brightness and the factor is written onto it here — layout effect, so no
  // frame of the undimmed colour flashes before the next render.
  useLayoutEffect(() => {
    for (const m of materials) {
      const base = m.userData.baseColor as string | undefined;
      if (base) m.color.set(dimColor(base, overallFactor));
      if (m.userData.baseEmissive !== undefined) {
        const emissive = m as THREE.MeshStandardMaterial;
        emissive.emissiveIntensity = (m.userData.baseEmissive as number) * overallFactor;
      }
    }
  }, [materials, overallFactor]);

  // The seam materials are stable objects now (the hover writes them), so the
  // brightness factor reaches them in an effect below, next to the refs.

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
    () =>
      new THREE.LineBasicMaterial({
        color: SEAM_COLOUR,
        transparent: true,
        opacity: HOVER.seamRest,
      }),
    [],
  );
  useEffect(() => {
    return () => outlineMaterial.dispose();
  }, [outlineMaterial]);

  // Silhouette bodies draw their corner seams as line segments. The material
  // is one object we own instead of a fresh JSX material per render of the
  // building (that allocation ran on every hover anywhere in the city, because
  // the tooltip's store write re-renders nothing here — but a selection or a
  // mode change re-renders every building on the level).
  const seamMaterial = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: SEAM_COLOUR,
        transparent: true,
        opacity: HOVER.seamRest,
        depthWrite: false,
      }),
    [],
  );
  useEffect(() => {
    return () => seamMaterial.dispose();
  }, [seamMaterial]);

  // The pointer's ink: the body's envelope drawn in graphite plus a cut line
  // on the ground, sharing one material. Mounted invisible, so a city nobody
  // points at pays no draw call for it.
  const inkMaterial = useMemo(() => makeInkMaterial(), []);
  useEffect(() => {
    return () => inkMaterial.dispose();
  }, [inkMaterial]);
  const inkRef = useRef<THREE.Group>(null);

  useEffect(() => {
    return () => {
      for (const g of edgeGeometries) g.dispose();
    };
  }, [edgeGeometries]);

  const beaconRef = useRef<THREE.Mesh>(null);
  const beamRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const findingGlowRef = useRef<THREE.Mesh>(null);
  const groupRef = useRef<THREE.Group>(null);
  // Construction cinematic finished — stop touching scale every frame
  const buildDoneRef = useRef(false);
  const settleStartRef = useRef<number | null>(null);
  // The beacon's own birth, so its idle breath can settle (see `beaconIdleScale`)
  const beaconBornRef = useRef<number | null>(null);
  // V3: which pulse armings this building has consumed (each armed pulse runs
  // exactly once per mounted instance).
  const pulseConsumedRef = useRef<{ fileId: string; startAt: number } | null>(null);
  // Scratch vector for the pulse's screen-position report (S-P3 measurement).
  const pulseScreenVec = useMemo(() => new THREE.Vector3(), []);
  // Hover highlight: target 0/1, eased toward every frame (no React re-render)
  const hoverTargetRef = useRef(0);
  const hoverGlowRef = useRef(0);
  /** Stable identity for the pointer-cursor claim (see interaction/hover). */
  const cursorTokenRef = useRef({ id: file.id });

  // The seam materials are stable objects now, so the brightness factor has to
  // reach them by effect instead of through JSX: at rest the seam is a hairline
  // scaled by focus tier × view mode × filter, and a mode change with nothing
  // hovered must still land.
  useLayoutEffect(() => {
    const o = hairlineOpacity(overallFactor, dimmed);
    seamMaterial.opacity = o;
    outlineMaterial.opacity = o;
    // Re-renders re-assert `visible={false}` on the ink group; put it back in
    // sync with the glow so a hover survives a selection change unbroken.
    if (inkRef.current) inkRef.current.visible = hoverGlowRef.current > 0.02;
  }, [seamMaterial, outlineMaterial, overallFactor, dimmed]);

  // Single frame callback per building (flicker + hover + construction combined)
  useFrame(({ clock }) => {
    // Reduced motion holds the clock at 0: every pulse in here is a function of
    // `t`, so they land on their constant value (beacon mid-size, beam at its
    // dimmest, rings unrotated) and the frame stops changing. The construction
    // rise and the hover ease are handled explicitly below — they are tweens
    // toward a target, not functions of `t`, and "reduced" for a tween means
    // arriving immediately.
    const reduced = prefersReducedMotion();
    const t = reduced ? 0 : clock.elapsedTime;

    // Construction cinematic — the building rises out of the ground
    const g = groupRef.current;
    if (g && !buildDoneRef.current) {
      if (reduced) {
        // The city stands at once. The rise is decoration; the schedule that
        // paces it belongs to the build director (CityTree), not to this mesh.
        g.visible = true;
        g.scale.y = 1;
        buildDoneRef.current = true;
      } else if (!constructing || appearAt === undefined) {
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
          if (k >= 1) {
            buildDoneRef.current = true;
            settleStartRef.current = now;
          }
        }
      }
    }

    // Post-construction settle: a damped elastic overshoot (1.03 → 1.0) over
    // 500 ms after the rise completes. Gives the city a physical "landing" feel
    // without adding draw calls — one scale write per building, gated by a ref.
    if (g && buildDoneRef.current && settleStartRef.current !== null && !reduced) {
      const sk = Math.min(1, (Date.now() - settleStartRef.current) / 500);
      if (sk >= 1) {
        g.scale.y = 1;
        settleStartRef.current = null;
      } else {
        const bounce = Math.sin(sk * Math.PI * 2.5) * (1 - sk) * 0.03;
        g.scale.y = 1 + bounce;
      }
    }

    // ── The pointer's answer: one eased value, three channels ──────────────
    // The slot flicker used to run on EVERY building, every frame: hundreds of
    // material writes for a ±4 % brightness wobble nobody can read — and
    // motion that carries no information, which is exactly what a reader who
    // asked for reduced motion does not want, and what makes a still city hard
    // to scan for the one thing that moved. It now runs on the building the
    // pointer is on (and the selected one): motion marks the target, the rest
    // of the city holds its contract value.
    const lit = hoverTargetRef.current > 0 || hoverGlowRef.current > 0;
    if (lit) {
      const next = easeGlow(hoverGlowRef.current, hoverTargetRef.current, reduced);
      hoverGlowRef.current = next;
      // The ink annotation: envelope contour + ground cut line, one material,
      // one visibility switch for both.
      inkMaterial.opacity = inkOpacity(next);
      if (inkRef.current) inkRef.current.visible = next > 0.02;
      // Emission rides on the lit-window bodies only; glass and voxel stacks
      // have no emissive baseline to lift, and their ink carries the answer.
      const mat = materials[0] as THREE.MeshStandardMaterial | undefined;
      if (mat && !dimmed && !voxelStage && matState !== "glass") {
        // The alarm baseline must survive the per-frame write. The memoized
        // material starts an alarm body at 1.15; a flat 0.55 here silently
        // overwrote it every frame, so a P0 building flickered down to the calm
        // baseline and stopped reading as an alarm (#16a).
        const baseline = matState === "alarm" ? 1.15 : 0.55;
        // The focus AND mode factors ride on the baseline too — otherwise this
        // per-frame write would overwrite the memoized dimming every frame and
        // the city would flicker back to full brightness in SECURITY mode
        mat.emissiveIntensity =
          (baseline + next * 0.6 + (reduced ? 0 : Math.sin(t * 0.7 + seed) * 0.05)) * overallFactor;
      }
    }
    // V3: while the reveal pulse runs, it modulates the building itself — the
    // facade's lit windows swell in one damped stroke and the beacon follows,
    // both multiplicatively on their idle values, so the stroke starts and
    // settles with no snap. Under reduced motion the pulse is consumed without
    // animating (stillness).
    const armed =
      revealPulse && revealPulse.fileId === file.id && pulseConsumedRef.current !== revealPulse
        ? revealPulse
        : null;
    let pulseK = 0;
    let pulseBump = 0;
    if (armed) {
      const k = (Date.now() - armed.startAt) / REVEAL_PULSE_MS;
      if (k < 0) {
        // the reveal flight is still running — the pulse waits for its end
      } else if (k >= 1 || reduced) {
        pulseConsumedRef.current = armed;
      } else {
        pulseK = Math.min(1, k);
        pulseBump = (1 - Math.cos(pulseK * Math.PI * 2)) / 2;
        if (!revealPulseSeen.has(armed)) {
          revealPulseSeen.add(armed);
          revealPulseActivations += 1;
        }
      }
    }
    if (pulseK > 0) {
      // The facade flash: baseEmissive × overallFactor is the value the layout
      // effect writes; the lobe multiplies it and lands back on it at k → 1,
      // so the last per-frame write IS the resting value and nothing lingers.
      for (const m of materials) {
        if (m.userData.baseEmissive === undefined) continue;
        const em = m as THREE.MeshStandardMaterial;
        em.emissiveIntensity =
          (m.userData.baseEmissive as number) * overallFactor * (1 + 1.1 * pulseBump);
      }
    }
    if (beaconRef.current) {
      if (beaconBornRef.current === null) beaconBornRef.current = t;
      const idle = beaconIdleScale(t, seed, t - beaconBornRef.current);
      beaconRef.current.scale.setScalar(pulseK > 0 ? idle * (1 + 0.6 * pulseBump) : idle);
      // S-P3 measurement channel: what actually ran, for the headless drive.
      if (typeof window !== "undefined" && pulseK > 0) {
        // The beacon's screen position at this frame, so the drive can crop
        // the screenshot pair exactly to the pulsing building.
        pulseScreenVec.set(0, roofY + barTop + 0.35, 0);
        if (groupRef.current) groupRef.current.localToWorld(pulseScreenVec);
        pulseScreenVec.project(camera);
        const sx = ((pulseScreenVec.x + 1) / 2) * gl.domElement.clientWidth;
        const sy = ((1 - pulseScreenVec.y) / 2) * gl.domElement.clientHeight;
        const w = window as unknown as {
          __revealPulse?: {
            activations: number;
            peak: number;
            target: string;
            screen: { x: number; y: number };
          };
        };
        w.__revealPulse = {
          activations: revealPulseActivations,
          peak: Math.max(w.__revealPulse?.peak ?? 0, pulseBump),
          target: file.id,
          screen: { x: Math.round(sx), y: Math.round(sy) },
        };
      }
    }
    if (beamRef.current) {
      const bm = beamRef.current.material as THREE.MeshBasicMaterial;
      bm.opacity = 0.05 + Math.abs(Math.sin(t * 1.3)) * 0.09;
    }
    if (glowRef.current) {
      const gm = glowRef.current.material as THREE.MeshBasicMaterial;
      gm.opacity = 0.34 + Math.sin(t * 2.2) * 0.14;
    }
    if (findingGlowRef.current) {
      const fm = findingGlowRef.current.material as THREE.MeshBasicMaterial;
      fm.opacity = 0.55 + Math.sin(t * 4) * 0.2;
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
    // Cursor AND tooltip go to one owner (see interaction/hover): the release
    // on the object the pointer just left must not undo the claim of the one
    // it landed on.
    claimHover(cursorTokenRef.current, hoverId ?? file.id, setHoveredId);
  };

  const handleOut = (): void => {
    hoverTargetRef.current = 0;
    releaseHover(cursorTokenRef.current, setHoveredId);
  };

  // Unmount while hovered would leak the pointer cursor and the tooltip target
  useEffect(() => {
    return () => {
      if (hoverTargetRef.current === 1) releaseHover(cursorTokenRef.current, setHoveredId);
    };
  }, [setHoveredId]);

  const pointerProps = !interactive
    ? {}
    : hoverOnly
      ? { onPointerOver: handleOver, onPointerOut: handleOut }
      : {
          onClick: handleClick,
          onDoubleClick: handleDoubleClick,
          onPointerOver: handleOver,
          onPointerOut: handleOut,
        };

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
      {/* Contact shadow — the baked AO pool under the foundation slab. It sits
          below scale.y's anchor (y = 0), so the rise animation leaves it on
          the ground while the building grows out of it. */}
      <mesh position={[0, 0.045, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[cavitySpan(w, d), cavitySpan(w, d)]} />
        <meshBasicMaterial
          map={getCavityTexture()}
          transparent
          opacity={dimmed ? CAVITY_OPACITY * 0.3 : CAVITY_OPACITY}
          depthWrite={false}
        />
      </mesh>

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

      {/* ── The pointer's ink ───────────────────────────────────────────────
          The body's envelope drawn in graphite, plus a cut line on the ground
          around the footprint. One material, one group: the frame loop switches
          the group's visibility, so an un-hovered city pays nothing. The
          envelope buffer is the one the body already computed — no second
          geometry per building. */}
      <group ref={inkRef} visible={false}>
        <lineSegments
          geometry={FOOTPRINT_EDGES}
          material={inkMaterial}
          position={[0, 0.42, 0]}
          scale={[w + 1.15, 1, d + 1.15]}
          raycast={() => null}
        />
        {(voxelBody ? outlineEdges : edgeGeometries[0]) && (
          <lineSegments
            geometry={(voxelBody ? outlineEdges : edgeGeometries[0])!}
            material={inkMaterial}
            position={[0, voxelBody ? h / 2 + 0.3 : bodyH / 2 + 0.3, 0]}
            raycast={() => null}
          />
        )}
      </group>

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
          <mesh
            position={[0, bodyH / 2 + 0.3, 0]}
            geometry={hullGeometries[0]}
            material={materials}
            {...pointerProps}
          />

          {/* Illuminated edges — lit corner seams on the dark metal body. The
              material is one object the hover eases (see useFrame), not a
              fresh JSX material per render. */}
          {edgeGeometries[0] && (
            <lineSegments
              geometry={edgeGeometries[0]}
              position={[0, bodyH / 2 + 0.3, 0]}
              material={seamMaterial}
              raycast={() => null}
            />
          )}

          {/* Stepped tower section */}
          {stepped && (
            <mesh
              position={[0, bodyH + 0.3 + towerH / 2, 0]}
              geometry={hullGeometries[1]}
              material={materials}
              {...pointerProps}
            />
          )}
          {stepped && edgeGeometries[1] && (
            <lineSegments
              geometry={edgeGeometries[1]}
              position={[0, bodyH + 0.3 + towerH / 2, 0]}
              material={seamMaterial}
              raycast={() => null}
            />
          )}

          {/* Occasional annex — lower wing reusing the body's facade materials */}
          {hasAnnex && (
            <mesh
              position={[annexX, annexH / 2 + 0.3, annexZ]}
              geometry={hullGeometries[2]}
              material={materials}
              {...pointerProps}
            />
          )}
          {hasAnnex && edgeGeometries[1] && (
            <lineSegments
              geometry={edgeGeometries[1]}
              position={[annexX, annexH / 2 + 0.3, annexZ]}
              material={seamMaterial}
              raycast={() => null}
            />
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
            color={TEST_FAIL_COLOR}
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
            color={TEST_PASS_COLOR}
            emissive={TEST_PASS_COLOR}
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

      {/* Circular import warning: a thin line on the plinth, not a second
          ring competing with the selection. */}
      {inCycle && (
        <mesh position={[0, 0.11, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[Math.max(w, d) * 0.9, Math.max(w, d) * 0.935, 40]} />
          <meshBasicMaterial
            color={CYCLE_RING_COLOR}
            transparent
            opacity={0.8}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* 005 Teil A — this building imports the selected one. Two flat squares:
          a dark casing carrying the edge, a cyan core saying which way the
          dependency runs (the legend's own colour for an arriving import).
          Bare cyan on the plaza measured 1.03:1 for the arcs and needed the
          same casing there, so it needs one here. Square, not round: the cycle
          ring above and the selection ring are both circles, and an impact
          claim that shares their shape is only told apart by hue. */}
      {blastAffected && (
        <>
          <mesh position={[0, 0.13, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
            <planeGeometry args={[Math.max(w, d) * 1.5, Math.max(w, d) * 1.5]} />
            <meshBasicMaterial
              color={ENV.arcCasing}
              transparent
              opacity={0.92}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
          <mesh position={[0, 0.14, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
            <planeGeometry args={[Math.max(w, d) * 1.24, Math.max(w, d) * 1.24]} />
            <meshBasicMaterial
              color={ENV.importIn}
              transparent
              opacity={0.95}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
        </>
      )}

      {/* The crown — the finding, told in massing. Drawn for BOTH body kinds:
          an opened building becomes a voxel stack, and a crown that only lived
          on the legacy shell would disappear exactly when the reader came close
          enough to want it. Geometry only, no colour spent on it. */}
      {roofType !== "flat" &&
        (() => {
          const crownY = crownBaseY({ voxelBody, bodyH, stepped, h }) + 0.12;
          const roofTone = new THREE.Color("#38455e").multiplyScalar(overallFactor);
          const crownProps = {
            roughness: 0.8,
            transparent: dimmed || voxelStage,
            opacity: dimmed ? 0.12 : voxelStage ? 0.3 : 1,
          };
          return (
            <>
              {roofType === "penthouse" && (
                <mesh position={[0, crownY + 0.68, 0]}>
                  {/* Setback penthouse, narrower than the terrace plate it sits
                      under: the ~0.68 box was only 1.7 px apart from the terrace
                      at the district overview (worst footprint + sin-elevation
                      squash), so the two crowns collapsed into one lid. 0.5 opens
                      the gap past 3 px — width only, height untouched, so the
                      crown still says nothing about the tower's measured top. */}
                  <boxGeometry args={[w * 0.5, 1.35, d * 0.5]} />
                  <meshStandardMaterial color={roofTone} {...crownProps} />
                </mesh>
              )}

              {roofType === "terrace" && (
                <>
                  <mesh position={[-w * 0.12, crownY + 0.39, -d * 0.12]}>
                    <boxGeometry args={[w * 0.88, 0.78, d * 0.88]} />
                    <meshStandardMaterial color={roofTone} {...crownProps} />
                  </mesh>
                  <mesh position={[w * 0.16, crownY + 1.17, d * 0.16]}>
                    <boxGeometry args={[w * 0.56, 0.78, d * 0.56]} />
                    <meshStandardMaterial color={roofTone} {...crownProps} />
                  </mesh>
                </>
              )}

              {roofType === "mast" && (
                <mesh
                  position={[0, crownY + 1.3, 0]}
                  geometry={UNIT_CYLINDER}
                  material={detailMats.metal}
                  scale={[0.48, 2.6, 0.48]}
                />
              )}
            </>
          );
        })()}

      {/* Roof + rooftop clutter — legacy silhouette decorations only; the
          voxel body's geometry IS honest, decorations would lie about it */}
      {!voxelBody && (
        <>
          {(() => {
            // One dark slab on every legacy tower, so the crown sits on a roof
            // rather than floating where the old lid did.
            const capY = crownBaseY({ voxelBody, bodyH, stepped, h });
            return (
              <mesh position={[0, capY, 0]}>
                <boxGeometry args={[w + 0.25, 0.24, d + 0.25]} />
                <meshStandardMaterial
                  color="#242c3d"
                  roughness={0.85}
                  transparent={dimmed}
                  opacity={dimmed ? 0.1 : 1}
                />
              </mesh>
            );
          })()}

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
        <mesh
          position={[
            antennaOffX + (barSegments.length ? FINDING_BAR.WIDTH / 2 + 0.12 : 0),
            h + (stepped ? 0.6 : 1.0) + antennaH / 2,
            antennaOffX,
          ]}
        >
          <cylinderGeometry args={[0.05, 0.09, antennaH, 6]} />
          <meshStandardMaterial color="#3a4256" roughness={0.6} />
        </mesh>
      )}

      {/* Finding bar stack — the count as mass, the severity as stack order,
          read against the sky so no neighbouring tower can swallow it. Hidden
          with the building itself under a filter dim: a backdrop keeps its
          backdrop. */}
      {barSegments.length > 0 && !dimmed && (
        <instancedMesh
          ref={barRef}
          args={[UNIT_BOX, undefined, FINDING_BAR.MAX_SEGMENTS]}
          material={BAR_MATERIAL}
          frustumCulled={false}
          raycast={() => null}
        />
      )}

      {/* Alarm beacon — sized to match the legacy 0.28 sphere in every shape,
          and crowning the stack: the crown names the worst class by shape, the
          height below it counts the findings. */}
      {alarm && (
        <mesh ref={beaconRef} position={[0, roofY + barTop + 0.35, 0]}>
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
              color={landmarkBeamColor(colorblind)}
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

      {/* Chosen tower: the contour (roof + foot, casing + core) and the pooled
          ground glow that tells the reader this light comes from below. */}
      {selected && contourGeo && (
        <>
          <mesh
            geometry={contourGeo}
            material={CONTOUR_MATERIAL}
            renderOrder={11}
            frustumCulled={false}
            raycast={() => null}
          />
          <mesh ref={glowRef} position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[Math.max(w, d) * 3.4, Math.max(w, d) * 3.4]} />
            <meshBasicMaterial
              map={getGroundGlowTexture()}
              color={BUILDING_SELECTION}
              transparent
              opacity={0.4}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        </>
      )}

      {/* Finding-focus glow: a pulsing ring when a triage finding targets this
          file but the building is not selected (selection draws its contour). */}
      {findingFocus && !selected && (
        <mesh ref={findingGlowRef} position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[Math.max(w, d) * 0.65, Math.max(w, d) * 0.88, 40]} />
          <meshBasicMaterial
            color={BUILDING_SELECTION}
            transparent
            opacity={0.55}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  );
}
