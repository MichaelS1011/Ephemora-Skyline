"use client";

/**
 * VoxelMesh — the "honest building" materialization (spec §5–7, §16).
 *
 * One voxel = one code line. When a file building is selected, its packed
 * sections materialize as instanced boxes: code voxels solid, comment voxels
 * translucent. At most two InstancedMeshes (code + comment) share one box
 * geometry — ≤ 2 draw calls, well inside the 3-draw-call budget.
 *
 * Prop contract:
 *  - `layout`   the VoxelLayout from the placement (see city/voxels.ts).
 *               Old payloads degrade to slab sections without cells — the
 *               component then renders nothing and the pure silhouette
 *               stays alone on stage.
 *  - `visible`  when false nothing is mounted: the JSX InstancedMeshes
 *               unmount and their instance buffers are freed (R3F disposes
 *               the JSX-created meshes). Geometry/material are module-level
 *               shared resources and intentionally survive mounts.
 *  - `animated` staggered reveal by cell index (default). The gfxLite path
 *               passes false: every instance appears at once, the frame
 *               loop never touches instance matrices.
 *
 * Coordinate conventions (kept pure + unit-tested in tests/voxelMesh.test.ts):
 *  - buildInstanceTransforms returns voxel-space positions: x/z relative to
 *    the building base center (the section's base offset applied), y measured
 *    from the building base (ground, y=0) with cell row 0 centered at
 *    0.5 * voxelSize. The parent applies the body base lift (0.3, the main
 *    body's bottom edge) by wrapping the component in a group.
 *  - sectionBandHeights returns the voxel-space top height of every section
 *    boundary EXCEPT the roofline — these drive the silhouette's glowing
 *    section bands in Building.tsx.
 */

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { VOXEL_BUDGET, type VoxelCellKind, type VoxelLayout } from "../city/voxels";

/** A materializable voxel: voxel-space position + visual kind. */
export interface VoxelInstance {
  x: number;
  y: number;
  z: number;
  kind: VoxelCellKind;
}

/** Hard instance cap — the layout generator respects it too; enforced here. */
const MAX_INSTANCES = VOXEL_BUDGET;

/** Bands above this count stop adding information and start adding noise. */
const MAX_BANDS = 24;

/**
 * Flatten every detail section's cells into deterministic instance transforms
 * (sections in array order, cells in array order). Slab sections
 * (detail=false) contribute nothing. Never returns more than VOXEL_BUDGET
 * instances. Pure — same layout in, same list out.
 */
export function buildInstanceTransforms(layout: VoxelLayout): VoxelInstance[] {
  const out: VoxelInstance[] = [];
  const s = layout.voxelSize;
  for (const section of layout.sections) {
    if (!section.detail) continue;
    for (const cell of section.cells) {
      if (out.length >= MAX_INSTANCES) return out;
      out.push({
        x: section.base.x + cell.x * s,
        y: (cell.y + 0.5) * s,
        z: section.base.z + cell.z * s,
        kind: cell.kind,
      });
    }
  }
  return out;
}

/**
 * Heights of the section boundaries in voxel space (from the building base).
 * Detail sections end at their highest cell row; slab sections stack
 * codeLines * voxelSize on top of the running height (1 voxel = 1 line).
 * Everything clamps to layout.height. The final boundary IS the roofline and
 * is not a band; boundaries closer than ¾ voxel to the previous one or to
 * the ground are skipped; capped at MAX_BANDS. Pure + deterministic.
 */
export function sectionBandHeights(layout: VoxelLayout): number[] {
  const s = layout.voxelSize;
  const tops: number[] = [];
  let running = 0;
  for (const section of layout.sections) {
    if (section.detail && section.cells.length > 0) {
      let maxY = 0;
      for (const cell of section.cells) if (cell.y > maxY) maxY = cell.y;
      running = Math.max(running, (maxY + 1) * s);
    } else {
      running += section.codeLines * s;
    }
    tops.push(Math.min(running, layout.height));
  }
  const heights: number[] = [];
  for (let i = 0; i < tops.length - 1; i++) {
    const h = tops[i]!;
    if (h < s * 0.75) continue;
    const prev = heights[heights.length - 1];
    if (prev !== undefined && h - prev < s * 0.75) continue;
    heights.push(h);
    if (heights.length >= MAX_BANDS) break;
  }
  return heights;
}

