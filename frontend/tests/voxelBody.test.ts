// @vitest-environment jsdom
// Voxel-body mode ("the blocks ARE the house", Minecraft-style): pure helpers
// live next to the R3F component (single ownership file), jsdom keeps the
// fiber-stack import happy — same pattern as voxelMesh.test.ts.

import { describe, it, expect } from "vitest";
import {
  slabSegments,
  voxelShade,
  getVoxelMaterial,
  type VoxelVariant,
} from "../src/components/VoxelMesh";
import {
  VOXEL_SIZE,
  generateVoxelLayout,
  type VoxelCell,
  type VoxelLayout,
  type VoxelSectionLayout,
} from "../src/city/voxels";
import type { CityFile } from "../src/city/types";

function cell(x: number, y: number, z: number, kind: VoxelCell["kind"] = "code"): VoxelCell {
  return { x, y, z, kind };
}

function section(partial: Partial<VoxelSectionLayout> & { name: string }): VoxelSectionLayout {
  return {
    kind: "function",
    startLine: 1,
    endLine: 10,
    base: { x: 0, z: 0 },
    detail: true,
    cells: [],
    codeLines: 10,
    depth: 0,
    ...partial,
  };
}

function layout(sections: VoxelSectionLayout[], overrides: Partial<VoxelLayout> = {}): VoxelLayout {
  return {
    footprintW: 6,
    footprintD: 6,
    height: 3.3,
    voxelSize: VOXEL_SIZE,
    sections,
    totalVoxels: sections.reduce((n, s) => n + s.cells.length, 0),
    ...overrides,
  };
}

function file(lines: number): CityFile {
  return {
    id: `f${lines}`,
    path: `src/f${lines}.ts`,
    name: `f${lines}.ts`,
    language: "typescript",
    lines: { code: lines, comment: 0 },
    bytes: lines * 30,
    threatLevel: "low",
    findings: [],
  } as unknown as CityFile;
}

// ── slabSegments ─────────────────────────────────────────────────────────────

describe("slabSegments", () => {
  it("returns nothing for an all-detail layout — the cells carry the mass", () => {
    const det = section({
      name: "a",
      detail: true,
      cells: [cell(0, 0, 0), cell(1, 1, 0)],
      codeLines: 2,
    });
    expect(slabSegments(layout([det]))).toEqual([]);
  });

  it("describes a slab-only layout as one full-height segment (Building picks the legacy silhouette instead)", () => {
    const slab = section({ name: "a", detail: false, cells: [], codeLines: 12 });
    const segs = slabSegments(layout([slab], { height: 12 * VOXEL_SIZE }));
    expect(segs).toHaveLength(1);
    expect(segs[0]!.y0).toBe(0);
    expect(segs[0]!.y1).toBeCloseTo(12 * VOXEL_SIZE, 5);
  });

  it("bridges slab sections between voxel stacks at the running height", () => {
    const det = section({
      name: "a",
      detail: true,
      cells: [cell(0, 0, 0), cell(0, 1, 0)],
      codeLines: 2,
    });
    const slab = section({ name: "b", detail: false, cells: [], codeLines: 5 });
    const segs = slabSegments(layout([det, slab], { height: 10 }));
    expect(segs).toHaveLength(1);
    // detail top = 2 rows × VOXEL_SIZE; slab spans the next 5 code lines
    expect(segs[0]!.y0).toBeCloseTo(2 * VOXEL_SIZE, 5);
    expect(segs[0]!.y1).toBeCloseTo(7 * VOXEL_SIZE, 5);
  });

  it("clamps slab segments to layout.height", () => {
    const det = section({
      name: "a",
      detail: true,
      cells: [cell(0, 0, 0)],
      codeLines: 1,
    });
    const slab = section({ name: "b", detail: false, cells: [], codeLines: 500 });
    const segs = slabSegments(layout([det, slab], { height: 2 }));
    expect(segs).toHaveLength(1);
    expect(segs[0]!.y1).toBeLessThanOrEqual(2);
  });

  it("skips zero-line slabs", () => {
    const det = section({ name: "a", detail: true, cells: [cell(0, 0, 0)], codeLines: 1 });
    const empty = section({ name: "b", detail: false, cells: [], codeLines: 0 });
    expect(slabSegments(layout([det, empty]))).toEqual([]);
  });

  it("works on a real generated layout without throwing", () => {
    const real = generateVoxelLayout(file(120));
    const segs = slabSegments(real);
    for (const seg of segs) {
      expect(seg.y1).toBeGreaterThan(seg.y0);
      expect(seg.y1).toBeLessThanOrEqual(real.height + 1e-9);
    }
  });
});

// ── voxelShade ───────────────────────────────────────────────────────────────

describe("voxelShade", () => {
  it("is deterministic — same index+seed, same shade", () => {
    expect(voxelShade(42, 7)).toBe(voxelShade(42, 7));
  });

  it("stays inside the grain band [0.88, 1.12] across a wide sweep", () => {
    for (let i = 0; i < 5000; i++) {
      const s = voxelShade(i, i % 97);
      expect(s).toBeGreaterThanOrEqual(0.88);
      expect(s).toBeLessThanOrEqual(1.12);
    }
  });

  it("varies between neighbouring voxels (visible block grain)", () => {
    let differing = 0;
    for (let i = 1; i < 100; i++) {
      if (voxelShade(i, 3) !== voxelShade(i - 1, 3)) differing++;
    }
    expect(differing).toBeGreaterThan(90);
  });
});

// ── getVoxelMaterial cache ───────────────────────────────────────────────────

describe("getVoxelMaterial", () => {
  it("returns the SAME shared instance for the same variant+dim key", () => {
    const a = getVoxelMaterial("code", "normal", 1);
    const b = getVoxelMaterial("code", "normal", 1);
    expect(a).toBe(b);
  });

  it("splits by kind, variant and dim", () => {
    const code = getVoxelMaterial("code", "normal", 1);
    const comment = getVoxelMaterial("comment", "normal", 1);
    expect(code).not.toBe(comment);
    expect(code.transparent).toBe(false);
    expect(comment.transparent).toBe(true);

    const dimmed = getVoxelMaterial("code", "normal", 0.3);
    expect(dimmed).not.toBe(code);
    expect(dimmed.color.getHex()).not.toBe(code.color.getHex());
  });

  it("glass variant is translucent, monolith near-black", () => {
    const glass = getVoxelMaterial("code", "glass", 1);
    expect(glass.transparent).toBe(true);
    const mono = getVoxelMaterial("code", "monolith", 1);
    const normal = getVoxelMaterial("code", "normal", 1);
    expect(mono.color.getHex()).not.toBe(normal.color.getHex());
  });

  it("covers every variant × kind × dim combination without explosion", () => {
    const variants: VoxelVariant[] = ["normal", "monolith", "glass"];
    for (const v of variants) {
      for (const kind of ["code", "comment"] as const) {
        for (const dim of [1, 0.65, 0.45, 0.35, 0.3, 0.15, 0.12]) {
          expect(getVoxelMaterial(kind, v, dim)).toBeInstanceOf(Object);
        }
      }
    }
  });
});