// ── Shared detail resources (module-level, NEVER disposed per mount) ───────
// Same pattern as Building's DETAIL_MATERIALS: one box geometry per voxel
// size (VOXEL_SIZE is constant per city → one entry) and two materials.
// Only the per-mount instance buffers come and go, and R3F frees them when
// the JSX InstancedMesh unmounts.

const geometryCache = new Map<number, THREE.BoxGeometry>();
function getVoxelGeometry(voxelSize: number): THREE.BoxGeometry {
  const key = Math.round(voxelSize * 1000);
  const hit = geometryCache.get(key);
  if (hit) return hit;
  const geo = new THREE.BoxGeometry(voxelSize, voxelSize * 0.98, voxelSize);
  geometryCache.set(key, geo);
  return geo;
}

// ── Material variants (voxel-body mode: the blocks ARE the building) ────────
// Three semantic variants, mirroring the legacy silhouette's material states:
//  - normal    blue-gray blocks (healthy structure)
//  - monolith  dark slate featureless blocks (bloat LOC ≥ 150 KB)
//  - glass     translucent blocks (dead code)
// Dimming composes the focus-tier and view-mode brightness multipliers into
// ONE factor applied as a color multiply — never opacity, which sorts wrong.
// Materials are cached per (kind, variant, rounded dim): the dim space is
// finite ({1} × focus {1,.65,.3,.15} × mode {1,.45,.35} plus filter 0.12),
// so the cache cannot grow unbounded. Shared across all buildings — callers
// must never dispose these.

export type VoxelVariant = "normal" | "monolith" | "glass";

const BASE_VOXEL_COLORS: Record<VoxelVariant, string> = {
  normal: "#a6b9c7",
  monolith: "#5d7180",
  glass: "#8ea4b8",
};

const voxelMaterialCache = new Map<string, THREE.MeshStandardMaterial>();

export function getVoxelMaterial(
  kind: "code" | "comment",
  variant: VoxelVariant,
  dim: number,
): THREE.MeshStandardMaterial {
  const d = Math.max(0.04, Math.min(1, dim));
  const key = `${kind}|${variant}|${d.toFixed(2)}`;
  const hit = voxelMaterialCache.get(key);
  if (hit) return hit;
  const base = new THREE.Color(BASE_VOXEL_COLORS[variant]).multiplyScalar(d);
  const mat =
    kind === "comment"
      ? new THREE.MeshStandardMaterial({
          color: base,
          metalness: 0.35,
          roughness: 0.5,
          transparent: true,
          opacity: variant === "glass" ? 0.18 : 0.35,
          // Comments glow through without fighting the depth buffer
          depthWrite: false,
        })
      : new THREE.MeshStandardMaterial({
          color: base,
          metalness: variant === "monolith" ? 0.5 : 0.35,
          roughness: variant === "monolith" ? 0.4 : 0.5,
          transparent: variant === "glass",
          opacity: variant === "glass" ? 0.3 : 1,
        });
  voxelMaterialCache.set(key, mat);
  return mat;
}

/**
 * Deterministic per-voxel brightness grain in [0.88, 1.12] — the Minecraft
 * block feel: neighbouring voxels never read as one flat surface. Pure;
 * applied as instanceColor so the shared material stays untouched.
 */
export function voxelShade(index: number, seed: number): number {
  let h = (index * 374761393 + seed * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return 0.88 + (((h >>> 0) % 1000) / 1000) * 0.24;
}

/**
 * Height intervals of the slab (detail=false) sections, in voxel space from
 * the building base — the honest mass that has no cells to show. Voxel-body
 * mode renders each interval as a plain graphite box so budget-degraded
 * sections keep their volume. Complements sectionBandHeights (which marks
 * DETAIL boundaries): same running-height walk, different filter. Pure.
 */
export interface SlabSegment {
  y0: number;
  y1: number;
}

export function slabSegments(layout: VoxelLayout): SlabSegment[] {
  const s = layout.voxelSize;
  const out: SlabSegment[] = [];
  let running = 0;
  for (const section of layout.sections) {
    if (section.detail && section.cells.length > 0) {
      let maxY = 0;
      for (const cell of section.cells) if (cell.y > maxY) maxY = cell.y;
      running = Math.max(running, (maxY + 1) * s);
    } else if (section.codeLines > 0 && !section.detail) {
      const y0 = Math.min(running, layout.height);
      running += section.codeLines * s;
      const y1 = Math.min(running, layout.height);
      if (y1 - y0 > 0.01) out.push({ y0, y1 });
    }
  }
  return out;
}

// The pulsing red focus voxel — one shared material, one shared geometry
// cache (10% taller than a voxel so it visibly caps the stack cell).
const HIGHLIGHT_MATERIAL = new THREE.MeshStandardMaterial({
  color: "#ff2e4d",
  emissive: "#ff2e4d",
  emissiveIntensity: 1.4,
});

const highlightGeometryCache = new Map<number, THREE.BoxGeometry>();
function getHighlightGeometry(voxelSize: number): THREE.BoxGeometry {
  const key = Math.round(voxelSize * 1000);
  const hit = highlightGeometryCache.get(key);
  if (hit) return hit;
  const geo = new THREE.BoxGeometry(voxelSize, voxelSize * 1.06, voxelSize);
  highlightGeometryCache.set(key, geo);
  return geo;
}

const REVEAL_SECONDS = 0.9;
const MIN_SCALE = 0.01;

// Reused per-frame scratch — zero allocations in the frame loop
const _matrix = new THREE.Matrix4();
const _color = new THREE.Color();

interface IndexedInstance {
  gi: number; // global index — the unified stagger order
  x: number;
  y: number;
  z: number;
}

function splitByKind(instances: VoxelInstance[]): {
  code: IndexedInstance[];
  comment: IndexedInstance[];
} {
  const code: IndexedInstance[] = [];
  const comment: IndexedInstance[] = [];
  for (let i = 0; i < instances.length; i++) {
    const inst = instances[i]!;
    const target = inst.kind === "comment" ? comment : code;
    target.push({ gi: i, x: inst.x, y: inst.y, z: inst.z });
  }
  return { code, comment };
}

/**
 * Write instance matrices for the reveal window that opened since the last
 * frame. Only instances inside (previous reveal, current reveal] are touched
 * — O(newly revealed), never O(total) per frame. The newest instance scales
 * up smoothly from MIN_SCALE; every fully revealed one is written exactly
 * once at scale 1.
 */
function writeRevealWindow(
  mesh: THREE.InstancedMesh | null,
  items: IndexedInstance[],
  cursorRef: { current: number },
  reveal: number,
): void {
  if (!mesh || cursorRef.current >= items.length) return;
  let writes = 0;
  let i = cursorRef.current;
  for (; i < items.length; i++) {
    const it = items[i]!;
    const phase = reveal - it.gi;
    if (phase <= 0) break; // stagger has not reached this instance yet
    const scale = phase >= 1 ? 1 : Math.max(MIN_SCALE, phase);
    _matrix.makeScale(scale, scale, scale);
    _matrix.setPosition(it.x, it.y, it.z);
    mesh.setMatrixAt(i, _matrix);
    writes++;
    if (phase >= 1) {
      cursorRef.current = i + 1; // done — never touched again
    } else {
      break; // partial — stays in the window, rewritten next frame
    }
  }
  if (writes > 0) mesh.instanceMatrix.needsUpdate = true;
}

function writeAll(mesh: THREE.InstancedMesh | null, items: IndexedInstance[], scale: number): void {
  if (!mesh) return;
  for (let i = 0; i < items.length; i++) {
    const it = items[i]!;
    _matrix.makeScale(scale, scale, scale);
    _matrix.setPosition(it.x, it.y, it.z);
    mesh.setMatrixAt(i, _matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
}

export interface VoxelMeshProps {
  layout: VoxelLayout;
  visible: boolean;
  /** Staggered materialization (default). gfxLite passes false → instant. */
  animated?: boolean;
  /**
   * The focused voxel (voxel-focus V3): pulsing red marker at this cell,
   * every other voxel dimmed to 60%. null/undefined = no highlight. The
   * highlighted cell never participates in the stagger — it is fully
   * visible the moment it is mounted.
   */
  highlightCell?: { sectionIndex: number; cellIndex: number } | null;
  /**
   * Semantic material variant (voxel-body mode): graphite / bloat monolith /
   * dead-code glass. Defaults to graphite.
   */
  variant?: VoxelVariant;
  /**
   * Brightness multiplier composed from focus tier + view mode + filter
   * dimming (Building computes it). Swaps the shared material — no per-frame
   * cost, no opacity sorting issues. Defaults to 1 (full brightness).
   */
  dim?: number;
  /** Seed for the deterministic per-voxel brightness grain (voxelShade). */
  shadeSeed?: number;
}

export function VoxelMesh({
  layout,
  visible,
  animated = true,
  highlightCell = null,
  variant = "normal",
  dim = 1,
  shadeSeed = 0,
}: VoxelMeshProps) {
  const instances = useMemo(() => buildInstanceTransforms(layout), [layout]);
  const { code, comment } = useMemo(() => splitByKind(instances), [instances]);

  // Voxel-space position of the highlighted cell (relative to the building
  // base — the parent group applies the 0.3 body lift, same as the cells).
  const highlightPos = useMemo<[number, number, number] | null>(() => {
    if (!highlightCell) return null;
    const section = layout.sections[highlightCell.sectionIndex];
    if (!section || !section.detail) return null;
    const cell = section.cells[highlightCell.cellIndex];
    if (!cell) return null;
    const s = layout.voxelSize;
    return [section.base.x + cell.x * s, (cell.y + 0.5) * s, section.base.z + cell.z * s];
  }, [layout, highlightCell]);

  const codeRef = useRef<THREE.InstancedMesh>(null);
  const commentRef = useRef<THREE.InstancedMesh>(null);
  const highlightRef = useRef<THREE.InstancedMesh>(null);
  const codeCursorRef = useRef(0);
  const commentCursorRef = useRef(0);
  const progressRef = useRef(0);
  const doneRef = useRef(false);

  const geometry = getVoxelGeometry(layout.voxelSize);
  const highlightGeometry = getHighlightGeometry(layout.voxelSize);

  // (Re)initialize on mount / mode change: collapsed for the stagger, or
  // fully materialized for the gfxLite path. The brightness grain goes on
  // top as instanceColor — independent of the reveal, so it is written once
  // here, never per frame.
  useLayoutEffect(() => {
    if (!visible) return;
    const startScale = animated ? MIN_SCALE : 1;
    const codeMesh = codeRef.current;
    if (codeMesh) {
      codeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      writeAll(codeMesh, code, startScale);
    }
    const commentMesh = commentRef.current;
    if (commentMesh) {
      commentMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      writeAll(commentMesh, comment, startScale);
    }
    if (shadeSeed !== 0) {
      const shade = (mesh: THREE.InstancedMesh | null, items: IndexedInstance[]) => {
        if (!mesh) return;
        for (let i = 0; i < items.length; i++) {
          _color.setScalar(voxelShade(items[i]!.gi, shadeSeed));
          mesh.setColorAt(i, _color);
        }
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      };
      shade(codeMesh, code);
      shade(commentMesh, comment);
    }
    codeCursorRef.current = 0;
    commentCursorRef.current = 0;
    progressRef.current = 0;
    doneRef.current = !animated;
  }, [visible, animated, code, comment, shadeSeed]);

  useEffect(() => {
    return () => {
      codeCursorRef.current = 0;
      commentCursorRef.current = 0;
      progressRef.current = 0;
      doneRef.current = false;
    };
  }, []);

  // Place the highlight voxel once per target change (scale 1 — the pulse
  // in useFrame only modulates scale/emissive from this baseline).
  useLayoutEffect(() => {
    const mesh = highlightRef.current;
    if (!mesh || !highlightPos) return;
    _matrix.makeScale(1, 1, 1);
    _matrix.setPosition(highlightPos[0], highlightPos[1], highlightPos[2]);
    mesh.setMatrixAt(0, _matrix);
    mesh.instanceMatrix.needsUpdate = true;
  }, [highlightPos]);

  useFrame(({ clock }, delta) => {
    // Highlight pulse: scale 1.0→1.12, emissive 1.0→1.8, sin(t·6). Runs even
    // during the stagger reveal — the focus voxel is never part of the
    // stagger. Reused scratch matrix — zero per-frame allocations.
    const mesh = highlightRef.current;
    if (mesh && highlightPos) {
      const t = clock.elapsedTime;
      const pulse = Math.sin(t * 6);
      const scale = 1.06 + 0.06 * pulse; // 1.0 → 1.12
      _matrix.makeScale(scale, scale, scale);
      _matrix.setPosition(highlightPos[0], highlightPos[1], highlightPos[2]);
      mesh.setMatrixAt(0, _matrix);
      mesh.instanceMatrix.needsUpdate = true;
      HIGHLIGHT_MATERIAL.emissiveIntensity = 1.4 + 0.4 * pulse; // 1.0 → 1.8
    }
    if (!visible || !animated || doneRef.current) return;
    const total = code.length + comment.length;
    const next = Math.min(1, progressRef.current + delta / REVEAL_SECONDS);
    progressRef.current = next;
    const eased = 1 - Math.pow(1 - next, 3);
    const reveal = eased * total;
    writeRevealWindow(codeRef.current, code, codeCursorRef, reveal);
    writeRevealWindow(commentRef.current, comment, commentCursorRef, reveal);
    if (next >= 1) doneRef.current = true;
  });

  if (!visible) return null;
  if (code.length + comment.length === 0) return null; // slab-only layout

  // Shared cached materials: variant (semantic state) × dim (focus tier +
  // view mode + filter, composed by the caller). While a cell is highlighted
  // the rest of the building drops to 60% of its dim factor — still a pure
  // material swap, zero extra draw calls.
  const effDim = highlightPos ? dim * 0.6 : dim;
  const codeMat = getVoxelMaterial("code", variant, effDim);
  const commentMat = getVoxelMaterial("comment", variant, effDim);

  return (
    <group>
      {code.length > 0 && (
        <instancedMesh
          ref={codeRef}
          args={[undefined, undefined, code.length]}
          geometry={geometry}
          material={codeMat}
          // The voxel stage is display-only — never intercept city picking
          raycast={() => null}
          frustumCulled={false}
        />
      )}
      {comment.length > 0 && (
        <instancedMesh
          ref={commentRef}
          args={[undefined, undefined, comment.length]}
          geometry={geometry}
          material={commentMat}
          raycast={() => null}
          frustumCulled={false}
        />
      )}
      {highlightPos && (
        <instancedMesh
          ref={highlightRef}
          args={[undefined, undefined, 1]}
          geometry={highlightGeometry}
          material={HIGHLIGHT_MATERIAL}
          raycast={() => null}
          frustumCulled={false}
        />
      )}
    </group>
  );
}
